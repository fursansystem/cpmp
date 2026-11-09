import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Lock, ExternalLink, History } from "lucide-react";
import { format } from "@/lib/date-format";
import { localizedName } from "@/lib/localized";
import type { MatrixPayloadNode, PmUnit } from "@shared/progress-matrix";
import type { CellEntry } from "./use-progress-matrix";

interface CellHistory {
  cell: {
    percent: number; source: string; locked: boolean; revisionId: string | null; requestId: string | null;
    requestNumber: string | null; approvalStatusCode: string | null; updatedAt: string; updatedByName: string | null;
  } | null;
  logs: {
    id: string; oldPercent: number | null; newPercent: number | null; source: string; requestNumber: string | null;
    reason: string | null; changedAt: string; changedByName: string | null;
  }[];
}

export function CellDialog({ projectId, node, unit, open, onOpenChange, canEdit, canOverride, onSave }: {
  projectId: string;
  node: MatrixPayloadNode | null;
  unit: PmUnit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  canOverride: boolean;
  onSave: (entries: CellEntry[]) => void;
}) {
  const { t } = useTranslation("progress");
  const { data, isLoading } = useQuery<CellHistory>({
    queryKey: ["/api/projects", projectId, "progress-matrix", "cells", "history", { nodeId: node?.id ?? "", unitId: unit?.id ?? "" }],
    enabled: open && !!node && !!unit,
    meta: { persist: false },
  });
  const [percent, setPercent] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) {
      setPercent(data?.cell ? String(data.cell.percent) : "");
      setReason("");
    }
  }, [open, data?.cell?.percent]);

  if (!node || !unit) return null;
  const cell = data?.cell;
  const locked = !!cell?.locked;
  const editable = locked ? canOverride : canEdit;
  const pctNum = percent.trim() === "" ? null : Number(percent);
  const valid = pctNum === null || (Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= 100);
  const needsReason = locked;

  const save = () => {
    onSave([{ nodeId: node.id, unitId: unit.id, percent: pctNum, reason: reason.trim() || null }]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {locked ? <Lock className="w-4 h-4 text-emerald-600" /> : <History className="w-4 h-4" />}
            {node.code} — {localizedName(node)}
          </DialogTitle>
          <DialogDescription>
            {t("cell_dialog.unit_title", { label: unit.label })}{unit.buildingNo ? ` · ${t("cell_dialog.building", { building: unit.buildingNo })}` : ""}{unit.floor ? ` · ${unit.floor}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{t("cell_dialog.percent")}</div>
            <div className="text-xl font-bold">{cell ? `${cell.percent}%` : "—"}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{t("cell_dialog.source")}</div>
            <div className="font-medium">{cell ? t(`cell_dialog.sources.${cell.source}`, { defaultValue: cell.source }) : "—"}</div>
          </div>
          <div className="rounded-lg border p-3 col-span-2">
            <div className="text-xs text-muted-foreground">{t("cell_dialog.wir_request")}</div>
            {cell?.requestId ? (
              <Link href={`/requests/${cell.requestId}`} className="font-medium text-blue-600 hover:underline inline-flex items-center gap-1">
                {cell.requestNumber} {cell.approvalStatusCode && <Badge variant="outline">{cell.approvalStatusCode}</Badge>}
                <ExternalLink className="w-3 h-3" />
              </Link>
            ) : <div className="font-medium">—</div>}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">{t("cell_dialog.history")}</div>
          <div className="max-h-56 overflow-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="p-2 text-start">{t("cell_dialog.table.date")}</th>
                  <th className="p-2 text-start">{t("cell_dialog.table.old_to_new")}</th>
                  <th className="p-2 text-start">{t("cell_dialog.table.source")}</th>
                  <th className="p-2 text-start">{t("cell_dialog.table.by")}</th>
                  <th className="p-2 text-start">{t("cell_dialog.table.reason")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">{t("cell_dialog.loading")}</td></tr>}
                {!isLoading && !data?.logs.length && <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">{t("cell_dialog.no_history")}</td></tr>}
                {data?.logs.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">{format(new Date(l.changedAt), "yyyy/MM/dd HH:mm")}</td>
                    <td className="p-2 whitespace-nowrap">{l.oldPercent ?? "—"} → {l.newPercent ?? "—"}</td>
                    <td className="p-2">{t(`cell_dialog.sources.${l.source}`, { defaultValue: l.source })}{l.requestNumber ? ` · ${l.requestNumber}` : ""}</td>
                    <td className="p-2">{l.changedByName ?? t("cell_dialog.system")}</td>
                    <td className="p-2">{l.reason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {editable ? (
          <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
            <div className="text-sm font-semibold">
              {locked ? t("cell_dialog.edit_admin_title") : t("cell_dialog.edit_title")}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>{t("cell_dialog.percent_label")}</Label>
                <Input type="number" min={0} max={100} step="0.01" value={percent} onChange={(e) => setPercent(e.target.value)} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>{t("cell_dialog.reason_label")}{needsReason ? " *" : ""}</Label>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
          </div>
        ) : locked ? (
          <p className="text-xs text-muted-foreground">
            {t("cell_dialog.locked_note")}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cell_dialog.close")}</Button>
          {editable && (
            <Button onClick={save} disabled={!valid || (needsReason && !reason.trim())}>{t("cell_dialog.save")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
