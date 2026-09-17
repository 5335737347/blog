import slugifyLib from "slugify";
import GithubSlugger from "github-slugger";
import { pinyin } from "pinyin-pro";

const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const MAX_SLUG_LENGTH = 80;

/**
 * 与 apps/api/src/lib/utils.ts 的 slugify 保持一致：中文标题先转拼音再生成 slug，
 * 否则后台预览的 slug 会与服务端实际保存的结果不一致。
 *
 * 服务端才是 slug 的唯一权威（会再次归一化）。两份实现的行为一致性由
 * apps/api/tests 的对照测试保证，改动时请同步两边。
 */
export function slugify(text: string): string {
  const source = CJK_PATTERN.test(text)
    ? pinyin(text, { toneType: "none", type: "array", nonZh: "consecutive" }).join(" ")
    : text;

  let result = slugifyLib(source, { lower: true, strict: true, locale: "zh" });

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

// ====== 展示格式化 ======

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

export function readingTime(content: string): number {
  const text = content.replace(/```[\s\S]*?```/g, "").replace(/[#*~>`\[\]()!_|]/g, "");
  const words = text.match(/[一-鿿]|\w+/g)?.length || 0;
  return Math.max(1, Math.ceil(words / 300));
}

export function wordCount(content: string): number {
  const text = content.replace(/```[\s\S]*?```/g, "").replace(/[#*~>`\[\]()!_|]/g, "");
  const cjk = text.match(/[\u4e00-\u9fff]/g)?.length || 0;
  const words = text.match(/\w+/g)?.length || 0;
  return cjk + words;
}

// ====== 文章目录 ======

function cleanHeadingText(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/**
 * 从 Markdown 原文提取目录条目。
 *
 * 两条规则都对应渲染端的真实行为（见 MarkdownContent 的 remarkDemoteHeadings）：
 *
 * 1. **一级标题不进目录**。文章页的 `<h1>` 是文章标题本身，正文里的 `#` 会被
 *    渲染成 `h2`；把标题也列进目录只会得到一个点了没反应的条目——它就在正文
 *    最上方，滚动联动永远轮不到它，点它也只是回到当前滚动位置。
 * 2. 其余层级整体上移一位（`##` 显示为二级、`###` 显示为三级），与渲染结果一致。
 *    此前用的是原始 `#` 数量，于是目录的缩进层级与实际标题层级对不上。
 */
export function extractHeadings(content: string): { level: number; text: string; id: string }[] {
  const headings: { level: number; text: string; id: string }[] = [];
  const slugger = new GithubSlugger();
  for (const line of content.split("\n")) {
    const m = line.match(/^(#{1,4})\s+(.+)$/);
    if (!m) continue;
    const depth = m[1].length;
    const text = cleanHeadingText(m[2]);
    // 空标题不生成锚点；一级标题就是文章标题，跳过。
    if (!text || depth === 1) continue;
    const id = slugger.slug(text);
    headings.push({ level: depth - 1, text, id });
  }
  return headings;
}

// 标签配色已从「按 slug 随机取三色之一」改为固定语义样式（见 TagBadge）：
// 随机配色不携带信息，只会让页面显得吵。hashTagColor 因此被删除。

