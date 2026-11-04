// Outgoing webhooks — HTTP routes for managing an organization's endpoints and reading their deliveries.
//
// An organization's admin manages their own organization's endpoints. A system administrator (super or
// developer admin) can manage any organization's by passing ?organizationId=.
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { webhooks, webhookDeliveries, type Webhook, type WebhookDelivery } from "@shared/schema";
import type { PermissionUser } from "@shared/permissions";
import {
  WEBHOOK_EVENTS,
  type WebhookDeliveryDetail,
  type WebhookDeliverySummary,
  type WebhookEvent,
  type WebhookSummary,
} from "@shared/webhooks";
import { assertDeliverableUrl, generateSecret, webhookService, WebhookUrlError } from "./webhook-service";

type CurrentUser = { user: PermissionUser; orgId: string | null; teamMemberIds: string[] };

interface Deps {
  getCurrentUserWithOrg: (req: Request) => Promise<CurrentUser | null>;
  handleError: (res: any, error: unknown) => any;
}

class WebhookError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const fail = (status: number, message: string): never => {
  throw new WebhookError(status, message);
};

const eventsSchema = z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Choose at least one event");

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the webhook a name").max(100),
  url: z.string().trim().min(1, "Enter the URL").max(2000),
  events: eventsSchema,
  active: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

const toSummary = (w: Webhook, last?: { status: string; responseStatus: number | null; createdAt: Date }): WebhookSummary => ({
  id: w.id,
  organizationId: w.organizationId,
  name: w.name,
  url: w.url,
  events: w.events as WebhookEvent[],
  active: w.active,
  createdAt: w.createdAt.toISOString(),
  lastDelivery: last ? { status: last.status, responseStatus: last.responseStatus, createdAt: last.createdAt.toISOString() } : null,
});

const toDeliverySummary = (d: WebhookDelivery): WebhookDeliverySummary => ({
  id: d.id,
  event: d.event,
  action: d.action,
  status: d.status as WebhookDeliverySummary["status"],
  attempts: d.attempts,
  responseStatus: d.responseStatus,
  error: d.error,
  durationMs: d.durationMs,
  createdAt: d.createdAt.toISOString(),
  deliveredAt: d.deliveredAt?.toISOString() ?? null,
  nextAttemptAt: d.status === "pending" ? d.nextAttemptAt?.toISOString() ?? null : null,
});

const toDeliveryDetail = (d: WebhookDelivery): WebhookDeliveryDetail => ({
  ...toDeliverySummary(d),
  payload: d.payload,
  responseBody: d.responseBody,
});

export function registerWebhookRoutes(app: Express, deps: Deps) {
  const base = "/api/webhooks";

  const isSystemAdmin = (cu: CurrentUser) => ["super_admin", "developer_admin"].includes(cu.user.role);

  const route = (handler: (req: Request, res: Response, cu: CurrentUser) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const cu = await deps.getCurrentUserWithOrg(req);
        if (!cu) return res.status(401).json({ error: "Authentication required" });
        if (!isSystemAdmin(cu) && cu.user.role !== "org_admin") return fail(403, "Only an organization's administrator can manage its webhooks");
        await handler(req, res, cu);
      } catch (error) {
        if (error instanceof WebhookError) return res.status(error.status).json({ error: error.message });
        if (error instanceof WebhookUrlError) return res.status(400).json({ error: error.message });
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: error.errors.map((e) => e.message).join("; ") });
        }
        console.error("[Webhooks] route error:", error);
        deps.handleError(res, error);
      }
    };

  // The organization a request acts for: the caller's own, or the one a system administrator names
  const targetOrg = (req: Request, cu: CurrentUser): string => {
    const asked = typeof req.query.organizationId === "string" && req.query.organizationId ? req.query.organizationId : null;
    if (asked && asked !== cu.orgId) {
      if (!isSystemAdmin(cu)) return fail(403, "You can only manage your own organization's webhooks");
      return asked;
    }
    return cu.orgId ?? fail(400, "Choose an organization");
  };

  const loadWebhook = async (cu: CurrentUser, id: string): Promise<Webhook> => {
    const [w] = await db.select().from(webhooks).where(eq(webhooks.id, id));
    if (!w || (!isSystemAdmin(cu) && w.organizationId !== cu.orgId)) return fail(404, "Webhook not found");
    return w;
  };

  const loadDelivery = async (cu: CurrentUser, id: string): Promise<WebhookDelivery> => {
    const [d] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id));
    if (!d) return fail(404, "Delivery not found");
    await loadWebhook(cu, d.webhookId);
    return d;
  };

  app.get(base, route(async (req, res, cu) => {
    const orgId = targetOrg(req, cu);
    const rows = await db.select().from(webhooks).where(eq(webhooks.organizationId, orgId)).orderBy(desc(webhooks.createdAt));
    const last = await webhookService.lastDeliveries(rows.map((r) => r.id));
    res.json(rows.map((r) => toSummary(r, last.get(r.id))));
  }));

  // The secret is returned this once; afterwards only rotating it shows a new one
  app.post(base, route(async (req, res, cu) => {
    const orgId = targetOrg(req, cu);
    const data = createSchema.parse(req.body);
    await assertDeliverableUrl(data.url);
    const secret = generateSecret();
    const [created] = await db.insert(webhooks).values({
      organizationId: orgId,
      name: data.name,
      url: data.url,
      events: data.events,
      active: data.active ?? true,
      secret,
      createdBy: cu.user.id,
    }).returning();
    // Like GitHub, a new endpoint gets a ping so the receiver can be checked straight away
    const ping = await webhookService.ping(created);
    res.status(201).json({ ...toSummary(created, ping), secret });
  }));

  app.patch(`${base}/:id`, route(async (req, res, cu) => {
    const w = await loadWebhook(cu, req.params.id);
    const data = updateSchema.parse(req.body);
    if (data.url !== undefined && data.url !== w.url) await assertDeliverableUrl(data.url);
    const [updated] = await db.update(webhooks).set({ ...data, updatedAt: new Date() }).where(eq(webhooks.id, w.id)).returning();
    res.json(toSummary(updated));
  }));

  app.post(`${base}/:id/rotate-secret`, route(async (req, res, cu) => {
    const w = await loadWebhook(cu, req.params.id);
    const secret = generateSecret();
    await db.update(webhooks).set({ secret, updatedAt: new Date() }).where(eq(webhooks.id, w.id));
    res.json({ secret });
  }));

  app.delete(`${base}/:id`, route(async (req, res, cu) => {
    const w = await loadWebhook(cu, req.params.id);
    await db.delete(webhooks).where(eq(webhooks.id, w.id));
    res.status(204).send();
  }));

  app.post(`${base}/:id/ping`, route(async (req, res, cu) => {
    const w = await loadWebhook(cu, req.params.id);
    const delivery = await webhookService.ping(w);
    res.json(toDeliverySummary(delivery));
  }));

  app.get(`${base}/:id/deliveries`, route(async (req, res, cu) => {
    const w = await loadWebhook(cu, req.params.id);
    const rows = await db.select().from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, w.id))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(100);
    res.json(rows.map(toDeliverySummary));
  }));

  app.get(`${base}/deliveries/:id`, route(async (req, res, cu) => {
    res.json(toDeliveryDetail(await loadDelivery(cu, req.params.id)));
  }));

  app.post(`${base}/deliveries/:id/redeliver`, route(async (req, res, cu) => {
    const original = await loadDelivery(cu, req.params.id);
    const delivery = await webhookService.redeliver(original.id);
    if (!delivery) return fail(404, "Delivery not found");
    res.json(toDeliverySummary(delivery));
  }));
}
