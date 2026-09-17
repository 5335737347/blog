const MIN_SECRET_LENGTH = 32;
const MIN_DISTINCT_CHARACTERS = 10;

function cleanEnvValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

/**
 * 常见占位符特征（对 secret 小写后做子串匹配）。
 *
 * 这里原先只精确匹配一个字符串 "replace-with-a-random-secret"。但仓库里实际
 * 使用的占位符是 "change-me-to-a-random-string-in-production"——42 个字符满足
 * 长度要求，又不在那个单值名单里，于是被照单全收：API 会用一个写在仓库里、
 * 人人可猜的字符串签发和校验会话。
 *
 * 单值黑名单本质上挡不住「换了个拼写」的占位符，所以改为按特征匹配。
 * 随机生成的十六进制/base64 密钥不可能包含这些英文单词。
 */
const PLACEHOLDER_MARKERS = [
  "change-me",
  "change_me",
  "changeme",
  "changethis",
  "replace",
  "placeholder",
  "your-secret",
  "your_secret",
  "in-production",
  "for-production",
  "example",
  "sample",
  "dummy",
  "todo",
  "fixme",
];

/** 返回不可用的原因；null 表示这个 secret 可以用。 */
function secretProblem(secret: string): string | null {
  if (!secret) return "未设置";
  if (secret.length < MIN_SECRET_LENGTH) {
    return `长度不足 ${MIN_SECRET_LENGTH} 个字符`;
  }

  const lowered = secret.toLowerCase();
  const marker = PLACEHOLDER_MARKERS.find((value) => lowered.includes(value));
  if (marker) return `看起来是占位符（包含 "${marker}"）`;

  // 长度不等于熵："aaaa...a" 有 32 个字符但只有 1 种字符。
  const distinct = new Set(secret).size;
  if (distinct < MIN_DISTINCT_CHARACTERS) {
    return `熵太低（只有 ${distinct} 种不同字符，至少需要 ${MIN_DISTINCT_CHARACTERS} 种）`;
  }

  return null;
}

export function getJwtSecret(): string {
  const secret = cleanEnvValue(process.env.JWT_SECRET);
  const problem = secretProblem(secret);
  if (problem) {
    throw new Error(
      `JWT_SECRET ${problem}。请用 openssl rand -hex 32 生成后写入环境变量。`
    );
  }
  return secret;
}

export function getSiteUrl(): string {
  const value = cleanEnvValue(process.env.SITE_URL);
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

export function getOpenGraphImageUrl(): string {
  return cleanEnvValue(process.env.OG_IMAGE_URL);
}
