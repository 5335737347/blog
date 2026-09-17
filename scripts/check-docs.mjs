#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const ignoredDirectories = new Set([".git", ".next", "coverage", "dist", "node_modules"]);
const markdownRoots = [
  "README.md",
  "docs",
  "apps",
  "packages",
];
const sourceRoots = ["apps", "packages", "prisma", "scripts"];
const sourceExtensions = new Set([".cjs", ".js", ".mjs", ".ts", ".tsx"]);

// 行内代码中形如 `<root>/...<ext>` 的引用被当作仓库路径校验。
const referencedPathRoots = ["apps/", "packages/", "prisma/", "scripts/", "docs/"];
const referencedPathExtensions = new Set([
  ".cjs", ".js", ".mjs", ".md", ".prisma", ".sql", ".ts", ".tsx", ".yaml",
]);

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * 按空行切分 Markdown 段落，保留每段起始行号。
 * 用于让 check-docs:allow-missing-path 这类标注以「段落」为作用域，
 * 而不是强迫作者把注释挤在出问题的那一行末尾。
 */
function markdownBlocks(content) {
  const lines = content.split("\n");
  const blocks = [];
  let current = null;
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") {
      current = null;
      continue;
    }
    if (!current) {
      current = { startLine: index + 1, lines: [], text: "" };
      blocks.push(current);
    }
    current.lines.push(line);
    current.text += `${line}\n`;
  }
  return blocks;
}

async function collectFiles(target, predicate) {
  const absolute = path.join(repositoryRoot, target);
  const targetStat = await stat(absolute);
  if (targetStat.isFile()) return predicate(absolute) ? [absolute] : [];

  const files = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const relative = path.join(target, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(relative, predicate));
    } else if (predicate(path.join(repositoryRoot, relative))) {
      files.push(path.join(repositoryRoot, relative));
    }
  }
  return files;
}

const markdownFiles = (
  await Promise.all(markdownRoots.map((target) => collectFiles(target, (file) => file.endsWith(".md"))))
).flat();
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const rootScripts = new Set(Object.keys(packageJson.scripts || {}));
const errors = [];
const indexedDocs = new Set();

