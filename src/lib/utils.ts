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

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
// Custom rehype plugin: add line numbers to code blocks
function rehypeLineNumbers() {
  return () => {
    return (tree: any) => {
      // Post-process: wrap code lines with line numbers using raw HTML string replacement
      // This runs after rehype-stringify via string manipulation
    };
  };
}

// Render markdown to HTML, then post-process to add line numbers
export function renderMarkdown(md: string): string {
  let html = String(getProcessor().processSync(md));

  // Add line numbers to code blocks (post-process raw HTML)
  html = html.replace(/<pre[^>]*><code class="([^"]*)"[^>]*>([\s\S]*?)<\/code><\/pre>/g, (_match: string, cls: string, content: string) => {
    const content2 = content.replace(/\n$/, "");
    const lines = content2.split("\n");
    if (lines.length <= 1) return _match;

    const numbered = lines.map((line, i) => {
      return `<span class="code-line"><span class="line-num">${i + 1}</span><span class="line-content">${line || " "}</span></span>`;
    }).join("");

    return `<pre data-lined=""><code class="${cls}">${numbered}</code></pre>`;
  });

  return html;
}

// Render markdown to HTML with LaTeX + syntax highlighting (server-side)
let _processor: any = null;
function getProcessor(): any {
  if (!_processor) {
    _processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkRehype)
      .use(rehypeKatex)
      .use(rehypeHighlight)
      .use(rehypeStringify);
  }
  return _processor;
}

// Auto-generate excerpt from content
export function autoExcerpt(content: string, maxLen = 200): string {
  const clean = content
    .replace(/^---[\s\S]*?---\s*/m, "")  // remove frontmatter
    .replace(/^#+\s+.*$/gm, "")           // remove headings
    .replace(/```[\s\S]*?```/g, "")       // remove code blocks
    .replace(/[|*_~>`\[\]()!#]/g, "")     // remove markdown syntax
    .replace(/\n+/g, " ")                 // collapse newlines
    .trim();
  return clean.slice(0, maxLen) + (clean.length > maxLen ? "..." : "");
}

// Estimate reading time
export function readingTime(content: string): number {
  const text = content.replace(/```[\s\S]*?```/g, "").replace(/[#*~>`\[\]()!_|]/g, "");
  const words = text.match(/[一-鿿]|\w+/g)?.length || 0;
  return Math.max(1, Math.ceil(words / 300)); // 300 chars/min for Chinese
}

// Extract headings for TOC
export function extractHeadings(content: string): { level: number; text: string; id: string }[] {
  const headings: { level: number; text: string; id: string }[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      const text = match[2].trim();
      const id = text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9一-鿿-]/g, "");
      headings.push({ level: match[1].length, text, id });
    }
  }
  return headings;
}

// Extract #tags from content
export function extractHashTags(content: string): string[] {
  const tags = new Set<string>();
  const re = /#[\p{L}\p{N}一-鿿][\p{L}\p{N}一-鿿_-]{0,28}/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const tag = match[0].slice(1).toLowerCase();
    if (tag.length > 1 && isNaN(Number(tag))) {
      tags.add(tag);
    }
  }
  return [...tags];
}

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
