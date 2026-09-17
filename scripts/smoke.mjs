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
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  // 必须指向本脚本自己的 API 实例。
  //
  // 只设进程变量不够：仓库 `.env` 里若配置了 API_INTERNAL_URL（服务器上就是
  // 这样），被测 Web 实例会去连它而不是临时实例。真正生效的是 webRoot 下的
  // `.env.local`，见 writeWebEnvOverride（与 smoke-prod.mjs 同一机制）。
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

/**
 * 给被测 Web 实例写一份 `.env.local`，让它在 dev 形态下也连临时 API。
 *
 * Next 的 env 加载顺序里 `.env.local` 对已存在的进程变量是覆盖语义，
 * 因此这是唯一能稳定压过仓库 `.env` 的位置。结束后删除，不留痕迹。
 */
const webEnvFile = path.join(repositoryRoot, "apps", "web", ".env.local");
function writeWebEnvOverride() {
  if (existsSync(webEnvFile)) {
    console.error(
      "[失败] apps/web/.env.local 已存在，冒烟会覆盖它。请先移走该文件再运行。"
    );
    process.exit(1);
  }
  writeFileSync(
    webEnvFile,
    [
      "# 由 scripts/smoke.mjs 临时生成，运行结束后删除。",
      `API_INTERNAL_URL="http://127.0.0.1:${apiPort}"`,
      `SITE_URL="http://127.0.0.1:${webPort}"`,
      `NEXT_PUBLIC_SITE_URL="http://127.0.0.1:${webPort}"`,
      "",
    ].join("\n")
  );
}
function removeWebEnvOverride() {
  try { rmSync(webEnvFile, { force: true }); } catch { /* ignore */ }
}

/** 冒烟实例的构建目录（相对 apps/web），结束时一并删除。 */
const webDistDir = path.join(repositoryRoot, "apps", "web", env.NEXT_DIST_DIR);

writeWebEnvOverride();

const children = [];
function shutdown(code) {
  for (const child of children) {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
  }
  removeWebEnvOverride();
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { rmSync(webDistDir, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(code);
}
process.on("exit", () => {
  // 兜底清理：正常路径已清过，这里覆盖异常退出（SIGKILL 除外，已由 .gitignore 兜底）
  removeWebEnvOverride();
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

// 优先用本地安装的二进制，避免 npx 在依赖不完整时尝试联网解析版本
const bin = (name) => path.join(repositoryRoot, "node_modules/.bin", name);

/**
 * 端口占用预检。
 *
 * 不检查的话，上一次异常退出留下的实例仍占着端口时，`waitFor` 探到的会是
 * **那个旧实例**，于是冒烟对着错误的进程给出结论；更糟的情况是它一直不健康、
 * 脚本卡住不返回（本机就遇到过一次，排查耗时很久）。
 * 任何 HTTP 响应（含 404）都说明端口被占用。
 */
async function assertPortFree(port, label) {
  if (process.env.SMOKE_IGNORE_PORT_CHECK === "1") return;
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
  } catch {
    return; // 连接失败 = 端口空闲
  }
  console.error(`[失败] ${label} 端口 ${port} 已被占用。`);
  console.error("  可能是上一次冒烟异常退出留下的进程。请结束它，或用");
  console.error(`  SMOKE_WEB_PORT / SMOKE_API_PORT 指定其它端口。`);
  process.exit(3);
}

console.log("[1/4] 准备临时数据库");
await assertPortFree(apiPort, "API");
await assertPortFree(webPort, "Web");

run(bin("prisma"), ["migrate", "deploy"], "prisma migrate deploy");

console.log("[2/4] 写入冒烟数据");
run(process.execPath, [path.join(repositoryRoot, "apps/api/scripts/smoke-seed.mjs")], "冒烟数据播种");

console.log("[3/4] 启动 API 与 Web");
const api = spawn(bin("tsx"), ["apps/api/src/index.ts"], { cwd: repositoryRoot, env, stdio: ["ignore", "pipe", "pipe"] });
const web = spawn(bin("next"), ["dev", "--port", String(webPort)], {
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
      // 只接受 2xx/3xx：Next 在 rewrites 生效前会对 /api/* 返回 404，
      // 那时就算「就绪」会让冒烟在通道未打通时开始。
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0 && res.status < 400) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(`[失败] ${label} 未在 120s 内就绪`);
  for (const [child, lines] of logs) console.error(`--- ${child.spawnargs.join(" ")}\n` + lines.join("").slice(-1500));
  shutdown(1);
}

await waitFor(`http://127.0.0.1:${apiPort}/health`, "API");
await waitFor(`http://127.0.0.1:${webPort}/`, "Web");

// 同 smoke-prod：Web 到 API 的通道打通后才继续，
// 否则页面只会渲染成空状态，数据断言失败但看不出原因。
{
  const deadline = Date.now() + 60000;
  let ok = false;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${webPort}/api/public/settings`);
      if (res.ok) { ok = true; break; }
      last = `HTTP ${res.status}`;
    } catch (error) {
      last = String(error?.message || error);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ok) {
    console.error(`[失败] 经 Web 访问 API 不通（${last}）。`);
    for (const [child, lines] of logs) {
      console.error(`--- ${child.spawnargs.join(" ")}`);
      console.error(lines.join("").slice(-1200) || "（无输出）");
    }
    shutdown(1);
  }
  console.log("Web → API 通道已打通");
}

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

// 先把启动阶段的日志尾部打出来：CI 上失败时往往只能看到「页面没渲染」，
// 而真正原因（端口占用、依赖缺失、编译报错）在子进程日志里。
if (process.env.SMOKE_VERBOSE === "1") {
  for (const [child, lines] of logs) {
    console.log(`--- ${child.spawnargs.join(" ")}`);
    console.log(lines.join("").slice(-2000));
  }
}

console.log("[4/4] 执行浏览器冒烟检查\n");
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
