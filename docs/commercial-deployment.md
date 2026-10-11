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

## 启动

- 复制 .env.commercial.example 为 .env.commercial（此文件在 .gitignore 中，绝不能提交）。
- 使用 openssl rand -hex 32 分别生成 RESULT_ENCRYPTION_KEY_HEX、PROCESSOR_SHARED_TOKEN（至少 32 个字符）和 OTP_SECRET。三项不可复用。
- 设置 MYSQL_ROOT_PASSWORD、MYSQL_PASSWORD、FRONTEND_ORIGIN、API_PUBLIC_ORIGIN，以及实际 MySQL 配置。
- 初期保持 REGISTRATION_ENABLED=false、RECOVERY_ENABLED=false、PAYMENTS_ENABLED=false、MERCHANT_APPROVED=false。
- 执行 docker compose --env-file .env.commercial -f docker-compose.commercial.yml up -d --build。
- 检查 docker compose -f docker-compose.commercial.yml ps 与日志，再请求本机 127.0.0.1:18088/health。
- 管理员初始化命令 npm run bootstrap:admin 必须在 api 容器中以一次性 BOOTSTRAP_ADMIN_EMAIL 和 BOOTSTRAP_ADMIN_PASSWORD 环境变量执行，密码不少于 16 位；请使用私密的凭据注入方式，执行后立即清理。
- MySQL schema.sql 只会在全新数据库卷第一次创建时自动运行；以后需要单独的、经审核的迁移操作，不要为重新建表删除生产卷。已经部署 v0.6.0 的数据库需先备份，再执行 server/sql/migrations/002-password-recovery.sql 和 003-email-code-attempts.sql（按顺序运行，每个迁移只执行一次）。

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

## 安全注意

前端使用短期 opaque Bearer 会话，保存在标签页 sessionStorage。它会受到 XSS 风险影响：坚持严格内容转义、CSP、安全依赖更新与 HTTPS。
聚合支付遵从虎皮椒 API 1.1 官方签名规则，MD5 是支付协议要求而非我们选择的新密码算法；配合 HTTPS、定时查账、签名比较与幂等落账。
账户密码使用 Argon2id；注册必须有邮件验证码、Turnstile 和限流。
密码找回使用独立 8 位邮件验证码，最多 5 次尝试，成功后撤销原账号全部登录会话。只有 SMTP、Turnstile 与长期 OTP_SECRET 完整配置且管理员明确设置 RECOVERY_ENABLED=true 后才能启用；旧数据库必须先应用 002 迁移。
生产上线前仍需要补充隐私政策、退款规则、消费者权益条款、支付接口实测和备份恢复演练。

官方文档：https://v3.xunhupay.com/doc/api/pay.html
