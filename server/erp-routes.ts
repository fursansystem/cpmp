// ERPNext → ProjectManager Pro: the incoming half of the ERP integration.
//
//   inbound endpoint   ERPNext's own Webhook feature POSTs Supplier and Payment Entry documents here.
//                      Each request is signed by ERPNext (X-Frappe-Webhook-Signature: base64 HMAC-SHA256 of
//                      the body with the connection's webhook secret); unsigned or wrongly signed ones are refused.
//   suppliers          kept in an organization-wide directory (erp_suppliers); project suppliers linked to an
//                      ERPNext supplier, or matched on tax number, are updated with it.
//   payments           a submitted Payment Entry that names one of our payment orders (custom field
//                      pmp_payment_order, or PAY-XXXX in remarks / reference_no) marks that order paid.
//   statements         pulled on demand from ERPNext's REST API (General Ledger for one supplier).
import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "./db";
import { erpConnections, erpInboundLog, erpSuppliers, paymentActivity, paymentAttachments, paymentOrders, projects, projectSubcontractors, suppliers, type ErpConnection, type ErpSupplier } from "@shared/schema";
import type { PermissionUser } from "@shared/permissions";
import type { PaymentMethod } from "@shared/payments";
import { isErpContractorGroup, isErpSupplierGroup, type ErpConnectionSummary, type ErpInboundEntry, type ErpPaymentEntry, type ErpStatement, type ErpSupplierEntry } from "@shared/erp";
import { assertDeliverableUrl, generateSecret, WebhookUrlError } from "./webhook-service";
import { notificationWss } from "./websocket";

const R2_ENDPOINT = process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "https://dummy.r2.cloudflarestorage.com";
const R2_BUCKET = process.env.R2_BUCKET_NAME || "";

const r2Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "dummy",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "dummy",
  },
  forcePathStyle: true,
});

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

type CurrentUser = { user: PermissionUser; orgId: string | null; teamMemberIds: string[] };

type MarkPaid = (
  orderRef: string,
  orgProjectIds: Set<string>,
  details: { paymentMethod: PaymentMethod; paymentReference: string | null; paidDate: string | null; amount: number; source: string; partyName?: string | null },
) => Promise<{ ok: true; orderNo: string; orderId: string; projectId: string } | { ok: false; error: string; alreadyPaid?: boolean; orderId?: string; projectId?: string; orderNo?: string }>;

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

function cleanHtmlText(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const cleaned = s
    .replace(/<br\s*\/?>/gi, "، ")
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function resolveLogoUrl(raw: unknown, baseUrl?: string | null): string | null {
  const s = str(raw);
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/") && baseUrl) {
    return `${baseUrl.replace(/\/+$/, "")}${s}`;
  }
  return s;
}

type ErpSupplierDoc = {
  name?: unknown;
  supplier_name?: unknown;
  supplier_name_in_arabic?: unknown;
  tax_id?: unknown;
  contact_person?: unknown;
  supplier_primary_contact?: unknown;
  email_id?: unknown;
  email?: unknown;
  mobile_no?: unknown;
  phone?: unknown;
  primary_address?: unknown;
  supplier_primary_address?: unknown;
  address?: unknown;
  country?: unknown;
  image?: unknown;
  logo_url?: unknown;
  supplier_group?: unknown;
  supplier_type?: unknown;
  disabled?: unknown;
};