for (const file of markdownFiles) {
  const relativeFile = path.relative(repositoryRoot, file);
  const content = await readFile(file, "utf8");
  const linkPattern = /!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

  for (const match of content.matchAll(linkPattern)) {
    let target = match[1].replace(/^<|>$/g, "");
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) continue;
    target = decodeURIComponent(target.split("#", 1)[0].split("?", 1)[0]);
    if (!target) continue;

    const resolved = path.resolve(path.dirname(file), target);
    if (resolved !== repositoryRoot && !resolved.startsWith(`${repositoryRoot}${path.sep}`)) {
      errors.push(`${relativeFile}: local link escapes the repository ${match[1]}`);
      continue;
    }
    if (!await exists(resolved)) {
      errors.push(`${relativeFile}: broken local link ${match[1]}`);
    }
    if (relativeFile === "docs/README.md") {
      indexedDocs.add(path.relative(path.join(repositoryRoot, "docs"), resolved));
    }
  }

  for (const match of content.matchAll(/\bnpm run ([a-zA-Z0-9:_-]+)/g)) {
    if (!rootScripts.has(match[1])) {
      errors.push(`${relativeFile}: unknown root npm script ${match[1]}`);
    }
  }

  // 行内代码里的仓库路径此前没有任何检查：Markdown 链接有 linkPattern 兜底，
  // 但 `apps/web/src/config/profile.ts` 这种行内引用在文件被删除后会静默指向
  // 不存在的路径（`.codex/project-memory.md` 就以此方式在四处失效了很久）。
  // 确需引用已删除文件做历史说明时，在该段落内任意位置加 check-docs:allow-missing-path。
  for (const block of markdownBlocks(content)) {
    if (block.text.includes("check-docs:allow-missing-path")) continue;
    for (const [index, line] of block.lines.entries()) {
      for (const match of line.matchAll(/`([^`\n]+)`/g)) {
        const candidate = match[1].trim();
        if (!referencedPathExtensions.has(path.extname(candidate))) continue;
        if (!referencedPathRoots.some((root) => candidate.startsWith(root))) continue;
        if (/[*<>|\s]/.test(candidate)) continue;
        if (!await exists(path.join(repositoryRoot, candidate))) {
          errors.push(
            `${relativeFile}:${block.startLine + index}: inline code references a missing path ${candidate}`
          );
        }
      }
    }
  }
}

const formalDocs = await collectFiles("docs", (file) => file.endsWith(".md"));
for (const file of formalDocs) {
  const relative = path.relative(path.join(repositoryRoot, "docs"), file);
  if (relative !== "README.md" && !indexedDocs.has(relative)) {
    errors.push(`docs/README.md: missing documentation index entry for ${relative}`);
  }
}

const envTemplate = await readFile(path.join(repositoryRoot, ".env.example"), "utf8");
const documentedEnv = new Set(
  [...envTemplate.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1])
);
const sourceFiles = (
  await Promise.all(sourceRoots.map((target) => collectFiles(
    target,
    (file) => sourceExtensions.has(path.extname(file))
  )))
).flat();
for (const extra of ["ecosystem.config.cjs", "apps/web/next.config.ts"]) {
  const absolute = path.join(repositoryRoot, extra);
  if (!sourceFiles.includes(absolute)) sourceFiles.push(absolute);
}

// 由运行时/框架注入、不是本项目配置项的环境变量，不应要求写进 .env.example：
// 文档要求用户去配置它们反而是错的。
const runtimeProvidedEnv = new Set([
  "NODE_ENV", // 由 Node / Next / PM2 设置
  "NEXT_PHASE", // next build / next start 注入
  "NEXT_RUNTIME", // Next 注入（nodejs / edge）
  "NEXT_PUBLIC_VERCEL_ENV", // 托管平台注入
  "VERCEL_ENV",
  "HOME", // 由操作系统提供；冒烟脚本用它定位 Playwright 的浏览器缓存
  // 以下都是按次调用的脚本开关，不是部署配置。
  // 写进 .env.example 会让用户以为必须配置它们，所以登记为运行时提供：
  "BASE_URL", // smoke-web.mjs：指向已在运行的服务
  "CHROME_BIN", // smoke-web.mjs：显式指定浏览器
  "CDP_PORT", // smoke-web.mjs：调试端口，避免与其它实例冲突
  "NEXT_DIST_DIR", // 冒烟实例的独立构建目录（Next 16 不允许共用 .next）
  "SMOKE_API_PORT",
  "SMOKE_WEB_PORT",
  "SMOKE_TIMEOUT_MS",
  "SMOKE_SEEDED",
  "SMOKE_SEED_DATABASE_URL",
  "SMOKE_VERBOSE",
  "SMOKE_IGNORE_PORT_CHECK",
]);

const usedEnv = new Set();
/** 存在动态 process.env 读取的文件：这份文件里的变量名门禁核对不到。 */
const dynamicEnvFiles = new Set();

for (const file of sourceFiles) {
  // 跳过检查器自身：它源码里含有 "process.env.NAME" 这类示例文案，
  // 否则会把自己文本里的字面量当成真实用量。
  if (file === path.join(repositoryRoot, "scripts/check-docs.mjs")) continue;

  const relativeFile = path.relative(repositoryRoot, file);
  const content = await readFile(file, "utf8");

  for (const match of content.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
    usedEnv.add(match[1]);
  }
  // 字面量方括号访问同样是静态可分析的，一并计入。
  for (const match of content.matchAll(/process\.env\[\s*["']([A-Z][A-Z0-9_]+)["']\s*\]/g)) {
    usedEnv.add(match[1]);
  }
  // 非字面量方括号访问（主要是「把 .env 文件读进 process.env」的解析器和测试里的
  // 清理循环）本身是合理的，但它会让上面的核对漏掉变量——实际发生过：
  // 把 process.env.BACKUP_KEEP 重构成 parseKeep("BACKUP_KEEP") 之后该变量就消失了。
  // 无法自动区分「合理的动态读取」和「藏起来的硬编码名字」，所以不报错，
  // 只在结尾汇总提示，让新增的动态读取至少能被看见。
  for (const match of content.matchAll(/process\.env\s*\[\s*(?!["'])/g)) {
    void match;
    dynamicEnvFiles.add(relativeFile);
  }
}
for (const name of runtimeProvidedEnv) {
  usedEnv.delete(name);
}
for (const name of [...usedEnv].sort()) {
  if (!documentedEnv.has(name)) {
    errors.push(`.env.example: missing source environment variable ${name}`);
  }
}

// 环境加载必须只有一处实现。
//
// 这段逻辑曾经散在 8 个文件里，分成两套互不兼容的实现（dotenv 与一份手写正则
// 解析器），在「行内注释、export 前缀、转义、相对哪个目录找文件」上行为都不同；
// 再加上三套各自为政的 DATABASE_URL 归一化，直接导致过
// 「prisma migrate 改一个库、API 读另一个库」这种静默分叉。
const ENV_LOADER = "scripts/load-env.mjs";
for (const file of sourceFiles) {
  const relativeFile = path.relative(repositoryRoot, file);
  if (relativeFile === ENV_LOADER) continue;
  const content = await readFile(file, "utf8");
  if (/from\s+["']dotenv["']|require\(\s*["']dotenv["']\s*\)|["']dotenv\/config["']/.test(content)) {
    errors.push(
      `${relativeFile}: 不要直接依赖 dotenv，请统一走 ${ENV_LOADER} 的 loadProjectEnv()`
    );
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Documentation checks passed (${markdownFiles.length} Markdown files, ${formalDocs.length - 1} indexed docs, ${usedEnv.size} environment variables).`
);
if (dynamicEnvFiles.size > 0) {
  console.log(
    `Note: ${dynamicEnvFiles.size} file(s) read process.env dynamically, so their variable names ` +
      `cannot be verified against .env.example: ${[...dynamicEnvFiles].sort().join(", ")}`
  );
}
