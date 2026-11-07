// الرخص والمعاملات (Permits & transactions) — what more than one place needs:
//   - the activity trail, notifications and live updates of a transaction
//   - keeping Activity (the tasks list) in step with the transaction steps assigned to people
//   - keeping a transaction's fee in step with the payment order that pays it (called from payments-routes)
//   - the hourly sweep that warns before a licence expires, marks it expired and chases overdue steps
import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  permitActivity,
  permitTransactions,
  permitTransactionSteps,
  projects,
  tasks,
  teamMembers,
  userTeamMembers,
  users,
  type PaymentOrder,
  type PermitTransaction,
  type Project,
} from "@shared/schema";
import { EXPIRY_FINAL_NOTICE_DAYS, DEFAULT_RENEWAL_LEAD_DAYS, daysUntil, type PermitUserRef } from "@shared/permits";
import { notificationService } from "./notification-service";
import { seedPermitCatalogue } from "./permit-catalog-seed";
import { notificationWss } from "./websocket";
import { webhookService } from "./webhook-service";

type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const todayIso = () => new Date().toISOString().slice(0, 10);

export const permitLink = (id: string) => `/permits/${id}`;

// Statuses of an Activity task for each step status
const TASK_STATUS: Record<string, string> = { pending: "todo", in_progress: "in-progress", done: "completed", skipped: "completed" };

