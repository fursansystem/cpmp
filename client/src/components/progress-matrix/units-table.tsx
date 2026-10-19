import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Download, Upload, Save, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { UnitWeightMode } from "@shared/progress-matrix";
import { type MatrixModel, useMatrixApi, parseApiError, fmtMoney, fmtPct } from "./use-progress-matrix";
import { exportCostAndRatioExcel, readUnitValuesExcel } from "./excel";

const ALL = "__all__";
const MODES: { value: UnitWeightMode; label: string }[] = [
  { value: "equal", label: "بالتساوي (Equal)" },
  { value: "area", label: "بالمساحة (By area m²)" },
  { value: "value", label: "بالقيمة (By value)" },
  { value: "manual", label: "يدوي (Manual)" },
];
const numericSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export function UnitsTable({ projectId, projectName, model }: { projectId: string; projectName: string; model: MatrixModel }) {
  const { payload, summary } = model;
  const canEdit = payload.permissions.canEdit;
  const api = useMatrixApi(projectId);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- settings ----
  const [mode, setMode] = useState<UnitWeightMode>(payload.settings.unitWeightMode);
  const [defaultValue, setDefaultValue] = useState(String(payload.settings.defaultUnitValue || ""));
  const [drive, setDrive] = useState(payload.settings.driveProjectProgress);
  useEffect(() => {
    setMode(payload.settings.unitWeightMode);
    setDefaultValue(String(payload.settings.defaultUnitValue || ""));
    setDrive(payload.settings.driveProjectProgress);
  }, [payload.settings.unitWeightMode, payload.settings.defaultUnitValue, payload.settings.driveProjectProgress]);
  const settingsDirty = mode !== payload.settings.unitWeightMode ||
    (Number(defaultValue) || 0) !== payload.settings.defaultUnitValue || drive !== payload.settings.driveProjectProgress;
  const [saving, setSaving] = useState(false);

  const call = async (fn: () => Promise<unknown>, ok?: string) => {
    setSaving(true);
    try {
      await fn();
      if (ok) toast({ title: "تم الحفظ (Saved)", description: ok });
    } catch (err) {
      toast({ title: "لم يتم الحفظ (Not saved)", description: parseApiError(err).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const saveSettings = () => call(() => api("PATCH", "/progress-matrix/settings", {
    unitWeightMode: mode, defaultUnitValue: Number(defaultValue) || 0, driveProjectProgress: drive,
  }), drive && !payload.settings.driveProjectProgress ? "نسبة المشروع تُحتسب الآن من المصفوفة (Project % now follows the matrix)" : undefined);
  const saveUnits = (entries: { workLocationId: string; unitValue?: number | null; manualWeight?: number | null; included?: boolean }[], ok?: string) =>
    call(() => api("PUT", "/progress-matrix/units", { entries }), ok);

  // ---- filters ----
  const [building, setBuilding] = useState(ALL);
  const [floor, setFloor] = useState(ALL);
  const [vtype, setVtype] = useState(ALL);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const distinct = (pick: (u: typeof payload.units[number]) => string | null | undefined) =>
    Array.from(new Set(payload.units.map(pick).filter(Boolean) as string[])).sort(numericSort);
  const buildings = useMemo(() => distinct((u) => u.buildingNo), [payload.units]);
  const floors = useMemo(() => distinct((u) => u.floor), [payload.units]);
  const types = useMemo(() => distinct((u) => u.villaType), [payload.units]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: number[] = [];
    payload.units.forEach((u, i) => {
      if (building !== ALL && u.buildingNo !== building) return;
      if (floor !== ALL && u.floor !== floor) return;
      if (vtype !== ALL && u.villaType !== vtype) return;
      if (q && !`${u.label} ${u.flatNo ?? ""} ${u.buildingNo ?? ""}`.toLowerCase().includes(q)) return;
      out.push(i);
    });
    return out;
  }, [payload.units, building, floor, vtype, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => { if (page >= pageCount) setPage(0); }, [page, pageCount]);
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const filteredTotals = useMemo(() => {
    const t = { area: 0, value: 0, share: 0, earned: 0, pending: 0, paid: 0, remaining: 0 };
    for (const u of filtered) {
      const unit = payload.units[u];
      if (!unit.included) continue;
      const f = model.financials(u);
      t.area += unit.areaM2 || 0;
      t.value += f.value;
      t.share += summary.unitShare[u];
      t.earned += f.earnedAmount;
      t.pending += f.pendingAmount;
      t.paid += f.paidAmount;
      t.remaining += f.remainingAmount;
    }
    return t;
  }, [filtered, model]);

  // ---- bulk value ----
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkValue, setBulkValue] = useState("");

  const onImport = async (file: File) => {
    try {
      const r = await readUnitValuesExcel(file, model);
      if (!r.entries.length) { toast({ title: "لا قيم (No values found)", description: `Unknown units: ${r.unknown}, invalid: ${r.invalid}` }); return; }
      await saveUnits(r.entries, `${r.entries.length} unit value(s) imported${r.unknown ? `, ${r.unknown} unknown unit(s)` : ""}${r.invalid ? `, ${r.invalid} invalid` : ""}.`);
    } catch (err) {
      toast({ title: "تعذّر قراءة الملف (Could not read file)", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    }
  };

  const commitNumber = (raw: string, current: number | null | undefined, apply: (v: number | null) => void) => {
    const v = raw.trim() === "" ? null : Number(raw);
    if (v !== null && (!Number.isFinite(v) || v < 0)) return;
    if ((current ?? null) === v) return;
    apply(v);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 rounded-xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1">
            <Label>طريقة وزن الوحدات (Unit weighting)</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as UnitWeightMode)} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>القيمة الافتراضية للوحدة (Default unit value)</Label>
            <Input type="number" min={0} step="0.01" value={defaultValue} disabled={!canEdit} onChange={(e) => setDefaultValue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-2">
              <Switch checked={drive} onCheckedChange={setDrive} disabled={!canEdit} />
              احتساب نسبة المشروع من المصفوفة (Drive project %)
            </Label>
            <p className="text-xs text-muted-foreground">
              عند التفعيل تُستبدل نسبة إنجاز المشروع بنسبة المصفوفة ({fmtPct(summary.projectProgress)}). (When on, the project's Overall Progress follows the matrix.)
            </p>
          </div>
          <div className="flex gap-2 md:justify-end">
            {canEdit && <Button onClick={saveSettings} disabled={!settingsDirty || saving}><Save className="w-4 h-4 mr-1" />حفظ الإعدادات (Save)</Button>}
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">المبنى (Building)</Label>
          <Select value={building} onValueChange={(v) => { setBuilding(v); setPage(0); }}>
            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>الكل (All)</SelectItem>{buildings.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">الدور (Floor)</Label>
          <Select value={floor} onValueChange={(v) => { setFloor(v); setPage(0); }}>
            <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>الكل (All)</SelectItem>{floors.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">النوع (Type)</Label>
          <Select value={vtype} onValueChange={(v) => { setVtype(v); setPage(0); }}>
            <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>الكل (All)</SelectItem>{types.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">بحث (Search)</Label>
          <Input className="h-8 w-36" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Villa No…" />
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-xs text-muted-foreground px-1">{page + 1} / {pageCount} · {filtered.length}</span>
          <Button size="icon" variant="outline" className="h-8 w-8" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="ml-auto flex gap-2">
          {canEdit && <Button size="sm" variant="outline" onClick={() => { setBulkValue(defaultValue); setBulkOpen(true); }}><Coins className="w-4 h-4 mr-1" />تعيين قيمة للمفلترة (Set value for filtered)</Button>}
          <Button size="sm" variant="outline" onClick={() => exportCostAndRatioExcel(model, projectName)}><Download className="w-4 h-4 mr-1" />Cost and ratio</Button>
          {canEdit && (
            <>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 mr-1" />استيراد القيم (Import values)</Button>
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onImport(f); }} />
            </>
          )}
        </div>
      </div>

      <div className="overflow-auto rounded-xl border max-h-[calc(100vh-420px)]">
        <table className="w-full text-xs">
          <thead className="bg-muted sticky top-0 z-10">
            <tr className="text-left whitespace-nowrap">
              <th className="p-2">الوحدة (Villa No)</th>
              <th className="p-2">المبنى (Bldg)</th>
              <th className="p-2">الشقة (Flat)</th>
              <th className="p-2">الدور (Floor)</th>
              <th className="p-2">النوع (Type)</th>
              <th className="p-2 text-right">المساحة (m²)</th>
              <th className="p-2 text-right">القيمة (Value)</th>
              <th className="p-2 text-right">الوزن % (Weight)</th>
              <th className="p-2 text-center">مشمولة (Incl.)</th>
              <th className="p-2 text-right">الإنجاز (Earned %)</th>
              <th className="p-2 text-right">قيمة الاستحقاق (Earned)</th>
              <th className="p-2 text-right">المعلّق (Pending)</th>
              <th className="p-2 text-right">المدفوع (Paid)</th>
              <th className="p-2 text-right">المتبقي (Remaining)</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((u) => {
              const unit = payload.units[u];
              const f = model.financials(u);
              return (
                <tr key={unit.id} className={cn("border-t hover:bg-muted/30", !unit.included && "opacity-50")}>
                  <td className="p-2 font-semibold">{unit.label}</td>
                  <td className="p-2">{unit.buildingNo}</td>
                  <td className="p-2">{unit.flatNo}</td>
                  <td className="p-2">{unit.floor}</td>
                  <td className="p-2">{unit.villaType}</td>
                  <td className="p-2 text-right">{unit.areaM2 != null ? unit.areaM2.toFixed(2) : ""}</td>
                  <td className="p-1 text-right">
                    {canEdit ? (
                      <Input key={`${unit.id}:${unit.unitValue ?? ""}`} type="number" min={0} step="0.01"
                        className="h-7 w-32 ml-auto text-right text-xs"
                        defaultValue={unit.unitValue ?? ""} placeholder={fmtMoney(payload.settings.defaultUnitValue)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        onBlur={(e) => commitNumber(e.target.value, unit.unitValue, (v) => saveUnits([{ workLocationId: unit.id, unitValue: v }]))} />
                    ) : fmtMoney(f.value)}
                  </td>
                  <td className="p-1 text-right">
                    {canEdit && mode === "manual" ? (
                      <Input key={`${unit.id}:w:${unit.manualWeight ?? ""}`} type="number" min={0} step="0.0001"
                        className="h-7 w-24 ml-auto text-right text-xs" defaultValue={unit.manualWeight ?? ""}
                        title={`= ${(summary.unitShare[u] * 100).toFixed(4)}% after normalizing`}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        onBlur={(e) => commitNumber(e.target.value, unit.manualWeight, (v) => saveUnits([{ workLocationId: unit.id, manualWeight: v }]))} />
                    ) : `${(summary.unitShare[u] * 100).toFixed(4)}`}
                  </td>
                  <td className="p-2 text-center">
                    <Checkbox checked={unit.included} disabled={!canEdit}
                      onCheckedChange={(c) => saveUnits([{ workLocationId: unit.id, included: !!c }])} />
                  </td>
                  <td className="p-2 text-right font-semibold">{fmtPct(f.earnedPct, 2)}</td>
                  <td className="p-2 text-right">{fmtMoney(f.earnedAmount)}</td>
                  <td className="p-2 text-right text-amber-700">{f.pendingAmount ? `${fmtMoney(f.pendingAmount)} (${fmtPct(f.pendingPct, 2)})` : ""}</td>
                  <td className="p-2 text-right text-emerald-700">{f.paidAmount ? `${fmtMoney(f.paidAmount)} (${fmtPct(f.paidPct, 2)})` : ""}</td>
                  <td className="p-2 text-right">{fmtMoney(f.remainingAmount)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/70 sticky bottom-0 font-semibold">
            <tr className="border-t">
              <td className="p-2" colSpan={5}>المجموع للمفلترة (Filtered total) — {filtered.length}</td>
              <td className="p-2 text-right">{filteredTotals.area.toFixed(2)}</td>
              <td className="p-2 text-right">{fmtMoney(filteredTotals.value)}</td>
              <td className="p-2 text-right">{(filteredTotals.share * 100).toFixed(4)}</td>
              <td />
              <td className="p-2 text-right">{filteredTotals.value ? fmtPct((filteredTotals.earned / filteredTotals.value) * 100, 2) : ""}</td>
              <td className="p-2 text-right">{fmtMoney(filteredTotals.earned)}</td>
              <td className="p-2 text-right">{fmtMoney(filteredTotals.pending)}</td>
              <td className="p-2 text-right">{fmtMoney(filteredTotals.paid)}</td>
              <td className="p-2 text-right">{fmtMoney(filteredTotals.remaining)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعيين قيمة للوحدات المفلترة (Set value for filtered units)</DialogTitle>
            <DialogDescription>
              {filtered.length} وحدة (units). اترك الحقل فارغاً لاستخدام القيمة الافتراضية. (Leave empty to use the default value.)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>القيمة (Value)</Label>
            <Input type="number" min={0} step="0.01" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>إلغاء (Cancel)</Button>
            <Button disabled={saving || (bulkValue.trim() !== "" && !(Number(bulkValue) >= 0))} onClick={() => {
              const v = bulkValue.trim() === "" ? null : Number(bulkValue);
              setBulkOpen(false);
              saveUnits(filtered.map((u) => ({ workLocationId: payload.units[u].id, unitValue: v })), `${filtered.length} unit(s) updated`);
            }}>تطبيق (Apply)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
