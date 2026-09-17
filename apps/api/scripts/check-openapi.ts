#!/usr/bin/env node
/**
 * 路由 ↔ OpenAPI 契约一致性校验：npm run check:openapi
 *
 * 为什么不是正则扫源码：正则只能看见「写法符合预期」的那些路由声明，一旦有人用
 * `app.route({...})` 或其它形式注册，校验会静默漏掉——那正是契约漂移最该被发现的时刻。
 * 这里改为真的把 app 建起来、读 Fastify 实际注册的路由表。
 *
 * 为什么契约侧也不用 `js-yaml`：仓库里唯一能解析 YAML 的库是传递依赖
 *（`js-yaml` 随 eslint 链路进来，且没有自带类型声明）。为一个检查脚本把它提升为
 * 直接依赖，等于把运行时安全问题（`js-yaml` 的公告在 `scripts/check-audit.mjs` 里
 * 是白名单接受的）搬成构建期安全问题。因此这里用一个只覆盖本项目契约文件子集的
 * 严格解析器：认识缩进、注释与引号键，并且**在同缩进层级上检测重复键**。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Fastify 会为每个 GET 自动加 HEAD；OPTIONS 是 CORS 预检。它们不该出现在契约里。 */
const IMPLICIT_METHODS = new Set(["HEAD", "OPTIONS"]);

/**
 * 解析 Fastify printRoutes 的树形输出。
 *
 * 形如：
 *   ├── /api/auth/password (PUT)
 *   │   └── /reset (POST)
 *   │       └── -code (POST)
 * 子节点的完整路径 = 父路径 + 子标签（子标签自带前导 `/`，或是 `-code` 这种续写片段），
 * 因此直接拼接即可。
 */
function registeredRoutes(tree: string): Map<string, Set<string>> {
  const routes = new Map<string, Set<string>>();
  /**
   * 已出现的树节点。
   *
   * 父子关系**不能**用「前缀更短」推断：`/api/auth/password` 的树枝前缀是 4 个字符，
   * 与它同级的 `/api/auth/register` 一样长，而它的子节点 `/reset` 的前缀是 8 个字符。
   * 用「前缀更短」找父节点会跳过同级的真父节点，得到 `/register` + `/reset` 这种错路径。
   * 因此这里按「第几层」记录（每个节点占一行，层级由树枝前缀长度决定）。
   */
  const nodes: { level: number; path: string }[] = [];
  const levels = new Map<number, string>();
  const seenPrefixes: number[] = [];

  for (const line of tree.split("\n")) {
    const match = line.match(/^([^\S\n]*[│├└─ ]*)(\S.*)$/);
    if (!match) continue;

    // 前缀长度相同 ⇒ 同一层；前缀出现过的不同长度 ⇒ 新的一层。
    const prefixLen = match[1].length;
    if (!seenPrefixes.includes(prefixLen)) {
      seenPrefixes.push(prefixLen);
      seenPrefixes.sort((a, b) => a - b);
    }
    const level = seenPrefixes.indexOf(prefixLen);

    const label = match[2].trim();
    // `* (OPTIONS)` 是 CORS 的兜底路由，不是业务端点。
    if (label.startsWith("*")) continue;

    // 一个节点可能同时列出多个方法，例如 `/api/comments (GET, HEAD, POST)`。
    // 之前只匹配单个方法，含逗号的行会被当成「没有方法的节点」而污染父子关系，
    // 结果只解析出一部分路由。
    const methodMatch = label.match(/^(.*?)\s*\(([A-Z, ]+)\)\s*$/);
    const rawPath = methodMatch ? methodMatch[1].trim() : label;
    const methods = methodMatch
      ? methodMatch[2].split(",").map((value) => value.trim()).filter(Boolean)
      : [];

    // 关键：标签总是**相对片段**，即使它以 `/` 开头也是相对父节点的
    //（`/api/music` 下面是 `/:id`，拼出来是 `/api/music/:id`）。
    // 以前写成「以 / 开头就当作绝对路径」，于是所有二级及更深的子路由都丢了父前缀：
    // `/reset`、`/:id`、`/adjacent` 全被当成顶层路径，契约校验随之失真。
    const parent = level > 0 ? (levels.get(level - 1) ?? "") : "";
    const fullPath = `${parent}${rawPath}`;

    levels.set(level, fullPath);
    nodes.push({ level, path: fullPath });

    for (const method of methods) {
      if (IMPLICIT_METHODS.has(method)) continue;
      const registered = routes.get(fullPath) ?? new Set<string>();
      registered.add(method);
      routes.set(fullPath, registered);
    }
  }

  return routes;
}

