import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-db";

const database = createTestDatabase("kpblog-settings-test-");

after(async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  database.cleanup();
});

// ===== settings-service =====

test("updateSettings validates input and persists allowed keys", async () => {
  const { getSettingsMap, updateSettings } = await import(
    "../src/server/settings/settings-service"
  );
  const { prisma } = await import("../src/lib/prisma");

  // 非对象输入
  for (const bad of [null, undefined, "text", 42, []]) {
    await assert.rejects(() => updateSettings(bad), { status: 400 });
  }

  // 空值被拒绝
  await assert.rejects(() => updateSettings({ blog_title: "   " }), { status: 400 });

  // 长度上限
  await assert.rejects(() => updateSettings({ blog_title: "标".repeat(81) }), { status: 400 });
  await assert.rejects(
    () => updateSettings({ blog_description: "描".repeat(201) }),
    { status: 400 }
  );

  // 正常写入
  assert.deepEqual(await updateSettings({ blog_title: "  新标题  ", blog_description: "新描述" }), {
    updated: true,
  });

  const map = await getSettingsMap();
  assert.equal(map.blog_title, "新标题", "值应被 trim");
  assert.equal(map.blog_description, "新描述");

  // 未提供的键不被动到
  await updateSettings({ blog_title: "只改标题" });
  const after = await getSettingsMap();
  assert.equal(after.blog_title, "只改标题");
  assert.equal(after.blog_description, "新描述", "未提供的键应保持原值");

  // 白名单：不允许写入任意键
  await updateSettings({ private_token: "must-not-be-stored", blog_title: "白名单测试" });
  const rows = await prisma.setting.findMany({ select: { key: true } });
  assert.deepEqual(
    rows.map((row) => row.key).sort(),
    ["blog_description", "blog_title"],
    "只应存在白名单内的键"
  );

  const mapAfter = await getSettingsMap();
  assert.equal("private_token" in mapAfter, false);
});

// ===== lib/env =====

test("getJwtSecret rejects missing, placeholder and low-entropy secrets", async () => {
  const { getJwtSecret } = await import("../src/lib/env");
  const previous = process.env.JWT_SECRET;
  const strong = "0123456789abcdef0123456789abcdef";

  try {
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);

    process.env.JWT_SECRET = "   ";
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);

    process.env.JWT_SECRET = "replace-with-a-random-secret";
    assert.throws(() => getJwtSecret(), /JWT_SECRET/, "占位符必须被拒绝");

    // 回归：仓库 .env / .env.local 里实际用过的那个占位符。它长 42 字符，
    // 满足长度检查，也不在旧的单值黑名单里，所以曾被完整放行。
    process.env.JWT_SECRET = "change-me-to-a-random-string-in-production";
    assert.throws(
      () => getJwtSecret(),
      /JWT_SECRET/,
      "换了个拼写的占位符同样必须被拒绝，黑名单不能只有一个值"
    );

    process.env.JWT_SECRET = "a".repeat(31);
    assert.throws(() => getJwtSecret(), /JWT_SECRET/, "少于 32 字符必须被拒绝");

    // 长度不等于熵：32 个相同字符满足长度要求，却没有一点随机性。
    process.env.JWT_SECRET = "a".repeat(32);
    assert.throws(() => getJwtSecret(), /JWT_SECRET/, "低熵密钥必须被拒绝");

    process.env.JWT_SECRET = strong;
    assert.equal(getJwtSecret(), strong);

    // 前后空白会被裁剪
    process.env.JWT_SECRET = `  ${strong}  `;
    assert.equal(getJwtSecret(), strong);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});

test("getSiteUrl normalises the origin and rejects malformed values", async () => {
  const { getSiteUrl, getOpenGraphImageUrl } = await import("../src/lib/env");
  const previousSite = process.env.SITE_URL;
  const previousOg = process.env.OG_IMAGE_URL;

  try {
    // 缺失 / 非法 / 非绝对 URL 都返回空串（调用方据此跳过 canonical 等输出）
    delete process.env.SITE_URL;
    assert.equal(getSiteUrl(), "");

    process.env.SITE_URL = "   ";
    assert.equal(getSiteUrl(), "");

    process.env.SITE_URL = "not-a-url";
    assert.equal(getSiteUrl(), "");

    process.env.SITE_URL = "/relative/path";
    assert.equal(getSiteUrl(), "");

    // 保留 origin，丢弃路径、查询与多余斜杠
    process.env.SITE_URL = "https://kpblog.cc/some/path?x=1";
    assert.equal(getSiteUrl(), "https://kpblog.cc");

    process.env.SITE_URL = "https://kpblog.cc/";
    assert.equal(getSiteUrl(), "https://kpblog.cc");

    process.env.SITE_URL = "  https://kpblog.cc  ";
    assert.equal(getSiteUrl(), "https://kpblog.cc", "应裁剪空白");

    delete process.env.OG_IMAGE_URL;
    assert.equal(getOpenGraphImageUrl(), "");
    process.env.OG_IMAGE_URL = "  https://cdn.example/og.png  ";
    assert.equal(getOpenGraphImageUrl(), "https://cdn.example/og.png");
  } finally {
    if (previousSite === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previousSite;
    if (previousOg === undefined) delete process.env.OG_IMAGE_URL;
    else process.env.OG_IMAGE_URL = previousOg;
  }
});
