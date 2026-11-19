// ERPNext (incoming) — what the browser and the server agree on.

export const FRAPPE_SIGNATURE_HEADER = "X-Frappe-Webhook-Signature";

// The custom field a Payment Entry carries to say which of our payment orders it pays
export const PAYMENT_ORDER_FIELD = "pmp_payment_order";

export type ErpConnectionSummary = {
  id: string;
  baseUrl: string;
  company: string | null;
  hasApiKey: boolean;
  active: boolean;
  /** The URL to paste into ERPNext's Webhook "Request URL" */
  inboundUrl: string;
};

export type ErpInboundEntry = {
  id: string;
  doctype: string | null;
  docName: string | null;
  event: string | null;
  status: "applied" | "ignored" | "rejected";
  message: string | null;
  createdAt: string;
};

export type ErpDirectoryRole = "supplier" | "subcontractor";

export function isErpContractorGroup(group: string | null | undefined): boolean {
  const g = (group ?? "").trim().toLowerCase();
  if (!g) return false;
  return g.includes("مقاول") || g.includes("contractor") || g.includes("subcontractor");
}

export function isErpSupplierGroup(group: string | null | undefined): boolean {
  const g = (group ?? "").trim().toLowerCase();
  if (!g || isErpContractorGroup(g)) return false;
  return g.includes("مورد") || g.includes("supplier") || g.includes("محلي") || g.includes("services") || g.includes("raw material");
}

export function classifyErpSupplierGroup(group: string | null | undefined): "supplier" | "subcontractor" | "unclassified" {
  if (isErpContractorGroup(group)) return "subcontractor";
  if (isErpSupplierGroup(group)) return "supplier";
  return "unclassified";
}

export type ErpSupplierEntry = {
  erpName: string;
  supplierName: string;
  taxId: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
  supplierGroup: string | null;
  disabled: boolean;
  linkedProjectSuppliers: number;
  updatedAt: string;
};

export type ErpPaymentEntry = {
  name: string;
  paymentType: string | null;
  partyType: string | null;
  party: string | null;
  partyName: string | null;
  paidAmount: number;
  modeOfPayment: string | null;
  paymentMethod: "bank_transfer" | "cheque" | "cash";
  referenceNo: string | null;
  referenceDate: string | null;
  postingDate: string | null;
  docstatus: number;
  remarks: string | null;
  pmpPaymentOrder: string | null;
};

export type ErpStatement = {
  supplier: string;
  company: string;
  from: string;
  to: string;
  opening: number;
  closing: number;
  totalDebit: number;
  totalCredit: number;
  entries: { date: string; voucherType: string; voucherNo: string; debit: number; credit: number; balance: number; remarks: string | null }[];
};
