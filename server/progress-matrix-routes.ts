// مصفوفة أوزان ونسب الإنجاز + المستخلصات — HTTP routes.
// Every route: auth → load project → permission → zod → service → broadcast.
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { projects, type Project } from "@shared/schema";
import { ProgressMatrixPermissions, type PermissionUser } from "@shared/permissions";
import { UNIT_WEIGHT_MODES, type MatrixPermissions } from "@shared/progress-matrix";
import * as service from "./progress-matrix-service";
import { ProgressMatrixError } from "./progress-matrix-service";
import { notificationWss } from "./websocket";

type CurrentUser = { user: PermissionUser; orgId: string | null; teamMemberIds: string[] };

interface Deps {
  getCurrentUserWithOrg: (req: Request) => Promise<CurrentUser | null>;
  handleError: (res: any, error: unknown) => any;
}

type Ctx = { currentUser: CurrentUser; project: Project; perms: MatrixPermissions };
type PermKey = keyof MatrixPermissions;

const settingsSchema = z.object({
  unitWeightMode: z.enum(UNIT_WEIGHT_MODES as [string, ...string[]]).optional(),
  defaultUnitValue: z.number().min(0).max(1e12).optional(),
  driveProjectProgress: z.boolean().optional(),
});

const nodeBase = {
  code: z.string().trim().min(1).max(50).optional(),
  nameAr: z.string().trim().min(1, "اسم البند مطلوب"),
  nameEn: z.string().trim().nullable().optional(),
  weight: z.number().min(0).max(100).optional(),
  workListActivityId: z.string().nullable().optional(),
  workLevelId: z.string().nullable().optional(),
  confirmDropCells: z.boolean().optional(),
};
const createNodeSchema = z.object({ ...nodeBase, parentId: z.string().nullable().optional() });
const updateNodeSchema = z.object({
  ...nodeBase,
  nameAr: nodeBase.nameAr.optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});
const weightsSchema = z.object({
  entries: z.array(z.object({
    id: z.string(),
    weight: z.number().min(0).max(100).optional(),
    sortOrder: z.number().int().optional(),
  })).max(5000),
});
const splitSchema = z.object({
  levelIds: z.array(z.string()).optional(),
  confirmDropCells: z.boolean().optional(),
});
const generateSchema = z.object({
  source: z.enum(["wir", "divisions"]),
  divisionIds: z.array(z.string()).optional(),
});
const importSchema = z.object({
  rows: z.array(z.object({
    code: z.string().trim().min(1).max(50),
    parentCode: z.string().trim().nullable().optional(),
    nameAr: z.string().trim(),
    nameEn: z.string().trim().nullable().optional(),
    weight: z.number().min(0).max(100).nullable().optional(),
    activityRef: z.string().trim().nullable().optional(),
    levelCode: z.string().trim().nullable().optional(),
  })).min(1).max(5000),
});
const unitsSchema = z.object({
  entries: z.array(z.object({
    workLocationId: z.string(),
    unitValue: z.number().min(0).max(1e12).nullable().optional(),
    manualWeight: z.number().min(0).max(1e6).nullable().optional(),
    included: z.boolean().optional(),
  })).max(20000),
});
const cellsSchema = z.object({
  entries: z.array(z.object({
    nodeId: z.string(),
    unitId: z.string(),
    percent: z.number().min(0).max(100).nullable(),
    reason: z.string().max(1000).nullable().optional(),
  })).min(1).max(100000),
});
const certInfoSchema = z.object({
  title: z.string().trim().max(300).nullable().optional(),
  periodFrom: z.string().nullable().optional(),
  periodTo: z.string().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});
const transitionSchema = z.object({
  action: z.enum(["submit", "withdraw", "approve", "reject", "pay"]),
  reason: z.string().max(2000).nullable().optional(),
});

