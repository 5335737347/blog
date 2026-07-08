import { prisma } from "@/lib/prisma";

const SETTING_KEYS = ["blog_title", "blog_description"] as const;

type SettingKey = (typeof SETTING_KEYS)[number];

function settingValue(input: Record<string, unknown>, key: SettingKey): string | undefined {
  return input[key] !== undefined ? String(input[key]) : undefined;
}

export async function getSettingsMap() {
  const settings = await prisma.setting.findMany();
  const map: Record<string, string> = {};

  for (const setting of settings) {
    map[setting.key] = setting.value;
  }

  return map;
}

export async function updateSettings(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid settings payload");
  }

  const updates = SETTING_KEYS.flatMap((key) => {
    const value = settingValue(input as Record<string, unknown>, key);
    return value === undefined ? [] : [{ key, value }];
  });

  for (const { key, value } of updates) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  return { updated: true };
}
