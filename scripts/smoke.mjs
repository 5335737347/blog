#!/usr/bin/env node
/**
 * 浏览器冒烟编排：自建临时数据库 + 临时端口，跑完自动清理。
 *
 *   npm run smoke
 *
 * 为什么不让 smoke-web.mjs 直连开发服务：开发库里有本地演示数据，
 * 而且需要用户先把服务起起来，CI 里也不成立。这里用全新的临时库，
 * 只写入冒烟所需的最小数据（一篇已发布文章 + 一个分类），
 * 这样「页面能否渲染」的结论不受本地数据状态影响。
 *
 * 已有服务时也可以直接跑：BASE_URL=http://127.0.0.1:3001 node scripts/smoke-web.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const tempDir = mkdtempSync(path.join(tmpdir(), "kpblog-smoke-"));
const databaseUrl = `file:${path.join(tempDir, "smoke.db")}`;
const webPort = Number(process.env.SMOKE_WEB_PORT || 3211);
const apiPort = Number(process.env.SMOKE_API_PORT || 3212);

const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: databaseUrl,
  JWT_SECRET: "smoke-test-secret-at-least-32-characters",
  API_PORT: String(apiPort),
  API_HOST: "127.0.0.1",
  API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
  SITE_URL: `http://127.0.0.1:${webPort}`,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${webPort}`,
  SMOKE_SEED_DATABASE_URL: databaseUrl,
  // Next 16 不允许同一目录下同时运行两个 dev server（.next 被锁），
  // 冒烟实例用独立构建目录，就不必要求用户先关掉自己的开发服务。
  //
  // 注意必须给相对 apps/web 的路径：Next 会把绝对路径当成相对路径解析，
  // 结果在 apps/web/tmp/ 下生成构建产物，既污染工作区又会被 lint 扫到。
  NEXT_DIST_DIR: path.join("tmp", `smoke-${process.pid}`),
};

/** 冒烟实例的构建目录（相对 apps/web），结束时一并删除。 */
const webDistDir = path.join(repositoryRoot, "apps", "web", env.NEXT_DIST_DIR);

const children = [];
function shutdown(code) {
  for (const child of children) {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
  }
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { rmSync(webDistDir, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(code);
}
process.on("exit", () => {
  // 兜底清理：正常路径已清过，这里覆盖异常退出（SIGKILL 除外，已由 .gitignore 兜底）
  try { rmSync(webDistDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
});
process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, env, encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`[失败] ${label}`);
    console.error((result.stdout || "") + (result.stderr || ""));
    shutdown(1);
  }
}

console.log("[1/4] 准备临时数据库");
run("npx", ["prisma", "migrate", "deploy"], "prisma migrate deploy");

console.log("[2/4] 写入冒烟数据");
run("npx", ["tsx", "scripts/smoke-seed.ts"], "冒烟数据播种");

console.log("[3/4] 启动 API 与 Web");
const api = spawn("npx", ["tsx", "apps/api/src/index.ts"], { cwd: repositoryRoot, env, stdio: ["ignore", "pipe", "pipe"] });
const web = spawn("npx", ["next", "dev", "--port", String(webPort)], {
  cwd: path.join(repositoryRoot, "apps/web"),
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
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(`[失败] ${label} 未在 120s 内就绪`);
  for (const [child, lines] of logs) console.error(`--- ${child.spawnargs.join(" ")}\n` + lines.join("").slice(-1500));
  shutdown(1);
}

await waitFor(`http://127.0.0.1:${apiPort}/health`, "API");
await waitFor(`http://127.0.0.1:${webPort}/`, "Web");

// 自检：确认被测实例真的连在临时库上。
// Next 与 API 都会加载 .env.local；不核对的话，冒烟可能跑在开发库上，
// 于是「首页渲染出文章」这类断言会因为开发库恰好有数据而假通过。
const apiLog = logs.get(api).join("");
const expectedDb = databaseUrl.slice("file:".length);
if (!apiLog.includes(expectedDb)) {
  console.error(`[失败] API 未使用预期的临时数据库。`);
  console.error(`  期望：${expectedDb}`);
  const shown = apiLog.match(/\[api\] database=([^\s]+)/);
  console.error(`  实际：${shown ? shown[1] : "（日志中未出现 database 字段）"}`);
  console.error("  提示：检查 .env.local 是否覆盖了 DATABASE_URL。");
  for (const [child, lines] of logs) {
    console.error(`--- ${child.spawnargs.join(" ")}`);
    console.error(lines.join("").slice(-1200) || "（无输出）");
  }
  shutdown(1);
}
console.log(`数据库自检通过：${expectedDb}`);

console.log("[4/4] 执行浏览器冒烟检查\n");
const smoke = spawnSync("node", ["scripts/smoke-web.mjs"], {
  cwd: repositoryRoot,
  env: { ...env, BASE_URL: `http://127.0.0.1:${webPort}`, SMOKE_SEEDED: "1" },
  stdio: "inherit",
});
shutdown(smoke.status === 0 ? 0 : 1);
