#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

async function loadEnvFile(file) {
  try {
    const text = await readFile(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // Env files are optional; shell-provided variables still work.
  }
}

await loadEnvFile(".env.local");
await loadEnvFile(".env");

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const apiUrlArg = args.find((arg) => arg.startsWith("--url="));
const apiUrl = apiUrlArg?.slice("--url=".length) || process.env.KPBLOG_API_URL || "http://localhost:3000/api/publish";
const apiKey = process.env.KPBLOG_API_KEY;
const forceDraft = args.includes("--draft") || process.env.KPBLOG_PUBLISH_MODE === "draft";
const forcePublish = args.includes("--publish") || process.env.KPBLOG_PUBLISH_MODE === "publish";

if (!file) {
  console.error("用法: npm run publish:draft -- content/drafts/example.md");
  console.error("或:   KPBLOG_API_KEY=... npm run publish:post -- path/to/note.md --url=https://kpblog.cc/api/publish");
  process.exit(1);
}

if (!apiKey) {
  console.error("缺少 KPBLOG_API_KEY。请先设置环境变量，不要把 API Key 写进脚本。");
  process.exit(1);
}

const content = await readFile(file, "utf8");
const body = { content };
if (forceDraft) body.published = false;
if (forcePublish) body.published = true;

const response = await fetch(apiUrl, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const data = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(`发布失败: ${response.status}`);
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log(`已提交: ${path.basename(file)}`);
console.log(JSON.stringify(data, null, 2));
