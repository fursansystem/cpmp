import { useMemo, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Building2, CheckCircle2, ClipboardCheck, Clock, FileText, PackageCheck, PiggyBank, Scale, Timer, Truck, Wallet } from "lucide-react";
import type { ProcurementInsights } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Approved and beyond: money the project is committed to
const COMMITTED = ["approved", "issued", "partially_received", "completed"];
const AWAITING_DELIVERY = ["approved", "issued", "partially_received"];
const RFQ_FINISHED = ["awarded", "closed", "cancelled"];
const MAX_ROWS = 5;

const money = (v: number) => Math.round(v).toLocaleString("en-US");

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000);
}

// Share of an order's line value that has arrived; over-receipt does not count beyond the ordered quantity
function receivedShare(po: any): number {
  let ordered = 0;
  let received = 0;
  for (const item of po.items ?? []) {
    const q = Number(item.quantity ?? 0);
    const price = Number(item.unitPrice ?? 0);
    ordered += q * price;
    received += Math.min(Number(item.receivedQuantity ?? 0), q) * price;
  }
  return ordered > 0 ? received / ordered : 0;
}

const hasOpenLines = (po: any) => (po.items ?? []).some((i: any) => Number(i.quantity ?? 0) - Number(i.receivedQuantity ?? 0) > 0);

