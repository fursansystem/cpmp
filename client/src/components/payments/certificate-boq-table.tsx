// Certificate BOQ Valuation Table — Full-width QS table supporting Hybrid Qty-based
// (Previous vs Current vs Cumulative Qty) and Progress-based (Previous % vs Current % vs Cumulative %)
// with bidirectional editing, section subtotals, Original vs VO totals, and QS guardrails.
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  computeBoqLine,
  roundMoney,
  summarizeBoqLines,
  validateCertificateBoqLine,
  type CertificateBoqLineDto,
} from "@shared/subcontractor-boq";
import { cn } from "@/lib/utils";
import { money } from "./payments-common";

type FilterKind = "all" | "active" | "variations" | "incomplete" | "over";

const fmtQty = (v: number) =>
  Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const fmtPct = (v: number) =>
  `${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;

export interface CertificateBoqTableProps {
  lines: CertificateBoqLineDto[];
  editable: boolean;
  onChangeLines: (next: CertificateBoqLineDto[]) => void;
  onSyncFromContract?: () => void;
  syncing?: boolean;
  onManageContractBoq?: () => void;
  contractNo?: string | null;
}

export function CertificateBoqTable({
  lines,
  editable,
  onChangeLines,
  onSyncFromContract,
  syncing = false,
  onManageContractBoq,
  contractNo,
}: CertificateBoqTableProps) {
  const { t } = useTranslation("payments");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const summary = useMemo(() => summarizeBoqLines(lines), [lines]);

  const updateMeasurement = (
    itemId: string | null,
    sortOrder: number,
    source: "current" | "cumulative",
    rawValue: string,
  ) => {
    const parsed = rawValue === "" || rawValue === "-" ? 0 : Number(rawValue);
    if (!Number.isFinite(parsed)) return;

    const next = lines.map((line, idx) => {
      const match = itemId ? line.contractBoqItemId === itemId : idx === sortOrder;
      if (!match) return line;

      const isPct = line.billingMode === "progress";
      const computed = computeBoqLine({
        billingMode: line.billingMode,
        contractQty: line.contractQty,
        unitRate: line.unitRate,
        contractAmount: line.contractAmount,
        previousQty: line.previousQty,
        previousPercent: line.previousPercent,
        previousAmount: line.previousAmount,
        source,
        ...(isPct
          ? source === "current"
            ? { currentPercent: parsed }
            : { cumulativePercent: parsed }
          : source === "current"
            ? { currentQty: parsed }
            : { cumulativeQty: parsed }),
      });

      return {
        ...line,
        contractAmount: computed.contractAmount,
        previousQty: computed.previousQty,
        currentQty: computed.currentQty,
        cumulativeQty: computed.cumulativeQty,
        previousPercent: computed.previousPercent,
        currentPercent: computed.currentPercent,
        cumulativePercent: computed.cumulativePercent,
        previousAmount: computed.previousAmount,
        currentAmount: computed.currentAmount,
        cumulativeAmount: computed.cumulativeAmount,
      };
    });

    onChangeLines(next);
  };

  const fillFullItem = (itemId: string | null, sortOrder: number) => {
    const next = lines.map((line, idx) => {
      const match = itemId ? line.contractBoqItemId === itemId : idx === sortOrder;
      if (!match) return line;
      const isPct = line.billingMode === "progress";
      const computed = computeBoqLine({
        billingMode: line.billingMode,
        contractQty: line.contractQty,
        unitRate: line.unitRate,
        contractAmount: line.contractAmount,
        previousQty: line.previousQty,
        previousPercent: line.previousPercent,
        previousAmount: line.previousAmount,
        source: "cumulative",
        ...(isPct ? { cumulativePercent: 100 } : { cumulativeQty: line.contractQty }),
      });
      return {
        ...line,
        previousQty: computed.previousQty,
        currentQty: computed.currentQty,
        cumulativeQty: computed.cumulativeQty,
        previousPercent: computed.previousPercent,
        currentPercent: computed.currentPercent,
        cumulativePercent: computed.cumulativePercent,
        previousAmount: computed.previousAmount,
        currentAmount: computed.currentAmount,
        cumulativeAmount: computed.cumulativeAmount,
      };
    });
    onChangeLines(next);
  };

  const zeroAllCurrent = () => {
    const next = lines.map((line) => {
      const computed = computeBoqLine({
        billingMode: line.billingMode,
        contractQty: line.contractQty,
        unitRate: line.unitRate,
        contractAmount: line.contractAmount,
        previousQty: line.previousQty,
        previousPercent: line.previousPercent,
        previousAmount: line.previousAmount,
        source: "current",
        currentQty: 0,
        currentPercent: 0,
      });
      return {
        ...line,
        currentQty: computed.currentQty,
        cumulativeQty: computed.cumulativeQty,
        currentPercent: computed.currentPercent,
        cumulativePercent: computed.cumulativePercent,
        currentAmount: computed.currentAmount,
        cumulativeAmount: computed.cumulativeAmount,
      };
    });
    onChangeLines(next);
  };

  const filteredLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((l) => {
      if (q) {
        const hit = [l.itemCode, l.section, l.description, l.variationRef, l.costCode]
          .some((s) => String(s ?? "").toLowerCase().includes(q));
        if (!hit) return false;
      }
      if (filter === "active") return Math.abs(l.currentAmount) > 0.005 || Math.abs(l.currentQty) > 0.0001 || Math.abs(l.currentPercent) > 0.0001;
      if (filter === "variations") return l.isVariation;
      if (filter === "incomplete") return l.cumulativePercent < 99.99;
      if (filter === "over") return l.billingMode === "qty" && l.contractQty > 0 && l.cumulativeQty > l.contractQty + 0.0001;
      return true;
    });
  }, [lines, search, filter]);

  const groupedSections = useMemo(() => {
    const groups: { section: string; items: CertificateBoqLineDto[] }[] = [];
    const idxMap = new Map<string, number>();
    for (const l of filteredLines) {
      const sec = (l.section ?? "").trim();
      if (!idxMap.has(sec)) {
        idxMap.set(sec, groups.length);
        groups.push({ section: sec, items: [] });
      }
      groups[idxMap.get(sec)!].items.push(l);
    }
    return groups;
  }, [filteredLines]);

  const showSectionHeaders =
    groupedSections.length > 1 || (groupedSections.length === 1 && groupedSections[0].section !== "");

  const toggleSection = (sec: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sec)) next.delete(sec);
      else next.add(sec);
      return next;
    });
  };

  const validationIssueCount = useMemo(
    () =>
      lines.filter(
        (l) =>
          validateCertificateBoqLine({
            billingMode: l.billingMode,
            cumulativeQty: l.cumulativeQty,
            cumulativePercent: l.cumulativePercent,
          }).length > 0,
      ).length,
    [lines],
  );

  const activeCount = lines.filter((l) => Math.abs(l.currentAmount) > 0.005).length;
  const incompleteCount = lines.filter((l) => l.cumulativePercent < 99.99).length;

  return (
    <Card className="rounded-2xl shadow-sm border-primary/20 overflow-hidden" data-testid="certificate-boq-card">
      <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base font-black flex items-center gap-2 flex-wrap">
              <ClipboardList className="w-5 h-5 text-primary" />
              <span>{t("boq.valuation_title")}</span>
              {contractNo && (
                <Badge variant="outline" className="font-mono text-[11px] bg-background">
                  {contractNo}
                </Badge>
              )}
              <Badge variant="secondary" className="text-[11px] bg-primary/10 text-primary">
                {t("boq.items_count", { count: summary.itemCount })}
              </Badge>
              {summary.qtyItemCount > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  {summary.qtyItemCount} {t("boq.mode_qty_short")}
                </Badge>
              )}
              {summary.progressItemCount > 0 && (
                <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-700 dark:text-violet-300">
                  {summary.progressItemCount} {t("boq.mode_progress_short")}
                </Badge>
              )}
              {summary.variationCount > 0 && (
                <Badge variant="secondary" className="text-[10px] bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">
                  {summary.variationCount} VO
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {editable ? t("boq.valuation_hint_edit") : t("boq.valuation_hint_locked")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {editable && onSyncFromContract && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-xl gap-1.5 text-xs"
                disabled={syncing}
                onClick={onSyncFromContract}
              >
                <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
                <span>{t("boq.sync_contract_boq")}</span>
              </Button>
            )}
            {onManageContractBoq && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-xl gap-1.5 text-xs"
                onClick={onManageContractBoq}
              >
                <Settings2 className="w-3.5 h-3.5 text-primary" />
                <span>{t("boq.manage_contract_boq")}</span>
              </Button>
            )}
            {editable && lines.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-xl gap-1 text-xs text-muted-foreground"
                onClick={zeroAllCurrent}
                title={t("boq.zero_period_tip")}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t("boq.zero_period")}</span>
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute start-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("boq.search_placeholder")}
              className="h-8 ps-8 text-xs rounded-xl bg-background"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                ["all", t("boq.filter_all", { count: lines.length })],
                ["active", t("boq.filter_active", { count: activeCount })],
                ...(summary.variationCount > 0
                  ? [["variations", t("boq.filter_variations", { count: summary.variationCount })]]
                  : []),
                ["incomplete", t("boq.filter_incomplete", { count: incompleteCount })],
                ...(summary.overContractCount > 0
                  ? [["over", t("boq.filter_over", { count: summary.overContractCount })]]
                  : []),
              ] as [FilterKind, string][]
            ).map(([k, label]) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={filter === k ? "default" : "outline"}
                className={cn(
                  "h-7 rounded-lg text-[11px] px-2.5",
                  k === "over" && filter !== k && "border-amber-400 text-amber-700 dark:text-amber-300",
                )}
                onClick={() => setFilter(k)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="ms-auto flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1">
            <span className="text-[11px] font-bold text-primary">{t("boq.work_value_current_label")}</span>
            <span className="text-sm font-black tabular-nums text-primary">{money(summary.currentTotal)}</span>
          </div>
        </div>

        {(validationIssueCount > 0 || summary.overContractCount > 0 || summary.negativeAdjustmentCount > 0) && (
          <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
            {validationIssueCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 px-2.5 py-1 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                {t("boq.alert_invalid_rows", { count: validationIssueCount })}
              </span>
            )}
            {summary.overContractCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-400/40 px-2.5 py-1 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                {t("boq.alert_over_qty", { count: summary.overContractCount })}
              </span>
            )}
            {summary.negativeAdjustmentCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-400/40 px-2.5 py-1 font-semibold">
                {t("boq.alert_negative_adj", { count: summary.negativeAdjustmentCount })}
              </span>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[62vh]">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-xs">
              <TableRow className="border-b border-border/60 text-[10px] uppercase tracking-wider">
                <TableHead colSpan={7} className="py-1.5 text-center font-bold bg-muted/60 border-e border-border/50">
                  {t("boq.group_contract_scope")}
                </TableHead>
                <TableHead colSpan={3} className="py-1.5 text-center font-bold bg-primary/10 text-primary border-e border-border/50">
                  {t("boq.group_measurement")}
                </TableHead>
                <TableHead colSpan={5} className="py-1.5 text-center font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  {t("boq.group_financials")}
                </TableHead>
              </TableRow>
              <TableRow className="text-[11px] whitespace-nowrap">
                <TableHead className="w-[70px]">{t("boq.th_item_no")}</TableHead>
                <TableHead className="min-w-[200px]">{t("boq.th_description")}</TableHead>
                <TableHead className="w-[54px] text-center">{t("boq.th_unit")}</TableHead>
                <TableHead className="w-[62px] text-center">{t("boq.th_mode")}</TableHead>
                <TableHead className="w-[78px] text-end">{t("boq.th_qty")}</TableHead>
                <TableHead className="w-[86px] text-end">{t("boq.th_rate")}</TableHead>
                <TableHead className="w-[100px] text-end border-e border-border/50">{t("boq.th_contract_amt")}</TableHead>

                <TableHead className="w-[84px] text-end bg-muted/40">{t("boq.th_previous")}</TableHead>
                <TableHead className="w-[102px] text-end bg-primary/5 text-primary font-bold">
                  {t("boq.th_current_edit")}
                </TableHead>
                <TableHead className="w-[110px] text-end bg-primary/5 text-primary font-bold border-e border-border/50">
                  {t("boq.th_cumulative_edit")}
                </TableHead>

                <TableHead className="w-[94px] text-end text-muted-foreground">{t("boq.th_prev_amt")}</TableHead>
                <TableHead className="w-[106px] text-end text-primary font-black">{t("boq.th_current_amt")}</TableHead>
                <TableHead className="w-[100px] text-end">{t("boq.th_cum_amt")}</TableHead>
                <TableHead className="w-[96px] text-end">{t("boq.th_remaining")}</TableHead>
                <TableHead className="w-[68px] text-center">{t("boq.th_done_pct")}</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredLines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={15} className="py-10 text-center text-muted-foreground">
                    {t("boq.no_matching_items")}
                  </TableCell>
                </TableRow>
              ) : (
                groupedSections.map((group) => {
                  const isCollapsed = collapsedSections.has(group.section);
                  const secContract = roundMoney(group.items.reduce((s, x) => s + x.contractAmount, 0));
                  const secPrev = roundMoney(group.items.reduce((s, x) => s + x.previousAmount, 0));
                  const secCur = roundMoney(group.items.reduce((s, x) => s + x.currentAmount, 0));
                  const secCum = roundMoney(group.items.reduce((s, x) => s + x.cumulativeAmount, 0));
                  const secRem = roundMoney(secContract - secCum);
                  const secPct = secContract > 0 ? roundMoney((secCum / secContract) * 100) : 0;

                  return (
                    <Fragment key={group.section || "__ungrouped__"}>
                      {showSectionHeaders && (
                        <TableRow
                          className="bg-muted/50 hover:bg-muted/70 cursor-pointer font-bold"
                          onClick={() => toggleSection(group.section)}
                        >
                          <TableCell colSpan={6} className="py-2">
                            <div className="flex items-center gap-1.5">
                              {isCollapsed ? (
                                <ChevronRight className="w-4 h-4 text-primary rtl:rotate-180" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-primary" />
                              )}
                              <span>{group.section || t("boq.general_section")}</span>
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                {group.items.length}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="py-2 text-end tabular-nums border-e border-border/50">
                            {money(secContract)}
                          </TableCell>
                          <TableCell colSpan={3} className="py-2 border-e border-border/50" />
                          <TableCell className="py-2 text-end tabular-nums text-muted-foreground">
                            {money(secPrev)}
                          </TableCell>
                          <TableCell className="py-2 text-end tabular-nums text-primary font-black">
                            {money(secCur)}
                          </TableCell>
                          <TableCell className="py-2 text-end tabular-nums">{money(secCum)}</TableCell>
                          <TableCell className="py-2 text-end tabular-nums">{money(secRem)}</TableCell>
                          <TableCell className="py-2 text-center tabular-nums">{fmtPct(secPct)}</TableCell>
                        </TableRow>
                      )}

                      {!isCollapsed &&
                        group.items.map((l, idx) => {
                          const isPct = l.billingMode === "progress";
                          const errs = validateCertificateBoqLine({
                            billingMode: l.billingMode,
                            cumulativeQty: l.cumulativeQty,
                            cumulativePercent: l.cumulativePercent,
                          });
                          const hasErr = errs.length > 0;
                          const isOverQty = !isPct && l.contractQty > 0 && l.cumulativeQty > l.contractQty + 0.0001;
                          const overQtyVal = isOverQty ? l.cumulativeQty - l.contractQty : 0;
                          const isNeg = l.currentAmount < -0.005;
                          const remAmt = roundMoney(l.contractAmount - l.cumulativeAmount);

                          return (
                            <TableRow
                              key={l.contractBoqItemId || `${l.itemCode}-${idx}`}
                              className={cn(
                                "group transition-colors",
                                l.isVariation && "bg-sky-50/35 dark:bg-sky-950/15",
                                hasErr && "bg-destructive/10",
                              )}
                            >
                              <TableCell className="font-mono font-bold whitespace-nowrap py-2">
                                {l.itemCode}
                              </TableCell>
                              <TableCell className="py-2">
                                <div className="flex items-start gap-1.5 flex-wrap">
                                  <span className="font-medium leading-snug">{l.description}</span>
                                  {l.isVariation && (
                                    <Badge
                                      variant="secondary"
                                      className="bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200 text-[10px] px-1.5 py-0 h-4 shrink-0"
                                    >
                                      {l.variationRef || "VO"}
                                    </Badge>
                                  )}
                                  {isOverQty && (
                                    <Badge
                                      variant="outline"
                                      className="border-amber-500 text-amber-700 dark:text-amber-300 text-[10px] px-1.5 py-0 h-4 shrink-0"
                                    >
                                      {t("boq.over_badge", { qty: fmtQty(overQtyVal) })}
                                    </Badge>
                                  )}
                                  {isNeg && (
                                    <Badge
                                      variant="outline"
                                      className="border-rose-500 text-rose-700 dark:text-rose-300 text-[10px] px-1.5 py-0 h-4 shrink-0"
                                    >
                                      {t("boq.adj_neg_badge")}
                                    </Badge>
                                  )}
                                </div>
                                {hasErr && (
                                  <div className="text-[10px] text-destructive font-semibold mt-0.5">
                                    {errs.includes("progress_exceeds_100")
                                      ? t("boq.err_progress_100")
                                      : t("boq.err_cum_zero")}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-center text-muted-foreground py-2">{l.unit}</TableCell>
                              <TableCell className="text-center py-2">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[10px] px-1.5 py-0 h-5 font-semibold",
                                    isPct
                                      ? "border-violet-300 bg-violet-50/70 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"
                                      : "border-slate-300 bg-slate-50/70 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
                                  )}
                                >
                                  {isPct ? "%" : t("boq.mode_qty_short")}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-end tabular-nums py-2">{fmtQty(l.contractQty)}</TableCell>
                              <TableCell className="text-end tabular-nums text-muted-foreground py-2">
                                {money(l.unitRate)}
                              </TableCell>
                              <TableCell className="text-end tabular-nums font-semibold py-2 border-e border-border/50">
                                {money(l.contractAmount)}
                              </TableCell>

                              <TableCell className="text-end tabular-nums bg-muted/25 text-muted-foreground font-medium py-2">
                                {isPct ? fmtPct(l.previousPercent) : fmtQty(l.previousQty)}
                              </TableCell>

                              <TableCell className="p-1.5 bg-primary/[0.03]">
                                {editable ? (
                                  <div className="relative flex items-center">
                                    <Input
                                      type="number"
                                      step="any"
                                      value={isPct ? l.currentPercent : l.currentQty}
                                      onChange={(e) =>
                                        updateMeasurement(l.contractBoqItemId, l.sortOrder, "current", e.target.value)
                                      }
                                      className={cn(
                                        "h-7 text-xs text-end tabular-nums font-bold px-2 rounded-lg bg-background",
                                        isPct && "pe-5",
                                        hasErr && "border-destructive focus-visible:ring-destructive",
                                        isNeg && "text-rose-600",
                                      )}
                                      data-testid={`boq-current-${l.itemCode}`}
                                    />
                                    {isPct && (
                                      <span className="absolute end-1.5 text-[10px] text-muted-foreground pointer-events-none">
                                        %
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className={cn("text-end tabular-nums font-bold", isNeg && "text-rose-600")}>
                                    {isPct ? fmtPct(l.currentPercent) : fmtQty(l.currentQty)}
                                  </div>
                                )}
                              </TableCell>

                              <TableCell className="p-1.5 bg-primary/[0.03] border-e border-border/50">
                                {editable ? (
                                  <div className="flex items-center gap-1">
                                    <div className="relative flex-1">
                                      <Input
                                        type="number"
                                        step="any"
                                        min="0"
                                        max={isPct ? "100" : undefined}
                                        value={isPct ? l.cumulativePercent : l.cumulativeQty}
                                        onChange={(e) =>
                                          updateMeasurement(l.contractBoqItemId, l.sortOrder, "cumulative", e.target.value)
                                        }
                                        className={cn(
                                          "h-7 text-xs text-end tabular-nums px-2 rounded-lg bg-background",
                                          isPct && "pe-5",
                                          hasErr && "border-destructive focus-visible:ring-destructive",
                                          isOverQty && "border-amber-500 text-amber-700 dark:text-amber-300 font-bold",
                                        )}
                                        data-testid={`boq-cumulative-${l.itemCode}`}
                                      />
                                      {isPct && (
                                        <span className="absolute end-1.5 top-1.5 text-[10px] text-muted-foreground pointer-events-none">
                                          %
                                        </span>
                                      )}
                                    </div>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 shrink-0 opacity-60 hover:opacity-100 hover:text-emerald-600"
                                      onClick={() => fillFullItem(l.contractBoqItemId, l.sortOrder)}
                                      title={t("boq.fill_100_tip")}
                                    >
                                      <CheckCheck className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div
                                    className={cn(
                                      "text-end tabular-nums font-semibold",
                                      isOverQty && "text-amber-700 dark:text-amber-300",
                                    )}
                                  >
                                    {isPct ? fmtPct(l.cumulativePercent) : fmtQty(l.cumulativeQty)}
                                  </div>
                                )}
                              </TableCell>

                              <TableCell className="text-end tabular-nums text-muted-foreground py-2">
                                {money(l.previousAmount)}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "text-end tabular-nums font-black py-2",
                                  l.currentAmount > 0
                                    ? "text-primary"
                                    : l.currentAmount < 0
                                      ? "text-rose-600"
                                      : "text-muted-foreground",
                                )}
                              >
                                {money(l.currentAmount)}
                              </TableCell>
                              <TableCell className="text-end tabular-nums font-semibold py-2">
                                {money(l.cumulativeAmount)}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "text-end tabular-nums py-2",
                                  remAmt < 0 ? "text-amber-700 dark:text-amber-300 font-semibold" : "text-muted-foreground",
                                )}
                              >
                                {money(remAmt)}
                              </TableCell>
                              <TableCell className="text-center py-2">
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "text-[10px] px-1.5 py-0 h-5 tabular-nums font-bold",
                                    l.cumulativePercent >= 100
                                      ? isOverQty
                                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                      : l.cumulativePercent > 0
                                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                                        : "bg-muted text-muted-foreground",
                                  )}
                                >
                                  {fmtPct(l.cumulativePercent)}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </Fragment>
                  );
                })
              )}
            </TableBody>

            {lines.length > 0 && (
              <TableFooter className="sticky bottom-0 z-10 border-t-2 border-primary/30 bg-muted/95 backdrop-blur-xs">
                {summary.variationCount > 0 && (
                  <>
                    <TableRow className="text-xs font-semibold bg-muted/40">
                      <TableCell colSpan={6} className="py-2">{t("boq.subtotal_original")}</TableCell>
                      <TableCell className="py-2 text-end tabular-nums border-e border-border/50">
                        {money(summary.originalContractTotal)}
                      </TableCell>
                      <TableCell colSpan={3} className="py-2 border-e border-border/50" />
                      <TableCell className="py-2 text-end tabular-nums text-muted-foreground">
                        {money(summary.originalPreviousTotal)}
                      </TableCell>
                      <TableCell className="py-2 text-end tabular-nums font-bold">
                        {money(summary.originalCurrentTotal)}
                      </TableCell>
                      <TableCell className="py-2 text-end tabular-nums">
                        {money(summary.originalCumulativeTotal)}
                      </TableCell>
                      <TableCell className="py-2 text-end tabular-nums">
                        {money(roundMoney(summary.originalContractTotal - summary.originalCumulativeTotal))}
                      </TableCell>
                      <TableCell className="py-2 text-center tabular-nums">
                        {summary.originalContractTotal > 0
                          ? fmtPct((summary.originalCumulativeTotal / summary.originalContractTotal) * 100)
                          : "0%"}
                      </TableCell>
                    </TableRow>

                    <TableRow className="text-xs font-semibold bg-sky-50/70 dark:bg-sky-950/30">
                      <TableCell colSpan={6} className="py-2 text-sky-800 dark:text-sky-200">
                        {t("boq.subtotal_variations")}
                      </TableCell>
                      <TableCell className="py-2 text-end tabular-nums border-e border-border/50 text-sky-800 dark:text-sky-200">
                        {money(summary.variationsTotal)}
                      </TableCell>
                      <TableCell colSpan={3} className="py-2 border-e border-border/50" />
                      <TableCell className="py-2 text-end tabular-nums text-muted-foreground">
                        {money(summary.variationsPreviousTotal)}
                      </TableCell>
                      <TableCell className="py-2 text-end tabular-nums font-bold text-sky-800 dark:text-sky-200">
                        {money(summary.variationsCurrentTotal)}
                      </TableCell>
                      <TableCell className="py-2 text-end tabular-nums">
                        {money(summary.variationsCumulativeTotal)}
                      </TableCell>
                      <TableCell className="py-2 text-end tabular-nums">
                        {money(roundMoney(summary.variationsTotal - summary.variationsCumulativeTotal))}
                      </TableCell>
                      <TableCell className="py-2 text-center tabular-nums">
                        {summary.variationsTotal > 0
                          ? fmtPct((summary.variationsCumulativeTotal / summary.variationsTotal) * 100)
                          : "0%"}
                      </TableCell>
                    </TableRow>
                  </>
                )}

                <TableRow className="text-xs font-black bg-primary/10 hover:bg-primary/10">
                  <TableCell colSpan={6} className="py-3 text-primary">
                    {t("boq.grand_total_work_value")}
                  </TableCell>
                  <TableCell className="py-3 text-end tabular-nums border-e border-border/50">
                    {money(summary.revisedContractTotal)}
                  </TableCell>
                  <TableCell colSpan={3} className="py-3 text-center text-[11px] text-muted-foreground border-e border-border/50">
                    {t("boq.overall_progress", { pct: fmtPct(summary.overallProgressPercent) })}
                  </TableCell>
                  <TableCell className="py-3 text-end tabular-nums text-muted-foreground">
                    {money(summary.previousTotal)}
                  </TableCell>
                  <TableCell className="py-3 text-end tabular-nums text-sm text-primary font-black">
                    {money(summary.currentTotal)}
                  </TableCell>
                  <TableCell className="py-3 text-end tabular-nums">{money(summary.cumulativeTotal)}</TableCell>
                  <TableCell className="py-3 text-end tabular-nums">{money(summary.remainingTotal)}</TableCell>
                  <TableCell className="py-3 text-center tabular-nums text-primary">
                    {fmtPct(summary.overallProgressPercent)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
