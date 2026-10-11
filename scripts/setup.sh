#!/usr/bin/env bash
# Interactive, repeatable VPS setup. No package installation, service deletion or secret logging.
set -Eeuo pipefail
set +x
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ROOT}/.env.commercial"
# shellcheck source=setup-lib.sh
source "${SCRIPT_DIR}/setup-lib.sh"

usage() {
  cat <<'HELP'
DeAIfy VPS 配置向导
  bash scripts/setup.sh                   交互式配置 + Docker 部署
  bash scripts/setup.sh --configure-only  只生成配置与反代片段，不启动容器
  bash scripts/setup.sh --check           检查当前配置、Compose 与运行状态
  bash scripts/setup.sh --help            显示帮助

首次安装会自动生成加密密钥；重复运行保留已有密钥、数据卷和数据库。
管理员、MySQL、SMTP、商户密码不会打印到终端。
HELP
}

configure_origins() {
  local origin
  log '1/5 · 网站与 API 地址'
  ask '前端 HTTPS 域名' "${CFG[FRONTEND_ORIGIN]:-https://deaify-iota.vercel.app}"
  validate_origin "$REPLY" '前端 HTTPS 域名'; CFG[FRONTEND_ORIGIN]="$REPLY"
  ask 'API HTTPS 域名（需在宝塔/1Panel/Nginx 配反向代理）' "${CFG[API_PUBLIC_ORIGIN]-}"
  validate_origin "$REPLY" 'API HTTPS 域名'; CFG[API_PUBLIC_ORIGIN]="$REPLY"
  ask 'VPS 本机 API 端口（仅绑定 127.0.0.1）' "${CFG[API_BIND_PORT]:-18088}"
  validate_port "$REPLY" 'API 端口'
  (( 10#$REPLY >= 1024 )) || error '避免使用低于 1024 的特权端口。'
  CFG[API_BIND_PORT]="$REPLY"
  keep_default FREE_USES_PER_DAY '5'
  # A Docker gateway address must only be trusted after its exact CIDR is known.
  keep_default TRUSTED_PROXY_CIDRS ''
}

configure_database() {
  local default_mode choice ca_file
  log '2/5 · MySQL 数据库'
  default_mode=1
  [[ "${CFG[MYSQL_MODE]-}" == external ]] && default_mode=2
  ask '数据库方式：1=自动创建 MySQL 8.4，2=连接已有 MySQL' "$default_mode"
  choice="$REPLY"
  case "$choice" in 1) CFG[MYSQL_MODE]=bundled;; 2) CFG[MYSQL_MODE]=external;;
    *) error '数据库方式请选择 1 或 2。';; esac
  if [[ -n "${ORIGINAL_DB_MODE:-}" && "$ORIGINAL_DB_MODE" != "${CFG[MYSQL_MODE]}" ]]; then
    # Switching endpoints while retaining the old database volume can strand
    # existing credentials or make user/order data appear to vanish.
    error "当前实例已经使用 $ORIGINAL_DB_MODE。请先完成数据迁移与备份，再在新的部署目录配置 ${CFG[MYSQL_MODE]}；不能直接覆盖现有数据库模式。"
  fi
  ask 'MySQL 数据库名（已有 MySQL 需提前创建专用数据库）' "${CFG[MYSQL_DATABASE]:-deaify}"
  validate_identifier "$REPLY" '数据库名'; CFG[MYSQL_DATABASE]="$REPLY"
  ask 'MySQL 用户名（已有 MySQL 需授予该数据库 CREATE/ALTER 权限）' "${CFG[MYSQL_USER]:-deaify}"
  validate_identifier "$REPLY" 'MySQL 用户名'; CFG[MYSQL_USER]="$REPLY"
  if [[ "${CFG[MYSQL_MODE]}" == bundled ]]; then
    CFG[MYSQL_HOST]='mysql'; CFG[MYSQL_PORT]='3306'; CFG[MYSQL_SSL_MODE]='disabled'; CFG[MYSQL_SSL_CA_B64]=''
    if [[ -z "${CFG[MYSQL_PASSWORD]-}" ]]; then CFG[MYSQL_PASSWORD]="$(random_hex)"; fi
    if [[ -z "${CFG[MYSQL_ROOT_PASSWORD]-}" ]]; then CFG[MYSQL_ROOT_PASSWORD]="$(random_hex)"; fi
    log '已自动生成内部 MySQL 强密码；不需要额外填写 MySQL 地址或 root 密码。'
  else
    ask '已有 MySQL 主机名或 IP（容器不能使用 127.0.0.1 指向 VPS 宿主）' "${CFG[MYSQL_HOST]:-host.docker.internal}"
    validate_host "$REPLY" 'MySQL 主机'
    [[ "$REPLY" != '127.0.0.1' && "$REPLY" != 'localhost' ]] || error 'Docker 里的 localhost 是容器本身，请使用 host.docker.internal 或容器可访问的地址。'
    CFG[MYSQL_HOST]="$REPLY"
    ask '已有 MySQL 端口' "${CFG[MYSQL_PORT]:-3306}"
    validate_port "$REPLY" 'MySQL 端口'; CFG[MYSQL_PORT]="$REPLY"
    ask_secret 'MySQL 密码' "$([[ -n "${CFG[MYSQL_PASSWORD]-}" ]] && echo true || echo false)"
    if [[ -n "$REPLY" ]]; then CFG[MYSQL_PASSWORD]="$REPLY"; fi
    require_value "${CFG[MYSQL_PASSWORD]-}" 'MySQL 密码'
    ask 'MySQL TLS：1=验证服务器证书（推荐远程），2=禁用（仅受信任的本机网络）' "$([[ "${CFG[MYSQL_SSL_MODE]-}" == disabled ]] && echo 2 || echo 1)"
    case "$REPLY" in
      1)
        CFG[MYSQL_SSL_MODE]='verify'
        if confirm 'MySQL 需要指定自己的 CA 证书文件吗？' N; then
          ask 'CA 证书 PEM 文件绝对路径'
          [[ -f "$REPLY" && -r "$REPLY" ]] || error 'CA 文件不可读。'
          ca_file="$REPLY"
          CFG[MYSQL_SSL_CA_B64]="$(base64 < "$ca_file" | tr -d '\r\n')"
        fi
        ;;
      2)
        warn 'MySQL 明文连接可能泄露账号、图片积分与订单数据。仅限同机或完全受信任的内部网络。'
        confirm '我确认只在受保护的内网使用明文 MySQL？' N || error '未确认风险；请选择 TLS。'
        CFG[MYSQL_SSL_MODE]='disabled'; CFG[MYSQL_SSL_CA_B64]=''
        ;;
      *) error 'MySQL TLS 请选择 1 或 2。';;
    esac
    keep_default MYSQL_ROOT_PASSWORD ''
  fi
}

