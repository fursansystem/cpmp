// الصفحة الرئيسية (Project Pulse) — one summary, counted on the server and scoped to what the caller may see.
//
// The page used to download every request, activity and document and count them in the browser. Here the
// counting happens next to the data, behind the same visibility rules the modules themselves apply:
//   projects   the caller's organization is a party to them (ProjectPermissions)
//   requests   requestVisibilityClauses, the rule the request list uses
//   "mine"     memberIsNotifiedAtStep, the rule step notifications use
//   payments   the statuses and the lateness threshold of shared/payments.ts
//   permits    permitAttention of shared/permits.ts
// Nothing is written here.
import type { Express, Request, Response } from "express";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  projects as projectsTable,
  requests,
  requestRevisions,
  requestPurposes,
  requestStatusHistory,
  paymentOrders,
  paymentBillRequests,
  paymentFines,
  paymentSubcontractorCertificates,
  permitTransactions,
  snagLists,
  snagItems,
  materialIssues,
  type Project,
} from "@shared/schema";
import { ProjectPermissions, type PermissionUser } from "@shared/permissions";
import { DECISION_OVERDUE_DAYS, OPEN_BILL_REQUEST, OPEN_FINE } from "@shared/payments";
import { OPEN_PERMIT, permitAttention } from "@shared/permits";
import {
  DEFAULT_HOME_PERIOD,
  MAX_HOME_PERIOD,
  REQUEST_STALLED_DAYS,
  UNJUDGED_PROJECT_STATUSES,
  budgetHealth,
  scheduleHealth,
  worstOf,
  type HealthReason,
  type HomeActionRequest,
  type HomeKpiSet,
  type HomeProjectRow,
  type HomeRequestTypeRow,
  type HomeSummary,
  type HomeViewer,
  type ProjectHealthState,
  type RequestTab,
} from "@shared/home";
import { requestVisibilityClauses } from "./request-visibility";
import { isProjectManagerPosition, memberIsNotifiedAtStep } from "./step-authorization";
import { ACCOUNTANT_TITLES } from "./payments-routes";

type CurrentUser = { user: PermissionUser; orgId: string | null; teamMemberIds: string[] };

interface Deps {
  getCurrentUserWithOrg: (req: Request) => Promise<CurrentUser | null>;
  handleError: (res: any, error: unknown) => any;
}

const DAY_MS = 86_400_000;
const ACTIONS_LIMIT = 8;
const STEPS_LIMIT = 6;
// A request in one of these has left the workflow
const DONE_REQUEST_STATUSES = new Set(["Closed", "Resolved"]);
// These wait on whoever wrote the request, not on a workflow step
const AUTHOR_REQUEST_STATUSES = new Set(["Draft", "Requires Action"]);
// Job titles that mark the purchasing and stores side; positions are free text, so this is by keyword
const SUPPLY_TITLE = /procure|purchas|store ?keeper|warehouse|مشتريات|أمين مستودع|أمين المستودع|مخازن/i;

