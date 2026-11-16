// الصفحة الرئيسية (Project Pulse) — shared thresholds, the health rules and the summary's shape.
// Used by the server when it builds the summary and by the page when it explains a status, so the two
// cannot disagree about why a project is amber or red.

// ---- Thresholds. Adopted on trial; change them here and both sides follow. ----
/** Planned-minus-actual progress, in points, up to which a project is on schedule. */
export const SCHEDULE_AT_RISK_GAP = 5;
/** Beyond this many points behind, the schedule is critical. */
export const SCHEDULE_CRITICAL_GAP = 15;
/** Spend share running this many points ahead of progress puts the budget at risk. */
export const BUDGET_AT_RISK_GAP = 10;
/** A request sitting at one workflow step longer than this is stalled. */
export const REQUEST_STALLED_DAYS = 7;

export const HOME_PERIODS = [10, 30, 90, 180, 365] as const;
export const DEFAULT_HOME_PERIOD = 10;
export const MAX_HOME_PERIOD = 366;

export const HEALTH_STATES = ["healthy", "at_risk", "critical"] as const;
export type HealthState = (typeof HEALTH_STATES)[number];
/** A project that is finished or on hold is listed but not judged. */
export type ProjectHealthState = HealthState | "inactive";

const RANK: Record<HealthState, number> = { healthy: 0, at_risk: 1, critical: 2 };
export const worstOf = (...states: (HealthState | null | undefined)[]): HealthState =>
  states.reduce<HealthState>((worst, s) => (s && RANK[s] > RANK[worst] ? s : worst), "healthy");

export const HEALTH_REASONS = [
  "past_end_date",
  "schedule_behind",
  "over_budget",
  "spend_ahead",
  "permit_expired",
  "permit_overdue",
  "decisions_delayed",
  "requests_stalled",
] as const;
export type HealthReasonCode = (typeof HEALTH_REASONS)[number];
export interface HealthReason {
  code: HealthReasonCode;
  state: Exclude<HealthState, "healthy">;
  /** The figure behind the reason: points behind, percent over, or a count. */
  value: number;
}

const DAY_MS = 86_400_000;
const dayOf = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Progress the calendar says a project should have reached today, 0–100, on a straight line from start to end. */
export function plannedProgress(startDate: string, endDate: string, todayIso: string): number {
  const start = dayOf(startDate);
  const end = dayOf(endDate);
  const now = dayOf(todayIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return now >= end ? 100 : 0;
  return round1(Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)));
}

export interface ScheduleHealth {
  planned: number;
  actual: number;
  /** Points behind plan; negative when ahead. */
  gap: number;
  daysPastEnd: number;
  state: HealthState;
}

export function scheduleHealth(p: { startDate: string; endDate: string; progress: number }, todayIso: string): ScheduleHealth {
  const planned = plannedProgress(p.startDate, p.endDate, todayIso);
  const actual = Math.min(100, Math.max(0, Number(p.progress) || 0));
  const gap = round1(planned - actual);
  const daysPastEnd = Math.max(0, Math.round((dayOf(todayIso) - dayOf(p.endDate)) / DAY_MS));
  let state: HealthState = "healthy";
  if (actual < 100) {
    if (daysPastEnd > 0 || gap > SCHEDULE_CRITICAL_GAP) state = "critical";
    else if (gap > SCHEDULE_AT_RISK_GAP) state = "at_risk";
  }
  return { planned, actual, gap, daysPastEnd, state };
}

export interface BudgetHealth {
  estimated: number;
  actual: number;
  /** Actual cost as a share of the estimate, in percent. */
  spentPct: number;
  /** Spend share minus progress; positive when money is going out faster than work is done. */
  gap: number;
  state: HealthState;
}