configure_security() {
  log '3/5 · 加密、注册与邮件验证'
  keep_default RESULT_ENCRYPTION_KEY_HEX "$(random_hex)"
  keep_default PROCESSOR_SHARED_TOKEN "$(random_hex)"
  keep_default OTP_SECRET "$(random_hex)"
  keep_default SMTP_PORT '465'
  keep_default REGISTRATION_ENABLED 'false'
  keep_default RECOVERY_ENABLED 'false'
  if confirm '现在配置 SMTP 邮件与 Cloudflare Turnstile 吗？' N; then
    ask 'SMTP 主机' "${CFG[SMTP_HOST]-}"
    validate_host "$REPLY" 'SMTP 主机'; CFG[SMTP_HOST]="$REPLY"
    ask 'SMTP 端口（465 SSL，587 STARTTLS）' "${CFG[SMTP_PORT]:-465}"
    validate_port "$REPLY" 'SMTP 端口'; CFG[SMTP_PORT]="$REPLY"
    ask 'SMTP 账号' "${CFG[SMTP_USER]-}"
    require_value "$REPLY" 'SMTP 账号'; CFG[SMTP_USER]="$REPLY"
    ask_secret 'SMTP 密码/授权码' "$([[ -n "${CFG[SMTP_PASSWORD]-}" ]] && echo true || echo false)"
    if [[ -n "$REPLY" ]]; then CFG[SMTP_PASSWORD]="$REPLY"; fi
    require_value "${CFG[SMTP_PASSWORD]-}" 'SMTP 密码'
    ask '邮件发件人地址' "${CFG[SMTP_FROM]:-${CFG[SMTP_USER]}}"
    CFG[SMTP_FROM]="$REPLY"
    ask 'Turnstile Site Key（公开，需同步配置到 Vercel）' "${CFG[TURNSTILE_SITE_KEY]-}"
    require_value "$REPLY" 'Turnstile Site Key'; CFG[TURNSTILE_SITE_KEY]="$REPLY"
    ask_secret 'Turnstile Secret Key' "$([[ -n "${CFG[TURNSTILE_SECRET]-}" ]] && echo true || echo false)"
    if [[ -n "$REPLY" ]]; then CFG[TURNSTILE_SECRET]="$REPLY"; fi
    require_value "${CFG[TURNSTILE_SECRET]-}" 'Turnstile Secret Key'
  fi
  if [[ -n "${CFG[SMTP_HOST]-}" && -n "${CFG[SMTP_PASSWORD]-}" && -n "${CFG[TURNSTILE_SECRET]-}" && -n "${CFG[TURNSTILE_SITE_KEY]-}" ]]; then
    if confirm '启用邮箱注册？（请确认 Vercel 已配置 VITE_TURNSTILE_SITE_KEY）' N; then
      CFG[REGISTRATION_ENABLED]='true'
    fi
    if confirm '启用找回密码？（旧数据库将自动应用增量迁移）' N; then
      CFG[RECOVERY_ENABLED]='true'
    fi
  fi
}

