// One row per project, worst first: its health and the reason, progress against plan, spend against
// the estimate, and what is open in each module. Every figure opens the list behind it.
import type { ReactNode } from "react";
import { FolderKanban } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { fmtDate, num } from "@/lib/i18n-format";
import type { HealthState, HomeProjectRow, HomeSummary } from "@shared/home";
import { EmptyNote, FOCUS, HealthBadge, Panel, compact, pct, useReasonText } from "./parts";

const BAR_FILL: Record<HealthState, string> = {
  healthy: "bg-slate-500 dark:bg-slate-400",
  at_risk: "bg-amber-500",
  critical: "bg-red-600 dark:bg-red-500",
};

/** Actual progress as a bar, with a tick where the calendar says it should be. */
function ScheduleBar({ row }: { row: HomeProjectRow }) {
  const { t } = useTranslation("home");
  const { actual, planned, state } = row.schedule;
  return (
    <div className="min-w-[7rem]">
      <p className="text-sm tabular-nums text-foreground">
        <span className="font-bold">{pct(actual)}</span>
        <span className="text-muted-foreground/80 dark:text-foreground/70"> / {pct(planned)}</span>
      </p>
      <div className="relative mt-1.5 h-2 rounded-full bg-muted/60" role="img" aria-label={t("table.planned_marker", { planned: pct(planned) })}>
        <div className={cn("absolute inset-y-0 start-0 rounded-full", row.health === "inactive" ? BAR_FILL.healthy : BAR_FILL[state])} style={{ width: `${actual}%` }} />
        <div className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground" style={{ insetInlineStart: `calc(${planned}% - 1px)` }} />
      </div>
    </div>
  );
}

function BudgetCell({ row }: { row: HomeProjectRow }) {
  const { t } = useTranslation("home");
  if (!row.budget) return <span className="text-sm text-muted-foreground/80 dark:text-foreground/70">{t("table.no_estimate")}</span>;
  const { spentPct, actual, estimated, state } = row.budget;
  return (
    <div className="min-w-[7rem]">
      <p className="text-sm tabular-nums text-foreground">
        <span className="font-bold">{pct(spentPct)}</span>
        <span className="text-muted-foreground/80 dark:text-foreground/70"> · {compact(actual)} / {compact(estimated)}</span>
      </p>
      <div className="mt-1.5 h-2 rounded-full bg-muted/60 overflow-hidden" aria-hidden="true">
        <div className={cn("h-full rounded-full", row.health === "inactive" ? BAR_FILL.healthy : BAR_FILL[state])} style={{ width: `${Math.min(100, spentPct)}%` }} />
      </div>
    </div>
  );
}

function Count({ href, value, note, label }: { href: string; value: ReactNode; note?: string; label: string }) {
  return (
    <Link href={href} aria-label={label} className={cn("inline-flex flex-col justify-center min-h-11 min-w-11 rounded-lg px-2 -mx-2 hover:bg-muted/50 transition-colors", FOCUS)}>
      <span className="text-sm font-bold tabular-nums text-foreground">{value}</span>
      {note && <span className="text-xs text-muted-foreground/80 dark:text-foreground/70 whitespace-nowrap">{note}</span>}
    </Link>
  );
}

