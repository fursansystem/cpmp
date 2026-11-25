// Where forms are queueing, and where payment orders stand.
import { AlertCircle, Banknote, Clock, FileText, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { money, num } from "@/lib/i18n-format";
import { DECISION_OVERDUE_DAYS } from "@shared/payments";
import type { HomeSummary } from "@shared/home";
import { BarList, EmptyNote, FOCUS, Panel } from "./parts";

export function StepsPanel({ summary, className }: { summary: HomeSummary; className?: string }) {
  const { t } = useTranslation(["home", "enums"]);
  const steps = summary.requests.byStep;
  return (
    <Panel id="steps" icon={Workflow} title={t("home:steps.title")} subtitle={t("home:steps.subtitle")} className={className}>
      {steps.length === 0 ? (
        <EmptyNote text={t("home:steps.empty")} />
      ) : (
        <BarList
          format={(v) => num(v)}
          items={steps.map((s) => ({ key: s.stepName, label: t(`enums:workflow_step.${s.stepName}`, { defaultValue: s.stepName }), value: s.count }))}
        />
      )}
    </Panel>
  );
}

export function CashPanel({ summary, projectId, className }: { summary: HomeSummary; projectId: string; className?: string }) {
  const { t } = useTranslation("home");
  const p = summary.payments;
  if (!p) return null;
  const orders = p.paidInPeriodCount + p.pendingApprovalCount + p.approvedUnpaidCount;
  const sar = (v: number) => t("kpi.sar", { amount: money(v) });
  return (
    <Panel
      id="cash"
      icon={Banknote}
      title={t("cash.title")}
      subtitle={t("cash.subtitle")}
      className={className}
      action={
        <Link href={`/payments?tab=orders${projectId ? `&project=${projectId}` : ""}`} className={cn("shrink-0 inline-flex items-center min-h-11 px-2 text-sm font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-4 rounded-lg", FOCUS)}>
          {t("state.view_all")}
        </Link>
      }
    >
      {orders === 0 && p.openBillRequests === 0 && p.openFinesCount === 0 ? (
        <EmptyNote text={t("cash.empty")} />
      ) : (
        <div className="space-y-4">
          <BarList
            format={sar}
            items={[
              { key: "paid", label: t("cash.paid"), value: p.paidInPeriodAmount, note: t("cash.orders", { count: p.paidInPeriodCount }) },
              { key: "pending", label: t("cash.pending"), value: p.pendingApprovalAmount, note: t("cash.orders", { count: p.pendingApprovalCount }) },
              { key: "approved", label: t("cash.approved"), value: p.approvedUnpaidAmount, note: t("cash.orders", { count: p.approvedUnpaidCount }) },
            ]}
          />
          <div className={cn("grid grid-cols-1 gap-2.5 border-t pt-3.5", p.openFinesCount > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
            <Link
              href={`/payments?tab=orders${projectId ? `&project=${projectId}` : ""}`}
              className={cn(
                "group flex flex-col justify-between gap-2 rounded-xl border p-3 transition-colors hover:border-primary/40",
                p.delayedDecisions > 0
                  ? "border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10"
                  : "border-border/60 bg-muted/20",
                FOCUS,
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-muted-foreground/90 dark:text-foreground/80">
                  {t("cash.delayed_label")}
                </span>
                <Clock className={cn("w-4 h-4 shrink-0", p.delayedDecisions > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/70")} aria-hidden="true" />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn("text-xl font-bold font-display tabular-nums", p.delayedDecisions > 0 ? "text-amber-700 dark:text-amber-300" : "text-foreground")}>
                  {num(p.delayedDecisions)}
                </span>
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  p.delayedDecisions > 0
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : "bg-muted text-muted-foreground",
                )}>
                  {t("cash.delayed_sub", { days: DECISION_OVERDUE_DAYS })}
                </span>
              </div>
            </Link>

            <Link
              href={`/payments?tab=bills${projectId ? `&project=${projectId}` : ""}`}
              className={cn(
                "group flex flex-col justify-between gap-2 rounded-xl border p-3 transition-colors hover:border-primary/40",
                p.overdueBillRequests > 0
                  ? "border-rose-500/30 bg-rose-500/5 dark:bg-rose-500/10"
                  : "border-border/60 bg-muted/20",
                FOCUS,
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-muted-foreground/90 dark:text-foreground/80">
                  {t("cash.bills_label")}
                </span>
                <FileText className={cn("w-4 h-4 shrink-0", p.overdueBillRequests > 0 ? "text-rose-600 dark:text-rose-400" : "text-primary/80")} aria-hidden="true" />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xl font-bold font-display tabular-nums text-foreground">
                  {num(p.openBillRequests)}
                </span>
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                  p.overdueBillRequests > 0
                    ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                )}>
                  {t("cash.bills_overdue", { overdue: num(p.overdueBillRequests) })}
                </span>
              </div>
            </Link>

            {p.openFinesCount > 0 && (
              <Link
                href={`/payments?tab=fines${projectId ? `&project=${projectId}` : ""}`}
                className={cn(
                  "group flex flex-col justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 transition-colors hover:border-primary/40 dark:bg-amber-500/10",
                  FOCUS,
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-muted-foreground/90 dark:text-foreground/80">
                    {t("cash.fines_label")}
                  </span>
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xl font-bold font-display tabular-nums text-amber-700 dark:text-amber-300">
                    {num(p.openFinesCount)}
                  </span>
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                    {t("cash.fines_amount", { amount: money(p.openFinesAmount) })}
                  </span>
                </div>
              </Link>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
