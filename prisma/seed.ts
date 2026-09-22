import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { loadProjectEnv } from "../scripts/load-env.mjs";

// 统一走 scripts/load-env.mjs。此前这里有一份手写正则解析器，它与 dotenv 行为不同：
// 会把 `KEY=值 # 注释` 的注释当成值的一部分，会整行忽略 `export KEY=值`，
// 而且用相对 cwd 的路径找 .env 文件——换个目录执行就静默加载不到配置。
loadProjectEnv();

function envText(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "true") {
    throw new Error("Refusing to reset production data. Set ALLOW_PRODUCTION_SEED=true to continue.");
  }
  const { prisma } = await import("../apps/api/src/lib/prisma");
  console.log("🌱 Seeding database...");

  // Clean existing data
  await prisma.comment.deleteMany();
  await prisma.tagOnPost.deleteMany();
  await prisma.post.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();

  // Create admin user.
  const adminUsername = envText("ADMIN_USERNAME", "admin");
  const adminDisplayName = envText("ADMIN_DISPLAY_NAME", "管理员");
  const configuredAdminPassword = process.env.ADMIN_PASSWORD?.trim();
  const adminPassword =
    configuredAdminPassword || crypto.randomBytes(18).toString("base64url");
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  // 管理员邮箱是「忘记密码」重置流程的查找键：不填则管理员忘记密码时
  // 只能靠破坏性重置。生产已有账户可用 SQL 补设。
  const adminEmail = process.env.ADMIN_EMAIL?.trim() || null;
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
