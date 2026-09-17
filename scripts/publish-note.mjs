#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadProjectEnv } from "./load-env.mjs";

// 环境加载统一走 scripts/load-env.mjs（此前这里有一份手写正则解析器，
// 与 dotenv 在行内注释、export 前缀和转义上的行为都不一致）。
loadProjectEnv();

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const apiUrlArg = args.find((arg) => arg.startsWith("--url="));
const apiUrl = apiUrlArg?.slice("--url=".length) || process.env.KPBLOG_API_URL;
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

// 不回落到本机地址：静默把内容发到 localhost 比直接失败更难排查。
if (!apiUrl) {
  console.error("缺少 KPBLOG_API_URL。请在 .env.local 中设置，例如：");
  console.error('  KPBLOG_API_URL="https://kpblog.cc/api/publish"');
  console.error("或使用 --url=https://kpblog.cc/api/publish 显式指定。");
  process.exit(1);
}

let parsedApiUrl;
try {
  parsedApiUrl = new URL(apiUrl);
} catch {
  console.error(`KPBLOG_API_URL 不是合法 URL: ${apiUrl}`);
  process.exit(1);
}
if (parsedApiUrl.protocol !== "https:" && parsedApiUrl.hostname !== "127.0.0.1" && parsedApiUrl.hostname !== "localhost") {
  console.error(`KPBLOG_API_URL 必须使用 https（当前 ${parsedApiUrl.protocol}//）：${apiUrl}`);
  process.exit(1);
}
if (process.env.NODE_ENV === "production" && (parsedApiUrl.hostname === "127.0.0.1" || parsedApiUrl.hostname === "localhost")) {
  console.error(`生产环境下 KPBLOG_API_URL 不应指向本机: ${apiUrl}`);
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

const payload = await response.json().catch(() => ({}));
if (!response.ok || payload.success === false) {
  console.error(`发布失败: ${response.status}`);
  console.error(JSON.stringify(payload.error || payload, null, 2));
  process.exit(1);
}

const data = payload.success === true ? payload.data : payload;
console.log(`已提交: ${path.basename(file)}`);
console.log(JSON.stringify(data, null, 2));
