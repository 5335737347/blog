import { prisma } from "@/lib/prisma";
import { badRequest } from "@/server/errors";

const SETTING_KEYS = ["blog_title", "blog_description"] as const;

type SettingKey = (typeof SETTING_KEYS)[number];

function settingValue(input: Record<string, unknown>, key: SettingKey): string | undefined {
  return input[key] !== undefined ? String(input[key]).trim() : undefined;
}

export async function getSettingsMap() {
  const settings = await prisma.setting.findMany({
    where: { key: { in: [...SETTING_KEYS] } },
  });
  const map: Record<string, string> = {};

  for (const setting of settings) {
    map[setting.key] = setting.value;
  }

  return map;
}

export async function updateSettings(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw badRequest("无效设置数据");
  }

  const updates = SETTING_KEYS.flatMap((key) => {
    const value = settingValue(input as Record<string, unknown>, key);
    return value === undefined ? [] : [{ key, value }];
  });

  for (const { key, value } of updates) {
    if (!value) throw badRequest("设置内容不能为空");
    if (key === "blog_title" && value.length > 80) {
      throw badRequest("博客标题不能超过 80 个字符");
    }
    if (key === "blog_description" && value.length > 200) {
      throw badRequest("博客描述不能超过 200 个字符");
    }
  }

  await prisma.$transaction(
    updates.map(({ key, value }) => prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    }))
  );

  return { updated: true };
}
