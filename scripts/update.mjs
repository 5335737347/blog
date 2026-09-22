#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { databaseFilePath, loadProjectEnv } from "./load-env.mjs";

// 环境加载统一走 scripts/load-env.mjs（此前这里有一份手写正则解析器，
// 与 dotenv 在行内注释、export 前缀和转义上的行为都不一致）。
loadProjectEnv();

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const supportedArgs = new Set([
  "--allow-dirty",
  "--allow-new-database",
  "--skip-backup",
  "--skip-build",
  "--skip-check",
  "--skip-health-check",
  "--skip-install",
  "--skip-pull",
  "--skip-restart",
  "--help",
]);
const lockPath = path.resolve(".git", "kpblog-update.lock");
let lockAcquired = false;

function printHelp() {
  console.log(`Usage: npm run update -- [options]

Options:
  --allow-dirty       Allow tracked local changes before pulling
  --allow-new-database Allow DATABASE_URL to point at a not-yet-existing file
  --skip-pull         Update the current checkout without pulling
  --skip-install      Skip npm install/ci
  --skip-check        Skip lint, typecheck, and tests
  --skip-backup       Skip SQLite database backup
  --skip-build        Skip API and Web production builds
  --skip-restart      Skip PM2 start/reload, save, and health checks
  --skip-health-check Skip post-restart API and Web health checks
  --help              Show this help

--allow-dirty does not overwrite changes or resolve pull conflicts.
--skip-* options are intended for recovery and deliberate partial updates.
`);
}

function validateArgs() {
  const unknown = rawArgs.filter((arg) => !supportedArgs.has(arg));
  if (unknown.length === 0) return;

  console.error(`Unknown update option${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`);
  console.error("Run `npm run update -- --help` for supported options.");
  process.exit(2);
}

validateArgs();
if (args.has("--help")) {
  printHelp();
  process.exit(0);
}

function section(title) {
  console.log(`\n==> ${title}`);
}

function run(command, commandArgs, options = {}) {
  console.log(`$ ${[command, ...commandArgs].join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? "unknown"}`);
  }
}

function capture(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    shell: false,
  });
  if (result.error || result.status !== 0) return "";
  return result.stdout.trim();
}

function ensureRepositoryRoot() {
  const required = [".git", "package.json", "ecosystem.config.cjs", "prisma/schema.prisma"];
  const missing = required.filter((item) => !existsSync(item));
  if (missing.length > 0) {
    throw new Error(`Run this command from the repository root. Missing: ${missing.join(", ")}`);
  }
}

