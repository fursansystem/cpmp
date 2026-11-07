// Outgoing webhooks — turns events in the app into signed HTTP POSTs to the endpoints organizations
// register (their ERP, usually).
//
//   emit()        called by the routes after a change is saved. Finds the endpoints subscribed to that
//                 event type, writes one delivery row each and tries it straight away. Never throws:
//                 a webhook problem must not fail the request that caused it.
//   the worker    every few seconds picks up deliveries that are due a retry. Rows are leased with
//                 FOR UPDATE SKIP LOCKED, so a second server process never sends the same one twice.
//
// Each request carries the event type, the delivery id and an HMAC-SHA256 signature of the exact body
// with the endpoint's secret — the same scheme GitHub uses, so the receiver can prove it came from us.
import crypto from "node:crypto";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  projects,
  users,
  webhooks,
  webhookDeliveries,
  paymentBillRequests,
  paymentOrders,
  permitTransactions,
  paymentFines,
  paymentSubcontractorCertificates,
  paymentChargebacks,
  type Webhook,
} from "@shared/schema";
import {
  WEBHOOK_HEADERS,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_DELAYS,
  type WebhookEvent,
  type WebhookEventName,
} from "@shared/webhooks";

const REQUEST_TIMEOUT_MS = 10_000;
const LEASE_SECONDS = 120;
const WORKER_INTERVAL_MS = 15_000;
const RESPONSE_BODY_LIMIT = 2_000;
const USER_AGENT = "ProjectManagerPro-Webhooks/1.0";

// The ERP may sit on the company network; set WEBHOOK_ALLOW_PRIVATE_URLS=true to allow that.
// Otherwise private, loopback and link-local addresses are refused so an endpoint cannot be
// pointed at this server's own internals (cloud metadata, the database, ...).
const allowPrivate = () => process.env.WEBHOOK_ALLOW_PRIVATE_URLS === "true";

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10]] as const) {
  blocked.addSubnet(addr, prefix, "ipv6");
}

function isBlockedAddress(address: string): boolean {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  return blocked.check(address, net.isIPv6(address) ? "ipv6" : "ipv4");
}

export class WebhookUrlError extends Error {}

// Checks the URL's shape and, unless private targets are allowed, that its host does not resolve to one.
export async function assertDeliverableUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebhookUrlError("Enter a full URL, starting with https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new WebhookUrlError("The URL must start with https:// or http://");
  if (url.username || url.password) throw new WebhookUrlError("Put credentials in the secret, not in the URL");
  if (allowPrivate()) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [host] : (await dns.promises.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new WebhookUrlError(`Could not find the host ${host}`);
  if (addresses.some(isBlockedAddress)) {
    throw new WebhookUrlError("That address is on a private network. Ask the server administrator to allow private webhook URLs.");
  }
  return url;
}

// The resolved address is checked again at connect time, so a DNS answer that changes after the URL was
// saved still cannot reach a private address.
const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return (callback as any)(err, address, family);
    const list = Array.isArray(address) ? address.map((a: any) => a.address) : [address];
    if (!allowPrivate() && list.some(isBlockedAddress)) {
      return (callback as any)(new Error(`Refused to connect to private address for ${hostname}`), address, family);
    }
    (callback as any)(null, address, family);
  });
};

export function signBody(secret: string, body: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

export function generateSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

type SendResult = { status: number | null; body: string | null; error: string | null; durationMs: number };

export function sendDelivery(webhook: Pick<Webhook, "url" | "secret">, deliveryId: string, event: string, payload: unknown): Promise<SendResult> {
  const body = JSON.stringify(payload);
  const started = Date.now();
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(webhook.url);
    } catch {
      return resolve({ status: null, body: null, error: "Invalid URL", durationMs: 0 });
    }
    // An IP literal is connected to without a lookup, so guardedLookup never sees it
    const literal = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(literal) && !allowPrivate() && isBlockedAddress(literal)) {
      return resolve({ status: null, body: null, error: `Refused to connect to private address ${literal}`, durationMs: 0 });
    }
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(url, {
      method: "POST",
      lookup: guardedLookup,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": USER_AGENT,
        [WEBHOOK_HEADERS.event]: event,
        [WEBHOOK_HEADERS.delivery]: deliveryId,
        [WEBHOOK_HEADERS.signature]: signBody(webhook.secret, body),
      },
    }, (res) => {
      // Redirects are not followed: the receiver should be configured with its final URL
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        if (text.length < RESPONSE_BODY_LIMIT) text += chunk;
      });
      res.on("end", () => resolve({
        status: res.statusCode ?? null,
        body: text.slice(0, RESPONSE_BODY_LIMIT) || null,
        error: null,
        durationMs: Date.now() - started,
      }));
    });
    req.on("timeout", () => req.destroy(new Error(`No response within ${REQUEST_TIMEOUT_MS / 1000} seconds`)));
    req.on("error", (err) => resolve({ status: null, body: null, error: err.message, durationMs: Date.now() - started }));
    req.end(body);
  });
}

