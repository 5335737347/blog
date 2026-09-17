import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import {
  categoryWithPostCountSelect,
  tagWithPostCountSelect,
  toCategoryDto,
  toTagDto,
} from "./taxonomy-dto";

/**
 * 把标签名解析成标签 id，缺少的按需创建。
 *
 * 两个要点：
 *
 * 1. **按 slug 去重，而不是按名字。** 「Next.js」「NextJS」「nextjs」归一到同一个
 *    slug，「C++」与「C」也是。若只按名字去重，这些情况会解析出重复的 tagId，
 *    写入 `(postId, tagId)` 复合主键时直接违反唯一约束 —— 表现为发布接口 500。
 * 2. **批量处理。** 之前两个调用方都是逐个 upsert，N 个标签就是 N 次数据库往返。
 *    这里固定为 3 次查询。
 *
 * 返回顺序与传入顺序（去重后）一致。
 */
export async function resolveTagIds(tagNames: string[]): Promise<string[]> {
  const nameBySlug = new Map<string, string>();
  for (const raw of tagNames) {
    const name = raw.trim();
    if (!name) continue;
    const slug = slugify(name);
    if (!nameBySlug.has(slug)) nameBySlug.set(slug, name);
  }

  const slugs = [...nameBySlug.keys()];
  if (slugs.length === 0) return [];

  const existing = await prisma.tag.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true },
  });
  const existingSlugs = new Set(existing.map((tag) => tag.slug));
  const missing = slugs
    .filter((slug) => !existingSlugs.has(slug))
    .map((slug) => ({ slug, name: nameBySlug.get(slug) as string }));

  if (missing.length > 0) {
    try {
      await prisma.tag.createMany({ data: missing });
    } catch (error) {
      // 并发下可能已被另一个请求插入，忽略唯一约束冲突即可。
      if ((error as { code?: string }).code !== "P2002") throw error;
    }
  }

  const tags = await prisma.tag.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(tags.map((tag) => [tag.slug, tag.id]));

  return slugs
    .map((slug) => idBySlug.get(slug))
    .filter((id): id is string => Boolean(id));
}

export async function listCategories() {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: categoryWithPostCountSelect,
  });

  return categories.map(toCategoryDto);
}

/**
 * 公开面的标签列表（侧边栏标签云、首页、GET /api/tags）。
 *
 * 只返回至少有一篇已发布文章的标签。此前的实现在清理示例数据后仍会返回
 * 大量 `postCount: 0` 的标签，页面上渲染成一排点了没内容的空链接。
 *
 * 注意 listCategories 没有做同样的过滤：分类是少量、刻意维护的导航结构，
 * 允许暂时为空作为占位；标签则由导入流程自动产生，噪音需要在这里挡掉。
 */
export async function listTags() {
  const tags = await prisma.tag.findMany({
    where: { posts: { some: { post: { published: true } } } },
    orderBy: { name: "asc" },
    select: tagWithPostCountSelect,
  });

  return tags.map(toTagDto);
}

export async function getTagBySlug(slug: string) {
  const tag = await prisma.tag.findUnique({
    where: { slug },
    select: tagWithPostCountSelect,
  });

  return tag ? toTagDto(tag) : null;
}

export async function getCategoryBySlug(slug: string) {
  const category = await prisma.category.findUnique({
    where: { slug },
    select: categoryWithPostCountSelect,
  });

  return category ? toCategoryDto(category) : null;
}
