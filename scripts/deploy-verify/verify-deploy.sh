#!/bin/bash
# 模拟服务器上的部署路径：干净检出 → npm ci → 生成 → 构建 → 产物检查 → 启动入口
#
# 为什么需要它：`npm run update` 通常在开发工作区里被验证，而那里的依赖树是完整的，
# 于是发现不了「package.json 漏声明依赖」「构建产物入口路径不对」「生产启动方式
# 与 PM2 配置不一致」这三类问题——它们恰好只在服务器上暴露。
#
# 用法（在干净检出目录里执行）：
#   git worktree add --detach /tmp/kpblog-clean origin/main
#   cp scripts/deploy-verify/verify-deploy.sh /tmp/kpblog-clean/
#   cd /tmp/kpblog-clean && bash verify-deploy.sh
#
# 沙箱提示：若 ~/.npm 或 ~/.cache/prisma 不可写（受限环境），
# 追加 npm_config_cache 与 XDG_CACHE_HOME 指向可写目录即可。
set -o pipefail
cd "$(dirname "$0")"

export DATABASE_URL="file:./prisma/ci.db"
export JWT_SECRET="clean-verify-secret-at-least-32-chars"
export SITE_URL="https://example.test"
export NEXT_PUBLIC_SITE_URL="https://example.test"
export API_INTERNAL_URL="http://127.0.0.1:3102"
export API_PORT=3102
export API_HOST=127.0.0.1

# 本机沙箱里 ~/.npm 只读，用工作区内缓存（CI/服务器上无此限制）
export npm_config_cache="$(cd .. && pwd)/.npm-cache"
# 同理，Prisma 的引擎缓存默认在 ~/.cache/prisma，本机沙箱同样只读
export XDG_CACHE_HOME="$(cd .. && pwd)/.npm-cache/xdg"

fail() { echo "RESULT: $1"; exit "$2"; }

echo "=== node/npm ==="
node -v; npm -v

echo "=== npm ci（干净安装）==="
npm ci --include=dev --no-audit --no-fund || fail NPM_CI_FAILED 10
echo "npm ci 完成"

echo "=== prisma generate ==="
npm run db:generate || fail GENERATE_FAILED 11

echo "=== 构建（等价于服务器的 npm run build）==="
npm run build || fail BUILD_FAILED 12

[ -f apps/web/.next/BUILD_ID ] || fail WEB_BUILD_MISSING 13
[ -f apps/api/dist/index.js ] || fail API_DIST_MISSING 14
echo "构建产物齐全"

echo "=== 按 PM2 的方式启动 API（node apps/api/dist/index.js）==="
node apps/api/dist/index.js > ./verify-api.log 2>&1 &
API_PID=$!
healthy=0
for _ in $(seq 1 20); do
  if curl -sS -m 3 "http://127.0.0.1:${API_PORT}/health" 2>/dev/null | grep -q '"status":"ok"'; then healthy=1; break; fi
  sleep 1
done
if [ "$healthy" != "1" ]; then
  echo "--- API 日志 ---"; head -20 ./verify-api.log
  kill "$API_PID" 2>/dev/null
  fail API_BOOT_FAILED 15
fi
echo "API 入口可运行，/health 返回 ok"
kill "$API_PID" 2>/dev/null

echo "=== 按 PM2 的方式启动 Web（next start 127.0.0.1:3101）==="
(cd apps/web && node ../../node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3101) > ./verify-web.log 2>&1 &
WEB_PID=$!
up=0
for _ in $(seq 1 25); do
  code=$(curl -sS -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:3101/ 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then up=1; break; fi
  sleep 1
done
if [ "$up" != "1" ]; then
  echo "--- Web 日志 ---"; head -20 ./verify-web.log
  kill "$WEB_PID" 2>/dev/null
  fail WEB_BOOT_FAILED 16
fi
echo "Web 入口可运行，首页返回 200"
kill "$WEB_PID" 2>/dev/null

echo "RESULT: ALL_DEPLOY_CHECKS_PASSED"
