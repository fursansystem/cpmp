// الرخص والمعاملات (Permits & transactions) — HTTP routes.
//
//   catalogue      services (built-in and each developer's own), with their steps, requirements and documents
//   transactions   one run of a service for one project: steps assigned to people, requirements, files, fee, expiry
//
// The project's developer (owning organization) runs the section. Anyone on the project can be assigned a
// transaction or a step and sees only what is assigned to them. Fees are paid by payment orders in المدفوعات,
// which keep the transaction's payment step in step (see permits-service.ts).
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  paymentOrders,
  permitActivity,
  permitAttachments,
  permitAuthorities,
  permitServiceRequirements,
  permitServices,
  permitServiceSteps,
  permitTransactionRequirements,
  permitTransactions,
  permitTransactionSteps,
  tasks,
  users,
  type PermitTransaction,
  type Project,
} from "@shared/schema";
import { PermitPermissions, ProjectPermissions, type PermissionUser } from "@shared/permissions";
import {
  addDays,
  addMonths,
  PERMIT_CATEGORIES,
  PERMIT_KINDS,
  PERMIT_STATUS_LABELS,
  PERMIT_TRANSITIONS,
  PERMIT_ACTIONS,
  REQUIREMENT_KINDS,
  REQUIREMENT_STATUSES,
  STEP_PARTIES,
  STEP_STATUSES,
  permitAttention,
  type PermitsContext,
  type PermitStatus,
} from "@shared/permits";
import { permitsService } from "./permits-service";
import { enumLabel, translate } from "@shared/i18n";

type CurrentUser = { user: PermissionUser; orgId: string | null; teamMemberIds: string[] };

interface Deps {
  getCurrentUserWithOrg: (req: Request) => Promise<CurrentUser | null>;
  handleError: (res: any, error: unknown) => any;
}

class PermitsError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new PermitsError(status, message);
};

const ACCOUNTANT_TITLES = new Set(["accountant", "محاسب"]);
// Payment orders that still stand: an order raised for a fee blocks a second one and keeps the fee locked
const LIVE_ORDER = ["requested", "request_approved", "draft", "pending_approval", "approved", "paid"];

const projectRef = (p: Project) => ({ id: p.id, creatorId: p.creatorId, organizationId: p.organizationId, contractorId: p.contractorId, consultantId: p.consultantId });

const optText = (max = 2000) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").nullish().transform((v) => v || null);
const optId = z.string().nullish().transform((v) => v || null);
const optInt = (max: number) => z.coerce.number().int().min(0).max(max).nullish().transform((v) => (v === undefined || v === null || Number.isNaN(v) ? null : v));
const money = z.coerce.number().min(0).max(1e12);
const today = () => new Date().toISOString().slice(0, 10);

const transactionCreateSchema = z.object({
  projectId: z.string().min(1),
  serviceId: optId,
  title: optText(300),
  kind: z.enum(PERMIT_KINDS as unknown as [string, ...string[]]).optional(),
  category: z.enum(PERMIT_CATEGORIES as unknown as [string, ...string[]]).optional(),
  authorityName: optText(300),
  portalUrl: optText(1000),
  assigneeUserId: optId,
  startDate: optDate,
  dueDate: optDate,
  feeAmount: money.optional(),
  referenceNo: optText(100),
  notes: optText(),
  renewalOfId: optId,
});

const transactionUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  kind: z.enum(PERMIT_KINDS as unknown as [string, ...string[]]),
  category: z.enum(PERMIT_CATEGORIES as unknown as [string, ...string[]]),
  authorityName: optText(300),
  portalUrl: optText(1000),
  assigneeUserId: optId,
  referenceNo: optText(100),
  licenseNo: optText(100),
  startDate: optDate,
  dueDate: optDate,
  issueDate: optDate,
  expiryDate: optDate,
  renewalLeadDays: optInt(3650),
  feeAmount: money,
  notes: optText(),
}).partial();

const transitionSchema = z.object({
  action: z.enum(PERMIT_ACTIONS as unknown as [string, ...string[]]),
  note: optText(),
  referenceNo: optText(100),
  licenseNo: optText(100),
  issueDate: optDate,
  expiryDate: optDate,
});

const stepCreateSchema = z.object({
  title: z.string().trim().min(1, "Step title is required").max(300),
  description: optText(),
  party: z.enum(STEP_PARTIES as unknown as [string, ...string[]]).default("any"),
  assigneeUserId: optId,
  dueDate: optDate,
  isPaymentStep: z.boolean().default(false),
});
const stepUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: optText(),
  party: z.enum(STEP_PARTIES as unknown as [string, ...string[]]),
  assigneeUserId: optId,
  dueDate: optDate,
  seq: z.coerce.number().int().min(1).max(1000),
}).partial();
const stepStatusSchema = z.object({
  status: z.enum(STEP_STATUSES as unknown as [string, ...string[]]),
  note: optText(),
});

const requirementCreateSchema = z.object({
  kind: z.enum(REQUIREMENT_KINDS as unknown as [string, ...string[]]).default("document"),
  title: z.string().trim().min(1, "Requirement title is required").max(300),
  description: optText(),
  mandatory: z.boolean().default(true),
});
const requirementUpdateSchema = z.object({
  kind: z.enum(REQUIREMENT_KINDS as unknown as [string, ...string[]]),
  title: z.string().trim().min(1).max(300),
  description: optText(),
  mandatory: z.boolean(),
  status: z.enum(REQUIREMENT_STATUSES as unknown as [string, ...string[]]),
}).partial();

const attachmentSchema = z.object({
  transactionId: z.string().min(1),
  requirementId: optId,
  stepId: optId,
  fileName: z.string().trim().min(1).max(300),
  objectPath: z.string().min(1).max(1000),
  contentType: z.string().max(200).nullish(),
  size: z.number().int().min(0).nullish(),
});

const serviceSchema = z.object({
  scope: z.enum(["system", "org"]).default("org"),
  name: z.string().trim().min(1, "Service name is required").max(300),
  authorityId: optId,
  // a new authority typed in the form, created with the service
  authorityName: optText(300),
  authorityPortalUrl: optText(1000),
  category: z.enum(PERMIT_CATEGORIES as unknown as [string, ...string[]]).default("other"),
  description: optText(4000),
  serviceUrl: optText(1000),
  channels: optText(500),
  isLicense: z.boolean().default(false),
  validityMonths: optInt(600),
  renewalLeadDays: z.coerce.number().int().min(0).max(3650).default(30),
  feeAmount: money.default(0),
  feeNote: optText(500),
  slaDays: optInt(3650),
  active: z.boolean().default(true),
  steps: z.array(z.object({
    title: z.string().trim().min(1).max(300),
    description: optText(),
    party: z.enum(STEP_PARTIES as unknown as [string, ...string[]]).default("any"),
    slaDays: optInt(3650),
    isPaymentStep: z.boolean().default(false),
  })).max(60).default([]),
  requirements: z.array(z.object({
    kind: z.enum(REQUIREMENT_KINDS as unknown as [string, ...string[]]).default("document"),
    title: z.string().trim().min(1).max(300),
    description: optText(),
    mandatory: z.boolean().default(true),
  })).max(100).default([]),
});

