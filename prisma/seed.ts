import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { loadProjectEnv } from "../scripts/load-env.mjs";

// 统一走 scripts/load-env.mjs。此前这里有一份手写正则解析器，它与 dotenv 行为不同：
// 会把 `KEY=值 # 注释` 的注释当成值的一部分，会整行忽略 `export KEY=值`，
// 而且用相对 cwd 的路径找 .env 文件——换个目录执行就静默加载不到配置。
loadProjectEnv();

const seedArgs = new Set(process.argv.slice(2));
const resetRequested = seedArgs.has("--reset");
const productionSeedAllowed = process.env.ALLOW_PRODUCTION_SEED === "true";

function envText(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

async function main() {
  const { prisma } = await import("../apps/api/src/lib/prisma");

  // 是否清空数据不能只信 NODE_ENV。PM2 会注入 NODE_ENV=production，但在 shell
  // 里执行 `npm run db:seed` 时它通常是空的；旧逻辑因此可能在服务器上绕过
  // 保护并清空全部核心数据。现在改为：数据库非空时必须同时显式传 --reset
  // 与设置 ALLOW_PRODUCTION_SEED=true，和 NODE_ENV 无关。
  const [users, posts, comments, categories, tags, settings, profiles, music, images, wallpapers] =
    await Promise.all([
      prisma.user.count(),
      prisma.post.count(),
      prisma.comment.count(),
      prisma.category.count(),
      prisma.tag.count(),
      prisma.setting.count(),
      prisma.profile.count(),
      prisma.music.count(),
      prisma.mediaImage.count(),
      prisma.homeWallpaper.count(),
    ]);
  const hasExistingData = [
    users, posts, comments, categories, tags, settings, profiles, music, images, wallpapers,
  ].some((count) => count > 0);

  if (hasExistingData && !(resetRequested && productionSeedAllowed)) {
    throw new Error(
      "数据库已有数据，已拒绝 seed 以避免误删。\n" +
        "如果确认要清空并重新初始化，请执行：\n" +
        "  ALLOW_PRODUCTION_SEED=true npm run db:seed -- --reset\n" +
        "这会删除全部文章、评论、用户、分类、标签、设置、项目、媒体登记和验证码。"
    );
  }

  console.log("🌱 Seeding database...");

  // Clean existing data. 只有数据库为空（或上面已显式授权 reset）才会走到这里。
  await prisma.comment.deleteMany();
  await prisma.tagOnPost.deleteMany();
  await prisma.post.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.category.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.music.deleteMany();
  await prisma.mediaImage.deleteMany();
  await prisma.homeWallpaper.deleteMany();
  await prisma.verificationCode.deleteMany();
  await prisma.rateLimitBucket.deleteMany();

  // Create admin user.
  const adminUsername = envText("ADMIN_USERNAME", "admin");
  const adminDisplayName = envText("ADMIN_DISPLAY_NAME", "管理员");
  const configuredAdminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (configuredAdminPassword) {
    const bytes = Buffer.byteLength(configuredAdminPassword, "utf8");
    if (configuredAdminPassword.length < 8 || bytes > 72) {
      throw new Error("ADMIN_PASSWORD 必须为 8 个字符以上、72 个 UTF-8 字节以内。");
    }
  }
  // 生产模式或显式生产 seed 时不允许生成并打印临时密码。
  if (
    !configuredAdminPassword &&
    (process.env.NODE_ENV === "production" || productionSeedAllowed)
  ) {
    throw new Error("ADMIN_PASSWORD 未设置：生产 seed 拒绝生成并打印临时密码。");
  }
  const adminPassword =
    configuredAdminPassword || crypto.randomBytes(18).toString("base64url");
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  // 管理员邮箱是「忘记密码」重置流程的查找键：不填则管理员忘记密码时
  // 只能靠破坏性重置。生产已有账户可用 SQL 补设。
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() || null;
  const admin = await prisma.user.create({
    data: {
      username: adminUsername,
      password: hashedPassword,
      email: adminEmail,
    },
  });
  await prisma.$executeRaw`
    UPDATE "User"
    SET "displayName" = ${adminDisplayName}, "role" = 'ADMIN'
    WHERE "id" = ${admin.id}
  `;
  console.log(`  ✓ Admin user created: ${adminUsername}${adminEmail ? ` <${adminEmail}>` : "（未设邮箱，忘记密码将无法自助重置）"}`);
  if (!configuredAdminPassword) {
    console.log(`  ⚠ Temporary admin password: ${adminPassword}`);
    console.log("    Set ADMIN_PASSWORD before seeding to choose your own password.");
  }

  // Create only neutral taxonomy scaffolding. Personal content belongs to the owner.
  await prisma.category.create({
    data: { name: "技术", slug: "tech" },
  });
  await prisma.category.create({
    data: { name: "生活", slug: "life" },
  });
  console.log(`  ✓ Categories: tech, life`);

  // Create settings
  await prisma.setting.create({
    data: { key: "blog_title", value: "鲲鹏の博客" },
  });
  await prisma.setting.create({
    data: {
      key: "blog_description",
      value: "一个关于技术和生活的个人博客",
    },
  });
  console.log(`  ✓ Settings: blog title & description`);

  console.log("\n✅ Seed completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../apps/api/src/lib/prisma");
    await prisma.$disconnect();
  });
