import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { SignJWT } from "jose";

const projectRoot = path.resolve(import.meta.dirname, "..");
const tempDir = mkdtempSync(path.join(tmpdir(), "kpblog-test-"));
const databasePath = path.join(tempDir, "test.db");

before(() => {
  process.env.DATABASE_URL = `file:${databasePath}`;
  process.env.JWT_SECRET = "test-secret-for-service-tests-000000";
  process.env.SITE_URL = "http://localhost:3000";

  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: projectRoot,
    env: process.env,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
});

after(async () => {
  const { prisma } = await import("../apps/api/src/lib/prisma");
  await prisma.$disconnect();
  rmSync(tempDir, { recursive: true, force: true });
});

test("publishes markdown with frontmatter, taxonomy, and generated URL", async () => {
  const { prisma } = await import("../apps/api/src/lib/prisma");
  const { publishMarkdown } = await import("../apps/api/src/server/publishing/publishing-service");

  const result = await publishMarkdown({
    content: `---
title: Smoke Test Post
slug: smoke-test-post
tags: [Next.js, Prisma]
category: Smoke
published: true
date: 2026-07-13
---

# Smoke Test Post

Publishing should keep Markdown content and extract #service-test.
`,
  });

  assert.equal(result.post.slug, "smoke-test-post");
  assert.equal(result.post.published, true);
  assert.equal(result.post.url, "http://localhost:3000/articles/smoke-test-post");

  const post = await prisma.post.findUnique({
    where: { slug: "smoke-test-post" },
    include: { category: true, tags: { include: { tag: true } } },
  });

  assert.ok(post);
  assert.equal(post.category?.slug, "smoke");
  assert.deepEqual(
    post.tags.map((item) => item.tag.slug).sort(),
    ["nextjs", "prisma", "service-test"]
  );
});

test("creates, moderates, and lists public comments without exposing email", async () => {
  const { prisma } = await import("../apps/api/src/lib/prisma");
  const {
    createComment,
    listPublicComments,
    moderateComment,
  } = await import("../apps/api/src/server/comments/comment-service");

  const post = await prisma.post.create({
    data: {
      slug: "comment-target",
      title: "Comment Target",
      content: "Published post for comment tests.",
      published: true,
      publishedAt: new Date("2026-07-13T00:00:00.000Z"),
    },
  });

  const created = await createComment({
    postId: post.id,
    author: "Reader",
    email: "reader@example.com",
    content: "Looks good.",
  });

  assert.equal(created.pendingReview, true);
  assert.deepEqual(await listPublicComments(post.id), []);

  await moderateComment(created.id, { approved: true });
  const comments = await listPublicComments(post.id);

  assert.equal(comments.length, 1);
  assert.equal(comments[0].author, "Reader");
  assert.equal("email" in comments[0], false);
});

test("article service separates public drafts from admin listings", async () => {
  const {
    createArticle,
    listArticles,
    updateArticle,
  } = await import("../apps/api/src/server/articles/article-service");

  const draft = await createArticle({
    title: "Draft Article",
    slug: "draft-article",
    content: "Draft content",
    published: false,
  });

  let publicArticles = await listArticles({ page: 1, pageSize: 10, isAdmin: false });
  assert.equal(
    publicArticles.items.some((article) => article.slug === "draft-article"),
    false
  );

  const adminDrafts = await listArticles({
    page: 1,
    pageSize: 10,
    isAdmin: true,
    published: "draft",
  });
  assert.equal(adminDrafts.items.some((article) => article.id === draft.id), true);

  await updateArticle(draft.id, { published: true });
  publicArticles = await listArticles({ page: 1, pageSize: 10, isAdmin: false });
  assert.equal(
    publicArticles.items.some((article) => article.slug === "draft-article"),
    true
  );
});

test("publish API keys are stored as hashes and legacy keys are normalized", async () => {
  const { prisma } = await import("../apps/api/src/lib/prisma");
  const { verifyPublishApiKey } = await import("../apps/api/src/server/auth/auth-service");
  const rawApiKey = "kp_test_legacy_key";

  const user = await prisma.user.create({
    data: {
      username: "api-key-admin",
      password: "unused",
      apiKey: rawApiKey,
    },
  });

  const verified = await verifyPublishApiKey(rawApiKey);
  assert.equal(verified.id, user.id);

  const stored = await prisma.user.findUnique({
    where: { id: user.id },
    select: { apiKey: true },
  });

  assert.equal(
    stored?.apiKey,
    crypto.createHash("sha256").update(rawApiKey).digest("hex")
  );
});

