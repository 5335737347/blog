import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

export function normalizePhoneNumber(
  value: unknown,
  defaultCountry?: CountryCode
): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  const phone = parsePhoneNumberFromString(value.trim(), defaultCountry);
  return phone?.isValid() ? phone.number : null;
}
