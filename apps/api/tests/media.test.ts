import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { createTestDatabase, createTestMediaRoot } from "./helpers/test-db";

const database = createTestDatabase("kpblog-media-test-");
const media = createTestMediaRoot();

let createMusicFromUrl: typeof import("../src/server/media/media-service").createMusicFromUrl;
let deleteMusicTrack: typeof import("../src/server/media/media-service").deleteMusicTrack;
let createMusicFromFile: typeof import("../src/server/media/media-service").createMusicFromFile;
let listImages: typeof import("../src/server/media/media-service").listImages;
let createImageFromFile: typeof import("../src/server/media/media-service").createImageFromFile;
let createImageFromUrl: typeof import("../src/server/media/media-service").createImageFromUrl;
let deleteImage: typeof import("../src/server/media/media-service").deleteImage;
let adoptPostImages: typeof import("../src/server/media/media-service").adoptPostImages;

before(async () => {
  // MEDIA_ROOT 已在 createTestMediaRoot 中设置，模块加载时即可读到。
  ({ createMusicFromUrl, deleteMusicTrack, createMusicFromFile, listImages, createImageFromFile,
    createImageFromUrl, deleteImage, adoptPostImages } = await import("../src/server/media/media-service"));
});

after(async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  media.restore();
  database.cleanup();
});

// ===== 音乐外链 =====

test("createMusicFromUrl validates protocol and length", async () => {
  await assert.rejects(() => createMusicFromUrl({ title: "", url: "" }), { status: 400 });
  await assert.rejects(
    () => createMusicFromUrl({ title: "t", url: "not-a-url" }),
    { status: 400 }
  );
  // 非 http(s) 协议必须拒绝
  await assert.rejects(
    () => createMusicFromUrl({ title: "t", url: "javascript:alert(1)" }),
    { status: 400 }
  );
  await assert.rejects(
    () => createMusicFromUrl({ title: "t", url: "file:///etc/passwd" }),
    { status: 400 }
  );
  await assert.rejects(
    () => createMusicFromUrl({ title: "t", url: `https://e.com/${"a".repeat(2100)}` }),
    { status: 400 }
  );
  await assert.rejects(
    () => createMusicFromUrl({ title: "t".repeat(121), url: "https://e.com/a.mp3" }),
    { status: 400 }
  );

  const track = await createMusicFromUrl({
    title: "  外链曲目  ",
    artist: "  某人  ",
    url: "https://example.com/song.mp3",
  });
  assert.equal(track.title, "外链曲目");
  assert.equal(track.artist, "某人");
  assert.equal(track.url, "https://example.com/song.mp3");
});

// ===== 音乐文件 =====

test("createMusicFromFile enforces type and size, and deleteMusicTrack removes the file", async () => {
  await assert.rejects(() => createMusicFromFile({ file: null }), { status: 400 });

  // 扩展名或 MIME 任一不符即拒绝
  await assert.rejects(
    () =>
      createMusicFromFile({
        file: new File([new Uint8Array([1, 2, 3])], "song.mp3", { type: "text/plain" }),
      }),
    { status: 400 }
  );
  await assert.rejects(
    () =>
      createMusicFromFile({
        file: new File([new Uint8Array([1, 2, 3])], "song.exe", { type: "audio/mpeg" }),
      }),
    { status: 400 }
  );
  // 超过 20MB
  await assert.rejects(
    () =>
      createMusicFromFile({
        file: new File([new Uint8Array(20 * 1024 * 1024 + 1)], "big.mp3", { type: "audio/mpeg" }),
      }),
    { status: 400 }
  );

  const audio = new File([new Uint8Array([0x49, 0x44, 0x33, 0x03])], "track.mp3", {
    type: "audio/mpeg",
  });
  const track = await createMusicFromFile({ file: audio, title: "本地曲目" });
  assert.match(track.url, /^\/music\/[a-z0-9]+-[a-z0-9]+\.mp3$/);

  // 文件名带路径时不会落到目录外
  const onDisk = path.join(media.dir, "music", path.basename(track.url));
  assert.equal(existsSync(onDisk), true);
  assert.equal(path.dirname(path.resolve(onDisk)), path.join(media.dir, "music"));

  // 删除记录时一并删掉本地文件
  assert.deepEqual(await deleteMusicTrack(track.id), { deleted: true });
  assert.equal(existsSync(onDisk), false);

  await assert.rejects(() => deleteMusicTrack(track.id), { status: 404 });
});

test("deleteMusicTrack keeps the row authoritative when the local file is gone", async () => {
  const audio = new File([new Uint8Array([0x49, 0x44, 0x33])], "gone.mp3", {
    type: "audio/mpeg",
  });
  const track = await createMusicFromFile({ file: audio, title: "缺失文件" });
  const onDisk = path.join(media.dir, "music", path.basename(track.url));

  const { unlink } = await import("node:fs/promises");
  await unlink(onDisk);

  // 文件已不存在，删除记录仍应成功
  assert.deepEqual(await deleteMusicTrack(track.id), { deleted: true });
});

