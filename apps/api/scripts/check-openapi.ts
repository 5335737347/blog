#!/usr/bin/env node
/**
 * 路由 ↔ OpenAPI 契约一致性校验：npm run check:openapi
 *
 * 为什么不是正则扫源码：正则只能看见「写法符合预期」的那些路由声明，一旦有人用
 * `app.route({...})` 或其它形式注册，校验会静默漏掉——那正是契约漂移最该被发现的时刻。
 * 这里改为真的把 app 建起来、读 Fastify 实际注册的路由表。
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
  const stack: { depth: number; path: string }[] = [];

  for (const line of tree.split("\n")) {
    const match = line.match(/^([\s│├└─]*)(\S.*)$/);
    if (!match) continue;

    const depth = Math.round(match[1].length / 4);
    const label = match[2].trim();
    // `* (OPTIONS)` 是 CORS 的兜底路由，不是业务端点。
    if (label.startsWith("*")) continue;

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1]?.path ?? "";

    const methodMatch = label.match(/\s*\(([^)]*)\)\s*$/);
    const segment = methodMatch ? label.slice(0, methodMatch.index).trim() : label;
    const fullPath = parent + segment;
    stack.push({ depth, path: fullPath });

    if (!methodMatch) continue;
    const methods = methodMatch[1]
      .split(",")
      .map((method) => method.trim().toUpperCase())
      .filter((method) => method && !IMPLICIT_METHODS.has(method));
    if (methods.length > 0) routes.set(fullPath, new Set(methods));
  }

  return routes;
}

/**
 * 解析 openapi.yaml 的 paths 与各路径下的 method。
 *
 * 这里刻意不引入 YAML 依赖：规范文件由本项目维护、格式固定，
 * 且解析结果会做「数量是否合理」的断言，格式跑偏时会直接报错而不是静默通过。
 */
function documentedRoutes(spec: string): Map<string, Set<string>> {
  const routes = new Map<string, Set<string>>();
  let current: string | null = null;

  for (const line of spec.split("\n")) {
    // 顶格的行（paths:、components: …）表示离开 paths 段。
    if (/^\S/.test(line)) {
      current = null;
      continue;
    }
    const pathMatch = line.match(/^ {2}(\/[^\s:]+):\s*$/);
    if (pathMatch) {
      current = pathMatch[1];
      routes.set(current, new Set());
      continue;
    }
    const methodMatch = line.match(/^ {4}(get|post|put|delete|patch|head|options):\s*$/);
    if (methodMatch && current) {
      routes.get(current)?.add(methodMatch[1].toUpperCase());
    }
  }

  return routes;
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
const documented = documentedRoutes(spec);

if (documented.size < 20) {
  console.error(
    `OpenAPI 解析结果只有 ${documented.size} 条路径，明显偏少——` +
      "docs/openapi.yaml 的结构可能变了，请更新 scripts/check-openapi.ts 的解析逻辑。"
  );
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
  console.error("接口契约与实现不一致：\n");
  for (const message of errors) console.error(`  • ${message}`);
  console.error("\n请同步 apps/api/src/routes 与 docs/openapi.yaml。");
  process.exit(1);
}

console.log(
  `接口契约一致（${actualByPath.size} 条路由，方法签名全部与 docs/openapi.yaml 对应）。`
);
process.exit(0);
