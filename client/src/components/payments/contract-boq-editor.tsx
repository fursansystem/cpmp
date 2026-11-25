// Contract BOQ Editor — supports Hybrid billing (Qty-based + Progress %-based),
// Original vs Variation (VO) items, Section grouping, Certified-line lock protection,
// Excel template/import/export, and auto-sync to Contract Value.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  FileSpreadsheet,
  Lock,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  BOQ_COMMON_UNITS,
  computeBoqContractAmount,
  roundMoney,
  type BoqBillingMode,
  type ContractBoqItemDto,
} from "@shared/subcontractor-boq";
import { errorMessage, getJson, invalidatePayments, money, paymentsQuery } from "./payments-common";
import {
  downloadContractBoqTemplate,
  exportContractBoqExcel,
  parseContractBoqExcel,
} from "./subcontractor-cert-export";

interface ContractBoqApiResponse {
  contract: {
    id: string;
    contractNo: string;
    title: string;
    subcontractorName: string;
    status: string;
    defaultBillingMode: BoqBillingMode;
    contractValue: number;
  };
  items: ContractBoqItemDto[];
  summary: {
    itemCount: number;
    originalTotal: number;
    variationsTotal: number;
    revisedTotal: number;
    certifiedTotal: number;
    remainingTotal: number;
    progressPercent: number;
  };
  openCertificate: { id: string; certNo: string; status: string } | null;
}

interface EditableRow extends ContractBoqItemDto {
  _key: string;
}

let rowKeySeq = 1;
const nextKey = () => `boq_row_${rowKeySeq++}`;

