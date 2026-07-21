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
