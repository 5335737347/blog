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

/**
 * 封面/头像等图片引用是否安全。
 *
 * 允许站内相对路径（/images/x.png）与完整 http(s) URL；拒绝
 * javascript:/data:/file:、协议相对 //evil.com 等。具体错误文案由调用方决定。
 */
export function isSafeImageReference(value: string): boolean {
  if (!value) return true;
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// ====== 内容处理 ======

/**
 * 从 Markdown 正文自动派生纯文本摘要。
 *
 * 必须按「结构」剥离而不是删字符：之前的实现直接删掉 `![]()`、`|` 这些语法字符，
 * 结果图片语法变成「alt 文本/图片路径」（如 泛型推断示意/images/hero-bg.webp）、
 * 表格的单元格粘连且 `------` 分隔线残留，被原样存进数据库并展示在文章页。
 * 顺序很重要：先代码块，再图片（必须在链接之前，`!` 才不会被误当普通文本），
 * 再链接（保留文字），最后才是行内强调符号。
 */
export function autoExcerpt(content: string, maxLen = 200): string {
  const clean = content
    .replace(/^---[\s\S]*?---\s*/m, "") // frontmatter
    .replace(/```[\s\S]*?```/g, " ") // 围栏代码块
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/`([^`\n]*)`/g, "$1") // 行内代码 → 保留内容（行内代码常是句子的一部分）
    .replace(/!\[[^\]]*\]\([^)\s]*(?:\s+"[^"]*")?\)/g, " ") // 图片
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, " ") // 引用式图片
    .replace(/\[([^\]]*)\]\([^)\s]*(?:\s+"[^"]*")?\)/g, "$1") // 链接 → 保留文字
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1") // 引用式链接
    .replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, " ") // 引用定义行
    .replace(/^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/gm, " ") // 表格分隔行
    .replace(/\|/g, " ") // 剩余表格竖线 → 空格（保留单元格文字）
    .replace(/^#{1,6}\s+.*$/gm, "") // 标题行（标题另有展示位）
    .replace(/^\s*([-*_][\s-]*){3,}$/gm, " ") // 水平线
    .replace(/^>\s?/gm, "") // 引用块标记
    .replace(/<[^>\n]+>/g, " ") // 内联 HTML 标签
    .replace(/[*_~]/g, "") // 强调符号
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return clean.slice(0, maxLen) + (clean.length > maxLen ? "..." : "");
}

export function extractHashTags(content: string): string[] {
  const tags = new Set<string>();
  // 代码块与行内代码里的 # 不是标签：#include、#define、#!/bin/bash 会天天
  // 制造标签噪音。先剥离 fenced code 与行内代码，再按 # 提取。
  const withoutCode = content
    .replace(/^```[^\n]*\n[\s\S]*?^```/gm, " ")
    .replace(/^~~~[^\n]*\n[\s\S]*?^~~~/gm, " ")
    .replace(/`[^`\n]*`/g, " ");
  const re = /#[\p{L}\p{N}一-鿿][\p{L}\p{N}一-鿿_-]{0,28}/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutCode)) !== null) {
    const tag = m[0].slice(1).toLowerCase();
    if (tag.length < 2 || !isNaN(Number(tag))) continue;
    if (/^[0-9a-f]{3,8}$/.test(tag)) continue;
    tags.add(tag);
  }
  return [...tags];
}
