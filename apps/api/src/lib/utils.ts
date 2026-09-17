import slugifyLib from "slugify";
import { pinyin } from "pinyin-pro";

const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const MAX_SLUG_LENGTH = 80;

/**
 * 中文标题直接走 slugify 会被 strict 模式全部剥离，只剩下一个不可读的哈希
 * （例如「数据库索引原理与优化实践」→ "xgfntkk"）。这里先把 CJK 转成拼音，
 * 让中文文章也能得到可读、利于 SEO 的 URL，同时保留标题里的拉丁词。
 *
 * 注意：apps/web 有一份等价实现（后台 slug 实时预览需要它）。
 * 两边的行为一致性由 apps/api/tests 的 slug 对照测试保证，改动时请同步。
 */
export function slugify(text: string): string {
  const source = CJK_PATTERN.test(text)
    ? pinyin(text, { toneType: "none", type: "array", nonZh: "consecutive" }).join(" ")
    : text;

  let result = slugifyLib(source, { lower: true, strict: true, locale: "zh" });

  // 过长的拼音串在词边界截断，避免生成超长 URL。
  if (result.length > MAX_SLUG_LENGTH) {
    const truncated = result.slice(0, MAX_SLUG_LENGTH);
    const lastDash = truncated.lastIndexOf("-");
    result = lastDash > 0 ? truncated.slice(0, lastDash) : truncated;
  }

  if (result) return result;

  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return "x" + Math.abs(hash).toString(36);
}

// ====== 媒体上传 ======

export function generateUniqueFilename(original: string): string {
  const ext = original.split(".").pop() || "jpg";
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
}

// ====== 内容处理 ======

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