export function ContractBoqEditor({
  contractId,
  readOnly = false,
  onSaved,
}: {
  contractId: string;
  readOnly?: boolean;
  onSaved?: () => void;
}) {
  const { t, i18n } = useTranslation("payments");
  const isAr = (i18n.language || "ar").startsWith("ar");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data, isLoading } = useQuery<ContractBoqApiResponse>({
    queryKey: ["payments", "contract-boq", contractId],
    queryFn: () => getJson(`/api/payments/subcontractor-contracts/${contractId}/boq`),
    enabled: !!contractId,
    meta: paymentsQuery,
  });

  const [rows, setRows] = useState<EditableRow[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.items) {
      setRows(
        data.items.map((it) => ({
          ...it,
          _key: it.id || nextKey(),
        })),
      );
      setDirty(false);
    }
  }, [data]);

  const isContractActive = data?.contract?.status === "active";
  const canEdit = !readOnly && isContractActive;
  const defaultMode: BoqBillingMode = data?.contract?.defaultBillingMode === "progress" ? "progress" : "qty";

  const totals = useMemo(() => {
    let original = 0;
    let variations = 0;
    let certified = 0;
    let qtyCount = 0;
    let pctCount = 0;
    for (const r of rows) {
      const amt = computeBoqContractAmount(r.contractQty, r.unitRate);
      if (r.isVariation) variations += amt;
      else original += amt;
      certified += Number(r.certifiedAmount || 0);
      if (r.billingMode === "progress") pctCount++;
      else qtyCount++;
    }
    original = roundMoney(original);
    variations = roundMoney(variations);
    const revised = roundMoney(original + variations);
    certified = roundMoney(certified);
    return {
      original,
      variations,
      revised,
      certified,
      remaining: roundMoney(revised - certified),
      progressPct: revised > 0 ? roundMoney((certified / revised) * 100) : 0,
      qtyCount,
      pctCount,
    };
  }, [rows]);

  const updateRow = (key: string, patch: Partial<EditableRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r._key !== key) return r;
        const next = { ...r, ...patch };
        next.contractAmount = computeBoqContractAmount(next.contractQty, next.unitRate);
        return next;
      }),
    );
    setDirty(true);
  };

  const addRow = (isVariation = false) => {
    const existingCount = isVariation
      ? rows.filter((r) => r.isVariation).length + 1
      : rows.filter((r) => !r.isVariation).length + 1;
    const lastSection = rows.length > 0 ? rows[rows.length - 1].section ?? "" : "";
    const itemCode = isVariation ? `VO-${String(existingCount).padStart(2, "0")}` : `${existingCount}`;
    const billingMode: BoqBillingMode = defaultMode;
    setRows((prev) => [
      ...prev,
      {
        _key: nextKey(),
        sortOrder: prev.length,
        section: isVariation ? t("boq.variations_section_default") : lastSection || null,
        itemCode,
        costCode: null,
        description: "",
        unit: billingMode === "progress" ? "LS" : "m²",
        billingMode,
        contractQty: 1,
        unitRate: 0,
        contractAmount: 0,
        isVariation,
        variationRef: isVariation ? itemCode : null,
        notes: null,
        certifiedQty: 0,
        certifiedPercent: 0,
        certifiedAmount: 0,
        certifiedCertCount: 0,
        isLocked: false,
      },
    ]);
    setDirty(true);
  };

  const duplicateRow = (row: EditableRow) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r._key === row._key);
      const copy: EditableRow = {
        ...row,
        id: undefined,
        _key: nextKey(),
        itemCode: `${row.itemCode}-B`,
        certifiedQty: 0,
        certifiedPercent: 0,
        certifiedAmount: 0,
        certifiedCertCount: 0,
        isLocked: false,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    setDirty(true);
  };

  const moveRow = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
    setDirty(true);
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r._key !== key));
    setDirty(true);
  };

  const handleImportExcel = async (file: File | null) => {
    if (!file) return;
    try {
      const { items, warnings } = await parseContractBoqExcel(file, defaultMode);
      if (items.length === 0) {
        toast({
          title: t("boq.import_empty_title"),
          description: t("boq.import_empty_desc"),
          variant: "destructive",
        });
        return;
      }
      setRows((prev) => [
        ...prev,
        ...items.map((it) => ({
          ...it,
          _key: nextKey(),
          certifiedQty: 0,
          certifiedPercent: 0,
          certifiedAmount: 0,
          certifiedCertCount: 0,
          isLocked: false,
        })),
      ]);
      setDirty(true);
      toast({
        title: t("boq.import_success_title", { count: items.length }),
        description:
          warnings.length > 0
            ? t("boq.import_success_warn", { count: warnings.length })
            : t("boq.import_success_desc"),
      });
    } catch (e) {
      toast({
        title: t("boq.import_failed"),
        description: errorMessage(e),
        variant: "destructive",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (let i = 0; i < rows.length; i++) {
        if (!rows[i].itemCode.trim() || !rows[i].description.trim()) {
          throw new Error(t("boq.row_required_err", { row: i + 1 }));
        }
      }
      const payload = {
        items: rows.map((r, idx) => ({
          id: r.id,
          projectBoqItemId: r.projectBoqItemId ?? null,
          sortOrder: idx,
          section: r.section?.trim() || null,
          itemCode: r.itemCode.trim(),
          costCode: r.costCode?.trim() || null,
          description: r.description.trim(),
          unit: r.unit.trim() || "LS",
          billingMode: r.billingMode,
          contractQty: Number(r.contractQty || 0),
          unitRate: Number(r.unitRate || 0),
          isVariation: Boolean(r.isVariation),
          variationRef: r.isVariation ? r.variationRef?.trim() || null : null,
          notes: r.notes?.trim() || null,
        })),
      };
      const res = await apiRequest("PUT", `/api/payments/subcontractor-contracts/${contractId}/boq`, payload);
      return res.json();
    },
    onSuccess: () => {
      setDirty(false);
      invalidatePayments(queryClient);
      queryClient.invalidateQueries({ queryKey: ["payments", "contract-boq", contractId] });
      queryClient.invalidateQueries({ queryKey: ["payments", "contract-boq-preview", contractId] });
      toast({ title: t("boq.saved_toast") });
      onSaved?.();
    },
    onError: (e) => {
      toast({
        title: t("errors.save_failed"),
        description: errorMessage(e),
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0 w-full">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border bg-card p-3.5 space-y-1">
          <div className="text-[11px] font-semibold text-muted-foreground">{t("boq.original_scope")}</div>
          <div className="text-lg font-black tabular-nums">{money(totals.original)}</div>
          <div className="text-[11px] text-muted-foreground">
            {t("boq.original_items_count", { count: rows.filter((r) => !r.isVariation).length })}
          </div>
        </div>

        <div className="rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/20 p-3.5 space-y-1">
          <div className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">{t("boq.variations_total")}</div>
          <div className="text-lg font-black tabular-nums text-sky-700 dark:text-sky-300">{money(totals.variations)}</div>
          <div className="text-[11px] text-muted-foreground">
            {t("boq.vo_items_count", { count: rows.filter((r) => r.isVariation).length })}
          </div>
        </div>

        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3.5 space-y-1">
          <div className="text-[11px] font-bold text-primary">{t("boq.revised_total")}</div>
          <div className="text-lg font-black tabular-nums text-primary">{money(totals.revised)}</div>
          <div className="text-[11px] text-muted-foreground">
            {totals.qtyCount} {t("boq.mode_qty_short")} · {totals.pctCount} {t("boq.mode_progress_short")}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-3.5 space-y-1">
          <div className="text-[11px] font-semibold text-muted-foreground">{t("boq.certified_to_date")}</div>
          <div className="text-lg font-black tabular-nums text-emerald-600 dark:text-emerald-400">
            {money(totals.certified)}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t("boq.certified_pct", { pct: totals.progressPct.toFixed(1) })} · {t("boq.remaining_short")}{" "}
            <span className="font-semibold tabular-nums">{money(totals.remaining)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-muted/20 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <>
              <Button type="button" size="sm" variant="default" className="h-8 rounded-xl gap-1.5 text-xs" onClick={() => addRow(false)}>
                <Plus className="w-3.5 h-3.5" />
                {t("boq.add_item")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-xl gap-1.5 text-xs border-sky-400 text-sky-700 dark:text-sky-300 hover:bg-sky-50"
                onClick={() => addRow(true)}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {t("boq.add_variation")}
              </Button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {canEdit && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => handleImportExcel(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-xl gap-1.5 text-xs"
                onClick={() => downloadContractBoqTemplate(isAr)}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>{t("boq.template_btn")}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-xl gap-1.5 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{t("boq.import_excel")}</span>
              </Button>
            </>
          )}

          {rows.length > 0 && data?.contract && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-xl gap-1.5 text-xs"
              onClick={() => exportContractBoqExcel(data.contract, rows, isAr)}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t("boq.export_btn")}</span>
            </Button>
          )}

          {canEdit && (
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-xl gap-1.5 text-xs font-bold shadow-xs"
              disabled={saveMutation.isPending || !dirty}
              onClick={() => saveMutation.mutate()}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saveMutation.isPending ? t("boq.saving") : t("boq.save_boq")}</span>
            </Button>
          )}
        </div>
      </div>

      <datalist id="boq-units-datalist">
        {BOQ_COMMON_UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <div className="rounded-2xl border bg-card overflow-auto max-h-[55vh] w-full">
        <table className="w-full caption-bottom text-sm">
            <TableHeader className="bg-muted/70 sticky top-0 z-10">
              <TableRow className="text-[11px] whitespace-nowrap">
                <TableHead className="min-w-[96px]">{t("boq.th_item_no")}</TableHead>
                <TableHead className="min-w-[165px]">{t("boq.th_section")}</TableHead>
                <TableHead className="min-w-[260px]">{t("boq.th_description")}</TableHead>
                <TableHead className="min-w-[96px]">{t("boq.th_unit")}</TableHead>
                <TableHead className="min-w-[145px]">{t("boq.th_billing_mode")}</TableHead>
                <TableHead className="min-w-[105px] text-end">{t("boq.th_contract_qty")}</TableHead>
                <TableHead className="min-w-[115px] text-end">{t("boq.th_unit_rate")}</TableHead>
                <TableHead className="min-w-[115px] text-end">{t("boq.th_contract_amt")}</TableHead>
                <TableHead className="min-w-[110px]">{t("boq.th_scope_vo")}</TableHead>
                <TableHead className="min-w-[90px] text-end">{t("boq.th_certified")}</TableHead>
                {canEdit && <TableHead className="min-w-[104px] text-center">{t("boq.th_actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canEdit ? 11 : 10} className="py-10 text-center text-muted-foreground text-xs space-y-2">
                    <p className="font-semibold text-foreground">{t("boq.empty_contract_title")}</p>
                    <p>{t("boq.empty_contract_desc")}</p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, idx) => {
                  const locked = Boolean(row.isLocked);
                  const rowAmt = computeBoqContractAmount(row.contractQty, row.unitRate);
                  return (
                    <TableRow
                      key={row._key}
                      className={row.isVariation ? "bg-sky-50/40 dark:bg-sky-950/15" : undefined}
                    >
                      <TableCell className="p-1.5">
                        <Input
                          value={row.itemCode}
                          disabled={!canEdit}
                          onChange={(e) => updateRow(row._key, { itemCode: e.target.value })}
                          className="h-8 text-xs font-mono px-2"
                          placeholder="1.1"
                        />
                      </TableCell>
                      <TableCell className="p-1.5">
                        <Input
                          value={row.section ?? ""}
                          disabled={!canEdit}
                          onChange={(e) => updateRow(row._key, { section: e.target.value })}
                          className="h-8 text-xs px-2"
                          placeholder={t("boq.section_placeholder")}
                        />
                      </TableCell>
                      <TableCell className="p-1.5">
                        <Input
                          value={row.description}
                          disabled={!canEdit}
                          onChange={(e) => updateRow(row._key, { description: e.target.value })}
                          className="h-8 text-xs px-2"
                          placeholder={t("boq.desc_placeholder")}
                        />
                      </TableCell>
                      <TableCell className="p-1.5">
                        <Input
                          list="boq-units-datalist"
                          value={row.unit}
                          disabled={!canEdit}
                          onChange={(e) => updateRow(row._key, { unit: e.target.value })}
                          className="h-8 text-xs px-2 text-center"
                          placeholder="m²"
                        />
                      </TableCell>
                      <TableCell className="p-1.5">
                        <Select
                          value={row.billingMode}
                          disabled={!canEdit || locked}
                          onValueChange={(v) =>
                            updateRow(row._key, {
                              billingMode: v as BoqBillingMode,
                              unit: v === "progress" && (!row.unit || row.unit === "m²") ? "LS" : row.unit,
                            })
                          }
                        >
                          <SelectTrigger
                            className="h-8 text-xs px-2"
                            title={locked ? t("boq.locked_mode_tip") : undefined}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="qty">{t("boq.mode_qty_select")}</SelectItem>
                            <SelectItem value="progress">{t("boq.mode_progress_short")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="p-1.5">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          disabled={!canEdit}
                          value={row.contractQty}
                          onChange={(e) => updateRow(row._key, { contractQty: Number(e.target.value || 0) })}
                          className="h-8 text-xs text-end tabular-nums px-2"
                        />
                      </TableCell>
                      <TableCell className="p-1.5">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={!canEdit || locked}
                          value={row.unitRate}
                          onChange={(e) => updateRow(row._key, { unitRate: Number(e.target.value || 0) })}
                          className="h-8 text-xs text-end tabular-nums px-2"
                          title={locked ? t("boq.locked_rate_tip") : undefined}
                        />
                      </TableCell>
                      <TableCell className="p-1.5 text-end font-bold tabular-nums text-xs whitespace-nowrap">
                        {money(rowAmt)}
                      </TableCell>
                      <TableCell className="p-1.5">
                        {row.isVariation ? (
                          <div className="flex items-center gap-1">
                            <Badge variant="secondary" className="bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200 text-[10px] px-1.5 shrink-0">
                              VO
                            </Badge>
                            <Input
                              value={row.variationRef ?? ""}
                              disabled={!canEdit}
                              onChange={(e) => updateRow(row._key, { variationRef: e.target.value })}
                              className="h-7 text-[11px] font-mono px-1.5"
                              placeholder="VO-01"
                            />
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {t("boq.scope_original")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="p-1.5 text-end text-xs tabular-nums whitespace-nowrap">
                        {locked ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                            <Lock className="w-3 h-3" />
                            {Number(row.certifiedPercent || 0).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0%</span>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="p-1.5">
                          <div className="flex items-center justify-center gap-0.5">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              disabled={idx === 0}
                              onClick={() => moveRow(idx, -1)}
                              title={t("boq.move_up")}
                            >
                              <ArrowUp className="w-3 h-3" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              disabled={idx === rows.length - 1}
                              onClick={() => moveRow(idx, 1)}
                              title={t("boq.move_down")}
                            >
                              <ArrowDown className="w-3 h-3" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => duplicateRow(row)}
                              title={t("boq.duplicate")}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              disabled={locked}
                              onClick={() => removeRow(row._key)}
                              title={locked ? t("boq.locked_delete_tip") : t("common.delete")}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
        </table>
      </div>

      {rows.some((r) => r.isLocked) && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
          <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>{t("boq.locked_footer_hint")}</span>
        </div>
      )}
    </div>
  );
}