// ===== 图片资源库（MediaImage 登记表） =====

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

test("image upload validates, registers, and deletes by id", async () => {
  await assert.rejects(() => createImageFromFile({ file: null, kind: "cover" }), { status: 400 });
  // kind 必须是 cover/article
  await assert.rejects(
    () => createImageFromFile({ file: new File([PNG_BYTES], "a.png", { type: "image/png" }), kind: "wallpaper" }),
    { status: 400 }
  );
  // MIME 或扩展名不符即拒绝
  await assert.rejects(
    () => createImageFromFile({ file: new File([PNG_BYTES], "pic.webp", { type: "text/html" }), kind: "cover" }),
    { status: 400 }
  );
  await assert.rejects(
    () => createImageFromFile({ file: new File([PNG_BYTES], "pic.exe", { type: "image/webp" }), kind: "cover" }),
    { status: 400 }
  );
  // 超过 10MB
  await assert.rejects(
    () =>
      createImageFromFile({
        file: new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }),
        kind: "cover",
      }),
    { status: 400 }
  );

  const image = await createImageFromFile({
    file: new File([PNG_BYTES], "cover.png", { type: "image/png" }),
    kind: "cover",
  });
  assert.equal(image.kind, "cover");
  assert.match(image.url, /^\/images\/[a-z0-9]+-[a-z0-9]+\.png$/);

  // 文件确实落在图库目录内
  const onDisk = path.join(media.dir, "images", path.basename(image.url));
  assert.equal(existsSync(onDisk), true);

  // kind 过滤：cover 列表能看到，article 列表看不到
  assert.ok((await listImages({ kind: "cover" })).some((item) => item.url === image.url));
  assert.equal((await listImages({ kind: "article" })).length, 0);

  const second = await createImageFromFile({
    file: new File([new Uint8Array([1])], "second.gif", { type: "image/gif" }),
    kind: "article",
  });
  assert.equal((await listImages({ kind: "article" }))[0].url, second.url);

  // 删除按 id：本地文件随之消失，再删 404
  assert.deepEqual(await deleteImage(second.id), { deleted: true });
  assert.equal(existsSync(path.join(media.dir, "images", second.name)), false);
  await assert.rejects(() => deleteImage(second.id), { status: 404 });
});

test("external image url registration dedupes by url and rejects non-http", async () => {
  const image = await createImageFromUrl({ url: "https://cdn.example.com/a/one.webp", kind: "article" });
  assert.equal(image.name, "one.webp", "name 缺省取 URL 末段");
  await assert.rejects(
    () => createImageFromUrl({ url: "https://cdn.example.com/a/one.webp", kind: "article" }),
    { status: 400 }
  );
  await assert.rejects(
    () => createImageFromUrl({ url: "javascript:alert(1)", kind: "cover" }),
    { status: 400 }
  );
  await assert.rejects(() => createImageFromUrl({ url: "", kind: "cover" }), { status: 400 });
});

test("delete refuses while referenced unless forced", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const url = "https://cdn.example.com/used-everywhere.webp";
  const image = await createImageFromUrl({ url, kind: "cover" });
  await prisma.post.create({
    data: { slug: "media-ref-post", title: "t", content: "x", published: true, coverImage: url },
  });

  await assert.rejects(
    () => deleteImage(image.id),
    (error: { status?: number; message?: string }) =>
      error.status === 409 && /1 篇文章/.test(error.message ?? "")
  );

  // force 越过：登记删除、文件系统不涉及，文章内容保持原样（允许悬空引用是显式决定）。
  assert.deepEqual(await deleteImage(image.id, { force: true }), { deleted: true });
  const post = await prisma.post.findUnique({ where: { slug: "media-ref-post" } });
  assert.equal(post?.coverImage, url);
});

test("adopt scans covers and body images and is idempotent", async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.post.create({
    data: {
      slug: "media-adopt-a",
      title: "a",
      content: "正文 ![一](https://img.example.com/one.png) 尾图 ![](https://img.example.com/two.jpg)",
      published: true,
      coverImage: "https://img.example.com/cover.webp",
    },
  });
  await prisma.post.create({
    data: {
      slug: "media-adopt-b",
      title: "b",
      content: "![](https://img.example.com/one.png)",
      published: true,
    },
  });

  const first = await adoptPostImages();
  // 同文件内更早的用例（引用删除）也留下过外链封面，故只断言下界。
  assert.ok(first.covers >= 1);
  assert.equal(first.articles, 2, "one.png 跨文章去重");

  const again = await adoptPostImages();
  assert.deepEqual(again, { covers: 0, articles: 0 }, "重复收编应零新增");

  const covers = await listImages({ kind: "cover" });
  assert.ok(covers.some((item) => item.url === "https://img.example.com/cover.webp"));
  const articles = await listImages({ kind: "article" });
  // 同文件内更早的用例还注册过其他 article 类图片，这里只断言成员。
  assert.ok(articles.some((item) => item.url === "https://img.example.com/one.png"));
  assert.ok(articles.some((item) => item.url === "https://img.example.com/two.jpg"));
});
