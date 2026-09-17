# 单机部署手册

## 目标拓扑

- Nginx：公开监听 80/443。
- Web：PM2 进程 `blog-web`，监听 `127.0.0.1:3001`。
- API：PM2 进程 `blog-api`，监听 `127.0.0.1:3002`。
- SQLite 与上传媒体：服务器持久磁盘。

这是当前正式支持的双进程拓扑。已批准但尚未实施的下一阶段会增加仅监听
`127.0.0.1:3003` 的 `blog-admin`；在代码迁移、PM2 配置和服务器验收全部完成前，
不要提前关闭当前 Web 中的管理路由，也不要按未来端口修改生产配置。

## 计划中的私有管理通道

未来 Admin 应用不会通过 Nginx 或防火墙公开。受信任设备使用专用 Ed25519 SSH
身份建立到 `127.0.0.1:3003` 的本地转发，再访问本机转发端口。该 SSH 身份必须：

- 禁止密码认证、交互式 Shell、PTY、Agent/X11 转发和远程端口转发。
- 仅允许本地转发到 `127.0.0.1:3003`，不能访问 API 或其他服务器端口。
- 使用与日常运维 SSH 分离的公钥，并准备一把独立恢复公钥。
- 私钥使用强口令并保存在加密可移动介质；普通 exFAT/FAT 权限位不视为保护。

私钥不得上传服务器、写入 `.env`、放入网页文件选择器或进入 Git。跨设备和手机管理
仍须使用同一受限 SSH 通道，不得通过临时开放 3003 换取便利。具体迁移步骤见
[后续维护计划](next-plan.md)，目标边界见[总体架构](architecture.md)。

## 初次部署

```bash
git clone https://github.com/5335737347/blog.git
cd blog
cp .env.example .env
```

填写 `.env` 中的 `JWT_SECRET`、`SITE_URL`、`NEXT_PUBLIC_SITE_URL` 和
`ADMIN_PASSWORD`。`JWT_SECRET` 用 `openssl rand -hex 32` 生成：它一旦是占位符或低熵值，
API 会拒绝启动（这是刻意的 fail-fast，别用改词的占位符绕过）。
只有已经完成代码接入与真实验收的注册渠道才填写邮件或防刷配置；
未完成的渠道保持为空。注册服务状态和验收要求见
[注册验证、消息投递与防刷](registration-delivery.md)。然后执行：

```bash
npm ci --include=dev
npm run db:generate
npx prisma migrate deploy
npm run db:seed
npm run build
npm run start:pm2
pm2 save
```

检查进程：

```bash
pm2 status
curl --fail http://127.0.0.1:3002/health
curl --fail http://127.0.0.1:3001/
```

## Nginx

```nginx
server {
    listen 80;
    server_name example.com;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Nginx 不需要单独暴露 `/api`；请求进入 Web 后由 Next.js 同域转发。启用 HTTPS 后再按实际代理链评估 `TRUST_PROXY`，不能因为使用了 Nginx 就直接信任任意请求头。

`TRUST_PROXY=false` 时，API 使用直接 socket 对端地址作为限流身份，并忽略转发头。
生产环境如需按真实访客而不是本机 Web 代理区分限流，必须确认 Nginx 覆盖 `X-Real-IP`、
Next.js rewrite 将该头传给仅监听回环地址的 API，然后才设置：

```env
TRUST_PROXY="true"
TRUST_PROXY_HEADER="x-real-ip"
```

不能只写环境变量而不验证实际请求链。验证时应从两个不同客户端触发低风险测试请求，确认
API 得到不同的限流身份；如果代理链不能可靠覆盖该头，应保持 API 不公开且关闭代理信任，
不得信任客户端可以直接控制的转发头。

## 注册服务上线边界

- 服务商账号、域名和凭据“已准备”不代表应用“已部署”；以 API 适配器和服务器配置为准。
- 生产启动后检查 `/api/auth/registration-options`，它只能返回真实可投递且已验收的渠道。
- Resend HTTP API 接入完成前，不得把其 API Key 填入 SMTP 变量或开放邮件注册。
- 手机号验证码通道已移除，注册仅支持邮箱验证码。
- Turnstile 必须由 API 校验，并与现有 IP/目标限流共同启用；只渲染前端控件不算完成。
- 生产凭据不得写入 PM2 配置、Nginx 配置、仓库文件、命令历史或部署日志。

## 更新

```bash
npm run update
```

更新脚本依次执行：仓库与并发更新检查、`git pull --ff-only`、`npm ci`、
Prisma Client 生成、lint/typecheck/tests、SQLite 备份、migration、双应用构建、
PM2 `startOrReload`、`pm2 save`，最后轮询 API 与 Web 的本机健康端点。

同一工作区同时只能运行一个更新。脚本使用 `.git/kpblog-update.lock` 记录进程；
异常退出留下的锁会在确认原进程不存在后自动清理。任何步骤失败都会返回非零状态，
停止执行后续步骤，并始终释放更新锁。

可用选项：

```bash
npm run update -- --skip-backup
npm run update -- --skip-install
npm run update -- --skip-check
npm run update -- --skip-build
npm run update -- --skip-restart
npm run update -- --skip-health-check
npm run update -- --skip-pull
npm run update -- --allow-dirty
```

`--skip-restart` 同时跳过 PM2 保存和健康检查。`--skip-pull` 用于已经手动拉取到
目标提交后的恢复流程。`--allow-dirty` 只应用于已理解且愿意保留的服务器本地改动，
不会覆盖本地文件或解决 Git 冲突，不应成为默认更新方式。所有 `--skip-*` 参数都应
只用于明确的恢复或局部维护场景。

健康检查默认最多尝试 15 次，每次请求超时为 5 秒、失败间隔为 1 秒，验证
`API_INTERNAL_URL` 对应的 `/health` 和 `http://127.0.0.1:3001/`。如果检查失败，
使用 `pm2 status`、`pm2 logs` 检查进程，修复后重新执行更新；只有明确知道检查
条件不成立时才使用 `--skip-health-check`。

