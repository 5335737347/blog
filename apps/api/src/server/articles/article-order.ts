import type { Prisma } from "@prisma/client";

/**
 * 文章的统一排序规则。
 *
 * 之前列表页用 `{ publishedAt: "desc" }`，而「上一篇/下一篇」用
 * `[publishedAt desc, createdAt desc]` —— 两处规则不同，时间戳相同时顺序会分叉，
 * 文章页给出的相邻链接和列表页显示的顺序对不上。
 *
 * 更重要的是：分页用的 `skip/take` 要求**全序**。仅按 publishedAt 排序时，
 * 时间相同的文章顺序不确定，翻页会漏掉或重复文章。批量导入（frontmatter 指定
 * 同一个 date）很容易触发这种情况。
 *
 * 加上唯一的 id 作为最终决胜键后，排序成为全序，分页与相邻查询都变得确定。
 * id 是 cuid，本身无时间含义，只用于打破平局。
 */
export const POST_ORDER_DESC: Prisma.PostOrderByWithRelationInput[] = [
  { publishedAt: "desc" },
  { createdAt: "desc" },
  { id: "desc" },
];

/** 与 POST_ORDER_DESC 完全相反的顺序。 */
export const POST_ORDER_ASC: Prisma.PostOrderByWithRelationInput[] = [
  { publishedAt: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
];

export type PostOrderKey = {
  id: string;
  publishedAt: Date | null;
  createdAt: Date;
};

/**
 * 在 POST_ORDER_DESC 中排在 key 之后的文章（即更旧的一篇）。
 *
 * 注意 SQLite 下 NULL 在 DESC 排序里位于最后，因此 publishedAt 为 NULL 的文章
 * 只有在同为 NULL 且 createdAt 更小时才排在后面。
 */
export function olderThanFilter(key: PostOrderKey): Prisma.PostWhereInput {
  if (key.publishedAt === null) {
    return {
      publishedAt: null,
      OR: [
        { createdAt: { lt: key.createdAt } },
        { createdAt: key.createdAt, id: { lt: key.id } },
      ],
    };
  }
  return {
    OR: [
      { publishedAt: { lt: key.publishedAt } },
      { publishedAt: key.publishedAt, createdAt: { lt: key.createdAt } },
      {
        publishedAt: key.publishedAt,
        createdAt: key.createdAt,
        id: { lt: key.id },
      },
    ],
  };
}

/** 在 POST_ORDER_DESC 中排在 key 之前的文章（即更新的一篇）。 */
export function newerThanFilter(key: PostOrderKey): Prisma.PostWhereInput {
  if (key.publishedAt === null) {
    return {
      OR: [
        { publishedAt: { not: null } },
        {
          publishedAt: null,
          OR: [
            { createdAt: { gt: key.createdAt } },
            { createdAt: key.createdAt, id: { gt: key.id } },
          ],
        },
      ],
    };
  }
  return {
    OR: [
      { publishedAt: { gt: key.publishedAt } },
      { publishedAt: key.publishedAt, createdAt: { gt: key.createdAt } },
      {
        publishedAt: key.publishedAt,
        createdAt: key.createdAt,
        id: { gt: key.id },
      },
    ],
  };
}
