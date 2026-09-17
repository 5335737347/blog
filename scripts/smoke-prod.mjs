#!/usr/bin/env node
/**
 * 部署形态验证：用「生产构建 + next start」跑一遍浏览器冒烟。
 *
 *   npm run smoke:prod
 *
 * 与 `npm run smoke` 的区别：那个用 `next dev`（快、便于日常），
 * 这个用真实部署形态（`next build` + `next start`）——预渲染、压缩、
 * 生产 React 都在这个路径上才会走到。发布前应至少跑一次。
 *
 * 前置条件：已执行过 `npm run build`。
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const webRoot = path.join(repositoryRoot, "apps/web");

if (!existsSync(path.join(webRoot, ".next/BUILD_ID"))) {
  console.error("未找到生产构建产物，请先运行：npm run build");
  process.exit(1);
}

const tempDir = mkdtempSync(path.join(tmpdir(), "kpblog-prod-"));
const webPort = Number(process.env.SMOKE_WEB_PORT || 3311);
const apiPort = Number(process.env.SMOKE_API_PORT || 3312);

const env = {
  ...process.env,
  NODE_ENV: "production",
  DATABASE_URL: `file:${path.join(tempDir, "prod-smoke.db")}`,
  JWT_SECRET: "prod-smoke-secret-at-least-32-characters",
  API_PORT: String(apiPort),
  API_HOST: "127.0.0.1",
  API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
  SITE_URL: `http://127.0.0.1:${webPort}`,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${webPort}`,
  SMOKE_SEED_DATABASE_URL: `file:${path.join(tempDir, "prod-smoke.db")}`,
};

const children = [];
function shutdown(code) {
  for (const child of children) {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
  }
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(code);
}
process.on("exit", () => {
  // 兜底清理：正常路径已清过，这里覆盖异常退出（SIGKILL 除外，已由 .gitignore 兜底）
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
});
process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, env, encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`[失败] ${label}\n` + (result.stdout || "") + (result.stderr || ""));
    shutdown(1);
  }
}

console.log("[1/4] 准备临时数据库");
run("npx", ["prisma", "migrate", "deploy"], "prisma migrate deploy");

console.log("[2/4] 写入冒烟数据");
run("npx", ["tsx", "scripts/smoke-seed.ts"], "冒烟数据播种");

console.log("[3/4] 启动 API 与 Web（生产模式）");
const api = spawn("npx", ["tsx", "apps/api/src/index.ts"], { cwd: repositoryRoot, env, stdio: ["ignore", "pipe", "pipe"] });
const web = spawn("npx", ["next", "start", "--port", String(webPort), "--hostname", "127.0.0.1"], {
  cwd: webRoot,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
children.push(api, web);
const logs = new Map([[api, []], [web, []]]);
for (const child of [api, web]) {
  child.stdout.on("data", (d) => logs.get(child).push(String(d)));
  child.stderr.on("data", (d) => logs.get(child).push(String(d)));
}

async function waitFor(url, label) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.error(`[失败] ${label} 未在 90s 内就绪`);
  for (const [child, lines] of logs) console.error(`--- ${child.spawnargs.join(" ")}\n` + lines.join("").slice(-1200));
  shutdown(1);
}

await waitFor(`http://127.0.0.1:${apiPort}/health`, "API");
await waitFor(`http://127.0.0.1:${webPort}/`, "Web");

if (process.env.SMOKE_VERBOSE === "1") {
  for (const [child, lines] of logs) {
    console.log(`--- ${child.spawnargs.join(" ")}`);
    console.log(lines.join("").slice(-2000));
  }
}

console.log("[4/4] 对生产构建执行浏览器冒烟检查\n");
const smoke = spawnSync("node", ["scripts/smoke-web.mjs"], {
  cwd: repositoryRoot,
  env: { ...env, BASE_URL: `http://127.0.0.1:${webPort}`, SMOKE_SEEDED: "1" },
  stdio: "inherit",
});
if (smoke.status !== 0) {
  console.error("\n冒烟失败，输出被测实例的启动日志：");
  for (const [child, lines] of logs) {
    console.error(`--- ${child.spawnargs.join(" ")}`);
    console.error(lines.join("").slice(-2000) || "（无输出）");
  }
}
shutdown(smoke.status === 0 ? 0 : 1);
