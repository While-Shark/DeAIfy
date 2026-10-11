# DeAIfy 商业化 VPS 部署（预发布）

本分支首次加入登录、每日 5 次免费额度、积分套餐折扣、虎皮椒支付签名以及隔离图片处理。
这是待商户审核与服务器验证的版本；不应直接把未测试的支付功能对公众开放。

## 组件

- Vercel Vue 前端。未配置 VITE_COMMERCIAL_API_URL 时保留现有本地版，无账号或收费入口。
- VPS Fastify API（默认宿主 127.0.0.1:18088，使用 Nginx/宝塔/1Panel 反向代理 HTTPS 域名）。
- MySQL 8.4，独立私有 Docker 网络，不对公网开放端口。
- 独立 Node+Sharp 图片处理容器，不包含商户密钥或数据库账号，read-only 文件系统、非 root、限制 CPU/内存/PID。
- AES-256-GCM 加密临时结果，按用户身份授权下载，30 分钟有效，约 45 分钟内清理。

## 前置条件

1. 一台至少 2 vCPU、4 GB 内存（或使用已有 MySQL 降低资源占用）的 VPS，已安装 Docker Compose。已有 Nginx 或面板监听 443 不需要改动。
2. 准备一个真正可用的 HTTPS API 子域名。反代 127.0.0.1:18088，设置 client_max_body_size 26m、proxy_read_timeout 65s，使用 proxy_set_header X-Forwarded-For $remote_addr 确保客户端不能伪造前置 IP；只在查明 Nginx 到 API 的 Docker 网关地址后，配置 TRUSTED_PROXY_CIDRS 为具体可信网段（建议 /32），不要设 0.0.0.0/0。未配置时会把反向代理当作访问者，IP 限流按代理 IP 计算，需在开放注册前完成此项。
3. 在虎皮椒后台完成签约，申请商户 APPID 和 SECRET 并确认积分、虚拟权益、退款与有效期符合协议。
4. 配置 SMTP 邮件服务与 Cloudflare Turnstile，才能开放公众注册。管理员账号需要独立初始化。
5. 在 Vercel 配置 VITE_COMMERCIAL_API_URL（完整 HTTPS API Origin）和 VITE_TURNSTILE_SITE_KEY（只有公钥可暴露到前端）。

## 一键交互式安装（推荐）

服务器已经安装 **Docker Engine + Docker Compose V2 + curl**，且提供至少 2 vCPU / 4 GB RAM；不需要先安装 Node.js 或 MySQL。

```bash
git clone https://github.com/While-Shark/DeAIfy.git
cd DeAIfy
bash scripts/setup.sh
```

第一次运行会逐步询问：

1. **前端和 API 的 HTTPS 域名**、VPS 本地 API 端口（默认 18088，仅绑定 127.0.0.1）。
2. **数据库模式**：选择 `1` 使用自动创建的 MySQL 8.4，或 `2` 使用已有 MySQL（主机、端口、数据库名、用户、密码）。对于外部 MySQL 默认推荐 **TLS 服务器证书验证**，支持提供自签 CA 文件；仅完全受信任的本机网络可显式确认不使用 TLS。
3. **可选邮箱注册**：SMTP、邮箱授权码、Cloudflare Turnstile Site Key/Secret。没有设置这些值时，公开注册与密码找回保持关闭。Site Key 需要放到 Vercel 端的 `VITE_TURNSTILE_SITE_KEY`。
4. **可选虎皮椒商户**：填写 APPID / APPSECRET；不因录入商户密钥自动启用正式收款。完成商户审核及支付/退款回调测试后再人工批准开放。
5. **确认保存**、生成安全随机密钥、构建镜像、校验 MySQL 连接、初始化缺失表结构、启动容器，最后可选择创建一个新管理员账号。

安装脚本不会执行 `docker compose down -v`、清空表、重置管理员、覆盖原 MySQL 数据卷，也不会直接修改 Nginx 的 443 配置。重新运行会保留加密密钥、MySQL/SMTP/商户凭据，同时保存一份仅自己可读的旧配置备份。输入敏感密码时不会回显。

**环境配置位置：** `.env.commercial`，文件权限为 `600`；不要提交到 Git 或分享给他人。Nginx 配置片段会自动生成到 `deploy/nginx-location.conf`，只需在宝塔/1Panel/Nginx 已启用 HTTPS 的站点内插入该片段（证书与 443 仍由原面板管理）。脚本不会自动为尚未创建的域名申请证书。

在 Vercel 添加公开配置 `VITE_COMMERCIAL_API_URL=https://api.example.com`，再重新部署前端。注意该环境变量是前端构建时注入的；**不要**把 `XUNHU_SECRET`、`MYSQL_PASSWORD` 或其他后端密钥设置为 `VITE_*`。

### 常用命令

```bash
# 只生成环境文件与反代片段，不启动 Docker（可提前准备配置）
bash scripts/setup.sh --configure-only

# 检查当前配置与容器运行状态（不显示密钥）
bash scripts/setup.sh --check

# 重新进入向导并部署配置变更（不清除数据库）
bash scripts/setup.sh
```

### 已有 MySQL 的注意事项

