// Dates, numbers and money, in the reader's language. The locale is read from i18next here rather than
// passed in, so call signatures stay as they were and the ~190 existing `money()` call sites are unchanged.
//
// Two things are pinned on purpose and must not be "fixed" later:
//   - Latin digits in both languages (`-nu-latn`). Arabic-Indic digits break tabular-nums in the
//     financial tables, survive neither the Excel export nor a paste into WhatsApp.
//   - The Gregorian calendar (`-ca-gregory`). A bare "ar-SA" resolves to Arabic-Indic digits today, and
//     on older ICU builds to the Umm al-Qura calendar, which would print a delivery date as 1448/05/28.
import { ar, enGB } from "date-fns/locale";
import type { Locale } from "date-fns";
import { LOCALE_TAG, type Language } from "@shared/i18n";
import i18n from "@/lib/i18n";

const lang = (): Language => (i18n.language === "en" ? "en" : "ar");

export const locale = () => LOCALE_TAG[lang()];

/** The date-fns locale object, for `format(date, pattern, { locale: dateLocale() })`. */
export const dateLocale = (): Locale => (lang() === "en" ? enGB : ar);

/** A money amount with two decimals and no currency mark; pair it with `t("currency.sar")`. */
export const money = (v: unknown) =>
  Number(v ?? 0).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A plain number: counts, quantities, percentages. */
export const num = (v: unknown, decimals = 0) =>
  Number(v ?? 0).toLocaleString(locale(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** A date as stored: the ISO day, with no timezone shifting. */
export const fmtDate = (v?: string | Date | null) => {
  if (!v) return "—";
  const iso = v instanceof Date ? v.toISOString() : String(v);
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(locale(), { year: "numeric", month: "short", day: "numeric" });
};

export const fmtDateTime = (v?: string | Date | null) => {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" });
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "قبل ٣ دقائق" with the right Arabic plural, or "3 minutes ago". Replaces the two hand-written,
 * English-only copies that used to live in notification-center.tsx and pages/notifications.tsx.
 */
export function timeAgo(v?: string | Date | null): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const elapsed = Date.now() - d.getTime();
  const t = i18n.t.bind(i18n);
  if (elapsed < MINUTE) return t("time_ago.just_now");
  if (elapsed < HOUR) return t("time_ago.minutes", { count: Math.floor(elapsed / MINUTE) });
  if (elapsed < DAY) return t("time_ago.hours", { count: Math.floor(elapsed / HOUR) });
  if (elapsed < 7 * DAY) return t("time_ago.days", { count: Math.floor(elapsed / DAY) });
  return fmtDate(d);
}
