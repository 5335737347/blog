import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { badRequest, notFound } from "@/server/errors";
import type { Prisma } from "@prisma/client";

/**
 * 分类与标签的后台管理操作。
 *
 * 公开面（taxonomy-service）只读，且标签列表会隐藏没有任何已发布文章的标签；
 * 管理端需要看到全貌（包括 0 篇文章的标签）并做结构维护，所以计数口径也不同：
 * 管理端统计全部文章（含草稿），公开端只统计已发布。
 *
 * slug 约定：slug 是公开 URL 的一部分（/tags/[tag]、/categories/[category]）。
 * 重命名默认不改 slug——改名是内容操作，不应该悄悄破坏已分享出去的链接；
 * 只有请求里显式带 slug 字段才更新，由界面提示后果。
 *
 * Category 与 Tag 的标量字段完全相同，但 Prisma 的模型委托类型不可互换
 * （方法签名是各自泛型的），所以持久化按模型各写一份，纯逻辑（校验、冲突
 * 归因、更新数据计算）抽成共享函数。
 */

/** 管理端口径：计数不过滤 published（TagOnPost 行数 = 关联的全部文章）。 */
const tagAdminSelect = {
  id: true,
  name: true,
  slug: true,
  _count: { select: { posts: true } },
} satisfies Prisma.TagSelect;

const categoryAdminSelect = {
  id: true,
  name: true,
  slug: true,
  _count: { select: { posts: true } },
} satisfies Prisma.CategorySelect;

type TagAdminRecord = Prisma.TagGetPayload<{ select: typeof tagAdminSelect }>;
type CategoryAdminRecord = Prisma.CategoryGetPayload<{ select: typeof categoryAdminSelect }>;

function toTagAdminDto(tag: TagAdminRecord) {
  return { id: tag.id, name: tag.name, slug: tag.slug, postCount: tag._count.posts };
}

function toCategoryAdminDto(category: CategoryAdminRecord) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    postCount: category._count.posts,
  };
}

const MAX_NAME_LENGTH = 50;

function requireName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw badRequest("名称不能为空");
  if (name.length > MAX_NAME_LENGTH) {
    throw badRequest(`名称不能超过 ${MAX_NAME_LENGTH} 个字符`);
  }
  return name;
}

/**
 * 显式提供的 slug（可选）。过一遍 slugify 让用户输入的「My Tag」「我的标签」
 * 归一成合法 URL 片段，而不是原样入库。空串视为未提供。
 */
function optionalSlug(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return undefined;
  const slug = slugify(raw);
  if (!slug) throw badRequest("slug 格式不正确");
  if (slug.length > 80) throw badRequest("slug 过长");
  return slug;
}

/** 唯一约束冲突（P2002）统一转成 400，并归因到具体字段。 */
async function taxonomyConflictMessage(
  kind: "category" | "tag",
  name: string,
  slug: string
): Promise<string> {
  const byName =
    kind === "category"
      ? await prisma.category.findUnique({ where: { name }, select: { name: true } })
      : await prisma.tag.findUnique({ where: { name }, select: { name: true } });
  if (byName) return "同名已存在；如要合并标签请使用合并功能";
  const bySlug =
    kind === "category"
      ? await prisma.category.findUnique({ where: { slug }, select: { slug: true } })
      : await prisma.tag.findUnique({ where: { slug }, select: { slug: true } });
  if (bySlug) return "相同链接标识（slug）已存在";
  return "名称或 slug 已存在";
}

/**
 * 计算更新数据。返回 null 表示没有任何实际变更（字段缺失抛 400，
 * 字段都在但值与现状一致视为无需更新）。
 */
function computeTaxonomyUpdate(
  input: { name?: unknown; slug?: unknown },
  currentName: string,
  currentSlug: string
): { data: { name?: string; slug?: string }; name: string; slug: string } | null {
  const data: { name?: string; slug?: string } = {};
  if (input.name !== undefined) data.name = requireName(input.name);
  const explicitSlug = optionalSlug(input.slug);
  if (explicitSlug !== undefined) data.slug = explicitSlug;
  if (Object.keys(data).length === 0) throw badRequest("没有需要修改的内容");

  const name = data.name ?? currentName;
  const slug = data.slug ?? currentSlug;
  if (name === currentName && slug === currentSlug) return null;
  return { data, name, slug };
}

// ====== 分类 ======

export async function listCategoriesForAdmin() {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: categoryAdminSelect,
  });
  return categories.map(toCategoryAdminDto);
}

export async function createCategory(input: { name?: unknown; slug?: unknown }) {
  const name = requireName(input.name);
  const slug = optionalSlug(input.slug) ?? slugify(name);
  try {
    const created = await prisma.category.create({ data: { name, slug } });
    // 刚创建的记录不可能有关联文章，postCount 恒为 0，无需再查计数。
    return { id: created.id, name: created.name, slug: created.slug, postCount: 0 };
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    throw badRequest(await taxonomyConflictMessage("category", name, slug));
  }
}

