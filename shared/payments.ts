// المدفوعات (Payments) — shared constants, labels and report types.
// Used by both the server routes and the Payments page so the two never disagree on a status name.

export const BILL_REQUEST_STATUSES = ["requested", "submitted", "received", "returned", "cancelled"] as const;
export type BillRequestStatus = (typeof BILL_REQUEST_STATUSES)[number];

export const PAYMENT_ORDER_STATUSES = ["draft", "pending_approval", "approved", "paid", "rejected", "cancelled"] as const;
export type PaymentOrderStatus = (typeof PAYMENT_ORDER_STATUSES)[number];

export const CLEARANCE_STATUSES = ["pending", "in_progress", "obtained", "rejected", "expired"] as const;
export type ClearanceStatus = (typeof CLEARANCE_STATUSES)[number];

export const FINE_STATUSES = ["open", "under_appeal", "waiver_requested", "payment_requested", "paid", "waived", "cancelled"] as const;
export type FineStatus = (typeof FINE_STATUSES)[number];

export const LIABLE_PARTIES = ["contractor", "owner", "consultant", "supplier", "other"] as const;
export type LiableParty = (typeof LIABLE_PARTIES)[number];

export const PAYMENT_METHODS = ["bank_transfer", "cheque", "cash"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_ENTITY_TYPES = ["bill_request", "payment_order", "clearance", "fine", "subcontractor_certificate"] as const;
export type PaymentEntityType = (typeof PAYMENT_ENTITY_TYPES)[number];

// مستخلصات مقاولي الباطن: raised on the project side, approved by a project manager,
// then paid through a payment order
export const SUB_CERT_STATUSES = ["draft", "submitted", "approved", "rejected", "paid", "cancelled"] as const;
export type SubCertStatus = (typeof SUB_CERT_STATUSES)[number];

export const SUB_CERT_LABELS: Record<SubCertStatus, string> = {
  draft: "مسودة (Draft)",
  submitted: "بانتظار الاعتماد (Submitted)",
  approved: "معتمد (Approved)",
  rejected: "مرفوض (Rejected)",
  paid: "مدفوع (Paid)",
  cancelled: "ملغي (Cancelled)",
};

// The amount actually payable on a subcontractor certificate. One definition, used by the
// server when it saves and by the form's live preview, so the two can never disagree:
//   net = gross work value - retention - advance recovery - other deductions + VAT on gross
export function computeSubCert(input: {
  grossAmount: number;
  retentionPercent: number;
  advanceRecovery: number;
  otherDeductions: number;
  vatPercent: number;
}) {
  const round = (v: number) => Math.round(v * 100) / 100;
  const retentionAmount = round((input.grossAmount * input.retentionPercent) / 100);
  const vatAmount = round((input.grossAmount * input.vatPercent) / 100);
  const netPayable = round(input.grossAmount - retentionAmount - input.advanceRecovery - input.otherDeductions + vatAmount);
  return { retentionAmount, vatAmount, netPayable };
}

export const BILL_REQUEST_LABELS: Record<BillRequestStatus, string> = {
  requested: "مطلوب (Requested)",
  submitted: "تم الإرسال (Submitted)",
  received: "تم الاستلام (Received)",
  returned: "معاد للتصحيح (Returned)",
  cancelled: "ملغي (Cancelled)",
};

export const PAYMENT_ORDER_LABELS: Record<PaymentOrderStatus, string> = {
  draft: "مسودة (Draft)",
  pending_approval: "بانتظار الاعتماد (Pending approval)",
  approved: "معتمد (Approved)",
  paid: "مدفوع (Paid)",
  rejected: "مرفوض (Rejected)",
  cancelled: "ملغي (Cancelled)",
};

export const CLEARANCE_LABELS: Record<ClearanceStatus, string> = {
  pending: "لم يبدأ (Pending)",
  in_progress: "قيد المعالجة (In progress)",
  obtained: "تم الحصول عليه (Obtained)",
  rejected: "مرفوض (Rejected)",
  expired: "منتهي (Expired)",
};

export const FINE_LABELS: Record<FineStatus, string> = {
  open: "مفتوحة (Open)",
  under_appeal: "قيد الاعتراض (Under appeal)",
  payment_requested: "تم طلب السداد (Payment requested)",
  paid: "مسددة (Paid)",
  waiver_requested: "طلب إعفاء (Waiver requested)",
  waived: "معفاة (Waived)",
  cancelled: "ملغاة (Cancelled)",
};

export const LIABLE_PARTY_LABELS: Record<LiableParty, string> = {
  contractor: "المقاول (Contractor)",
  owner: "المالك (Owner)",
  consultant: "الاستشاري (Consultant)",
  supplier: "المورد (Supplier)",
  other: "أخرى (Other)",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "تحويل بنكي (Bank transfer)",
  cheque: "شيك (Cheque)",
  cash: "نقداً (Cash)",
};

// What a person with the Payments section open is allowed to do. Computed once on the server
// (it needs the user's job position, which lives in the database) and sent to the page.
export interface PaymentsPermissions {
  // Accounting department: raises bill requests and payment orders, confirms receipt, records payment
  isAccounting: boolean;
  // Approves payment orders and fine-waiver requests: project managers and administrators
  canApprove: boolean;
}

// Statuses that still need somebody to act, used by the reports and the "open" counters.
export const OPEN_BILL_REQUEST = ["requested", "submitted", "returned"] as const;
export const OPEN_PAYMENT_ORDER = ["draft", "pending_approval", "approved"] as const;
export const OPEN_CLEARANCE = ["pending", "in_progress"] as const;
export const OPEN_FINE = ["open", "under_appeal", "waiver_requested", "payment_requested"] as const;

// How many days before expiry a clearance starts showing as "expiring soon"
export const CLEARANCE_EXPIRY_WARNING_DAYS = 30;

export interface PaymentsProjectSummary {
  projectId: string;
  projectName: string;
  openBillRequests: number;
  overdueBillRequests: number;
  pendingOrdersAmount: number;
  approvedUnpaidAmount: number;
  paidAmount: number;
  openClearances: number;
  clearancesAttention: number; // expired, or expiring soon, or overdue
  openFinesAmount: number;
  openFinesCount: number;
}

// Where a purchase order stands against what has been invoiced and paid on it.
//   invoiced  invoices listed on live bill requests that point at the PO
//   ordered   payment orders raised against the PO (advances included), not counting cancelled/rejected ones
//   paid      the part of `ordered` that has actually been paid
// An advance is later recovered inside an invoice's payment, so the two are not added together:
// the money committed is whichever of invoiced / ordered is larger.
export interface PoSummary {
  id: string;
  projectId: string;
  projectName: string;
  poNumber: string;
  title: string;
  supplierName: string | null;
  value: number;
  invoiced: number;
  ordered: number;
  paid: number;
  advances: number;
  committed: number;
  remaining: number; // negative when over
  over: boolean;
}

export const poCommitted = (invoiced: number, ordered: number) => Math.max(invoiced, ordered);
// A cent of rounding is not an overrun
export const isPoOver =(committed: number, value: number) => value > 0 && committed > value + 0.005;

export interface PaymentsReport {
  generatedAt: string;
  totals: {
    openBillRequests: number;
    overdueBillRequests: number;
    ordersPendingApproval: number;
    ordersPendingApprovalAmount: number;
    ordersApprovedUnpaidAmount: number;
    paidThisMonthAmount: number;
    paidTotalAmount: number;
    openClearances: number;
    clearancesAttention: number;
    openFinesCount: number;
    openFinesAmount: number;
    subCertsPendingCount: number; // submitted, waiting for a project manager
    subCertsPendingAmount: number; // net payable of those
    subCertsApprovedUnpaidAmount: number; // approved, not yet paid
    subRetentionHeld: number; // retention withheld on approved and paid certificates
    poOverCount: number; // purchase orders whose invoices/payments exceed their value
    paidFinesAmount: number;
  };
  byProject: PaymentsProjectSummary[];
  monthlyPaid: { month: string; amount: number }[];
  billRequestAging: { projectName: string; requestNo: string; payeeName: string; status: string; ageDays: number; dueDate: string | null; overdue: boolean }[];
  purchaseOrders: PoSummary[];
  // One row per subcontractor: where its contract stands
  subcontractors: { projectName: string; subcontractorName: string; contractValue: number; certifiedGross: number; retentionHeld: number; paidNet: number; payableNet: number; certificates: number }[];
  clearancesAttention: { projectName: string; title: string; authority: string | null; status: string; expiryDate: string | null; dueDate: string | null; reason: "expired" | "expiring" | "overdue" }[];
  openFines: { projectName: string; title: string; authority: string | null; liableParty: string; status: string; amount: number; dueDate: string | null }[];
}
