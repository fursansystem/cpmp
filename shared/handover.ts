// تسليم الوحدات (Unit Handover) — shared constants, status labels, and mandatory completion gates.
import { enumMap } from "./i18n";

export const HANDOVER_STATUSES = [
  "draft",
  "snagging",
  "ready_for_handover",
  "meter_transfer",
  "handed_over",
  "cancelled",
] as const;
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];
export const HANDOVER_STATUS_LABELS: Record<HandoverStatus, string> = enumMap("handover_status", HANDOVER_STATUSES);

export const METER_TRANSFER_STATUSES = [
  "not_started",
  "requested",
  "client_confirmed",
  "transferred",
  "skipped",
] as const;
export type MeterTransferStatus = (typeof METER_TRANSFER_STATUSES)[number];
export const METER_TRANSFER_STATUS_LABELS: Record<MeterTransferStatus, string> = enumMap("meter_transfer_status", METER_TRANSFER_STATUSES);

export const HANDOVER_ATTACHMENT_CATEGORIES = [
  "meter_transfer",
  "id_copy",
  "protocol",
  "other",
] as const;
export type HandoverAttachmentCategory = (typeof HANDOVER_ATTACHMENT_CATEGORIES)[number];

export const SEC_PORTAL_URL = "https://www.se.com.sa";

export interface HandoverCompletionCheck {
  ready: boolean;
  openSnagsCount: number;
  meterTransferDone: boolean;
  reasons: ("open_snags" | "meter_transfer_pending")[];
}

/**
 * Mandatory gate for completing unit handover:
 * 1. Zero open/unclosed snags on the unit's handover snag list.
 * 2. Electricity meter transfer status is either 'transferred' or 'skipped'.
 */
export function checkHandoverCompletionGate(
  openSnagsCount: number,
  meterTransferStatus: string | null | undefined,
): HandoverCompletionCheck {
  const meterTransferDone = meterTransferStatus === "transferred" || meterTransferStatus === "skipped";
  const reasons: ("open_snags" | "meter_transfer_pending")[] = [];
  if (openSnagsCount > 0) reasons.push("open_snags");
  if (!meterTransferDone) reasons.push("meter_transfer_pending");
  return {
    ready: reasons.length === 0,
    openSnagsCount,
    meterTransferDone,
    reasons,
  };
}
