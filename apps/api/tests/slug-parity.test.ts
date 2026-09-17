import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * slugify 是唯一被 api 与 web 同时使用的工具函数：
 *   - apps/api  用它生成文章 / 标签 / 分类的权威 slug；
 *   - apps/web  用它做后台编辑器的 slug 实时预览。
 *
 * 两边各有一份实现（web 不能导入 api 源码，见 docs/architecture.md），
 * 一旦其中一边被改动而另一边没跟上，后台预览就会和服务端实际保存的 URL 不一致。
 *
 * 这个测试是唯一合理的例外：它必须同时导入两份实现才能断言两者一致。
 * 任何一边调整 slug 规则时，这里会立刻失败。
 */
test("api and web slugify implementations stay identical", async () => {
  const { slugify: apiSlugify } = await import("../src/lib/utils");
  const { slugify: webSlugify } = await import("../../web/src/lib/utils");

  const cases = [
    // 纯中文：拼音转写
    "数据库索引原理与优化实践",
    "测试",
    "深入理解哈希表：从哈希函数到开放寻址",
    // 中英混排
    "CSS Grid 布局完全指南",
    "React 19 新特性速览：Server Components 来了",
    "Vim/Neovim 从入门到配置",
    // 纯拉丁：行为必须保持不变
    "Hello World",
    "rust",
    "Git 高级技巧：rebase、cherry-pick 和 bisect",
    // 边界与兜底
    "",
    "   ",
    "!!!",
    "：：：",
    "123",
    "#hashtag",
    // 超长：必须在词边界截断且不超上限
    "数据库索引原理与优化实践深入理解哈希表从哈希函数到开放寻址以及更多中文内容补充说明",
    "a".repeat(200),
  ];

  for (const input of cases) {
    const api = apiSlugify(input);
    const web = webSlugify(input);
    assert.equal(web, api, `slug 不一致，输入=${JSON.stringify(input)}: api=${api} web=${web}`);

    // 两者都必须满足的不变量
    assert.notEqual(api, "", `slug 不能为空，输入=${JSON.stringify(input)}`);
    assert.ok(!api.endsWith("-"), `slug 不应以连字符结尾: ${api}`);
    assert.ok(api.length <= 80, `slug 超长(${api.length}): ${api}`);
  }
});
