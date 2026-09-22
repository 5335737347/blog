import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { badRequest, notFound } from "@/server/errors";
import type { Prisma } from "@prisma/client";

/**
 * 项目合集的后台管理操作（结构与分类管理同构，多了 description/coverImage）。
 *
 * 与 Category 的分工：分类是内容题材，项目是写作期间的工作单元；一篇文章
 * 至多属于一个项目（Post.projectId，可空）。slug 是公开 URL 的一部分
 * （/collections/[slug]），重命名默认不改 slug，与分类/标签同一条规则。
 */

const projectSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  coverImage: true,
  createdAt: true,
  _count: { select: { posts: true } },
} satisfies Prisma.ProjectSelect;

type ProjectRecord = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>;

export function toProjectDto(project: ProjectRecord) {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    coverImage: project.coverImage,
    createdAt: project.createdAt.toISOString(),
    postCount: project._count.posts,
  };
}

const MAX_NAME_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 500;

function requireName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw badRequest("名称不能为空");
  if (name.length > MAX_NAME_LENGTH) {
    throw badRequest(`名称不能超过 ${MAX_NAME_LENGTH} 个字符`);
  }
  return name;
}

function optionalText(value: unknown, max: number, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return undefined;
  if (text.length > max) throw badRequest(`${label}不能超过 ${max} 个字符`);
  return text;
}

/** 显式提供的 slug（可选）；空串视为未提供。过 slugify 归一。 */
function optionalSlug(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return undefined;
  const slug = slugify(raw);
  if (!slug) throw badRequest("slug 格式不正确");
  if (slug.length > 80) throw badRequest("slug 过长");
  return slug;
}

function optionalCoverImage(value: unknown): string | undefined {
  const url = optionalText(value, 2048, "封面地址");
  return url ?? undefined;
}

async function conflictMessage(name: string, slug: string): Promise<string> {
  const byName = await prisma.project.findUnique({ where: { name }, select: { name: true } });
  if (byName) return "同名项目已存在";
  const bySlug = await prisma.project.findUnique({ where: { slug }, select: { slug: true } });
  if (bySlug) return "相同链接标识（slug）已存在";
  return "名称或 slug 已存在";
}

interface ProjectInput {
  name?: unknown;
  slug?: unknown;
  description?: unknown;
  coverImage?: unknown;
}

/** 全量列表（含草稿计数）。公开端语义在 listProjectsPublic。 */
export async function listProjectsForAdmin() {
  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    select: projectSelect,
  });
  return projects.map(toProjectDto);
}

/** 公开口径：全部项目保留为导航占位（与分类一致），但计数只算已发布。 */
export async function listProjectsPublic() {
  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      coverImage: true,
      createdAt: true,
      _count: { select: { posts: { where: { published: true } } } },
    } satisfies Prisma.ProjectSelect,
  });
  return projects.map(toProjectDto);
}

export async function createProject(input: ProjectInput) {
  const name = requireName(input.name);
  const slug = optionalSlug(input.slug) ?? slugify(name);
  const description = optionalText(input.description, MAX_DESCRIPTION_LENGTH, "项目简介") ?? "";
  const coverImage = optionalCoverImage(input.coverImage);
  try {
    const created = await prisma.project.create({
      data: { name, slug, description, coverImage },
    });
    // 新建项目不可能有文章，postCount 恒为 0，无需再查计数。
    return toProjectDto({ ...created, _count: { posts: 0 } });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    throw badRequest(await conflictMessage(name, slug));
  }
}

export async function updateProject(id: string, input: ProjectInput) {
  const existing = await prisma.project.findUnique({ where: { id }, select: projectSelect });
  if (!existing) throw notFound("项目不存在");

  const data: {
    name?: string;
    slug?: string;
    description?: string;
    coverImage?: string | null;
  } = {};
  if (input.name !== undefined) data.name = requireName(input.name);
  const explicitSlug = optionalSlug(input.slug);
  if (explicitSlug !== undefined) data.slug = explicitSlug;
  if (input.description !== undefined) {
    data.description = optionalText(input.description, MAX_DESCRIPTION_LENGTH, "项目简介") ?? "";
  }
  if (input.coverImage !== undefined) {
    data.coverImage = optionalCoverImage(input.coverImage) ?? null;
  }
  if (Object.keys(data).length === 0) throw badRequest("没有需要修改的内容");

  const name = data.name ?? existing.name;
  const slug = data.slug ?? existing.slug;
  if (name === existing.name && slug === existing.slug && data.description === undefined && data.coverImage === undefined) {
    return toProjectDto(existing);
  }

  try {
    const updated = await prisma.project.update({ where: { id }, data, select: projectSelect });
    return toProjectDto(updated);
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    throw badRequest(await conflictMessage(name, slug));
  }
}

/** 删除项目。文章保留，projectId 由外键 ON DELETE SET NULL 置空。 */
export async function deleteProject(id: string) {
  try {
    await prisma.project.delete({ where: { id } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") throw notFound("项目不存在");
    throw error;
  }
  return { deleted: true };
}