configure_payment() {
  log '4/5 · 虎皮椒支付配置（可跳过）'
  keep_default XUNHU_GATEWAY 'https://api.xunhupay.com'
  keep_default PAYMENTS_ENABLED 'false'
  keep_default MERCHANT_APPROVED 'false'
  if [[ "${CFG[PAYMENTS_ENABLED]}" == true ]]; then
    warn '检测到已有正式支付启用状态；不会在重配过程中擅自关闭或重新开启。'
    confirm '确定要维护正在提供真实收款的环境？' N || error '已取消维护，避免影响收款。'
  fi
  if confirm '录入或更新虎皮椒商户 APPID 与 Secret？' N; then
    ask '虎皮椒 APPID' "${CFG[XUNHU_APPID]-}"
    require_value "$REPLY" '虎皮椒 APPID'; CFG[XUNHU_APPID]="$REPLY"
    ask_secret '虎皮椒 APPSECRET' "$([[ -n "${CFG[XUNHU_SECRET]-}" ]] && echo true || echo false)"
    if [[ -n "$REPLY" ]]; then CFG[XUNHU_SECRET]="$REPLY"; fi
    require_value "${CFG[XUNHU_SECRET]-}" '虎皮椒 APPSECRET'
    warn '商户密钥已保存，但不会仅凭录入密钥启用真实支付。请先完成商户审核、签名回调和退款验证。'
  fi
  [[ "${CFG[PAYMENTS_ENABLED]}" == true ]] || CFG[PAYMENTS_ENABLED]='false'
}

write_nginx_snippet() {
  local file="${ROOT}/deploy/nginx-location.conf"
  mkdir -p "${ROOT}/deploy"
  cat > "$file" <<EOFNGINX
# Place inside the HTTPS server block for ${CFG[API_PUBLIC_ORIGIN]}.
# TLS certificates/443 are managed in your existing BT/1Panel/Nginx website.
client_max_body_size 26m;
location / {
    proxy_pass http://127.0.0.1:${CFG[API_BIND_PORT]};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    # Overwrite untrusted client values before allowing any trusted proxy CIDR.
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_connect_timeout 15s;
    proxy_read_timeout 65s;
}
EOFNGINX
  chmod 600 "$file"
}

