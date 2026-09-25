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

> `db:seed` 只用于**空库初始化**。数据库非空时脚本会拒绝执行；确认要清空重建时
> 才使用 `ALLOW_PRODUCTION_SEED=true npm run db:seed -- --reset`。生产环境必须
> 显式设置不低于 8 字符的 `ADMIN_PASSWORD`，否则 seed 会拒绝生成并打印临时密码。

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

应用层限流（按 IP / 按账号 / 按验证码目标）在 API 内实现，Nginx 不是替代品。但如果站点
遭遇真实洪水，反向代理层的粗粒度限速是最便宜的第一道闸门——它挡在 TLS 与 Next.js
之前，不消耗 Node 的 CPU。以下配置为可选加固（`limit_req_zone` 必须写在 `http {}` 里）：

```nginx
# http 上下文
limit_req_zone $binary_remote_addr zone=kpblog_auth:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=kpblog_api:10m rate=600r/m;

server {
    # 认证与验证码端点：更严的阈值交给 API 内的账号/目标维度限流兜底
    location /api/auth/ {
        limit_req zone=kpblog_auth burst=10 nodelay;
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        limit_req zone=kpblog_api burst=120 nodelay;
        proxy_pass http://127.0.0.1:3001;
        # 其余 proxy_set_header 与上面的基本配置一致
    }
}
```

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

## SQLite 运行模式与进程数约束

API 在 `listen()` 之前会把数据库切到 WAL 并固定连接级参数（`apps/api/src/lib/prisma.ts`
的 `configureDatabaseRuntime`），启动日志里会打印实际生效的值：

```text
"SQLite 运行模式" journalMode=wal synchronous=1 busyTimeoutMs=10000
```

- `journal_mode` 持久化在数据库文件里（第一个连接设置后长期有效）；`synchronous` 与
  `busy_timeout` 是连接级参数，每次启动重新设置。
- 切到 WAL 的原因：本服务的高频路径（登录、评论、验证码）每个请求都要写限流桶，而
  `npm run update` 会在 API 在线时做全库 `VACUUM INTO` 备份。rollback journal 下读写在
  提交窗口互斥，可能出现请求等锁甚至 `SQLITE_BUSY`；WAL 让读不阻塞写、写不阻塞读。
- 启动日志若出现 `SQLite 未启用 WAL` 警告，说明数据库位于不支持 WAL 的文件系统
  （例如部分网络文件系统）。此时并发能力与备份窗口都会变差，应先解决存储位置。
- **`blog-api` 必须保持单实例**（PM2 默认行为）。不要使用 cluster 模式或把 `instances`
  调大：SQLite 只有一个写者，多进程只会带来跨进程锁竞争。需要横向扩展时先迁库。
- `VACUUM INTO` 在 WAL 下仍然是事务一致的快照。若改用「直接复制 .db 文件」这类备份方式，
  必须同时带上 `-wal` / `-shm` 文件，否则会拿到过期数据——本仓库不支持这种备份方式。

## 日志轮转