function ensureCleanWorktree() {
  if (args.has("--allow-dirty")) {
    console.log("Warning: allowing tracked local changes; Git may still refuse conflicting pulls.");
    return;
  }
  const status = capture("git", ["status", "--porcelain", "--untracked-files=no"]);
  if (!status) return;

  throw new Error(
    `Refusing to update because tracked files have local changes:\n${status}\n\n` +
      "Commit or stash them first. To keep non-conflicting changes deliberately, use --allow-dirty."
  );
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function acquireLock() {
  if (!existsSync(path.dirname(lockPath))) {
    throw new Error("Cannot create update lock because .git is missing.");
  }

  if (existsSync(lockPath)) {
    let existingPid = 0;
    try {
      existingPid = Number.parseInt(readFileSync(path.join(lockPath, "pid"), "utf8"), 10);
    } catch {
      // Treat an unreadable lock as stale and replace it below.
    }
    if (processIsRunning(existingPid)) {
      throw new Error(`Another update is already running with PID ${existingPid}.`);
    }
    console.log(`Removing stale update lock${existingPid ? ` for PID ${existingPid}` : ""}.`);
    rmSync(lockPath, { recursive: true, force: true });
  }

  mkdirSync(lockPath);
  writeFileSync(path.join(lockPath, "pid"), `${process.pid}\n`, { mode: 0o600 });
  lockAcquired = true;
}

function releaseLock() {
  if (!lockAcquired) return;
  rmSync(lockPath, { recursive: true, force: true });
  lockAcquired = false;
}

function requireDatabaseFile() {
  let dbPath;
  try {
    dbPath = databaseFilePath();
  } catch (error) {
    throw new Error(
      `无法解析 DATABASE_URL：${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!existsSync(dbPath)) {
    if (args.has("--allow-new-database")) {
      console.log(`Database file does not exist yet (allowed): ${dbPath}`);
      return dbPath;
    }
    throw new Error(
      `找不到数据库文件：${dbPath}\n` +
        "更新流程拒绝在没有备份源的情况下继续迁移（SQLite 会创建一个空库）。\n" +
        "如确认是全新安装，请使用 --allow-new-database；否则请先修正 DATABASE_URL。"
    );
  }

  return dbPath;
}

function backupSqlite(dbPath) {
  if (args.has("--skip-backup")) {
    console.log("Skipping database backup.");
    return;
  }

  if (!existsSync(dbPath)) {
    console.log("No SQLite database found to back up (--allow-new-database).");
    return;
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const backupDir = path.resolve("backups");
  const backupPath = path.join(backupDir, `${path.basename(dbPath)}.${stamp}.bak`);
  mkdirSync(backupDir, { recursive: true });
  run("node", ["apps/api/scripts/backup-sqlite.mjs", backupPath]);
  console.log(`Backed up database: ${backupPath}`);

  // 与 scripts/backup.mjs 的 BACKUP_KEEP 同一口径：只保留最新 10 份。
  // 每次更新都产生一份备份，不清理会无限增长（单机磁盘的主要慢性消耗）。
  const keep = Number.parseInt(process.env.BACKUP_KEEP || "10", 10) || 10;
  const existing = readdirSync(backupDir)
    .filter((name) => name.startsWith(path.basename(dbPath)) && name.endsWith(".bak"))
    .sort()
    .reverse();
  for (const stale of existing.slice(keep)) {
    rmSync(path.join(backupDir, stale), { force: true });
    console.log(`Pruned old backup: ${stale}`);
  }
}

function internalApiHealthUrl() {
  const base = process.env.API_INTERNAL_URL || "http://127.0.0.1:3002";
  return new URL("/health", base.endsWith("/") ? base : `${base}/`).toString();
}

async function waitForEndpoint(label, url, validate) {
  const attempts = 15;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "kpblog-update-health-check" },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (validate) await validate(response);
      console.log(`✓ ${label}: ${url}`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
  }

  throw new Error(`${label} did not become healthy: ${lastError?.message || lastError}`);
}

async function verifyServices() {
  await waitForEndpoint("API health", internalApiHealthUrl(), async (response) => {
    const payload = await response.json();
    if (payload?.success !== true || payload?.data?.status !== "ok") {
      throw new Error("unexpected API health payload");
    }
  });
  await waitForEndpoint("Web health", "http://127.0.0.1:3001/");
}

async function main() {
  section("Preflight");
  ensureRepositoryRoot();
  acquireLock();
  ensureCleanWorktree();
  const before = capture("git", ["rev-parse", "--short", "HEAD"]);
  console.log(`Current commit: ${before || "unknown"}`);

  if (args.has("--skip-pull")) {
    section("Pull latest code");
    console.log("Skipping Git pull; updating the current checkout.");
  } else {
    section("Pull latest code");
    run("git", ["pull", "--ff-only"]);
  }
  const after = capture("git", ["rev-parse", "--short", "HEAD"]);
  console.log(`Updated commit: ${after || "unknown"}`);

  if (args.has("--skip-install")) {
    section("Install dependencies");
    console.log("Skipping dependency installation.");
  } else {
    section("Install dependencies");
    if (existsSync("package-lock.json")) {
      run("npm", ["ci", "--include=dev", "--silent"]);
    } else {
      run("npm", ["install", "--include=dev", "--silent"]);
    }
  }

  section("Generate Prisma client");
  run("npx", ["prisma", "generate"]);

  // 清理 Next 的生成物再校验。
  //
  // 原因：apps/web/tsconfig.json 把 `.next/types/**/*.ts` 纳入编译范围，
  // 而这份类型是上一次构建按当时的文件树生成的。路由被删除后（例如本次上线的
  // gallery 与 admin/images），旧类型仍会去 import 已不存在的 page.ts，于是
  // typecheck 报 TS2307——而它跑在 build 之前，自己无法自愈。
  // 服务器上首次遇到，本地因为频繁重建而没有暴露。
  //
  // 只删生成物，不影响源码；构建会重新生成。
  //
  // 这里同时清理 API 的旧输出：`tsc` 不会删除已移除源文件对应的产物，
  // 而校验阶段（typecheck / tsx 脚本 / 冒烟）可能会把这个过期目录当成
  // 「当前产物」使用。真实案例：服务器上残留的 `dist/lib/phone.js` 还在
  // import 早已不存在的依赖，于是 `smoke:prod` 直接以模块找不到失败，
  // 报错指向一个本次上线根本没改的模块。
  // 清理不随 --skip-check 跳过：跳过校验的恢复路径恰恰是最可能带着
  // 陈旧产物运行的场景（真实事故：残留 dist/lib/phone.js 让 smoke:prod
  // 找不到模块）。删除过期目录本身开销极小、无副作用。
  for (const stale of ["apps/web/.next/types", "apps/web/.next/dev/types", "apps/api/dist"]) {
    if (existsSync(stale)) {
      rmSync(stale, { recursive: true, force: true });
      console.log(`Removed stale build output: ${stale}`);
    }
  }

  if (args.has("--skip-check")) {
    section("Validate workspace");
    console.log("Skipping lint, typecheck, and tests.");
  } else {
    section("Validate workspace");
    // 这里用 `check:ci` 而不是 `check`：`check` 的最后一步是 `npm run smoke`，
    // 它用 `next dev` 起一个实例。在服务器上 dev 模式要现编译页面（实测单页
    // ~7-8 秒），而冒烟里的交互断言（音乐面板、目录高亮、移动端目录抽屉）
    // 依赖水合完成——于是同一份代码在开发机上全绿、在服务器上稳定失败，
    // 而失败原因与待上线代码无关。上线路径应该校验**构建产物**：
    // `check:ci` 只做静态与单元校验，浏览器冒烟放到构建之后的 `smoke:prod`。
    run("npm", ["run", "check:ci"]);
  }

  // 在任何构建/迁移之前确认目标库真实存在。旧逻辑找不到库时直接 return，
  // 随后的 prisma migrate deploy 会创建空库并写入迁移，等于把线上数据
  // “搬”到一个新文件上。全新安装必须显式使用 --allow-new-database。
  const databaseFile = requireDatabaseFile();

  section("Backup database");
  backupSqlite(databaseFile);

  section("Apply database migrations");
  run("npx", ["prisma", "migrate", "deploy"]);

  if (args.has("--skip-build")) {
    section("Build app");
    console.log("Skipping API and Web production builds.");
  } else {
    section("Build app");
    // 过期的 API 产物已在「Validate workspace」之前清掉（见那里的注释），
    // 这里不再重复删除。
    run("npm", ["run", "build"]);

    // 对**构建产物**跑浏览器冒烟（CI 用的也是这一条）。dev 形态的冒烟留给
    // 本地开发：服务器上它既慢又依赖水合时序。
    section("Smoke check (production build)");
    run("npm", ["run", "smoke:prod"]);
  }

  if (args.has("--skip-restart")) {
    section("Restart services");
    console.log("Skipping PM2 restart, process-list save, and health checks.");
  } else {
    section("Restart services");
    run("pm2", ["startOrReload", "ecosystem.config.cjs", "--update-env"]);
    run("pm2", ["save"]);

    if (args.has("--skip-health-check")) {
      section("Verify services");
      console.log("Skipping post-restart API and Web health checks.");
    } else {
      section("Verify services");
      await verifyServices();
    }
  }

  section("Done");
  console.log(`Update finished successfully at commit ${after || "unknown"}.`);
}

try {
  await main();
} catch (error) {
  console.error(`\nUpdate failed: ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  releaseLock();
}
