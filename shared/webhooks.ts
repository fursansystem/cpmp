// Outgoing webhooks (ERP integration) — what the browser and the server agree on.
//
// Modelled on GitHub's webhooks: an endpoint subscribes to event *types*, and each delivery says which
// thing happened to that record in `action` (payment_order + paid, purchase_order + approved, ...).

export const WEBHOOK_EVENTS = [
  "payment_order",
  "bill_request",
  "subcontractor_certificate",
  "chargeback",
  "fine",
  "clearance",
  "purchase_order",
  "material_issue",
  "stock_movement",
  "stock_transfer",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

// "ping" is sent when an endpoint is created and from its "Send test" button; it cannot be subscribed to
export type WebhookEventName = WebhookEvent | "ping";

// actions lists what each type sends; every payment type also sends file_added / file_removed for its attachments
export const WEBHOOK_EVENT_INFO: Record<WebhookEvent, { label: string; description: string; actions: string[] }> = {
  payment_order: {
    label: "أوامر الدفع (Payment orders)",
    description: "Transfer requests and payment orders through approval to payment",
    actions: ["requested", "created", "edited", "request_approved", "request_declined", "request_accepted", "request_withdrawn", "submitted", "approved", "rejected", "paid", "cancelled", "originals_requested"],
  },
  bill_request: {
    label: "أصول الفواتير (Bill requests)",
    description: "Requests for original invoices and the invoices listed on them",
    actions: ["created", "submitted", "received", "returned", "cancelled", "invoice_added", "invoice_removed", "chargeback_created"],
  },
  subcontractor_certificate: {
    label: "مستخلصات مقاولي الباطن (Subcontractor certificates)",
    description: "Subcontractor certificates from draft to paid",
    actions: ["created", "edited", "submitted", "approved", "rejected", "cancelled", "chargebacks_changed"],
  },
  chargeback: {
    label: "التحميلات (Chargebacks)",
    description: "Charges back to subcontractors, applied to or released from certificates",
    actions: ["created", "approved", "rejected", "withdrawn", "converted", "applied", "released"],
  },
  fine: {
    label: "الغرامات (Fines)",
    description: "Fines, waivers, recoveries and certificate deductions",
    actions: ["created", "edited", "status_changed", "recovered", "reserved", "released", "waiver_requested", "waiver_approved", "waiver_rejected", "waiver_withdrawn"],
  },
  clearance: {
    label: "التصاريح (Clearances)",
    description: "Permits and clearances with their fees",
    actions: ["created", "edited", "status_changed"],
  },
  purchase_order: {
    label: "أوامر الشراء (Purchase orders)",
    description: "Purchase orders created, approved and received against",
    actions: ["created", "approved", "received"],
  },
  material_issue: {
    label: "سندات الصرف (Material issues)",
    description: "Material issue vouchers raised, approved, rejected or cancelled",
    actions: ["created", "approved", "rejected", "cancelled"],
  },
  stock_movement: {
    label: "تسويات المخزون (Stock adjustments)",
    description: "Manual stock adjustments in a warehouse",
    actions: ["created"],
  },
  stock_transfer: {
    label: "تحويلات المخزون (Stock transfers)",
    description: "Stock moved between warehouses",
    actions: ["created"],
  },
};

export const WEBHOOK_HEADERS = {
  event: "X-PMP-Event",
  delivery: "X-PMP-Delivery",
  signature: "X-PMP-Signature-256",
} as const;

// Seconds to wait after each failed attempt; once they run out the delivery is marked failed
export const WEBHOOK_RETRY_DELAYS = [60, 5 * 60, 30 * 60, 2 * 3600, 6 * 3600, 12 * 3600];
export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_RETRY_DELAYS.length + 1;

// What the management API returns for an endpoint: never the secret itself
export type WebhookSummary = {
  id: string;
  organizationId: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
  lastDelivery: { status: string; responseStatus: number | null; createdAt: string } | null;
};

export type WebhookDeliverySummary = {
  id: string;
  event: string;
  action: string | null;
  status: "pending" | "success" | "failed";
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
  deliveredAt: string | null;
  nextAttemptAt: string | null;
};

export type WebhookDeliveryDetail = WebhookDeliverySummary & {
  payload: Record<string, unknown>;
  responseBody: string | null;
};
