// ERPNext → ProjectManager Pro: the incoming half of the ERP integration.
//
//   inbound endpoint   ERPNext's own Webhook feature POSTs Supplier and Payment Entry documents here.
//                      Each request is signed by ERPNext (X-Frappe-Webhook-Signature: base64 HMAC-SHA256 of
//                      the body with the connection's webhook secret); unsigned or wrongly signed ones are refused.
//   suppliers          kept in an organization-wide directory (erp_suppliers); project suppliers linked to an
//                      ERPNext supplier, or matched on tax number, are updated with it.
//   payments           a submitted Payment Entry that names one of our payment orders (custom field
//                      pmp_payment_order) marks that order paid, under the same rules as the "pay" button.
//   statements         pulled on demand from ERPNext's REST API (General Ledger for one supplier).
import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "./db";
import { erpConnections, erpInboundLog, erpSuppliers, projects, suppliers, type ErpConnection } from "@shared/schema";
import type { PermissionUser } from "@shared/permissions";
import type { PaymentMethod } from "@shared/payments";
import type { ErpConnectionSummary, ErpInboundEntry, ErpStatement, ErpSupplierEntry } from "@shared/erp";
import { assertDeliverableUrl, generateSecret, WebhookUrlError } from "./webhook-service";

type CurrentUser = { user: PermissionUser; orgId: string | null; teamMemberIds: string[] };

type MarkPaid = (
  orderId: string,
  orgProjectIds: Set<string>,
  details: { paymentMethod: PaymentMethod; paymentReference: string | null; paidDate: string | null; amount: number; source: string },
) => Promise<{ ok: true; orderNo: string } | { ok: false; error: string }>;

interface Deps {
  getCurrentUserWithOrg: (req: Request) => Promise<CurrentUser | null>;
  handleError: (res: any, error: unknown) => any;
  markOrderPaidFromErp: MarkPaid;
}

class ErpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const fail = (status: number, message: string): never => {
  throw new ErpError(status, message);
};

const ERP_TIMEOUT_MS = 20_000;

