import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { slugify, renderMarkdown, extractHashTags, autoExcerpt } from "@/lib/utils";
import mammoth from "mammoth";

function extractTitle(content: string, filename: string): string {
  const fmMatch = content.match(/^---\s*\n(?:.*\n)*?title:\s*(.+)\n(?:.*\n)*?---/);
  if (fmMatch) return fmMatch[1].trim().replace(/['"]/g, "");
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();
  return filename.replace(/\.\w+$/i, "").replace(/[-_]/g, " ");
}

function extractTags(content: string): string[] {
  const fmMatch = content.match(/^---\s*\n(?:.*\n)*?tags:\s*\[(.+)\]\s*\n(?:.*\n)*?---/);
  if (fmMatch) return fmMatch[1].split(",").map((t) => t.trim().replace(/['"]/g, "")).filter(Boolean);
  const fmListMatch = content.match(/^---\s*\n(?:.*\n)*?tags:\s*\n((?:\s*-\s*.+\n)+)(?:.*\n)*?---/);
  if (fmListMatch) return fmListMatch[1].split("\n").map((t) => t.replace(/^\s*-\s*/, "").trim()).filter(Boolean);
  return [];
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const results: { success: boolean; title: string; slug?: string; source?: string; error?: string }[] = [];

    for (const file of files) {
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        let raw: string;

        // Convert based on file type
        if (ext === "docx") {
          const buf = Buffer.from(await file.arrayBuffer());
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          const result = await (mammoth as any).convertToMarkdown({ buffer: buf }) as { value: string };
          raw = result.value;
          if (!raw.trim()) {
            results.push({ success: false, title: file.name, error: "文档为空" });
            continue;
          }
        } else if (["md", "html", "htm", "txt"].includes(ext)) {
          raw = await file.text();
        } else {
          results.push({ success: false, title: file.name, error: `不支持的文件类型 .${ext}` });
          continue;
        }

        // Remove BOM and normalize line endings
        raw = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

        // For plain text, wrap in markdown-friendly format
        if (ext === "txt") {
          raw = raw.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }

        const title = extractTitle(raw, file.name);
        const slug = slugify(title);
        const tags = extractTags(raw);
        const excerpt = autoExcerpt(raw);

        // Check slug
        const existing = await prisma.post.findUnique({ where: { slug } });
        if (existing) {
          results.push({ success: false, title, error: `"${slug}" 已存在` });
          continue;
        }

        // Merge tags + auto-detected
        const autoTags = extractHashTags(raw);
        const allTags = [...new Set([...tags, ...autoTags])];

        const tagConnects = [];
        for (const tagName of allTags) {
          const tagSlug = slugify(tagName);
          const tag = await prisma.tag.upsert({
            where: { slug: tagSlug },
            update: {},
            create: { name: tagName, slug: tagSlug },
          });
          tagConnects.push({ tagId: tag.id });
        }

        await prisma.post.create({
          data: {
            title,
            slug,
            content: raw,
            contentHtml: renderMarkdown(raw),
            excerpt,
            published: false,
            tags: tagConnects.length > 0 ? { create: tagConnects } : undefined,
          },
        });

        results.push({ success: true, title, slug, source: ext });
      } catch (e) {
        results.push({ success: false, title: file.name, error: "解析失败" });
      }
    }

    const ok = results.filter((r) => r.success).length;
    const fail = results.filter((r) => !r.success).length;
    return NextResponse.json({ imported: ok, failed: fail, results }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "导入失败" }, { status: 500 });
  }
}
