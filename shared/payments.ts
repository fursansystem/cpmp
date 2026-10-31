// المدفوعات (Payments) — shared constants, labels and report types.
// Used by both the server routes and the Payments page so the two never disagree on a status name.

export const BILL_REQUEST_STATUSES = ["requested", "submitted", "received", "returned", "cancelled"] as const;
export type BillRequestStatus = (typeof BILL_REQUEST_STATUSES)[number];

export const PAYMENT_ORDER_STATUSES = ["requested", "request_approved", "draft", "pending_approval", "approved", "paid", "rejected", "cancelled"] as const;
export type PaymentOrderStatus = (typeof PAYMENT_ORDER_STATUSES)[number];

export const CLEARANCE_STATUSES = ["pending", "in_progress", "obtained", "rejected", "expired"] as const;
export type ClearanceStatus = (typeof CLEARANCE_STATUSES)[number];

export const FINE_STATUSES = ["open", "under_appeal", "waiver_requested", "payment_requested", "paid", "waived", "cancelled"] as const;
export type FineStatus = (typeof FINE_STATUSES)[number];

export const LIABLE_PARTIES = ["contractor", "subcontractor", "owner", "consultant", "supplier", "other"] as const;
export type LiableParty = (typeof LIABLE_PARTIES)[number];

export const PAYMENT_METHODS = ["bank_transfer", "cheque", "cash"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_ENTITY_TYPES = ["bill_request", "payment_order", "clearance", "fine", "subcontractor_certificate", "chargeback"] as const;
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

// تحميل فاتورة على مقاول باطن: part or all of a paid supplier invoice charged to a subcontractor. The invoice's own
// history is never touched; the charge is a separate record that ends up as a deduction on a certificate (or a deduction record).
export const CHARGEBACK_STATUSES = ["proposed", "approved", "applied", "converted", "cancelled"] as const;
export type ChargebackStatus = (typeof CHARGEBACK_STATUSES)[number];

export const CHARGEBACK_LABELS: Record<ChargebackStatus, string> = {
  proposed: "بانتظار مدير المشروع (Proposed)",
  approved: "معتمد، لم يُطبَّق (Approved)",
  applied: "مطبَّق في مستخلص (Applied)",
  converted: "حُوّل إلى خصم (Converted)",
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
  // invoice charge-backs applied to the certificate
  chargebackDeductions?: number;
}) {
  const round = (v: number) => Math.round(v * 100) / 100;
  const retentionAmount = round((input.grossAmount * input.retentionPercent) / 100);
  const vatAmount = round((input.grossAmount * input.vatPercent) / 100);
  const netPayable = round(input.grossAmount - retentionAmount - input.advanceRecovery - input.otherDeductions - (input.chargebackDeductions ?? 0) + vatAmount);
  return { retentionAmount, vatAmount, netPayable };
}

