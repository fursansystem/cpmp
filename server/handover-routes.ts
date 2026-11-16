// تسليم الوحدات (Unit Handover) — HTTP routes.
//
// Accessible only to `super_admin` and Developer organization members holding the
// "Customer Service" ("خدمة العملاء") position (or `developer_admin`).
// Reuses existing `work_locations` (units) and `snag_lists` / `snag_items` tables.
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  clients,
  handoverActivity,
  handoverAttachments,
  organizations,
  projects,
  snagItemHistory,
  snagItems,
  snagLists,
  teamMembers,
  unitHandovers,
  users,
  userTeamMembers,
  workLocations,
  type Project,
} from "@shared/schema";
import { HandoverPermissions, type PermissionUser } from "@shared/permissions";
import {
  checkHandoverCompletionGate,
  HANDOVER_ATTACHMENT_CATEGORIES,
  HANDOVER_STATUSES,
  METER_TRANSFER_STATUSES,
} from "@shared/handover";

type CurrentUser = { user: PermissionUser; orgId: string | null; teamMemberIds: string[] };

interface Deps {
  getCurrentUserWithOrg: (req: Request) => Promise<CurrentUser | null>;
  handleError: (res: Response, error: unknown) => any;
}

class HandoverError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const fail = (status: number, message: string): never => {
  throw new HandoverError(status, message);
};

const optText = (max = 2000) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").nullish().transform((v) => v || null);
const optId = z.string().nullish().transform((v) => v || null);
const todayIso = () => new Date().toISOString().slice(0, 10);

const clientSchema = z.object({
  organizationId: optId,
  fullName: z.string().trim().min(1, "اسم العميل مطلوب").max(200),
  fullNameEn: optText(200),
  nationalId: z.string().trim().min(5, "رقم الهوية / الإقامة مطلوب").max(30),
  phone: z.string().trim().min(6, "رقم الجوال مطلوب").max(30),
  email: optText(200),
  secAccountNumber: optText(100),
  notes: optText(),
});

const createHandoverSchema = z.object({
  projectId: z.string().min(1),
  workLocationId: z.string().min(1),
  clientId: z.string().min(1),
  deedNumber: optText(100),
  contractNumber: optText(100),
  inspectionDate: optDate,
  meterNumber: optText(100),
  electricityAccountNo: optText(100),
  notes: optText(),
});

const updateHandoverSchema = z.object({
  clientId: z.string().min(1).optional(),
  status: z.enum(HANDOVER_STATUSES).optional(),
  deedNumber: optText(100),
  contractNumber: optText(100),
  inspectionDate: optDate,
  handoverDate: optDate,
  notes: optText(),
});

const meterTransferSchema = z.object({
  meterNumber: optText(100),
  electricityAccountNo: optText(100),
  meterReadingAtHandover: optText(100),
  meterTransferStatus: z.enum(METER_TRANSFER_STATUSES),
  secRequestNo: optText(100),
  previousBillsCleared: z.boolean().optional(),
  meterTransferDate: optDate,
  meterTransferNotes: optText(),
});

const createHandoverSnagSchema = z.object({
  title: z.string().trim().min(1, "عنوان الملاحظة مطلوب").max(300),
  description: optText(),
  category: z.string().trim().max(100).optional().default("architectural"),
  priority: z.enum(["low", "medium", "high", "critical"]).optional().default("medium"),
  locationRoom: optText(150),
  discipline: optText(150),
  elementName: optText(150),
  locationDetails: optText(300),
  assignedTo: optId,
  dueDate: optDate,
  beforeImages: z.array(z.string()).optional().default([]),
});

const attachmentSchema = z.object({
  category: z.enum(HANDOVER_ATTACHMENT_CATEGORIES).default("other"),
  fileName: z.string().trim().min(1).max(300),
  objectPath: z.string().trim().min(1).max(1000),
  contentType: optText(200),
  size: z.number().int().nonnegative().nullish(),
});

const projectRef = (p: Project) => ({
  id: p.id,
  creatorId: p.creatorId,
  organizationId: p.organizationId,
  contractorId: p.contractorId,
  consultantId: p.consultantId,
});

