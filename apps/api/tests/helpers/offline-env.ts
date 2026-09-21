/**
 * 测试进程的全局环境隔离。
 *
 * 由 `tsx --test --import ./tests/helpers/offline-env.ts` 在所有测试文件**之前**加载，
 * 因此每个测试文件（无论是否使用 createTestDatabase）都自动生效，不需要各自记得调用。
 *
 * 为什么必须放在最前面：bootstrap-env 用 `override: false` 加载 .env / .env.local，
 * 只有在它之前就把变量定义好（哪怕定义成空串），才能挡住开发机上的真实配置。
 */

/**
 * 把邮件投递钉成「离线」。
 *
 * 多个端点（注册验证码、重置密码验证码）会触发真实投递。开发机上的 .env.local
 * 通常配好了 SMTP，于是测试会**真的通过 Resend 往外发信**——既消耗服务商配额，
 * 又让测试结果依赖开发机的环境。这个坑已经踩过两次。
 *
 * 2026-09-21 第三次：新增 RESEND_API_KEY（HTTPS 投递路径）后没有同步加进这份
 * 清单，生产服务器根目录 .env 配上真 Key 的当晚，check:ci 的测试套件整个挂住
 * （smtp.test.ts 本该连本地假 SMTP，却拿真 Key 去请求 api.resend.com）。
 * 教训固化为规则：**每新增一个邮件提供商变量，必须同步加进这份清单**——
 * 与 .env.example / docs/environment.md 的同步要求并列。
 */
for (const key of [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_STARTTLS",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "RESEND_API_KEY",
  "RESEND_FROM",
]) {
  delete process.env[key];
  process.env[key] = "";
}

// 允许显式开关返回调试验证码，避免测试依赖 SMTP，或落到「邮箱服务未配置」。
process.env.ALLOW_DEBUG_VERIFICATION_CODE = "true";

// 测试不经过反向代理，直接对端即客户端。
process.env.TRUST_PROXY = "false";
delete process.env.TRUST_PROXY_HEADER;
