import { prisma } from "@/lib/prisma";
import {
  categoryWithPostCountSelect,
  tagWithPostCountSelect,
  toCategoryDto,
  toTagDto,
} from "./taxonomy-dto";

export async function listCategories() {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: categoryWithPostCountSelect,
  });

  return categories.map(toCategoryDto);
}

export async function listTags() {
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    select: tagWithPostCountSelect,
  });

  return tags.map(toTagDto);
}