## 备份范围与当前恢复限制

必须备份：

- SQLite 数据库文件。
- `MEDIA_ROOT` 中的上传图片和音乐。
- 生产环境变量或密钥管理系统中的配置。

SSH 私钥不属于服务器备份范围。日常管理私钥和恢复私钥应分别离线保存；服务器只需
保留可撤销的公钥配置和 sshd 限制规则备份。任何异地备份包含 `.env` 时都必须加密。

`scripts/update.mjs` 通过 SQLite `VACUUM INTO` 创建事务一致的独立快照，并将文件权限设为
`0600`。它仍只自动备份 SQLite，不自动备份媒体和环境变量，也不替代加密异地备份和恢复演练。

手动或定时备份用：

```bash
npm run db:backup                  # 写入 backups/dev.db.<时间戳>.bak，权限 0600
npm run media:backup               # 写入 backups/media/<时间戳>/，保留最新 3 份
BACKUP_KEEP=30 npm run db:backup   # 保留最新 30 份（默认 10）
```

数据库和媒体分成两条命令，因为它们的变动频率和体积差一个数量级：数据库几 MB 且每次
发布都变，媒体几十上百 MB 但很少变。混在一起要么让高频备份变得昂贵，要么让媒体备份
频率过低。

`scripts/backup.mjs` 只负责编排（定位路径、加时间戳、按 `BACKUP_KEEP` / `MEDIA_BACKUP_KEEP`
清理旧文件），真正的一致性快照仍由 `apps/api/scripts/backup-sqlite.mjs` 的 `VACUUM INTO`
完成。在此之前该脚本没有任何调用方——等于线上没有备份，只能靠人肉执行，所以它必须能被
`npm run` 调到，才可能被写进 crontab：

```cron
# 每天 03:30 备份数据库；每周日 04:30 备份媒体
30 3 * * *   cd /srv/kpblog && /usr/bin/npm run db:backup    >> /var/log/kpblog-backup.log 2>&1
30 4 * * 0   cd /srv/kpblog && /usr/bin/npm run media:backup >> /var/log/kpblog-backup.log 2>&1
```

`backups/` 已在 `.gitignore` 中，且**默认保留在本机**：它防的是误删和迁移事故，
不防磁盘损坏或整机丢失。异地与加密备份仍需单独配置并演练恢复。

### 恢复

```bash
pm2 stop blog-api                                   # 必须先停：API 持有数据库连接和 WAL
npm run db:restore -- backups/dev.db.20260917-013914.bak          # 预览，不写入
npm run db:restore -- backups/dev.db.20260917-013914.bak --yes    # 执行
npm run media:restore -- backups/media/20260917-013832 --yes
pm2 start blog-api
```

不带 `--yes` 时只校验并打印预览，不会改动任何数据。执行覆盖前，脚本会：

1. 对候选文件跑 `PRAGMA integrity_check`，坏文件直接中止；
2. 把**当前**数据库另存为 `backups/dev.db.before-restore.<时间戳>.bak`——误恢复本身可以再恢复回来；
3. 覆盖后再校验一次，失败时提示用第 2 步的快照回滚。

媒体恢复是**合并**而不是替换：`MEDIA_ROOT` 默认指向 `apps/web/public`，那里同时放着
Next 的静态资源，整目录替换会连带删掉仓库自带的文件。合并的代价是**不会删除**快照生成
之后新增的文件。

`scripts/update.mjs` 通过 SQLite `VACUUM INTO` 创建事务一致的独立快照，并将文件权限设为
`0600`。它仍只自动备份 SQLite，不自动备份媒体和环境变量，也不替代加密异地备份和恢复演练。

当前仓库仍未提供自动加密异地备份。上面的恢复脚本已能在本机完成数据库与媒体的恢复，
但**尚未在隔离环境做过完整演练**，因此不要把本机快照描述为灾难恢复方案。正式恢复手册
还必须覆盖生产密钥、文件权限、PM2 进程、健康检查和回滚；该工作仍记录在
[后续维护计划](next-plan.md)。

## 发布后检查

```text
[ ] API /health 返回 200（它会真的查一次数据库；库不可用时返回 503 而非 200）
[ ] 首页、文章、注册和后台登录可访问
[ ] /api/music 等同域代理返回 200
[ ] 管理页面未登录会跳转登录页
[ ] npm run smtp:check 全链路通过（不是只看 registration-options 返回的 true）
[ ] 若开放注册，/api/auth/registration-options 与已部署、已验收的投递渠道一致
[ ] 若开放注册，验证码成功、失败、过期、限流和 Turnstile 服务端校验符合预期
[ ] 日志和错误响应不包含验证码、Token 或完整联系方式
[ ] 图片和音乐上传大小符合 Nginx 与 Fastify 双方限制
[ ] 浏览器控制台没有 hydration 或网络错误
```