// ---- Talking to ERPNext's REST API (token auth: "token <api_key>:<api_secret>") ----
async function erpFetch(conn: ErpConnection, path: string, init: RequestInit = {}): Promise<any> {
  if (!conn.apiKey || !conn.apiSecret) fail(400, "Add the ERPNext API key and secret first");
  await assertDeliverableUrl(conn.baseUrl);
  const url = new URL(path, conn.baseUrl.replace(/\/+$/, "") + "/");
  let res: globalThis.Response;
  try {
    res = await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(ERP_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        Authorization: `token ${conn.apiKey}:${conn.apiSecret}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch (err) {
    return fail(502, `Could not reach ERPNext: ${err instanceof Error ? err.message : String(err)}`);
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const reason = body?.exception || body?.message || body?._error_message || text.slice(0, 200) || res.statusText;
    return fail(502, `ERPNext answered HTTP ${res.status}: ${reason}`);
  }
  return body;
}

// ---- Helpers shared by the inbound endpoint and the manual sync ----

const orgProjectIds = async (orgId: string): Promise<Set<string>> => {
  const rows = await db.select({ id: projects.id }).from(projects)
    .where(or(eq(projects.organizationId, orgId), eq(projects.contractorId, orgId)));
  return new Set(rows.map((r) => r.id));
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

type ErpSupplierDoc = {
  name?: unknown;
  supplier_name?: unknown;
  tax_id?: unknown;
  email_id?: unknown;
  mobile_no?: unknown;
  supplier_group?: unknown;
  disabled?: unknown;
};

// Upserts the directory entry, then brings the project suppliers that are this ERPNext supplier in line.
async function applySupplier(orgId: string, doc: ErpSupplierDoc): Promise<{ updated: number }> {
  const erpName = str(doc.name);
  if (!erpName) fail(400, "The Supplier document has no name");
  const supplierName = str(doc.supplier_name) ?? erpName!;
  const values = {
    supplierName,
    taxId: str(doc.tax_id),
    email: str(doc.email_id),
    phone: str(doc.mobile_no),
    supplierGroup: str(doc.supplier_group),
    disabled: doc.disabled === 1 || doc.disabled === true,
    updatedAt: new Date(),
  };
  await db.insert(erpSuppliers).values({ organizationId: orgId, erpName: erpName!, ...values })
    .onConflictDoUpdate({ target: [erpSuppliers.organizationId, erpSuppliers.erpName], set: values });

  const projectIds = Array.from(await orgProjectIds(orgId));
  if (projectIds.length === 0) return { updated: 0 };
  // Linked by ERPNext id, or not linked yet and the same tax number (which then links it)
  const match = values.taxId
    ? or(eq(suppliers.erpSupplier, erpName!), and(isNull(suppliers.erpSupplier), eq(suppliers.taxNumber, values.taxId)))
    : eq(suppliers.erpSupplier, erpName!);
  const updated = await db.update(suppliers).set({
    supplierName,
    erpSupplier: erpName!,
    ...(values.taxId ? { taxNumber: values.taxId } : {}),
    ...(values.email ? { email: values.email } : {}),
    ...(values.phone ? { phone: values.phone } : {}),
  }).where(and(inArray(suppliers.projectId, projectIds), match)).returning({ id: suppliers.id });
  return { updated: updated.length };
}

// ERPNext Mode of Payment names are free text; these cover the stock ones
function paymentMethodFor(mode: string | null): PaymentMethod {
  const m = (mode ?? "").toLowerCase();
  if (m.includes("cheque") || m.includes("check") || m.includes("شيك")) return "cheque";
  if (m.includes("cash") || m.includes("نقد")) return "cash";
  return "bank_transfer";
}

export function verifyFrappeSignature(secret: string, rawBody: Buffer, given: string | undefined): boolean {
  if (!given) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(given.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function registerErpRoutes(app: Express, deps: Deps) {
  const base = "/api/erp";

  // ================= Inbound: ERPNext → us (no session; the signature is the authentication) =================
  app.post(`${base}/inbound/:connectionId`, async (req: Request, res: Response) => {
    const [conn] = await db.select().from(erpConnections).where(eq(erpConnections.id, req.params.connectionId)).catch(() => []);
    if (!conn || !conn.active) return res.status(404).json({ error: "Unknown or disabled connection" });
    const raw = (req as any).rawBody as Buffer | undefined;
    if (!raw || !verifyFrappeSignature(conn.webhookSecret, raw, req.get("X-Frappe-Webhook-Signature"))) {
      return res.status(401).json({ error: "Bad or missing X-Frappe-Webhook-Signature" });
    }

    // The ERPNext webhook body is the document itself ({{ doc.as_json() }}) or { event, doc }
    const body = req.body ?? {};
    const doc = body.doc && typeof body.doc === "object" ? body.doc : body;
    const doctype = str(doc.doctype) ?? str(body.doctype);
    const docName = str(doc.name);
    const event = str(body.event);
    const record = async (status: "applied" | "ignored" | "rejected", message: string) => {
      await db.insert(erpInboundLog).values({ organizationId: conn.organizationId, doctype, docName, event, status, message, payload: body });
      res.status(status === "rejected" ? 422 : 200).json({ status, message });
    };

    try {
      if (doctype === "Supplier") {
        const { updated } = await applySupplier(conn.organizationId, doc);
        return record("applied", updated ? `Updated ${updated} project supplier(s)` : "Saved to the supplier directory");
      }

      if (doctype === "Payment Entry") {
        if (doc.docstatus === 2) return record("ignored", "Cancelled in ERPNext; reverse the payment order by hand if needed");
        if (doc.docstatus !== 1) return record("ignored", "Not submitted yet");
        if (doc.payment_type !== "Pay") return record("ignored", `payment_type is ${doc.payment_type}; only "Pay" settles our payment orders`);
        const orderId = str(doc.pmp_payment_order);
        if (!orderId) return record("ignored", "No pmp_payment_order on this Payment Entry");
        const result = await deps.markOrderPaidFromErp(orderId, await orgProjectIds(conn.organizationId), {
          paymentMethod: paymentMethodFor(str(doc.mode_of_payment)),
          paymentReference: str(doc.reference_no) ?? docName,
          paidDate: str(doc.reference_date) ?? str(doc.posting_date),
          amount: Number(doc.paid_amount ?? 0),
          source: `ERPNext ${docName ?? "Payment Entry"}`,
        });
        return result.ok ? record("applied", `${result.orderNo} marked paid`) : record("rejected", result.error);
      }

      return record("ignored", `Doctype ${doctype ?? "(none)"} is not handled`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[ERP] inbound failed:", message);
      if (!res.headersSent) await record("rejected", message).catch(() => res.status(500).end());
    }
  });

  // ================= Management (an organization's admin) =================
  const isSystemAdmin = (cu: CurrentUser) => ["super_admin", "developer_admin"].includes(cu.user.role);

  const route = (handler: (req: Request, res: Response, cu: CurrentUser, orgId: string) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const cu = await deps.getCurrentUserWithOrg(req);
        if (!cu) return res.status(401).json({ error: "Authentication required" });
        if (!isSystemAdmin(cu) && cu.user.role !== "org_admin") return fail(403, "Only an organization's administrator can manage the ERP connection");
        const asked = typeof req.query.organizationId === "string" && req.query.organizationId ? req.query.organizationId : null;
        if (asked && asked !== cu.orgId && !isSystemAdmin(cu)) return fail(403, "You can only manage your own organization");
        const orgId = asked ?? cu.orgId ?? fail(400, "Choose an organization");
        await handler(req, res, cu, orgId);
      } catch (error) {
        if (error instanceof ErpError) return res.status(error.status).json({ error: error.message });
        if (error instanceof WebhookUrlError) return res.status(400).json({ error: error.message });
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors.map((e) => e.message).join("; ") });
        console.error("[ERP] route error:", error);
        deps.handleError(res, error);
      }
    };

  const loadConnection = async (orgId: string) =>
    (await db.select().from(erpConnections).where(eq(erpConnections.organizationId, orgId)))[0] ?? null;
  const requireConnection = async (orgId: string) => (await loadConnection(orgId)) ?? fail(404, "Connect ERPNext first");

  const inboundUrl = (req: Request, id: string) => {
    const origin = process.env.APP_URL?.replace(/\/+$/, "") || `${req.protocol}://${req.get("host")}`;
    return `${origin}${base}/inbound/${id}`;
  };

  const toSummary = (req: Request, c: ErpConnection): ErpConnectionSummary => ({
    id: c.id,
    baseUrl: c.baseUrl,
    company: c.company,
    hasApiKey: !!(c.apiKey && c.apiSecret),
    active: c.active,
    inboundUrl: inboundUrl(req, c.id),
  });

  app.get(`${base}/connection`, route(async (req, res, _cu, orgId) => {
    const c = await loadConnection(orgId);
    res.json(c ? toSummary(req, c) : null);
  }));

  const connectionSchema = z.object({
    baseUrl: z.string().trim().url("Enter the ERPNext address, e.g. https://erp.example.com"),
    company: z.string().trim().max(200).nullable().optional(),
    apiKey: z.string().trim().max(200).optional(),
    apiSecret: z.string().trim().max(200).optional(),
    active: z.boolean().optional(),
  });

  // Creating returns the webhook secret once, for ERPNext's Webhook "Webhook Secret" field
  app.put(`${base}/connection`, route(async (req, res, cu, orgId) => {
    const data = connectionSchema.parse(req.body);
    await assertDeliverableUrl(data.baseUrl);
    const existing = await loadConnection(orgId);
    const values = {
      baseUrl: data.baseUrl.replace(/\/+$/, ""),
      company: data.company || null,
      ...(data.apiKey ? { apiKey: data.apiKey } : {}),
      ...(data.apiSecret ? { apiSecret: data.apiSecret } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      updatedAt: new Date(),
    };
    if (existing) {
      const [row] = await db.update(erpConnections).set(values).where(eq(erpConnections.id, existing.id)).returning();
      return res.json(toSummary(req, row));
    }
    const webhookSecret = generateSecret();
    const [row] = await db.insert(erpConnections).values({ organizationId: orgId, webhookSecret, createdBy: cu.user.id, ...values }).returning();
    res.status(201).json({ ...toSummary(req, row), webhookSecret });
  }));

  app.post(`${base}/connection/rotate-secret`, route(async (_req, res, _cu, orgId) => {
    const c = await requireConnection(orgId);
    const webhookSecret = generateSecret();
    await db.update(erpConnections).set({ webhookSecret, updatedAt: new Date() }).where(eq(erpConnections.id, c.id));
    res.json({ webhookSecret });
  }));

  app.delete(`${base}/connection`, route(async (_req, res, _cu, orgId) => {
    await db.delete(erpConnections).where(eq(erpConnections.organizationId, orgId));
    res.status(204).send();
  }));

  // Checks the address and API key by asking ERPNext who we are
  app.post(`${base}/connection/test`, route(async (_req, res, _cu, orgId) => {
    const c = await requireConnection(orgId);
    const who = await erpFetch(c, "api/method/frappe.auth.get_logged_user");
    res.json({ ok: true, user: who?.message ?? null });
  }));

  app.get(`${base}/inbound-log`, route(async (_req, res, _cu, orgId) => {
    const rows = await db.select().from(erpInboundLog).where(eq(erpInboundLog.organizationId, orgId))
      .orderBy(desc(erpInboundLog.createdAt)).limit(100);
    res.json(rows.map((r): ErpInboundEntry => ({
      id: r.id,
      doctype: r.doctype,
      docName: r.docName,
      event: r.event,
      status: r.status as ErpInboundEntry["status"],
      message: r.message,
      createdAt: r.createdAt.toISOString(),
    })));
  }));

  app.get(`${base}/suppliers`, route(async (_req, res, _cu, orgId) => {
    const rows = await db.select().from(erpSuppliers).where(eq(erpSuppliers.organizationId, orgId)).orderBy(erpSuppliers.supplierName);
    const linked = await db.select({ erp: suppliers.erpSupplier, n: sql<number>`count(*)::int` }).from(suppliers)
      .where(inArray(suppliers.projectId, Array.from(await orgProjectIds(orgId)).concat("")))
      .groupBy(suppliers.erpSupplier);
    const counts = new Map(linked.map((l) => [l.erp, l.n]));
    res.json(rows.map((r): ErpSupplierEntry => ({
      erpName: r.erpName,
      supplierName: r.supplierName,
      taxId: r.taxId,
      email: r.email,
      phone: r.phone,
      supplierGroup: r.supplierGroup,
      disabled: r.disabled,
      linkedProjectSuppliers: counts.get(r.erpName) ?? 0,
      updatedAt: r.updatedAt.toISOString(),
    })));
  }));

  // Webhooks only fire on change, so the first sync (and any catch-up) pulls the whole list
  app.post(`${base}/suppliers/sync`, route(async (_req, res, _cu, orgId) => {
    const c = await requireConnection(orgId);
    const fields = JSON.stringify(["name", "supplier_name", "tax_id", "email_id", "mobile_no", "supplier_group", "disabled"]);
    const list = await erpFetch(c, `api/resource/Supplier?fields=${encodeURIComponent(fields)}&limit_page_length=0`);
    const docs: ErpSupplierDoc[] = Array.isArray(list?.data) ? list.data : [];
    let updated = 0;
    for (const doc of docs) updated += (await applySupplier(orgId, doc)).updated;
    res.json({ suppliers: docs.length, projectSuppliersUpdated: updated });
  }));

  const statementSchema = z.object({
    supplier: z.string().trim().min(1, "Choose a supplier"),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date"),
  });

  // كشف حساب المورد: ERPNext's General Ledger for one supplier, grouped by voucher
  app.get(`${base}/statement`, route(async (req, res, _cu, orgId) => {
    const q = statementSchema.parse(req.query);
    const c = await requireConnection(orgId);
    if (!c.company) fail(400, "Set the ERPNext company on the connection first");
    const filters = {
      company: c.company,
      from_date: q.from,
      to_date: q.to,
      party_type: "Supplier",
      party: [q.supplier],
      group_by: "Group by Voucher (Consolidated)",
    };
    const out = await erpFetch(c, "api/method/frappe.desk.query_report.run", {
      method: "POST",
      body: JSON.stringify({ report_name: "General Ledger", filters: JSON.stringify(filters), ignore_prepared_report: true }),
    });
    const rows: any[] = Array.isArray(out?.message?.result) ? out.message.result : [];
    const num = (v: unknown) => Number(v ?? 0) || 0;
    // The report's own Opening / Total / Closing rows carry a quoted label in "account"
    const label = (r: any) => String(r?.account ?? "").replace(/'/g, "").toLowerCase();
    const opening = rows.find((r) => label(r) === "opening");
    const closing = rows.find((r) => label(r) === "closing (opening + total)");
    const entries = rows.filter((r) => r && r.voucher_no);
    const statement: ErpStatement = {
      supplier: q.supplier,
      company: c.company!,
      from: q.from,
      to: q.to,
      opening: opening ? num(opening.balance) : 0,
      closing: closing ? num(closing.balance) : entries.length ? num(entries[entries.length - 1].balance) : 0,
      totalDebit: entries.reduce((s, r) => s + num(r.debit), 0),
      totalCredit: entries.reduce((s, r) => s + num(r.credit), 0),
      entries: entries.map((r) => ({
        date: String(r.posting_date ?? "").slice(0, 10),
        voucherType: r.voucher_type ?? "",
        voucherNo: r.voucher_no ?? "",
        debit: num(r.debit),
        credit: num(r.credit),
        balance: num(r.balance),
        remarks: r.remarks ?? null,
      })),
    };
    res.json(statement);
  }));
}