export async function updateCategory(id: string, input: { name?: unknown; slug?: unknown }) {
  const existing = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { posts: true } } },
  });
  if (!existing) throw notFound("分类不存在");

  const update = computeTaxonomyUpdate(input, existing.name, existing.slug);
  if (!update) return toCategoryAdminDto(existing);

  try {
    const updated = await prisma.category.update({
      where: { id },
      data: update.data,
      include: { _count: { select: { posts: true } } },
    });
    return toCategoryAdminDto(updated);
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    throw badRequest(await taxonomyConflictMessage("category", update.name, update.slug));
  }
}

/** 删除分类。文章本身保留，postId 由外键 ON DELETE SET NULL 置空。 */
export async function deleteCategory(id: string) {
  try {
    await prisma.category.delete({ where: { id } });
  } catch (error) {
    // P2025 = 记录不存在；对外统一 404。
    if ((error as { code?: string }).code === "P2025") throw notFound("分类不存在");
    throw error;
  }
  return { deleted: true };
}

// ====== 标签 ======

/** 全量列表：含 0 篇文章的标签，postCount 统计含草稿的全部文章。 */
export async function listTagsForAdmin() {
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    select: tagAdminSelect,
  });
  return tags.map(toTagAdminDto);
}

export async function createTag(input: { name?: unknown; slug?: unknown }) {
  const name = requireName(input.name);
  const slug = optionalSlug(input.slug) ?? slugify(name);
  try {
    const created = await prisma.tag.create({ data: { name, slug } });
    return { id: created.id, name: created.name, slug: created.slug, postCount: 0 };
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    throw badRequest(await taxonomyConflictMessage("tag", name, slug));
  }
}

export async function updateTag(id: string, input: { name?: unknown; slug?: unknown }) {
  const existing = await prisma.tag.findUnique({
    where: { id },
    include: { _count: { select: { posts: true } } },
  });
  if (!existing) throw notFound("标签不存在");

  const update = computeTaxonomyUpdate(input, existing.name, existing.slug);
  if (!update) return toTagAdminDto(existing);

  try {
    const updated = await prisma.tag.update({
      where: { id },
      data: update.data,
      include: { _count: { select: { posts: true } } },
    });
    return toTagAdminDto(updated);
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    throw badRequest(await taxonomyConflictMessage("tag", update.name, update.slug));
  }
}

/** 删除标签。TagOnPost 关联级联删除——只是从文章移除标签，文章本身保留。 */
export async function deleteTag(id: string) {
  try {
    await prisma.tag.delete({ where: { id } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") throw notFound("标签不存在");
    throw error;
  }
  return { deleted: true };
}

/**
 * 把 source 标签的所有文章关联迁给 target，然后删除 source。
 *
 * 同一篇文章可能同时挂着两个标签：迁移前先查出 target 已有的关联，只补差集，
 * 避免 (postId, tagId) 复合主键冲突。两步写放进一个事务，失败即整体回滚——
 * 只删了 source 而关联没迁成功的中间状态不可接受。
 */
export async function mergeTag(sourceId: string, input: { targetId?: unknown }) {
  const targetId = typeof input.targetId === "string" ? input.targetId.trim() : "";
  if (!targetId) throw badRequest("请选择合并目标标签");
  if (targetId === sourceId) throw badRequest("不能合并到标签自身");

  const [source, target] = await Promise.all([
    prisma.tag.findUnique({ where: { id: sourceId }, select: { id: true } }),
    prisma.tag.findUnique({ where: { id: targetId }, select: { id: true } }),
  ]);
  if (!source) throw notFound("标签不存在");
  if (!target) throw notFound("合并目标标签不存在");

  const [sourceLinks, targetLinks] = await Promise.all([
    prisma.tagOnPost.findMany({ where: { tagId: sourceId }, select: { postId: true } }),
    prisma.tagOnPost.findMany({ where: { tagId: targetId }, select: { postId: true } }),
  ]);
  const alreadyLinked = new Set(targetLinks.map((link) => link.postId));
  const missing = sourceLinks
    .filter((link) => !alreadyLinked.has(link.postId))
    .map((link) => ({ postId: link.postId, tagId: targetId }));

  await prisma.$transaction([
    prisma.tagOnPost.createMany({ data: missing }),
    prisma.tag.delete({ where: { id: sourceId } }),
  ]);

  const updated = await prisma.tag.findUnique({ where: { id: targetId }, select: tagAdminSelect });
  return updated ? toTagAdminDto(updated) : null;
}
