# 单机部署手册

## 目标拓扑

- Nginx：公开监听 80/443。
- Web：PM2 进程 `blog-web`，监听 `127.0.0.1:3001`。
- API：PM2 进程 `blog-api`，监听 `127.0.0.1:3002`。
- SQLite 与上传媒体：服务器持久磁盘。

## 初次部署

```bash
git clone https://github.com/5335737347/blog.git
cd blog
cp .env.example .env
```

填写 `.env` 中的 `JWT_SECRET`、`SITE_URL`、`NEXT_PUBLIC_SITE_URL`、`ADMIN_PASSWORD` 以及需要启用的邮件或短信配置，然后执行：

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

## 备份与恢复范围

必须备份：

- SQLite 数据库文件。
- `MEDIA_ROOT` 中的上传图片和音乐。
- 生产环境变量或密钥管理系统中的配置。

`scripts/update.mjs` 只自动备份 SQLite，不自动备份媒体和环境变量。

## 发布后检查

```text
[ ] API /health 返回 200
[ ] 首页、文章、注册和后台登录可访问
[ ] /api/music 等同域代理返回 200
[ ] 管理页面未登录会跳转登录页
[ ] 邮件/短信注册方式与实际配置一致
[ ] 图片和音乐上传大小符合 Nginx 与 Fastify 双方限制
[ ] 浏览器控制台没有 hydration 或网络错误
```