class PermitsService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  // Every logged change is also an outgoing webhook event of type "permit"
  async log(
    exec: Exec,
    tx: { id: string; projectId: string },
    action: string,
    userId: string | null,
    extra: { from?: string | null; to?: string | null; note?: string | null } = {},
  ) {
    await exec.insert(permitActivity).values({
      projectId: tx.projectId,
      transactionId: tx.id,
      action,
      fromStatus: extra.from ?? null,
      toStatus: extra.to ?? null,
      note: extra.note ?? null,
      userId,
    });
    webhookService.emit({ event: "permit", action, projectId: tx.projectId, recordId: tx.id, actorId: userId, change: extra });
  }

  broadcast(projectId: string, excludeUserId?: string) {
    notificationWss.broadcastPermitsUpdate(projectId, excludeUserId);
  }

  // Fire and forget: a notification that cannot be sent never fails what caused it
  notify(userIds: (string | null | undefined)[], actorId: string | null, tx: { id: string; projectId: string }, title: string, message: string, type: "assignment" | "warning" | "success" | "info" = "assignment") {
    const targets = Array.from(new Set(userIds.filter(Boolean) as string[])).filter((id) => id !== actorId);
    if (targets.length === 0) return;
    void notificationService
      .notifyPermits({ userIds: targets, title, message, projectId: tx.projectId, link: permitLink(tx.id), type })
      .catch((error) => console.error("[Permits] notification failed:", error));
  }

  // The developer organization's administrators: who hears about a licence nobody is assigned to
  async developerAdmins(project: Project): Promise<string[]> {
    const found = new Set<string>();
    for (const member of await storage.getTeamMembersByOrganization(project.organizationId)) {
      for (const link of await storage.getTeamMemberUsers(member.id)) found.add(link.userId);
    }
    if (found.size === 0) return [];
    const rows = await db.select({ id: users.id, role: users.role }).from(users).where(inArray(users.id, Array.from(found)));
    return rows.filter((u) => u.role === "developer_admin" || u.role === "org_admin").map((u) => u.id);
  }

  // The people a transaction or a step can be assigned to: the users of the project's three organizations
  async assignableUsers(project: Project): Promise<PermitUserRef[]> {
    const parties: [string | null, PermitUserRef["party"]][] = [
      [project.organizationId, "developer"],
      [project.contractorId, "contractor"],
      [project.consultantId, "consultant"],
    ];
    const out = new Map<string, PermitUserRef>();
    for (const [orgId, party] of parties) {
      if (!orgId) continue;
      const rows = await db
        .select({ id: users.id, name: users.fullName, nameAr: users.fullNameArabic, active: users.isActive })
        .from(userTeamMembers)
        .innerJoin(teamMembers, eq(teamMembers.id, userTeamMembers.teamMemberId))
        .innerJoin(users, eq(users.id, userTeamMembers.userId))
        .where(eq(teamMembers.organizationId, orgId));
      for (const r of rows) {
        if (!r.active || out.has(r.id)) continue;
        out.set(r.id, { id: r.id, name: r.nameAr || r.name, party });
      }
    }
    return Array.from(out.values()).sort((a, b) => a.party.localeCompare(b.party) || a.name.localeCompare(b.name));
  }

  // ---- Activity (tasks) ----
  // Each assigned step of a live transaction is mirrored as an Activity task, so it shows in the Activity list of
  // the project with its assignee and due date. Rebuilt from the steps after every change, so it can never drift.
  async syncTasks(transactionId: string) {
    try {
      const [tx] = await db.select().from(permitTransactions).where(eq(permitTransactions.id, transactionId));
      const existing = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.sourceType, "permit_step"), sql`${tasks.sourceId} IN (SELECT id FROM permit_transaction_steps WHERE transaction_id = ${transactionId})`));
      if (!tx) return;
      const steps = await db.select().from(permitTransactionSteps).where(eq(permitTransactionSteps.transactionId, transactionId));
      const live = !["cancelled", "rejected"].includes(tx.status);
      const wanted = live ? steps.filter((s) => s.assigneeUserId) : [];
      const wantedIds = new Set(wanted.map((s) => s.id));
      const stale = existing.filter((t) => !wantedIds.has(t.sourceId ?? ""));
      if (stale.length) await db.delete(tasks).where(inArray(tasks.id, stale.map((t) => t.id)));
      if (wanted.length === 0) return;

      const [project] = await db.select().from(projects).where(eq(projects.id, tx.projectId));
      const projectOrgs = [project?.organizationId, project?.contractorId, project?.consultantId].filter(Boolean) as string[];
      const memberOf = new Map<string, string>();
      const assignees = Array.from(new Set(wanted.map((s) => s.assigneeUserId!)));
      const links = await db
        .select({ userId: userTeamMembers.userId, memberId: teamMembers.id, orgId: teamMembers.organizationId })
        .from(userTeamMembers)
        .innerJoin(teamMembers, eq(teamMembers.id, userTeamMembers.teamMemberId))
        .where(inArray(userTeamMembers.userId, assignees));
      for (const l of links) {
        // prefer the membership in one of the project's organizations
        if (!memberOf.has(l.userId) || projectOrgs.includes(l.orgId ?? "")) memberOf.set(l.userId, l.memberId);
      }

      const today = todayIso();
      for (const step of wanted) {
        const values = {
          projectId: tx.projectId,
          title: `${tx.transactionNo} · ${step.title}`,
          description: [tx.title, tx.authorityName].filter(Boolean).join(" — "),
          type: "permit_step",
          assignedTo: memberOf.get(step.assigneeUserId!) ?? null,
          priority: step.dueDate && step.dueDate < today && !["done", "skipped"].includes(step.status) ? "high" : "medium",
          status: TASK_STATUS[step.status] ?? "todo",
          dueDate: step.dueDate,
          sourceType: "permit_step",
          sourceId: step.id,
        };
        const current = existing.find((t) => t.sourceId === step.id);
        if (current) await db.update(tasks).set(values).where(eq(tasks.id, current.id));
        else await db.insert(tasks).values(values);
      }
    } catch (error) {
      console.error("[Permits] task sync failed:", error);
    }
  }

  // A mirrored task was ticked or moved in Activity: move the step with it. A fee step only completes through its
  // payment order, so a task for an unpaid fee goes back to what the step says.
  async applyTaskStatus(task: { id: string; sourceType: string | null; sourceId: string | null; status: string }, userId: string | null) {
    if (task.sourceType !== "permit_step" || !task.sourceId) return;
    const [step] = await db.select().from(permitTransactionSteps).where(eq(permitTransactionSteps.id, task.sourceId));
    if (!step) return;
    const [tx] = await db.select().from(permitTransactions).where(eq(permitTransactions.id, step.transactionId));
    if (!tx) return;
    const target = task.status === "completed" ? "done" : task.status === "in-progress" ? "in_progress" : "pending";
    const blocked = step.isPaymentStep && Number(tx.feeAmount) > 0 && !tx.feePaid;
    if (target !== step.status && !(blocked && target === "done") && step.status !== "skipped") {
      const done = target === "done";
      await db.update(permitTransactionSteps).set({
        status: target,
        completedBy: done ? userId : null,
        completedAt: done ? new Date() : null,
      }).where(eq(permitTransactionSteps.id, step.id));
      await this.log(db, tx, done ? "step_completed" : "step_reopened", userId, { note: `${step.title} (من Activity)` });
      if (tx.status === "not_started" && target !== "pending") {
        await db.update(permitTransactions).set({ status: "in_progress", updatedAt: new Date() }).where(eq(permitTransactions.id, tx.id));
        await this.log(db, tx, "status_changed", userId, { from: "not_started", to: "in_progress" });
      }
      this.broadcast(tx.projectId);
    }
    await this.syncTasks(tx.id);
  }

  // ---- Fees paid through المدفوعات ----
  // Inside the payment's own database transaction: the fee is paid when the order is
  async markFeePaid(exec: Exec, order: PaymentOrder, now: Date) {
    if (!order.permitTransactionId) return;
    await exec.update(permitTransactions).set({ feePaid: true, feePaidAt: now, updatedAt: now }).where(eq(permitTransactions.id, order.permitTransactionId));
    await exec.update(permitTransactionSteps).set({ status: "done", completedAt: now, completedBy: order.paidBy ?? null, note: `سُدِّد بأمر الدفع ${order.orderNo}` })
      .where(and(eq(permitTransactionSteps.transactionId, order.permitTransactionId), eq(permitTransactionSteps.isPaymentStep, true)));
  }

  // After an order that pays a fee was raised, sent back, cancelled or paid: the payment step, history and people
  async afterOrderEvent(order: PaymentOrder, event: "requested" | "reverted" | "paid", actorId: string | null) {
    if (!order.permitTransactionId) return;
    try {
      const [tx] = await db.select().from(permitTransactions).where(eq(permitTransactions.id, order.permitTransactionId));
      if (!tx) return;
      if (event !== "paid") {
        await db.update(permitTransactionSteps).set({ status: event === "requested" ? "in_progress" : "pending" })
          .where(and(eq(permitTransactionSteps.transactionId, tx.id), eq(permitTransactionSteps.isPaymentStep, true), sql`${permitTransactionSteps.status} <> 'done'`));
      }
      const action = event === "requested" ? "payment_requested" : event === "paid" ? "fee_paid" : "payment_reverted";
      await this.log(db, tx, action, actorId, { note: order.orderNo });
      if (event === "paid") {
        this.notify([tx.assigneeUserId, tx.createdBy], actorId, tx, "سُدِّدت رسوم المعاملة", `${tx.transactionNo} · ${tx.title} · ${order.orderNo}`, "success");
      }
      this.broadcast(tx.projectId);
      await this.syncTasks(tx.id);
    } catch (error) {
      console.error("[Permits] order sync failed:", error);
    }
  }

  // ---- Expiry and overdue sweep ----
  start(intervalMs = 60 * 60 * 1000) {
    if (this.timer) return;
    // The built-in service directory: filled in here too, so it is there even if the migration's seed did not run
    void seedPermitCatalogue()
      .then((added) => added && console.log(`[Permits] added ${added} built-in services to the catalogue`))
      .catch((error) => console.error("[Permits] could not seed the service catalogue (run npm run db:migrate-permits):", error?.message ?? error));
    // first run shortly after start-up, then hourly
    setTimeout(() => void this.sweep(), 30_000);
    this.timer = setInterval(() => void this.sweep(), intervalMs);
  }

  async sweep() {
    if (this.running) return;
    this.running = true;
    try {
      await this.sweepExpiries();
      await this.sweepOverdueSteps();
    } catch (error) {
      console.error("[Permits] sweep failed:", error);
    } finally {
      this.running = false;
    }
  }

  private async recipients(tx: PermitTransaction): Promise<string[]> {
    const ids = [tx.assigneeUserId, tx.createdBy].filter(Boolean) as string[];
    if (ids.length) return ids;
    const [project] = await db.select().from(projects).where(eq(projects.id, tx.projectId));
    return project ? this.developerAdmins(project) : [];
  }

  async sweepExpiries() {
    const today = todayIso();
    const rows = await db
      .select()
      .from(permitTransactions)
      .where(and(eq(permitTransactions.status, "completed"), isNotNull(permitTransactions.expiryDate)));
    if (rows.length === 0) return;
    // A licence already being renewed doesn't need reminding, only marking expired when the day comes
    const renewals = await db
      .select({ of: permitTransactions.renewalOfId })
      .from(permitTransactions)
      .where(and(isNotNull(permitTransactions.renewalOfId), sql`${permitTransactions.status} NOT IN ('cancelled', 'rejected')`));
    const renewing = new Set(renewals.map((r) => r.of));

    for (const tx of rows) {
      const left = daysUntil(tx.expiryDate!, today);
      if (left < 0) {
        await db.update(permitTransactions).set({ status: "expired", expiryNoticeLevel: -1, updatedAt: new Date() }).where(eq(permitTransactions.id, tx.id));
        await this.log(db, tx, "expired", null, { from: "completed", to: "expired" });
        this.notify(await this.recipients(tx), null, tx, "انتهت صلاحية رخصة", `${tx.transactionNo} · ${tx.title} · ${tx.expiryDate}`, "warning");
        this.broadcast(tx.projectId);
        continue;
      }
      if (renewing.has(tx.id)) continue;
      const lead = tx.renewalLeadDays ?? DEFAULT_RENEWAL_LEAD_DAYS;
      const levels = Array.from(new Set([lead, EXPIRY_FINAL_NOTICE_DAYS, 0])).sort((a, b) => b - a);
      // the tightest threshold already reached
      const level = levels.filter((t) => left <= t).pop();
      if (level === undefined) continue;
      if (tx.expiryNoticeLevel !== null && tx.expiryNoticeLevel <= level) continue;
      await db.update(permitTransactions).set({ expiryNoticeLevel: level }).where(eq(permitTransactions.id, tx.id));
      const when = left === 0 ? "تنتهي اليوم" : `تنتهي خلال ${left} يوماً`;
      this.notify(await this.recipients(tx), null, tx, `رخصة ${when}`, `${tx.transactionNo} · ${tx.title} · ${tx.expiryDate}`, "warning");
    }
  }

  async sweepOverdueSteps() {
    const today = todayIso();
    const steps = await db
      .select({ step: permitTransactionSteps, tx: permitTransactions })
      .from(permitTransactionSteps)
      .innerJoin(permitTransactions, eq(permitTransactions.id, permitTransactionSteps.transactionId))
      .where(and(
        inArray(permitTransactionSteps.status, ["pending", "in_progress"]),
        isNotNull(permitTransactionSteps.assigneeUserId),
        isNull(permitTransactionSteps.overdueNotifiedAt),
        lt(permitTransactionSteps.dueDate, today),
        or(eq(permitTransactions.status, "not_started"), eq(permitTransactions.status, "in_progress"), eq(permitTransactions.status, "submitted"), eq(permitTransactions.status, "returned")),
      ));
    for (const { step, tx } of steps) {
      await db.update(permitTransactionSteps).set({ overdueNotifiedAt: new Date() }).where(eq(permitTransactionSteps.id, step.id));
      this.notify([step.assigneeUserId], null, tx, "خطوة متأخرة في معاملة", `${tx.transactionNo} · ${step.title} · ${step.dueDate}`, "warning");
      await this.syncTasks(tx.id);
    }
  }
}

export const permitsService = new PermitsService();
