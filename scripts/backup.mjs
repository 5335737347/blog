#!/usr/bin/env node
/**
 * 备份编排。
 *
 *   npm run db:backup      SQLite 快照（小、变动频繁，适合高频率 cron）
 *   npm run media:backup   媒体目录快照（大、变动少，适合低频 cron）
 *
 * apps/api/scripts/backup-sqlite.mjs 只负责「给定绝对路径，导出一份一致性快照」，
 * 不关心放哪、留几份。这里补上编排：算路径、带时间戳、备份后清理旧文件。
 *
 * 为什么数据库和媒体分成两条命令：数据库几 MB 且每次发布都变，媒体几十上百 MB
 * 但很少变。混在一起要么让高频备份变得昂贵，要么让媒体备份频率过低。
 */
import { spawn } from "node:child_process";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  databaseFilePath,
  loadProjectEnv,
  mediaRootPath,
  repositoryRoot as repoRoot,
} from "./load-env.mjs";

loadProjectEnv();

const backupDir = path.join(repoRoot, "backups");
const databaseFile = databaseFilePath;
const mediaRoot = mediaRootPath;

function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * 保留份数。
 *
 * 注意这里刻意用静态的点号读取而不是方括号取变量名：scripts/check-docs.mjs
 * 靠正则核对每个变量都写进了 .env.example，动态取值会让它看不见，
 * 等于把这道门禁悄悄关掉（这个坑真踩过一次）。
 */
function parseKeep(raw, label, fallback) {
  const value = raw === undefined || raw.trim() === "" ? fallback : Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} 必须是正整数。`);
  }
  return value;
}

function runBackupScript(destination) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, "apps/api/scripts/backup-sqlite.mjs"), destination],
      { stdio: "inherit", env: process.env, cwd: repoRoot }
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`备份脚本退出码 ${code}`))
    );
  });
}

/** 时间戳目录名，用于识别可清理的媒体快照。 */
const TIMESTAMP_NAME = /^\d{8}-\d{6}$/;

/** 只保留最新的 N 份；备份占满磁盘会连数据库一起写坏。 */
async function prune(directory, matches, keep) {
  const candidates = (await readdir(directory)).filter(matches);
  // 名字里带 YYYYMMDD-HHMMSS，字典序即时间序，不必再 stat。
  candidates.sort((a, b) => b.localeCompare(a));
  const stale = candidates.slice(keep);
  for (const name of stale) {
    await rm(path.join(directory, name), { recursive: true, force: true });
  }
  return stale;
}

function relative(target) {
  return path.relative(repoRoot, target);
}

async function backupDatabase() {
  const source = databaseFile();
  if (!existsSync(source)) {
    throw new Error(`找不到数据库文件：${source}`);
  }
  await mkdir(backupDir, { recursive: true });

  const destination = path.join(backupDir, `dev.db.${timestamp()}.bak`);
  if (existsSync(destination)) {
    throw new Error(`备份目标已存在，请稍后重试：${destination}`);
  }
  await runBackupScript(destination);

  const keep = parseKeep(process.env.BACKUP_KEEP, "BACKUP_KEEP", 10);
  const removed = await prune(
    backupDir,
    (name) => name.startsWith("dev.db.") && name.endsWith(".bak"),
    keep
  );

  console.log(`[backup] 数据库 ${relative(source)} → ${relative(destination)}`);
  console.log(`[backup] 保留最新 ${keep} 份${removed.length ? `，清理：${removed.join(", ")}` : ""}`);
}

async function backupMedia() {
  const source = mediaRoot();
  if (!existsSync(source)) {
    throw new Error(`找不到媒体目录：${source}`);
  }

  const target = path.join(backupDir, "media");
  await mkdir(target, { recursive: true });

  const destination = path.join(target, timestamp());
  if (existsSync(destination)) {
    throw new Error(`备份目标已存在，请稍后重试：${destination}`);
  }

  // cp 而非 rsync：不引入外部依赖，且 Node 20.19+ 的 fs.cp 已足够。
  await cp(source, destination, { recursive: true, preserveTimestamps: true });

  const keep = parseKeep(process.env.MEDIA_BACKUP_KEEP, "MEDIA_BACKUP_KEEP", 3);
  const removed = await prune(target, (name) => TIMESTAMP_NAME.test(name), keep);

  console.log(`[backup] 媒体 ${relative(source)} → ${relative(destination)}`);
  console.log(`[backup] 保留最新 ${keep} 份${removed.length ? `，清理：${removed.join(", ")}` : ""}`);
}

const mode = process.argv[2] ?? "db";

try {
  switch (mode) {
    case "db":
      await backupDatabase();
      break;
    case "media":
      await backupMedia();
      break;
    default:
      throw new Error(`未知的备份类型：${mode}（可用：db、media）`);
  }
} catch (error) {
  // 配置缺失或磁盘问题属于用户可自行修复的错误，一行说明比堆栈有用。
  console.error(`[backup] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
