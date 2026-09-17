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
export API_PORT=3102
export API_HOST=127.0.0.1
# 不要在这里设 API_INTERNAL_URL：冒烟会自己指定它，而项目统一用
# `override: false` 加载 .env，进程已有的变量会挡住 .env 里的值，
# 于是一个「演示用」的值会污染下游（实测让冒烟的 Web 一直去连不存在的 3102）。

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

# 下面这些就是 `npm run update` 在服务器上会跑的检查。
# 在干净检出里先跑一遍，避免「本地开发工作区能过、服务器上挂掉」。
echo "=== lint ==="
npm run lint || fail LINT_FAILED 17

echo "=== typecheck ==="
npm run typecheck || fail TYPECHECK_FAILED 18

echo "=== tests ==="
npm test || fail TEST_FAILED 19

echo "=== check:docs ==="
npm run check:docs || fail DOCS_FAILED 20

echo "=== check:openapi ==="
npm run check:openapi || fail OPENAPI_FAILED 21

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
wait "$API_PID" 2>/dev/null

echo "=== 按 PM2 的方式启动 Web（next start 127.0.0.1:3101）==="
# 用 `exec` 让子 shell 被 node 替换：否则 $! 拿到的是子 shell 的 PID，
# kill 只结束子 shell，node 仍占着端口——本脚本此前就这样留下过残留服务，
# 进而让下一次运行的端口预检直接失败。
(cd apps/web && exec node ../../node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3101) > ./verify-web.log 2>&1 &
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
  wait "$WEB_PID" 2>/dev/null
  fail WEB_BOOT_FAILED 16
fi
echo "Web 入口可运行，首页返回 200"
kill "$WEB_PID" 2>/dev/null
wait "$WEB_PID" 2>/dev/null

# 关键：等两个实例真正退出后再跑冒烟。
#
# 冒烟会自己起 API 与 Web，而它启动的 Web 与本脚本启动的 Web **共用同一个
# `.next` 目录**（生产构建只有一份）。两者交叠过就会互相干扰：实测出现过
# 冒烟的 API 中途被杀，随后所有 `/api/*` 失败、数据渲染断言直接失败。
for _ in $(seq 1 20); do
  busy=0
  curl -sS -m 2 -o /dev/null "http://127.0.0.1:${API_PORT}/" 2>/dev/null && busy=1
  curl -sS -m 2 -o /dev/null http://127.0.0.1:3101/ 2>/dev/null && busy=1
  [ "$busy" = "0" ] && break
  sleep 1
done
if [ "$busy" != "0" ]; then
  echo "[警告] 仍有实例占用 ${API_PORT} 或 3101，冒烟的端口预检可能会拒绝启动。"
fi

# 冒烟检查是 `npm run update` 的最后一环，也是最依赖环境的一环（需要浏览器）。
# 它在这里跑通，服务器上才不会再遇到新的意外。
#
# 加硬超时：冒烟自己会起两个实例，若环境异常（端口被占、浏览器有问题）会等很久；
# 部署流程里不允许出现「卡住不返回」。
echo "=== 浏览器冒烟（对生产构建）==="
if ! timeout 420 npm run smoke:prod; then
  fail SMOKE_FAILED 22
fi

echo "RESULT: ALL_DEPLOY_CHECKS_PASSED"
