import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const tempDir = mkdtempSync(path.join(tmpdir(), "kpblog-api-test-"));
const databasePath = path.join(tempDir, "test.db");
let app: FastifyInstance;

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = `file:${databasePath}`;
  process.env.JWT_SECRET = "test-secret-for-api-tests-000000000";
  process.env.SITE_URL = "http://localhost:3001";

  const migration = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: repositoryRoot,
    env: process.env,
    encoding: "utf8",
  });
  assert.equal(migration.status, 0, migration.stdout + migration.stderr);

  const { buildApp } = await import("../src/app");
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  rmSync(tempDir, { recursive: true, force: true });
});

test("health endpoint exposes the API service contract", async () => {
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    success: true,
    data: { service: "kpblog-api", status: "ok", version: "2.1.0" },
  });
});

test("public endpoints return stable response envelopes", async () => {
  const settings = await app.inject({ method: "GET", url: "/api/public/settings" });
  assert.equal(settings.statusCode, 200);
  assert.equal(settings.json().success, true);

  const articles = await app.inject({ method: "GET", url: "/api/articles?limit=10" });
  assert.equal(articles.statusCode, 200);
  assert.equal(articles.json().success, true);
  assert.deepEqual(articles.json().data.items, []);
});

test("protected mutations reject anonymous callers", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/articles",
    headers: { origin: "http://localhost:3001" },
    payload: { title: "No session", content: "Should fail" },
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "UNAUTHORIZED");
});
