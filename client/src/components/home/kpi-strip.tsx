// The first row: four figures chosen by who is looking. For a manager they answer the four questions
// the page exists for (schedule, budget, risk, what needs me); other roles get what they act on.
import type { LucideIcon } from "lucide-react";
import { Banknote, CalendarClock, ClipboardCheck, ClipboardList, FileCheck2, Hourglass, Inbox, PackageOpen, ShieldAlert, TriangleAlert, Undo2, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { num } from "@/lib/i18n-format";
import { DECISION_OVERDUE_DAYS } from "@shared/payments";
import { REQUEST_STALLED_DAYS, type HealthState, type HomeSummary } from "@shared/home";
import { FOCUS, HEALTH_META, compact, pct } from "./parts";

interface Tile {
  key: string;
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  href?: string;
  /** Shown as an icon beside the figure; the sub-line says why in words. */
  tone?: HealthState;
}

export interface MineCounts {
  requests: number;
  payments: number;
  permits: number;
}

interface Props {
  summary: HomeSummary;
  mine: MineCounts;
  /** Goods received but not invoiced, for the purchasing side; null while it loads or when unavailable. */
  grni: { count: number; amount: number } | null;
  /** Query string carrying the page's project filter into the pages a tile opens. */
  projectId: string;
}

export function KpiStripSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-[7.5rem] rounded-[1.5rem]" />
      ))}
    </div>
  );
}