test("rejects legacy session tokens that do not declare a role", async () => {
  const { verifyToken } = await import("../apps/api/src/lib/auth");
  const secret = new TextEncoder().encode(process.env.JWT_SECRET || "");
  const legacyToken = await new SignJWT({ userId: "legacy", username: "legacy-admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(secret);

  assert.equal(await verifyToken(legacyToken), null);
});

test("persists email codes and rate-limit counters in the database", async () => {
  const { prisma } = await import("../apps/api/src/lib/prisma");
  const {
    sendRegisterVerificationCode,
    assertRegisterVerificationCode,
  } = await import(
    "../apps/api/src/server/auth/verification-code-service"
  );
  const { assertRateLimit } = await import("../apps/api/src/server/request-guard");

  const codeResult = await sendRegisterVerificationCode("email", "new-reader@example.com");
  assert.match(codeResult.debugCode || "", /^\d{6}$/);
  await assertRegisterVerificationCode("email", "new-reader@example.com", codeResult.debugCode);

  const smsResult = await sendRegisterVerificationCode("phone", "+8613800000000");
  assert.match(smsResult.debugCode || "", /^\d{6}$/);
  await assertRegisterVerificationCode("phone", "+86 138 0000 0000", smsResult.debugCode);
  assert.equal(await prisma.verificationCode.count(), 0);

  await assertRateLimit("test:limit", 2, 60_000);
  await assertRateLimit("test:limit", 2, 60_000);
  await assert.rejects(() => assertRateLimit("test:limit", 2, 60_000), {
    status: 429,
  });
  assert.equal((await prisma.rateLimitBucket.findUnique({ where: { key: "test:limit" } }))?.count, 3);
});

test("public settings only expose explicitly allowed keys", async () => {
  const { prisma } = await import("../apps/api/src/lib/prisma");
  const { getSettingsMap } = await import("../apps/api/src/server/settings/settings-service");

  await prisma.setting.create({ data: { key: "private_token", value: "must-not-leak" } });
  const settings = await getSettingsMap();

  assert.equal("private_token" in settings, false);
});

test("rejects passwords beyond bcrypt's safe byte limit", async () => {
  const { loginUser } = await import("../apps/api/src/server/auth/auth-service");

  await assert.rejects(
    () => loginUser({ identifier: "reader", password: "密".repeat(25) }),
    { status: 401 }
  );
});

test("rejects invalid phone numbers during registration", async () => {
  const { registerUser } = await import("../apps/api/src/server/auth/auth-service");

  await assert.rejects(
    () => registerUser({
      username: "phone-reader",
      email: "phone-reader@example.com",
      phone: "not-a-phone",
      password: "valid-password",
    }),
    { status: 400, message: "手机号格式不正确，请检查国家区号和号码" }
  );
});

test("normalizes and validates international phone numbers", async () => {
  const { normalizePhoneNumber } = await import("../apps/api/src/lib/phone");

  assert.equal(normalizePhoneNumber("138 0013 8000", "CN"), "+8613800138000");
  assert.equal(normalizePhoneNumber("020 7946 0018", "GB"), "+442079460018");
  assert.equal(normalizePhoneNumber("+1 202-555-0123"), "+12025550123");
  assert.equal(normalizePhoneNumber("12345", "CN"), null);
});

test("rejects login identifiers that collide across account fields", async () => {
  const { prisma } = await import("../apps/api/src/lib/prisma");
  const { loginUser, registerUser } = await import("../apps/api/src/server/auth/auth-service");

  await prisma.user.create({
    data: { username: "legacy-owner@example.com", password: "unused" },
  });

  await assert.rejects(
    () => registerUser({
      username: "new-reader",
      email: "legacy-owner@example.com",
      verificationChannel: "email",
      verificationCode: "000000",
      password: "valid-password",
    }),
    { status: 400, message: "用户名、邮箱或手机号已被使用" }
  );

  await prisma.user.create({
    data: {
      username: "legacy-second-owner",
      email: "legacy-owner@example.com",
      password: "unused",
    },
  });

  await assert.rejects(
    () => loginUser({ identifier: "legacy-owner@example.com", password: "unused" }),
    { status: 401, message: "用户名或密码错误" }
  );
});

test("does not trust client IP headers unless proxy trust is explicit", async () => {
  const { requestIp } = await import("../apps/api/src/server/request-guard");
  const previousTrustProxy = process.env.TRUST_PROXY;
  const previousProxyHeader = process.env.TRUST_PROXY_HEADER;
  const request = {
    headers: new Headers({
      "x-real-ip": "203.0.113.8",
      "x-forwarded-for": "198.51.100.4, 10.0.0.1",
    }),
  };

  try {
    delete process.env.TRUST_PROXY;
    assert.equal(requestIp(request), "untrusted-proxy");

    process.env.TRUST_PROXY = "true";
    process.env.TRUST_PROXY_HEADER = "x-forwarded-for";
    assert.equal(requestIp(request), "198.51.100.4");

    process.env.TRUST_PROXY_HEADER = "unexpected-header";
    assert.equal(requestIp(request), "invalid-proxy-header");
  } finally {
    if (previousTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previousTrustProxy;
    if (previousProxyHeader === undefined) delete process.env.TRUST_PROXY_HEADER;
    else process.env.TRUST_PROXY_HEADER = previousProxyHeader;
  }
});

test("infers phone country from geo headers with language fallback", async () => {
  const { inferCountry } = await import("../apps/api/src/server/location/country-service");

  assert.deepEqual(inferCountry(new Headers({ "cf-ipcountry": "JP" })), {
    countryCode: "JP",
    source: "ip",
  });
  assert.deepEqual(inferCountry(new Headers({ "accept-language": "zh-TW,zh;q=0.9" })), {
    countryCode: "TW",
    source: "language",
  });
});
