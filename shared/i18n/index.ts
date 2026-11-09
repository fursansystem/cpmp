// The translation catalogue, shared so the server can render the same strings when notifications and
// emails join the scope. Arabic is the source language; English is the translation.
import arCommon from "./ar/common.json";
import enCommon from "./en/common.json";
import arEnums from "./ar/enums.json";
import enEnums from "./en/enums.json";
import arPayments from "./ar/payments.json";
import enPayments from "./en/payments.json";
import arPermits from "./ar/permits.json";
import enPermits from "./en/permits.json";
import arProcurement from "./ar/procurement.json";
import enProcurement from "./en/procurement.json";
import arSettings from "./ar/settings.json";
import enSettings from "./en/settings.json";
import arProjects from "./ar/projects.json";
import enProjects from "./en/projects.json";
import arNav from "./ar/nav.json";
import enNav from "./en/nav.json";
import arNotifications from "./ar/notifications.json";
import enNotifications from "./en/notifications.json";
import arWarehouse from "./ar/warehouse.json";
import enWarehouse from "./en/warehouse.json";
import arProgress from "./ar/progress.json";
import enProgress from "./en/progress.json";

export const LANGUAGES = ["ar", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export const isLanguage = (v: unknown): v is Language => LANGUAGES.includes(v as Language);

export const DEFAULT_LANGUAGE: Language = "ar";

// Direction is derived from the language and is never set anywhere else. Arabic with LTR, or English with
// RTL, are broken states with no use, so there is no separate direction switch in the app.
export const dirOf = (lang: Language): "rtl" | "ltr" => (lang === "ar" ? "rtl" : "ltr");

// Pinned, never a bare "ar-SA": that resolves to Arabic-Indic digits, and on older ICU builds to the
// Umm al-Qura calendar, so a delivery date would read 1448/05/28.
export const LOCALE_TAG: Record<Language, string> = {
  ar: "ar-SA-u-ca-gregory-nu-latn",
  en: "en-GB",
};

export const resources = {
  ar: { common: arCommon, enums: arEnums, payments: arPayments, permits: arPermits, procurement: arProcurement, settings: arSettings, projects: arProjects, nav: arNav, notifications: arNotifications, warehouse: arWarehouse, progress: arProgress },
  en: { common: enCommon, enums: enEnums, payments: enPayments, permits: enPermits, procurement: enProcurement, settings: enSettings, projects: enProjects, nav: enNav, notifications: enNotifications, warehouse: enWarehouse, progress: enProgress },
} as const;

export const defaultNS = "common";

// Status and category names, in one language. `enums.json` is the single source for them, and the
// `*_LABELS` maps in shared/payments.ts and shared/permits.ts are derived from it rather than holding
// their own copies.
type EnumGroup = keyof typeof arEnums;

export function enumLabel(group: EnumGroup, code: string, lang: Language = DEFAULT_LANGUAGE): string {
  const table = (resources[lang].enums as Record<string, Record<string, unknown>>)[group] ?? {};
  const value = table[code];
  return typeof value === "string" ? value : code;
}

// Both languages in one string, the way the app used to write them everywhere: "مسودة (Draft)".
// Printed documents keep this on purpose — a purchase order or a certificate goes to people who do
// not share one language. Nothing on screen should use it.
export function enumLabelBilingual(group: EnumGroup, code: string): string {
  const ar = enumLabel(group, code, "ar");
  const en = enumLabel(group, code, "en");
  return ar === en ? ar : `${ar} (${en})`;
}

/** Every code in a group, as the `Record<Code, string>` shape the old maps had. */
export function enumMap<T extends string>(group: EnumGroup, codes: readonly T[], lang: Language = DEFAULT_LANGUAGE): Record<T, string> {
  return Object.fromEntries(codes.map((c) => [c, enumLabel(group, c, lang)])) as Record<T, string>;
}

/** General translation lookup helper for server-side messages and notifications. */
export function translate(
  ns: keyof (typeof resources)["ar"],
  keyPath: string,
  params?: Record<string, unknown>,
  lang: Language = DEFAULT_LANGUAGE
): string {
  const table = (resources[lang] as Record<string, unknown>)?.[ns];
  const parts = keyPath.split(".");
  let val: unknown = table;
  for (const p of parts) {
    if (val && typeof val === "object") val = (val as Record<string, unknown>)[p];
    else { val = undefined; break; }
  }
  if (typeof val !== "string") {
    let fallbackVal: unknown = (resources.ar as Record<string, unknown>)?.[ns];
    for (const p of parts) {
      if (fallbackVal && typeof fallbackVal === "object") fallbackVal = (fallbackVal as Record<string, unknown>)[p];
      else { fallbackVal = undefined; break; }
    }
    if (typeof fallbackVal === "string") val = fallbackVal;
    else return `${String(ns)}:${keyPath}`;
  }
  const text = typeof val === "string" ? val : "";
  if (!params) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => (params[k] !== undefined ? String(params[k]) : `{{${k}}}`));
}
