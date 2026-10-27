// المدفوعات (Payments) — HTTP routes.
//
// Four kinds of record, all scoped to a project the caller can see:
//   bill requests   accounting asks the project side for the original bills/attachments
//   payment orders  accounting's instruction to pay, approved by an administrator
//   clearances      permits/clearances tracked with their fees
//   fines           fines tracked until they are paid, appealed or waived (waivers need a project manager)
// Payment orders close the loop: paying one marks its fine paid / its clearance fee paid.
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  projects,
  purchaseOrders,
  suppliers,
  progressPaymentCertificates,
  paymentBillRequests,
  paymentInvoices,
  paymentOrders,
  paymentSubcontractorCertificates,
  paymentClearances,
  paymentFines,
  paymentAttachments,
  paymentActivity,
  users,
  type Project,
} from "@shared/schema";
import { ProjectPermissions, type PermissionUser } from "@shared/permissions";
import {
  computeSubCert,
  isPoOver,
  poCommitted,
  type PoSummary,
  CLEARANCE_EXPIRY_WARNING_DAYS,
  CLEARANCE_STATUSES,
  FINE_STATUSES,
  LIABLE_PARTIES,
  OPEN_BILL_REQUEST,
  OPEN_CLEARANCE,
  OPEN_FINE,
  OPEN_PAYMENT_ORDER,
  PAYMENT_ENTITY_TYPES,
  PAYMENT_METHODS,
  type PaymentEntityType,
  type PaymentsPermissions,
  type PaymentsReport,
} from "@shared/payments";
import { notificationWss } from "./websocket";

type CurrentUser = { user: PermissionUser; orgId: string | null; teamMemberIds: string[] };

interface Deps {
  getCurrentUserWithOrg: (req: Request) => Promise<CurrentUser | null>;
  handleError: (res: any, error: unknown) => any;
}

class PaymentsError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const fail = (status: number, message: string): never => {
  throw new PaymentsError(status, message);
};

// Only the exact job title "Accountant" counts. "محاسب كميات" (quantity surveyor) contains the
// word محاسب but is a site role, not the accounting department.
const ACCOUNTANT_TITLES = new Set(["accountant", "محاسب"]);
// Project managers approve payment orders and fine waivers for the projects they can see
const PROJECT_MANAGER_TITLES = new Set(["project manager", "مدير مشروع"]);

const projectRef = (p: Project) => ({
  id: p.id,
  creatorId: p.creatorId,
  organizationId: p.organizationId,
  contractorId: p.contractorId,
  consultantId: p.consultantId,
});

const money = z.coerce.number().min(0).max(1e12);
const optText = (max = 2000) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").nullish().transform((v) => v || null);

const billRequestSchema = z.object({
  projectId: z.string().min(1),
  payeeName: z.string().trim().min(1, "Payee is required").max(300),
  description: z.string().trim().min(1, "Describe the bills required").max(3000),
  amount: money.default(0),
  dueDate: optDate,
  purchaseOrderId: z.string().nullish().transform((v) => v || null),
  certificateId: z.string().nullish().transform((v) => v || null),
  notes: optText(),
});

const orderSchema = z.object({
  projectId: z.string().min(1),
  billRequestId: z.string().nullish().transform((v) => v || null),
  fineId: z.string().nullish().transform((v) => v || null),
  clearanceId: z.string().nullish().transform((v) => v || null),
  subcontractorCertificateId: z.string().nullish().transform((v) => v || null),
  purchaseOrderId: z.string().nullish().transform((v) => v || null),
  certificateId: z.string().nullish().transform((v) => v || null),
  payeeName: z.string().trim().min(1, "Payee is required").max(300),
  amount: z.coerce.number().gt(0, "Amount must be greater than zero").max(1e12),
  // Only meaningful when there is no bill/fine/clearance behind the order
  purpose: z.enum(["advance", "other"]).optional(),
  reason: optText(),
});

const orderUpdateSchema = z.object({
  payeeName: z.string().trim().min(1).max(300).optional(),
  amount: z.coerce.number().gt(0).max(1e12).optional(),
  reason: optText(),
});

const clearanceBase = {
  title: z.string().trim().min(1, "Title is required").max(300),
  authority: optText(300),
  referenceNo: optText(100),
  status: z.enum(CLEARANCE_STATUSES as unknown as [string, ...string[]]).default("pending"),
  responsibleName: optText(200),
  dueDate: optDate,
  issueDate: optDate,
  expiryDate: optDate,
  feeAmount: money.default(0),
  notes: optText(),
};
const clearanceCreateSchema = z.object({ projectId: z.string().min(1), ...clearanceBase });
const clearanceUpdateSchema = z.object(clearanceBase).partial();

const fineBase = {
  title: z.string().trim().min(1, "Title is required").max(300),
  authority: optText(300),
  referenceNo: optText(100),
  reason: optText(),
  liableParty: z.enum(LIABLE_PARTIES as unknown as [string, ...string[]]).default("contractor"),
  amount: money.default(0),
  issueDate: optDate,
  dueDate: optDate,
  // "waived" is reached only through the waiver request/approval flow
  status: z.enum(["open", "under_appeal", "cancelled"]).default("open"),
  notes: optText(),
};
const fineCreateSchema = z.object({ projectId: z.string().min(1), ...fineBase });
const fineUpdateSchema = z.object(fineBase).partial();

const invoiceSchema = z.object({
  invoiceNo: z.string().trim().min(1, "Invoice number is required").max(100),
  invoiceDate: optDate,
  amount: z.coerce.number().gt(0, "Invoice amount must be greater than zero").max(1e12),
  notes: optText(500),
});

const subCertBase = {
  subcontractorName: z.string().trim().min(1, "Subcontractor is required").max(300),
  scope: optText(1000),
  contractValue: money.default(0),
  periodFrom: optDate,
  periodTo: optDate,
  grossAmount: z.coerce.number().min(0).max(1e12).default(0),
  retentionPercent: z.coerce.number().min(0).max(100).default(0),
  advanceRecovery: money.default(0),
  otherDeductions: money.default(0),
  deductionsNote: optText(1000),
  vatPercent: z.coerce.number().min(0).max(100).default(0),
  notes: optText(),
};
const subCertCreateSchema = z.object({ projectId: z.string().min(1), ...subCertBase });
const subCertUpdateSchema = z.object(subCertBase);

const subCertTransitionSchema = z.object({
  action: z.enum(["submit", "approve", "reject", "cancel"]),
  note: optText(),
});

const waiverSchema = z.object({
  action: z.enum(["request", "withdraw", "approve", "reject"]),
  note: optText(),
});

const billTransitionSchema = z.object({
  action: z.enum(["submit", "receive", "return", "cancel"]),
  note: optText(),
});

const orderTransitionSchema = z.object({
  action: z.enum(["submit", "approve", "reject", "pay", "cancel"]),
  note: optText(),
  paymentMethod: z.enum(PAYMENT_METHODS as unknown as [string, ...string[]]).optional(),
  paymentReference: optText(200),
  paidDate: optDate,
});

const attachmentSchema = z.object({
  entityType: z.enum(PAYMENT_ENTITY_TYPES as unknown as [string, ...string[]]),
  entityId: z.string().min(1),
  fileName: z.string().trim().min(1).max(300),
  objectPath: z.string().min(1).max(1000),
  contentType: z.string().max(200).nullish(),
  size: z.number().int().min(0).nullish(),
});

const n = (v: unknown) => Number(v ?? 0) || 0;
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (fromIso: string, to = new Date()) =>
  Math.floor((to.getTime() - new Date(fromIso).getTime()) / 86_400_000);