export function ProjectsTable({ summary, className }: { summary: HomeSummary; className?: string }) {
  const { t } = useTranslation("home");
  const reasonText = useReasonText();
  const rows = summary.projects;
  const { canSeeBudget, canSeePayments } = summary.viewer;

  const cells = (p: HomeProjectRow) => ({
    requests: (
      <Count
        href={`/projects/${p.id}/requests`}
        value={num(p.openRequests)}
        note={p.stalledRequests ? t("table.stalled", { count: p.stalledRequests }) : undefined}
        label={`${t("table.requests")}: ${num(p.openRequests)}`}
      />
    ),
    payments: p.pendingPaymentsAmount === null ? null : (
      <Count href={`/payments?tab=orders&project=${p.id}`} value={compact(p.pendingPaymentsAmount)} label={`${t("table.payments")}: ${compact(p.pendingPaymentsAmount)}`} />
    ),
    permits: <Count href={`/permits?tab=licences&project=${p.id}`} value={num(p.permitsAttention)} label={`${t("table.permits")}: ${num(p.permitsAttention)}`} />,
    snags: <Count href={`/projects/${p.id}/snag-list`} value={num(p.openSnags)} label={`${t("table.snags")}: ${num(p.openSnags)}`} />,
  });

  const name = (p: HomeProjectRow) => (
    <Link href={`/projects/${p.id}`} aria-label={t("table.open_project", { name: p.name })} className={cn("inline-flex flex-col justify-center min-h-11 rounded-lg hover:text-primary transition-colors", FOCUS)}>
      <span className="text-sm font-bold text-foreground">{p.name}</span>
      <span className="text-xs text-muted-foreground/80 dark:text-foreground/70">
        {t(`project_status.${p.status}`, { defaultValue: p.status })} · {t("table.ends", { date: fmtDate(p.endDate) })}
      </span>
    </Link>
  );

  const health = (p: HomeProjectRow) => (
    <div className="space-y-1">
      <HealthBadge state={p.health} />
      {p.reasons.slice(0, 2).map((r) => (
        <p key={r.code} className="text-xs text-muted-foreground/80 dark:text-foreground/70">{reasonText(r)}</p>
      ))}
    </div>
  );

  const th = "px-3 py-2 text-start text-xs font-bold text-muted-foreground/80 dark:text-foreground/70 align-bottom";
  const td = "px-3 py-2 align-top";

  return (
    <Panel id="projects" icon={FolderKanban} title={t("table.title")} subtitle={t("table.subtitle")} className={className}>
      {rows.length === 0 ? (
        <EmptyNote text={t("table.empty")} />
      ) : (
        <>
          {/* from tablet up: a table, scrolling inside its own card if it has to */}
          <div className="hidden md:block overflow-x-auto -mx-2">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th scope="col" className={th}>{t("table.project")}</th>
                  <th scope="col" className={th}>{t("table.health")}</th>
                  <th scope="col" className={th}>{t("table.schedule")}</th>
                  {canSeeBudget && <th scope="col" className={th}>{t("table.budget")}</th>}
                  <th scope="col" className={th}>{t("table.requests")}</th>
                  {canSeePayments && <th scope="col" className={th}>{t("table.payments")}</th>}
                  <th scope="col" className={th}>{t("table.permits")}</th>
                  <th scope="col" className={th}>{t("table.snags")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const c = cells(p);
                  return (
                    <tr key={p.id} className="border-b last:border-b-0" data-testid={`home-project-${p.id}`}>
                      <th scope="row" className={cn(td, "text-start font-normal min-w-[11rem]")}>{name(p)}</th>
                      <td className={cn(td, "min-w-[11rem]")}>{health(p)}</td>
                      <td className={td}><ScheduleBar row={p} /></td>
                      {canSeeBudget && <td className={td}><BudgetCell row={p} /></td>}
                      <td className={td}>{c.requests}</td>
                      {canSeePayments && <td className={td}>{c.payments}</td>}
                      <td className={td}>{c.permits}</td>
                      <td className={td}>{c.snags}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* on a phone: the same rows as stacked cards */}
          <ul className="md:hidden space-y-3">
            {rows.map((p) => {
              const c = cells(p);
              return (
                <li key={p.id} className="rounded-xl border p-3 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    {name(p)}
                    <HealthBadge state={p.health} />
                  </div>
                  {p.reasons[0] && <p className="text-xs text-muted-foreground/80 dark:text-foreground/70">{reasonText(p.reasons[0])}</p>}
                  <div>
                    <p className="text-xs font-bold text-muted-foreground/80 dark:text-foreground/70 mb-1">{t("table.schedule")}</p>
                    <ScheduleBar row={p} />
                  </div>
                  {canSeeBudget && (
                    <div>
                      <p className="text-xs font-bold text-muted-foreground/80 dark:text-foreground/70 mb-1">{t("table.budget")}</p>
                      <BudgetCell row={p} />
                    </div>
                  )}
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {([["requests", c.requests], ["payments", c.payments], ["permits", c.permits], ["snags", c.snags]] as const).map(([key, cell]) =>
                      cell ? (
                        <div key={key}>
                          <dt className="text-xs text-muted-foreground/80 dark:text-foreground/70">{t(`table.${key}`)}</dt>
                          <dd>{cell}</dd>
                        </div>
                      ) : null,
                    )}
                  </dl>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}
