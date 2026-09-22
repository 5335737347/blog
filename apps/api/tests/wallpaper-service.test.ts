import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createTestDatabase, createTestMediaRoot } from "./helpers/test-db";

/**
 * 首页壁纸轮换管理。重点钉三个行为：
 * 1. 首次访问自动播种 8 张默认壁纸，且只播种一次（删空后不再复活）；
 * 2. 公开列表只含启用项且按 sortOrder 排序，管理列表（all）含停用项；
 * 3. 重排只影响顺序，停用/删除不动文件。
 */
const database = createTestDatabase("kpblog-wallpaper-test-");
const media = createTestMediaRoot();

let listWallpapers: typeof import("../src/server/media/wallpaper-service").listWallpapers;
let createWallpaperFromFile: typeof import("../src/server/media/wallpaper-service").createWallpaperFromFile;
let updateWallpaper: typeof import("../src/server/media/wallpaper-service").updateWallpaper;
let reorderWallpapers: typeof import("../src/server/media/wallpaper-service").reorderWallpapers;
let deleteWallpaper: typeof import("../src/server/media/wallpaper-service").deleteWallpaper;

before(async () => {
  ({
    listWallpapers,
    createWallpaperFromFile,
    updateWallpaper,
    reorderWallpapers,
    deleteWallpaper,
  } = await import("../src/server/media/wallpaper-service"));
});

after(async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  media.restore();
  database.cleanup();
});

const PNG_FILE = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "wp.png", {
  type: "image/png",
});

test("first access seeds the 8 default wallpapers exactly once", async () => {
  const first = await listWallpapers({ all: true });
  assert.equal(first.length, 8);
  assert.equal(first[0].url, "/images/home/wallpaper-01.webp");
  assert.ok(first.every((item) => item.enabled));

  // 播种幂等：再次访问不会翻倍。
  const again = await listWallpapers({ all: true });
  assert.equal(again.length, 8);
});

test("public list hides disabled entries; admin list shows them", async () => {
  const all = await listWallpapers({ all: true });
  const disabled = await updateWallpaper(all[2].id, { enabled: false });

  assert.equal(disabled.enabled, false);
  const publicList = await listWallpapers();
  assert.equal(publicList.length, 7);
  assert.ok(!publicList.some((item) => item.id === all[2].id));
  assert.equal((await listWallpapers({ all: true })).length, 8);
});

test("upload appends to the end with next sort order", async () => {
  const uploaded = await createWallpaperFromFile({ file: PNG_FILE });
  assert.match(uploaded.url, /^\/images\/[a-z0-9]+-[a-z0-9]+\.png$/);
  assert.equal(uploaded.enabled, true);

  const all = await listWallpapers({ all: true });
  assert.equal(all[all.length - 1].id, uploaded.id, "新壁纸排在轮换末尾");
  assert.equal(all[all.length - 1].sortOrder, all[all.length - 2].sortOrder + 1);

  await assert.rejects(() => createWallpaperFromFile({ file: null }), { status: 400 });
});

test("reorder follows the given id order; unlisted entries trail", async () => {
  const all = await listWallpapers({ all: true });
  const reordered = await reorderWallpapers({
    ids: [all[5].id, all[1].id],
  });

  assert.equal(reordered[0].id, all[5].id);
  assert.equal(reordered[1].id, all[1].id);
  // 未列出的条目保持相对顺序排在后面，sortOrder 连续。
  assert.deepEqual(
    reordered.map((item) => item.sortOrder),
    reordered.map((_, index) => index)
  );
});

test("delete removes the rotation entry only, not the file", async () => {
  const { existsSync } = await import("node:fs");
  const path = await import("node:path");
  const uploaded = await createWallpaperFromFile({ file: PNG_FILE });
  const onDisk = path.join(media.dir, "images", path.basename(uploaded.url));
  assert.equal(existsSync(onDisk), true);

  assert.deepEqual(await deleteWallpaper(uploaded.id), { deleted: true });
  assert.equal(existsSync(onDisk), true, "文件必须保留");
  await assert.rejects(() => deleteWallpaper(uploaded.id), { status: 404 });
});

test("deleting every entry does not resurrect the defaults", async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.homeWallpaper.deleteMany();
  const afterDelete = await listWallpapers({ all: true });
  assert.equal(afterDelete.length, 0, "删空后不得重新播种默认壁纸");
});
