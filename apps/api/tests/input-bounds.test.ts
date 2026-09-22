import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { createTestDatabase } from "./helpers/test-db";

const database = createTestDatabase("kpblog-input-bounds-test-");
let app: FastifyInstance;

before(async () => {
  const { buildApp } = await import("../src/app");
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  database.cleanup();
});

test("extremely large page numbers are clamped instead of crashing SQLite", async () => {
  const huge = "999999999999999999999999";

  const articleIndex = await app.inject({
    method: "GET",
    url: `/api/public/article-index?page=${huge}`,
  });
  assert.equal(articleIndex.statusCode, 200);
  assert.equal(articleIndex.json().data.page, 10_000);

  const comments = await app.inject({
    method: "GET",
    url: `/api/comments?postId=absent&page=${huge}`,
  });
  assert.equal(comments.statusCode, 200);
  assert.equal(comments.json().data.page, 10_000);
});

test("a JSON body over the configured limit returns a readable 413", async () => {
  const oversized = "a".repeat(9 * 1024 * 1024);
  const response = await app.inject({
    method: "POST",
    url: "/api/publish",
    headers: { "content-type": "application/json" },
    payload: { content: oversized },
  });

  assert.equal(response.statusCode, 413);
  assert.equal(response.json().error.code, "FST_ERR_CTP_BODY_TOO_LARGE");
  assert.match(response.json().error.message, /请求体过大/);
});
