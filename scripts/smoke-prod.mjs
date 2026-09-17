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
import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const webRoot = path.join(repositoryRoot, "apps/web");

/**
 * Web 的生产构建由**本脚本自己完成**（见 buildWebForSmoke）。
 *
 * 为什么不能复用仓库里已有的 `.next`：Next 会把 `next.config.ts` 里 rewrite 的
 * 目标地址编译进构建产物。服务器上的 `.next` 是在仓库里用仓库 `.env` 构建的，
 * 因此即使运行时进程环境给了临时 API 地址，Web 仍然会去连 `.env` 里的生产 API——
 * 表现为「API 起在 3312、Web 却连 3002」。只写 `.env.local` 也不够：
 * 它影响的是运行时环境，而 rewrite 目标在构建期就已经固定。
 * 所以这里用冒烟自己的地址重新构建一次（约 10–40 秒），构建产物才是自洽的。
 * 结束时会删除本次构建产生的 `.next`，避免把冒烟配置留给下一次真实构建。
 */

// API 也必须是构建产物：`npx tsx` 属于开发依赖，在生产安装（npm ci --omit=dev）
// 或 CI 里会去联网解析版本而失败——CI 的冒烟步骤就是这么挂掉的。
const apiEntry = path.join(repositoryRoot, "apps/api/dist/index.js");
if (!existsSync(apiEntry)) {
  console.error("未找到 API 生产构建产物，请先运行：npm run build");
  process.exit(1);
}

const tempDir = mkdtempSync(path.join(tmpdir(), "kpblog-prod-"));
const webDistDir = path.join("tmp", `smoke-prod-${process.pid}`);
const webPort = Number(process.env.SMOKE_WEB_PORT || 3311);
const apiPort = Number(process.env.SMOKE_API_PORT || 3312);

