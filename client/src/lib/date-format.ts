// date-fns with the reader's locale already applied.
//
// Importing `format` from here instead of from "date-fns" is the whole change: the ~44 call sites keep
// their patterns and arguments. Everything else date-fns exports passes straight through, so a file
// only has to swap its module specifier.
//
// Safe for machine-readable patterns too: the Arabic locale changes month and day names but keeps
// Latin digits, so `format(d, "yyyy-MM-dd")` still yields 2026-11-08.
import { format as dfFormat, formatDistanceToNow as dfFormatDistanceToNow, formatDistance as dfFormatDistance } from "date-fns";
import { dateLocale } from "@/lib/i18n-format";

export * from "date-fns";

export const format: typeof dfFormat = (date, pattern, options) =>
  dfFormat(date, pattern, { locale: dateLocale(), ...options });

export const formatDistanceToNow: typeof dfFormatDistanceToNow = (date, options) =>
  dfFormatDistanceToNow(date, { locale: dateLocale(), ...options });

export const formatDistance: typeof dfFormatDistance = (date, base, options) =>
  dfFormatDistance(date, base, { locale: dateLocale(), ...options });