interface SpecRecord {
  line: number;
  key: string;
  indent: number;
}

/**
 * 取出每一行「键: …」记录，忽略注释与 `|`/`>` 块内容。
 *
 * 同时记录它**属于哪个父对象**。关键细节：YAML 的序列项（`- name: x`）会重置父级，
 * 否则同一序列里的第二个元素会被误判为第一个元素的子对象，从而产生
 * 「同一个映射里重复定义 type/enum」这类满屏误报。
 */
interface SpecRecord {
  line: number;
  key: string;
  indent: number;
  /** 该键所属父对象的完整路径（由 listId 组成的栈）。 */
  parent: string;
  /** 该键自身成为父对象后的路径。 */
  path: string;
  /** 序列项创建的新父对象 id；没有则为 null。 */
  listId: string | null;
}

function readRecords(spec: string): SpecRecord[] {
  const records: SpecRecord[] = [];
  const keyPattern = /^(\s*)(?:'([^']*)'|"([^"]*)"|([^:#][^:]*?))\s*:(?:\s|$)/;
  const stack: { indent: number; id: string }[] = [];
  let listCounter = 0;
  let currentListIndent: number | null = null;

  const parentPath = () => stack.map((entry) => entry.id).join("\u0000");

  for (const [index, rawLine] of spec.split("\n").entries()) {
    const uncommented = rawLine.replace(/\s+#.*$/, "");
    const trimmed = uncommented.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const indent = uncommented.length - uncommented.trimStart().length;

    if (trimmed.startsWith("- ")) {
      // 新序列项：并把这一项变成一个独立父对象，避免同一序列的第二个元素
      // 被当成第一个元素的子对象。
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
      listCounter += 1;
      const id = `list#${listCounter}`;
      stack.push({ indent, id });
      currentListIndent = indent;
      // 序列项本身也常带键，例如 `- name: postId`。
      const inline = trimmed.slice(2);
      const inlineMatch = inline.match(keyPattern);
      if (inlineMatch) {
        const key = (inlineMatch[2] ?? inlineMatch[3] ?? inlineMatch[4] ?? "").trim();
        if (key) {
          records.push({ line: index + 1, key, indent, parent: parentPath(), path: `${parentPath()}\u0000${key}`, listId: id });
        }
      }
      continue;
    }

    if (currentListIndent !== null && indent <= currentListIndent) {
      // 离开序列。
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
      currentListIndent = null;
    }
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();

    const match = uncommented.match(keyPattern);
    if (!match) continue;
    const key = (match[2] ?? match[3] ?? match[4] ?? "").trim();
    if (!key) continue;
    const parent = parentPath();
    records.push({ line: index + 1, key, indent, parent, path: `${parent}\u0000${key}`, listId: null });
    stack.push({ indent, id: key });
  }

  return records;
}

/**
 * 重复键检测：只有**同一个父对象**内重复才是错误。
 *
 * 这正是本次要修的问题：`docs/openapi.yaml` 曾经有两个顶层 `paths` 下的 `/health`
 * 键。严格 YAML 解析器直接抛 `duplicated mapping key`（整份契约无法被任何 OpenAPI
 * 工具加载），宽松解析器静默丢弃第一份，而原来逐行正则的版本两者都发现不了——
 * 还照样打印「接口契约一致（37 条路由…）」。
 *
 * 判断依据是父对象路径（`SpecRecord.parent`），不是缩进：不同父对象下的
 * `type`/`items`/`$ref` 缩进常常相同，只看缩进会满屏误报。
 */