export function registerProgressMatrixRoutes(app: Express, deps: Deps) {
  const base = "/api/projects/:projectId/progress-matrix";
  const certBase = "/api/projects/:projectId/payment-certificates";

  // Wraps a handler with auth, project loading, the permission check and error mapping.
  const route = (perm: PermKey, handler: (req: Request, res: Response, ctx: Ctx) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const currentUser = await deps.getCurrentUserWithOrg(req);
        if (!currentUser) return res.status(401).json({ error: "Authentication required" });
        const [project] = await db.select().from(projects).where(eq(projects.id, req.params.projectId));
        if (!project) return res.status(404).json({ error: "Project not found" });
        const perms = ProgressMatrixPermissions.forProject(currentUser.user, {
          id: project.id,
          creatorId: project.creatorId,
          organizationId: project.organizationId,
          contractorId: project.contractorId,
          consultantId: project.consultantId,
        }, currentUser.orgId);
        if (!perms.canView) return res.status(403).json({ error: "Access denied" });
        if (!perms[perm]) return res.status(403).json({ error: "You don't have permission for this action" });
        await handler(req, res, { currentUser, project, perms });
      } catch (error) {
        if (error instanceof ProgressMatrixError) {
          return res.status(error.status).json({ error: error.message, ...(error.details || {}) });
        }
        console.error("[ProgressMatrix] route error:", error);
        deps.handleError(res, error);
      }
    };

  const changed = async (ctx: Ctx) => service.afterChange(ctx.project.id, ctx.currentUser.user.id);
  const certChanged = (ctx: Ctx) => notificationWss.broadcastProgressMatrixUpdate(ctx.project.id, ctx.currentUser.user.id);

  // ---- Matrix ----
  app.get(base, route("canView", async (_req, res, ctx) => {
    res.json(await service.getMatrixPayload(ctx.project.id, ctx.perms));
  }));

  app.get(`${base}/summary`, route("canView", async (_req, res, ctx) => {
    res.json(await service.getMatrixSummary(ctx.project.id));
  }));

  app.patch(`${base}/settings`, route("canEdit", async (req, res, ctx) => {
    const data = settingsSchema.parse(req.body);
    await service.updateSettings(ctx.project.id, ctx.currentUser.user.id, data as any);
    await changed(ctx);
    res.json({ ok: true });
  }));

  app.post(`${base}/nodes`, route("canEdit", async (req, res, ctx) => {
    const data = createNodeSchema.parse(req.body);
    const node = await service.createNode(ctx.project.id, ctx.currentUser.user.id, data);
    await changed(ctx);
    res.status(201).json(node);
  }));

  app.put(`${base}/nodes/weights`, route("canEdit", async (req, res, ctx) => {
    const { entries } = weightsSchema.parse(req.body);
    const result = await service.saveWeights(ctx.project.id, entries);
    await changed(ctx);
    res.json(result);
  }));

  app.patch(`${base}/nodes/:nodeId`, route("canEdit", async (req, res, ctx) => {
    const data = updateNodeSchema.parse(req.body);
    const node = await service.updateNode(ctx.project.id, req.params.nodeId, ctx.currentUser.user.id, data);
    await changed(ctx);
    res.json(node);
  }));

  app.delete(`${base}/nodes/:nodeId`, route("canEdit", async (req, res, ctx) => {
    const result = await service.deleteNode(ctx.project.id, req.params.nodeId, ctx.currentUser.user.id);
    await changed(ctx);
    res.json(result);
  }));

  app.get(`${base}/nodes/:nodeId/levels`, route("canView", async (req, res, ctx) => {
    const nodes = (await service.loadMatrixData(ctx.project.id)).nodes;
    const node = nodes.find((n) => n.id === req.params.nodeId);
    if (!node) return res.status(404).json({ error: "Item not found in this project" });
    res.json(node.workListActivityId ? await service.getActivityLevels(ctx.project.id, node.workListActivityId) : []);
  }));

  app.post(`${base}/nodes/:nodeId/split-levels`, route("canEdit", async (req, res, ctx) => {
    const data = splitSchema.parse(req.body);
    const result = await service.splitNodeByLevels(ctx.project.id, req.params.nodeId, ctx.currentUser.user.id, data);
    await changed(ctx);
    res.json(result);
  }));

  app.post(`${base}/wbs/generate`, route("canEdit", async (req, res, ctx) => {
    const data = generateSchema.parse(req.body);
    const result = await service.generateWbs(ctx.project.id, ctx.currentUser.user.id, data);
    await changed(ctx);
    res.json(result);
  }));

  app.post(`${base}/wbs/import`, route("canEdit", async (req, res, ctx) => {
    const { rows } = importSchema.parse(req.body);
    const result = await service.importWbs(ctx.project.id, ctx.currentUser.user.id, rows);
    await changed(ctx);
    res.json(result);
  }));

  app.put(`${base}/units`, route("canEdit", async (req, res, ctx) => {
    const { entries } = unitsSchema.parse(req.body);
    const result = await service.saveUnits(ctx.project.id, entries);
    await changed(ctx);
    res.json(result);
  }));

  app.put(`${base}/cells`, route("canEdit", async (req, res, ctx) => {
    const { entries } = cellsSchema.parse(req.body);
    const result = await service.saveCells(ctx.project.id, ctx.currentUser.user, entries);
    if (result.saved > 0) await changed(ctx);
    res.json(result);
  }));

  app.get(`${base}/cells/history`, route("canView", async (req, res, ctx) => {
    const nodeId = String(req.query.nodeId || "");
    const unitId = String(req.query.unitId || "");
    if (!nodeId || !unitId) return res.status(400).json({ error: "nodeId and unitId are required" });
    res.json(await service.getCellHistory(ctx.project.id, nodeId, unitId));
  }));

  app.post(`${base}/sync-wir`, route("canEdit", async (_req, res, ctx) => {
    const result = await service.syncFromApprovedWirs(ctx.project.id, ctx.currentUser.user.id);
    await changed(ctx);
    res.json(result);
  }));

  // ---- Payment certificates ----
  app.get(certBase, route("canView", async (_req, res, ctx) => {
    res.json(await service.listCertificates(ctx.project.id));
  }));

  app.post(certBase, route("canSubmitCertificate", async (req, res, ctx) => {
    const data = certInfoSchema.parse(req.body ?? {});
    const result = await service.createCertificate(ctx.project.id, ctx.currentUser.user.id, data);
    certChanged(ctx);
    res.status(201).json(result);
  }));

  app.get(`${certBase}/:certId`, route("canView", async (req, res, ctx) => {
    res.json(await service.getCertificate(ctx.project.id, req.params.certId));
  }));

  app.patch(`${certBase}/:certId`, route("canSubmitCertificate", async (req, res, ctx) => {
    const data = certInfoSchema.parse(req.body ?? {});
    await service.updateCertificateInfo(ctx.project.id, req.params.certId, data);
    certChanged(ctx);
    res.json({ ok: true });
  }));

  app.delete(`${certBase}/:certId`, route("canSubmitCertificate", async (req, res, ctx) => {
    await service.deleteCertificate(ctx.project.id, req.params.certId);
    certChanged(ctx);
    res.status(204).send();
  }));

  app.post(`${certBase}/:certId/refresh`, route("canSubmitCertificate", async (req, res, ctx) => {
    const result = await service.refreshCertificate(ctx.project.id, req.params.certId);
    certChanged(ctx);
    res.json(result);
  }));

  // permission per action is checked inside the service
  app.post(`${certBase}/:certId/transition`, route("canView", async (req, res, ctx) => {
    const { action, reason } = transitionSchema.parse(req.body);
    const result = await service.transitionCertificate(ctx.project.id, req.params.certId, ctx.currentUser.user.id, ctx.perms, action, reason);
    certChanged(ctx);
    res.json(result);
  }));
}