// ---- Records each event carries, loaded only when some endpoint wants the event ----

const paymentTables = {
  payment_order: paymentOrders,
  bill_request: paymentBillRequests,
  subcontractor_certificate: paymentSubcontractorCertificates,
  chargeback: paymentChargebacks,
  fine: paymentFines,
  permit: permitTransactions,
} as const;

async function loadRecord(event: WebhookEvent, id: string): Promise<unknown> {
  if (event in paymentTables) {
    const table = paymentTables[event as keyof typeof paymentTables];
    const [row] = await db.select().from(table).where(eq(table.id, id));
    return row ?? null;
  }
  if (event === "purchase_order") return (await storage.getPurchaseOrder(id)) ?? null;
  if (event === "material_issue") return (await storage.getMaterialIssue(id)) ?? null;
  return null;
}

// Payment routes log verbs ("pay", "approve_request"); deliveries describe what happened ("paid", "request_approved")
const ACTION_NAMES: Record<string, string> = {
  submit: "submitted",
  approve: "approved",
  reject: "rejected",
  pay: "paid",
  cancel: "cancelled",
  receive: "received",
  return: "returned",
  withdraw: "withdrawn",
  convert: "converted",
  recover: "recovered",
  request: "requested",
  approve_request: "request_approved",
  decline_request: "request_declined",
  accept_request: "request_accepted",
  withdraw_request: "request_withdrawn",
  waiver_request: "waiver_requested",
  waiver_withdraw: "waiver_withdrawn",
  waiver_approve: "waiver_approved",
  waiver_reject: "waiver_rejected",
};

export type EmitInput = {
  event: WebhookEvent;
  action: string;
  projectId: string;
  /** The record's id; it is loaded fresh, after the change */
  recordId?: string;
  /** Or the record itself, for events whose record has no loader */
  record?: unknown;
  actorId?: string | null;
  change?: { from?: string | null; to?: string | null; note?: string | null };
  /** Related records that ride along at the top level of the payload, e.g. a receipt */
  extra?: Record<string, unknown>;
};

class WebhookService {
  private timer: NodeJS.Timeout | null = null;
  private missingTablesLogged = false;

  /** Fire-and-forget: call without awaiting after the change is committed. */
  emit(input: EmitInput): void {
    this.dispatch(input).catch((err) => this.logError("emit", err));
  }

  private async dispatch(input: EmitInput) {
    const [project] = await db
      .select({ id: projects.id, name: projects.name, organizationId: projects.organizationId, contractorId: projects.contractorId })
      .from(projects)
      .where(eq(projects.id, input.projectId));
    if (!project) return;

    // The project's owner and its contractor are the parties with money and materials moving;
    // each may have its own ERP listening.
    const orgIds = [project.organizationId, project.contractorId].filter((id): id is string => !!id);
    const targets = await db
      .select()
      .from(webhooks)
      .where(and(
        inArray(webhooks.organizationId, orgIds),
        eq(webhooks.active, true),
        sql`${input.event} = ANY(${webhooks.events})`,
      ));
    if (targets.length === 0) return;

    const record = input.record ?? (input.recordId ? await loadRecord(input.event, input.recordId) : null);
    let actor: { id: string; name: string } | null = null;
    if (input.actorId) {
      const [u] = await db.select({ id: users.id, name: users.fullName }).from(users).where(eq(users.id, input.actorId));
      actor = u ?? null;
    }

    const action = ACTION_NAMES[input.action] ?? input.action;
    const payload = {
      event: input.event,
      action,
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      project: { id: project.id, name: project.name },
      actor,
      ...(input.change && (input.change.from || input.change.to || input.change.note)
        ? { change: { from: input.change.from ?? null, to: input.change.to ?? null, note: input.change.note ?? null } }
        : {}),
      data: record,
      ...input.extra,
    };

    await Promise.all(targets.map((webhook) =>
      this.enqueueAndSend(webhook, input.event, action, { ...payload, organizationId: webhook.organizationId }),
    ));
  }

  // Writes the delivery leased to this process, then sends it now rather than waiting for the worker
  private async enqueueAndSend(webhook: Webhook, event: WebhookEventName, action: string | null, payload: Record<string, unknown>) {
    const [row] = await db.insert(webhookDeliveries).values({
      webhookId: webhook.id,
      event,
      action,
      payload,
      nextAttemptAt: new Date(Date.now() + LEASE_SECONDS * 1000),
    }).returning();
    await this.attempt(row.id, webhook);
    return row;
  }

