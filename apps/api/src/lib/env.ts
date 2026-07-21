const MIN_SECRET_LENGTH = 32;

function cleanEnvValue(value: string | undefined): string {
  return value?.trim() ?? "";
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

export function getJwtSecret(): string {
  const secret = cleanEnvValue(process.env.JWT_SECRET);
  if (!secret || secret === "replace-with-a-random-secret" || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be set to a random string with at least ${MIN_SECRET_LENGTH} characters`
    );
  }
  return secret;
}