/** Null when the project has no estimate to measure against. */
export function budgetHealth(p: { estimatedCost: unknown; actualCost: unknown; progress: number }): BudgetHealth | null {
  const estimated = Number(p.estimatedCost) || 0;
  const actual = Number(p.actualCost) || 0;
  if (estimated <= 0) return null;
  const spentPct = round1((actual / estimated) * 100);
  const gap = round1(spentPct - Math.min(100, Math.max(0, Number(p.progress) || 0)));
  let state: HealthState = "healthy";
  // a cent of rounding is not an overrun
  if (actual > estimated + 0.005) state = "critical";
  else if (gap > BUDGET_AT_RISK_GAP) state = "at_risk";
  return { estimated, actual, spentPct, gap, state };
}

/** Projects in these statuses are listed without a health verdict. */
export const UNJUDGED_PROJECT_STATUSES = ["completed", "on-hold"] as const;

// ---- The summary ----
export type HomeKpiSet = "manager" | "finance" | "procurement" | "quality" | "general";

export interface HomeViewer {
  kpiSet: HomeKpiSet;
  /** Budget and payment amounts. Off for the consultant's side and for people who neither manage nor account. */
  canSeeBudget: boolean;
  canSeePayments: boolean;
  /** The per-project health table. Off for view-only accounts. */
  canSeeProjectTable: boolean;
}

export interface HomeProjectRow {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  health: ProjectHealthState;
  reasons: HealthReason[];
  schedule: ScheduleHealth;
  /** Null when the viewer may not see budgets, or the project has no estimate. */
  budget: BudgetHealth | null;
  openRequests: number;
  stalledRequests: number;
  /** Null when the viewer may not see payment amounts. */
  pendingPaymentsAmount: number | null;
  permitsAttention: number;
  openSnags: number;
}

/** The tab of the project's request page a type is listed under. */
export type RequestTab = "wir" | "dsr" | "sd" | "asd" | "approvals" | "request";

export interface HomeRequestTypeRow {
  code: string;
  nameEn: string;
  nameAr: string;
  tab: RequestTab;
  open: number;
  mine: number;
  stalled: number;
  closedInPeriod: number;
  /** Where the open ones are, so a count can lead to the right project's request page. */
  projects: { id: string; name: string; open: number }[];
}

export interface HomeActionRequest {
  id: string;
  requestNumber: string;
  typeCode: string;
  title: string;
  projectId: string;
  projectName: string;
  stepName: string;
  status: string;
  ageDays: number;
  stalled: boolean;
}

export interface HomeSummary {
  generatedAt: string;
  periodDays: number;
  viewer: HomeViewer;
  filters: {
    projects: { id: string; name: string; status: string }[];
    statuses: string[];
  };
  /** Projects left in scope after the filters. */
  scopeCount: number;
  health: { healthy: number; at_risk: number; critical: number; inactive: number };
  schedule: { judged: number; behind: number; critical: number; avgPlanned: number; avgActual: number };
  /** Null when the viewer may not see budgets. */
  budget: { estimated: number; actual: number; spentPct: number; over: number; atRisk: number; judged: number } | null;
  projects: HomeProjectRow[];
  requests: {
    open: number;
    mine: number;
    stalled: number;
    closedInPeriod: number;
    /** Open requests sent back for revision (C) or rejected (D). */
    returned: number;
    byType: HomeRequestTypeRow[];
    /** Open requests by the workflow step they are waiting at, busiest first. */
    byStep: { stepName: string; count: number }[];
    /** Decisions recorded in the period, by approval code. */
    outcomes: { code: string; label: string; count: number }[];
    /** First submissions decided in the period, and how many were approved (A or B). */
    firstPass: { decided: number; approved: number };
    /** What is waiting on the viewer, longest-waiting first, capped. */
    actions: HomeActionRequest[];
  };
  /** Null when the viewer may not see payment amounts. */
  payments: {
    pendingApprovalAmount: number;
    pendingApprovalCount: number;
    approvedUnpaidAmount: number;
    approvedUnpaidCount: number;
    paidInPeriodAmount: number;
    paidInPeriodCount: number;
    openBillRequests: number;
    overdueBillRequests: number;
    delayedDecisions: number;
    openFinesCount: number;
    openFinesAmount: number;
  } | null;
  permits: { open: number; expired: number; expiring: number; overdue: number };
  snags: { open: number };
  warehouse: { lowStock: number; pendingIssues: number };
}