// Pulls linked Contact and Address from ERPNext when the Supplier doc itself doesn't have them cached
async function enrichSupplierDocFromErp(conn: ErpConnection, erpName: string, baseDoc?: ErpSupplierDoc): Promise<ErpSupplierDoc> {
  let doc: ErpSupplierDoc = baseDoc ?? { name: erpName };
  if (!conn.apiKey || !conn.apiSecret) return doc;

  try {
    const full = await erpFetch(conn, `api/resource/Supplier/${encodeURIComponent(erpName)}`);
    if (full?.data && typeof full.data === "object") {
      doc = { ...doc, ...full.data };
    }
  } catch {
    /* keep existing doc */
  }

  // If contact details (phone / email / contact_person) are still empty, look up linked Contact in ERPNext
  if (!str(doc.mobile_no) && !str(doc.phone) && !str(doc.email_id)) {
    try {
      const filters = JSON.stringify([
        ["Dynamic Link", "link_doctype", "=", "Supplier"],
        ["Dynamic Link", "link_name", "=", erpName],
      ]);
      const fields = JSON.stringify(["name", "first_name", "last_name", "full_name", "email_id", "mobile_no", "phone"]);
      const contactList = await erpFetch(
        conn,
        `api/resource/Contact?filters=${encodeURIComponent(filters)}&fields=${encodeURIComponent(fields)}&limit_page_length=1`,
      );
      const c = Array.isArray(contactList?.data) ? contactList.data[0] : null;
      if (c) {
        const cName = str(c.full_name) ?? ([str(c.first_name), str(c.last_name)].filter(Boolean).join(" ") || str(c.name));
        if (!str(doc.supplier_primary_contact) && !str(doc.contact_person) && cName) doc.contact_person = cName;
        if (!str(doc.mobile_no) && !str(doc.phone)) doc.mobile_no = str(c.mobile_no) ?? str(c.phone);
        if (!str(doc.email_id) && !str(doc.email)) doc.email_id = str(c.email_id);
      }
    } catch {
      /* ignore if Contact permission not granted */
    }
  }

  // If address is still empty, look up linked Address in ERPNext
  if (!str(doc.primary_address) && !str(doc.supplier_primary_address) && !str(doc.address)) {
    try {
      const filters = JSON.stringify([
        ["Dynamic Link", "link_doctype", "=", "Supplier"],
        ["Dynamic Link", "link_name", "=", erpName],
      ]);
      const fields = JSON.stringify(["address_line1", "address_line2", "city", "state", "country", "phone", "email_id"]);
      const addrList = await erpFetch(
        conn,
        `api/resource/Address?filters=${encodeURIComponent(filters)}&fields=${encodeURIComponent(fields)}&limit_page_length=1`,
      );
      const a = Array.isArray(addrList?.data) ? addrList.data[0] : null;
      if (a) {
        const parts = [str(a.address_line1), str(a.address_line2), str(a.city), str(a.state), str(a.country)].filter(Boolean);
        if (parts.length > 0) doc.address = parts.join("، ");
        if (!str(doc.mobile_no) && !str(doc.phone) && str(a.phone)) doc.phone = str(a.phone);
        if (!str(doc.email_id) && !str(doc.email) && str(a.email_id)) doc.email = str(a.email_id);
      }
    } catch {
      /* ignore if Address permission not granted */
    }
  }

  return doc;
}

