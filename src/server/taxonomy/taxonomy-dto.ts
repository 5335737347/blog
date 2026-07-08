import type { Prisma } from "@prisma/client";

export const categoryWithPostCountSelect = {
  id: true,
  name: true,
  slug: true,
  _count: {
    select: {
      posts: {
        where: { published: true },
      },
    },
  },
} satisfies Prisma.CategorySelect;

export const tagWithPostCountSelect = {
  id: true,
  name: true,
  slug: true,
  _count: {
    select: {
      posts: {
        where: { post: { published: true } },
      },
    },
  },
} satisfies Prisma.TagSelect;

type CategoryWithPostCountRecord = Prisma.CategoryGetPayload<{
  select: typeof categoryWithPostCountSelect;
}>;

type TagWithPostCountRecord = Prisma.TagGetPayload<{
  select: typeof tagWithPostCountSelect;
}>;

export function toCategoryDto(category: CategoryWithPostCountRecord) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    postCount: category._count.posts,
  };
}

export function toTagDto(tag: TagWithPostCountRecord) {
  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    postCount: tag._count.posts,
  };
}

export type CategoryDto = ReturnType<typeof toCategoryDto>;
export type TagDto = ReturnType<typeof toTagDto>;
