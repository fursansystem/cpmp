import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Coins, Hourglass, Plus, ShieldCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { WarehouseActivity } from "@/components/warehouse/warehouse-activity";
import type { StockBalance, StockInsight } from "@shared/schema";

const CONSUMPTION_WINDOW_DAYS = 30;
// A material is worth watching once what is left covers two weeks or less of issuing
const COVERAGE_WATCH_DAYS = 14;
const COVERAGE_CRITICAL_DAYS = 7;
// No movement of any kind for this long, with stock still on the shelf, is money standing still
const IDLE_DAYS = 60;
const AWAITING_DELIVERY = ["approved", "issued", "partially_received"];
const MAX_ROWS = 5;
const MAX_IDLE_ROWS = 8;

const qty = (v: unknown) => Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const money = (v: number) => Math.round(v).toLocaleString("en-US");

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000);
}

const remainingOf = (item: any) => Number(item.quantity ?? 0) - Number(item.receivedQuantity ?? 0);

function Kpi({ icon: Icon, label, value, hint, tone }: { icon: typeof Coins; label: string; value: string | number; hint?: string; tone: string }) {
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

interface Props {
  projectId: string;
  balances: StockBalance[];
  pendingIssues: any[];
  canApproveIssue: boolean;
  approving: boolean;
  onApproveIssue: (id: string) => void;
  onOpenIssues: () => void;
}

export function WarehouseOverview({ projectId, balances, pendingIssues, canApproveIssue, approving, onApproveIssue, onOpenIssues }: Props) {
  const { t } = useTranslation("warehouse");
  const [, navigate] = useLocation();
  const today = localDate();

  const { data: purchaseOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "purchase-orders"],
    enabled: !!projectId,
  });
  const { data: insights = [] } = useQuery<StockInsight[]>({
    queryKey: ["/api/projects", projectId, "stock-insights"],
    enabled: !!projectId,
  });

  const expected = useMemo(
    () =>
      purchaseOrders
        .filter((po) => AWAITING_DELIVERY.includes(po.status))
        .map((po) => ({
          ...po,
          openLines: (po.items ?? []).filter((i: any) => remainingOf(i) > 0).length,
          daysLate: po.expectedDeliveryDate ? daysBetween(po.expectedDeliveryDate, today) : null,
        }))
        .filter((po) => po.openLines > 0)
        // Dated orders first, earliest (most overdue) at the top
        .sort((a, b) => (a.expectedDeliveryDate ?? "9999").localeCompare(b.expectedDeliveryDate ?? "9999")),
    [purchaseOrders, today],
  );

  const rows = useMemo(() => {
    const onOrder = new Map<string, { id: string; poNumber: string; draft: boolean }>();
    for (const po of purchaseOrders) {
      const draft = po.status === "draft";
      if (!draft && !AWAITING_DELIVERY.includes(po.status)) continue;
      for (const item of po.items ?? []) {
        if (!item.materialId || remainingOf(item) <= 0) continue;
        const existing = onOrder.get(item.materialId);
        // An approved order is better news than a draft, so it wins
        if (!existing || (existing.draft && !draft)) onOrder.set(item.materialId, { id: po.id, poNumber: po.poNumber, draft });
      }
    }
    const byMaterial = new Map(insights.map((i) => [i.materialId, i]));

    return balances.map((b) => {
      const insight = byMaterial.get(b.materialId);
      // Mixed units make the balance meaningless, and so anything derived from it
      const usable = !b.hasUnitConflict;
      const perDay = (insight?.issuedInWindow ?? 0) / CONSUMPTION_WINDOW_DAYS;
      const coverage = !usable || perDay <= 0 ? null : Math.max(0, Math.floor(b.balance / perDay));
      const value = usable && b.balance > 0 && insight?.unitPrice != null ? b.balance * insight.unitPrice : null;
      const idleDays = insight?.lastMovementDate ? daysBetween(insight.lastMovementDate, today) : null;
      return { ...b, coverage, value, idleDays, order: onOrder.get(b.materialId) ?? null };
    });
  }, [balances, purchaseOrders, insights, today]);

  const inStock = rows.filter((r) => r.balance > 0);
  const totalValue = inStock.reduce((sum, r) => sum + (r.value ?? 0), 0);
  const unpriced = inStock.filter((r) => r.value === null).length;
  const lowStockCount = balances.filter((b) => b.isLowStock).length;

  const watch = rows
    .filter((r) => r.isLowStock || (r.coverage !== null && r.coverage <= COVERAGE_WATCH_DAYS))
    .sort((a, b) => Number(!!a.order) - Number(!!b.order) || (a.coverage ?? Infinity) - (b.coverage ?? Infinity));

  const idle = inStock
    .filter((r) => r.idleDays !== null && r.idleDays >= IDLE_DAYS)
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || (b.idleDays ?? 0) - (a.idleDays ?? 0));
  const idleValue = idle.reduce((sum, r) => sum + (r.value ?? 0), 0);

  const nothingToDo = pendingIssues.length === 0 && expected.length === 0 && watch.length === 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={Coins}
          label={t("overview.kpi_value")}
          value={money(totalValue)}
          hint={unpriced > 0 ? t("overview.kpi_value_unpriced", { n: unpriced, total: inStock.length }) : t("overview.kpi_value_hint", { n: inStock.length })}
          tone="bg-primary/10 text-primary"
        />
        <Kpi icon={AlertTriangle} label={t("kpis.low_stock")} value={lowStockCount} tone="bg-amber-100 text-amber-700 dark:bg-amber-900/30" />
        <Kpi icon={ShieldCheck} label={t("kpis.pending_issues")} value={pendingIssues.length} tone="bg-blue-100 text-blue-700 dark:bg-blue-900/30" />
        <Kpi
          icon={Hourglass}
          label={t("overview.kpi_idle")}
          value={idle.length}
          hint={idle.length > 0 && idleValue > 0 ? t("overview.kpi_idle_value", { value: money(idleValue) }) : t("overview.kpi_idle_hint", { n: IDLE_DAYS })}
          tone="bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
        />
      </div>

      {nothingToDo ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-8 flex flex-col items-center gap-2">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            <p className="text-xs text-muted-foreground font-bold">{t("overview.all_clear")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-2xl border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                {t("overview.pending_issues_title")}
                {pendingIssues.length > 0 && <Badge className="rounded-full border-none bg-amber-500 text-white text-[10px] px-1.5 h-4">{pendingIssues.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingIssues.length === 0 && <p className="text-xs text-muted-foreground">{t("overview.pending_issues_empty")}</p>}
              {pendingIssues.slice(0, MAX_ROWS).map((issue) => (
                <div key={issue.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/50 p-2.5">
                  <button type="button" onClick={onOpenIssues} className="min-w-0 text-start" data-testid={`overview-issue-${issue.id}`}>
                    <span className="block text-xs font-black">{issue.issueNumber}</span>
                    <span className="block text-[11px] text-muted-foreground truncate" dir="auto">
                      {issue.issuedTo} · {t("overview.items_count", { n: (issue.items ?? []).length })} · {issue.issueDate}
                    </span>
                  </button>
                  {canApproveIssue && (
                    <Button size="sm" disabled={approving} onClick={() => onApproveIssue(issue.id)} className="rounded-lg h-8 text-xs font-bold gap-1 shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t("issues.approve")}
                    </Button>
                  )}
                </div>
              ))}
              {pendingIssues.length > MAX_ROWS && (
                <Button variant="ghost" size="sm" onClick={onOpenIssues} className="text-xs h-8">
                  {t("overview.view_all", { n: pendingIssues.length })}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <Truck className="w-4 h-4 text-primary" />
                {t("overview.expected_title")}
                {expected.length > 0 && <Badge className="rounded-full border-none bg-primary/15 text-primary text-[10px] px-1.5 h-4">{expected.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {expected.length === 0 && <p className="text-xs text-muted-foreground">{t("overview.expected_empty")}</p>}
              {expected.slice(0, MAX_ROWS).map((po) => {
                const late = po.daysLate !== null && po.daysLate > 0;
                return (
                  <button
                    key={po.id}
                    type="button"
                    onClick={() => navigate(`/projects/${projectId}/purchase-orders/${po.id}`)}
                    className="w-full flex items-center justify-between gap-3 rounded-xl border border-border/50 p-2.5 text-start hover-elevate"
                    data-testid={`overview-po-${po.id}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-black">{po.poNumber}</span>
                      <span className="block text-[11px] text-muted-foreground truncate" dir="auto">
                        {po.supplierName} · {t("overview.open_lines", { n: po.openLines })}
                      </span>
                    </span>
                    <span className={cn("text-[11px] font-bold whitespace-nowrap", late ? "text-destructive" : "text-muted-foreground")}>
                      {po.daysLate === null
                        ? t("overview.no_date")
                        : late
                          ? t("overview.late_by", { n: po.daysLate })
                          : po.daysLate === 0
                            ? t("overview.due_today")
                            : po.expectedDeliveryDate}
                    </span>
                  </button>
                );
              })}
              {expected.length > MAX_ROWS && (
                <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/purchase-orders?tab=purchase_orders`)} className="text-xs h-8">
                  {t("overview.view_all", { n: expected.length })}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {watch.length > 0 && (
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              {t("overview.watch_title")}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">{t("overview.watch_hint", { n: CONSUMPTION_WINDOW_DAYS })}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {watch.map((b) => (
              <div key={b.materialId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-border/50 p-2.5">
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-bold truncate" dir="auto">{b.materialName}</span>
                  <span className="block text-[11px] whitespace-nowrap">
                    <span className={cn("font-black", b.isLowStock && "text-destructive")}>{qty(b.balance)}</span>
                    <span className="text-muted-foreground"> / {qty(b.minStockLevel)} {b.unit}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {b.coverage !== null && (
                    <Badge
                      className={cn(
                        "rounded-full border-none text-[10px] font-bold",
                        b.coverage <= COVERAGE_CRITICAL_DAYS ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                      )}
                    >
                      {b.coverage === 0 ? t("overview.coverage_none") : t("overview.coverage_days", { n: b.coverage })}
                    </Badge>
                  )}
                  {b.order ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/projects/${projectId}/purchase-orders/${b.order!.id}`)}
                      className="rounded-lg h-8 text-[11px] font-bold"
                    >
                      {t(b.order.draft ? "overview.on_draft_order" : "overview.on_order", { po: b.order.poNumber })}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => navigate(`/projects/${projectId}/purchase-orders/new`)} className="rounded-lg h-8 text-[11px] font-bold gap-1">
                      <Plus className="w-3.5 h-3.5" />
                      {t("overview.create_po")}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <WarehouseActivity projectId={projectId} />

      {idle.length > 0 && (
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black flex items-center gap-2">
              <Hourglass className="w-4 h-4 text-slate-500" />
              {t("overview.idle_title")}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">{t("overview.idle_hint", { n: IDLE_DAYS })}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {idle.slice(0, MAX_IDLE_ROWS).map((b) => (
              <div key={b.materialId} className="flex items-center justify-between gap-3 rounded-xl border border-border/50 p-2.5">
                <div className="min-w-0">
                  <span className="block text-xs font-bold truncate" dir="auto">{b.materialName}</span>
                  <span className="block text-[11px] text-muted-foreground whitespace-nowrap">
                    {qty(b.balance)} {b.unit} · {t("overview.idle_since", { n: b.idleDays })}
                  </span>
                </div>
                <span className="text-xs font-black whitespace-nowrap">
                  {b.value !== null ? t("overview.amount", { value: money(b.value) }) : <span className="font-medium text-muted-foreground">{t("overview.no_price")}</span>}
                </span>
              </div>
            ))}
            {idle.length > MAX_IDLE_ROWS && <p className="text-[11px] text-muted-foreground">{t("overview.idle_more", { n: idle.length - MAX_IDLE_ROWS })}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
