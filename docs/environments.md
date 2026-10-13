# DeAIfy 本地 / 生产环境配置

项目包含两个完全独立的环境。**真实密码、密钥和本地配置不提交 Git。**

| 环境 | 前端配置 | 后端配置 | Compose 配置 |
| --- | --- | --- | --- |
| Windows 本地 | .env.development.local | .env.commercial.local | docker-compose.commercial.yml + docker-compose.local.yml |
| VPS 生产 | Vercel Production 环境变量 | VPS 的 .env.commercial（安装器创建） | docker-compose.commercial.yml |

生产配置参考：config/production.backend.env.example 和 config/production.frontend.env.example。它们**只有占位符，不能直接上线**。

## Windows 本地

要求：Node.js 22.12+、Docker Desktop（Linux containers）和 Docker Compose V2。

在 PowerShell 中进入项目目录：

~~~powershell
cd E:\JAVA\github\DeAIfy
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\init-local-env.ps1
~~~

脚本会在第一次运行时生成独立随机数据库密码、AES 加密密钥、处理器共享 Token，以及本地前端 API 地址。

- 现有环境文件 **绝不覆盖**；重新执行不会改变正在使用的密钥。
- 本地 API 绑定 127.0.0.1:18088，前端使用 http://localhost:5173。
- 公开注册、密码找回和真实支付均默认关闭。
- Docker 项目名是 deaify-local，MySQL 数据卷与另一套环境隔离。

### 启动三个后端容器

在**同一个 PowerShell 会话**执行：

~~~powershell
$dc = @(
  "--env-file", ".env.commercial.local",
  "-f", "docker-compose.commercial.yml",
  "-f", "docker-compose.local.yml"
)

docker compose @dc --profile bundled config --quiet
docker compose @dc --profile bundled up -d --wait mysql
docker compose @dc build api processor
docker compose @dc run --rm --no-deps api node dist/scripts/initDb.js
docker compose @dc up -d api processor
docker compose @dc ps

# 返回 { "ok": true, "service": "deaify-api" }
Invoke-RestMethod http://127.0.0.1:18088/health
~~~

MySQL 数据库、用户表及 API Key 表将以非破坏方式初始化。不要执行 docker compose down -v，避免删除数据。

### 创建第一个管理员（可选）

注册默认关闭，第一次测试账户功能时可创建一个本地管理员。只在**首次创建**时执行，邮箱不能重复。

~~~powershell
$env:BOOTSTRAP_ADMIN_EMAIL = "admin@local.test"
$secure = Read-Host "管理员密码（至少16位）" -AsSecureString
$env:BOOTSTRAP_ADMIN_PASSWORD = ([System.Net.NetworkCredential]::new("", $secure)).Password
try {
  docker compose @dc run --rm --no-deps -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_PASSWORD api node dist/scripts/bootstrapAdmin.js
} finally {
  Remove-Item Env:\BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:\BOOTSTRAP_ADMIN_EMAIL -ErrorAction SilentlyContinue
  Remove-Variable secure -ErrorAction SilentlyContinue
}
~~~

### 启动本地前端

新开 PowerShell 窗口：

~~~powershell
cd E:\JAVA\github\DeAIfy
npm install
npm run dev -- --host localhost --port 5173 --strictPort
~~~

Vite 会自动读取 .env.development.local，无须手动设置 VITE_COMMERCIAL_API_URL。

- 工作台：http://localhost:5173
- Docs：http://localhost:5173/docs
- API 健康检查：http://127.0.0.1:18088/health

本地后台日志：docker compose @dc logs -f --tail=100。
停止容器：docker compose @dc down（保留数据库卷）。

## VPS 正式生产

**本地配置只用于测试，不要复制 .env.commercial.local 到 VPS。**

目前外部 API 仍需真实 MySQL、额度扣减、密钥吊销、HTTPS 反向代理联调；完成验收并合并后再开放公网。

1. 在 VPS 上拉取已验收的发布版本，安装 Docker Engine、Compose V2 和 curl。
2. 参考 config/production.backend.env.example 核对所需字段，然后运行下面的安装向导：

~~~bash
cd DeAIfy
bash scripts/setup.sh
~~~

3. 向导填写 **HTTPS 前端 Origin、HTTPS API Origin、MySQL 模式**，分别生成生产专属的随机密码和加密密钥；保存为本机 .env.commercial，权限 600。不要把生产密钥或管理员密码放到 Git。
4. 按向导生成的 deploy/nginx-location.conf，在现有宝塔、1Panel 或 Nginx 站点添加 HTTPS 反代到 127.0.0.1:18088。不需要改动已有 443 监听。
5. 参考 config/production.frontend.env.example，在 Vercel **Production** 配置 VITE_COMMERCIAL_API_URL 为真正的 HTTPS API 地址，重新部署前端。只有启用邮箱注册时才需要额外配置公开的 VITE_TURNSTILE_SITE_KEY。
6. 查看服务状态：bash scripts/setup.sh --check。确认真实 API、下载鉴权、数据库备份、额度退款等功能正确后才允许上线。

默认 PAYMENTS_ENABLED=false、MERCHANT_APPROVED=false。正式收款必须在商户审批、回调与退款测试完成后再单独启用。

**已有生产数据库升级：** 先备份，再核对 server/sql/migrations/004-external-api-keys.sql 是否已应用。向导初始化只补建缺失结构，不应删除数据或重新生成已投入使用的密钥。

完整 VPS 操作见 [商业化部署手册](commercial-deployment.md) 和 [HTTP API 接入文档](external-http-api.md)。
