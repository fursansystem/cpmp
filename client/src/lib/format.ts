import { locale, money, num } from "@/lib/i18n-format";

// This used to hardcode en-US and the dollar sign. The business is in riyals, and the figures now
// follow the reader's language; the currency word itself comes from the `common:currency.sar` key
// wherever one is shown.
export function formatCurrency(value: number): string {
  return num(value);
}

/** Compact form for dashboard tiles: 2.4M, 350K. */
export function formatLargeCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString(locale(), { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${(value / 1_000).toLocaleString(locale(), { maximumFractionDigits: 0 })}K`;
  return money(value);
}
