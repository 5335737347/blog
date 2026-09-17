import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createTestDatabase } from "./helpers/test-db";

const database = createTestDatabase("kpblog-profile-test-");

let prisma: typeof import("../src/lib/prisma").prisma;
let getProfile: typeof import("../src/server/profile/profile-service").getProfile;
let updateProfile: typeof import("../src/server/profile/profile-service").updateProfile;

before(async () => {
  ({ prisma } = await import("../src/lib/prisma"));
  ({ getProfile, updateProfile } = await import("../src/server/profile/profile-service"));
});

after(async () => {
  await prisma.$disconnect();
  database.cleanup();
});

test("getProfile returns empty defaults before anything is saved", async () => {
  const profile = await getProfile();
  assert.deepEqual(profile, {
    name: "",
    headline: "",
    bio: "",
    location: "",
    avatar: "",
    email: "",
    now: "",
    socialLinks: [],
  });
});

test("updateProfile persists text fields and trims them", async () => {
  const saved = await updateProfile({
    name: "  鲲鹏  ",
    headline: " CS 学生 ",
    bio: "第一行\n第二行",
    location: "  杭州 ",
    email: "  me@example.com  ",
    now: "  在写博客  ",
  });

  assert.equal(saved.name, "鲲鹏");
  assert.equal(saved.headline, "CS 学生");
  assert.equal(saved.bio, "第一行\n第二行");
  assert.equal(saved.location, "杭州");
  assert.equal(saved.email, "me@example.com");
  assert.equal(saved.now, "在写博客");

  // 再读一次必须一致（确认真的落库，而不是只回显）
  const reread = await getProfile();
  assert.deepEqual(reread, saved);

  // 单行表：多次写入不会产生第二行
  assert.equal(await prisma.profile.count(), 1);
});

test("updateProfile round-trips social links", async () => {
  const saved = await updateProfile({
    socialLinks: [
      { label: "GitHub", href: "https://github.com/someone" },
      { label: "博客", href: "https://kpblog.cc" },
    ],
  });

  assert.deepEqual(saved.socialLinks, [
    { label: "GitHub", href: "https://github.com/someone" },
    { label: "博客", href: "https://kpblog.cc" },
  ]);

  const reread = await getProfile();
  assert.deepEqual(reread.socialLinks, saved.socialLinks);

  // 传空数组应清空
  const cleared = await updateProfile({ socialLinks: [] });
  assert.deepEqual(cleared.socialLinks, []);
});

test("updateProfile rejects malformed input", async () => {
  for (const bad of [null, undefined, "text", 42, []]) {
    await assert.rejects(() => updateProfile(bad), { status: 400 });
  }

  // 长度上限
  await assert.rejects(() => updateProfile({ name: "字".repeat(61) }), { status: 400 });
  await assert.rejects(() => updateProfile({ headline: "字".repeat(121) }), { status: 400 });
  await assert.rejects(() => updateProfile({ bio: "字".repeat(4001) }), { status: 400 });
  await assert.rejects(() => updateProfile({ now: "字".repeat(4001) }), { status: 400 });

  // 字段类型
  await assert.rejects(() => updateProfile({ name: 123 }), { status: 400 });

  // 邮箱格式（空字符串表示不填，是允许的）
  await assert.rejects(() => updateProfile({ email: "not-an-email" }), { status: 400 });
  assert.equal((await updateProfile({ email: "" })).email, "");

  // 数组结构
  await assert.rejects(() => updateProfile({ socialLinks: "nope" }), { status: 400 });
  await assert.rejects(() => updateProfile({ socialLinks: [null] }), { status: 400 });

  // 社交链接必须有名称和地址
  await assert.rejects(
    () => updateProfile({ socialLinks: [{ label: "", href: "https://a.example" }] }),
    { status: 400 }
  );
  await assert.rejects(
    () => updateProfile({ socialLinks: [{ label: "A", href: "" }] }),
    { status: 400 }
  );

  // 数量上限
  await assert.rejects(
    () =>
      updateProfile({
        socialLinks: Array.from({ length: 13 }, (_, i) => ({
          label: `L${i}`,
          href: "https://a.example",
        })),
      }),
    { status: 400 }
  );
});

test("updateProfile refuses unsafe image and link schemes", async () => {
  // 站内相对路径可以，协议相对地址不行
  assert.equal((await updateProfile({ avatar: "/images/me.jpg" })).avatar, "/images/me.jpg");
  await assert.rejects(() => updateProfile({ avatar: "//evil.example/x.jpg" }), { status: 400 });

  // 危险协议
  for (const bad of [
    "javascript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "file:///etc/passwd",
  ]) {
    await assert.rejects(() => updateProfile({ avatar: bad }), { status: 400 });
  }

  // 社交链接只接受 http(s)
  for (const bad of ["javascript:alert(1)", "mailto:a@b.com", "/relative", "ftp://x.example"]) {
    await assert.rejects(
      () => updateProfile({ socialLinks: [{ label: "X", href: bad }] }),
      { status: 400 }
    );
  }

  // 正常地址仍然接受
  const ok = await updateProfile({
    avatar: "http://example.com/a.png",
    socialLinks: [{ label: "HTTPS", href: "https://example.com" }],
  });
  assert.equal(ok.avatar, "http://example.com/a.png");
});

test("getProfile degrades to an empty array when stored JSON is corrupted", async () => {
  await updateProfile({ socialLinks: [{ label: "A", href: "https://a.example" }] });
  // 模拟手工改坏数据库
  await prisma.profile.update({
    where: { id: "singleton" },
    data: { socialLinks: "{ this is not json" },
  });

  const profile = await getProfile();
  assert.deepEqual(profile.socialLinks, [], "损坏的 JSON 不应让整页 500");
  assert.equal(profile.name !== undefined, true, "其它字段仍然可读");
});
