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

export type ErpSupplierEntry = {
  erpName: string;
  supplierName: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  supplierGroup: string | null;
  disabled: boolean;
  linkedProjectSuppliers: number;
  updatedAt: string;
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