PM2 默认把 stdout/stderr 写进 `~/.pm2/logs/`，**不会自动轮转**；pino 的请求日志在
长期运行后会持续增长，磁盘写满会同时危及 SQLite 与备份。部署时应安装官方轮转模块：

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M     # 单文件上限
pm2 set pm2-logrotate:retain 14        # 保留 14 份
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
```

该配置不随仓库分发（属于主机状态），因此每次重建服务器后都要重做，并确认
`pm2 conf pm2-logrotate` 与实际磁盘水位一致。

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
Prisma Client 生成、`check:ci`（lint/typecheck/tests/文档/契约）、SQLite 备份、
migration、双应用构建、对**构建产物**跑 `smoke:prod`、PM2 `startOrReload`、
`pm2 save`，最后轮询 API 与 Web 的本机健康端点。

> 从 2026-09-17 起，更新路径不再运行 dev 形态的 `npm run smoke`。
> 它用 `next dev` 起实例，服务器上要现编译页面（实测单页 7–8 秒），
> 而其中的交互断言（音乐面板、目录滚动高亮、移动端目录抽屉）依赖水合完成，
> 于是同一份代码在开发机上全绿、在服务器上稳定失败，且与待上线代码无关。
> 服务器上用 `check:ci` + 构建后的 `smoke:prod`：前者做静态与单元校验，
> 后者校验真正要上线的产物（CI 用的也是这一条）。本地开发仍用 `npm run check`。

校验开始前还会清理过期生成物：`apps/web/.next/types`、`apps/web/.next/dev/types`
以及 `apps/api/dist`。`tsc` 不删除已移除源文件对应的产物，残留文件会让校验或冒烟
误用旧构建——真实案例：服务器上残留的 `dist/lib/phone.js` 仍在 import 早已移除的
`libphonenumber-js`，导致 `smoke:prod` 以模块找不到失败，而报错指向的模块本次并未改动。

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

## 本次改版（2026-09-17）上线清单

前端改版与稳定性修复已合并进 `main`，GitHub CI 全绿（lint、类型、107 个测试、
文档与契约校验、生产构建、对生产产物的浏览器冒烟、依赖审计）。
服务器上按下面顺序执行即可。

### 1. 上线前

```bash
cd <仓库目录>
git log -1 --format=%H          # 记下当前提交，回滚要用
git status --porcelain          # 应为空；有输出说明服务器有本地改动
```

确认 `.env` 中有 `SITE_URL` 与 `NEXT_PUBLIC_SITE_URL`（必须是最终对外域名，
否则 Next 的图片白名单与 canonical 会不对）。本轮**没有新增必需变量**。

### 2. 执行更新

```bash
npm run update
```

脚本会：备份 SQLite → `git pull --ff-only` → `npm ci` → Prisma Client 生成 →
lint/类型/测试 → 应用 migration → 构建 API 与 Web → PM2 重载 → `pm2 save` →
轮询 API `/health` 与 Web 首页。

本轮含 5 个 migration（个人资料、token 版本、留言板可空外键、索引），
都是新增或放宽约束，不改动既有列的数据。

### 3. 上线后验收

在本机（服务器）执行：

```bash
curl -s http://127.0.0.1:3002/health          # 期望 status ok、database ok
pm2 status                                     # blog-web 与 blog-api 均 online
```

然后在浏览器里逐项确认（改版涉及的具体页面）：

| 检查项 | 期望 |
|---|---|
| `/` | 整屏壁纸首屏，向下滚动能看到「最新文章」卡片 |
| `/articles` | 三栏卡片栅格，卡片有封面或渐变色块回落 |
| 任意文章页 | 左侧目录随滚动高亮；无目录时不显示空白栏 |
| 文章页代码块 | 语言标签 + 复制按钮可用；长代码可横向滚动 |
| 文章页图片 | 点击放大，Esc 或点遮罩关闭 |
| `/archive` | 按年份分组，年份标题吸顶 |
| 移动端宽度 | 头部只剩 Logo + 图标 + 菜单按钮；点菜单展开一套导航（含账号/管理/退出），背景变暗且不可滚动 |
| 暗色模式 | 头部主题切换菜单选「黑暗」，刷新后保持 |
| 打印预览（Ctrl+P） | 无页头页脚、无目录栏、无评论区，代码块换行 |

### 部署路径预验证（可选，但建议在首次部署前跑一次）

`npm run update` 一般在开发工作区里被验证，而那里的依赖树是完整的，于是发现不了
三类只在服务器上暴露的问题：`package.json` 漏声明依赖、构建产物入口路径不对、
生产启动方式与 `ecosystem.config.cjs` 不一致。

`scripts/deploy-verify/verify-deploy.sh` 在独立 worktree 上复现干净安装：

```bash
git worktree add --detach /tmp/kpblog-clean origin/main
cp scripts/deploy-verify/verify-deploy.sh /tmp/kpblog-clean/
cd /tmp/kpblog-clean && bash verify-deploy.sh
```

它复现的就是 `npm run update` 的完整序列：`npm ci`、`prisma generate`、
`lint`、`typecheck`、全部测试、文档与契约校验、`npm run build`，检查两个构建产物，
然后**按 PM2 的方式**启动入口（`node apps/api/dist/index.js` 轮询 `/health`，
`next start --hostname 127.0.0.1 --port 3101` 请求首页），最后跑一遍
`npm run smoke:prod`。全部通过时输出 `RESULT: ALL_DEPLOY_CHECKS_PASSED`。

2026-09-17 在干净检出上实测通过：`npm ci` 安装 777 个包，全部检查项通过，
两个入口可运行，冒烟（含 11 项交互断言）全部通过。

注意 `npm run update` 本身会跑 `npm run check`，而 `check` 包含浏览器冒烟，
所以它需要 Chromium。服务器上先确认这一点，否则更新会在最后一步失败：

```bash
which chromium chromium-browser google-chrome || ls ~/.cache/ms-playwright
```

没有的话：

```bash
npx playwright install --with-deps chromium
```

装好后脚本会自动从 `$HOME/.cache/ms-playwright` 找到它，通常不需要额外配置。
若装在别处，把可执行文件路径写进 `CHROME_BIN`；注意 **PM2 的 env 也要带上**
（进程已有的环境变量会挡住 `.env`，见[环境变量](environment.md)）。

确实无法安装浏览器时，可以跳过校验完成更新：

```bash
npm run update -- --skip-check
```

这会**同时跳过 lint、类型检查与全部测试**，只应在明确知晓风险时使用；
正常环境应先解决浏览器依赖。

### 常见失败：Validate workspace 里的 typecheck 报 TS2307

首次更新时出现过：

```text
.next/types/app/(public)/gallery/page.ts(2,24): error TS2307:
Cannot find module '.../src/app/(public)/gallery/page.js'
```

这不是代码缺陷，而是**生成物过期**。`apps/web/tsconfig.json` 会把
`.next/types/**/*.ts` 纳入编译范围，而这份类型是上一版构建按当时的文件树生成的；
本次上线删除了 `gallery` 与 `admin/images` 两个路由，旧类型仍去 import 已不存在的
`page.ts`。`typecheck` 跑在 `build` 之前，自己无法自愈。

`npm run update` 已在校验前删除 `apps/web/.next/types`（以及 `.next/dev/types`），
所以现在会自动恢复，不需要手工干预。若在其它流程里再遇到同类报错，等价的手工处理是：

```bash
rm -rf apps/web/.next/types
```

顺带说明：更新脚本也会在构建前删除 `apps/api/dist`。`tsc` 不清理已移除源文件对应的
旧输出，残留文件会让构建产物与源码不一致。

### 4. 回滚

代码回滚：

```bash
git log -1 --format=%H              # 拿到本次上线前的提交
git reset --hard <上线前提交>
npm ci && npm run build && pm2 startOrReload ecosystem.config.cjs && pm2 save
```

数据库回滚（仅在确认数据出问题时）：更新脚本已在 `backups/` 留下
`dev.db.<时间戳>.bak`，按[备份范围与当前恢复限制](#备份范围与当前恢复限制)
里的恢复步骤操作。注意：回滚数据库会丢失备份时间点之后的新内容（文章、评论）。

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
pm2 stop blog-api                                   # 必须先停：API 持有数据库连接（WAL 模式）
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
