import slugifyLib from "slugify";
import GithubSlugger from "github-slugger";

export function slugify(text: string): string {
  const result = slugifyLib(text, { lower: true, strict: true, locale: "zh" });
  if (result) return result;
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return "x" + Math.abs(hash).toString(36);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

export function formatDateISO(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString();
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length).replace(/\s+\S*$/, "") + "...";
}

export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function generateUniqueFilename(original: string): string {
  const ext = original.split(".").pop() || "jpg";
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
}

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

// ====== Content Utilities ======

export function autoExcerpt(content: string, maxLen = 200): string {
  const clean = content
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/^#+\s+.*$/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[|*_~>`\[\]()!#]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return clean.slice(0, maxLen) + (clean.length > maxLen ? "..." : "");
}

export function readingTime(content: string): number {
  const text = content.replace(/```[\s\S]*?```/g, "").replace(/[#*~>`\[\]()!_|]/g, "");
  const words = text.match(/[一-鿿]|\w+/g)?.length || 0;
  return Math.max(1, Math.ceil(words / 300));
}

function cleanHeadingText(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export function extractHeadings(content: string): { level: number; text: string; id: string }[] {
  const headings: { level: number; text: string; id: string }[] = [];
  const slugger = new GithubSlugger();
  for (const line of content.split("\n")) {
    const m = line.match(/^(#{1,3})\s+(.+)$/);
    if (m) {
      const text = cleanHeadingText(m[2]);
      if (!text) continue;
      const id = slugger.slug(text);
      headings.push({ level: m[1].length, text, id });
    }
  }
  return headings;
}

export function extractHashTags(content: string): string[] {
  const tags = new Set<string>();
  const re = /#[\p{L}\p{N}一-鿿][\p{L}\p{N}一-鿿_-]{0,28}/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const tag = m[0].slice(1).toLowerCase();
    if (tag.length < 2 || !isNaN(Number(tag))) continue;
    if (/^[0-9a-f]{3,8}$/.test(tag)) continue;
    tags.add(tag);
  }
  return [...tags];
}

// ====== Tag Colors ======

const TAG_COLORS = [
  "bg-pink-50 text-pink-600 hover:bg-pink-100 dark:bg-pink-900/20 dark:text-pink-300 dark:hover:bg-pink-900/40",
  "bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/40",
  "bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-900/20 dark:text-sky-300 dark:hover:bg-sky-900/40",
  "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/40",
  "bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40",
  "bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/40",
];

const _colorCache = new Map<string, string>();

export function hashTagColor(slug: string): string {
  const cached = _colorCache.get(slug);
  if (cached) return cached;
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
  _colorCache.set(slug, color);
  return color;
}