  /** Sends a ping to one endpoint; used on creation and by its "Send test" button. */
  async ping(webhook: Webhook) {
    const row = await this.enqueueAndSend(webhook, "ping", null, {
      event: "ping",
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      organizationId: webhook.organizationId,
      webhook: { id: webhook.id, name: webhook.name, events: webhook.events },
      zen: "Connected to ProjectManager Pro.",
    });
    const [after] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, row.id));
    return after;
  }

  /** Sends a past delivery's payload again, as a new delivery so the original stays in the log. */
  async redeliver(deliveryId: string) {
    const [original] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId));
    if (!original) return null;
    const [webhook] = await db.select().from(webhooks).where(eq(webhooks.id, original.webhookId));
    if (!webhook) return null;
    const row = await this.enqueueAndSend(webhook, original.event as WebhookEventName, original.action, original.payload);
    const [after] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, row.id));
    return after;
  }

  private async attempt(deliveryId: string, known?: Webhook) {
    const [delivery] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId));
    if (!delivery || delivery.status !== "pending") return;
    const webhook = known ?? (await db.select().from(webhooks).where(eq(webhooks.id, delivery.webhookId)))[0];
    if (!webhook) return;
    // A ping or a redelivery is a deliberate request, so it goes even to a paused endpoint
    const deliberate = delivery.event === "ping" || known !== undefined;
    if (!webhook.active && !deliberate) {
      await db.update(webhookDeliveries)
        .set({ status: "failed", error: "The webhook was turned off before this could be delivered", nextAttemptAt: null })
        .where(eq(webhookDeliveries.id, delivery.id));
      return;
    }

    const result = await sendDelivery(webhook, delivery.id, delivery.event, delivery.payload);
    const attempts = delivery.attempts + 1;
    const ok = result.status !== null && result.status >= 200 && result.status < 300;
    const error = ok ? null : result.error ?? `The endpoint answered HTTP ${result.status}`;
    const retryIn = WEBHOOK_RETRY_DELAYS[attempts - 1];
    const giveUp = !ok && (attempts >= WEBHOOK_MAX_ATTEMPTS || retryIn === undefined);

    await db.update(webhookDeliveries).set({
      status: ok ? "success" : giveUp ? "failed" : "pending",
      attempts,
      responseStatus: result.status,
      responseBody: result.body,
      error,
      durationMs: result.durationMs,
      deliveredAt: ok ? new Date() : null,
      nextAttemptAt: ok || giveUp ? null : new Date(Date.now() + retryIn * 1000),
    }).where(eq(webhookDeliveries.id, delivery.id));
  }

  // Claims the deliveries that are due and sends them. The lease pushes next_attempt_at forward, so a
  // row a crashed process was holding becomes due again after LEASE_SECONDS.
  private async processDue() {
    const claimed = await db.execute(sql`
      UPDATE webhook_deliveries SET next_attempt_at = NOW() + make_interval(secs => ${LEASE_SECONDS})
      WHERE id IN (
        SELECT id FROM webhook_deliveries
        WHERE status = 'pending' AND next_attempt_at <= NOW()
        ORDER BY next_attempt_at
        LIMIT 20
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `);
    const ids = (claimed.rows as { id: string }[]).map((r) => r.id);
    for (const id of ids) {
      await this.attempt(id).catch((err) => this.logError("attempt", err));
    }
  }

  start() {
    if (this.timer) return;
    let running = false;
    this.timer = setInterval(() => {
      if (running) return;
      running = true;
      this.processDue()
        .catch((err) => this.logError("worker", err))
        .finally(() => { running = false; });
    }, WORKER_INTERVAL_MS);
    this.timer.unref();
  }

  private logError(where: string, err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation "webhook(s|_deliveries)" does not exist/.test(message)) {
      if (!this.missingTablesLogged) {
        console.warn("[Webhooks] tables missing — run: npm run db:migrate-webhooks");
        this.missingTablesLogged = true;
      }
      return;
    }
    console.error(`[Webhooks] ${where} failed:`, message);
  }

  /** The newest delivery for each endpoint, for the list's status column. */
  async lastDeliveries(webhookIds: string[]) {
    if (webhookIds.length === 0) return new Map<string, { status: string; responseStatus: number | null; createdAt: Date }>();
    const rows = await db
      .selectDistinctOn([webhookDeliveries.webhookId], {
        webhookId: webhookDeliveries.webhookId,
        status: webhookDeliveries.status,
        responseStatus: webhookDeliveries.responseStatus,
        createdAt: webhookDeliveries.createdAt,
      })
      .from(webhookDeliveries)
      .where(inArray(webhookDeliveries.webhookId, webhookIds))
      .orderBy(webhookDeliveries.webhookId, desc(webhookDeliveries.createdAt));
    return new Map(rows.map((r) => [r.webhookId, r]));
  }
}

export const webhookService = new WebhookService();