export function KpiStrip({ summary, mine, grni, projectId }: Props) {
  const { t } = useTranslation("home");
  const s = summary;
  const sar = (v: number) => t("kpi.sar", { amount: compact(v) });
  const paymentsHref = `/payments?tab=orders${projectId ? `&project=${projectId}` : ""}`;
  const projectHref = (section: string) => (projectId ? `/projects/${projectId}/${section}` : "/projects");

  const mineTotal = mine.requests + mine.payments + mine.permits;
  const tiles: Record<string, Tile> = {
    mine: {
      key: "mine",
      icon: Inbox,
      label: t("kpi.mine"),
      value: num(mineTotal),
      sub: mineTotal ? t("kpi.mine_sub", mine as unknown as Record<string, number>) : t("kpi.mine_none"),
      href: "#home-actions",
    },
    schedule: {
      key: "schedule",
      icon: CalendarClock,
      label: t("kpi.schedule"),
      value: t("kpi.schedule_value", { actual: pct(s.schedule.avgActual), planned: pct(s.schedule.avgPlanned) }),
      sub: s.schedule.behind ? t("kpi.schedule_sub_behind", { count: s.schedule.behind }) : t("kpi.schedule_sub_ok"),
      tone: s.schedule.critical ? "critical" : s.schedule.behind ? "at_risk" : "healthy",
      href: "#home-projects",
    },
    risk: {
      key: "risk",
      icon: ShieldAlert,
      label: t("kpi.risk"),
      value: num(s.health.critical + s.health.at_risk),
      sub: s.health.critical + s.health.at_risk
        ? t("kpi.risk_sub", { critical: s.health.critical, at_risk: s.health.at_risk, total: s.scopeCount })
        : t("kpi.risk_none"),
      tone: s.health.critical ? "critical" : s.health.at_risk ? "at_risk" : "healthy",
      href: "#home-health",
    },
    openRequests: {
      key: "open-requests",
      icon: ClipboardList,
      label: t("kpi.open_requests"),
      value: num(s.requests.open),
      sub: t("kpi.open_requests_sub", { days: REQUEST_STALLED_DAYS, count: s.requests.stalled }),
      tone: s.requests.stalled ? "at_risk" : undefined,
      href: "#home-forms",
    },
    stalled: {
      key: "stalled",
      icon: Hourglass,
      label: t("kpi.stalled"),
      value: num(s.requests.stalled),
      sub: t("kpi.stalled_sub", { days: REQUEST_STALLED_DAYS }),
      tone: s.requests.stalled ? "at_risk" : undefined,
      href: "#home-forms",
    },
    closed: {
      key: "closed",
      icon: FileCheck2,
      label: t("kpi.closed"),
      value: num(s.requests.closedInPeriod),
      sub: t("kpi.closed_sub", { days: s.periodDays }),
      href: "#home-forms",
    },
    returned: {
      key: "returned",
      icon: Undo2,
      label: t("kpi.returned"),
      value: num(s.requests.returned),
      sub: t("kpi.returned_sub"),
      href: "#home-forms",
    },
    snags: {
      key: "snags",
      icon: TriangleAlert,
      label: t("kpi.snags"),
      value: num(s.snags.open),
      sub: t("kpi.snags_sub"),
      href: projectHref("snag-list"),
    },
    lowStock: {
      key: "low-stock",
      icon: PackageOpen,
      label: t("kpi.low_stock"),
      value: num(s.warehouse.lowStock),
      sub: t("kpi.low_stock_sub"),
      tone: s.warehouse.lowStock ? "at_risk" : undefined,
      href: projectHref("warehouse"),
    },
    pendingIssues: {
      key: "pending-issues",
      icon: ClipboardCheck,
      label: t("kpi.pending_issues"),
      value: num(s.warehouse.pendingIssues),
      sub: t("kpi.pending_issues_sub"),
      href: projectHref("warehouse"),
    },
  };

  if (s.budget) {
    tiles.budget = {
      key: "budget",
      icon: Wallet,
      label: t("kpi.budget"),
      value: t("kpi.budget_value", { pct: pct(s.budget.spentPct) }),
      sub: t(s.budget.over ? "kpi.budget_sub_over" : "kpi.budget_sub_ok", {
        actual: compact(s.budget.actual),
        estimated: compact(s.budget.estimated),
        count: s.budget.over,
      }),
      tone: s.budget.over ? "critical" : s.budget.atRisk ? "at_risk" : "healthy",
      href: "#home-projects",
    };
  }
  if (s.payments) {
    tiles.pendingApproval = {
      key: "pending-approval",
      icon: Hourglass,
      label: t("kpi.pending_approval"),
      value: sar(s.payments.pendingApprovalAmount),
      sub: t("kpi.pending_approval_sub", { count: s.payments.pendingApprovalCount, delayed: s.payments.delayedDecisions, days: DECISION_OVERDUE_DAYS }),
      tone: s.payments.delayedDecisions ? "at_risk" : undefined,
      href: paymentsHref,
    };
    tiles.approvedUnpaid = {
      key: "approved-unpaid",
      icon: Wallet,
      label: t("kpi.approved_unpaid"),
      value: sar(s.payments.approvedUnpaidAmount),
      sub: t("kpi.approved_unpaid_sub", { count: s.payments.approvedUnpaidCount }),
      href: paymentsHref,
    };
    tiles.paid = {
      key: "paid",
      icon: Banknote,
      label: t("kpi.paid"),
      value: sar(s.payments.paidInPeriodAmount),
      sub: t("kpi.paid_sub", { count: s.payments.paidInPeriodCount, days: s.periodDays }),
      href: paymentsHref,
    };
  }
  if (grni) {
    tiles.grni = {
      key: "grni",
      icon: PackageOpen,
      label: t("kpi.grni"),
      value: sar(grni.amount),
      sub: t("kpi.grni_sub", { count: grni.count }),
      href: "/reports",
    };
  }

  // The first four available, in the order that matters to the role. Later names are the fallbacks
  // for a figure the viewer may not see (a consultant's manager has no budget tile, for instance).
  const order: Record<HomeSummary["viewer"]["kpiSet"], string[]> = {
    manager: ["schedule", "budget", "risk", "mine", "openRequests"],
    finance: ["mine", "pendingApproval", "approvedUnpaid", "paid", "openRequests"],
    procurement: ["mine", "lowStock", "pendingIssues", "grni", "openRequests"],
    quality: ["mine", "openRequests", "returned", "snags"],
    general: ["mine", "openRequests", "stalled", "closed"],
  };
  const shown = order[s.viewer.kpiSet].map((k) => tiles[k]).filter(Boolean).slice(0, 4);

  return (
    <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4" aria-label={t("kpi.label")}>
      {shown.map((tile) => {
        const tone = tile.tone ? HEALTH_META[tile.tone] : null;
        const body = (
          <Card className="h-full min-h-[7.5rem] p-4 flex flex-col gap-1.5 transition-colors group-hover:border-primary/50" data-testid={`home-kpi-${tile.key}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-bold text-muted-foreground/80 dark:text-foreground/70 leading-snug">{tile.label}</p>
              <tile.icon className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
            </div>
            <p className="flex items-center gap-2 text-xl sm:text-2xl font-bold font-display tabular-nums text-foreground leading-tight">
              {tone && tile.tone !== "healthy" && (
                <>
                  <tone.icon className={cn("w-5 h-5 shrink-0", tone.ink)} aria-hidden="true" />
                  <span className="sr-only">{t(`health.${tile.tone}`)}: </span>
                </>
              )}
              <span className="min-w-0 break-words">{tile.value}</span>
            </p>
            <p className="text-xs text-muted-foreground/80 dark:text-foreground/70 leading-snug line-clamp-3 sm:line-clamp-2">{tile.sub}</p>
          </Card>
        );
        return (
          <li key={tile.key} className="min-w-0">
            {tile.href?.startsWith("#") ? (
              <a href={tile.href} className={cn("group block h-full rounded-[1.5rem]", FOCUS)}>{body}</a>
            ) : tile.href ? (
              <Link href={tile.href} className={cn("group block h-full rounded-[1.5rem]", FOCUS)}>{body}</Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
