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

export const PAYMENT_ENTITY_TYPES = ["bill_request", "payment_order", "clearance", "fine"] as const;
export type PaymentEntityType = (typeof PAYMENT_ENTITY_TYPES)[number];

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
    paidFinesAmount: number;
  };
  byProject: PaymentsProjectSummary[];
  monthlyPaid: { month: string; amount: number }[];
  billRequestAging: { projectName: string; requestNo: string; payeeName: string; status: string; ageDays: number; dueDate: string | null; overdue: boolean }[];
  clearancesAttention: { projectName: string; title: string; authority: string | null; status: string; expiryDate: string | null; dueDate: string | null; reason: "expired" | "expiring" | "overdue" }[];
  openFines: { projectName: string; title: string; authority: string | null; liableParty: string; status: string; amount: number; dueDate: string | null }[];
}
