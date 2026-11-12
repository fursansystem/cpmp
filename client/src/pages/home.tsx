// Project Pulse — the home page. Two questions, answered on the first screen: what is waiting on me,
// and how are my projects doing. Navigation lives in the sidebar, so nothing here is a menu: every
// figure opens the list behind it.
//
// The counting happens on the server (/api/home/summary); this file lays the answer out on a
// 12-column grid and keeps the three filters in the URL, so a filtered view can be shared or reloaded.
import { useEffect, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation, useSearch } from "wouter";
import { FolderKanban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/i18n-format";
import { localizedName } from "@/lib/localized";
import { DEFAULT_HOME_PERIOD, HOME_PERIODS, type HomeSummary } from "@shared/home";
import type { PaymentsReport } from "@shared/payments";
import type { Notification } from "@shared/schema";
import { ActivityPanel } from "@/components/home/activity-panel";
import { FormsPanel } from "@/components/home/forms-panel";
import { HealthCard } from "@/components/home/health-card";
import { KpiStrip, KpiStripSkeleton } from "@/components/home/kpi-strip";
import { MyActions, type InboxItem, type PermitTask } from "@/components/home/my-actions";
import { EmptyNote, SectionError } from "@/components/home/parts";
import { ProjectsTable } from "@/components/home/projects-table";
import { CashPanel, StepsPanel } from "@/components/home/trends";

const ACTIVITY_ROWS = 8;

function PanelSkeleton({ className, height }: { className?: string; height: string }) {
  return <Skeleton className={`rounded-[1.5rem] ${height} ${className ?? ""}`} />;
}

export default function Home() {
  const { t } = useTranslation("home");
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();

  // ---- Filters, read from and written to the URL ----
  const filters = useMemo(() => {
    const params = new URLSearchParams(search);
    const days = parseInt(params.get("days") ?? "", 10);
    return {
      projectId: params.get("project") || "all",
      status: params.get("status") || "all",
      days: (HOME_PERIODS as readonly number[]).includes(days) ? days : DEFAULT_HOME_PERIOD,
    };
  }, [search]);

  const setFilter = (patch: Partial<typeof filters>) => {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams();
    if (next.projectId !== "all") params.set("project", next.projectId);
    if (next.status !== "all") params.set("status", next.status);
    if (next.days !== DEFAULT_HOME_PERIOD) params.set("days", String(next.days));
    const qs = params.toString();
    navigate(qs ? `/?${qs}` : "/", { replace: true });
  };
  const filtered = filters.projectId !== "all" || filters.status !== "all" || filters.days !== DEFAULT_HOME_PERIOD;

  // ---- The summary: every section but the two inboxes and the feed reads from it ----
  const summaryQuery = useQuery<HomeSummary>({
    queryKey: ["/api/home/summary", { projectId: filters.projectId, status: filters.status, days: filters.days }],
    // figures stay on screen while a filter change loads, so the layout never jumps
    placeholderData: keepPreviousData,
    meta: { persist: false },
  });
  const summary = summaryQuery.data;

  // A project that was deleted, or a link from someone who can see more: drop the filter rather than show an error
  useEffect(() => {
    if (summaryQuery.isError && filters.projectId !== "all" && /^404/.test((summaryQuery.error as Error)?.message ?? "")) {
      setFilter({ projectId: "all" });
    }
  }, [summaryQuery.isError, summaryQuery.error, filters.projectId]);

  // The same scope for the modules' own inboxes, so one filter moves the whole page
  const scopedIds = useMemo(() => {
    if (!summary || !filtered) return "";
    if (filters.projectId === "all" && filters.status === "all") return "";
    return summary.filters.projects
      .filter((p) => (filters.projectId === "all" || p.id === filters.projectId) && (filters.status === "all" || p.status === filters.status))
      .map((p) => p.id)
      .join(",") || "none";
  }, [summary, filtered, filters.projectId, filters.status]);
  const scopeParams = scopedIds ? { projectIds: scopedIds } : {};

  const inboxQuery = useQuery<{ items: InboxItem[] }>({
    queryKey: ["/api/payments/inbox", scopeParams],
    enabled: !!summary,
    meta: { persist: false },
  });
  const tasksQuery = useQuery<{ steps: PermitTask[] }>({
    queryKey: ["/api/permits/my-tasks", scopeParams],
    enabled: !!summary,
    meta: { persist: false },
  });
  const activityQuery = useQuery<Notification[]>({
    queryKey: ["/api/notifications", { limit: 30 }],
    meta: { persist: false },
  });
  // Goods received but not invoiced is worked out by the payments reports; only the purchasing side shows it
  const wantsGrni = summary?.viewer.kpiSet === "procurement" && summary.viewer.canSeePayments;
  const reportQuery = useQuery<PaymentsReport>({
    queryKey: ["/api/payments/reports", filters.projectId !== "all" ? { projectId: filters.projectId } : {}],
    enabled: !!wantsGrni,
    meta: { persist: false },
  });

  const activity = useMemo(() => {
    const rows = activityQuery.data ?? [];
    const inScope = filters.projectId === "all" ? rows : rows.filter((n) => !n.projectId || n.projectId === filters.projectId);
    return inScope.slice(0, ACTIVITY_ROWS);
  }, [activityQuery.data, filters.projectId]);

  const inbox = inboxQuery.data?.items;
  const tasks = tasksQuery.data?.steps;
  const mine = {
    requests: summary?.requests.mine ?? 0,
    payments: (inbox ?? []).reduce((s, i) => s + i.count, 0),
    permits: tasks?.length ?? 0,
  };
  const grni = wantsGrni && reportQuery.data ? reportQuery.data.monitoring.goodsReceivedNotInvoiced : null;

  const firstName = localizedName(user, "");
  const projectFilter = filters.projectId !== "all" ? filters.projectId : "";

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6 space-y-5" data-testid="page-home">
      {/* ---- Title and filters ---- */}
      <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground/80 dark:text-foreground/70 mt-1">
            {firstName && <><bdi>{firstName}</bdi> · </>}{t("subtitle")}
            {summary && <span className="whitespace-nowrap"> · {t("updated", { time: timeAgo(summary.generatedAt) })}</span>}
          </p>
        </div>

        <form className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-3" aria-label={t("filters.label")} onSubmit={(e) => e.preventDefault()}>
          {summary && summary.filters.projects.length > 1 && (
            <label className="col-span-2 flex flex-col gap-1 min-w-0">
              <span className="text-xs font-bold text-muted-foreground/80 dark:text-foreground/70">{t("filters.project")}</span>
              <Select value={filters.projectId} onValueChange={(v) => setFilter({ projectId: v })}>
                <SelectTrigger className="h-11 w-full sm:w-56 bg-card" data-testid="select-project-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filters.all_projects")}</SelectItem>
                  {summary.filters.projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
          {summary && summary.filters.statuses.length > 1 && (
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-bold text-muted-foreground/80 dark:text-foreground/70">{t("filters.status")}</span>
              <Select value={filters.status} onValueChange={(v) => setFilter({ status: v })}>
                <SelectTrigger className="h-11 w-full sm:w-40 bg-card" data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filters.all_statuses")}</SelectItem>
                  {summary.filters.statuses.map((s) => (
                    <SelectItem key={s} value={s}>{t(`project_status.${s}`, { defaultValue: s })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
{(!summary || summary.filters.projects.length > 0) && (
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-bold text-muted-foreground/80 dark:text-foreground/70">{t("filters.period")}</span>
              <Select value={String(filters.days)} onValueChange={(v) => setFilter({ days: Number(v) })}>
                <SelectTrigger className="h-11 w-full sm:w-40 bg-card" data-testid="select-period-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOME_PERIODS.map((d) => (
                    <SelectItem key={d} value={String(d)}>{t("filters.last_days", { count: d })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
          {filtered && (
            <Button type="button" variant="ghost" className="col-span-2 h-11 gap-2" onClick={() => navigate("/", { replace: true })} data-testid="button-reset-filters">
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              {t("filters.reset")}
            </Button>
          )}
        </form>
      </header>

      {summaryQuery.isError && !summary ? (
        <Card className="p-5">
          <SectionError onRetry={() => summaryQuery.refetch()} />
        </Card>
      ) : !summary ? (
        // placeholders the size of what replaces them
        <div className="space-y-5" aria-busy="true">
          <KpiStripSkeleton />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <PanelSkeleton className="lg:col-span-8" height="h-80" />
            <PanelSkeleton className="lg:col-span-4" height="h-80" />
            <PanelSkeleton className="lg:col-span-12" height="h-72" />
          </div>
        </div>
      ) : summary.filters.projects.length === 0 ? (
        <Card className="p-5">
          <EmptyNote icon={FolderKanban} title={t("state.no_projects_title")} text={t("state.no_projects_text")} />
        </Card>
      ) : (
        <div className={summaryQuery.isPlaceholderData ? "space-y-5 opacity-60 transition-opacity" : "space-y-5 transition-opacity"} aria-busy={summaryQuery.isFetching}>
          <KpiStrip summary={summary} mine={mine} grni={grni} projectId={projectFilter} />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <MyActions
              className="lg:col-span-8"
              requests={{
                data: { items: summary.requests.actions, total: summary.requests.mine },
                isLoading: false,
                isError: false,
                refetch: () => summaryQuery.refetch(),
              }}
              payments={{ data: inbox, isLoading: inboxQuery.isLoading, isError: inboxQuery.isError, refetch: () => inboxQuery.refetch() }}
              permits={{ data: tasks, isLoading: tasksQuery.isLoading, isError: tasksQuery.isError, refetch: () => tasksQuery.refetch() }}
            />
            <HealthCard className="lg:col-span-4" summary={summary} />

            {summary.viewer.canSeeProjectTable && <ProjectsTable className="lg:col-span-12" summary={summary} />}

            <FormsPanel className="lg:col-span-6" summary={summary} />
            <StepsPanel className="lg:col-span-6" summary={summary} />

            <CashPanel className="lg:col-span-6" summary={summary} projectId={projectFilter} />
            <ActivityPanel
              className={summary.payments ? "lg:col-span-6" : "lg:col-span-12"}
              items={activityQuery.data ? activity : undefined}
              isLoading={activityQuery.isLoading}
              isError={activityQuery.isError}
              refetch={() => activityQuery.refetch()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
