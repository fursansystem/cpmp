import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Lock, ExternalLink, History } from "lucide-react";
import { format } from "date-fns";
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

const sourceLabel: Record<string, string> = {
  manual: "يدوي (Manual)",
  wir: "فحص معتمد (Approved WIR)",
  override: "تعديل المدير (Admin override)",
  relink: "تغيير الربط (Relink)",
  restructure: "إعادة هيكلة (Restructure)",
  delete: "حذف (Delete)",
};

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
            {node.code} — {node.nameAr}
          </DialogTitle>
          <DialogDescription>
            الوحدة (Unit) {unit.label}{unit.buildingNo ? ` · مبنى (Building) ${unit.buildingNo}` : ""}{unit.floor ? ` · ${unit.floor}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">النسبة (Percent)</div>
            <div className="text-xl font-bold">{cell ? `${cell.percent}%` : "—"}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">المصدر (Source)</div>
            <div className="font-medium">{cell ? sourceLabel[cell.source] ?? cell.source : "—"}</div>
          </div>
          <div className="rounded-lg border p-3 col-span-2">
            <div className="text-xs text-muted-foreground">طلب الفحص (WIR)</div>
            {cell?.requestId ? (
              <Link href={`/requests/${cell.requestId}`} className="font-medium text-blue-600 hover:underline inline-flex items-center gap-1">
                {cell.requestNumber} {cell.approvalStatusCode && <Badge variant="outline">{cell.approvalStatusCode}</Badge>}
                <ExternalLink className="w-3 h-3" />
              </Link>
            ) : <div className="font-medium">—</div>}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">السجل (History)</div>
          <div className="max-h-56 overflow-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="p-2 text-left">التاريخ (Date)</th>
                  <th className="p-2 text-left">من ← إلى (Old → New)</th>
                  <th className="p-2 text-left">المصدر (Source)</th>
                  <th className="p-2 text-left">بواسطة (By)</th>
                  <th className="p-2 text-left">السبب (Reason)</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">Loading…</td></tr>}
                {!isLoading && !data?.logs.length && <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">لا يوجد سجل (No history)</td></tr>}
                {data?.logs.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">{format(new Date(l.changedAt), "yyyy/MM/dd HH:mm")}</td>
                    <td className="p-2 whitespace-nowrap">{l.oldPercent ?? "—"} → {l.newPercent ?? "—"}</td>
                    <td className="p-2">{sourceLabel[l.source] ?? l.source}{l.requestNumber ? ` · ${l.requestNumber}` : ""}</td>
                    <td className="p-2">{l.changedByName ?? "النظام (System)"}</td>
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
              {locked ? "تعديل مدير النظام (System admin override)" : "تعديل النسبة (Edit percent)"}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>النسبة % (Percent, empty = clear)</Label>
                <Input type="number" min={0} max={100} step="0.01" value={percent} onChange={(e) => setPercent(e.target.value)} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>السبب (Reason){needsReason ? " *" : ""}</Label>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
          </div>
        ) : locked ? (
          <p className="text-xs text-muted-foreground">
            هذه الخانة مقفلة بفحص معتمد، ولا يعدّلها إلا مدير النظام. (Locked by an approved WIR — only a system admin can change it.)
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق (Close)</Button>
          {editable && (
            <Button onClick={save} disabled={!valid || (needsReason && !reason.trim())}>حفظ (Save)</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
