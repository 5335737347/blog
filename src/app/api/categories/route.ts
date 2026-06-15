import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/categories — list all categories
export async function GET() {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: {
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
    },
  });

  return NextResponse.json(
    categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      postCount: c._count.posts,
    }))
  );
}