const authoritySchema = z.object({
  scope: z.enum(["system", "org"]).default("org"),
  name: z.string().trim().min(1).max(300),
  nameEn: optText(300),
  portalUrl: optText(1000),
});

export function registerPermitsRoutes(app: Express, deps: Deps) {
  const base = "/api/permits";

  type Ctx = {
    cu: CurrentUser;
    projects: Project[];
    projectIds: Set<string>;
    devProjectIds: Set<string>;
  };

  const loadVisibleProjects = async (cu: CurrentUser): Promise<Project[]> => {
    if (ProjectPermissions.canViewAll(cu.user)) return storage.getAllProjects();
    if (!cu.orgId) return [];
    const orgProjects = await storage.getProjectsByOrganization(cu.orgId);
    return orgProjects.filter((p) => ProjectPermissions.canView(cu.user, projectRef(p), cu.orgId));
  };

  const route = (handler: (req: Request, res: Response, ctx: Ctx) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const cu = await deps.getCurrentUserWithOrg(req);
        if (!cu) return res.status(401).json({ error: "Authentication required" });
        const visible = await loadVisibleProjects(cu);
        const devProjectIds = new Set(visible.filter((p) => PermitPermissions.isDeveloper(cu.user, projectRef(p), cu.orgId)).map((p) => p.id));
        await handler(req, res, { cu, projects: visible, projectIds: new Set(visible.map((p) => p.id)), devProjectIds });
      } catch (error) {
        if (error instanceof PermitsError) return res.status(error.status).json({ error: error.message });
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors.map((e) => e.message).join("; ") });
        console.error("[Permits] route error:", error);
        deps.handleError(res, error);
      }
    };

  const me = (ctx: Ctx) => ctx.cu.user.id;
  const projectOf = (ctx: Ctx, projectId: string): Project => ctx.projects.find((p) => p.id === projectId) ?? fail(404, "Project not found");
  const isDev = (ctx: Ctx, projectId: string) => ctx.devProjectIds.has(projectId);
  const requireManage = (ctx: Ctx, projectId: string) => {
    if (!isDev(ctx, projectId)) fail(403, "Only the project's developer manages its licences and transactions");
  };

  const stepAssigneesOf = async (transactionIds: string[]) => {
    if (transactionIds.length === 0) return new Map<string, string[]>();
    const rows = await db
      .select({ tx: permitTransactionSteps.transactionId, user: permitTransactionSteps.assigneeUserId })
      .from(permitTransactionSteps)
      .where(inArray(permitTransactionSteps.transactionId, transactionIds));
    const out = new Map<string, string[]>();
    for (const r of rows) if (r.user) out.set(r.tx, [...(out.get(r.tx) ?? []), r.user]);
    return out;
  };

  // A transaction the caller may open: the developer sees all of its project's, others only what is assigned to them
  const loadTx = async (ctx: Ctx, id: string) => {
    const [tx] = await db.select().from(permitTransactions).where(eq(permitTransactions.id, id));
    if (!tx || !ctx.projectIds.has(tx.projectId)) return fail(404, "Transaction not found");
    const project = projectOf(ctx, tx.projectId);
    const stepAssignees = (await stepAssigneesOf([tx.id])).get(tx.id) ?? [];
    const assigned = tx.assigneeUserId === me(ctx) || stepAssignees.includes(me(ctx));
    if (!isDev(ctx, tx.projectId) && !assigned) return fail(404, "Transaction not found");
    return { tx, project, assigned, canWork: isDev(ctx, tx.projectId) || assigned };
  };

  const loadStep = async (ctx: Ctx, stepId: string) => {
    const [step] = await db.select().from(permitTransactionSteps).where(eq(permitTransactionSteps.id, stepId));
    if (!step) return fail(404, "Step not found");
    const loaded = await loadTx(ctx, step.transactionId);
    return { step, ...loaded };
  };

  const loadRequirement = async (ctx: Ctx, reqId: string) => {
    const [requirement] = await db.select().from(permitTransactionRequirements).where(eq(permitTransactionRequirements.id, reqId));
    if (!requirement) return fail(404, "Requirement not found");
    const loaded = await loadTx(ctx, requirement.transactionId);
    return { requirement, ...loaded };
  };

  const requireAssignable = async (project: Project, userId: string | null | undefined) => {
    if (!userId) return;
    const list = await permitsService.assignableUsers(project);
    if (!list.some((u) => u.id === userId)) fail(400, "The assignee must be a member of the project's developer, contractor or consultant");
  };

  const liveOrders = async (transactionId: string) =>
    db.select().from(paymentOrders).where(and(eq(paymentOrders.permitTransactionId, transactionId), inArray(paymentOrders.status, LIVE_ORDER)));

  async function insertNumbered<T>(projectId: string, make: (seq: number) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const [row] = await db
        .select({ next: sql<number>`COALESCE(MAX(${permitTransactions.seq}), 0) + 1` })
        .from(permitTransactions)
        .where(eq(permitTransactions.projectId, projectId));
      try {
        return await make(Number(row.next));
      } catch (error: any) {
        if (error?.code !== "23505" || attempt === 3) throw error;
      }
    }
    return fail(500, "Could not allocate a number");
  }
  const txNo = (seq: number) => `TR-${String(seq).padStart(4, "0")}`;

  const userNames = async (ids: (string | null | undefined)[]) => {
    const list = Array.from(new Set(ids.filter(Boolean) as string[]));
    if (list.length === 0) return new Map<string, string>();
    const rows = await db.select({ id: users.id, name: users.fullName, nameAr: users.fullNameArabic }).from(users).where(inArray(users.id, list));
    return new Map(rows.map((u) => [u.id, u.nameAr || u.name]));
  };

  const isAccounting = async (cu: CurrentUser) => {
    if (["super_admin", "developer_admin"].includes(cu.user.role)) return true;
    for (const id of cu.teamMemberIds) {
      const member = await storage.getTeamMember(id);
      if (ACCOUNTANT_TITLES.has(member?.position?.trim().toLowerCase() ?? "")) return true;
    }
    return false;
  };

  const after = (tx: { id: string; projectId: string }, ctx: Ctx) => {
    permitsService.broadcast(tx.projectId, me(ctx));
    void permitsService.syncTasks(tx.id);
  };

  // ======================================================================= context
  app.get(`${base}/context`, route(async (_req, res, ctx) => {
    const body: PermitsContext = {
      projects: ctx.projects
        .map((p) => {
          const isDeveloper = isDev(ctx, p.id);
          // the consultant's team does not ask for transfers (same rule as المدفوعات)
          const consultantOnly = !!ctx.cu.orgId && p.consultantId === ctx.cu.orgId && p.organizationId !== ctx.cu.orgId && p.contractorId !== ctx.cu.orgId;
          return { id: p.id, name: p.name, isDeveloper, canRequestPayment: isDeveloper && (ctx.cu.user.role === "super_admin" || !consultantOnly) };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
      isAccounting: await isAccounting(ctx.cu),
      canManageSystemCatalog: PermitPermissions.canManageSystemCatalog(ctx.cu.user),
      canManageOrgCatalog: PermitPermissions.canManageOrgCatalog(ctx.cu.user),
      userId: me(ctx),
    };
    res.json(body);
  }));

  app.get(`${base}/projects/:projectId/assignees`, route(async (req, res, ctx) => {
    const project = projectOf(ctx, req.params.projectId);
    requireManage(ctx, project.id);
    res.json(await permitsService.assignableUsers(project));
  }));

  // ======================================================================= lists
  // The transactions the caller can see, decorated for the tables (steps progress, attention, payment state)
  const listTransactions = async (ctx: Ctx, projectIds: string[]) => {
    if (projectIds.length === 0) return [];
    const rows = await db.select().from(permitTransactions).where(inArray(permitTransactions.projectId, projectIds)).orderBy(desc(permitTransactions.createdAt));
    const ids = rows.map((r) => r.id);
    const [steps, reqs, orders] = ids.length
      ? await Promise.all([
          db.select().from(permitTransactionSteps).where(inArray(permitTransactionSteps.transactionId, ids)).orderBy(asc(permitTransactionSteps.seq)),
          db.select().from(permitTransactionRequirements).where(inArray(permitTransactionRequirements.transactionId, ids)),
          db.select().from(paymentOrders).where(inArray(paymentOrders.permitTransactionId, ids)).orderBy(desc(paymentOrders.createdAt)),
        ])
      : [[], [], []];
    const visible = rows.filter((r) => isDev(ctx, r.projectId) || r.assigneeUserId === me(ctx) || steps.some((s) => s.transactionId === r.id && s.assigneeUserId === me(ctx)));
    const names = await userNames(visible.map((r) => r.assigneeUserId));
    const projectName = new Map(ctx.projects.map((p) => [p.id, p.name]));
    const renewedBy = new Map(rows.filter((r) => r.renewalOfId && !["cancelled", "rejected"].includes(r.status)).map((r) => [r.renewalOfId!, r.transactionNo]));
    const todayIso = today();
    return visible.map((t) => {
      const ts = steps.filter((s) => s.transactionId === t.id);
      const tr = reqs.filter((r) => r.transactionId === t.id);
      const order = orders.find((o) => o.permitTransactionId === t.id && LIVE_ORDER.includes(o.status)) ?? orders.find((o) => o.permitTransactionId === t.id);
      const next = ts.find((s) => s.status === "pending" || s.status === "in_progress");
      return {
        ...t,
        projectName: projectName.get(t.projectId) ?? "",
        assigneeName: t.assigneeUserId ? names.get(t.assigneeUserId) ?? null : t.responsibleName,
        stepsTotal: ts.length,
        stepsDone: ts.filter((s) => s.status === "done" || s.status === "skipped").length,
        nextStep: next ? { id: next.id, title: next.title, dueDate: next.dueDate, assigneeUserId: next.assigneeUserId } : null,
        requirementsMissing: tr.filter((r) => r.mandatory && r.status === "missing").length,
        attention: permitAttention(t, todayIso),
        order: order ? { id: order.id, orderNo: order.orderNo, status: order.status } : null,
        renewedBy: renewedBy.get(t.id) ?? null,
        isDeveloper: isDev(ctx, t.projectId),
      };
    });
  };

  app.get(`${base}/overview`, route(async (req, res, ctx) => {
    const requested = typeof req.query.projectId === "string" && req.query.projectId ? [projectOf(ctx, req.query.projectId).id] : Array.from(ctx.projectIds);
    res.json({ transactions: await listTransactions(ctx, requested) });
  }));

  // Steps assigned to the caller that are still open, across projects
  // `projectIds` (comma-separated) narrows it to those projects, for the home page's filters.
  app.get(`${base}/my-tasks`, route(async (req, res, ctx) => {
    const wanted = typeof req.query.projectIds === "string" ? new Set(req.query.projectIds.split(",").filter(Boolean)) : null;
    const ids = Array.from(ctx.projectIds).filter((id) => !wanted || wanted.has(id));
    if (ids.length === 0) return res.json({ steps: [], transactions: [] });
    const rows = await db
      .select({ step: permitTransactionSteps, tx: permitTransactions })
      .from(permitTransactionSteps)
      .innerJoin(permitTransactions, eq(permitTransactions.id, permitTransactionSteps.transactionId))
      .where(and(
        inArray(permitTransactionSteps.projectId, ids),
        eq(permitTransactionSteps.assigneeUserId, me(ctx)),
        inArray(permitTransactionSteps.status, ["pending", "in_progress"]),
        inArray(permitTransactions.status, ["not_started", "in_progress", "submitted", "returned"]),
      ))
      .orderBy(asc(permitTransactionSteps.dueDate));
    const projectName = new Map(ctx.projects.map((p) => [p.id, p.name]));
    const owned = await db
      .select()
      .from(permitTransactions)
      .where(and(inArray(permitTransactions.projectId, ids), eq(permitTransactions.assigneeUserId, me(ctx)), inArray(permitTransactions.status, ["not_started", "in_progress", "submitted", "returned", "completed"])))
      .orderBy(asc(permitTransactions.dueDate));
    res.json({
      steps: rows.map(({ step, tx }) => ({
        ...step,
        transactionNo: tx.transactionNo,
        transactionTitle: tx.title,
        authorityName: tx.authorityName,
        projectName: projectName.get(tx.projectId) ?? "",
        isPaymentBlocked: step.isPaymentStep && Number(tx.feeAmount) > 0 && !tx.feePaid,
      })),
      transactions: owned
        .map((t) => ({ ...t, projectName: projectName.get(t.projectId) ?? "", attention: permitAttention(t) }))
        .filter((t) => t.status !== "completed" || t.attention),
    });
  }));

  // ======================================================================= one transaction
  app.get(`${base}/transactions/:id`, route(async (req, res, ctx) => {
    const { tx, project, canWork } = await loadTx(ctx, req.params.id);
    const [steps, requirements, files, activity, orders, service, renewals, renewalOf] = await Promise.all([
      db.select().from(permitTransactionSteps).where(eq(permitTransactionSteps.transactionId, tx.id)).orderBy(asc(permitTransactionSteps.seq)),
      db.select().from(permitTransactionRequirements).where(eq(permitTransactionRequirements.transactionId, tx.id)).orderBy(asc(permitTransactionRequirements.seq)),
      db.select().from(permitAttachments).where(eq(permitAttachments.transactionId, tx.id)).orderBy(asc(permitAttachments.createdAt)),
      db.select().from(permitActivity).where(eq(permitActivity.transactionId, tx.id)).orderBy(desc(permitActivity.createdAt)),
      db.select().from(paymentOrders).where(eq(paymentOrders.permitTransactionId, tx.id)).orderBy(desc(paymentOrders.createdAt)),
      tx.serviceId ? db.select().from(permitServices).where(eq(permitServices.id, tx.serviceId)).then((r) => r[0] ?? null) : Promise.resolve(null),
      db.select({ id: permitTransactions.id, transactionNo: permitTransactions.transactionNo, status: permitTransactions.status }).from(permitTransactions).where(eq(permitTransactions.renewalOfId, tx.id)),
      tx.renewalOfId ? db.select({ id: permitTransactions.id, transactionNo: permitTransactions.transactionNo }).from(permitTransactions).where(eq(permitTransactions.id, tx.renewalOfId)).then((r) => r[0] ?? null) : Promise.resolve(null),
    ]);
    const names = await userNames([tx.assigneeUserId, tx.createdBy, ...steps.flatMap((s) => [s.assigneeUserId, s.completedBy]), ...files.map((f) => f.uploadedBy), ...activity.map((a) => a.userId), ...requirements.map((r) => r.updatedBy)]);
    const name = (id: string | null) => (id ? names.get(id) ?? null : null);
    const manage = isDev(ctx, tx.projectId);
    res.json({
      transaction: {
        ...tx,
        projectName: project.name,
        assigneeName: name(tx.assigneeUserId) ?? tx.responsibleName,
        createdByName: name(tx.createdBy),
        attention: permitAttention(tx),
        serviceName: service?.name ?? null,
        serviceUrl: service?.serviceUrl ?? null,
        validityMonths: service?.validityMonths ?? null,
        renewals,
        renewalOf,
      },
      steps: steps.map((s) => ({ ...s, assigneeName: name(s.assigneeUserId), completedByName: name(s.completedBy) })),
      requirements: requirements.map((r) => ({ ...r, updatedByName: name(r.updatedBy) })),
      files: files.map((f) => ({ ...f, uploadedByName: name(f.uploadedBy) })),
      activity: activity.map((a) => ({ ...a, userName: name(a.userId) })),
      orders: orders.map((o) => ({ id: o.id, orderNo: o.orderNo, status: o.status, amount: o.amount, paidDate: o.paidDate, createdAt: o.createdAt })),
      assignees: manage ? await permitsService.assignableUsers(project) : [],
      me: me(ctx),
      perms: {
        canManage: manage,
        canDelete: PermitPermissions.canDelete(ctx.cu.user, projectRef(project), ctx.cu.orgId),
        canWork,
        canTransition: manage || tx.assigneeUserId === me(ctx),
      },
    });
  }));

  // Copies a service's steps and requirements onto a new transaction. Due dates follow the steps' durations.
  const instantiate = async (
    ctx: Ctx,
    project: Project,
    data: z.infer<typeof transactionCreateSchema>,
    template: { service: typeof permitServices.$inferSelect | null; authority: typeof permitAuthorities.$inferSelect | null; steps: { title: string; description: string | null; party: string; slaDays: number | null; isPaymentStep: boolean }[]; requirements: { kind: string; title: string; description: string | null; mandatory: boolean }[] },
  ) => {
    const { service, authority } = template;
    const title = data.title ?? service?.name ?? fail(400, "Title is required");
    const start = data.startDate ?? today();
    const fee = data.feeAmount ?? Number(service?.feeAmount ?? 0);
    const due = data.dueDate ?? (service?.slaDays ? addDays(start, service.slaDays) : null);
    const created = await insertNumbered(project.id, async (seq) => db.transaction(async (exec) => {
      const [row] = await exec.insert(permitTransactions).values({
        projectId: project.id,
        seq,
        transactionNo: txNo(seq),
        serviceId: service?.id ?? null,
        kind: data.kind ?? (service ? (service.isLicense ? "license" : "transaction") : "transaction"),
        title,
        category: data.category ?? service?.category ?? "other",
        authorityName: data.authorityName ?? authority?.name ?? null,
        portalUrl: data.portalUrl ?? service?.serviceUrl ?? authority?.portalUrl ?? null,
        assigneeUserId: data.assigneeUserId,
        referenceNo: data.referenceNo,
        startDate: start,
        dueDate: due,
        renewalLeadDays: service?.renewalLeadDays ?? null,
        feeAmount: String(fee),
        renewalOfId: data.renewalOfId,
        notes: data.notes,
        createdBy: me(ctx),
      }).returning();
      let cursor = start;
      const steps = template.steps.map((s, i) => {
        cursor = s.slaDays ? addDays(cursor, s.slaDays) : cursor;
        return {
          transactionId: row.id,
          projectId: project.id,
          seq: i + 1,
          title: s.title,
          description: s.description,
          party: s.party,
          isPaymentStep: s.isPaymentStep,
          // the developer's own steps go to whoever follows the transaction; the others are assigned by hand
          assigneeUserId: s.party === "developer" ? data.assigneeUserId : null,
          dueDate: s.slaDays ? cursor : null,
        };
      });
      // A fee with no payment step in the template still needs one
      if (fee > 0 && !steps.some((s) => s.isPaymentStep)) {
        steps.push({ transactionId: row.id, projectId: project.id, seq: steps.length + 1, title: translate("notifications", "permits.fee_step_title"), description: null, party: "developer", isPaymentStep: true, assigneeUserId: data.assigneeUserId, dueDate: null });
      }
      if (steps.length) await exec.insert(permitTransactionSteps).values(steps);
      if (template.requirements.length) {
        await exec.insert(permitTransactionRequirements).values(template.requirements.map((r, i) => ({
          transactionId: row.id,
          projectId: project.id,
          seq: i + 1,
          kind: r.kind,
          title: r.title,
          description: r.description,
          mandatory: r.mandatory,
        })));
      }
      await permitsService.log(exec, row, "created", me(ctx), { to: row.status, note: service?.name ?? null });
      return row;
    }));
    if (data.assigneeUserId) {
      permitsService.notify([data.assigneeUserId], me(ctx), created, translate("notifications", "permits.assigned_transaction"), `${created.transactionNo} · ${created.title} · ${project.name}`);
    }
    after(created, ctx);
    return created;
  };

  const loadServiceTemplate = async (ctx: Ctx, serviceId: string) => {
    const [service] = await db.select().from(permitServices).where(eq(permitServices.id, serviceId));
    if (!service || (service.organizationId && service.organizationId !== ctx.cu.orgId && ctx.cu.user.role !== "super_admin")) return fail(404, "Service not found");
    const [authority] = service.authorityId ? await db.select().from(permitAuthorities).where(eq(permitAuthorities.id, service.authorityId)) : [];
    const steps = await db.select().from(permitServiceSteps).where(eq(permitServiceSteps.serviceId, service.id)).orderBy(asc(permitServiceSteps.seq));
    const requirements = await db.select().from(permitServiceRequirements).where(eq(permitServiceRequirements.serviceId, service.id)).orderBy(asc(permitServiceRequirements.seq));
    return { service, authority: authority ?? null, steps, requirements };
  };

  app.post(`${base}/transactions`, route(async (req, res, ctx) => {
    const data = transactionCreateSchema.parse(req.body);
    const project = projectOf(ctx, data.projectId);
    requireManage(ctx, project.id);
    await requireAssignable(project, data.assigneeUserId);
    const template = data.serviceId
      ? await loadServiceTemplate(ctx, data.serviceId)
      : { service: null, authority: null, steps: [], requirements: [] };
    if (!data.serviceId && !data.title) return fail(400, "Choose a service or give the transaction a title");
    res.status(201).json(await instantiate(ctx, project, data, template));
  }));

  app.patch(`${base}/transactions/:id`, route(async (req, res, ctx) => {
    const { tx, project } = await loadTx(ctx, req.params.id);
    requireManage(ctx, tx.projectId);
    const data = transactionUpdateSchema.parse(req.body);
    if (data.assigneeUserId !== undefined) await requireAssignable(project, data.assigneeUserId);
    if (data.feeAmount !== undefined && Math.abs(data.feeAmount - Number(tx.feeAmount)) > 0.005) {
      if (tx.feePaid) return fail(409, "The fee is already paid");
      if ((await liveOrders(tx.id)).length) return fail(409, "A payment order is raised for this fee; cancel it before changing the amount");
    }
    const values: Partial<typeof permitTransactions.$inferInsert> = { ...data, updatedAt: new Date() } as any;
    if (data.feeAmount !== undefined) values.feeAmount = String(data.feeAmount);
    if (data.expiryDate !== undefined && data.expiryDate !== tx.expiryDate) {
      values.expiryNoticeLevel = null;
      // a new expiry in the future brings an expired licence back
      if (tx.status === "expired" && data.expiryDate && data.expiryDate >= today()) values.status = "completed";
    }
    if (data.renewalLeadDays !== undefined) values.expiryNoticeLevel = null;
    await db.update(permitTransactions).set(values).where(eq(permitTransactions.id, tx.id));
    await permitsService.log(db, tx, "edited", me(ctx), values.status ? { from: tx.status, to: values.status } : {});
    if (data.assigneeUserId && data.assigneeUserId !== tx.assigneeUserId) {
      await permitsService.log(db, tx, "assigned", me(ctx), { note: (await userNames([data.assigneeUserId])).get(data.assigneeUserId) ?? null });
      permitsService.notify([data.assigneeUserId], me(ctx), tx, translate("notifications", "permits.assigned_transaction"), `${tx.transactionNo} · ${data.title ?? tx.title} · ${project.name}`);
    }
    after(tx, ctx);
    res.json({ ok: true });
  }));

  app.post(`${base}/transactions/:id/transition`, route(async (req, res, ctx) => {
    const { tx } = await loadTx(ctx, req.params.id);
    if (!isDev(ctx, tx.projectId) && tx.assigneeUserId !== me(ctx)) return fail(403, "Only the developer or the person following this transaction can change its status");
    const input = transitionSchema.parse(req.body);
    const rule = PERMIT_TRANSITIONS[input.action as keyof typeof PERMIT_TRANSITIONS];
    if (!(rule.from as readonly string[]).includes(tx.status)) return fail(409, `This transaction is "${PERMIT_STATUS_LABELS[tx.status as PermitStatus] ?? tx.status}"`);
    const now = new Date();
    const patch: Partial<typeof permitTransactions.$inferInsert> = { status: rule.to, updatedAt: now };
    if (input.referenceNo) patch.referenceNo = input.referenceNo;
    if (input.action === "submit") patch.submittedAt = now;
    if (input.action === "complete") {
      if (input.licenseNo) patch.licenseNo = input.licenseNo;
      patch.issueDate = input.issueDate ?? tx.issueDate ?? today();
      const expiry = input.expiryDate ?? tx.expiryDate;
      if (tx.kind === "license" && !expiry) return fail(400, "A licence needs its expiry date");
      patch.expiryDate = expiry;
      patch.expiryNoticeLevel = null;
      if (expiry && expiry < today()) patch.status = "expired";
    }
    await db.update(permitTransactions).set(patch).where(eq(permitTransactions.id, tx.id));
    await permitsService.log(db, tx, "status_changed", me(ctx), { from: tx.status, to: patch.status, note: input.note });
    if (input.action === "complete" && tx.renewalOfId) {
      // the renewed licence is superseded by this one
      const [old] = await db.select().from(permitTransactions).where(eq(permitTransactions.id, tx.renewalOfId));
      if (old && old.status === "completed") {
        await db.update(permitTransactions).set({ status: "expired", expiryNoticeLevel: -1, updatedAt: now }).where(eq(permitTransactions.id, old.id));
        await permitsService.log(db, old, "status_changed", me(ctx), { from: "completed", to: "expired", note: `Renewed by transaction ${tx.transactionNo}` });
      }
    }
    permitsService.notify([tx.assigneeUserId, tx.createdBy], me(ctx), tx, `${enumLabel("permit_action", input.action)}: ${tx.transactionNo}`, `${tx.title} · ${PERMIT_STATUS_LABELS[patch.status as PermitStatus]}`, "info");
    const missing = await db.select({ id: permitTransactionRequirements.id }).from(permitTransactionRequirements)
      .where(and(eq(permitTransactionRequirements.transactionId, tx.id), eq(permitTransactionRequirements.mandatory, true), eq(permitTransactionRequirements.status, "missing")));
    after(tx, ctx);
    res.json({ ok: true, status: patch.status, missingRequirements: missing.length });
  }));

  app.post(`${base}/transactions/:id/renew`, route(async (req, res, ctx) => {
    const { tx, project } = await loadTx(ctx, req.params.id);
    requireManage(ctx, tx.projectId);
    if (tx.kind !== "license") return fail(409, "Only a licence can be renewed");
    const open = await db.select({ no: permitTransactions.transactionNo }).from(permitTransactions)
      .where(and(eq(permitTransactions.renewalOfId, tx.id), inArray(permitTransactions.status, ["not_started", "in_progress", "submitted", "returned"])));
    if (open.length) return fail(409, `A renewal is already open: ${open[0].no}`);
    let template;
    if (tx.serviceId) {
      template = await loadServiceTemplate(ctx, tx.serviceId);
    } else {
      // no service behind it: repeat its own steps and requirements
      const steps = await db.select().from(permitTransactionSteps).where(eq(permitTransactionSteps.transactionId, tx.id)).orderBy(asc(permitTransactionSteps.seq));
      const requirements = await db.select().from(permitTransactionRequirements).where(eq(permitTransactionRequirements.transactionId, tx.id)).orderBy(asc(permitTransactionRequirements.seq));
      template = { service: null, authority: null, steps: steps.map((s) => ({ ...s, slaDays: null })), requirements };
    }
    const created = await instantiate(ctx, project, {
      projectId: project.id,
      serviceId: tx.serviceId,
      title: translate("notifications", "permits.renewal_prefix", { title: tx.title }),
      kind: "license",
      category: tx.category,
      authorityName: tx.authorityName,
      portalUrl: tx.portalUrl,
      assigneeUserId: tx.assigneeUserId,
      startDate: null,
      dueDate: tx.expiryDate && tx.expiryDate > today() ? tx.expiryDate : null,
      feeAmount: Number(tx.feeAmount),
      referenceNo: null,
      notes: null,
      renewalOfId: tx.id,
    }, template);
    await permitsService.log(db, tx, "renewed", me(ctx), { note: created.transactionNo });
    res.status(201).json(created);
  }));

  app.delete(`${base}/transactions/:id`, route(async (req, res, ctx) => {
    const { tx, project } = await loadTx(ctx, req.params.id);
    if (!PermitPermissions.canDelete(ctx.cu.user, projectRef(project), ctx.cu.orgId)) return fail(403, "Only the developer's administrators can delete a transaction");
    if ((await liveOrders(tx.id)).length) return fail(409, "A payment order exists for this transaction's fee");
    const stepIds = (await db.select({ id: permitTransactionSteps.id }).from(permitTransactionSteps).where(eq(permitTransactionSteps.transactionId, tx.id))).map((s) => s.id);
    await db.transaction(async (exec) => {
      if (stepIds.length) await exec.delete(tasks).where(and(eq(tasks.sourceType, "permit_step"), inArray(tasks.sourceId, stepIds)));
      await exec.update(permitTransactions).set({ renewalOfId: null }).where(eq(permitTransactions.renewalOfId, tx.id));
      await exec.delete(permitTransactions).where(eq(permitTransactions.id, tx.id));
    });
    permitsService.broadcast(tx.projectId, me(ctx));
    res.status(204).send();
  }));

  // ======================================================================= steps
  app.post(`${base}/transactions/:id/steps`, route(async (req, res, ctx) => {
    const { tx, project } = await loadTx(ctx, req.params.id);
    requireManage(ctx, tx.projectId);
    const data = stepCreateSchema.parse(req.body);
    await requireAssignable(project, data.assigneeUserId);
    const [{ next }] = await db.select({ next: sql<number>`COALESCE(MAX(${permitTransactionSteps.seq}), 0) + 1` }).from(permitTransactionSteps).where(eq(permitTransactionSteps.transactionId, tx.id));
    const [row] = await db.insert(permitTransactionSteps).values({ ...data, transactionId: tx.id, projectId: tx.projectId, seq: Number(next) }).returning();
    await permitsService.log(db, tx, "step_added", me(ctx), { note: data.title });
    if (data.assigneeUserId) permitsService.notify([data.assigneeUserId], me(ctx), tx, translate("notifications", "permits.assigned_step"), `${tx.transactionNo} · ${data.title} · ${project.name}`);
    after(tx, ctx);
    res.status(201).json(row);
  }));

  app.patch(`${base}/steps/:stepId`, route(async (req, res, ctx) => {
    const { step, tx, project } = await loadStep(ctx, req.params.stepId);
    requireManage(ctx, tx.projectId);
    const data = stepUpdateSchema.parse(req.body);
    if (data.assigneeUserId !== undefined) await requireAssignable(project, data.assigneeUserId);
    const values: Partial<typeof permitTransactionSteps.$inferInsert> = { ...data };
    if (data.dueDate !== undefined && data.dueDate !== step.dueDate) values.overdueNotifiedAt = null;
    if (data.seq !== undefined && data.seq !== step.seq) {
      // move: the step that held that place takes this one's
      await db.update(permitTransactionSteps).set({ seq: step.seq }).where(and(eq(permitTransactionSteps.transactionId, tx.id), eq(permitTransactionSteps.seq, data.seq)));
    }
    await db.update(permitTransactionSteps).set(values).where(eq(permitTransactionSteps.id, step.id));
    if (data.assigneeUserId && data.assigneeUserId !== step.assigneeUserId) {
      await permitsService.log(db, tx, "assigned", me(ctx), { note: `${step.title} → ${(await userNames([data.assigneeUserId])).get(data.assigneeUserId) ?? ""}` });
      permitsService.notify([data.assigneeUserId], me(ctx), tx, translate("notifications", "permits.assigned_step"), `${tx.transactionNo} · ${data.title ?? step.title} · ${project.name}`);
    }
    after(tx, ctx);
    res.json({ ok: true });
  }));

  // Where a step lives (Activity links to steps)
  app.get(`${base}/steps/:stepId`, route(async (req, res, ctx) => {
    const { step } = await loadStep(ctx, req.params.stepId);
    res.json({ transactionId: step.transactionId });
  }));

  app.post(`${base}/steps/:stepId/status`, route(async (req, res, ctx) => {
    const { step, tx, canWork } = await loadStep(ctx, req.params.stepId);
    const manage = isDev(ctx, tx.projectId);
    if (!manage && !(canWork && (step.assigneeUserId === me(ctx) || tx.assigneeUserId === me(ctx)))) return fail(403, "This step is not assigned to you");
    const input = stepStatusSchema.parse(req.body);
    if (input.status === "skipped" && !manage) return fail(403, "Only the developer can skip a step");
    if (step.isPaymentStep && input.status === "done" && Number(tx.feeAmount) > 0 && !tx.feePaid) {
      return fail(409, "The fee step completes when its payment order is paid in Payments");
    }
    if (!(["not_started", "in_progress", "submitted", "returned"] as string[]).includes(tx.status) && input.status !== step.status) {
      return fail(409, "This transaction is closed; reopen it first");
    }
    const done = input.status === "done";
    await db.update(permitTransactionSteps).set({
      status: input.status,
      completedBy: done ? me(ctx) : null,
      completedAt: done ? new Date() : null,
      note: input.note ?? step.note,
    }).where(eq(permitTransactionSteps.id, step.id));
    await permitsService.log(db, tx, done ? "step_completed" : input.status === "skipped" ? "step_skipped" : "step_reopened", me(ctx), { note: `${step.title}${input.note ? ` — ${input.note}` : ""}` });
    if (tx.status === "not_started" && input.status !== "pending") {
      await db.update(permitTransactions).set({ status: "in_progress", updatedAt: new Date() }).where(eq(permitTransactions.id, tx.id));
      await permitsService.log(db, tx, "status_changed", me(ctx), { from: "not_started", to: "in_progress" });
    }
    if (done) {
      // tell whoever follows the transaction, and the next step's assignee that it is their turn
      const next = (await db.select().from(permitTransactionSteps).where(eq(permitTransactionSteps.transactionId, tx.id)).orderBy(asc(permitTransactionSteps.seq)))
        .find((s) => s.seq > step.seq && s.status === "pending");
      permitsService.notify([tx.assigneeUserId, tx.createdBy], me(ctx), tx, translate("notifications", "permits.step_completed"), `${tx.transactionNo} · ${step.title}`, "success");
      if (next?.assigneeUserId) permitsService.notify([next.assigneeUserId], me(ctx), tx, translate("notifications", "permits.step_turn"), `${tx.transactionNo} · ${next.title}`);
    }
    after(tx, ctx);
    res.json({ ok: true });
  }));

  app.delete(`${base}/steps/:stepId`, route(async (req, res, ctx) => {
    const { step, tx } = await loadStep(ctx, req.params.stepId);
    requireManage(ctx, tx.projectId);
    if (step.isPaymentStep && ((await liveOrders(tx.id)).length || tx.feePaid)) return fail(409, "The fee step has a payment order");
    await db.delete(tasks).where(and(eq(tasks.sourceType, "permit_step"), eq(tasks.sourceId, step.id)));
    await db.delete(permitTransactionSteps).where(eq(permitTransactionSteps.id, step.id));
    await permitsService.log(db, tx, "step_removed", me(ctx), { note: step.title });
    after(tx, ctx);
    res.status(204).send();
  }));

  // ======================================================================= requirements
  app.post(`${base}/transactions/:id/requirements`, route(async (req, res, ctx) => {
    const { tx } = await loadTx(ctx, req.params.id);
    requireManage(ctx, tx.projectId);
    const data = requirementCreateSchema.parse(req.body);
    const [{ next }] = await db.select({ next: sql<number>`COALESCE(MAX(${permitTransactionRequirements.seq}), 0) + 1` }).from(permitTransactionRequirements).where(eq(permitTransactionRequirements.transactionId, tx.id));
    const [row] = await db.insert(permitTransactionRequirements).values({ ...data, transactionId: tx.id, projectId: tx.projectId, seq: Number(next), updatedBy: me(ctx) }).returning();
    await permitsService.log(db, tx, "requirement_added", me(ctx), { note: data.title });
    after(tx, ctx);
    res.status(201).json(row);
  }));

  app.patch(`${base}/requirements/:reqId`, route(async (req, res, ctx) => {
    const { requirement, tx, canWork } = await loadRequirement(ctx, req.params.reqId);
    const data = requirementUpdateSchema.parse(req.body);
    const editsDefinition = data.kind !== undefined || data.title !== undefined || data.description !== undefined || data.mandatory !== undefined;
    if (editsDefinition) requireManage(ctx, tx.projectId);
    if (!canWork) return fail(403, "This transaction is not assigned to you");
    if (data.status === "not_applicable" && !isDev(ctx, tx.projectId)) return fail(403, "Only the developer can mark a requirement as not applicable");
    await db.update(permitTransactionRequirements).set({ ...data, updatedBy: me(ctx), updatedAt: new Date() }).where(eq(permitTransactionRequirements.id, requirement.id));
    if (data.status && data.status !== requirement.status) {
      await permitsService.log(db, tx, "requirement_status", me(ctx), { from: requirement.status, to: data.status, note: requirement.title });
    }
    after(tx, ctx);
    res.json({ ok: true });
  }));

  app.delete(`${base}/requirements/:reqId`, route(async (req, res, ctx) => {
    const { requirement, tx } = await loadRequirement(ctx, req.params.reqId);
    requireManage(ctx, tx.projectId);
    await db.delete(permitTransactionRequirements).where(eq(permitTransactionRequirements.id, requirement.id));
    await db.update(permitAttachments).set({ requirementId: null }).where(eq(permitAttachments.requirementId, requirement.id));
    await permitsService.log(db, tx, "requirement_removed", me(ctx), { note: requirement.title });
    after(tx, ctx);
    res.status(204).send();
  }));

  // ======================================================================= files
  app.post(`${base}/attachments`, route(async (req, res, ctx) => {
    const data = attachmentSchema.parse(req.body);
    const { tx, canWork } = await loadTx(ctx, data.transactionId);
    if (!canWork) return fail(403, "This transaction is not assigned to you");
    // Files must be ones uploaded for this project through the permits folder, not an arbitrary URL
    if (!data.objectPath.startsWith(`/projects/${tx.projectId}/permits/`) || data.objectPath.includes("..")) return fail(400, "Invalid file location");
    if (data.requirementId) {
      const [r] = await db.select().from(permitTransactionRequirements).where(and(eq(permitTransactionRequirements.id, data.requirementId), eq(permitTransactionRequirements.transactionId, tx.id)));
      if (!r) return fail(400, "Requirement not found in this transaction");
      if (r.status === "missing") {
        await db.update(permitTransactionRequirements).set({ status: "provided", updatedBy: me(ctx), updatedAt: new Date() }).where(eq(permitTransactionRequirements.id, r.id));
      }
    }
    const [row] = await db.insert(permitAttachments).values({
      projectId: tx.projectId,
      transactionId: tx.id,
      requirementId: data.requirementId,
      stepId: data.stepId,
      fileName: data.fileName,
      objectPath: data.objectPath,
      contentType: data.contentType ?? null,
      size: data.size ?? null,
      uploadedBy: me(ctx),
    }).returning();
    await permitsService.log(db, tx, "file_added", me(ctx), { note: data.fileName });
    after(tx, ctx);
    res.status(201).json(row);
  }));

  app.delete(`${base}/attachments/:id`, route(async (req, res, ctx) => {
    const [file] = await db.select().from(permitAttachments).where(eq(permitAttachments.id, req.params.id));
    if (!file) return fail(404, "File not found");
    const { tx } = await loadTx(ctx, file.transactionId);
    if (file.uploadedBy !== me(ctx) && !isDev(ctx, tx.projectId)) return fail(403, "You can only remove files you uploaded");
    await db.delete(permitAttachments).where(eq(permitAttachments.id, file.id));
    if (file.requirementId) {
      // the requirement is missing again once its last file is gone
      const left = await db.select({ id: permitAttachments.id }).from(permitAttachments).where(eq(permitAttachments.requirementId, file.requirementId));
      if (left.length === 0) {
        await db.update(permitTransactionRequirements).set({ status: "missing", updatedBy: me(ctx), updatedAt: new Date() })
          .where(and(eq(permitTransactionRequirements.id, file.requirementId), eq(permitTransactionRequirements.status, "provided")));
      }
    }
    await permitsService.log(db, tx, "file_removed", me(ctx), { note: file.fileName });
    after(tx, ctx);
    res.status(204).send();
  }));

  // ======================================================================= catalogue
  const visibleServicesWhere = (ctx: Ctx) =>
    ctx.cu.orgId ? or(isNull(permitServices.organizationId), eq(permitServices.organizationId, ctx.cu.orgId)) : isNull(permitServices.organizationId);

  app.get(`${base}/services`, route(async (_req, res, ctx) => {
    const services = await db.select().from(permitServices).where(visibleServicesWhere(ctx)).orderBy(asc(permitServices.name));
    const ids = services.map((s) => s.id);
    const [steps, requirements, authorities] = await Promise.all([
      ids.length ? db.select().from(permitServiceSteps).where(inArray(permitServiceSteps.serviceId, ids)).orderBy(asc(permitServiceSteps.seq)) : [],
      ids.length ? db.select().from(permitServiceRequirements).where(inArray(permitServiceRequirements.serviceId, ids)).orderBy(asc(permitServiceRequirements.seq)) : [],
      db.select().from(permitAuthorities).where(ctx.cu.orgId ? or(isNull(permitAuthorities.organizationId), eq(permitAuthorities.organizationId, ctx.cu.orgId)) : isNull(permitAuthorities.organizationId)).orderBy(asc(permitAuthorities.name)),
    ]);
    const authority = new Map(authorities.map((a) => [a.id, a]));
    res.json({
      authorities,
      services: services.map((s) => ({
        ...s,
        authorityName: s.authorityId ? authority.get(s.authorityId)?.name ?? null : null,
        authorityPortalUrl: s.authorityId ? authority.get(s.authorityId)?.portalUrl ?? null : null,
        isSystem: !s.organizationId,
        canEdit: s.organizationId ? PermitPermissions.canManageOrgCatalog(ctx.cu.user) && (s.organizationId === ctx.cu.orgId || ctx.cu.user.role === "super_admin") : PermitPermissions.canManageSystemCatalog(ctx.cu.user),
        steps: steps.filter((x) => x.serviceId === s.id),
        requirements: requirements.filter((x) => x.serviceId === s.id),
      })),
    });
  }));

  const requireCatalogScope = (ctx: Ctx, scope: "system" | "org") => {
    if (scope === "system") {
      if (!PermitPermissions.canManageSystemCatalog(ctx.cu.user)) fail(403, "Only a platform administrator edits the built-in catalogue");
      return null;
    }
    if (!PermitPermissions.canManageOrgCatalog(ctx.cu.user)) fail(403, "Only a developer organization's administrators add services");
    return ctx.cu.orgId ?? fail(400, "Your account is not linked to an organization");
  };

  const saveService = async (ctx: Ctx, data: z.infer<typeof serviceSchema>, orgId: string | null, existingId?: string) => {
    return db.transaction(async (exec) => {
      let authorityId = data.authorityId;
      if (!authorityId && data.authorityName) {
        const [a] = await exec.insert(permitAuthorities).values({ organizationId: orgId, name: data.authorityName, portalUrl: data.authorityPortalUrl }).returning();
        authorityId = a.id;
      }
      const values = {
        organizationId: orgId,
        authorityId,
        name: data.name,
        category: data.category,
        description: data.description,
        serviceUrl: data.serviceUrl,
        channels: data.channels,
        isLicense: data.isLicense,
        validityMonths: data.validityMonths,
        renewalLeadDays: data.renewalLeadDays,
        feeAmount: String(data.feeAmount),
        feeNote: data.feeNote,
        slaDays: data.slaDays,
        active: data.active,
        updatedAt: new Date(),
      };
      let id = existingId;
      if (id) {
        await exec.update(permitServices).set(values).where(eq(permitServices.id, id));
        await exec.delete(permitServiceSteps).where(eq(permitServiceSteps.serviceId, id));
        await exec.delete(permitServiceRequirements).where(eq(permitServiceRequirements.serviceId, id));
      } else {
        const [row] = await exec.insert(permitServices).values({ ...values, createdBy: me(ctx) }).returning();
        id = row.id;
      }
      if (data.steps.length) await exec.insert(permitServiceSteps).values(data.steps.map((s, i) => ({ ...s, serviceId: id!, seq: i + 1 })));
      if (data.requirements.length) await exec.insert(permitServiceRequirements).values(data.requirements.map((r, i) => ({ ...r, serviceId: id!, seq: i + 1 })));
      return id!;
    });
  };

  const loadEditableService = async (ctx: Ctx, id: string) => {
    const [service] = await db.select().from(permitServices).where(eq(permitServices.id, id));
    if (!service) return fail(404, "Service not found");
    if (service.organizationId) {
      requireCatalogScope(ctx, "org");
      if (service.organizationId !== ctx.cu.orgId && ctx.cu.user.role !== "super_admin") return fail(404, "Service not found");
    } else {
      requireCatalogScope(ctx, "system");
    }
    return service;
  };

  app.post(`${base}/services`, route(async (req, res, ctx) => {
    const data = serviceSchema.parse(req.body);
    const orgId = requireCatalogScope(ctx, data.scope);
    const id = await saveService(ctx, data, orgId);
    res.status(201).json({ id });
  }));

  app.patch(`${base}/services/:id`, route(async (req, res, ctx) => {
    const service = await loadEditableService(ctx, req.params.id);
    const data = serviceSchema.parse(req.body);
    await saveService(ctx, data, service.organizationId, service.id);
    res.json({ id: service.id });
  }));

  app.delete(`${base}/services/:id`, route(async (req, res, ctx) => {
    const service = await loadEditableService(ctx, req.params.id);
    // transactions keep their copy of the steps; they just lose the link to the template
    await db.delete(permitServices).where(eq(permitServices.id, service.id));
    res.status(204).send();
  }));

  // Copy a service (usually a built-in one) into the organization's own catalogue to adapt it
  app.post(`${base}/services/:id/duplicate`, route(async (req, res, ctx) => {
    const orgId = requireCatalogScope(ctx, "org");
    const template = await loadServiceTemplate(ctx, req.params.id);
    const s = template.service;
    const id = await saveService(ctx, {
      scope: "org",
      name: `${s.name}${translate("notifications", "permits.copy_suffix")}`,
      authorityId: s.authorityId,
      authorityName: null,
      authorityPortalUrl: null,
      category: s.category,
      description: s.description,
      serviceUrl: s.serviceUrl,
      channels: s.channels,
      isLicense: s.isLicense,
      validityMonths: s.validityMonths,
      renewalLeadDays: s.renewalLeadDays,
      feeAmount: Number(s.feeAmount),
      feeNote: s.feeNote,
      slaDays: s.slaDays,
      active: true,
      steps: template.steps.map((x) => ({ title: x.title, description: x.description, party: x.party, slaDays: x.slaDays, isPaymentStep: x.isPaymentStep })),
      requirements: template.requirements.map((x) => ({ kind: x.kind, title: x.title, description: x.description, mandatory: x.mandatory })),
    }, orgId);
    res.status(201).json({ id });
  }));

  app.post(`${base}/authorities`, route(async (req, res, ctx) => {
    const data = authoritySchema.parse(req.body);
    const orgId = requireCatalogScope(ctx, data.scope);
    const [row] = await db.insert(permitAuthorities).values({ organizationId: orgId, name: data.name, nameEn: data.nameEn, portalUrl: data.portalUrl }).returning();
    res.status(201).json(row);
  }));
}

export type { PermitTransaction };
