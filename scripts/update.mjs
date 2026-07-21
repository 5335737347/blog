#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const supportedArgs = new Set([
  "--allow-dirty",
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

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

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

function sqlitePathFromEnv() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.startsWith("file:")) return null;

  const rawPath = databaseUrl.slice("file:".length);
  if (path.isAbsolute(rawPath)) return rawPath;

  const candidates = [path.resolve(rawPath), path.resolve("prisma", rawPath)];
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

function backupSqlite() {
  if (args.has("--skip-backup")) {
    console.log("Skipping database backup.");
    return;
  }

  const dbPath = sqlitePathFromEnv();
  if (!dbPath || !existsSync(dbPath)) {
    console.log("No SQLite database found to back up.");
    return;
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const backupDir = path.resolve("backups");
  const backupPath = path.join(backupDir, `${path.basename(dbPath)}.${stamp}.bak`);
  mkdirSync(backupDir, { recursive: true });
  copyFileSync(dbPath, backupPath);
  console.log(`Backed up database: ${backupPath}`);
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

  if (args.has("--skip-check")) {
    section("Validate workspace");
    console.log("Skipping lint, typecheck, and tests.");
  } else {
    section("Validate workspace");
    run("npm", ["run", "check"]);
  }

  section("Backup database");
  backupSqlite();

  section("Apply database migrations");
  run("npx", ["prisma", "migrate", "deploy"]);

  if (args.has("--skip-build")) {
    section("Build app");
    console.log("Skipping API and Web production builds.");
  } else {
    section("Build app");
    run("npm", ["run", "build"]);
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
