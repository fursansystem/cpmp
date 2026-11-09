// Reference data that the database already holds in both languages: work-list divisions, chapters and
// activities, checklist items, work levels, request types, purposes, positions, WBS nodes, permit
// authorities, and the names of organizations and people.
//
// Which column to show is not a JSX decision — it follows the reader. Before this, the choice was
// written into each screen: `{chapter.nameEnglish}` in one place, `{org.nameArabic}` in another, and
// `{l.nameEnglish} {l.nameArabic}` side by side in the WBS editor.
//
// This is not translation. If the other column is empty — the English side is nullable on WBS nodes
// and permit authorities — the row falls back to the language it does have, because showing a blank
// is worse than showing the wrong language.
import i18n from "@/lib/i18n";

const isArabic = () => i18n.language !== "en";

const pick = (arabic: unknown, english: unknown): string => {
  const ar = typeof arabic === "string" ? arabic.trim() : "";
  const en = typeof english === "string" ? english.trim() : "";
  if (isArabic()) return ar || en;
  return en || ar;
};

/** A row's display name, whichever of the paired columns the reader's language calls for. */
export function localizedName(row: any, fallback = "—"): string {
  if (!row) return fallback;
  return (
    pick(row.nameArabic ?? row.name_arabic ?? row.nameAr ?? row.name_ar, row.nameEnglish ?? row.name_english ?? row.nameEn ?? row.name_en) ||
    pick(row.titleArabic ?? row.title_arabic, row.titleEnglish ?? row.title_english) ||
    pick(row.fullNameArabic ?? row.full_name_arabic, row.fullName ?? row.full_name) ||
    // permit_authorities and organizations keep Arabic in `name` with English beside it
    pick(row.name, row.nameEn ?? row.name_en) ||
    fallback
  );
}

/** The same choice for a pair already in hand. */
export const localized = (arabic: unknown, english: unknown, fallback = "—") => pick(arabic, english) || fallback;
