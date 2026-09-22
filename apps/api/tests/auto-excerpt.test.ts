import assert from "node:assert/strict";
import { test } from "node:test";

import { autoExcerpt, extractHashTags } from "../src/lib/utils";

/**
 * 摘要派生的回归测试。
 *
 * 背景：旧实现靠「删除 Markdown 语法字符」生成摘要，`![alt](url)` 被删成
 * 「alt/url」、表格分隔线 `------` 原样残留，这类垃圾文本被存进数据库并
 * 展示在文章页标题下。这里钉住：摘要必须是**纯文本**，语法结构整体消失。
 */
test("autoExcerpt strips image syntax entirely instead of leaving alt/path debris", () => {
  const excerpt = autoExcerpt("前文。![泛型推断示意](/images/hero-bg.webp) 后文。");
  assert.equal(excerpt, "前文。 后文。");
  assert.ok(!excerpt.includes("/images/"));
  assert.ok(!excerpt.includes("泛型推断示意/images"));
});

test("autoExcerpt keeps table cell text but drops pipes and separator rows", () => {
  const excerpt = autoExcerpt(
    "| 工具类型 | 作用 |\n| --- | --- |\n| Partial<T> | 全部字段可选 |"
  );
  assert.ok(excerpt.includes("工具类型"));
  assert.ok(excerpt.includes("全部字段可选"));
  assert.ok(!excerpt.includes("|"));
  assert.ok(!excerpt.includes("---"));
});

test("autoExcerpt keeps link text, drops URLs and emphasis markers", () => {
  const excerpt = autoExcerpt("见 [TypeScript 手册](https://www.typescriptlang.org) 与 **加粗**。");
  assert.ok(excerpt.includes("TypeScript 手册"));
  assert.ok(!excerpt.includes("http"));
  assert.ok(!excerpt.includes("**"));
});

test("autoExcerpt drops fenced code, headings and rules, keeps inline code content", () => {
  const excerpt = autoExcerpt(
    "## 小标题\n正文一句。\n```ts\nconst x = 1;\n```\n---\n行内 `code()` 结束。"
  );
  assert.ok(excerpt.startsWith("正文一句。"));
  assert.ok(!excerpt.includes("const x")); // 围栏代码块整段消失
  assert.ok(excerpt.includes("行内 code() 结束。")); // 行内代码保留内容、去反引号
});

test("autoExcerpt truncates long content with an ellipsis", () => {
  const excerpt = autoExcerpt("长".repeat(300));
  assert.equal(excerpt.length, 203);
  assert.ok(excerpt.endsWith("..."));
});

test("extractHashTags strips fenced code and inline code before matching", () => {
  const content = [
    "---",
    "title: x",
    "---",
    "",
    "```c",
    "#include <stdio.h>",
    "#define MAX 10",
    "```",
    "",
    "```python",
    "# 这是注释",
    "```",
    "",
    "正文里的 `#include` 行内代码，和真正的 #手记 标签。",
  ].join("\n");
  assert.deepEqual(extractHashTags(content), ["手记"]);
});