const env = {
  ...process.env,
  NODE_ENV: "production",
  DATABASE_URL: `file:${path.join(tempDir, "prod-smoke.db")}`,
  JWT_SECRET: "prod-smoke-secret-at-least-32-characters",
  API_PORT: String(apiPort),
  API_HOST: "127.0.0.1",
  // 必须指向本脚本自己的 API 实例。
  //
  // 只靠进程环境变量**不够**：Next 会把 `next.config.ts` 里的 rewrite 目标
  // 编译进构建产物（`.next`），而构建是在服务器仓库里、用仓库 `.env` 完成的。
  // 于是服务器上出现「API 起在 3312、Web 却去连 .env 里的 3002」的假失败——
  // 开发机上 `.env` 通常没有 API_INTERNAL_URL，所以复现不出来。
  // 真正生效的是 webRoot 下临时写入的 `.env.local`（见 writeWebEnvOverride）。
  API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
  SITE_URL: `http://127.0.0.1:${webPort}`,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${webPort}`,
  SMOKE_SEED_DATABASE_URL: `file:${path.join(tempDir, "prod-smoke.db")}`,
  // Web 与 `next start` 都用这个构建目录，仓库的 `.next` 完全不参与。
  NEXT_DIST_DIR: webDistDir,
};

/**
 * 给被测 Web 实例写一份 `.env.local`。
 *
 * Next 的 env 加载顺序是 `.env.<env>.local` → `.env.local` → `.env.<env>` → `.env`，
 * 其中 `.env.local` 对已存在的进程变量是**覆盖**语义。把冒烟自己的 API 地址写进
 * 这里，Web 就一定会连到临时实例，而不是仓库 `.env` 指向的生产 API。
 * 结束后恢复原文件（原本不存在就删除），不留下任何痕迹。
 */
const webEnvFile = path.join(webRoot, ".env.local");
function writeWebEnvOverride() {
  if (existsSync(webEnvFile)) {
    console.error(
      `[失败] ${path.relative(repositoryRoot, webEnvFile)} 已存在，冒烟会覆盖它。` +
        "请先移走该文件再运行。"
    );
    process.exit(1);
  }
  writeFileSync(
    webEnvFile,
    [
      "# 由 scripts/smoke-prod.mjs 临时生成，运行结束后删除。",
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

/**
 * 冒烟自己的构建目录（相对 apps/web）。
 *
 * 用独立 distDir 而不是复用仓库的 `.next`：冒烟必须用**自己的** API 地址构建
 * （rewrite 目标会被编译进产物），而仓库那份 `.next` 是用生产配置构建的。
 * 两者不能共用，也不能互相覆盖——实测过一次教训：先改名藏起来、构建、再还回去
 * 的做法很容易在异常路径上把开发者/服务器的生产产物弄丢。
 * 与 scripts/smoke.mjs 一样，构建到 `apps/web/tmp/<name>`，结束时整个删除。
 * 注意必须是相对 apps/web 的路径：Next 会把绝对路径当成相对路径解析。
 */

function buildWebForSmoke() {
  console.log("      构建 Web（使用冒烟实例的 API 地址）…");
  const result = spawnSync(bin("next"), ["build", "--webpack"], { cwd: webRoot, env, encoding: "utf8" });
  if (result.status !== 0) {
    console.error("[失败] Web 生产构建\n" + (result.stdout || "") + (result.stderr || ""));
    shutdown(1);
  }
}

function removeSmokeBuild() {
  try {
    rmSync(path.join(webRoot, webDistDir), { recursive: true, force: true });
  } catch { /* ignore */ }
}

const children = [];
function shutdown(code) {
  for (const child of children) {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
  }
  removeWebEnvOverride();
  removeSmokeBuild();
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(code);
}
process.on("exit", () => {
  // 兜底清理：正常路径已清过，这里覆盖异常退出（SIGKILL 除外，已由 .gitignore 兜底）
  removeWebEnvOverride();
  removeSmokeBuild();
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

console.log("[3/4] 构建 Web 并启动 API 与 Web（生产模式）");
writeWebEnvOverride();
buildWebForSmoke();
const api = spawn(process.execPath, ["apps/api/dist/index.js"], { cwd: repositoryRoot, env, stdio: ["ignore", "pipe", "pipe"] });
const web = spawn(bin("next"), ["start", "--port", String(webPort), "--hostname", "127.0.0.1"], {
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

/**
 * 等待实例就绪。
 *
 * 判据不能只是「有响应」：Next 在 rewrites 生效前会对 /api/* 返回 404，
 * 若在这里就算就绪，冒烟会在 API 通道尚未打通时开始，SSR 取数全部失败。
 * 因此只接受 2xx/3xx，并在最后额外验证一次「经 Web 访问 API」确实可用。
 */
async function waitFor(url, label) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0 && res.status < 400) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.error(`[失败] ${label} 未在 90s 内就绪`);
  for (const [child, lines] of logs) console.error(`--- ${child.spawnargs.join(" ")}\n` + lines.join("").slice(-1200));
  shutdown(1);
}

await waitFor(`http://127.0.0.1:${apiPort}/health`, "API");
await waitFor(`http://127.0.0.1:${webPort}/`, "Web");

// Web 到 API 的通道必须真的打通再往下跑：SSR 取数失败时页面仍返回 200，
// 只会渲染成空状态，而冒烟的数据断言会以「内容缺失」的形式失败，难以定位。
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
    console.error(`  Web 用的 API_INTERNAL_URL 应为 http://127.0.0.1:${apiPort}`);
    for (const [child, lines] of logs) {
      console.error(`--- ${child.spawnargs.join(" ")}`);
      console.error(lines.join("").slice(-1200) || "（无输出）");
    }
    shutdown(1);
  }
  console.log("Web → API 通道已打通");
}

// 自检：确认被测实例真的连在临时库上。
// 没有这道检查时，「首页渲染出文章」这类断言可能因为撞上开发库/旧实例而假通过。
const apiLog = logs.get(api).join("");
const expectedDb = env.DATABASE_URL.slice("file:".length);
if (!apiLog.includes(expectedDb)) {
  console.error("[失败] API 未使用预期的临时数据库。");
  console.error(`  期望：${expectedDb}`);
  const shown = apiLog.match(/\[api\] database=([^\s]+)/);
  console.error(`  实际：${shown ? shown[1] : "（日志中未出现 database 字段）"}`);
  for (const [child, lines] of logs) {
    console.error(`--- ${child.spawnargs.join(" ")}`);
    console.error(lines.join("").slice(-1200) || "（无输出）");
  }
  shutdown(1);
}
console.log(`数据库自检通过：${expectedDb}`);

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
