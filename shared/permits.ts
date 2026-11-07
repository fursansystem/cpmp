// الرخص والمعاملات (Permits & transactions) — shared constants, labels and payload types.
// The government-service catalogue is modelled on the service cards of the national portal (my.gov.sa):
// a service has an authority, a category, steps, requirements and documents, a fee and an expected duration.
// A transaction is one run of a service for one project; a licence is a transaction whose result expires.

export const PERMIT_STATUSES = ["not_started", "in_progress", "submitted", "returned", "completed", "rejected", "cancelled", "expired"] as const;
export type PermitStatus = (typeof PERMIT_STATUSES)[number];

export const PERMIT_STATUS_LABELS: Record<PermitStatus, string> = {
  not_started: "لم تبدأ (Not started)",
  in_progress: "قيد الإجراء (In progress)",
  submitted: "مقدَّمة للجهة (Submitted)",
  returned: "مُعادة للاستيفاء (Returned)",
  completed: "مكتملة / صدرت (Completed)",
  rejected: "مرفوضة (Rejected)",
  cancelled: "ملغاة (Cancelled)",
  expired: "منتهية (Expired)",
};

// Still being worked on
export const OPEN_PERMIT = ["not_started", "in_progress", "submitted", "returned"] as const;

export const PERMIT_KINDS = ["license", "transaction"] as const;
export type PermitKind = (typeof PERMIT_KINDS)[number];
export const PERMIT_KIND_LABELS: Record<PermitKind, string> = {
  license: "رخصة (لها تاريخ انتهاء)",
  transaction: "معاملة",
};

export const STEP_STATUSES = ["pending", "in_progress", "done", "skipped"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];
export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  pending: "لم تبدأ",
  in_progress: "جارية",
  done: "منجزة",
  skipped: "متجاوزة",
};

export const REQUIREMENT_KINDS = ["document", "condition"] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];
export const REQUIREMENT_KIND_LABELS: Record<RequirementKind, string> = {
  document: "مستند",
  condition: "شرط / متطلب",
};

export const REQUIREMENT_STATUSES = ["missing", "provided", "not_applicable"] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];
export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  missing: "غير مستوفى",
  provided: "مستوفى",
  not_applicable: "لا ينطبق",
};

// Which side of the project usually does a step; used to suggest an assignee
export const STEP_PARTIES = ["developer", "contractor", "consultant", "any"] as const;
export type StepParty = (typeof STEP_PARTIES)[number];
export const STEP_PARTY_LABELS: Record<StepParty, string> = {
  developer: "المطوّر",
  contractor: "المقاول",
  consultant: "الاستشاري",
  any: "أي طرف",
};

export const PERMIT_CATEGORIES = ["municipal", "civil_defense", "electricity", "water", "environment", "real_estate", "insurance", "other"] as const;
export type PermitCategory = (typeof PERMIT_CATEGORIES)[number];
export const PERMIT_CATEGORY_LABELS: Record<PermitCategory, string> = {
  municipal: "البلديات ورخص البناء",
  civil_defense: "الدفاع المدني والسلامة",
  electricity: "الكهرباء",
  water: "المياه والصرف",
  environment: "البيئة",
  real_estate: "العقار والبيع على الخارطة",
  insurance: "التأمين",
  other: "أخرى",
};

export const PERMIT_ACTIONS = ["start", "submit", "return", "complete", "reject", "cancel", "reopen"] as const;
export type PermitAction = (typeof PERMIT_ACTIONS)[number];

// Which statuses each action may start from, and where it goes
export const PERMIT_TRANSITIONS: Record<PermitAction, { from: readonly PermitStatus[]; to: PermitStatus; label: string }> = {
  start: { from: ["not_started"], to: "in_progress", label: "بدء الإجراء" },
  submit: { from: ["not_started", "in_progress", "returned"], to: "submitted", label: "تقديم للجهة" },
  return: { from: ["submitted"], to: "returned", label: "أعادتها الجهة للاستيفاء" },
  complete: { from: ["not_started", "in_progress", "submitted", "returned"], to: "completed", label: "اكتملت / صدرت" },
  reject: { from: ["submitted", "returned", "in_progress"], to: "rejected", label: "رفضتها الجهة" },
  cancel: { from: ["not_started", "in_progress", "submitted", "returned"], to: "cancelled", label: "إلغاء" },
  reopen: { from: ["completed", "rejected", "cancelled", "expired"], to: "in_progress", label: "إعادة فتح" },
};

// Default number of days before expiry that a licence starts showing as "expiring soon"
export const DEFAULT_RENEWAL_LEAD_DAYS = 30;
// Notices go out at the service's lead time, then a week before, then on the day it expires
export const EXPIRY_FINAL_NOTICE_DAYS = 7;

export type PermitAttention = "expired" | "expiring" | "overdue" | "awaiting_payment";
export const PERMIT_ATTENTION_LABELS: Record<PermitAttention, string> = {
  expired: "منتهية",
  expiring: "تنتهي قريباً",
  overdue: "متأخرة",
  awaiting_payment: "رسوم غير مسددة",
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return isoDay(d);
}

export function daysUntil(iso: string, today = isoDay(new Date())): number {
  return Math.round((new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
}

// Why a transaction needs someone's eye, if it does. One definition for the server, the page and the reports.
export function permitAttention(
  t: { status: string; dueDate?: string | null; expiryDate?: string | null; feeAmount?: unknown; feePaid?: boolean | null; renewalLeadDays?: number | null },
  today = isoDay(new Date()),
): PermitAttention | null {
  if (t.status === "expired" || (t.status === "completed" && t.expiryDate && t.expiryDate < today)) return "expired";
  const lead = t.renewalLeadDays ?? DEFAULT_RENEWAL_LEAD_DAYS;
  if (t.status === "completed" && t.expiryDate && t.expiryDate <= addDays(today, lead)) return "expiring";
  const open = (OPEN_PERMIT as readonly string[]).includes(t.status);
  if (open && t.dueDate && t.dueDate < today) return "overdue";
  if (open && Number(t.feeAmount ?? 0) > 0 && !t.feePaid) return "awaiting_payment";
  return null;
}

// What a person may do in the section. Developer = the project's owning organization.
export interface PermitsProjectRef {
  id: string;
  name: string;
  isDeveloper: boolean; // may create and manage transactions on this project
  canRequestPayment: boolean;
}

export interface PermitsContext {
  projects: PermitsProjectRef[];
  isAccounting: boolean;
  canManageSystemCatalog: boolean; // super admin: edits the built-in catalogue
  canManageOrgCatalog: boolean; // developer admins: add their own services
  userId: string;
}

export interface PermitUserRef {
  id: string;
  name: string;
  party: "developer" | "contractor" | "consultant";
}

// The fee rows the Payments section shows (orders source picker, licence report, cash-flow forecast)
export interface PermitFeeRow {
  id: string;
  projectId: string;
  projectName: string;
  transactionNo: string;
  title: string;
  authorityName: string | null;
  kind: string;
  status: string;
  dueDate: string | null;
  expiryDate: string | null;
  feeAmount: string;
  feePaid: boolean;
  renewalLeadDays: number | null;
}
