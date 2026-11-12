// Where forms are queueing, and where payment orders stand.
import { Banknote, Workflow } from "lucide-react";
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
          <ul className="space-y-1 border-t pt-3 text-xs text-muted-foreground/80 dark:text-foreground/70">
            <li>{t("cash.delayed", { days: DECISION_OVERDUE_DAYS, count: p.delayedDecisions })}</li>
            <li>{t("cash.bills", { open: p.openBillRequests, overdue: p.overdueBillRequests })}</li>
            {p.openFinesCount > 0 && <li>{t("cash.fines", { count: p.openFinesCount, amount: money(p.openFinesAmount) })}</li>}
          </ul>
        </div>
      )}
    </Panel>
  );
}
