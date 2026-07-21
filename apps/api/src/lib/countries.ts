import type { CountryCode } from "libphonenumber-js";

export interface CountryDialOption {
  code: CountryCode;
  name: string;
  dialCode: string;
}

export const COUNTRY_DIAL_OPTIONS: CountryDialOption[] = [
  { code: "CN", name: "中国大陆", dialCode: "+86" },
  { code: "HK", name: "中国香港", dialCode: "+852" },
  { code: "MO", name: "中国澳门", dialCode: "+853" },
  { code: "TW", name: "中国台湾", dialCode: "+886" },
  { code: "US", name: "美国", dialCode: "+1" },
  { code: "CA", name: "加拿大", dialCode: "+1" },
  { code: "GB", name: "英国", dialCode: "+44" },
  { code: "AU", name: "澳大利亚", dialCode: "+61" },
  { code: "NZ", name: "新西兰", dialCode: "+64" },
  { code: "JP", name: "日本", dialCode: "+81" },
  { code: "KR", name: "韩国", dialCode: "+82" },
  { code: "SG", name: "新加坡", dialCode: "+65" },
  { code: "MY", name: "马来西亚", dialCode: "+60" },
  { code: "TH", name: "泰国", dialCode: "+66" },
  { code: "VN", name: "越南", dialCode: "+84" },
  { code: "ID", name: "印度尼西亚", dialCode: "+62" },
  { code: "PH", name: "菲律宾", dialCode: "+63" },
  { code: "IN", name: "印度", dialCode: "+91" },
  { code: "RU", name: "俄罗斯", dialCode: "+7" },
  { code: "FR", name: "法国", dialCode: "+33" },
  { code: "DE", name: "德国", dialCode: "+49" },
  { code: "IT", name: "意大利", dialCode: "+39" },
  { code: "ES", name: "西班牙", dialCode: "+34" },
  { code: "NL", name: "荷兰", dialCode: "+31" },
  { code: "BE", name: "比利时", dialCode: "+32" },
  { code: "CH", name: "瑞士", dialCode: "+41" },
  { code: "AT", name: "奥地利", dialCode: "+43" },
  { code: "SE", name: "瑞典", dialCode: "+46" },
  { code: "NO", name: "挪威", dialCode: "+47" },
  { code: "DK", name: "丹麦", dialCode: "+45" },
  { code: "FI", name: "芬兰", dialCode: "+358" },
  { code: "IE", name: "爱尔兰", dialCode: "+353" },
  { code: "PT", name: "葡萄牙", dialCode: "+351" },
  { code: "PL", name: "波兰", dialCode: "+48" },
  { code: "CZ", name: "捷克", dialCode: "+420" },
  { code: "GR", name: "希腊", dialCode: "+30" },
  { code: "TR", name: "土耳其", dialCode: "+90" },
  { code: "AE", name: "阿联酋", dialCode: "+971" },
  { code: "SA", name: "沙特阿拉伯", dialCode: "+966" },
  { code: "IL", name: "以色列", dialCode: "+972" },
  { code: "EG", name: "埃及", dialCode: "+20" },
  { code: "ZA", name: "南非", dialCode: "+27" },
  { code: "BR", name: "巴西", dialCode: "+55" },
  { code: "MX", name: "墨西哥", dialCode: "+52" },
  { code: "AR", name: "阿根廷", dialCode: "+54" },
  { code: "CL", name: "智利", dialCode: "+56" },
  { code: "CO", name: "哥伦比亚", dialCode: "+57" },
  { code: "PE", name: "秘鲁", dialCode: "+51" },
];

export function countryFlag(code: string): string {
  return String.fromCodePoint(...code.toUpperCase().split("").map((char) => 127397 + char.charCodeAt(0)));
}

export function findCountryDialOption(code: string): CountryDialOption | undefined {
  return COUNTRY_DIAL_OPTIONS.find((country) => country.code === code.toUpperCase());
}