async function getUserPositions(userId: string, teamMemberIds: string[]): Promise<string[]> {
  if (!teamMemberIds.length) {
    const links = await db
      .select({ position: teamMembers.position })
      .from(userTeamMembers)
      .innerJoin(teamMembers, eq(userTeamMembers.teamMemberId, teamMembers.id))
      .where(eq(userTeamMembers.userId, userId));
    return links.map((l) => l.position).filter((p): p is string => !!p);
  }
  const rows = await db
    .select({ position: teamMembers.position })
    .from(teamMembers)
    .where(inArray(teamMembers.id, teamMemberIds));
  return rows.map((r) => r.position).filter((p): p is string => !!p);
}

function formatUnitLabel(u: typeof workLocations.$inferSelect): string {
  const parts = [
    u.unitCustomNumber ? `وحدة ${u.unitCustomNumber}` : null,
    u.buildingNo ? `مبنى ${u.buildingNo}` : null,
    u.flatNo ? `شقة ${u.flatNo}` : null,
    u.unitZone ? `منطقة ${u.unitZone}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" — ") : u.unitDescription || u.id;
}

export function registerHandoverRoutes(app: Express, { getCurrentUserWithOrg, handleError }: Deps) {
  const base = "/api/handover";

  type Ctx = CurrentUser & { positions: string[] };

  const route =
    (handler: (req: Request, res: Response, ctx: Ctx) => Promise<any>) =>
    async (req: Request, res: Response) => {
      try {
        const cur = await getCurrentUserWithOrg(req);
        if (!cur) return res.status(401).json({ error: "Authentication required" });
        const positions = await getUserPositions(cur.user.id, cur.teamMemberIds);
        if (!HandoverPermissions.canAccessSection(cur.user, positions)) {
          return res.status(403).json({ error: "Access restricted to Customer Service (Developer) and Super Admin" });
        }
        await handler(req, res, { ...cur, positions });
      } catch (err) {
        if (err instanceof HandoverError) {
          return res.status(err.status).json({ error: err.message });
        }
        return handleError(res, err);
      }
    };

  async function loadProjectForHandover(ctx: Ctx, projectId: string): Promise<Project> {
    const project = await storage.getProject(projectId);
    if (!project) return fail(404, "Project not found");
    if (!HandoverPermissions.canManageProject(ctx.user, projectRef(project), ctx.orgId, ctx.positions)) {
      return fail(403, "You do not have permission to manage unit handovers for this project");
    }
    return project;
  }

  async function loadHandover(ctx: Ctx, id: string) {
    const [handover] = await db.select().from(unitHandovers).where(eq(unitHandovers.id, id));
    if (!handover) return fail(404, "Handover record not found");
    const project = await loadProjectForHandover(ctx, handover.projectId);
    return { handover, project };
  }

  async function logActivity(
    projectId: string,
    handoverId: string,
    action: string,
    userId: string,
    opts?: { fromStatus?: string | null; toStatus?: string | null; note?: string | null },
  ) {
    await db.insert(handoverActivity).values({
      projectId,
      handoverId,
      action,
      fromStatus: opts?.fromStatus ?? null,
      toStatus: opts?.toStatus ?? null,
      note: opts?.note ?? null,
      userId,
    });
  }

  // Context: accessible projects for unit handover
  app.get(
    `${base}/context`,
    route(async (_req, res, ctx) => {
      const allProjects =
        ctx.user.role === "super_admin"
          ? await storage.getAllProjects()
          : ctx.orgId
            ? await db.select().from(projects).where(eq(projects.organizationId, ctx.orgId))
            : [];

      const accessibleProjects = allProjects
        .filter((p) => HandoverPermissions.canManageProject(ctx.user, projectRef(p), ctx.orgId, ctx.positions))
        .map((p) => ({
          id: p.id,
          name: p.name,
          location: p.location,
          organizationId: p.organizationId,
        }));

      res.json({
        projects: accessibleProjects,
        organizationId: ctx.orgId,
        isSuperAdmin: ctx.user.role === "super_admin",
      });
    }),
  );

  // ==================== CLIENTS ====================
  app.get(
    `${base}/clients`,
    route(async (req, res, ctx) => {
      const orgFilter =
        ctx.user.role === "super_admin"
          ? (req.query.organizationId as string | undefined) || null
          : ctx.orgId;

      if (!orgFilter && ctx.user.role !== "super_admin") {
        return res.json([]);
      }

      const rows = orgFilter
        ? await db.select().from(clients).where(eq(clients.organizationId, orgFilter)).orderBy(desc(clients.createdAt))
        : await db.select().from(clients).orderBy(desc(clients.createdAt));

      const clientIds = rows.map((r) => r.id);
      const counts = clientIds.length
        ? await db
            .select({
              clientId: unitHandovers.clientId,
              count: sql<number>`cast(count(${unitHandovers.id}) as integer)`,
            })
            .from(unitHandovers)
            .where(inArray(unitHandovers.clientId, clientIds))
            .groupBy(unitHandovers.clientId)
        : [];
      const countMap = new Map(counts.map((c) => [c.clientId, c.count]));

      res.json(rows.map((c) => ({ ...c, handoverCount: countMap.get(c.id) ?? 0 })));
    }),
  );

  app.post(
    `${base}/clients`,
    route(async (req, res, ctx) => {
      const data = clientSchema.parse(req.body);
      const orgId = ctx.user.role === "super_admin" ? (data.organizationId || ctx.orgId) : ctx.orgId;
      if (!orgId) return fail(400, "Organization is required for client");

      const [created] = await db
        .insert(clients)
        .values({
          organizationId: orgId,
          fullName: data.fullName,
          fullNameEn: data.fullNameEn,
          nationalId: data.nationalId,
          phone: data.phone,
          email: data.email,
          secAccountNumber: data.secAccountNumber,
          notes: data.notes,
          createdBy: ctx.user.id,
        })
        .returning();

      res.status(201).json(created);
    }),
  );

  app.patch(
    `${base}/clients/:id`,
    route(async (req, res, ctx) => {
      const [existing] = await db.select().from(clients).where(eq(clients.id, req.params.id));
      if (!existing) return fail(404, "Client not found");
      if (ctx.user.role !== "super_admin" && existing.organizationId !== ctx.orgId) {
        return fail(403, "Access denied to this client");
      }

      const data = clientSchema.partial().parse(req.body);
      const [updated] = await db
        .update(clients)
        .set({
          ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
          ...(data.fullNameEn !== undefined ? { fullNameEn: data.fullNameEn } : {}),
          ...(data.nationalId !== undefined ? { nationalId: data.nationalId } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.secAccountNumber !== undefined ? { secAccountNumber: data.secAccountNumber } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          updatedAt: new Date(),
        })
        .where(eq(clients.id, existing.id))
        .returning();

      res.json(updated);
    }),
  );

  app.delete(
    `${base}/clients/:id`,
    route(async (req, res, ctx) => {
      const [existing] = await db.select().from(clients).where(eq(clients.id, req.params.id));
      if (!existing) return fail(404, "Client not found");
      if (ctx.user.role !== "super_admin" && existing.organizationId !== ctx.orgId) {
        return fail(403, "Access denied to this client");
      }

      const linked = await db
        .select({ id: unitHandovers.id })
        .from(unitHandovers)
        .where(eq(unitHandovers.clientId, existing.id))
        .limit(1);
      if (linked.length > 0) {
        return fail(400, "لا يمكن حذف عميل مرتبط بملفات تسليم وحدات قائمة");
      }

      await db.delete(clients).where(eq(clients.id, existing.id));
      res.json({ success: true });
    }),
  );

  // ==================== UNIT HANDOVERS ====================
  app.get(
    `${base}/units`,
    route(async (req, res, ctx) => {
      const projectIdParam = (req.query.projectId as string | undefined) || null;

      let allowedProjectIds: string[] = [];
      if (projectIdParam && projectIdParam !== "all") {
        await loadProjectForHandover(ctx, projectIdParam);
        allowedProjectIds = [projectIdParam];
      } else {
        const allProjects =
          ctx.user.role === "super_admin"
            ? await storage.getAllProjects()
            : ctx.orgId
              ? await db.select().from(projects).where(eq(projects.organizationId, ctx.orgId))
              : [];
        allowedProjectIds = allProjects
          .filter((p) => HandoverPermissions.canManageProject(ctx.user, projectRef(p), ctx.orgId, ctx.positions))
          .map((p) => p.id);
      }

      if (!allowedProjectIds.length) return res.json([]);

      const rows = await db
        .select({
          handover: unitHandovers,
          projectName: projects.name,
          unit: workLocations,
          client: clients,
        })
        .from(unitHandovers)
        .innerJoin(projects, eq(unitHandovers.projectId, projects.id))
        .innerJoin(workLocations, eq(unitHandovers.workLocationId, workLocations.id))
        .innerJoin(clients, eq(unitHandovers.clientId, clients.id))
        .where(inArray(unitHandovers.projectId, allowedProjectIds))
        .orderBy(desc(unitHandovers.createdAt));

      const snagListIds = rows
        .map((r) => r.handover.snagListId)
        .filter((id): id is string => !!id);

      const snagStats = new Map<string, { total: number; open: number; closed: number }>();
      if (snagListIds.length) {
        const items = await db
          .select({ snagListId: snagItems.snagListId, status: snagItems.status })
          .from(snagItems)
          .where(inArray(snagItems.snagListId, snagListIds));
        for (const item of items) {
          const cur = snagStats.get(item.snagListId) ?? { total: 0, open: 0, closed: 0 };
          cur.total += 1;
          if (item.status === "closed") cur.closed += 1;
          else cur.open += 1;
          snagStats.set(item.snagListId, cur);
        }
      }

      res.json(
        rows.map((r) => {
          const stats = r.handover.snagListId
            ? (snagStats.get(r.handover.snagListId) ?? { total: 0, open: 0, closed: 0 })
            : { total: 0, open: 0, closed: 0 };
          return {
            ...r.handover,
            projectName: r.projectName,
            unit: r.unit,
            unitLabel: formatUnitLabel(r.unit),
            client: r.client,
            snags: stats,
            completionCheck: checkHandoverCompletionGate(stats.open, r.handover.meterTransferStatus),
          };
        }),
      );
    }),
  );

  app.post(
    `${base}/units`,
    route(async (req, res, ctx) => {
      const data = createHandoverSchema.parse(req.body);
      const project = await loadProjectForHandover(ctx, data.projectId);

      const [unit] = await db
        .select()
        .from(workLocations)
        .where(and(eq(workLocations.id, data.workLocationId), eq(workLocations.projectId, project.id)));
      if (!unit) return fail(404, "Unit (work location) not found in this project");

      const [client] = await db.select().from(clients).where(eq(clients.id, data.clientId));
      if (!client) return fail(404, "Client not found");
      if (ctx.user.role !== "super_admin" && client.organizationId !== project.organizationId) {
        return fail(403, "Client does not belong to this project's developer organization");
      }

      // Compute next handover seq per project
      const [maxSeqRow] = await db
        .select({ maxSeq: sql<number>`coalesce(max(${unitHandovers.seq}), 0)` })
        .from(unitHandovers)
        .where(eq(unitHandovers.projectId, project.id));
      const seq = Number(maxSeqRow?.maxSeq ?? 0) + 1;
      const handoverNo = `HO-${String(seq).padStart(4, "0")}`;

      // Create handover record first, then create linked snag_list in existing snag_lists table
      const [created] = await db
        .insert(unitHandovers)
        .values({
          projectId: project.id,
          workLocationId: unit.id,
          clientId: client.id,
          seq,
          handoverNo,
          status: "snagging",
          deedNumber: data.deedNumber,
          contractNumber: data.contractNumber,
          inspectionDate: data.inspectionDate,
          meterNumber: data.meterNumber,
          electricityAccountNo: data.electricityAccountNo,
          notes: data.notes,
          createdBy: ctx.user.id,
        })
        .returning();

      const snagList = await storage.createSnagList({
        projectId: project.id,
        title: `تسليم ${formatUnitLabel(unit)} (${handoverNo})`,
        description: `قائمة ملاحظات تسليم الوحدة للعميل: ${client.fullName}`,
        status: "in_progress",
        buildingNo: unit.buildingNo ?? undefined,
        handoverId: created.id,
        createdBy: ctx.user.id,
      } as any);

      const [updated] = await db
        .update(unitHandovers)
        .set({ snagListId: snagList.id })
        .where(eq(unitHandovers.id, created.id))
        .returning();

      await logActivity(project.id, created.id, "created", ctx.user.id, {
        toStatus: "snagging",
        note: `${handoverNo} — ${formatUnitLabel(unit)}`,
      });

      res.status(201).json(updated);
    }),
  );

  app.get(
    `${base}/units/:id`,
    route(async (req, res, ctx) => {
      const { handover, project } = await loadHandover(ctx, req.params.id);

      const [[unit], [client], [org], items, attachments, activityRows] = await Promise.all([
        db.select().from(workLocations).where(eq(workLocations.id, handover.workLocationId)),
        db.select().from(clients).where(eq(clients.id, handover.clientId)),
        db.select().from(organizations).where(eq(organizations.id, project.organizationId)),
        handover.snagListId ? storage.getSnagItemsByList(handover.snagListId) : Promise.resolve([]),
        db
          .select()
          .from(handoverAttachments)
          .where(eq(handoverAttachments.handoverId, handover.id))
          .orderBy(desc(handoverAttachments.createdAt)),
        db
          .select()
          .from(handoverActivity)
          .where(eq(handoverActivity.handoverId, handover.id))
          .orderBy(desc(handoverActivity.createdAt)),
      ]);

      const userIds = Array.from(
        new Set(
          [handover.createdBy, handover.completedBy, ...attachments.map((a) => a.uploadedBy), ...activityRows.map((a) => a.userId)].filter(
            (id): id is string => !!id,
          ),
        ),
      );
      const userRows = userIds.length
        ? await db
            .select({ id: users.id, fullName: users.fullName, fullNameArabic: users.fullNameArabic, username: users.username })
            .from(users)
            .where(inArray(users.id, userIds))
        : [];
      const userMap = new Map(userRows.map((u) => [u.id, u.fullNameArabic || u.fullName || u.username]));

      const normalizedSnags = items.map((row: any) => row.item ?? row);
      const openSnagsCount = normalizedSnags.filter((s: any) => s.status !== "closed").length;

      res.json({
        handover,
        project: {
          id: project.id,
          name: project.name,
          location: project.location,
          organizationName: org?.nameArabic || org?.name || "",
        },
        unit: unit ?? null,
        unitLabel: unit ? formatUnitLabel(unit) : "",
        client: client ?? null,
        snags: items,
        snagStats: {
          total: normalizedSnags.length,
          open: openSnagsCount,
          closed: normalizedSnags.length - openSnagsCount,
        },
        completionCheck: checkHandoverCompletionGate(openSnagsCount, handover.meterTransferStatus),
        attachments: attachments.map((a) => ({ ...a, uploadedByName: a.uploadedBy ? userMap.get(a.uploadedBy) ?? "" : "" })),
        activity: activityRows.map((a) => ({ ...a, userName: a.userId ? userMap.get(a.userId) ?? "" : "" })),
        completedByName: handover.completedBy ? userMap.get(handover.completedBy) ?? "" : null,
      });
    }),
  );

  app.patch(
    `${base}/units/:id`,
    route(async (req, res, ctx) => {
      const { handover, project } = await loadHandover(ctx, req.params.id);
      const data = updateHandoverSchema.parse(req.body);

      if (data.status === "handed_over") {
        return fail(400, "استخدم إجراء اعتماد وإنهاء التسليم بعد استيفاء الشروط الإلزامية");
      }

      const [updated] = await db
        .update(unitHandovers)
        .set({
          ...(data.clientId !== undefined ? { clientId: data.clientId } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.deedNumber !== undefined ? { deedNumber: data.deedNumber } : {}),
          ...(data.contractNumber !== undefined ? { contractNumber: data.contractNumber } : {}),
          ...(data.inspectionDate !== undefined ? { inspectionDate: data.inspectionDate } : {}),
          ...(data.handoverDate !== undefined ? { handoverDate: data.handoverDate } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          updatedAt: new Date(),
        })
        .where(eq(unitHandovers.id, handover.id))
        .returning();

      if (data.status && data.status !== handover.status) {
        await logActivity(project.id, handover.id, "status_changed", ctx.user.id, {
          fromStatus: handover.status,
          toStatus: data.status,
        });
      }

      res.json(updated);
    }),
  );

  // Add snag item directly to the unit's snag list (using existing snag_lists / snag_items)
  app.post(
    `${base}/units/:id/snags`,
    route(async (req, res, ctx) => {
      const { handover, project } = await loadHandover(ctx, req.params.id);
      if (handover.status === "handed_over" || handover.status === "cancelled") {
        return fail(400, "لا يمكن إضافة ملاحظات لملف تسليم مغلق");
      }

      const data = createHandoverSnagSchema.parse(req.body);
      const [unit] = await db.select().from(workLocations).where(eq(workLocations.id, handover.workLocationId));

      let snagListId = handover.snagListId;
      if (!snagListId) {
        const list = await storage.createSnagList({
          projectId: project.id,
          title: `تسليم ${unit ? formatUnitLabel(unit) : handover.handoverNo} (${handover.handoverNo})`,
          status: "in_progress",
          buildingNo: unit?.buildingNo ?? undefined,
          handoverId: handover.id,
          createdBy: ctx.user.id,
        } as any);
        snagListId = list.id;
        await db.update(unitHandovers).set({ snagListId }).where(eq(unitHandovers.id, handover.id));
      }

      const createdItem = await storage.createSnagItem({
        snagListId,
        title: data.title,
        description: data.description,
        category: data.category,
        priority: data.priority,
        status: "open",
        workLocationId: handover.workLocationId,
        buildingNo: unit?.buildingNo ?? null,
        floorNo: unit?.floor ?? null,
        unitNo: unit?.unitCustomNumber || unit?.flatNo || null,
        locationRoom: data.locationRoom,
        discipline: data.discipline,
        elementName: data.elementName,
        locationDetails: data.locationDetails,
        assignedTo: data.assignedTo,
        dueDate: data.dueDate,
        beforeImages: data.beforeImages,
        raisedBy: ctx.user.id,
        createdBy: ctx.user.id,
      });

      await db.insert(snagItemHistory).values({
        snagItemId: createdItem.id,
        snagListId,
        action: "CREATED",
        fromStatus: null,
        toStatus: "open",
        comments: `تم تسجيل الملاحظة من قسم تسليم الوحدات (${handover.handoverNo})`,
        performedBy: ctx.user.id,
      });

      await logActivity(project.id, handover.id, "snag_added", ctx.user.id, {
        note: data.title,
      });

      res.status(201).json(createdItem);
    }),
  );

  // Saudi Electricity Company (الشركة السعودية للكهرباء) meter account transfer procedure
  app.patch(
    `${base}/units/:id/meter-transfer`,
    route(async (req, res, ctx) => {
      const { handover, project } = await loadHandover(ctx, req.params.id);
      const data = meterTransferSchema.parse(req.body);

      const nextHandoverStatus =
        handover.status === "handed_over" || handover.status === "cancelled"
          ? handover.status
          : data.meterTransferStatus === "requested" || data.meterTransferStatus === "client_confirmed"
            ? "meter_transfer"
            : handover.status;

      const [updated] = await db
        .update(unitHandovers)
        .set({
          meterNumber: data.meterNumber,
          electricityAccountNo: data.electricityAccountNo,
          meterReadingAtHandover: data.meterReadingAtHandover,
          meterTransferStatus: data.meterTransferStatus,
          secRequestNo: data.secRequestNo,
          previousBillsCleared: data.previousBillsCleared ?? handover.previousBillsCleared,
          meterTransferDate:
            data.meterTransferDate ??
            (data.meterTransferStatus === "transferred" && !handover.meterTransferDate ? todayIso() : handover.meterTransferDate),
          meterTransferNotes: data.meterTransferNotes,
          status: nextHandoverStatus,
          updatedAt: new Date(),
        })
        .where(eq(unitHandovers.id, handover.id))
        .returning();

      await logActivity(project.id, handover.id, "meter_transfer_updated", ctx.user.id, {
        fromStatus: handover.meterTransferStatus,
        toStatus: data.meterTransferStatus,
        note: data.secRequestNo ? `طلب الكهرباء: ${data.secRequestNo}` : null,
      });

      res.json(updated);
    }),
  );

  // Complete Handover — enforces MANDATORY closure of all snags + meter transfer completion
  app.post(
    `${base}/units/:id/complete`,
    route(async (req, res, ctx) => {
      const { handover, project } = await loadHandover(ctx, req.params.id);
      if (handover.status === "handed_over") {
        return fail(400, "تم تسليم هذه الوحدة مسبقاً");
      }

      const items = handover.snagListId
        ? await db
            .select({ id: snagItems.id, status: snagItems.status })
            .from(snagItems)
            .where(eq(snagItems.snagListId, handover.snagListId))
        : [];
      const openSnagsCount = items.filter((i) => i.status !== "closed").length;

      const gate = checkHandoverCompletionGate(openSnagsCount, handover.meterTransferStatus);
      if (!gate.ready) {
        const msgs: string[] = [];
        if (gate.reasons.includes("open_snags")) {
          msgs.push(`يوجد ${openSnagsCount} ملاحظة (Snags) غير مغلقة`);
        }
        if (gate.reasons.includes("meter_transfer_pending")) {
          msgs.push("لم يكتمل إجراء نقل حساب عداد الكهرباء عبر الشركة السعودية للكهرباء");
        }
        return fail(400, `لا يمكن إنهاء التسليم: ${msgs.join(" و ")}`);
      }

      const [updated] = await db
        .update(unitHandovers)
        .set({
          status: "handed_over",
          handoverDate: handover.handoverDate ?? todayIso(),
          completedBy: ctx.user.id,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(unitHandovers.id, handover.id))
        .returning();

      if (handover.snagListId) {
        await db
          .update(snagLists)
          .set({ status: "completed", updatedAt: new Date() })
          .where(eq(snagLists.id, handover.snagListId));
      }

      await logActivity(project.id, handover.id, "completed", ctx.user.id, {
        fromStatus: handover.status,
        toStatus: "handed_over",
      });

      res.json(updated);
    }),
  );

  // Attachments
  app.post(
    `${base}/units/:id/attachments`,
    route(async (req, res, ctx) => {
      const { handover, project } = await loadHandover(ctx, req.params.id);
      const data = attachmentSchema.parse(req.body);
      if (!data.objectPath.startsWith(`/projects/${project.id}/handover/`) || data.objectPath.includes("..")) {
        return fail(400, "Invalid attachment path");
      }

      const [row] = await db
        .insert(handoverAttachments)
        .values({
          projectId: project.id,
          handoverId: handover.id,
          category: data.category,
          fileName: data.fileName,
          objectPath: data.objectPath,
          contentType: data.contentType ?? null,
          size: data.size ?? null,
          uploadedBy: ctx.user.id,
        })
        .returning();

      await logActivity(project.id, handover.id, "file_added", ctx.user.id, { note: data.fileName });
      res.status(201).json(row);
    }),
  );

  app.delete(
    `${base}/attachments/:id`,
    route(async (req, res, ctx) => {
      const [file] = await db.select().from(handoverAttachments).where(eq(handoverAttachments.id, req.params.id));
      if (!file) return fail(404, "Attachment not found");
      await loadHandover(ctx, file.handoverId);
      await db.delete(handoverAttachments).where(eq(handoverAttachments.id, file.id));
      await logActivity(file.projectId, file.handoverId, "file_removed", ctx.user.id, { note: file.fileName });
      res.json({ success: true });
    }),
  );
}