validate_config() {
  local key
  for key in FRONTEND_ORIGIN API_PUBLIC_ORIGIN MYSQL_DATABASE MYSQL_HOST MYSQL_PORT MYSQL_USER MYSQL_PASSWORD; do
    require_value "${CFG[$key]-}" "$key"
  done
  validate_origin "${CFG[FRONTEND_ORIGIN]}" FRONTEND_ORIGIN
  validate_origin "${CFG[API_PUBLIC_ORIGIN]}" API_PUBLIC_ORIGIN
  [[ "${CFG[MYSQL_MODE]}" == bundled || "${CFG[MYSQL_MODE]}" == external ]] || error 'MYSQL_MODE 无效。'
  [[ "${CFG[MYSQL_SSL_MODE]}" == verify || "${CFG[MYSQL_SSL_MODE]}" == disabled ]] || error 'MYSQL_SSL_MODE 无效。'
  [[ "${CFG[RESULT_ENCRYPTION_KEY_HEX]}" =~ ^[a-f0-9]{64}$ ]] || error '加密密钥长度不正确。'
  [[ ${#CFG[PROCESSOR_SHARED_TOKEN]} -ge 32 ]] || error '处理容器密钥长度不足。'
}

configure() {
  configure_origins
  configure_database
  configure_security
  configure_payment
  log '5/5 · 确认即将写入配置'
  validate_config
  printf '\n  前端: %s\n  API: %s\n  MySQL: %s (%s:%s)\n  API 本机端口: %s\n  注册: %s\n  找回密码: %s\n  真实支付: %s\n\n' \
    "${CFG[FRONTEND_ORIGIN]}" "${CFG[API_PUBLIC_ORIGIN]}" "${CFG[MYSQL_MODE]}" "${CFG[MYSQL_HOST]}" \
    "${CFG[MYSQL_PORT]}" "${CFG[API_BIND_PORT]}" "${CFG[REGISTRATION_ENABLED]}" \
    "${CFG[RECOVERY_ENABLED]}" "${CFG[PAYMENTS_ENABLED]}" >&2
  confirm '保存配置并继续？' Y || error '已取消；原配置未发生更改。'
  save_env
  write_nginx_snippet
  log '配置写入成功（权限 600）；已有配置已安全备份。'
  log "Nginx HTTPS 反代配置片段：${ROOT}/deploy/nginx-location.conf"
  log "在 Vercel 生产环境设置 VITE_COMMERCIAL_API_URL=${CFG[API_PUBLIC_ORIGIN]}"
  if [[ -n "${CFG[TURNSTILE_SITE_KEY]-}" ]]; then
    log "在 Vercel 生产环境设置 VITE_TURNSTILE_SITE_KEY=${CFG[TURNSTILE_SITE_KEY]}（仅公钥）"
  fi
}

bootstrap_admin() {
  local email pass repeat
  confirm '需要创建一个新的后台管理员账号吗？（已有账号请选 n）' "$([[ "${FIRST_INSTALL:-false}" == true ]] && echo Y || echo N)" || return 0
  ask '管理员邮箱'; email="$REPLY"
  [[ "$email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || error '管理员邮箱格式不正确。'
  ask_secret '管理员强密码（至少 16 位）'; pass="$REPLY"
  [[ ${#pass} -ge 16 && ${#pass} -le 128 ]] || error '管理员密码长度必须在 16–128 位之间。'
  ask_secret '请再次输入管理员密码'; repeat="$REPLY"
  [[ "$pass" == "$repeat" ]] || error '两次密码不一致。'
  # Export only for this short-lived process. Never put admin password in .env or argv.
  ( export BOOTSTRAP_ADMIN_EMAIL="$email" BOOTSTRAP_ADMIN_PASSWORD="$pass"
    compose run --rm --no-deps -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_PASSWORD api node dist/scripts/bootstrapAdmin.js )
  pass='' repeat=''
}

deploy() {
  check_tools
  log '检查 Compose 配置与 Docker 环境……'
  compose config --quiet || error 'Compose 验证失败。请检查上面报错。'
  log '构建 API 与图片隔离处理容器……'
  compose build api processor
  if [[ "${CFG[MYSQL_MODE]}" == bundled ]]; then
    log '启动自带 MySQL（持久卷不会清空）……'
    compose --profile bundled up -d --wait mysql
  fi
  log '检查 MySQL 连接并初始化/升级缺失表结构（不会删除已有数据）……'
  compose run --rm --no-deps api node dist/scripts/initDb.js || error '数据库连接或初始化失败，未启动 API。请核对账号、网络、TLS 与 CREATE/ALTER 权限。'
  log '启动 API 与图片处理容器……'
  compose up -d api processor
  local i good=false
  for ((i=1;i<=30;i++)); do
    if curl -fsS --max-time 2 "http://127.0.0.1:${CFG[API_BIND_PORT]}/health" >/dev/null 2>&1; then
      good=true; break
    fi
    sleep 2
  done
  if [[ "$good" != true ]]; then
    compose ps >&2 || true
    error 'API 未通过本机健康检查。请运行 docker compose --env-file .env.commercial -f docker-compose.commercial.yml logs --tail=80 api。'
  fi
  log 'API 本机健康检查通过。'
  bootstrap_admin
  log 'Docker 部署成功。请在现有面板为 API 域名配置 HTTPS 反向代理，并将 Vercel 前端 API 环境变量同步后重新部署前端。'
  warn '商户收款默认关闭。服务器健康不等于邮件、支付和公网 HTTPS 已验收。'
}

main() {
  [[ -f "$ROOT/docker-compose.commercial.yml" ]] || error '必须在 DeAIfy 仓库内运行脚本。'
  if [[ "${1:-}" == "" ]]; then check_tools; fi
  FIRST_INSTALL=true
  [[ -f "$ENV_FILE" ]] && FIRST_INSTALL=false
  load_env
  ORIGINAL_DB_MODE="${CFG[MYSQL_MODE]-}"
  case "${1:-}" in
    --help|-h) usage;;
    --check) show_status;;
    --configure-only|'')
      [[ -t 0 ]] || warn '正在使用非交互输入（自动化测试/管道）。请勿在命令行参数中填写密钥。'
      configure
      if [[ "${1:-}" != --configure-only ]]; then deploy; fi
      ;;
    *) usage; error '不支持的选项。';;
  esac
}
main "$@"