// The page a request, order or deduction was started from, so that page can list what came of it
export const SOURCE_TYPES = ["purchase_order", "delivery", "snag", "ncr", "project", "invoice"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const BILL_REQUEST_LABELS: Record<BillRequestStatus, string> = {
  requested: "مطلوب (Requested)",
  submitted: "تم الإرسال (Submitted)",
  received: "تم الاستلام (Received)",
  returned: "معاد للتصحيح (Returned)",
  cancelled: "ملغي (Cancelled)",
};

export const PAYMENT_ORDER_LABELS: Record<PaymentOrderStatus, string> = {
  requested: "طلب بانتظار مدير المشروع (Requested)",
  request_approved: "طلب بانتظار المحاسبة (Request approved)",
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
  open: "مفتوح (Open)",
  under_appeal: "قيد الاعتراض (Under appeal)",
  payment_requested: "تم طلب السداد (Payment requested)",
  paid: "مسدد (Paid)",
  waiver_requested: "طلب إعفاء (Waiver requested)",
  waived: "معفى (Waived)",
  cancelled: "ملغى (Cancelled)",
};

export const LIABLE_PARTY_LABELS: Record<LiableParty, string> = {
  contractor: "المقاول الرئيسي (Main contractor)",
  subcontractor: "مقاول الباطن (Subcontractor)",
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
  status: string; // the purchase order's own status: draft, approved, issued, partially_received, completed
  supplierId: string | null;
  supplierName: string | null;
  value: number;
  receivedValue: number; // value of the goods received so far, from the receiving quantities on its items
  receivedPct: number;
  invoiced: number;
  ordered: number;
  paid: number;
  advances: number;
  committed: number;
  remaining: number; // negative when over
  over: boolean;
  // Every non-cancelled purchase order of the project is listed; this says whether any bill request or
  // payment order points at it. Orders nobody has touched financially are `noActivity`.
  linked: boolean;
  noActivity: boolean;
  goodsNotInvoiced: number; // received but not invoiced yet (goods received / invoice not received)
}

// A project's contract against what is committed and paid out of it
export interface ProjectBudgetRow {
  projectId: string;
  projectName: string;
  contractValue: number;
  estimatedCost: number;
  actualCost: number;
  committedPo: number; // purchase orders approved or beyond
  committedSub: number; // subcontract values
  committed: number;
  paid: number; // payment orders paid
  remainingBudget: number; // estimated cost - committed (negative when over)
  expectedMargin: number; // contract value - committed
  over: boolean;
}

export const poCommitted = (invoiced: number, ordered: number) => Math.max(invoiced, ordered);
// A cent of rounding is not an overrun
export const isPoOver =(committed: number, value: number) => value > 0 && committed > value + 0.005;

// A decision (order, subcontractor certificate, waiver) waiting on a manager longer than this is "late"
export const DECISION_OVERDUE_DAYS = 3;

// The control cards on the follow-up dashboard (لوحة المتابعة)
export interface PaymentsMonitoring {
  // Money that has gone out without the original invoice behind it. Orders raised from a bill request
  // collected their originals first, and fines / licence fees have no invoice, so neither is counted.
  paymentsWithoutOriginals: {
    notRequested: { count: number; amount: number };
    requestedPending: { count: number; amount: number };
    advances: { count: number; amount: number }; // the advance payments among them
    rows: { projectName: string; orderNo: string; payeeName: string; purpose: string; amount: number; paidDate: string | null; ageDays: number; state: "not_requested" | "pending"; requestNo: string | null }[];
  };
  // Waiting on a project manager for more than DECISION_OVERDUE_DAYS
  delayedDecisions: {
    thresholdDays: number;
    orders: number;
    requests: number; // transfer requests waiting on a project manager or accounting
    certificates: number;
    waivers: number;
    total: number;
    oldestDays: number;
    rows: { projectName: string; kind: "order" | "certificate" | "waiver" | "request"; ref: string; title: string; amount: number; ageDays: number }[];
  };
  // Invoices whose originals are in but which are not paid yet: what the company owes
  unpaidInvoices: {
    requests: number;
    amount: number;
    withoutOrder: { requests: number; amount: number };
    inPayment: { requests: number; amount: number }; // an order exists but is not paid
  };
  // Goods that arrived against a purchase order but whose invoice has not been entered
  goodsReceivedNotInvoiced: {
    count: number;
    amount: number;
    rows: { projectName: string; poNumber: string; supplierName: string | null; received: number; invoiced: number; amount: number }[];
  };
  // Invoice amounts charged to subcontractors that have not yet become a deduction on a certificate
  unappliedChargebacks: { count: number; amount: number; oldestDays: number };
  // Purchase orders (not draft) with no bill request, invoice or payment against them at all
  poNoActivity: { count: number; value: number };
  cycleTimes: {
    requestToReceiptDays: number | null; // bill request created -> originals received
    requestToReceiptSamples: number;
    approvalToPaymentDays: number | null; // payment order approved -> paid
    approvalToPaymentSamples: number;
  };
}

export interface ApprovalsReport {
  approvers: { name: string; approvals: number; rejections: number; avgDecisionHours: number | null }[];
  rejectionReasons: { reason: string; count: number }[];
  totals: { approvals: number; rejections: number; avgDecisionHours: number | null };
}

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
  projectBudgets: ProjectBudgetRow[];
  monitoring: PaymentsMonitoring;
  // One row per subcontractor: where its contract stands
  subcontractors: { projectName: string; subcontractorName: string; contractValue: number; certifiedGross: number; retentionHeld: number; paidNet: number; payableNet: number; certificates: number }[];
  clearancesAttention: { projectName: string; title: string; authority: string | null; status: string; expiryDate: string | null; dueDate: string | null; reason: "expired" | "expiring" | "overdue" }[];
  openFines: { projectName: string; title: string; authority: string | null; liableParty: string; status: string; amount: number; dueDate: string | null }[];
}