// Upserts the directory entry, then brings the project suppliers that are this ERPNext supplier in line.
async function applySupplier(orgId: string, doc: ErpSupplierDoc, baseUrl?: string | null): Promise<{ updated: number; entry: ErpSupplier }> {
  const erpName = str(doc.name);
  if (!erpName) fail(400, "The Supplier document has no name");
  const supplierName = str(doc.supplier_name) ?? str(doc.supplier_name_in_arabic) ?? erpName!;
  const taxId = str(doc.tax_id);
  const contactPerson = str(doc.contact_person) ?? str(doc.supplier_primary_contact);
  const email = str(doc.email_id) ?? str(doc.email);
  const phone = str(doc.mobile_no) ?? str(doc.phone);
  const address = cleanHtmlText(doc.primary_address) ?? cleanHtmlText(doc.supplier_primary_address) ?? cleanHtmlText(doc.address) ?? str(doc.country);
  const logoUrl = resolveLogoUrl(doc.image ?? doc.logo_url, baseUrl);
  const supplierGroup = str(doc.supplier_group) ?? str(doc.supplier_type);
  const disabled = doc.disabled === 1 || doc.disabled === true;

  const values = {
    supplierName,
    taxId,
    contactPerson,
    email,
    phone,
    address,
    logoUrl,
    supplierGroup,
    disabled,
    updatedAt: new Date(),
  };

  // Preserve non-null existing fields in erp_suppliers if the incoming payload omitted them
  const [existingErp] = await db
    .select()
    .from(erpSuppliers)
    .where(and(eq(erpSuppliers.organizationId, orgId), eq(erpSuppliers.erpName, erpName!)));

  const mergedValues = existingErp
    ? {
        supplierName: values.supplierName,
        taxId: values.taxId ?? existingErp.taxId,
        contactPerson: values.contactPerson ?? existingErp.contactPerson,
        email: values.email ?? existingErp.email,
        phone: values.phone ?? existingErp.phone,
        address: values.address ?? existingErp.address,
        logoUrl: values.logoUrl ?? existingErp.logoUrl,
        supplierGroup: values.supplierGroup ?? existingErp.supplierGroup,
        disabled: values.disabled,
        updatedAt: values.updatedAt,
      }
    : values;

  const [savedEntry] = await db
    .insert(erpSuppliers)
    .values({ organizationId: orgId, erpName: erpName!, ...mergedValues })
    .onConflictDoUpdate({ target: [erpSuppliers.organizationId, erpSuppliers.erpName], set: mergedValues })
    .returning();

  const projectIds = Array.from(await orgProjectIds(orgId));
  if (projectIds.length === 0) return { updated: 0, entry: savedEntry };

  const isContractor = isErpContractorGroup(mergedValues.supplierGroup);

  if (isContractor) {
    // Sync with projectSubcontractors (دليل المقاولين) when Supplier Group is "مقاول"
    const subMatch = [
      eq(projectSubcontractors.erpSupplier, erpName!),
      and(isNull(projectSubcontractors.erpSupplier), eq(projectSubcontractors.name, mergedValues.supplierName)),
    ];
    if (mergedValues.taxId) {
      subMatch.push(and(isNull(projectSubcontractors.erpSupplier), eq(projectSubcontractors.taxNumber, mergedValues.taxId)));
    }
    const updatedSubs = await db.update(projectSubcontractors).set({
      name: mergedValues.supplierName,
      erpSupplier: erpName!,
      ...(mergedValues.taxId ? { taxNumber: mergedValues.taxId } : {}),
      ...(mergedValues.contactPerson ? { contactPerson: mergedValues.contactPerson } : {}),
      ...(mergedValues.phone ? { phone: mergedValues.phone } : {}),
    }).where(and(inArray(projectSubcontractors.projectId, projectIds), or(...subMatch))).returning({ id: projectSubcontractors.id });
    return { updated: updatedSubs.length, entry: savedEntry };
  }

  // Otherwise sync with project suppliers (دليل الموردين)
  const matchConditions = [
    eq(suppliers.erpSupplier, erpName!),
    and(isNull(suppliers.erpSupplier), eq(suppliers.supplierName, mergedValues.supplierName)),
  ];
  if (mergedValues.taxId) {
    matchConditions.push(and(isNull(suppliers.erpSupplier), eq(suppliers.taxNumber, mergedValues.taxId)));
  }

  const updated = await db.update(suppliers).set({
    supplierName: mergedValues.supplierName,
    erpSupplier: erpName!,
    ...(mergedValues.taxId ? { taxNumber: mergedValues.taxId } : {}),
    ...(mergedValues.contactPerson ? { contactPerson: mergedValues.contactPerson } : {}),
    ...(mergedValues.email ? { email: mergedValues.email } : {}),
    ...(mergedValues.phone ? { phone: mergedValues.phone } : {}),
    ...(mergedValues.address ? { address: mergedValues.address } : {}),
    ...(mergedValues.logoUrl ? { logoUrl: mergedValues.logoUrl } : {}),
    ...(mergedValues.supplierGroup ? { category: mergedValues.supplierGroup } : {}),
  }).where(and(inArray(suppliers.projectId, projectIds), or(...matchConditions))).returning({ id: suppliers.id });

  return { updated: updated.length, entry: savedEntry };
}

// ERPNext Mode of Payment names are free text; these cover the stock ones
export function paymentMethodFor(mode: string | null): PaymentMethod {
  const m = (mode ?? "").toLowerCase();
  if (m.includes("cheque") || m.includes("check") || m.includes("شيك")) return "cheque";
  if (m.includes("cash") || m.includes("نقد") || m.includes("عهدة") || m.includes("عهده")) return "cash";
  return "bank_transfer";
}