export function registerPaymentsRoutes(app: Express, deps: Deps) {
  const base = "/api/payments";

  type Ctx = {
    cu: CurrentUser;
    perms: PaymentsPermissions;
    projects: Project[];
    projectIds: Set<string>;
  };

  const loadVisibleProjects = async (cu: CurrentUser): Promise<Project[]> => {
    if (ProjectPermissions.canViewAll(cu.user)) return storage.getAllProjects();
    if (!cu.orgId) return [];
    const orgProjects = await storage.getProjectsByOrganization(cu.orgId);
    return orgProjects.filter((p) => ProjectPermissions.canView(cu.user, projectRef(p), cu.orgId));
  };

  const computePerms = async (cu: CurrentUser): Promise<PaymentsPermissions> => {
    const isAdmin = ["super_admin", "org_admin", "developer_admin"].includes(cu.user.role);
    let isAccountant = false;
    let isProjectManager = false;
    if (!isAdmin) {
      for (const id of cu.teamMemberIds) {
        const member = await storage.getTeamMember(id);
        const title = member?.position?.trim().toLowerCase();
        if (!title) continue;
        if (ACCOUNTANT_TITLES.has(title)) isAccountant = true;
        if (PROJECT_MANAGER_TITLES.has(title)) isProjectManager = true;
      }
    }
    return { isAccounting: isAdmin || isAccountant, canApprove: isAdmin || isProjectManager };
  };

  // Wraps a handler with auth, the caller's permissions and error mapping.
  const route = (handler: (req: Request, res: Response, ctx: Ctx) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const cu = await deps.getCurrentUserWithOrg(req);
        if (!cu) return res.status(401).json({ error: "Authentication required" });
        const [perms, visible] = await Promise.all([computePerms(cu), loadVisibleProjects(cu)]);
        await handler(req, res, { cu, perms, projects: visible, projectIds: new Set(visible.map((p) => p.id)) });
      } catch (error) {
        if (error instanceof PaymentsError) return res.status(error.status).json({ error: error.message });
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: error.errors.map((e) => e.message).join("; ") });
        }
        console.error("[Payments] route error:", error);
        deps.handleError(res, error);
      }
    };

  const requireProject = (ctx: Ctx, projectId: string): Project =>
    ctx.projects.find((p) => p.id === projectId) ?? fail(404, "Project not found");
  const requireAccounting = (ctx: Ctx) => {
    if (!ctx.perms.isAccounting) fail(403, "This action is for the accounting department");
  };

  const broadcast = (projectId: string, ctx: Ctx) =>
    notificationWss.broadcastPaymentsUpdate(projectId, ctx.cu.user.id);

  const log = (
    projectId: string,
    entityType: PaymentEntityType,
    entityId: string,
    action: string,
    userId: string,
    extra: { from?: string | null; to?: string | null; note?: string | null } = {},
  ) =>
    db.insert(paymentActivity).values({
      projectId,
      entityType,
      entityId,
      action,
      fromStatus: extra.from ?? null,
      toStatus: extra.to ?? null,
      note: extra.note ?? null,
      userId,
    });

  // Numbers are per project. The unique index on (project_id, seq) is the real guard, so a
  // concurrent insert that picks the same number is retried rather than trusted.
  async function insertNumbered<T>(
    table: typeof paymentBillRequests | typeof paymentOrders | typeof paymentSubcontractorCertificates,
    projectId: string,
    make: (seq: number) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const [row] = await db
        .select({ next: sql<number>`COALESCE(MAX(${table.seq}), 0) + 1` })
        .from(table)
        .where(eq(table.projectId, projectId));
      try {
        return await make(Number(row.next));
      } catch (error: any) {
        if (error?.code !== "23505" || attempt === 3) throw error;
      }
    }
    return fail(500, "Could not allocate a number");
  }

  const pad = (prefix: string, seq: number) => `${prefix}-${String(seq).padStart(4, "0")}`;

  // Attach files and the owning project's name to every row, in two queries rather than N.
  async function withAttachments<T extends { id: string }>(type: PaymentEntityType, rows: T[]) {
    if (rows.length === 0) return [] as (T & { attachments: unknown[] })[];
    const files = await db
      .select()
      .from(paymentAttachments)
      .where(and(eq(paymentAttachments.entityType, type), inArray(paymentAttachments.entityId, rows.map((r) => r.id))))
      .orderBy(paymentAttachments.createdAt);
    const byEntity = new Map<string, typeof files>();
    for (const f of files) byEntity.set(f.entityId, [...(byEntity.get(f.entityId) ?? []), f]);
    return rows.map((r) => ({ ...r, attachments: byEntity.get(r.id) ?? [] }));
  }

  const scopedIds = (ctx: Ctx, requested?: unknown): string[] => {
    if (typeof requested === "string" && requested) {
      requireProject(ctx, requested);
      return [requested];
    }
    return Array.from(ctx.projectIds);
  };

  // Per purchase order: its value against what has been invoiced and ordered/paid on it. Only POs that
  // a bill request or payment order points at are included. Purely a view: nothing here blocks a payment.
  async function buildPoSummaries(ctx: Ctx, ids: string[]): Promise<PoSummary[]> {
    if (ids.length === 0) return [];
    const [bills, orders] = await Promise.all([
      db.select().from(paymentBillRequests).where(and(inArray(paymentBillRequests.projectId, ids), isNotNull(paymentBillRequests.purchaseOrderId))),
      db.select().from(paymentOrders).where(and(inArray(paymentOrders.projectId, ids), isNotNull(paymentOrders.purchaseOrderId))),
    ]);
    // A PO is listed only while something live points at it; cancelled/rejected records don't count
    const liveBills = bills.filter((b) => b.status !== "cancelled");
    const liveOrders = orders.filter((o) => !["cancelled", "rejected"].includes(o.status));
    const poIds = Array.from(new Set([...liveBills, ...liveOrders].map((r) => r.purchaseOrderId as string)));
    if (poIds.length === 0) return [];

    const [pos, invoices] = await Promise.all([
      db
        .select({ id: purchaseOrders.id, projectId: purchaseOrders.projectId, poNumber: purchaseOrders.poNumber, title: purchaseOrders.title, total: purchaseOrders.totalAmount, supplierName: suppliers.supplierName })
        .from(purchaseOrders)
        .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
        .where(inArray(purchaseOrders.id, poIds)),
      liveBills.length
        ? db.select().from(paymentInvoices).where(inArray(paymentInvoices.billRequestId, liveBills.map((b) => b.id)))
        : Promise.resolve([] as (typeof paymentInvoices.$inferSelect)[]),
    ]);
    const billPo = new Map(liveBills.map((b) => [b.id, b.purchaseOrderId as string]));
    const projectName = new Map(ctx.projects.map((p) => [p.id, p.name]));

    return pos.map((po) => {
      const invoiced = invoices.filter((i) => billPo.get(i.billRequestId) === po.id).reduce((s, i) => s + n(i.amount), 0);
      const mine = orders.filter((o) => o.purchaseOrderId === po.id && !["cancelled", "rejected"].includes(o.status));
      const ordered = mine.reduce((s, o) => s + n(o.amount), 0);
      const paid = mine.filter((o) => o.status === "paid").reduce((s, o) => s + n(o.amount), 0);
      const advances = mine.filter((o) => o.purpose === "advance").reduce((s, o) => s + n(o.amount), 0);
      const value = n(po.total);
      const committed = poCommitted(invoiced, ordered);
      return {
        id: po.id,
        projectId: po.projectId,
        projectName: projectName.get(po.projectId) ?? "",
        poNumber: po.poNumber,
        title: po.title,
        supplierName: po.supplierName,
        value,
        invoiced,
        ordered,
        paid,
        advances,
        committed,
        remaining: value - committed,
        over: isPoOver(committed, value),
      };
    }).sort((a, b) => a.projectName.localeCompare(b.projectName) || a.poNumber.localeCompare(b.poNumber));
  }

  // ---- Who am I / what can I do ----
  app.get(`${base}/context`, route(async (_req, res, ctx) => {
    res.json({
      perms: ctx.perms,
      projects: ctx.projects.map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)),
    });
  }));

  // Purchase orders and payment certificates a record can be linked to
  app.get(`${base}/sources`, route(async (req, res, ctx) => {
    const projectId = String(req.query.projectId || "");
    requireProject(ctx, projectId);
    const [pos, certs] = await Promise.all([
      db
        .select({
          id: purchaseOrders.id,
          poNumber: purchaseOrders.poNumber,
          title: purchaseOrders.title,
          totalAmount: purchaseOrders.totalAmount,
          supplierName: suppliers.supplierName,
        })
        .from(purchaseOrders)
        .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
        .where(eq(purchaseOrders.projectId, projectId))
        .orderBy(desc(purchaseOrders.createdAt)),
      db
        .select({
          id: progressPaymentCertificates.id,
          certNo: progressPaymentCertificates.certNo,
          title: progressPaymentCertificates.title,
          totalAmount: progressPaymentCertificates.totalAmount,
          status: progressPaymentCertificates.status,
        })
        .from(progressPaymentCertificates)
        .where(eq(progressPaymentCertificates.projectId, projectId))
        .orderBy(desc(progressPaymentCertificates.certNo)),
    ]);
    res.json({ purchaseOrders: pos, certificates: certs });
  }));

  // ---- Everything the page shows, in one round trip ----
  app.get(`${base}/overview`, route(async (req, res, ctx) => {
    const ids = scopedIds(ctx, req.query.projectId);
    if (ids.length === 0) return res.json({ billRequests: [], orders: [], subcontractorCertificates: [], clearances: [], fines: [], purchaseOrders: [] });

    const [bills, orders, subCerts, clearances, fines, userRows] = await Promise.all([
      db.select().from(paymentBillRequests).where(inArray(paymentBillRequests.projectId, ids)).orderBy(desc(paymentBillRequests.createdAt)),
      db.select().from(paymentOrders).where(inArray(paymentOrders.projectId, ids)).orderBy(desc(paymentOrders.createdAt)),
      db.select().from(paymentSubcontractorCertificates).where(inArray(paymentSubcontractorCertificates.projectId, ids)).orderBy(desc(paymentSubcontractorCertificates.createdAt)),
      db.select().from(paymentClearances).where(inArray(paymentClearances.projectId, ids)).orderBy(desc(paymentClearances.createdAt)),
      db.select().from(paymentFines).where(inArray(paymentFines.projectId, ids)).orderBy(desc(paymentFines.createdAt)),
      db.select({ id: users.id, name: users.username }).from(users),
    ]);
    const invoiceRows = bills.length
      ? await db.select().from(paymentInvoices).where(inArray(paymentInvoices.billRequestId, bills.map((b) => b.id))).orderBy(paymentInvoices.createdAt)
      : [];
    const invoicesByRequest = new Map<string, typeof invoiceRows>();
    for (const i of invoiceRows) invoicesByRequest.set(i.billRequestId, [...(invoicesByRequest.get(i.billRequestId) ?? []), i]);

    const projectName = new Map(ctx.projects.map((p) => [p.id, p.name]));
    const userName = new Map(userRows.map((u) => [u.id, u.name]));
    const decorate = <T extends { projectId: string }>(rows: T[]) =>
      rows.map((r) => ({ ...r, projectName: projectName.get(r.projectId) ?? "" }));

    res.json({
      billRequests: (await withAttachments("bill_request", decorate(bills))).map((b) => {
        const invoices = invoicesByRequest.get(b.id) ?? [];
        return {
          ...b,
          requestedByName: userName.get(b.requestedBy ?? "") ?? null,
          invoices,
          invoiceTotal: invoices.reduce((s, i) => s + n(i.amount), 0),
        };
      }),
      orders: (await withAttachments("payment_order", decorate(orders))).map((o) => ({
        ...o,
        createdByName: userName.get(o.createdBy ?? "") ?? null,
        approvedByName: userName.get(o.approvedBy ?? "") ?? null,
      })),
      subcontractorCertificates: (await withAttachments("subcontractor_certificate", decorate(subCerts))).map((c) => ({
        ...c,
        createdByName: userName.get(c.createdBy ?? "") ?? null,
        approvedByName: userName.get(c.approvedBy ?? "") ?? null,
      })),
      clearances: await withAttachments("clearance", decorate(clearances)),
      fines: await withAttachments("fine", decorate(fines)),
      purchaseOrders: await buildPoSummaries(ctx, ids),
    });
  }));

  app.get(`${base}/activity`, route(async (req, res, ctx) => {
    const entityType = String(req.query.entityType || "");
    const entityId = String(req.query.entityId || "");
    if (!PAYMENT_ENTITY_TYPES.includes(entityType as PaymentEntityType) || !entityId) {
      return fail(400, "entityType and entityId are required");
    }
    const rows = await db
      .select({
        id: paymentActivity.id,
        projectId: paymentActivity.projectId,
        action: paymentActivity.action,
        fromStatus: paymentActivity.fromStatus,
        toStatus: paymentActivity.toStatus,
        note: paymentActivity.note,
        createdAt: paymentActivity.createdAt,
        userName: users.username,
      })
      .from(paymentActivity)
      .leftJoin(users, eq(users.id, paymentActivity.userId))
      .where(and(eq(paymentActivity.entityType, entityType), eq(paymentActivity.entityId, entityId)))
      .orderBy(desc(paymentActivity.createdAt));
    res.json(rows.filter((r) => ctx.projectIds.has(r.projectId)));
  }));

  // ---- Bill requests ----
  const loadBill = async (ctx: Ctx, id: string) => {
    const [row] = await db.select().from(paymentBillRequests).where(eq(paymentBillRequests.id, id));
    if (!row || !ctx.projectIds.has(row.projectId)) return fail(404, "Bill request not found");
    return row;
  };

  app.post(`${base}/bill-requests`, route(async (req, res, ctx) => {
    requireAccounting(ctx);
    const data = billRequestSchema.parse(req.body);
    requireProject(ctx, data.projectId);

    let supplierId: string | null = null;
    if (data.purchaseOrderId) {
      const [po] = await db.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, data.purchaseOrderId), eq(purchaseOrders.projectId, data.projectId)));
      if (!po) return fail(400, "Purchase order does not belong to this project");
      supplierId = po.supplierId;
    }
    if (data.certificateId) {
      const [cert] = await db.select().from(progressPaymentCertificates).where(and(eq(progressPaymentCertificates.id, data.certificateId), eq(progressPaymentCertificates.projectId, data.projectId)));
      if (!cert) return fail(400, "Payment certificate does not belong to this project");
    }

    const created = await insertNumbered(paymentBillRequests, data.projectId, async (seq) => {
      const [row] = await db.insert(paymentBillRequests).values({
        projectId: data.projectId,
        seq,
        requestNo: pad("BR", seq),
        supplierId,
        purchaseOrderId: data.purchaseOrderId,
        certificateId: data.certificateId,
        payeeName: data.payeeName,
        description: data.description,
        amount: String(data.amount),
        dueDate: data.dueDate,
        notes: data.notes,
        requestedBy: ctx.cu.user.id,
      }).returning();
      return row;
    });
    await log(data.projectId, "bill_request", created.id, "created", ctx.cu.user.id, { to: "requested" });
    broadcast(data.projectId, ctx);
    res.status(201).json(created);
  }));

  // ---- Invoices listed on a bill request ----
  // The project side lists the invoices while it is gathering the originals; once accounting has
  // confirmed receipt the list is frozen, because a payment order is raised against it.
  const invoicesEditable = (status: string) => ["requested", "returned", "submitted"].includes(status);
  // Once submitted, the list is under accounting's review: only accounting may still change it
  const requireInvoiceEditor = (ctx: Ctx, status: string) => {
    if (status === "submitted" && !ctx.perms.isAccounting) fail(403, "This request has been submitted; only accounting can change its invoices");
  };

  app.post(`${base}/bill-requests/:id/invoices`, route(async (req, res, ctx) => {
    const bill = await loadBill(ctx, req.params.id);
    if (!invoicesEditable(bill.status)) return fail(409, "Invoices can no longer be added to this request");
    requireInvoiceEditor(ctx, bill.status);
    const data = invoiceSchema.parse(req.body);

    // The same invoice must not be paid twice: refuse it if this payee already has it on another live request
    const [duplicate] = await db
      .select({ requestNo: paymentBillRequests.requestNo })
      .from(paymentInvoices)
      .innerJoin(paymentBillRequests, eq(paymentBillRequests.id, paymentInvoices.billRequestId))
      .where(and(
        eq(paymentInvoices.projectId, bill.projectId),
        sql`lower(trim(${paymentInvoices.invoiceNo})) = lower(${data.invoiceNo})`,
        sql`lower(trim(${paymentBillRequests.payeeName})) = lower(trim(${bill.payeeName}))`,
        sql`${paymentBillRequests.status} <> 'cancelled'`,
      ))
      .limit(1);
    if (duplicate) return fail(409, `Invoice ${data.invoiceNo} is already registered for this payee on ${duplicate.requestNo}`);

    const [row] = await db.insert(paymentInvoices).values({
      projectId: bill.projectId,
      billRequestId: bill.id,
      invoiceNo: data.invoiceNo,
      invoiceDate: data.invoiceDate,
      amount: String(data.amount),
      notes: data.notes,
      createdBy: ctx.cu.user.id,
    }).returning();
    await log(bill.projectId, "bill_request", bill.id, "invoice_added", ctx.cu.user.id, { note: `${data.invoiceNo} — ${data.amount}` });
    broadcast(bill.projectId, ctx);
    res.status(201).json(row);
  }));

  app.delete(`${base}/invoices/:id`, route(async (req, res, ctx) => {
    const [invoice] = await db.select().from(paymentInvoices).where(eq(paymentInvoices.id, req.params.id));
    if (!invoice || !ctx.projectIds.has(invoice.projectId)) return fail(404, "Invoice not found");
    const bill = await loadBill(ctx, invoice.billRequestId);
    if (!invoicesEditable(bill.status)) return fail(409, "Invoices can no longer be removed from this request");
    requireInvoiceEditor(ctx, bill.status);
    if (invoice.createdBy !== ctx.cu.user.id && !ctx.perms.isAccounting) return fail(403, "You can only remove invoices you added");
    await db.delete(paymentInvoices).where(eq(paymentInvoices.id, invoice.id));
    await log(bill.projectId, "bill_request", bill.id, "invoice_removed", ctx.cu.user.id, { note: invoice.invoiceNo });
    broadcast(bill.projectId, ctx);
    res.status(204).send();
  }));

  app.post(`${base}/bill-requests/:id/transition`, route(async (req, res, ctx) => {
    const { action, note } = billTransitionSchema.parse(req.body);
    const bill = await loadBill(ctx, req.params.id);
    const from = bill.status;
    const now = new Date();
    let patch: Partial<typeof paymentBillRequests.$inferInsert>;

    switch (action) {
      case "submit": {
        if (!["requested", "returned"].includes(from)) return fail(409, "This request is not waiting for bills");
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)` })
          .from(paymentAttachments)
          .where(and(eq(paymentAttachments.entityType, "bill_request"), eq(paymentAttachments.entityId, bill.id)));
        if (Number(count) === 0) return fail(400, "Attach the original bills before submitting");
        const [{ invoices }] = await db
          .select({ invoices: sql<number>`count(*)` })
          .from(paymentInvoices)
          .where(eq(paymentInvoices.billRequestId, bill.id));
        if (Number(invoices) === 0) return fail(400, "List the invoices (number and amount) before submitting");
        patch = { status: "submitted", submittedBy: ctx.cu.user.id, submittedAt: now };
        break;
      }
      case "receive":
        requireAccounting(ctx);
        if (from !== "submitted") return fail(409, "Only submitted bills can be confirmed as received");
        patch = { status: "received", receivedBy: ctx.cu.user.id, receivedAt: now };
        break;
      case "return":
        requireAccounting(ctx);
        if (from !== "submitted") return fail(409, "Only submitted bills can be returned");
        if (!note) return fail(400, "Say what must be corrected");
        patch = { status: "returned" };
        break;
      case "cancel": {
        requireAccounting(ctx);
        if (["received", "cancelled"].includes(from)) return fail(409, "This request can no longer be cancelled");
        patch = { status: "cancelled" };
        break;
      }
    }
    await db.update(paymentBillRequests).set({ ...patch, updatedAt: now }).where(eq(paymentBillRequests.id, bill.id));
    await log(bill.projectId, "bill_request", bill.id, action, ctx.cu.user.id, { from, to: patch.status as string, note });
    broadcast(bill.projectId, ctx);
    res.json({ ok: true, status: patch.status });
  }));

  // ---- Payment orders ----
  const loadOrder = async (ctx: Ctx, id: string) => {
    const [row] = await db.select().from(paymentOrders).where(eq(paymentOrders.id, id));
    if (!row || !ctx.projectIds.has(row.projectId)) return fail(404, "Payment order not found");
    return row;
  };

  // A source (bill / fine / clearance) can back only one live payment order at a time
  const hasLiveOrder = async (column: "billRequestId" | "fineId" | "clearanceId" | "subcontractorCertificateId", id: string, exceptOrderId?: string) => {
    const rows = await db
      .select({ id: paymentOrders.id })
      .from(paymentOrders)
      .where(and(eq(paymentOrders[column], id), inArray(paymentOrders.status, [...OPEN_PAYMENT_ORDER, "paid"])));
    return rows.some((r) => r.id !== exceptOrderId);
  };

  app.post(`${base}/orders`, route(async (req, res, ctx) => {
    requireAccounting(ctx);
    const data = orderSchema.parse(req.body);
    requireProject(ctx, data.projectId);

    const sources = [data.billRequestId, data.fineId, data.clearanceId, data.subcontractorCertificateId].filter(Boolean);
    if (sources.length > 1) return fail(400, "A payment order can have only one source");
    if (sources.length === 0 && !data.reason) return fail(400, "State what this payment is for");

    // An order raised from a bill request belongs to that request's purchase order unless one is chosen
    let purchaseOrderId = data.purchaseOrderId;
    if (data.billRequestId) {
      const [bill] = await db.select().from(paymentBillRequests).where(and(eq(paymentBillRequests.id, data.billRequestId), eq(paymentBillRequests.projectId, data.projectId)));
      if (!bill) return fail(400, "Bill request not found in this project");
      // A request raised after the fact only collects the original invoice; the payment is already made
      if (bill.paymentOrderId) return fail(409, "This request is for an order that has already been paid; no new payment order is needed");
      purchaseOrderId = purchaseOrderId ?? bill.purchaseOrderId;
      if (bill.status !== "received") return fail(409, "The original bills must be received before a payment order is raised");
      // An order pays the invoices listed on the request: it can pay less (deductions), never more
      const listed = await db.select({ amount: paymentInvoices.amount }).from(paymentInvoices).where(eq(paymentInvoices.billRequestId, bill.id));
      const invoiced = listed.reduce((s, i) => s + n(i.amount), 0);
      if (listed.length > 0 && data.amount > invoiced + 0.005) return fail(400, "Amount exceeds the total of the invoices on this request");
      if (await hasLiveOrder("billRequestId", bill.id)) return fail(409, "This bill request already has a payment order");
    }
    if (data.fineId) {
      const [fine] = await db.select().from(paymentFines).where(and(eq(paymentFines.id, data.fineId), eq(paymentFines.projectId, data.projectId)));
      if (!fine) return fail(400, "Fine not found in this project");
      if (!["open", "under_appeal"].includes(fine.status)) return fail(409, "This fine is not payable");
      if (await hasLiveOrder("fineId", fine.id)) return fail(409, "This fine already has a payment order");
      if (data.amount > n(fine.amount) - n(fine.paidAmount) + 0.001) return fail(400, "Amount exceeds the fine's outstanding balance");
    }
    if (data.clearanceId) {
      const [clearance] = await db.select().from(paymentClearances).where(and(eq(paymentClearances.id, data.clearanceId), eq(paymentClearances.projectId, data.projectId)));
      if (!clearance) return fail(400, "Clearance not found in this project");
      if (clearance.feePaid) return fail(409, "This clearance's fee is already paid");
      if (await hasLiveOrder("clearanceId", clearance.id)) return fail(409, "This clearance already has a payment order");
    }
    if (data.subcontractorCertificateId) {
      const [cert] = await db.select().from(paymentSubcontractorCertificates).where(and(eq(paymentSubcontractorCertificates.id, data.subcontractorCertificateId), eq(paymentSubcontractorCertificates.projectId, data.projectId)));
      if (!cert) return fail(400, "Subcontractor certificate not found in this project");
      if (cert.status !== "approved") return fail(409, "The certificate must be approved before a payment order is raised");
      if (await hasLiveOrder("subcontractorCertificateId", cert.id)) return fail(409, "This certificate already has a payment order");
      // One order pays the certificate in full, so the amount is the certificate's net payable
      if (Math.abs(data.amount - n(cert.netPayable)) > 0.005) return fail(400, "The amount must equal the certificate's net payable");
    }
    if (purchaseOrderId) {
      const [po] = await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.projectId, data.projectId)));
      if (!po) return fail(400, "Purchase order does not belong to this project");
    }
    if (data.certificateId) {
      const [cert] = await db.select({ id: progressPaymentCertificates.id }).from(progressPaymentCertificates).where(and(eq(progressPaymentCertificates.id, data.certificateId), eq(progressPaymentCertificates.projectId, data.projectId)));
      if (!cert) return fail(400, "Payment certificate does not belong to this project");
    }

    const created = await insertNumbered(paymentOrders, data.projectId, async (seq) => {
      const [row] = await db.insert(paymentOrders).values({
        projectId: data.projectId,
        seq,
        orderNo: pad("PAY", seq),
        billRequestId: data.billRequestId,
        fineId: data.fineId,
        clearanceId: data.clearanceId,
        subcontractorCertificateId: data.subcontractorCertificateId,
        purchaseOrderId,
        certificateId: data.certificateId,
        payeeName: data.payeeName,
        purpose: data.billRequestId ? "bill" : data.fineId ? "fine" : data.clearanceId ? "clearance" : data.subcontractorCertificateId ? "subcontractor" : data.purpose ?? "other",
        reason: data.reason,
        amount: String(data.amount),
        createdBy: ctx.cu.user.id,
      }).returning();
      return row;
    });
    await log(data.projectId, "payment_order", created.id, "created", ctx.cu.user.id, { to: "draft" });
    broadcast(data.projectId, ctx);
    res.status(201).json(created);
  }));

  app.patch(`${base}/orders/:id`, route(async (req, res, ctx) => {
    requireAccounting(ctx);
    const order = await loadOrder(ctx, req.params.id);
    if (!["draft", "rejected"].includes(order.status)) return fail(409, "Only a draft or rejected order can be edited");
    const data = orderUpdateSchema.parse(req.body);
    const values: Partial<typeof paymentOrders.$inferInsert> = { updatedAt: new Date() };
    if (data.payeeName !== undefined) values.payeeName = data.payeeName;
    if (data.reason !== undefined) values.reason = data.reason;
    if (data.amount !== undefined) values.amount = String(data.amount);
    await db.update(paymentOrders).set(values).where(eq(paymentOrders.id, order.id));
    await log(order.projectId, "payment_order", order.id, "edited", ctx.cu.user.id);
    broadcast(order.projectId, ctx);
    res.json({ ok: true });
  }));

  app.post(`${base}/orders/:id/transition`, route(async (req, res, ctx) => {
    const input = orderTransitionSchema.parse(req.body);
    const order = await loadOrder(ctx, req.params.id);
    const from = order.status;
    const now = new Date();
    let patch: Partial<typeof paymentOrders.$inferInsert>;

    switch (input.action) {
      case "submit": {
        requireAccounting(ctx);
        if (!["draft", "rejected"].includes(from)) return fail(409, "Only a draft or rejected order can be submitted");
        if (order.billRequestId) {
          const [bill] = await db.select().from(paymentBillRequests).where(eq(paymentBillRequests.id, order.billRequestId));
          if (!bill || bill.status !== "received") return fail(409, "The linked bill request is no longer in the received state");
        }
        patch = { status: "pending_approval", submittedAt: now, rejectReason: null };
        break;
      }
      case "approve": {
        if (!ctx.perms.canApprove) return fail(403, "Only a project manager or administrator can approve payment orders");
        if (from !== "pending_approval") return fail(409, "This order is not waiting for approval");
        // Whoever raised an order does not approve it (a super admin is the escape hatch)
        if (order.createdBy === ctx.cu.user.id && ctx.cu.user.role !== "super_admin") {
          return fail(403, "You cannot approve a payment order you created");
        }
        patch = { status: "approved", approvedBy: ctx.cu.user.id, approvedAt: now };
        break;
      }
      case "reject": {
        if (!ctx.perms.canApprove) return fail(403, "Only a project manager or administrator can reject payment orders");
        if (from !== "pending_approval") return fail(409, "This order is not waiting for approval");
        if (!input.note) return fail(400, "Give a reason for the rejection");
        patch = { status: "rejected", rejectReason: input.note };
        break;
      }
      case "pay": {
        requireAccounting(ctx);
        if (from !== "approved") return fail(409, "Only an approved order can be paid");
        if (!input.paymentMethod) return fail(400, "Choose the payment method");
        patch = {
          status: "paid",
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference,
          paidDate: input.paidDate ?? today(),
          paidBy: ctx.cu.user.id,
          paidAt: now,
        };
        break;
      }
      case "cancel": {
        requireAccounting(ctx);
        if (!["draft", "pending_approval", "approved", "rejected"].includes(from)) return fail(409, "This order can no longer be cancelled");
        patch = { status: "cancelled" };
        break;
      }
    }

    await db.transaction(async (tx) => {
      await tx.update(paymentOrders).set({ ...patch, updatedAt: now }).where(eq(paymentOrders.id, order.id));
      // Keep the fine / clearance this order pays for in step with it
      if (order.fineId) {
        const [fine] = await tx.select().from(paymentFines).where(eq(paymentFines.id, order.fineId));
        if (fine) {
          if (input.action === "submit") {
            await tx.update(paymentFines).set({ status: "payment_requested", updatedAt: now }).where(eq(paymentFines.id, fine.id));
          } else if (input.action === "pay") {
            const paid = n(fine.paidAmount) + n(order.amount);
            await tx.update(paymentFines).set({
              paidAmount: String(paid),
              status: paid + 0.001 >= n(fine.amount) ? "paid" : "open",
              updatedAt: now,
            }).where(eq(paymentFines.id, fine.id));
          } else if (["reject", "cancel"].includes(input.action) && fine.status === "payment_requested") {
            await tx.update(paymentFines).set({ status: "open", updatedAt: now }).where(eq(paymentFines.id, fine.id));
          }
        }
      }
      if (order.clearanceId && input.action === "pay") {
        await tx.update(paymentClearances).set({ feePaid: true, updatedAt: now }).where(eq(paymentClearances.id, order.clearanceId));
      }
      if (order.subcontractorCertificateId && input.action === "pay") {
        await tx.update(paymentSubcontractorCertificates).set({ status: "paid", updatedAt: now }).where(eq(paymentSubcontractorCertificates.id, order.subcontractorCertificateId));
      }
    });

    await log(order.projectId, "payment_order", order.id, input.action, ctx.cu.user.id, { from, to: patch.status as string, note: input.note });
    broadcast(order.projectId, ctx);
    res.json({ ok: true, status: patch.status });
  }));

  // After a payment has gone out, accounting can ask the project side for the original invoice behind it.
  // That is an ordinary bill request (it appears under أصول الفواتير) that remembers which order it is for.
  app.post(`${base}/orders/:id/request-originals`, route(async (req, res, ctx) => {
    requireAccounting(ctx);
    const order = await loadOrder(ctx, req.params.id);
    if (order.status !== "paid") return fail(409, "The original invoice can be requested once the order is paid");
    // An order raised from a bill request already went through collecting the originals
    if (order.billRequestId) return fail(409, "The originals for this order were collected before payment");
    const input = z.object({ dueDate: optDate, notes: optText() }).parse(req.body ?? {});

    const [existing] = await db
      .select({ requestNo: paymentBillRequests.requestNo })
      .from(paymentBillRequests)
      .where(and(eq(paymentBillRequests.paymentOrderId, order.id), sql`${paymentBillRequests.status} <> 'cancelled'`))
      .limit(1);
    if (existing) return fail(409, `The originals for this order have already been requested on ${existing.requestNo}`);

    let supplierId: string | null = null;
    if (order.purchaseOrderId) {
      const [po] = await db.select({ supplierId: purchaseOrders.supplierId }).from(purchaseOrders).where(eq(purchaseOrders.id, order.purchaseOrderId));
      supplierId = po?.supplierId ?? null;
    }
    const created = await insertNumbered(paymentBillRequests, order.projectId, async (seq) => {
      const [row] = await db.insert(paymentBillRequests).values({
        projectId: order.projectId,
        seq,
        requestNo: pad("BR", seq),
        supplierId,
        purchaseOrderId: order.purchaseOrderId,
        certificateId: order.certificateId,
        paymentOrderId: order.id,
        payeeName: order.payeeName,
        description: `أصل الفاتورة والمستندات المؤيدة لأمر الدفع ${order.orderNo}${order.reason ? ` — ${order.reason}` : ""}`,
        amount: order.amount,
        dueDate: input.dueDate,
        notes: input.notes,
        requestedBy: ctx.cu.user.id,
      }).returning();
      return row;
    });
    await log(order.projectId, "bill_request", created.id, "created", ctx.cu.user.id, { to: "requested", note: `لأمر الدفع ${order.orderNo}` });
    await log(order.projectId, "payment_order", order.id, "originals_requested", ctx.cu.user.id, { note: created.requestNo });
    broadcast(order.projectId, ctx);
    res.status(201).json(created);
  }));

  // ---- Subcontractor certificates (مستخلصات مقاولي الباطن) ----
  const loadSubCert = async (ctx: Ctx, id: string) => {
    const [row] = await db.select().from(paymentSubcontractorCertificates).where(eq(paymentSubcontractorCertificates.id, id));
    if (!row || !ctx.projectIds.has(row.projectId)) return fail(404, "Subcontractor certificate not found");
    return row;
  };

  // Stored figures are always recomputed from the inputs here; the client's preview is only a preview
  const subCertFigures = (d: z.infer<typeof subCertUpdateSchema>) => {
    const f = computeSubCert(d);
    return {
      grossAmount: String(d.grossAmount),
      retentionPercent: String(d.retentionPercent),
      retentionAmount: String(f.retentionAmount),
      advanceRecovery: String(d.advanceRecovery),
      otherDeductions: String(d.otherDeductions),
      vatPercent: String(d.vatPercent),
      vatAmount: String(f.vatAmount),
      netPayable: String(f.netPayable),
    };
  };

  // The person who raised it, or accounting, may change it while it is still theirs to change
  const requireSubCertOwner = (ctx: Ctx, row: { createdBy: string | null }) => {
    if (row.createdBy !== ctx.cu.user.id && !ctx.perms.isAccounting) {
      fail(403, "Only the person who created this certificate, or accounting, can do this");
    }
  };

  app.post(`${base}/subcontractor-certificates`, route(async (req, res, ctx) => {
    const data = subCertCreateSchema.parse(req.body);
    requireProject(ctx, data.projectId);
    const { projectId, ...rest } = data;
    const created = await insertNumbered(paymentSubcontractorCertificates, projectId, async (seq) => {
      const [row] = await db.insert(paymentSubcontractorCertificates).values({
        projectId,
        seq,
        certNo: pad("SC", seq),
        subcontractorName: rest.subcontractorName,
        scope: rest.scope,
        contractValue: String(rest.contractValue),
        periodFrom: rest.periodFrom,
        periodTo: rest.periodTo,
        deductionsNote: rest.deductionsNote,
        notes: rest.notes,
        ...subCertFigures(rest),
        createdBy: ctx.cu.user.id,
      }).returning();
      return row;
    });
    await log(projectId, "subcontractor_certificate", created.id, "created", ctx.cu.user.id, { to: "draft" });
    broadcast(projectId, ctx);
    res.status(201).json(created);
  }));

  app.patch(`${base}/subcontractor-certificates/:id`, route(async (req, res, ctx) => {
    const row = await loadSubCert(ctx, req.params.id);
    requireSubCertOwner(ctx, row);
    if (!["draft", "rejected"].includes(row.status)) return fail(409, "Only a draft or rejected certificate can be edited");
    const d = subCertUpdateSchema.parse(req.body);
    await db.update(paymentSubcontractorCertificates).set({
      subcontractorName: d.subcontractorName,
      scope: d.scope,
      contractValue: String(d.contractValue),
      periodFrom: d.periodFrom,
      periodTo: d.periodTo,
      deductionsNote: d.deductionsNote,
      notes: d.notes,
      ...subCertFigures(d),
      updatedAt: new Date(),
    }).where(eq(paymentSubcontractorCertificates.id, row.id));
    await log(row.projectId, "subcontractor_certificate", row.id, "edited", ctx.cu.user.id);
    broadcast(row.projectId, ctx);
    res.json({ ok: true });
  }));

  app.post(`${base}/subcontractor-certificates/:id/transition`, route(async (req, res, ctx) => {
    const { action, note } = subCertTransitionSchema.parse(req.body);
    const cert = await loadSubCert(ctx, req.params.id);
    const from = cert.status;
    const now = new Date();
    let patch: Partial<typeof paymentSubcontractorCertificates.$inferInsert>;

    switch (action) {
      case "submit":
        requireSubCertOwner(ctx, cert);
        if (!["draft", "rejected"].includes(from)) return fail(409, "Only a draft or rejected certificate can be submitted");
        if (!(n(cert.grossAmount) > 0)) return fail(400, "Enter the value of work for this period");
        if (!(n(cert.netPayable) > 0)) return fail(400, "The deductions exceed the amount of the certificate");
        patch = { status: "submitted", submittedAt: now, rejectReason: null };
        break;
      case "approve":
        if (!ctx.perms.canApprove) return fail(403, "Only a project manager or administrator can approve certificates");
        if (from !== "submitted") return fail(409, "This certificate is not waiting for approval");
        // Whoever prepared it does not approve it (a super admin is the escape hatch)
        if (cert.createdBy === ctx.cu.user.id && ctx.cu.user.role !== "super_admin") {
          return fail(403, "You cannot approve a certificate you created");
        }
        patch = { status: "approved", approvedBy: ctx.cu.user.id, approvedAt: now };
        break;
      case "reject":
        if (!ctx.perms.canApprove) return fail(403, "Only a project manager or administrator can reject certificates");
        if (from !== "submitted") return fail(409, "This certificate is not waiting for approval");
        if (!note) return fail(400, "Give a reason for the rejection");
        patch = { status: "rejected", rejectReason: note };
        break;
      case "cancel":
        requireSubCertOwner(ctx, cert);
        if (!["draft", "submitted", "rejected", "approved"].includes(from)) return fail(409, "This certificate can no longer be cancelled");
        if (await hasLiveOrder("subcontractorCertificateId", cert.id)) return fail(409, "A payment order exists for this certificate; cancel it first");
        patch = { status: "cancelled" };
        break;
    }
    await db.update(paymentSubcontractorCertificates).set({ ...patch, updatedAt: now }).where(eq(paymentSubcontractorCertificates.id, cert.id));
    await log(cert.projectId, "subcontractor_certificate", cert.id, action, ctx.cu.user.id, { from, to: patch.status as string, note });
    broadcast(cert.projectId, ctx);
    res.json({ ok: true, status: patch.status });
  }));

  // ---- Clearances ----
  const loadClearance = async (ctx: Ctx, id: string) => {
    const [row] = await db.select().from(paymentClearances).where(eq(paymentClearances.id, id));
    if (!row || !ctx.projectIds.has(row.projectId)) return fail(404, "Clearance not found");
    return row;
  };

  app.post(`${base}/clearances`, route(async (req, res, ctx) => {
    const data = clearanceCreateSchema.parse(req.body);
    requireProject(ctx, data.projectId);
    const [row] = await db.insert(paymentClearances).values({
      ...data,
      feeAmount: String(data.feeAmount),
      createdBy: ctx.cu.user.id,
    }).returning();
    await log(data.projectId, "clearance", row.id, "created", ctx.cu.user.id, { to: row.status });
    broadcast(data.projectId, ctx);
    res.status(201).json(row);
  }));

  app.patch(`${base}/clearances/:id`, route(async (req, res, ctx) => {
    const row = await loadClearance(ctx, req.params.id);
    const data = clearanceUpdateSchema.parse(req.body);
    // The fee can't be rewritten once money has been paid against it, or the books stop matching
    if (data.feeAmount !== undefined && row.feePaid && data.feeAmount !== n(row.feeAmount)) {
      return fail(409, "The fee has been paid and can no longer be changed");
    }
    const { feeAmount, ...rest } = data;
    await db.update(paymentClearances).set({
      ...rest,
      ...(feeAmount !== undefined ? { feeAmount: String(feeAmount) } : {}),
      updatedAt: new Date(),
    }).where(eq(paymentClearances.id, row.id));
    const statusChanged = data.status && data.status !== row.status;
    await log(row.projectId, "clearance", row.id, statusChanged ? "status_changed" : "edited", ctx.cu.user.id, statusChanged ? { from: row.status, to: data.status } : {});
    broadcast(row.projectId, ctx);
    res.json({ ok: true });
  }));

  app.delete(`${base}/clearances/:id`, route(async (req, res, ctx) => {
    requireAccounting(ctx);
    const row = await loadClearance(ctx, req.params.id);
    if (await hasLiveOrder("clearanceId", row.id)) return fail(409, "A payment order exists for this clearance");
    await db.delete(paymentClearances).where(eq(paymentClearances.id, row.id));
    await db.delete(paymentAttachments).where(and(eq(paymentAttachments.entityType, "clearance"), eq(paymentAttachments.entityId, row.id)));
    broadcast(row.projectId, ctx);
    res.status(204).send();
  }));

  // ---- Fines ----
  const loadFine = async (ctx: Ctx, id: string) => {
    const [row] = await db.select().from(paymentFines).where(eq(paymentFines.id, id));
    if (!row || !ctx.projectIds.has(row.projectId)) return fail(404, "Fine not found");
    return row;
  };

  app.post(`${base}/fines`, route(async (req, res, ctx) => {
    const data = fineCreateSchema.parse(req.body);
    requireProject(ctx, data.projectId);
    const [row] = await db.insert(paymentFines).values({
      ...data,
      amount: String(data.amount),
      createdBy: ctx.cu.user.id,
    }).returning();
    await log(data.projectId, "fine", row.id, "created", ctx.cu.user.id, { to: row.status });
    broadcast(data.projectId, ctx);
    res.status(201).json(row);
  }));

  app.patch(`${base}/fines/:id`, route(async (req, res, ctx) => {
    const row = await loadFine(ctx, req.params.id);
    const data = fineUpdateSchema.parse(req.body);
    if (["payment_requested", "paid", "waiver_requested", "waived"].includes(row.status)) {
      return fail(409, "This fine is in payment or waiver handling and can no longer be edited");
    }
    if (data.amount !== undefined && data.amount < n(row.paidAmount)) return fail(400, "Amount cannot be below what has already been paid");
    const { amount, ...rest } = data;
    await db.update(paymentFines).set({
      ...rest,
      ...(amount !== undefined ? { amount: String(amount) } : {}),
      updatedAt: new Date(),
    }).where(eq(paymentFines.id, row.id));
    const statusChanged = data.status && data.status !== row.status;
    await log(row.projectId, "fine", row.id, statusChanged ? "status_changed" : "edited", ctx.cu.user.id, statusChanged ? { from: row.status, to: data.status } : {});
    broadcast(row.projectId, ctx);
    res.json({ ok: true });
  }));

  // A fine is never waived directly: someone on the project asks, a project manager decides.
  app.post(`${base}/fines/:id/waiver`, route(async (req, res, ctx) => {
    const { action, note } = waiverSchema.parse(req.body);
    const fine = await loadFine(ctx, req.params.id);
    const from = fine.status;
    const now = new Date();
    let patch: Partial<typeof paymentFines.$inferInsert>;

    switch (action) {
      case "request":
        if (!["open", "under_appeal"].includes(from)) return fail(409, "A waiver can only be requested for an open fine");
        if (!note) return fail(400, "Explain why the fine should be waived");
        if (await hasLiveOrder("fineId", fine.id)) return fail(409, "A payment order exists for this fine");
        patch = { status: "waiver_requested", waiverReason: note, waiverRequestedBy: ctx.cu.user.id, waiverDecidedBy: null };
        break;
      case "withdraw":
        if (from !== "waiver_requested") return fail(409, "There is no waiver request to withdraw");
        if (fine.waiverRequestedBy !== ctx.cu.user.id && !ctx.perms.canApprove) return fail(403, "Only the requester can withdraw this request");
        patch = { status: "open" };
        break;
      case "approve":
      case "reject":
        if (!ctx.perms.canApprove) return fail(403, "Only a project manager can decide on a waiver");
        if (from !== "waiver_requested") return fail(409, "There is no waiver request to decide on");
        // The person asking does not also approve (a super admin is the escape hatch)
        if (action === "approve" && fine.waiverRequestedBy === ctx.cu.user.id && ctx.cu.user.role !== "super_admin") {
          return fail(403, "You cannot approve a waiver you requested");
        }
        if (action === "reject" && !note) return fail(400, "Give a reason for rejecting the waiver");
        patch = { status: action === "approve" ? "waived" : "open", waiverDecidedBy: ctx.cu.user.id };
        break;
    }
    await db.update(paymentFines).set({ ...patch, updatedAt: now }).where(eq(paymentFines.id, fine.id));
    await log(fine.projectId, "fine", fine.id, `waiver_${action}`, ctx.cu.user.id, { from, to: patch.status as string, note });
    broadcast(fine.projectId, ctx);
    res.json({ ok: true, status: patch.status });
  }));

  app.delete(`${base}/fines/:id`, route(async (req, res, ctx) => {
    requireAccounting(ctx);
    const row = await loadFine(ctx, req.params.id);
    if (await hasLiveOrder("fineId", row.id)) return fail(409, "A payment order exists for this fine");
    await db.delete(paymentFines).where(eq(paymentFines.id, row.id));
    await db.delete(paymentAttachments).where(and(eq(paymentAttachments.entityType, "fine"), eq(paymentAttachments.entityId, row.id)));
    broadcast(row.projectId, ctx);
    res.status(204).send();
  }));

  // ---- Attachments ----
  const entityProject = async (ctx: Ctx, type: PaymentEntityType, id: string): Promise<{ projectId: string; status: string }> => {
    switch (type) {
      case "bill_request": return loadBill(ctx, id);
      case "payment_order": return loadOrder(ctx, id);
      case "clearance": return loadClearance(ctx, id);
      case "fine": return loadFine(ctx, id);
      case "subcontractor_certificate": return loadSubCert(ctx, id);
    }
  };

  app.post(`${base}/attachments`, route(async (req, res, ctx) => {
    const data = attachmentSchema.parse(req.body);
    const type = data.entityType as PaymentEntityType;
    const entity = await entityProject(ctx, type, data.entityId);
    // Files must be ones this project uploaded through the payments folder, not an arbitrary URL
    if (!data.objectPath.startsWith(`/projects/${entity.projectId}/payments/`) || data.objectPath.includes("..")) {
      return fail(400, "Invalid file location");
    }
    if ((type === "bill_request" && ["received", "cancelled"].includes(entity.status)) || (type === "subcontractor_certificate" && ["paid", "cancelled"].includes(entity.status))) {
      return fail(409, "Bills can no longer be added to this request");
    }
    const [row] = await db.insert(paymentAttachments).values({
      projectId: entity.projectId,
      entityType: type,
      entityId: data.entityId,
      fileName: data.fileName,
      objectPath: data.objectPath,
      contentType: data.contentType ?? null,
      size: data.size ?? null,
      uploadedBy: ctx.cu.user.id,
    }).returning();
    await log(entity.projectId, type, data.entityId, "file_added", ctx.cu.user.id, { note: data.fileName });
    broadcast(entity.projectId, ctx);
    res.status(201).json(row);
  }));

  app.delete(`${base}/attachments/:id`, route(async (req, res, ctx) => {
    const [file] = await db.select().from(paymentAttachments).where(eq(paymentAttachments.id, req.params.id));
    if (!file || !ctx.projectIds.has(file.projectId)) return fail(404, "File not found");
    if (file.uploadedBy !== ctx.cu.user.id && !ctx.perms.isAccounting) return fail(403, "You can only remove files you uploaded");
    const type = file.entityType as PaymentEntityType;
    const entity = await entityProject(ctx, type, file.entityId);
    if ((type === "bill_request" && ["received", "cancelled"].includes(entity.status)) || (type === "subcontractor_certificate" && ["paid", "cancelled"].includes(entity.status))) {
      return fail(409, "Files can no longer be removed from this request");
    }
    await db.delete(paymentAttachments).where(eq(paymentAttachments.id, file.id));
    await log(file.projectId, type, file.entityId, "file_removed", ctx.cu.user.id, { note: file.fileName });
    broadcast(file.projectId, ctx);
    res.status(204).send();
  }));

  // ---- Reports for managers ----
  app.get(`${base}/reports`, route(async (req, res, ctx) => {
    const ids = scopedIds(ctx, req.query.projectId);
    const scope = ctx.projects.filter((p) => ids.includes(p.id));
    const name = new Map(scope.map((p) => [p.id, p.name]));
    const empty = ids.length === 0;

    const poSummaries = await buildPoSummaries(ctx, ids);
    const [bills, orders, clearances, fines, subCerts] = empty
      ? [[], [], [], [], []] as [typeof paymentBillRequests.$inferSelect[], typeof paymentOrders.$inferSelect[], typeof paymentClearances.$inferSelect[], typeof paymentFines.$inferSelect[], typeof paymentSubcontractorCertificates.$inferSelect[]]
      : await Promise.all([
          db.select().from(paymentBillRequests).where(inArray(paymentBillRequests.projectId, ids)),
          db.select().from(paymentOrders).where(inArray(paymentOrders.projectId, ids)),
          db.select().from(paymentClearances).where(inArray(paymentClearances.projectId, ids)),
          db.select().from(paymentFines).where(inArray(paymentFines.projectId, ids)),
          db.select().from(paymentSubcontractorCertificates).where(inArray(paymentSubcontractorCertificates.projectId, ids)),
        ]);

    // Per subcontractor: certified work counts once a certificate is approved; cancelled/draft/rejected ones don't
    const subMap = new Map<string, PaymentsReport["subcontractors"][number]>();
    for (const c of subCerts) {
      if (c.status === "cancelled") continue;
      const key = `${c.projectId}|${c.subcontractorName.trim().toLowerCase()}`;
      const row = subMap.get(key) ?? { projectName: name.get(c.projectId) ?? "", subcontractorName: c.subcontractorName, contractValue: 0, certifiedGross: 0, retentionHeld: 0, paidNet: 0, payableNet: 0, certificates: 0 };
      row.certificates += 1;
      row.contractValue = Math.max(row.contractValue, n(c.contractValue));
      if (c.status === "approved" || c.status === "paid") {
        row.certifiedGross += n(c.grossAmount);
        row.retentionHeld += n(c.retentionAmount);
      }
      if (c.status === "paid") row.paidNet += n(c.netPayable);
      if (c.status === "approved") row.payableNet += n(c.netPayable);
      subMap.set(key, row);
    }

    const now = new Date();
    const todayIso = today();
    const monthKey = todayIso.slice(0, 7);
    const warnUntil = new Date(now.getTime() + CLEARANCE_EXPIRY_WARNING_DAYS * 86_400_000).toISOString().slice(0, 10);
    const isOpen = <T extends readonly string[]>(set: T, status: string) => (set as readonly string[]).includes(status);

    const billOverdue = (b: typeof bills[number]) => isOpen(OPEN_BILL_REQUEST, b.status) && !!b.dueDate && b.dueDate < todayIso;
    // Why a clearance needs a manager's eye, if it does
    const attention = (c: typeof clearances[number]): "expired" | "expiring" | "overdue" | null => {
      if (c.status === "expired" || (c.status === "obtained" && c.expiryDate && c.expiryDate < todayIso)) return "expired";
      if (c.status === "obtained" && c.expiryDate && c.expiryDate <= warnUntil) return "expiring";
      if (isOpen(OPEN_CLEARANCE, c.status) && c.dueDate && c.dueDate < todayIso) return "overdue";
      return null;
    };

    const byProject = scope.map((p) => {
      const pb = bills.filter((b) => b.projectId === p.id);
      const po = orders.filter((o) => o.projectId === p.id);
      const pc = clearances.filter((c) => c.projectId === p.id);
      const pf = fines.filter((f) => f.projectId === p.id);
      const openFines = pf.filter((f) => isOpen(OPEN_FINE, f.status));
      return {
        projectId: p.id,
        projectName: p.name,
        openBillRequests: pb.filter((b) => isOpen(OPEN_BILL_REQUEST, b.status)).length,
        overdueBillRequests: pb.filter(billOverdue).length,
        pendingOrdersAmount: po.filter((o) => o.status === "pending_approval").reduce((s, o) => s + n(o.amount), 0),
        approvedUnpaidAmount: po.filter((o) => o.status === "approved").reduce((s, o) => s + n(o.amount), 0),
        paidAmount: po.filter((o) => o.status === "paid").reduce((s, o) => s + n(o.amount), 0),
        openClearances: pc.filter((c) => isOpen(OPEN_CLEARANCE, c.status)).length,
        clearancesAttention: pc.filter((c) => attention(c)).length,
        openFinesAmount: openFines.reduce((s, f) => s + Math.max(0, n(f.amount) - n(f.paidAmount)), 0),
        openFinesCount: openFines.length,
      };
    }).sort((a, b) => a.projectName.localeCompare(b.projectName));

    const paid = orders.filter((o) => o.status === "paid");
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    const report: PaymentsReport = {
      generatedAt: now.toISOString(),
      totals: {
        openBillRequests: byProject.reduce((s, p) => s + p.openBillRequests, 0),
        overdueBillRequests: byProject.reduce((s, p) => s + p.overdueBillRequests, 0),
        ordersPendingApproval: orders.filter((o) => o.status === "pending_approval").length,
        ordersPendingApprovalAmount: byProject.reduce((s, p) => s + p.pendingOrdersAmount, 0),
        ordersApprovedUnpaidAmount: byProject.reduce((s, p) => s + p.approvedUnpaidAmount, 0),
        paidThisMonthAmount: paid.filter((o) => (o.paidDate ?? "").startsWith(monthKey)).reduce((s, o) => s + n(o.amount), 0),
        paidTotalAmount: paid.reduce((s, o) => s + n(o.amount), 0),
        openClearances: byProject.reduce((s, p) => s + p.openClearances, 0),
        clearancesAttention: byProject.reduce((s, p) => s + p.clearancesAttention, 0),
        openFinesCount: byProject.reduce((s, p) => s + p.openFinesCount, 0),
        openFinesAmount: byProject.reduce((s, p) => s + p.openFinesAmount, 0),
        paidFinesAmount: fines.reduce((s, f) => s + n(f.paidAmount), 0),
        subCertsPendingCount: subCerts.filter((c) => c.status === "submitted").length,
        subCertsPendingAmount: subCerts.filter((c) => c.status === "submitted").reduce((s, c) => s + n(c.netPayable), 0),
        subCertsApprovedUnpaidAmount: subCerts.filter((c) => c.status === "approved").reduce((s, c) => s + n(c.netPayable), 0),
        subRetentionHeld: subCerts.filter((c) => c.status === "approved" || c.status === "paid").reduce((s, c) => s + n(c.retentionAmount), 0),
        poOverCount: poSummaries.filter((p) => p.over).length,
      },
      purchaseOrders: poSummaries,
      subcontractors: Array.from(subMap.values()).sort((a, b) => a.projectName.localeCompare(b.projectName) || a.subcontractorName.localeCompare(b.subcontractorName)),
      byProject,
      monthlyPaid: months.map((m) => ({
        month: m,
        amount: paid.filter((o) => (o.paidDate ?? "").startsWith(m)).reduce((s, o) => s + n(o.amount), 0),
      })),
      billRequestAging: bills
        .filter((b) => isOpen(OPEN_BILL_REQUEST, b.status))
        .map((b) => ({
          projectName: name.get(b.projectId) ?? "",
          requestNo: b.requestNo,
          payeeName: b.payeeName,
          status: b.status,
          ageDays: daysBetween(b.createdAt.toISOString(), now),
          dueDate: b.dueDate,
          overdue: billOverdue(b),
        }))
        .sort((a, b) => b.ageDays - a.ageDays),
      clearancesAttention: clearances.flatMap((c) => {
        const reason = attention(c);
        return reason ? [{
          projectName: name.get(c.projectId) ?? "",
          title: c.title,
          authority: c.authority,
          status: c.status,
          expiryDate: c.expiryDate,
          dueDate: c.dueDate,
          reason,
        }] : [];
      }),
      openFines: fines
        .filter((f) => isOpen(OPEN_FINE, f.status))
        .map((f) => ({
          projectName: name.get(f.projectId) ?? "",
          title: f.title,
          authority: f.authority,
          liableParty: f.liableParty,
          status: f.status,
          amount: Math.max(0, n(f.amount) - n(f.paidAmount)),
          dueDate: f.dueDate,
        }))
        .sort((a, b) => b.amount - a.amount),
    };
    res.json(report);
  }));
}
