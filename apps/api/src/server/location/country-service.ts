import { findCountryDialOption } from "@/lib/countries";

const COUNTRY_HEADERS = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "cloudfront-viewer-country",
  "fastly-geo-country-code",
  "x-appengine-country",
  "x-country-code",
] as const;

const LANGUAGE_DEFAULTS: Record<string, string> = {
  zh: "CN",
  ja: "JP",
  ko: "KR",
  en: "US",
  fr: "FR",
  de: "DE",
  es: "ES",
  it: "IT",
  pt: "BR",
  ru: "RU",
  tr: "TR",
};

function supportedCountry(code: string | null): string | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return findCountryDialOption(normalized)?.code ?? null;
}

function languageCountry(acceptLanguage: string | null): string | null {
  const locale = acceptLanguage?.split(",")[0]?.trim().replace("_", "-");
  if (!locale) return null;

  const [language, region] = locale.split("-");
  return supportedCountry(region) || supportedCountry(LANGUAGE_DEFAULTS[language.toLowerCase()] || null);
}

export function inferCountry(headers: Headers): { countryCode: string; source: "ip" | "language" | "default" } {
  for (const header of COUNTRY_HEADERS) {
    const countryCode = supportedCountry(headers.get(header));
    if (countryCode) return { countryCode, source: "ip" };
  }

  const countryCode = languageCountry(headers.get("accept-language"));
  if (countryCode) return { countryCode, source: "language" };

  return { countryCode: "CN", source: "default" };
}
