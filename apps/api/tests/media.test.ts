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
let deleteImage: typeof import("../src/server/media/media-service").deleteImage;

before(async () => {
  // MEDIA_ROOT 已在 createTestMediaRoot 中设置，模块加载时即可读到。
  ({ createMusicFromUrl, deleteMusicTrack, createMusicFromFile, listImages, createImageFromFile,
    deleteImage } = await import("../src/server/media/media-service"));
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

// ===== 封面图片 =====

test("image service validates, uploads to the images dir, and deletes by name", async () => {
  await assert.rejects(() => createImageFromFile({ file: null }), { status: 400 });

  // MIME 或扩展名不符即拒绝
  await assert.rejects(
    () =>
      createImageFromFile({
        file: new File([new Uint8Array([1, 2, 3])], "pic.webp", { type: "text/html" }),
      }),
    { status: 400 }
  );
  await assert.rejects(
    () =>
      createImageFromFile({
        file: new File([new Uint8Array([1, 2, 3])], "pic.exe", { type: "image/webp" }),
      }),
    { status: 400 }
  );
  // 超过 10MB
  await assert.rejects(
    () =>
      createImageFromFile({
        file: new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }),
      }),
    { status: 400 }
  );

  const image = await createImageFromFile({
    file: new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "cover.png", { type: "image/png" }),
  });
  assert.match(image.url, /^\/images\/[a-z0-9]+-[a-z0-9]+\.png$/);

  // 文件确实落在图库目录内，且列表能枚举到
  const onDisk = path.join(media.dir, "images", path.basename(image.url));
  assert.equal(existsSync(onDisk), true);
  assert.equal(path.dirname(path.resolve(onDisk)), path.join(media.dir, "images"));
  const listed = await listImages();
  assert.ok(listed.some((item) => item.url === image.url));

  // 列表按修改时间倒序，后传的排前面
  const second = await createImageFromFile({
    file: new File([new Uint8Array([1])], "second.gif", { type: "image/gif" }),
  });
  assert.equal((await listImages())[0].url, second.url);

  // 删除：名字不合法（遍历/扩展名）拒绝，成功后文件消失，再删 404
  await assert.rejects(() => deleteImage("../escape.png"), { status: 400 });
  await assert.rejects(() => deleteImage("not-an-image.txt"), { status: 400 });
  assert.deepEqual(await deleteImage(second.name), { deleted: true });
  assert.equal(existsSync(path.join(media.dir, "images", second.name)), false);
  await assert.rejects(() => deleteImage(second.name), { status: 404 });
});
