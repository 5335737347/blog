import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { slugify } from "@/lib/utils";

function extractTitle(content: string, filename: string): string {
  // Try YAML frontmatter title
  const fmMatch = content.match(/^---\s*\n(?:.*\n)*?title:\s*(.+)\n(?:.*\n)*?---/);
  if (fmMatch) return fmMatch[1].trim().replace(/['"]/g, "");

  // Try first # heading
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  // Fallback to filename without extension
  return filename.replace(/\.(md|html?|txt)$/i, "").replace(/[-_]/g, " ");
}

function extractTags(content: string): string[] {
  const fmMatch = content.match(/^---\s*\n(?:.*\n)*?tags:\s*\[(.+)\]\s*\n(?:.*\n)*?---/);
  if (fmMatch) {
    return fmMatch[1].split(",").map((t) => t.trim().replace(/['"]/g, "")).filter(Boolean);
  }
  // Try YAML list format
  const fmListMatch = content.match(/^---\s*\n(?:.*\n)*?tags:\s*\n((?:\s*-\s*.+\n)+)(?:.*\n)*?---/);
  if (fmListMatch) {
    return fmListMatch[1].split("\n").map((t) => t.replace(/^\s*-\s*/, "").trim()).filter(Boolean);
  }
  return [];
}

function extractExcerpt(content: string): string | null {
  const fmMatch = content.match(/^---\s*\n(?:.*\n)*?excerpt:\s*(.+)\n(?:.*\n)*?---/);
  if (fmMatch) return fmMatch[1].trim();
  // Use first paragraph after removing headings
  const clean = content.replace(/^---[\s\S]*?---\s*/, "").replace(/^#.+$/gm, "").trim();
  const para = clean.match(/^(.{20,200})/);
  return para ? para[1].trim() : null;
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const results: { success: boolean; title: string; slug?: string; error?: string }[] = [];

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["md", "html", "htm", "txt"].includes(ext)) {
        results.push({ success: false, title: file.name, error: "不支持的文件类型" });
        continue;
      }

      const raw = await file.text();
      const title = extractTitle(raw, file.name);
      const slug = slugify(title);
      const tags = extractTags(raw);
      const excerpt = extractExcerpt(raw);

      // Check slug
      const existing = await prisma.post.findUnique({ where: { slug } });
      if (existing) {
        results.push({ success: false, title, error: `slug "${slug}" 已存在` });
        continue;
      }

      // Resolve tags
      const tagConnects = [];
      for (const tagName of tags) {
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
          excerpt,
          published: false,
          tags: tagConnects.length > 0 ? { create: tagConnects } : undefined,
        },
      });

      results.push({ success: true, title, slug });
    }

    const ok = results.filter((r) => r.success).length;
    const fail = results.filter((r) => !r.success).length;
    return NextResponse.json({ imported: ok, failed: fail, results }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "导入失败" }, { status: 500 });
  }
}
