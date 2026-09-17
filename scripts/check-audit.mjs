#!/usr/bin/env node
/**
 * 依赖审计门禁：npm run check:audit
 *
 * 背景：CI 原先把 package.json + package-lock.json 复制到临时目录，再
 * `npm ci --omit=dev` 然后 audit。但根包的生产依赖数是 0，workspaces 目录
 * （apps/、packages/）又没有一起复制过去——于是那棵树里一个包都没有，
 * `npm audit` 恒定输出 "found 0 vulnerabilities" 并退出 0。
 * 门禁看起来在运行，实际什么都没检查；这比红色的门禁更危险。
 *
 * 现在改为审计**真实**依赖树（在仓库内跑 --omit=dev 会包含各 workspace 的
 * 生产依赖），并对确实不可达的上游公告使用显式白名单。
 *
 * 白名单的设计要点：每条例外都必须声明「这个包不该出现在哪里」，脚本会去核对。
 * 一旦假设失效（例如有人改用 MySQL，mysql2 真的被编译进产物），例外自动作废、
 * 门禁报错。列在名单外的任何新公告同样直接报错。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 已接受的上游公告。
 *
 * 全部来自 Prisma 7 的打包：它的 CLI（`prisma`）是 `@prisma/client` 的生产依赖，
 * 而 CLI 又拖进 MySQL 连接器 `mysql2` 与配置合并库 `deepmerge-ts`。
 * 本项目只用 SQLite（@prisma/adapter-better-sqlite3），这两者在运行时都不会被加载。
 * 上游目前均无修复版本。
 */
const ACCEPTED = [
  {
    id: "GHSA-ggr8-5vv4-36mx",
    package: "deepmerge-ts",
    reason:
      "Prisma CLI 解析 prisma.config.ts 时用于合并配置对象；本项目配置是静态字面量，不存在递归对象图，且 CLI 不参与运行时。",
    forbiddenIn: ["apps/api/dist", "apps/api/src"],
  },
  {
    id: "GHSA-3f6p-5ww8-9rcr",
    package: "mysql2",
    reason:
      "Prisma 的 MySQL 连接器。本项目只用 SQLite，运行时不加载 mysql2。若将来改用 MySQL，本条必须删除。",
    forbiddenIn: ["apps/api/dist", "apps/api/src"],
  },
  {
    id: "GHSA-rgwj-5xj2-c3m3",
    package: "mysql2",
    reason: "同上：MySQL 协议处理器，SQLite 部署下不可达。",
    forbiddenIn: ["apps/api/dist", "apps/api/src"],
  },
];

/** 递归找出目录下所有文件的文本内容里是否出现「导入该包」的写法。 */
function importsPackage(directory, packageName) {
  const pattern = new RegExp(`(?:from|require\\()\\s*["']${packageName}(?:/[^"']*)?["']`);
  const hits = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        walk(full);
      } else if (/\.(?:[cm]?js|ts|tsx)$/.test(entry.name)) {
        if (pattern.test(readFileSync(full, "utf8"))) hits.push(path.relative(repoRoot, full));
      }
    }
  };
  if (existsSync(directory) && statSync(directory).isDirectory()) walk(directory);
  return hits;
}

function auditProductionTree() {
  const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (!result.stdout?.trim()) {
    throw new Error(
      `npm audit 没有输出（退出码 ${result.status}）。${
        result.error ? result.error.message : "检查网络或 npm 配置。"
      }`
    );
  }
  return JSON.parse(result.stdout);
}

const report = auditProductionTree();
const found = new Map();
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via ?? []) {
    if (typeof via !== "object" || !via.url) continue;
    const id = via.url.split("/").pop();
    found.set(id, { package: via.name, severity: via.severity, title: via.title });
  }
}

const acceptedIds = new Set(ACCEPTED.map((entry) => entry.id));
const errors = [];

// 1) 名单外的新公告：一律拦截。
for (const [id, info] of found) {
  if (acceptedIds.has(id)) continue;
  errors.push(
    `未接受的依赖公告 ${id}（${info.package}，${info.severity}）：${info.title}\n` +
      `    升级依赖，或在 scripts/check-audit.mjs 中补充带理由的例外。`
  );
}

// 2) 已修复/已消失的公告：白名单过期同样要处理，否则名单会烂掉。
for (const entry of ACCEPTED) {
  if (found.has(entry.id)) continue;
  errors.push(
    `白名单已过期：${entry.id}（${entry.package}）不再是漏洞。\n` +
      `    请从 scripts/check-audit.mjs 的 ACCEPTED 中删除这一条。`
  );
}

// 3) 可达性自检：例外的前提是「这个包不会进入运行时」。
//    如果它真的被我们的代码导入了，前提就不成立，例外立即作废。
for (const entry of ACCEPTED) {
  for (const directory of entry.forbiddenIn) {
    const hits = importsPackage(path.join(repoRoot, directory), entry.package);
    if (hits.length > 0) {
      errors.push(
        `${entry.id} 的例外前提已失效：${entry.package} 出现在 ${hits.join(", ")}。\n` +
          `    它不再「运行时不可达」，必须真正处理这个漏洞，而不是继续豁免。`
      );
    }
  }
}

// 4) 正面断言：SQLite 适配器仍在。上面所有例外的共同前提是「本项目只用 SQLite」。
const apiPackage = JSON.parse(
  readFileSync(path.join(repoRoot, "apps/api/package.json"), "utf8")
);
if (!apiPackage.dependencies?.["@prisma/adapter-better-sqlite3"]) {
  errors.push(
    "apps/api 不再依赖 @prisma/adapter-better-sqlite3：所有 mysql2 例外的前提（只用 SQLite）已不成立。"
  );
}

if (errors.length > 0) {
  console.error("依赖审计未通过：\n");
  for (const message of errors) console.error(`  • ${message}`);
  console.error("");
  process.exit(1);
}

console.log(
  `依赖审计通过（生产树 ${found.size} 条已知公告，全部为运行时不可达的 Prisma 工具链依赖，` +
    `已核对 ${ACCEPTED.length} 条例外的不可达前提）。`
);