const n = (v: unknown) => Number(v ?? 0) || 0;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Request timestamps are text columns filled both by Postgres ("2026-01-05 09:12:44.5+00") and by
// toISOString(); read either.
function parseStamp(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  if (typeof v !== "string" || !v) return null;
  const t = new Date(v.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")).getTime();
  return Number.isNaN(t) ? null : t;
}

const projectRef = (p: Project) => ({
  id: p.id,
  creatorId: p.creatorId,
  organizationId: p.organizationId,
  contractorId: p.contractorId,
  consultantId: p.consultantId,
});

async function loadVisibleProjects(cu: CurrentUser): Promise<Project[]> {
  if (ProjectPermissions.canViewAll(cu.user)) return storage.getAllProjects();
  if (!cu.orgId) return [];
  const orgProjects = await storage.getProjectsByOrganization(cu.orgId);
  return orgProjects.filter((p) => ProjectPermissions.canView(cu.user, projectRef(p), cu.orgId));
}

// The tab of the project's request page a type lives under; mirrors the request list's own grouping
function tabOf(type: { code: string; name_english: string }): RequestTab {
  const code = (type.code ?? "").toUpperCase();
  if (code === "WIR") return "wir";
  if (code === "DSR") return "dsr";
  if (code === "SD") return "sd";
  if (code === "ASD") return "asd";
  if (code === "MIR") return "request";
  if (code.includes("APPROVAL") || type.name_english.toLowerCase().includes("approval") || code === "SSR") return "approvals";
  return "request";
}

export function registerHomeRoutes(app: Express, deps: Deps) {
  app.get("/api/home/summary", async (req: Request, res: Response) => {
    try {
      const cu = await deps.getCurrentUserWithOrg(req);
      if (!cu) return res.status(401).json({ error: "Authentication required" });
      const me = cu.user.id;

      // ---- Who is looking ----
      const [allTeamMembers, allPositions, visibleProjects] = await Promise.all([
        storage.getAllTeamMembers(),
        storage.getAllPositions(),
        loadVisibleProjects(cu),
      ]);
      const myMembers = allTeamMembers.filter((tm) => cu.teamMemberIds.includes(tm.id));
      const myTitles = myMembers.map((tm) => tm.position?.trim().toLowerCase() ?? "").filter(Boolean);
      const isAdminRole = ["super_admin", "org_admin", "developer_admin"].includes(cu.user.role);
      const isProjectManager = myTitles.some((t) => isProjectManagerPosition(t));
      const isAccountant = myTitles.some((t) => ACCOUNTANT_TITLES.has(t));
      const isConsultant = cu.user.organizationSectorType === "Consultant";

      // ---- Scope: the filters narrow what is counted, never what the caller may see ----
      const projectFilter = typeof req.query.projectId === "string" && req.query.projectId !== "all" ? req.query.projectId : "";
      const statusFilter = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : "";
      if (projectFilter && !visibleProjects.some((p) => p.id === projectFilter)) {
        return res.status(404).json({ error: "Project not found" });
      }
      const rawDays = parseInt(String(req.query.days ?? ""), 10);
      const periodDays = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, MAX_HOME_PERIOD) : DEFAULT_HOME_PERIOD;

      const scope = visibleProjects
        .filter((p) => (!projectFilter || p.id === projectFilter) && (!statusFilter || p.status === statusFilter))
        .sort((a, b) => a.name.localeCompare(b.name));
      const ids = scope.map((p) => p.id);
      const projectName = new Map(scope.map((p) => [p.id, p.name]));

      const now = new Date();
      const nowMs = now.getTime();
      const todayIso = isoDay(now);
      const sinceMs = nowMs - periodDays * DAY_MS;
      const sinceIso = isoDay(new Date(sinceMs));
      const ageDays = (stamp: number | null) => (stamp === null ? 0 : Math.max(0, Math.floor((nowMs - stamp) / DAY_MS)));

      // Purchasing and stores: by job title, or by being named an approver of issue vouchers on a project.
      // Only asked when nothing else has placed the viewer, since it costs a lookup per project.
      const placed = isAdminRole || isProjectManager || isAccountant;
      const isSupply = !placed && (
        myTitles.some((t) => SUPPLY_TITLE.test(t)) ||
        (await Promise.all(ids.map((id) => storage.canUserApproveIssues(me, id)))).some(Boolean)
      );

      const kpiSet: HomeKpiSet = isAccountant && !isAdminRole
        ? "finance"
        : isAdminRole || isProjectManager
          ? "manager"
          : isSupply
            ? "procurement"
            : isConsultant
              ? "quality"
              : "general";
      const viewer: HomeViewer = {
        kpiSet,
        // The consultant's side sees no money on this page; on the other sides, budgets are for those who manage or account
        canSeeBudget: !isConsultant && (isAdminRole || isProjectManager || isAccountant),
        canSeePayments: !isConsultant,
        // View-only accounts get no per-project table; a project manager is not view-only whatever the account's role
        canSeeProjectTable: cu.user.role !== "user" || isProjectManager,
      };

      const filters: HomeSummary["filters"] = {
        projects: visibleProjects
          .map((p) => ({ id: p.id, name: p.name, status: p.status }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        statuses: Array.from(new Set(visibleProjects.map((p) => p.status))).sort(),
      };

      // ---- Requests ----
      const [allTypes, allSteps, codeRows] = await Promise.all([
        storage.getAllRequestTypes(),
        storage.getAllWorkflowSteps(),
        storage.getAllApprovalStatusCodes(),
      ]);
      const typeById = new Map(allTypes.map((t) => [t.id, t]));
      const stepById = new Map(allSteps.map((s) => [s.id, s]));
      const positionByTitle = new Map(allPositions.map((p) => [p.titleEnglish, p]));

      const inScope = ids.length ? inArray(requests.projectId, ids) : sql`false`;
      const visibility = await requestVisibilityClauses(cu.user, allTypes);
      const [requestRows, purposeRows, historyRows, decidedRows] = await Promise.all([
        db
          .select({
            id: requests.id,
            requestNumber: requests.requestNumber,
            requestTypeId: requests.requestTypeId,
            projectId: requests.projectId,
            contractorId: requests.contractorId,
            consultantId: requests.consultantId,
            status: requests.currentStatus,
            createdBy: requests.createdBy,
            createdAt: requests.createdAt,
            updatedAt: requests.updatedAt,
            revisionId: requestRevisions.id,
            stepId: requestRevisions.currentStepId,
            approvalCode: requestRevisions.approvalStatusCode,
            title: requestRevisions.title,
            activityName: requestRevisions.activityName,
          })
          .from(requests)
          .leftJoin(requestRevisions, eq(requests.currentRevisionId, requestRevisions.id))
          .where(and(eq(requests.is_deleted, false), inScope, ...visibility)),
        // purposes of each request's current revision: who a step is waiting on depends on them
        db
          .select({ revisionId: requestPurposes.revisionId, purposeId: requestPurposes.purposeId })
          .from(requestPurposes)
          .innerJoin(requests, eq(requests.currentRevisionId, requestPurposes.revisionId))
          .where(and(eq(requests.is_deleted, false), inScope)),
        // when each request last moved: the newest entry in its current revision's history
        db
          .select({ revisionId: requestStatusHistory.revisionId, changedAt: sql<string>`max(${requestStatusHistory.changedAt})` })
          .from(requestStatusHistory)
          .innerJoin(requests, eq(requests.currentRevisionId, requestStatusHistory.revisionId))
          .where(and(eq(requests.is_deleted, false), inScope))
          .groupBy(requestStatusHistory.revisionId),
        // every decision on every revision, so a first submission counts even after it was resubmitted
        db
          .select({
            requestId: requestRevisions.requestId,
            revisionNo: requestRevisions.revisionNo,
            code: requestRevisions.approvalStatusCode,
            approvedAt: requestRevisions.approvedAt,
          })
          .from(requestRevisions)
          .innerJoin(requests, eq(requests.id, requestRevisions.requestId))
          .where(and(eq(requests.is_deleted, false), inScope, isNotNull(requestRevisions.approvalStatusCode))),
      ]);

      const purposesByRevision = new Map<string, Set<string>>();
      for (const p of purposeRows) {
        const set = purposesByRevision.get(p.revisionId) ?? new Set<string>();
        set.add(p.purposeId);
        purposesByRevision.set(p.revisionId, set);
      }
      const movedAt = new Map(historyRows.map((h) => [h.revisionId, parseStamp(h.changedAt)]));
      const noPurposes: ReadonlySet<string> = new Set();

      const typeRows = new Map<string, HomeRequestTypeRow>();
      const typeRowOf = (typeId: string): HomeRequestTypeRow => {
        const existing = typeRows.get(typeId);
        if (existing) return existing;
        const type = typeById.get(typeId);
        const row: HomeRequestTypeRow = {
          code: type?.code ?? "?",
          nameEn: type?.name_english ?? "",
          nameAr: type?.name_arabic ?? "",
          tab: type ? tabOf(type) : "request",
          open: 0,
          mine: 0,
          stalled: 0,
          closedInPeriod: 0,
          projects: [],
        };
        typeRows.set(typeId, row);
        return row;
      };

      const perProject = new Map(ids.map((id) => [id, { open: 0, stalled: 0 }]));
      const stepCounts = new Map<string, number>();
      const actions: HomeActionRequest[] = [];
      const totals = { open: 0, mine: 0, stalled: 0, closedInPeriod: 0, returned: 0 };

      for (const r of requestRows) {
        const typeRow = typeRowOf(r.requestTypeId);
        if (DONE_REQUEST_STATUSES.has(r.status)) {
          if ((parseStamp(r.updatedAt) ?? 0) >= sinceMs) {
            typeRow.closedInPeriod += 1;
            totals.closedInPeriod += 1;
          }
          continue;
        }

        const step = r.stepId != null ? stepById.get(r.stepId) : undefined;
        const withAuthor = AUTHOR_REQUEST_STATUSES.has(r.status) || step?.stepName === "Draft";
        const waitingSince = (r.revisionId ? movedAt.get(r.revisionId) : null) ?? parseStamp(r.updatedAt) ?? parseStamp(r.createdAt);
        const age = ageDays(waitingSince);
        // a draft has not entered the workflow, so it cannot be stuck in it
        const stalled = !withAuthor && age > REQUEST_STALLED_DAYS;
        const mine = withAuthor
          ? r.createdBy === me
          : !!step && myMembers.some((tm) =>
              memberIsNotifiedAtStep(tm, r, step, (r.revisionId && purposesByRevision.get(r.revisionId)) || noPurposes, positionByTitle));

        totals.open += 1;
        typeRow.open += 1;
        const proj = perProject.get(r.projectId);
        if (proj) proj.open += 1;
        const inProject = typeRow.projects.find((p) => p.id === r.projectId);
        if (inProject) inProject.open += 1;
        else typeRow.projects.push({ id: r.projectId, name: projectName.get(r.projectId) ?? "", open: 1 });
        if (stalled) {
          totals.stalled += 1;
          typeRow.stalled += 1;
          if (proj) proj.stalled += 1;
        }
        if (r.approvalCode === "C" || r.approvalCode === "D") totals.returned += 1;

        const stepName = step?.stepName ?? r.status ?? "";
        if (stepName) stepCounts.set(stepName, (stepCounts.get(stepName) ?? 0) + 1);

        if (mine) {
          totals.mine += 1;
          typeRow.mine += 1;
          actions.push({
            id: r.id,
            requestNumber: r.requestNumber,
            typeCode: typeRow.code,
            title: r.title || r.activityName || "",
            projectId: r.projectId,
            projectName: projectName.get(r.projectId) ?? "",
            stepName,
            status: r.status,
            ageDays: age,
            stalled,
          });
        }
      }

      const visibleRequestIds = new Set(requestRows.map((r) => r.id));
      const outcomeCounts = new Map<string, number>();
      const firstPass = { decided: 0, approved: 0 };
      for (const d of decidedRows) {
        if (!d.code || !visibleRequestIds.has(d.requestId)) continue;
        if ((parseStamp(d.approvedAt) ?? 0) < sinceMs) continue;
        outcomeCounts.set(d.code, (outcomeCounts.get(d.code) ?? 0) + 1);
        if (d.revisionNo === 0) {
          firstPass.decided += 1;
          if (d.code === "A" || d.code === "B") firstPass.approved += 1;
        }
      }
      const codeLabel = new Map(codeRows.map((c) => [c.code, c.label]));
      const codeOrder = new Map(codeRows.map((c, i) => [c.code, i]));

      // ---- Payments, permits, snags, warehouse ----
      const none = ids.length === 0;
      const [orders, bills, fines, subCerts, permits, snagRows, issueRows, lowStockCounts] = await Promise.all([
        none ? [] : db.select().from(paymentOrders).where(inArray(paymentOrders.projectId, ids)),
        none ? [] : db.select().from(paymentBillRequests).where(inArray(paymentBillRequests.projectId, ids)),
        none ? [] : db.select().from(paymentFines).where(inArray(paymentFines.projectId, ids)),
        none ? [] : db.select().from(paymentSubcontractorCertificates).where(inArray(paymentSubcontractorCertificates.projectId, ids)),
        none ? [] : db.select().from(permitTransactions).where(inArray(permitTransactions.projectId, ids)),
        none
          ? []
          : db
              .select({ projectId: snagLists.projectId, count: sql<number>`cast(count(${snagItems.id}) as integer)` })
              .from(snagItems)
              .innerJoin(snagLists, eq(snagLists.id, snagItems.snagListId))
              .where(and(
                inArray(snagLists.projectId, ids),
                sql`${snagItems.status} <> 'closed'`,
                // the contractor does not see a list the consultant is still drafting
                cu.user.organizationSectorType === "Contractor" ? sql`${snagLists.status} <> 'draft'` : sql`true`,
              ))
              .groupBy(snagLists.projectId),
        none
          ? []
          : db
              .select({ projectId: materialIssues.projectId, count: sql<number>`cast(count(${materialIssues.id}) as integer)` })
              .from(materialIssues)
              .where(and(inArray(materialIssues.projectId, ids), eq(materialIssues.status, "pending_approval")))
              .groupBy(materialIssues.projectId),
        // stock balances are worked out per project, so they are only fetched for the role that is shown them
        kpiSet === "procurement" ? Promise.all(ids.map(async (id) => (await storage.getLowStockMaterials(id)).length)) : [],
      ]);

      const late = DECISION_OVERDUE_DAYS;
      const stampAge = (d: Date | string | null | undefined) => (d ? ageDays(parseStamp(d)) : 0);
      // The same four kinds of decision the payments follow-up dashboard counts as late
      const delayedByProject = new Map<string, number>();
      const bump = (projectId: string) => delayedByProject.set(projectId, (delayedByProject.get(projectId) ?? 0) + 1);
      for (const o of orders) {
        if (o.status === "pending_approval" && stampAge(o.submittedAt) > late) bump(o.projectId);
        else if (o.status === "requested" && stampAge(o.createdAt) > late) bump(o.projectId);
        else if (o.status === "request_approved" && stampAge(o.updatedAt) > late) bump(o.projectId);
      }
      for (const c of subCerts) if (c.status === "submitted" && stampAge(c.submittedAt) > late) bump(c.projectId);
      for (const f of fines) if (f.status === "waiver_requested" && stampAge(f.updatedAt) > late) bump(f.projectId);

      const sum = <T,>(rows: T[], pick: (row: T) => unknown) => rows.reduce((s, row) => s + n(pick(row)), 0);
      const pendingOrders = orders.filter((o) => o.status === "pending_approval");
      const approvedOrders = orders.filter((o) => o.status === "approved");
      const paidInPeriod = orders.filter((o) => {
        if (o.status !== "paid") return false;
        if (o.paidDate) return o.paidDate >= sinceIso;
        return (parseStamp(o.paidAt) ?? 0) >= sinceMs;
      });
      const openBills = bills.filter((b) => (OPEN_BILL_REQUEST as readonly string[]).includes(b.status));
      const openFines = fines.filter((f) => (OPEN_FINE as readonly string[]).includes(f.status));

      const permitTotals = { open: 0, expired: 0, expiring: 0, overdue: 0 };
      const permitsByProject = new Map(ids.map((id) => [id, { expired: 0, expiring: 0, overdue: 0 }]));
      for (const t of permits) {
        if ((OPEN_PERMIT as readonly string[]).includes(t.status)) permitTotals.open += 1;
        const why = permitAttention(t, todayIso);
        if (why !== "expired" && why !== "expiring" && why !== "overdue") continue;
        permitTotals[why] += 1;
        const row = permitsByProject.get(t.projectId);
        if (row) row[why] += 1;
      }

      const snagsByProject = new Map(snagRows.map((r) => [r.projectId, r.count]));
      const lowStock = lowStockCounts.reduce((s, c) => s + c, 0);
      const pendingIssues = issueRows.reduce((s, r) => s + r.count, 0);

      // ---- Health, per project ----
      const health = { healthy: 0, at_risk: 0, critical: 0, inactive: 0 };
      const scheduleTotals = { judged: 0, behind: 0, critical: 0, planned: 0, actual: 0 };
      const budgetTotals = { estimated: 0, actual: 0, over: 0, atRisk: 0, judged: 0 };

      const projectRows: HomeProjectRow[] = scope.map((p) => {
        const schedule = scheduleHealth(p, todayIso);
        const budget = viewer.canSeeBudget ? budgetHealth(p) : null;
        const req = perProject.get(p.id) ?? { open: 0, stalled: 0 };
        const permit = permitsByProject.get(p.id) ?? { expired: 0, expiring: 0, overdue: 0 };
        const delayed = viewer.canSeePayments ? delayedByProject.get(p.id) ?? 0 : 0;
        const judged = !(UNJUDGED_PROJECT_STATUSES as readonly string[]).includes(p.status);

        const reasons: HealthReason[] = [];
        if (judged) {
          if (schedule.state !== "healthy") {
            reasons.push(schedule.daysPastEnd > 0
              ? { code: "past_end_date", state: "critical", value: schedule.daysPastEnd }
              : { code: "schedule_behind", state: schedule.state, value: schedule.gap });
          }
          if (budget && budget.state === "critical") reasons.push({ code: "over_budget", state: "critical", value: Math.round((budget.spentPct - 100) * 10) / 10 });
          else if (budget && budget.state === "at_risk") reasons.push({ code: "spend_ahead", state: "at_risk", value: budget.gap });
          if (permit.expired > 0) reasons.push({ code: "permit_expired", state: "critical", value: permit.expired });
          if (permit.overdue > 0) reasons.push({ code: "permit_overdue", state: "at_risk", value: permit.overdue });
          if (delayed > 0) reasons.push({ code: "decisions_delayed", state: "at_risk", value: delayed });
          if (req.stalled > 0) reasons.push({ code: "requests_stalled", state: "at_risk", value: req.stalled });
        }
        const state: ProjectHealthState = judged ? worstOf(...reasons.map((r) => r.state)) : "inactive";
        health[state] += 1;

        if (judged) {
          scheduleTotals.judged += 1;
          scheduleTotals.planned += schedule.planned;
          scheduleTotals.actual += schedule.actual;
          if (schedule.state !== "healthy") scheduleTotals.behind += 1;
          if (schedule.state === "critical") scheduleTotals.critical += 1;
          if (budget) {
            budgetTotals.judged += 1;
            budgetTotals.estimated += budget.estimated;
            budgetTotals.actual += budget.actual;
            if (budget.state === "critical") budgetTotals.over += 1;
            if (budget.state === "at_risk") budgetTotals.atRisk += 1;
          }
        }

        return {
          id: p.id,
          name: p.name,
          status: p.status,
          startDate: p.startDate,
          endDate: p.endDate,
          health: state,
          // worst first, so the first reason is the one that set the colour
          reasons: reasons.sort((a, b) => (a.state === b.state ? 0 : a.state === "critical" ? -1 : 1)),
          schedule,
          budget,
          openRequests: req.open,
          stalledRequests: req.stalled,
          pendingPaymentsAmount: viewer.canSeePayments
            ? sum(pendingOrders.filter((o) => o.projectId === p.id), (o) => o.amount)
            : null,
          permitsAttention: permit.expired + permit.expiring + permit.overdue,
          openSnags: snagsByProject.get(p.id) ?? 0,
        };
      });

      const rank: Record<ProjectHealthState, number> = { critical: 0, at_risk: 1, healthy: 2, inactive: 3 };
      projectRows.sort((a, b) => rank[a.health] - rank[b.health] || b.schedule.gap - a.schedule.gap || a.name.localeCompare(b.name));

      const round1 = (v: number) => Math.round(v * 10) / 10;
      const summary: HomeSummary = {
        generatedAt: now.toISOString(),
        periodDays,
        viewer,
        filters,
        scopeCount: scope.length,
        health,
        schedule: {
          judged: scheduleTotals.judged,
          behind: scheduleTotals.behind,
          critical: scheduleTotals.critical,
          avgPlanned: scheduleTotals.judged ? round1(scheduleTotals.planned / scheduleTotals.judged) : 0,
          avgActual: scheduleTotals.judged ? round1(scheduleTotals.actual / scheduleTotals.judged) : 0,
        },
        budget: viewer.canSeeBudget
          ? {
              estimated: budgetTotals.estimated,
              actual: budgetTotals.actual,
              spentPct: budgetTotals.estimated > 0 ? round1((budgetTotals.actual / budgetTotals.estimated) * 100) : 0,
              over: budgetTotals.over,
              atRisk: budgetTotals.atRisk,
              judged: budgetTotals.judged,
            }
          : null,
        // the table is withheld on the server, not merely hidden by the page
        projects: viewer.canSeeProjectTable ? projectRows : [],
        requests: {
          ...totals,
          byType: Array.from(typeRows.values())
            .filter((t) => t.open > 0 || t.closedInPeriod > 0)
            .sort((a, b) => b.open - a.open || b.closedInPeriod - a.closedInPeriod || a.code.localeCompare(b.code)),
          byStep: Array.from(stepCounts, ([stepName, count]) => ({ stepName, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, STEPS_LIMIT),
          outcomes: Array.from(outcomeCounts, ([code, count]) => ({ code, label: codeLabel.get(code) ?? code, count }))
            .sort((a, b) => (codeOrder.get(a.code) ?? 99) - (codeOrder.get(b.code) ?? 99) || a.code.localeCompare(b.code)),
          firstPass,
          actions: actions.sort((a, b) => b.ageDays - a.ageDays).slice(0, ACTIONS_LIMIT),
        },
        payments: viewer.canSeePayments
          ? {
              pendingApprovalAmount: sum(pendingOrders, (o) => o.amount),
              pendingApprovalCount: pendingOrders.length,
              approvedUnpaidAmount: sum(approvedOrders, (o) => o.amount),
              approvedUnpaidCount: approvedOrders.length,
              paidInPeriodAmount: sum(paidInPeriod, (o) => o.amount),
              paidInPeriodCount: paidInPeriod.length,
              openBillRequests: openBills.length,
              overdueBillRequests: openBills.filter((b) => !!b.dueDate && b.dueDate < todayIso).length,
              delayedDecisions: Array.from(delayedByProject.values()).reduce((s, c) => s + c, 0),
              openFinesCount: openFines.length,
              openFinesAmount: openFines.reduce((s, f) => s + Math.max(0, n(f.amount) - n(f.paidAmount)), 0),
            }
          : null,
        permits: permitTotals,
        snags: { open: snagRows.reduce((s, r) => s + r.count, 0) },
        warehouse: { lowStock, pendingIssues },
      };

      res.json(summary);
    } catch (error) {
      console.error("[Home] summary error:", error);
      deps.handleError(res, error);
    }
  });
}
