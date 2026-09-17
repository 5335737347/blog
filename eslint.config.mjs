import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // This workspace uses only the App Router under apps/web/src/app. The
    // Pages-Router rule probes the repository root and emits a false warning.
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/.next/**",
    "**/out/**",
    "**/dist/**",
    "**/build/**",
    "**/next-env.d.ts",
    // 本地调研与冒烟产物：不进仓库，也不参与 lint
    "/.research/**",
    "/.npm-cache/**",
    "/backups/**",
    // 冒烟检查与隔离实例的构建目录（NEXT_DIST_DIR 指向这里）。里面是编译后的
    // JS，被扫到会报出成千上万条无意义的规则错误；`**/.next/**` 覆盖不到它。
    "apps/web/tmp/**",
  ]),
]);

export default eslintConfig;