// Extracts a payment order reference from pmp_payment_order, remarks, or reference_no (e.g. "PAY-0001")
export function extractOrderRefFromPaymentEntry(doc: Record<string, unknown>): string | null {
  const direct = str(doc.pmp_payment_order);
  if (direct) return direct;
  for (const field of [str(doc.remarks), str(doc.reference_no)]) {
    if (!field) continue;
    const match = field.match(/\b(PAY-\d+)\b/i);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

function toErpSupplierEntry(r: ErpSupplier, linkedCount = 0): ErpSupplierEntry {
  return {
    erpName: r.erpName,
    supplierName: r.supplierName,
    taxId: r.taxId,
    contactPerson: r.contactPerson ?? null,
    email: r.email,
    phone: r.phone,
    address: r.address ?? null,
    logoUrl: r.logoUrl ?? null,
    supplierGroup: r.supplierGroup,
    disabled: r.disabled,
    linkedProjectSuppliers: linkedCount,
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toErpPaymentEntry(doc: any): ErpPaymentEntry {
  const mode = str(doc.mode_of_payment);
  return {
    name: str(doc.name) ?? "",
    paymentType: str(doc.payment_type),
    partyType: str(doc.party_type),
    party: str(doc.party),
    partyName: str(doc.party_name) ?? str(doc.party),
    paidAmount: Number(doc.paid_amount ?? 0) || 0,
    modeOfPayment: mode,
    paymentMethod: paymentMethodFor(mode),
    referenceNo: str(doc.reference_no),
    referenceDate: str(doc.reference_date),
    postingDate: str(doc.posting_date),
    docstatus: Number(doc.docstatus ?? 0) || 0,
    remarks: str(doc.remarks),
    pmpPaymentOrder: extractOrderRefFromPaymentEntry(doc),
  };
}

function guessContentType(fileName: string, headerType?: string | null): string {
  const cleanHeader = (headerType ?? "").split(";")[0].trim().toLowerCase();
  if (cleanHeader && cleanHeader !== "text/html" && cleanHeader !== "application/octet-stream") {
    return cleanHeader;
  }
  const ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")).toLowerCase() : "";
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext] || cleanHeader || "application/octet-stream";
}

// Downloads all files attached to a Payment Entry in ERPNext, uploads them to Cloudflare R2, and links them to the Payment Order
async function syncPaymentEntryAttachmentsToOrder(
  conn: ErpConnection,
  paymentEntryName: string,
  orderId: string,
  projectId: string,
  uploadedBy: string | null = null,
): Promise<{ synced: number; files: { id: string; fileName: string; objectPath: string }[] }> {
  if (!conn.apiKey || !conn.apiSecret) {
    return { synced: 0, files: [] };
  }
  await assertDeliverableUrl(conn.baseUrl);
  const filters = JSON.stringify([
    ["File", "attached_to_doctype", "=", "Payment Entry"],
    ["File", "attached_to_name", "=", paymentEntryName],
  ]);
  const fields = JSON.stringify(["name", "file_name", "file_url", "file_size", "is_private"]);
  const fileListRes = await erpFetch(
    conn,
    `api/resource/File?filters=${encodeURIComponent(filters)}&fields=${encodeURIComponent(fields)}&limit_page_length=50`,
  );
  const erpFiles: any[] = Array.isArray(fileListRes?.data) ? fileListRes.data : [];
  if (erpFiles.length === 0) {
    return { synced: 0, files: [] };
  }

  const base = conn.baseUrl.replace(/\/+$/, "");
  const syncedFiles: { id: string; fileName: string; objectPath: string }[] = [];

  for (const f of erpFiles) {
    const fileUrlRaw = str(f.file_url);
    if (!fileUrlRaw) continue;
    const fileName = str(f.file_name) ?? (fileUrlRaw.split("/").pop() || `erp-attachment-${Date.now()}`);

    const downloadUrl = /^https?:\/\//i.test(fileUrlRaw)
      ? new URL(fileUrlRaw)
      : new URL(fileUrlRaw.startsWith("/") ? fileUrlRaw.slice(1) : fileUrlRaw, base + "/");

    const fileRes = await fetch(downloadUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(ERP_TIMEOUT_MS),
      headers: {
        Authorization: `token ${conn.apiKey}:${conn.apiSecret}`,
      },
    });
    if (!fileRes.ok) {
      console.warn(`[ERP] Failed to download attachment ${fileUrlRaw} (HTTP ${fileRes.status})`);
      continue;
    }

    const arrayBuf = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length === 0 || buffer.length > MAX_ATTACHMENT_BYTES) continue;

    const ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")) : "";
    const nameWithoutExt = fileName.includes(".") ? fileName.substring(0, fileName.lastIndexOf(".")) : fileName;
    const cleanName = nameWithoutExt.replace(/[^a-zA-Z0-9.-]/g, "_") || "attachment";
    const objectKey = `projects/${projectId}/payments/${crypto.randomUUID()}-${cleanName}${ext}`;
    const contentType = guessContentType(fileName, fileRes.headers.get("content-type"));

    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: objectKey,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    const objectPath = `/${objectKey}`;
    const [inserted] = await db
      .insert(paymentAttachments)
      .values({
        projectId,
        entityType: "payment_order",
        entityId: orderId,
        fileName,
        objectPath,
        contentType,
        size: buffer.length,
        uploadedBy,
      })
      .returning();

    await db.insert(paymentActivity).values({
      projectId,
      entityType: "payment_order",
      entityId: orderId,
      action: "file_added",
      note: `${fileName} (ERPNext ${paymentEntryName})`,
      userId: uploadedBy,
    });

    syncedFiles.push({ id: inserted.id, fileName: inserted.fileName, objectPath: inserted.objectPath });
  }

  if (syncedFiles.length > 0) {
    notificationWss.broadcastPaymentsUpdate(projectId, uploadedBy ?? "erp");
  }

  return { synced: syncedFiles.length, files: syncedFiles };
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

    // The ERPNext webhook body is the document itself or { event, doc }
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
        const enriched = docName ? await enrichSupplierDocFromErp(conn, docName, doc) : doc;
        const { updated } = await applySupplier(conn.organizationId, enriched, conn.baseUrl);
        return record("applied", updated ? `Updated ${updated} project supplier(s)` : "Saved to the supplier directory");
      }

      if (doctype === "Payment Entry") {
        if (doc.docstatus === 2) return record("ignored", "Cancelled in ERPNext; reverse the payment order by hand if needed");
        if (doc.docstatus !== 1) return record("ignored", "Not submitted yet");
        if (doc.payment_type !== "Pay" && doc.payment_type !== "Internal Transfer") {
          return record("ignored", `payment_type is ${doc.payment_type}; only "Pay" or "Internal Transfer" settles payment orders`);
        }
        const orderRef = extractOrderRefFromPaymentEntry(doc);
        if (!orderRef) {
          return record("ignored", "Saved in ERP log (no payment order number PAY-XXXX found in pmp_payment_order, remarks, or reference_no)");
        }
        const refNo = str(doc.reference_no);
        const paymentRef = refNo && docName && refNo !== docName ? `${docName} (${refNo})` : (refNo ?? docName);
        const result = await deps.markOrderPaidFromErp(orderRef, await orgProjectIds(conn.organizationId), {
          paymentMethod: paymentMethodFor(str(doc.mode_of_payment)),
          paymentReference: paymentRef,
          paidDate: str(doc.reference_date) ?? str(doc.posting_date),
          amount: Number(doc.paid_amount ?? 0),
          source: `ERPNext ${docName ?? "Payment Entry"}`,
          partyName: str(doc.party_name) ?? str(doc.party),
        });
        if (result.ok) {
          let syncedCount = 0;
          if (docName && conn.apiKey && conn.apiSecret) {
            try {
              const attRes = await syncPaymentEntryAttachmentsToOrder(conn, docName, result.orderId, result.projectId, null);
              syncedCount = attRes.synced;
            } catch (attErr) {
              console.warn("[ERP] Failed to sync attachments on inbound Payment Entry:", attErr);
            }
          }
          const attSuffix = syncedCount > 0 ? ` (${syncedCount} attachment(s) synced)` : "";
          return record("applied", `${result.orderNo} marked paid${attSuffix}`);
        }
        if (result.alreadyPaid && result.orderId && result.projectId && docName && conn.apiKey && conn.apiSecret) {
          try {
            const attRes = await syncPaymentEntryAttachmentsToOrder(conn, docName, result.orderId, result.projectId, null);
            if (attRes.synced > 0) {
              return record("applied", `${result.orderNo ?? orderRef} already paid · synced ${attRes.synced} attachment(s)`);
            }
          } catch (attErr) {
            console.warn("[ERP] Failed to sync attachments for already-paid order:", attErr);
          }
        }
        return record("rejected", result.error);
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

  const loadConnection = async (orgId: string) =>
    (await db.select().from(erpConnections).where(eq(erpConnections.organizationId, orgId)))[0] ?? null;
  const requireConnection = async (orgId: string) => (await loadConnection(orgId)) ?? fail(404, "Connect ERPNext first");

  // Resolves the organization ID for project-level ERP operations (Supplier form dialog & Payment Order dialog)
  const resolveOrgForProject = async (req: Request, cu: CurrentUser): Promise<string> => {
    const askedOrg = typeof req.query.organizationId === "string" && req.query.organizationId ? req.query.organizationId : str((req.body as any)?.organizationId);
    if (askedOrg && (isSystemAdmin(cu) || askedOrg === cu.orgId)) return askedOrg;

    const projectId = typeof req.query.projectId === "string" && req.query.projectId ? req.query.projectId : str((req.body as any)?.projectId);
    if (projectId && projectId !== "all") {
      const [proj] = await db.select().from(projects).where(eq(projects.id, projectId));
      if (proj) {
        const candidateOrgs = [proj.organizationId, proj.contractorId, cu.orgId].filter((x): x is string => !!x);
        for (const cand of candidateOrgs) {
          const c = await loadConnection(cand);
          if (c) return cand;
        }
        if (proj.organizationId) return proj.organizationId;
      }
    }

    if (cu.orgId) return cu.orgId;
    const [firstConn] = await db.select().from(erpConnections).limit(1);
    if (firstConn) return firstConn.organizationId;
    return fail(400, "Choose an organization");
  };

  const userRoute = (handler: (req: Request, res: Response, cu: CurrentUser, orgId: string) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const cu = await deps.getCurrentUserWithOrg(req);
        if (!cu) return res.status(401).json({ error: "Authentication required" });
        const orgId = await resolveOrgForProject(req, cu);
        await handler(req, res, cu, orgId);
      } catch (error) {
        if (error instanceof ErpError) return res.status(error.status).json({ error: error.message });
        if (error instanceof WebhookUrlError) return res.status(400).json({ error: error.message });
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map((e: any) => e.message).join("; ") });
        console.error("[ERP] userRoute error:", error);
        deps.handleError(res, error);
      }
    };

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
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map((e: any) => e.message).join("; ") });
        console.error("[ERP] route error:", error);
        deps.handleError(res, error);
      }
    };

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

  const listOrgSuppliers = async (orgId: string, role?: string | null): Promise<ErpSupplierEntry[]> => {
    const rows = await db.select().from(erpSuppliers).where(eq(erpSuppliers.organizationId, orgId)).orderBy(erpSuppliers.supplierName);
    const projIds = Array.from(await orgProjectIds(orgId)).concat("");
    const [linkedSups, linkedSubs] = await Promise.all([
      db.select({ erp: suppliers.erpSupplier, n: sql<number>`count(*)::int` }).from(suppliers)
        .where(inArray(suppliers.projectId, projIds))
        .groupBy(suppliers.erpSupplier),
      db.select({ erp: projectSubcontractors.erpSupplier, n: sql<number>`count(*)::int` }).from(projectSubcontractors)
        .where(inArray(projectSubcontractors.projectId, projIds))
        .groupBy(projectSubcontractors.erpSupplier),
    ]);
    const counts = new Map<string | null, number>();
    for (const l of linkedSups) counts.set(l.erp, (counts.get(l.erp) ?? 0) + l.n);
    for (const l of linkedSubs) counts.set(l.erp, (counts.get(l.erp) ?? 0) + l.n);

    let entries = rows.map((r) => toErpSupplierEntry(r, counts.get(r.erpName) ?? 0));

    // When requested for a specific directory ("supplier" vs "subcontractor"), filter by Supplier Group
    if (role === "subcontractor") {
      entries = entries
        .filter((e) => !isErpSupplierGroup(e.supplierGroup))
        .sort((a, b) => Number(isErpContractorGroup(b.supplierGroup)) - Number(isErpContractorGroup(a.supplierGroup)));
    } else if (role === "supplier") {
      entries = entries
        .filter((e) => !isErpContractorGroup(e.supplierGroup))
        .sort((a, b) => Number(isErpSupplierGroup(b.supplierGroup)) - Number(isErpSupplierGroup(a.supplierGroup)));
    }

    return entries;
  };

  app.get(`${base}/suppliers`, route(async (req, res, _cu, orgId) => {
    const role = typeof req.query.role === "string" ? req.query.role : null;
    res.json(await listOrgSuppliers(orgId, role));
  }));

  // Project-accessible supplier list and single-supplier live sync (for SupplierFormDialog & SubcontractorDialog)
  app.get(`${base}/project-suppliers`, userRoute(async (req, res, _cu, orgId) => {
    const role = typeof req.query.role === "string" ? req.query.role : null;
    res.json(await listOrgSuppliers(orgId, role));
  }));

  app.post(`${base}/project-suppliers/fetch`, userRoute(async (req, res, _cu, orgId) => {
    const erpName = str(req.body?.erpName);
    if (!erpName) return fail(400, "Choose an ERPNext supplier");
    const conn = await loadConnection(orgId);
    if (conn && conn.apiKey && conn.apiSecret) {
      const enriched = await enrichSupplierDocFromErp(conn, erpName);
      const { entry } = await applySupplier(orgId, enriched, conn.baseUrl);
      return res.json(toErpSupplierEntry(entry));
    }
    const [cached] = await db
      .select()
      .from(erpSuppliers)
      .where(and(eq(erpSuppliers.organizationId, orgId), eq(erpSuppliers.erpName, erpName)));
    if (!cached) return fail(404, "Supplier not found in ERPNext directory");
    res.json(toErpSupplierEntry(cached));
  }));

  // Webhooks only fire on change, so the first sync (and any catch-up) pulls the whole list
  app.post(`${base}/suppliers/sync`, route(async (_req, res, _cu, orgId) => {
    const c = await requireConnection(orgId);
    const fields = JSON.stringify([
      "name",
      "supplier_name",
      "tax_id",
      "email_id",
      "mobile_no",
      "supplier_group",
      "supplier_type",
      "supplier_primary_contact",
      "primary_address",
      "supplier_primary_address",
      "country",
      "image",
      "disabled",
    ]);
    const list = await erpFetch(c, `api/resource/Supplier?fields=${encodeURIComponent(fields)}&limit_page_length=0`);
    const docs: ErpSupplierDoc[] = Array.isArray(list?.data) ? list.data : [];
    let updated = 0;
    for (const doc of docs) updated += (await applySupplier(orgId, doc, c.baseUrl)).updated;
    res.json({ suppliers: docs.length, projectSuppliersUpdated: updated });
  }));

  // Lists ERPNext Payment Entries (from live ERPNext API + inbound webhook logs) so a user can pick & link one in OrderDialog
  app.get(`${base}/payment-entries`, userRoute(async (req, res, _cu, orgId) => {
    const search = str(req.query.search)?.toLowerCase() ?? "";
    const party = str(req.query.party)?.toLowerCase() ?? "";
    const conn = await loadConnection(orgId);
    const byName = new Map<string, ErpPaymentEntry>();

    // 1. Pull from live ERPNext API if API key is configured
    if (conn && conn.apiKey && conn.apiSecret) {
      try {
        const fields = JSON.stringify([
          "name",
          "payment_type",
          "party_type",
          "party",
          "party_name",
          "paid_amount",
          "mode_of_payment",
          "reference_no",
          "reference_date",
          "posting_date",
          "docstatus",
          "remarks",
        ]);
        const filters: any[] = [["Payment Entry", "docstatus", "!=", 2]];
        const resList = await erpFetch(
          conn,
          `api/resource/Payment%20Entry?fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(JSON.stringify(filters))}&order_by=${encodeURIComponent("posting_date desc, creation desc")}&limit_page_length=100`,
        );
        const docs: any[] = Array.isArray(resList?.data) ? resList.data : [];
        for (const doc of docs) {
          const entry = toErpPaymentEntry(doc);
          if (entry.name) byName.set(entry.name, entry);
        }
      } catch (err) {
        console.warn("[ERP] Failed to fetch live Payment Entries, falling back to inbound log:", err);
      }
    }

    // 2. Also include Payment Entries received via webhook in erp_inbound_log
    const logs = await db
      .select()
      .from(erpInboundLog)
      .where(and(eq(erpInboundLog.organizationId, orgId), eq(erpInboundLog.doctype, "Payment Entry")))
      .orderBy(desc(erpInboundLog.createdAt))
      .limit(100);
    for (const l of logs) {
      const body: any = l.payload ?? {};
      const doc = body.doc && typeof body.doc === "object" ? body.doc : body;
      const entry = toErpPaymentEntry(doc);
      if (entry.name && !byName.has(entry.name)) {
        byName.set(entry.name, entry);
      }
    }

    let entries = Array.from(byName.values());
    if (search) {
      entries = entries.filter((e) =>
        [e.name, e.partyName, e.party, e.referenceNo, e.remarks, e.pmpPaymentOrder, String(e.paidAmount)]
          .some((v) => (v ?? "").toLowerCase().includes(search)),
      );
    }

    // Sort: matching party first, then newest postingDate
    if (party) {
      entries.sort((a, b) => {
        const aMatch = (a.partyName ?? "").toLowerCase().includes(party) || party.includes((a.partyName ?? "---").toLowerCase()) ? 1 : 0;
        const bMatch = (b.partyName ?? "").toLowerCase().includes(party) || party.includes((b.partyName ?? "---").toLowerCase()) ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
        return (b.postingDate ?? "").localeCompare(a.postingDate ?? "");
      });
    }

    res.json(entries.slice(0, 60));
  }));

  // Syncs attachments from an ERPNext Payment Entry into a Payment Order's attachments in Cloudflare R2
  app.post(`${base}/payment-entries/sync-attachments`, userRoute(async (req, res, cu, orgId) => {
    const orderId = str(req.body?.orderId);
    if (!orderId) return fail(400, "orderId is required");
    const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.id, orderId));
    if (!order) return fail(404, "Payment order not found");
    const projSet = await orgProjectIds(orgId);
    if (!projSet.has(order.projectId)) return fail(403, "Payment order does not belong to this organization");

    let paymentEntryName = str(req.body?.paymentEntryName);
    if (!paymentEntryName && order.paymentReference) {
      const m = order.paymentReference.match(/\b(ACC-PAY-[A-Za-z0-9-]+)\b/i);
      paymentEntryName = m ? m[1] : order.paymentReference.split("(")[0].trim();
    }
    if (!paymentEntryName) {
      return fail(400, "حدد رقم قيد الدفع (Payment Entry) من ERPNext أولاً");
    }

    const conn = await requireConnection(orgId);
    if (!conn.apiKey || !conn.apiSecret) {
      return fail(400, "Add the ERPNext API key and secret first");
    }

    const result = await syncPaymentEntryAttachmentsToOrder(conn, paymentEntryName, order.id, order.projectId, cu.user.id);
    res.json({
      paymentEntryName,
      synced: result.synced,
      files: result.files,
    });
  }));

  const statementSchema = z.object({
    supplier: z.string().trim().min(1, "Choose a supplier"),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date"),
  });

  // كشف حساب المورد: ERPNext's General Ledger for one supplier, grouped by voucher
  app.get(`${base}/statement`, userRoute(async (req, res, _cu, orgId) => {
    const q = statementSchema.parse(req.query);
    const c = await requireConnection(orgId);
    if (!c.company) fail(400, "Set the ERPNext company on the connection first");

    // Resolve supplier display name -> ERPNext supplier ID (erpName) when not yet linked
    let erpParty = q.supplier.trim();
    const orgSuppliers = await db.select({ erpName: erpSuppliers.erpName, supplierName: erpSuppliers.supplierName })
      .from(erpSuppliers)
      .where(eq(erpSuppliers.organizationId, orgId));
    const exactId = orgSuppliers.find((s) => s.erpName === erpParty);
    if (!exactId) {
      const lower = erpParty.toLowerCase();
      const byName = orgSuppliers.find((s) => s.supplierName.trim().toLowerCase() === lower);
      if (byName) erpParty = byName.erpName;
    }

    const filters = {
      company: c.company,
      from_date: q.from,
      to_date: q.to,
      party_type: "Supplier",
      party: [erpParty],
      group_by: "Group by Voucher (Consolidated)",
      show_remarks: 1,
    };
    let out: any;
    try {
      out = await erpFetch(c, "api/method/frappe.desk.query_report.run", {
        method: "POST",
        body: JSON.stringify({ report_name: "General Ledger", filters: JSON.stringify(filters), ignore_prepared_report: true }),
      });
    } catch (err) {
      if (err instanceof ErpError && err.status === 417) {
        return fail(404, `المورد أو المقاول "${q.supplier}" غير موجود أو غير مربوط في ERPNext — يرجى ربطه بمعرّف المورد في ERPNext أولاً`);
      }
      throw err;
    }
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
