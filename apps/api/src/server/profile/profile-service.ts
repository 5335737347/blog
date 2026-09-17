import type { ProfileDto, ProfileSocialLink } from "@kpblog/contracts";
import { prisma } from "@/lib/prisma";
import { badRequest } from "@/server/errors";

/**
 * 个人资料是单行表，id 固定为这个值。
 * 用固定 id 而不是「取第一行」，是为了让并发写入天然收敛到同一行。
 */
const PROFILE_ID = "singleton";

const LIMITS = {
  name: 60,
  headline: 120,
  location: 60,
  email: 254,
  avatar: 2048,
  bio: 4000,
  now: 4000,
  socialLinks: 12,
  socialLabel: 30,
  socialHref: 2048,
};

export const EMPTY_PROFILE: ProfileDto = {
  name: "",
  headline: "",
  bio: "",
  location: "",
  avatar: "",
  email: "",
  now: "",
  socialLinks: [],
};

function trimmed(value: unknown, max: number, label: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw badRequest(`${label}必须是文本`);
  const text = value.trim();
  if (text.length > max) throw badRequest(`${label}不能超过 ${max} 个字符`);
  return text;
}

/**
 * 头像来源：站内相对路径（/images/x.jpg）或 http(s) 绝对地址。
 * 拒绝其它协议（javascript:、data: 等）。
 */
function imageUrl(value: unknown, max: number, label: string): string {
  const text = trimmed(value, max, label);
  if (!text) return "";
  if (text.startsWith("/")) {
    // 站内路径：不接受协议相对写法 //evil.com
    if (text.startsWith("//")) throw badRequest(`${label}不能使用协议相对地址`);
    return text;
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw badRequest(`${label}必须是站内路径或以 http(s) 开头的完整地址`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw badRequest(`${label}仅支持 http/https 地址`);
  }
  return text;
}

function httpUrl(value: unknown, max: number, label: string): string {
  const text = trimmed(value, max, label);
  if (!text) return "";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw badRequest(`${label}必须是完整的 http(s) 地址`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw badRequest(`${label}仅支持 http/https 地址`);
  }
  return text;
}

function optionalEmail(value: unknown): string {
  const text = trimmed(value, LIMITS.email, "邮箱");
  if (!text) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    throw badRequest("邮箱格式不正确");
  }
  return text;
}

function parseSocialLinks(value: unknown): ProfileSocialLink[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest("社交链接必须是数组");
  if (value.length > LIMITS.socialLinks) {
    throw badRequest(`社交链接最多 ${LIMITS.socialLinks} 条`);
  }

  const links: ProfileSocialLink[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw badRequest("社交链接每一项都必须是对象");
    }
    const item = entry as Record<string, unknown>;
    const label = trimmed(item.label, LIMITS.socialLabel, "社交链接名称");
    const href = httpUrl(item.href, LIMITS.socialHref, "社交链接地址");
    if (!label || !href) throw badRequest("社交链接的名称和地址都不能为空");
    links.push({ label, href });
  }
  return links;
}

/** 数据库里存的是 JSON 文本。手工改坏时降级为空数组，而不是让整页 500。 */
function parseStoredArray<T>(raw: string): T[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    console.warn("[profile] 数据库中的 JSON 字段无法解析，已降级为空数组");
    return [];
  }
}

export async function getProfile(): Promise<ProfileDto> {
  const row = await prisma.profile.findUnique({ where: { id: PROFILE_ID } });
  // 尚未保存过任何内容：返回空资料，页面据此渲染空状态。
  if (!row) return { ...EMPTY_PROFILE };

  return {
    name: row.name,
    headline: row.headline,
    bio: row.bio,
    location: row.location,
    avatar: row.avatar,
    email: row.email,
    now: row.now,
    socialLinks: parseStoredArray<ProfileSocialLink>(row.socialLinks),
  };
}

export async function updateProfile(input: unknown): Promise<ProfileDto> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw badRequest("无效的个人资料数据");
  }
  const body = input as Record<string, unknown>;

  const data = {
    name: trimmed(body.name, LIMITS.name, "昵称"),
    headline: trimmed(body.headline, LIMITS.headline, "一句话介绍"),
    bio: trimmed(body.bio, LIMITS.bio, "个人简介"),
    location: trimmed(body.location, LIMITS.location, "所在地"),
    avatar: imageUrl(body.avatar, LIMITS.avatar, "头像地址"),
    email: optionalEmail(body.email),
    now: trimmed(body.now, LIMITS.now, "近况"),
    socialLinks: JSON.stringify(parseSocialLinks(body.socialLinks)),
  };

  const saved = await prisma.profile.upsert({
    where: { id: PROFILE_ID },
    update: data,
    create: { id: PROFILE_ID, ...data },
  });

  return {
    name: saved.name,
    headline: saved.headline,
    bio: saved.bio,
    location: saved.location,
    avatar: saved.avatar,
    email: saved.email,
    now: saved.now,
    socialLinks: parseStoredArray<ProfileSocialLink>(saved.socialLinks),
  };
}