function findDuplicateKeys(records: SpecRecord[]): string[] {
  const seen = new Map<string, SpecRecord>();
  const duplicates: string[] = [];
  for (const record of records) {
    const scoped = `${record.parent}\u0000${record.key}`;
    const previous = seen.get(scoped);
    if (previous) {
      duplicates.push(
        `第 ${previous.line} 行与第 ${record.line} 行在同一个映射（${record.parent || "<根>"}）里重复定义了键 "${record.key}"`
      );
    } else {
      seen.set(scoped, record);
    }
  }
  return duplicates;
}

/** Fastify 写 `:slug`，OpenAPI 写 `{slug}`；两者是同一件事。 */
function normalize(target: string): string {
  return target.replace(/:([A-Za-z0-9_]+)/g, "{$1}").replace(/\/+$/, "") || "/";
}

const app = buildApp();
await app.ready();
const actual = registeredRoutes(app.printRoutes({ commonPrefix: false }));
await app.close();

const spec = readFileSync(path.join(repoRoot, "docs/openapi.yaml"), "utf8");
const records = readRecords(spec);

const duplicates = findDuplicateKeys(records);
if (duplicates.length > 0) {
  console.error("docs/openapi.yaml 存在重复键（严格 YAML 解析器会直接拒绝整份文件）：");
  for (const duplicate of duplicates) console.error(`  - ${duplicate}`);
  process.exit(1);
}

const pathsLine = records.find((record) => record.key === "paths" && record.parent === "");
if (!pathsLine) {
  console.error("docs/openapi.yaml 缺少顶层 paths 段。");
  process.exit(1);
}

const documented = new Map<string, Set<string>>();
let currentPath: string | null = null;
for (const record of records) {
  if (record.line <= pathsLine.line) continue;
  if (record.parent === "") break; // 回到顶层：paths 段结束。

  if (record.parent === "paths" && record.key.startsWith("/")) {
    currentPath = record.key;
    documented.set(currentPath, new Set());
    continue;
  }
  if (currentPath && record.parent === `paths\u0000${currentPath}`) {
    const method = record.key.toUpperCase();
    if (["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"].includes(method)) {
      documented.get(currentPath)?.add(method);
    }
  }
}

if (documented.size < 20) {
  console.error(
    `OpenAPI 解析结果只有 ${documented.size} 条路径，明显偏少——` +
      "docs/openapi.yaml 的结构可能变了，请更新 scripts/check-openapi.ts 的解析逻辑。"
  );
  process.exit(1);
}

const withoutMethods = [...documented].filter(([, methods]) => methods.size === 0).map(([route]) => route);
if (withoutMethods.length > 0) {
  console.error(`以下路径没有记录任何 HTTP 方法：\n  ${withoutMethods.join("\n  ")}`);
  process.exit(1);
}

const actualByPath = new Map([...actual].map(([route, methods]) => [normalize(route), methods]));
const documentedByPath = new Map(
  [...documented].map(([route, methods]) => [normalize(route), methods])
);

const errors: string[] = [];

for (const [route, methods] of actualByPath) {
  const specMethods = documentedByPath.get(route);
  if (!specMethods) {
    errors.push(`路由已实现但 OpenAPI 未记录：${route}（${[...methods].join(", ")}）`);
    continue;
  }
  const missing = [...methods].filter((method) => !specMethods.has(method));
  if (missing.length > 0) {
    errors.push(`${route} 的 ${missing.join(", ")} 未记录在 OpenAPI（已记录：${[...specMethods].join(", ")}）`);
  }
}

for (const [route, methods] of documentedByPath) {
  const actualMethods = actualByPath.get(route);
  if (!actualMethods) {
    errors.push(`OpenAPI 记录了不存在的路由：${route}`);
    continue;
  }
  const extra = [...methods].filter((method) => !actualMethods.has(method));
  if (extra.length > 0) {
    errors.push(`${route} 文档里写了 ${extra.join(", ")}，但代码里没有对应实现`);
  }
}

if (errors.length > 0) {
  console.error("接口契约不一致：");
  for (const error of errors) console.error(`  - ${error}`);
  console.error("\n请同步 apps/api/src/routes 与 docs/openapi.yaml。");
  process.exit(1);
}

console.log(
  `接口契约一致（${actualByPath.size} 条路由，方法签名全部与 docs/openapi.yaml 对应）。`
);