- 使用已有 MySQL 前，在该服务器创建 **专用的数据库与最小权限账号**。安装阶段需要创建/变更专用 schema 的 DDL 权限，运行期可以后续收紧权限；不要直接用 root 或共享业务库。
- 用户填写的 MySQL 主机必须是 **从 API 容器可连接的地址**。宿主机 MySQL 可使用 `host.docker.internal`（映射 Docker `host-gateway`），不要输入 `127.0.0.1`。
- 外网数据库必须验证 TLS 证书；使用自签 CA 时在向导中提供 PEM 文件。**不要为了图省事向公网明文开放 3306**。
- 新安装会执行幂等的 `server/sql/schema.sql`（只新建不存在的表并插入不存在的初始套餐）。旧版 `email_codes.attempts` 字段会按实际结构自动补齐，密码找回表也自动创建。**任何升级都先备份生产数据库，并在测试环境验证**。
- 切换内置/已有 MySQL 时，脚本会要求再次确认，但**不会自动迁移用户和订单数据**，也不会删除旧卷。需要先完成数据迁移才能切换到另一套库。
- 如果数据库不可用或初始化失败，脚本会阻止继续启动 API，并提示排查 MySQL 网络、密码、证书、DDL 权限。

### 费用与安全上线条件

向导默认 `PAYMENTS_ENABLED=false`、`MERCHANT_APPROVED=false`。即使填写虎皮椒 APPID/SECRET，也不能直接进行真实充值。注册和找回密码若缺少安全配置则默认关闭。

**生产收费之前**还需实际验证商户签约与积分业务合规、支付成功回调验签及重放、退款/冲正、邮箱验证码、安全反代、Vercel 前端跨域访问、数据库备份恢复。请不要因为安装脚本显示服务健康就直接对公众开通收款。

## 资金与次数

- 每个账号按北京时间零点刷新 5 次免费额度，重新登录不刷新；额度和积分在 MySQL 行锁事务内扣减。
- 上传图片后，服务端先预留免费额度或 1 积分。输出成功后结算；处理中失败或超时则反向冲正。
- 请求需带 Idempotency-Key，重复请求同一键复用已完成的 30 分钟内文件，不重复扣减。
- 订单金额以分为单位计算；套餐原价、折扣（discount_bps，9000 表示九折）、赠送积分、优惠有效期均可由管理员配置，订单保存金额及积分快照。
- 只有服务端完成官方虎皮椒 MD5 HASH 验签、APPID/订单金额和状态匹配，才会在单次事务中增加积分；同步付款跳转页面不能入账。
- 若商户回调长时间延迟或网络超时，不直接将订单判死；需要查账核对。
- 退款 CD 回调会收回相应积分，可能形成负数余额以防退款后继续使用超额积分。
- 正式 PAYMENTS_ENABLED=true 只允许在商户审核完成、APPID/SECRET 已设置且 MERCHANT_APPROVED=true 时启用。

## 图片安全

- API 接受单张 JPEG/PNG/WebP，最大 25 MB；签名魔数必须与声明 MIME 一致。
- Sharp/libvips 限制最大 3000 万像素，拒绝多帧和不认识的容器，不向客户端传递原始元数据；任何上传文件都不会被执行。
- 图像解码与像素处理发生在低权限隔离容器，不接触 MySQL 或支付凭据。
- 文件格式验证、隔离解码、重新编码和频率限制是多层保护，不能保证识别全部新漏洞。需持续更新镜像和库版本、定期备份数据库并进行漏洞扫描。
- VPS 保存的是加密的临时处理结果，不持久保留原图。旧浏览器版本里的既有本地图像算法无法被前端混淆重新变成私有资产。

## 运维与发布注意

- 默认 Vercel 部署没有开启商业化 API，前端仍然是原本的浏览器本地处理模式。先在隔离测试环境验证后端、数据库迁移、HTTPS 反代和邮件功能。
- **付费导出以服务器成功生成成品为计次点**：报告中的「重新检测」只分析同一份成品，绝不会再次生成收费任务。若用户关闭已完成的报告，仍可在约 30 分钟内通过账号的最近导出免费再次下载。
- 当支付、邮件或 API 网络异常时，前端不能代表支付机构确认付款；订单与余额以服务端已验签的账本状态为准。
- 管理后台概览是运营参考数据，不代替支付机构结算单及正式财务对账。

## 安全注意

前端使用短期 opaque Bearer 会话，保存在标签页 sessionStorage。它会受到 XSS 风险影响：坚持严格内容转义、CSP、安全依赖更新与 HTTPS。
聚合支付遵从虎皮椒 API 1.1 官方签名规则，MD5 是支付协议要求而非我们选择的新密码算法；配合 HTTPS、定时查账、签名比较与幂等落账。
账户密码使用 Argon2id；注册必须有邮件验证码、Turnstile 和限流。
密码找回使用独立 8 位邮件验证码，最多 5 次尝试，成功后撤销原账号全部登录会话。只有 SMTP、Turnstile 与长期 OTP_SECRET 完整配置且管理员明确设置 RECOVERY_ENABLED=true 后才能启用；旧数据库必须先应用 002 迁移。
生产上线前仍需要补充隐私政策、退款规则、消费者权益条款、支付接口实测和备份恢复演练。

官方文档：https://v3.xunhupay.com/doc/api/pay.html
