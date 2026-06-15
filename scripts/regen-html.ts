import { PrismaClient } from "@prisma/client";
import { renderMarkdown } from "../src/lib/utils";

const p = new PrismaClient();

(async () => {
  const posts = await p.post.findMany();
  let c = 0;
  for (const post of posts) {
    const h = renderMarkdown(post.content);
    if (post.contentHtml !== h) {
      await p.post.update({ where: { id: post.id }, data: { contentHtml: h } });
      c++;
    }
  }
  console.log("Updated " + c + " posts");
  await p.$disconnect();
})();
