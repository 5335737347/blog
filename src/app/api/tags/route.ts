import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/tags — list all tags with post counts
export async function GET() {
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    select: {
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
    },
  });

  return NextResponse.json(
    tags.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      postCount: t._count.posts,
    }))
  );
}
