import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * `/health` 上报的版本必须与 package.json 一致。
 *
 * 这个数字是判断「线上到底跑的是哪一版」的依据，而它此前是写死的常量
 *（`health-service.ts` 的 `API_VERSION`），没有任何机制保证它跟着版本走：
 * 一旦 package.json 升到 0.2.0 而常量没改，/health 会继续报 0.1.0，
 * 运维据此判断部署状态就会得出错误结论。
 *
 * 这里不去 import JSON（生产构建的产物布局与源码不同），而是直接读文件比对：
 * 版本号只有一处声明，测试负责把它钉住。
 */
test("the API health version matches package.json", async () => {
  const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
  const apiPackage = JSON.parse(
    readFileSync(path.join(repositoryRoot, "apps/api/package.json"), "utf8")
  ) as { version: string };

  const source = readFileSync(
    path.join(repositoryRoot, "apps/api/src/server/health/health-service.ts"),
    "utf8"
  );
  const match = source.match(/const API_VERSION = "([^"]+)"/);
  assert.ok(match, "health-service.ts 里应存在 API_VERSION 常量");
  assert.equal(
    match[1],
    apiPackage.version,
    `API_VERSION（${match[1]}）必须与 apps/api/package.json（${apiPackage.version}）一致：` +
      "/health 是判断线上版本的唯一来源，不能漂移"
  );
});
