import slugifyLib from "slugify";

export function slugify(text: string): string {
  return slugifyLib(text, { lower: true, strict: true, locale: "zh" });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateUniqueFilename(original: string): string {
  const ext = original.split(".").pop() || "jpg";
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}.${ext}`;
}

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

const TAG_COLORS = [
  "bg-pink-50 text-pink-600 hover:bg-pink-100 dark:bg-pink-900/20 dark:text-pink-300 dark:hover:bg-pink-900/40",
  "bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/40",
  "bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-900/20 dark:text-sky-300 dark:hover:bg-sky-900/40",
  "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/40",
  "bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40",
  "bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/40",
];

import { marked } from "marked";

// Render markdown to HTML (server-side)
export function renderMarkdown(md: string): string {
  return marked.parse(md, { breaks: true, gfm: true }) as string;
}

// Extract #tags from content
export function extractHashTags(content: string): string[] {
  const tags = new Set<string>();
  // Match #tag patterns (Chinese + English + numbers)
  const matches = content.match(/#[一-龥\wЀ-ӿ-]+/g);
  if (matches) {
    for (const m of matches) {
      const tag = m.slice(1).toLowerCase(); // remove # and lowercase
      if (tag.length > 1 && tag.length < 30 && !/^\d+$/.test(tag)) {
        tags.add(tag);
      }
    }
  }
  return [...tags];
}

export function hashTagColor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}
