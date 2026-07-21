#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));

function printHelp() {
  console.log(`Usage: npm run update -- [options]

Options:
  --allow-dirty    Allow tracked local changes before pulling
  --skip-backup    Skip SQLite database backup
  --skip-install   Skip npm install/ci
  --skip-build     Skip API and Web production builds
  --skip-restart   Skip PM2 start/reload
  --help           Show this help

`);
}

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
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function capture(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) return "";
  return result.stdout.trim();
}

function ensureCleanWorktree() {
  if (args.has("--allow-dirty")) return;
  const status = capture("git", ["status", "--porcelain", "--untracked-files=no"]);
  if (!status) return;

  console.error("Refusing to update because tracked files have local changes:");
  console.error(status);
  console.error("\nCommit, stash, or discard them first. To override: npm run update -- --allow-dirty");
  process.exit(1);
}

function sqlitePathFromEnv() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.startsWith("file:")) return null;

  const rawPath = databaseUrl.slice("file:".length);
  if (path.isAbsolute(rawPath)) return rawPath;

  const candidates = [
    path.resolve(rawPath),
    path.resolve("prisma", rawPath),
  ];
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

section("Preflight");
ensureCleanWorktree();
const before = capture("git", ["rev-parse", "--short", "HEAD"]);
console.log(`Current commit: ${before || "unknown"}`);

section("Pull latest code");
run("git", ["pull", "--ff-only"]);
const after = capture("git", ["rev-parse", "--short", "HEAD"]);
console.log(`Updated commit: ${after || "unknown"}`);

if (!args.has("--skip-install")) {
  section("Install dependencies");
  if (existsSync("package-lock.json")) {
    run("npm", ["ci", "--include=dev", "--silent"]);
  } else {
    run("npm", ["install", "--include=dev", "--silent"]);
  }
}

section("Generate Prisma client");
run("npx", ["prisma", "generate"]);

section("Backup database");
backupSqlite();

section("Apply database migrations");
run("npx", ["prisma", "migrate", "deploy"]);

if (!args.has("--skip-build")) {
  section("Build app");
  run("npm", ["run", "build"]);
}

if (!args.has("--skip-restart")) {
  section("Start or reload API and Web processes");
  run("pm2", ["startOrReload", "ecosystem.config.cjs", "--update-env"]);
}

section("Done");
console.log("Update finished successfully.");
