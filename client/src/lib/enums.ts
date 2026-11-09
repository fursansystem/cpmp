// Status and category names in the reader's language.
//
// The `*_LABELS` maps in shared/ are plain constants evaluated once at module load, so they can only
// ever hold one language — they are the server's view. On screen the name has to follow whoever is
// looking, which is what this resolves.
import i18n from "@/lib/i18n";
import { enumLabelBilingual } from "@shared/i18n";

export type EnumGroup =
  | "sub_cert"
  | "chargeback"
  | "bill_request"
  | "payment_order"
  | "fine"
  | "liable_party"
  | "payment_method"
  | "permit_status"
  | "permit_kind"
  | "step_status"
  | "requirement_kind"
  | "requirement_status"
  | "step_party"
  | "permit_category"
  | "permit_action"
  | "permit_attention"
  | "payment_action"
  | "receipt_source"
  | "manual_movement";

/**
 * The name of one code, translated. Falls back to the code itself rather than to the other language,
 * so a missing translation is visible instead of quietly reintroducing the mixing.
 */
export function enumText(group: EnumGroup, code: string | null | undefined): string {
  if (!code) return "—";
  return i18n.t(`enums:${group}.${code}`, { defaultValue: code });
}

export function webhookEventLabel(event: string): string {
  return i18n.t(`enums:webhook_event.${event}.label`, { defaultValue: event });
}

export function webhookEventDescription(event: string): string {
  return i18n.t(`enums:webhook_event.${event}.description`, { defaultValue: "" });
}

/**
 * Both languages in one string. Printed documents only — a purchase order or a certificate goes to
 * people who do not share one language, which is the one place the mixing is wanted.
 */
export { enumLabelBilingual };

/** The codes of a group with their translated names, for building a Select. */
export function enumOptions(group: EnumGroup, codes: readonly string[]): { value: string; label: string }[] {
  return codes.map((value) => ({ value, label: enumText(group, value) }));
}