function Kpi({ icon: Icon, label, value, hint, tone }: { icon: typeof Wallet; label: string; value: string; hint?: string; tone: string }) {
  return (
    <Card className="rounded-2xl border-border/60">
      <CardContent className="py-4 flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", tone)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground font-bold truncate">{label}</p>
          <p className="text-xl font-black">{value}</p>
          {hint && <p className="text-[10px] text-muted-foreground truncate">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ icon: Icon, iconClass, title, count, empty, more, onMore, children }: {
  icon: typeof Wallet;
  iconClass: string;
  title: string;
  count: number;
  empty: string;
  more: string;
  onMore: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-black flex items-center gap-2">
          <Icon className={cn("w-4 h-4", iconClass)} />
          {title}
          {count > 0 && <Badge className="rounded-full border-none bg-primary/15 text-primary text-[10px] px-1.5 h-4">{count}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {count === 0 && <p className="text-xs text-muted-foreground">{empty}</p>}
        {children}
        {count > MAX_ROWS && (
          <Button variant="ghost" size="sm" onClick={onMore} className="text-xs h-8">
            {more}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ title, subtitle, trailing, trailingClass, onClick, testId }: {
  title: string;
  subtitle: string;
  trailing: string;
  trailingClass?: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 rounded-xl border border-border/50 p-2.5 text-start hover-elevate"
      data-testid={testId}
    >
      <span className="min-w-0">
        <span className="block text-xs font-black">{title}</span>
        <span className="block text-[11px] text-muted-foreground truncate" dir="auto">{subtitle}</span>
      </span>
      <span className={cn("text-[11px] font-bold whitespace-nowrap text-muted-foreground", trailingClass)}>{trailing}</span>
    </button>
  );
}

interface Props {
  projectId: string;
  rfqs: any[];
  purchaseOrders: any[];
  onOpenTab: (tab: "rfqs" | "purchase_orders") => void;
}

export function ProcurementOverview({ projectId, rfqs, purchaseOrders, onOpenTab }: Props) {
  const { t } = useTranslation("procurement");
  const [, navigate] = useLocation();
  const today = localDate();

  const figures = useMemo(() => {
    const committedOrders = purchaseOrders.filter((po) => COMMITTED.includes(po.status));
    const committed = committedOrders.reduce((s, po) => s + Number(po.totalAmount ?? 0), 0);
    const received = committedOrders.reduce((s, po) => s + Number(po.totalAmount ?? 0) * receivedShare(po), 0);
    const drafts = purchaseOrders.filter((po) => po.status === "draft");
    return {
      committed,
      committedCount: committedOrders.length,
      received,
      remaining: committed - received,
      receivedPct: committed > 0 ? Math.round((received / committed) * 100) : 0,
      drafts,
      draftValue: drafts.reduce((s, po) => s + Number(po.totalAmount ?? 0), 0),
    };
  }, [purchaseOrders]);

  // Oldest first: the draft that has waited longest is the one to look at
  const drafts = useMemo(
    () => [...figures.drafts].sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""))),
    [figures.drafts],
  );

  const openRfqs = useMemo(() => rfqs.filter((r) => !RFQ_FINISHED.includes(r.status)), [rfqs]);
  const byDueDate = (a: any, b: any) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
  // No quotation yet: nothing to decide, only suppliers to chase
  const awaitingQuotes = useMemo(() => openRfqs.filter((r) => (r.quotationsCount ?? 0) === 0).sort(byDueDate), [openRfqs]);
  // Has quotations, and lines not yet on any purchase order
  const readyToAward = useMemo(
    () => openRfqs.filter((r) => (r.quotationsCount ?? 0) > 0 && (r.orderedItemsCount ?? 0) < (r.itemsCount ?? 0)).sort(byDueDate),
    [openRfqs],
  );

  const late = useMemo(
    () =>
      purchaseOrders
        .filter((po) => AWAITING_DELIVERY.includes(po.status) && po.expectedDeliveryDate && po.expectedDeliveryDate < today && hasOpenLines(po))
        .sort((a, b) => a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate)),
    [purchaseOrders, today],
  );

  const openPo = (id: string) => navigate(`/projects/${projectId}/purchase-orders/${id}`);
  const openRfq = (id: string) => navigate(`/projects/${projectId}/rfqs/${id}`);
  const dueLabel = (r: any) => {
    if (!r.dueDate) return { text: t("dashboard.no_due_date"), late: false };
    const overdue = daysBetween(r.dueDate, today);
    return overdue > 0 ? { text: t("dashboard.overdue_by", { n: overdue }), late: true } : { text: r.dueDate, late: false };
  };

  const { data: insights } = useQuery<ProcurementInsights>({
    queryKey: ["/api/projects", projectId, "procurement-insights"],
    enabled: !!projectId,
  });
  const topCommitted = Math.max(1, ...(insights?.suppliers ?? []).map((s) => s.committed));

  const nothingToDo = drafts.length + awaitingQuotes.length + readyToAward.length + late.length === 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={Wallet}
          label={t("dashboard.kpi_committed")}
          value={money(figures.committed)}
          hint={t("dashboard.kpi_committed_hint", { n: figures.committedCount })}
          tone="bg-primary/10 text-primary"
        />
        <Kpi
          icon={PackageCheck}
          label={t("dashboard.kpi_received")}
          value={money(figures.received)}
          hint={t("dashboard.kpi_received_hint", { n: figures.receivedPct })}
          tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30"
        />
        <Kpi
          icon={Truck}
          label={t("dashboard.kpi_remaining")}
          value={money(figures.remaining)}
          hint={t("dashboard.kpi_remaining_hint")}
          tone="bg-blue-100 text-blue-700 dark:bg-blue-900/30"
        />
        <Kpi
          icon={FileText}
          label={t("dashboard.kpi_drafts")}
          value={money(figures.draftValue)}
          hint={t("dashboard.kpi_drafts_hint", { n: figures.drafts.length })}
          tone="bg-amber-100 text-amber-700 dark:bg-amber-900/30"
        />
      </div>

      {nothingToDo ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-8 flex flex-col items-center gap-2">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            <p className="text-xs text-muted-foreground font-bold">{t("dashboard.all_clear")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            icon={ClipboardCheck}
            iconClass="text-amber-600"
            title={t("dashboard.drafts_title")}
            count={drafts.length}
            empty={t("dashboard.drafts_empty")}
            more={t("dashboard.view_all", { n: drafts.length })}
            onMore={() => onOpenTab("purchase_orders")}
          >
            {drafts.slice(0, MAX_ROWS).map((po) => (
              <Row
                key={po.id}
                testId={`dash-draft-${po.id}`}
                onClick={() => openPo(po.id)}
                title={po.poNumber}
                subtitle={`${po.supplierName} · ${t("dashboard.amount", { value: money(Number(po.totalAmount ?? 0)) })}`}
                trailing={t("dashboard.waiting_days", { n: Math.max(0, daysBetween(String(po.createdAt).slice(0, 10), today)) })}
              />
            ))}
          </Section>

          <Section
            icon={Scale}
            iconClass="text-purple-600"
            title={t("dashboard.award_title")}
            count={readyToAward.length}
            empty={t("dashboard.award_empty")}
            more={t("dashboard.view_all", { n: readyToAward.length })}
            onMore={() => onOpenTab("rfqs")}
          >
            {readyToAward.slice(0, MAX_ROWS).map((r) => (
              <Row
                key={r.id}
                testId={`dash-award-${r.id}`}
                onClick={() => openRfq(r.id)}
                title={r.rfqNumber}
                // Quotations can be recorded from suppliers who were never invited, so "x of y" only holds when y covers x
                subtitle={`${r.title} · ${
                  (r.suppliersCount ?? 0) >= r.quotationsCount
                    ? t("dashboard.quotes_of", { got: r.quotationsCount, of: r.suppliersCount })
                    : t("dashboard.quotes_count", { n: r.quotationsCount })
                }`}
                trailing={t("dashboard.lines_unordered", { n: (r.itemsCount ?? 0) - (r.orderedItemsCount ?? 0) })}
              />
            ))}
          </Section>

          <Section
            icon={Clock}
            iconClass="text-blue-600"
            title={t("dashboard.quotes_title")}
            count={awaitingQuotes.length}
            empty={t("dashboard.quotes_empty")}
            more={t("dashboard.view_all", { n: awaitingQuotes.length })}
            onMore={() => onOpenTab("rfqs")}
          >
            {awaitingQuotes.slice(0, MAX_ROWS).map((r) => {
              const due = dueLabel(r);
              return (
                <Row
                  key={r.id}
                  testId={`dash-quotes-${r.id}`}
                  onClick={() => openRfq(r.id)}
                  title={r.rfqNumber}
                  subtitle={`${r.title} · ${(r.suppliersCount ?? 0) > 0 ? t("dashboard.suppliers_invited", { n: r.suppliersCount }) : t("dashboard.no_suppliers")}`}
                  trailing={due.text}
                  trailingClass={due.late ? "text-destructive" : undefined}
                />
              );
            })}
          </Section>

          <Section
            icon={Truck}
            iconClass="text-destructive"
            title={t("dashboard.late_title")}
            count={late.length}
            empty={t("dashboard.late_empty")}
            more={t("dashboard.view_all", { n: late.length })}
            onMore={() => onOpenTab("purchase_orders")}
          >
            {late.slice(0, MAX_ROWS).map((po) => (
              <Row
                key={po.id}
                testId={`dash-late-${po.id}`}
                onClick={() => openPo(po.id)}
                title={po.poNumber}
                subtitle={`${po.supplierName} · ${t("dashboard.received_pct", { n: Math.round(receivedShare(po) * 100) })}`}
                trailing={t("dashboard.late_by", { n: daysBetween(po.expectedDeliveryDate, today) })}
                trailingClass="text-destructive"
              />
            ))}
          </Section>
        </div>
      )}

      {insights && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Kpi
              icon={PiggyBank}
              label={t("dashboard.kpi_savings")}
              value={insights.savings.comparedLines > 0 ? money(insights.savings.amount) : "—"}
              hint={
                insights.savings.comparedLines > 0
                  ? t("dashboard.kpi_savings_hint", { n: insights.savings.comparedLines, total: insights.savings.awardedLines })
                  : t("dashboard.kpi_savings_none")
              }
              tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30"
            />
            <Kpi
              icon={Timer}
              label={t("dashboard.kpi_cycle")}
              value={insights.cycle.avgDays !== null ? t("dashboard.days", { n: insights.cycle.avgDays }) : "—"}
              hint={insights.cycle.orders > 0 ? t("dashboard.kpi_cycle_hint", { n: insights.cycle.orders }) : t("dashboard.kpi_cycle_none")}
              tone="bg-purple-100 text-purple-700 dark:bg-purple-900/30"
            />
          </div>

          {insights.suppliers.length > 0 && (
            <Card className="rounded-2xl border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-black flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  {t("dashboard.suppliers_title")}
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">{t("dashboard.suppliers_hint")}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights.suppliers.map((s) => {
                  const allOnTime = s.measured > 0 && s.onTime === s.measured;
                  return (
                    <div key={s.supplierId} className="space-y-1" data-testid={`dash-supplier-${s.supplierId}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="text-xs font-bold truncate" dir="auto">{s.supplierName}</span>
                        <span className="text-[11px] whitespace-nowrap text-muted-foreground">
                          <span className="font-black text-foreground">{t("dashboard.amount", { value: money(s.committed) })}</span> · {t("dashboard.orders_count", { n: s.orders })}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, Math.round((s.committed / topCommitted) * 100))}%` }} />
                      </div>
                      <p className={cn("text-[11px]", s.measured === 0 ? "text-muted-foreground" : allOnTime ? "text-emerald-600" : "text-destructive")}>
                        {s.measured === 0
                          ? t("dashboard.delivery_unmeasured")
                          : `${t("dashboard.delivery_on_time", { n: s.onTime, of: s.measured })}${s.avgDelayDays !== null ? ` · ${t("dashboard.delivery_avg_delay", { n: s.avgDelayDays })}` : ""}`}
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
