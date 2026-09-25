import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { createTestDatabase, createTestMediaRoot } from "./helpers/test-db";

/**
 * 上传端点的资源上限。
 *
 * 全局 multipart 限制是 20 个文件 × 20 MiB，而单文件端点只用 `files[0]`——
 * 不加 route 级限制时，一个请求就能让进程把 400 MiB 读进内存。这里锁定
 * 「第 2 个文件直接 413」「超过单文件上限直接 413」以及正常上传仍然成功。
 */

const database = createTestDatabase("kpblog-multipart-limit-test-");
const media = createTestMediaRoot();

let app: FastifyInstance;
let cookie: string;
let origin: string;
let maxImageSize: number;

interface Part {
  name: string;
  filename?: string;
  contentType?: string;
  data: Buffer | string;
}

/** 手写 multipart 请求体：不引入额外依赖，且能精确控制文件个数与大小。 */
function multipartBody(boundary: string, parts: Part[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const headers = [`--${boundary}`];
    if (part.filename) {
      headers.push(
        `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"`
      );
      headers.push(`Content-Type: ${part.contentType ?? "application/octet-stream"}`);
    } else {
      headers.push(`Content-Disposition: form-data; name="${part.name}"`);
    }
    chunks.push(Buffer.from(`${headers.join("\r\n")}\r\n\r\n`, "utf8"));
    chunks.push(typeof part.data === "string" ? Buffer.from(part.data, "utf8") : part.data);
    chunks.push(Buffer.from("\r\n", "utf8"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return Buffer.concat(chunks);
}

async function upload(parts: Part[], url = "/api/images") {
  const boundary = `----kpblog-limit-${Math.random().toString(36).slice(2)}`;
  return app.inject({
    method: "POST",
    url,
    headers: {
      origin,
      cookie,
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload: multipartBody(boundary, parts),
  });
}

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.TRUST_PROXY = "false";
  delete process.env.TRUST_PROXY_HEADER;

  const { buildApp } = await import("../src/app");
  const { prisma } = await import("../src/lib/prisma");
  const { hashPassword } = await import("../src/lib/auth");
  const { getJwtSecret } = await import("../src/lib/env");
  // 必须动态导入：静态 import 会在 createTestDatabase() 之前初始化 Prisma 适配器，
  // 那样测试进程会把 DATABASE_URL 指向开发机的库。
  ({ MAX_IMAGE_SIZE: maxImageSize } = await import("../src/server/media/media-service"));
  const { SignJWT } = await import("jose");

  app = buildApp();
  await app.ready();
  origin = process.env.SITE_URL ?? "http://localhost:3000";

  const admin = await prisma.user.create({
    data: {
      username: "multipart-admin",
      password: await hashPassword("admin-password-12345"),
      role: "ADMIN",
    },
  });
  const token = await new SignJWT({
    userId: admin.id,
    username: admin.username,
    role: "ADMIN",
    tokenVersion: admin.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(getJwtSecret()));
  cookie = `session=${token}`;
});

after(async () => {
  await app.close();
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  media.restore();
  database.cleanup();
});

const PNG_HEADER = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

test("a second file on a single-file upload route is rejected with 413 instead of being buffered", async () => {
  const response = await upload([
    { name: "kind", data: "article" },
    { name: "file", filename: "first.png", contentType: "image/png", data: PNG_HEADER },
    { name: "file", filename: "second.png", contentType: "image/png", data: PNG_HEADER },
  ]);

  assert.equal(response.statusCode, 413);
  const body = response.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, "FST_FILES_LIMIT");
});

test("a file above the per-route size cap is rejected before reaching the service", async () => {
  const response = await upload([
    { name: "kind", data: "article" },
    {
      name: "file",
      filename: "huge.png",
      contentType: "image/png",
      data: Buffer.alloc(maxImageSize + 1),
    },
  ]);

  assert.equal(response.statusCode, 413);
  assert.equal(response.json().error.code, "FST_REQ_FILE_TOO_LARGE");
});

test("the happy path still uploads, writes the file and registers it", async () => {
  const response = await upload([
    { name: "kind", data: "article" },
    { name: "file", filename: "ok.png", contentType: "image/png", data: PNG_HEADER },
  ]);

  assert.equal(response.statusCode, 201);
  const body = response.json();
  assert.equal(body.success, true);
  assert.match(body.data.url, /^\/images\//);

  const filename = String(body.data.url).replace("/images/", "");
  const onDisk = existsSync(path.join(media.dir, "images", filename));
  assert.equal(onDisk, true, "上传成功的文件应落在 MEDIA_ROOT/images");
});

test("the import route accepts multiple files but rejects an oversized one", async () => {
  const twoFiles = await upload(
    [
      { name: "file", filename: "a.md", contentType: "text/markdown", data: "# 甲\n\n正文" },
      { name: "file", filename: "b.md", contentType: "text/markdown", data: "# 乙\n\n正文" },
    ],
    "/api/import"
  );
  assert.equal(twoFiles.statusCode, 201);
  assert.equal(twoFiles.json().data.imported, 2);

  const oversized = await upload(
    [
      {
        name: "file",
        filename: "huge.md",
        contentType: "text/markdown",
        data: Buffer.alloc(10 * 1024 * 1024 + 1),
      },
    ],
    "/api/import"
  );
  assert.equal(oversized.statusCode, 413);
  assert.equal(oversized.json().error.code, "FST_REQ_FILE_TOO_LARGE");
});

test("uploaded images directory only contains successfully registered files", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const rows = await prisma.mediaImage.count();
  const files = existsSync(path.join(media.dir, "images"))
    ? readdirSync(path.join(media.dir, "images"))
    : [];
  assert.equal(
    files.length,
    rows,
    "磁盘文件数与登记行数一致（被拒绝的上传不得留下孤儿文件）"
  );
});
