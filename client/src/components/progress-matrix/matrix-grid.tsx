import { useMemo, useRef, useState, useEffect, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, ChevronDown, Lock, PaintBucket, ChevronLeft, ChevronsDownUp, ChevronsUpDown, Download, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { CELL_LOCKED, CELL_OVERRIDE, type MatrixPayloadNode } from "@shared/progress-matrix";
import { CellDialog } from "./cell-popover";
import { type MatrixModel, type CellEntry, useSaveCells, fmtPct } from "./use-progress-matrix";
import { exportMatrixExcel, readMatrixExcel } from "./excel";

const ALL = "__all__";
const COLS = [
  { key: "code", width: 96 },
  { key: "name", width: 280 },
  { key: "local", width: 64 },
  { key: "global", width: 64 },
  { key: "progress", width: 72 },
];
const LEFT = COLS.reduce<number[]>((acc, c, i) => { acc.push(i === 0 ? 0 : acc[i - 1] + COLS[i - 1].width); return acc; }, []);
const HEADER_H = 28;
const numericSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

function heat(pct: number, leaf: boolean) {
  if (!pct) return undefined;
  const a = Math.min(1, Math.max(0, pct / 100));
  return leaf ? `rgba(16, 185, 129, ${0.08 + a * 0.4})` : `rgba(59, 130, 246, ${0.05 + a * 0.3})`;
}

export function MatrixGrid({ projectId, projectName, model, isAdmin }: {
  projectId: string;
  projectName: string;
  model: MatrixModel;
  isAdmin: boolean;
}) {
  const { payload, summary } = model;
  const { tree } = summary;
  const perms = payload.permissions;
  const { toast } = useToast();
  const saveCells = useSaveCells(projectId, isAdmin);
  const tableRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- filters & paging ----
  const [building, setBuilding] = useState(ALL);
  const [floor, setFloor] = useState(ALL);
  const [vtype, setVtype] = useState(ALL);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(28);
  const [page, setPage] = useState(0);
  const distinct = (pick: (u: typeof payload.units[number]) => string | null | undefined) =>
    Array.from(new Set(payload.units.map(pick).filter(Boolean) as string[])).sort(numericSort);
  const buildings = useMemo(() => distinct((u) => u.buildingNo), [payload.units]);
  const floors = useMemo(() => distinct((u) => u.floor), [payload.units]);
  const types = useMemo(() => distinct((u) => u.villaType), [payload.units]);

  const filteredUnits = useMemo(() => {
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
  const pageCount = Math.max(1, Math.ceil(filteredUnits.length / pageSize));
  useEffect(() => { if (page >= pageCount) setPage(0); }, [pageCount, page]);
  const cols = filteredUnits.slice(page * pageSize, page * pageSize + pageSize);

  // ---- rows ----
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = useMemo(() => tree.order.filter((n) => {
    const chain = tree.ancestors.get(n.id) || [];
    return !chain.slice(1).some((id) => collapsed.has(id));
  }), [tree, collapsed]);
  const toggle = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const collapseToPhases = () => setCollapsed(new Set(tree.roots.map((r) => r.id)));
  const expandAll = () => setCollapsed(new Set());

  // ---- editing ----
  const [editing, setEditing] = useState<{ r: number; c: number; value: string } | null>(null);
  // mirrors `editing` so a blur that follows Enter/Tab/Esc can't commit twice
  const editRef = useRef<{ r: number; c: number; value: string } | null>(null);
  useEffect(() => { editRef.current = editing; }, [editing]);
  const [dialogCell, setDialogCell] = useState<{ node: MatrixPayloadNode; unitIdx: number } | null>(null);
  const [fillNode, setFillNode] = useState<MatrixPayloadNode | null>(null);
  const [fillValue, setFillValue] = useState("100");

  const nodeIdxOf = (n: MatrixPayloadNode) => model.nodeIndex.get(n.id)!;
  const cellOf = (r: number, c: number) => model.cellAt(nodeIdxOf(rows[r] as MatrixPayloadNode), cols[c]);
  const isLeafRow = (r: number) => !!rows[r] && tree.isLeaf(rows[r].id);

  const focusCell = (r: number, c: number) => {
    setTimeout(() => {
      const el = tableRef.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`);
      el?.focus();
    }, 0);
  };
  const nextLeafRow = (r: number, dir: 1 | -1) => {
    for (let i = r + dir; i >= 0 && i < rows.length; i += dir) if (isLeafRow(i)) return i;
    return r;
  };

  const startEdit = (r: number, c: number, initial?: string) => {
    if (!perms.canEdit || !isLeafRow(r)) return;
    const cell = cellOf(r, c);
    if (cell && cell[3] & CELL_LOCKED) {
      setDialogCell({ node: rows[r] as MatrixPayloadNode, unitIdx: cols[c] });
      return;
    }
    setEditing({ r, c, value: initial ?? (cell ? String(cell[2]) : "") });
  };

  const commit = (move?: { dr?: 1 | -1; dc?: 1 | -1 }) => {
    const at = editRef.current;
    if (!at) return;
    editRef.current = null;
    const { r, c, value } = at;
    setEditing(null);
    const node = rows[r];
    const unit = payload.units[cols[c]];
    const cell = cellOf(r, c);
    const trimmed = value.trim();
    const pct = trimmed === "" ? null : Number(trimmed);
    if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      toast({ title: "قيمة غير صحيحة (Invalid value)", description: "Enter a percent between 0 and 100.", variant: "destructive" });
    } else if ((cell ? cell[2] : null) !== (pct === null ? null : Math.round(pct * 100) / 100)) {
      saveCells.mutate([{ nodeId: node.id, unitId: unit.id, percent: pct === null ? null : Math.round(pct * 100) / 100 }]);
    }
    if (move?.dr) focusCell(nextLeafRow(r, move.dr), c);
    else if (move?.dc) focusCell(r, Math.min(cols.length - 1, Math.max(0, c + move.dc)));
    else focusCell(r, c);
  };

  const onCellKey = (e: KeyboardEvent<HTMLTableCellElement>, r: number, c: number) => {
    if (editing) return;
    const cell = cellOf(r, c);
    if (e.key === "ArrowDown") { e.preventDefault(); focusCell(nextLeafRow(r, 1), c); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusCell(nextLeafRow(r, -1), c); }
    else if (e.key === "ArrowRight") { e.preventDefault(); focusCell(r, Math.min(cols.length - 1, c + 1)); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); focusCell(r, Math.max(0, c - 1)); }
    else if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); startEdit(r, c); }
    else if (/^[0-9.]$/.test(e.key)) { e.preventDefault(); startEdit(r, c, e.key); }
    else if ((e.key === "Delete" || e.key === "Backspace") && perms.canEdit && cell && !(cell[3] & CELL_LOCKED)) {
      e.preventDefault();
      saveCells.mutate([{ nodeId: rows[r].id, unitId: payload.units[cols[c]].id, percent: null }]);
    }
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); commit({ dr: e.shiftKey ? -1 : 1 }); }
    else if (e.key === "Tab") { e.preventDefault(); commit({ dc: e.shiftKey ? -1 : 1 }); }
    else if (e.key === "Escape") { e.preventDefault(); const at = editRef.current; editRef.current = null; setEditing(null); if (at) focusCell(at.r, at.c); }
  };

  const applyFill = () => {
    if (!fillNode) return;
    const pct = Number(fillValue);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return;
    const nIdx = nodeIdxOf(fillNode);
    const entries: CellEntry[] = [];
    let locked = 0;
    for (const u of cols) {
      const cell = model.cellAt(nIdx, u);
      if (cell && cell[3] & CELL_LOCKED) { locked++; continue; }
      entries.push({ nodeId: fillNode.id, unitId: payload.units[u].id, percent: pct });
    }
    if (entries.length) saveCells.mutate(entries);
    if (locked) toast({ title: "تم تخطي المقفل (Locked skipped)", description: `${locked} locked cell(s) were not changed.` });
    setFillNode(null);
  };

  const onImport = async (file: File) => {
    try {
      const result = await readMatrixExcel(file, model);
      if (!result.entries.length) {
        toast({ title: "لا تغييرات (No changes)", description: `Locked skipped: ${result.skippedLocked}, unknown units: ${result.unknownUnits}, unknown codes: ${result.unknownCodes}, invalid: ${result.invalid}` });
        return;
      }
      saveCells.mutate(result.entries);
      toast({
        title: "جارٍ الاستيراد (Importing)",
        description: `${result.entries.length} change(s). Locked skipped: ${result.skippedLocked}, non-leaf rows: ${result.skippedNonLeaf}, unknown units: ${result.unknownUnits}, unknown codes: ${result.unknownCodes}, invalid: ${result.invalid}.`,
      });
    } catch (err) {
      toast({ title: "تعذّر قراءة الملف (Could not read file)", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    }
  };

  const stickyLeft = (i: number, extra?: string) => ({
    className: cn("sticky z-10 bg-background border-r border-b", extra),
    style: { left: LEFT[i], minWidth: COLS[i].width, width: COLS[i].width, maxWidth: COLS[i].width },
  });

  if (!payload.nodes.length) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground space-y-2">
        <p className="font-semibold">لا توجد بنود بعد (No items yet)</p>
        <p className="text-sm">ابدأ من تبويب «البنود والأوزان» بتوليد الهيكل من سجل الفحوصات. (Start in the WBS tab: generate items from the WIR log.)</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
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
          <Label className="text-xs">بحث (Search unit)</Label>
          <Input className="h-8 w-36" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Villa No…" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">لكل صفحة (Per page)</Label>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
            <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{[28, 56, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-xs text-muted-foreground px-1 whitespace-nowrap">
            {filteredUnits.length ? `${page * pageSize + 1}–${Math.min(filteredUnits.length, (page + 1) * pageSize)} / ${filteredUnits.length}` : "0"}
          </span>
          <Button size="icon" variant="outline" className="h-8 w-8" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Button size="sm" variant="outline" className="h-8" onClick={expandAll}><ChevronsUpDown className="w-4 h-4 mr-1" />توسيع (Expand)</Button>
          <Button size="sm" variant="outline" className="h-8" onClick={collapseToPhases}><ChevronsDownUp className="w-4 h-4 mr-1" />المراحل (Phases)</Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => exportMatrixExcel(model, projectName)}><Download className="w-4 h-4 mr-1" />Excel</Button>
          {perms.canEdit && (
            <>
              <Button size="sm" variant="outline" className="h-8" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 mr-1" />استيراد (Import)</Button>
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onImport(f); }} />
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3 text-emerald-600" /> مقفل بفحص معتمد (Locked by approved WIR)</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: heat(60, true) }} /> إدخال البند (Leaf entry)</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: heat(60, false) }} /> محسوب (Computed)</span>
        <span>Enter/رقم للتحرير · Enter حفظ ونزول · Tab يمين · Esc إلغاء · Shift+نقرة = السجل (Shift+click = history)</span>
      </div>

      {/* Grid */}
      <div ref={tableRef} className="relative overflow-auto rounded-xl border bg-background max-h-[calc(100vh-330px)] min-h-[300px]">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            {[0, 1, 2, 3].map((hr) => (
              <tr key={hr}>
                {hr === 0 && (
                  <>
                    {["الكود (Code)", "البند (Item)", "الوزن المحلي (Local %)", "الوزن الكلي (Global %)", "الإنجاز (Progress)"].map((label, i) => (
                      <th key={i} rowSpan={4}
                        className="sticky top-0 z-30 bg-muted border-r border-b px-2 text-left font-semibold align-bottom pb-1"
                        style={{ left: LEFT[i], minWidth: COLS[i].width, width: COLS[i].width, height: HEADER_H * 4 }}>
                        {label}
                      </th>
                    ))}
                  </>
                )}
                {cols.map((u) => {
                  const unit = payload.units[u];
                  const content = hr === 0 ? unit.label
                    : hr === 1 ? (unit.floor ?? "")
                      : hr === 2 ? `${(summary.unitShare[u] * 100).toFixed(3)}%`
                        : fmtPct(summary.unitProgress[u]);
                  return (
                    <th key={u}
                      className={cn("sticky z-20 bg-muted border-r border-b px-1 text-center whitespace-nowrap",
                        hr === 0 ? "font-bold" : "font-normal text-muted-foreground", !unit.included && "line-through opacity-60")}
                      style={{ top: hr * HEADER_H, height: HEADER_H, minWidth: 58 }}
                      title={hr === 0 ? `${unit.buildingNo ?? ""} ${unit.flatNo ?? ""}`.trim() : hr === 2 ? "وزن الوحدة (Unit weight)" : hr === 3 ? "إنجاز الوحدة (Unit progress)" : undefined}>
                      {hr === 3 ? <span className="font-semibold text-foreground">{content}</span> : content}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((node, r) => {
              const n = node as MatrixPayloadNode;
              const leaf = tree.isLeaf(n.id);
              const depth = tree.depth.get(n.id) ?? 0;
              const nIdx = nodeIdxOf(n);
              const nodeUnit = summary.nodeUnit.get(n.id);
              const rowBg = depth === 0 ? "bg-slate-100 dark:bg-slate-800" : "bg-background";
              return (
                <tr key={n.id} className={depth === 0 ? "font-semibold" : undefined}>
                  <td {...stickyLeft(0, cn(rowBg, "px-2 whitespace-nowrap"))}>{n.code}</td>
                  <td {...stickyLeft(1, cn(rowBg, "px-1"))}>
                    <div className="flex items-center gap-1" style={{ paddingLeft: depth * 12 }}>
                      {!leaf ? (
                        <button className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => toggle(n.id)}>
                          {collapsed.has(n.id) ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      ) : <span className="w-3.5 shrink-0" />}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate">{n.nameAr}</span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-sm">
                          <div className="font-semibold">{n.nameAr}</div>
                          {n.nameEn && <div>{n.nameEn}</div>}
                          {n.activityCode && <div className="text-muted-foreground">Activity {n.activityCode}{n.levelName ? ` · ${n.levelName}` : ""}</div>}
                        </TooltipContent>
                      </Tooltip>
                      {leaf && perms.canEdit && (
                        <button className="ml-auto shrink-0 text-muted-foreground hover:text-blue-600" title="تطبيق % على كل الوحدات المعروضة (Apply % to all displayed units)"
                          onClick={() => { setFillNode(n); setFillValue("100"); }}>
                          <PaintBucket className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td {...stickyLeft(2, cn(rowBg, "px-2 text-right"))}>{n.weight.toFixed(2)}</td>
                  <td {...stickyLeft(3, cn(rowBg, "px-2 text-right text-muted-foreground"))}>{((tree.globalWeight.get(n.id) ?? 0) * 100).toFixed(2)}</td>
                  <td {...stickyLeft(4, cn(rowBg, "px-2 text-right font-semibold"))}>{fmtPct(summary.nodeProject.get(n.id) ?? 0)}</td>
                  {cols.map((u, c) => {
                    if (!leaf) {
                      const v = nodeUnit ? nodeUnit[u] : 0;
                      return (
                        <td key={u} className="border-r border-b px-1 text-center text-muted-foreground" style={{ background: heat(v, false) }}>
                          {v ? v.toFixed(0) : ""}
                        </td>
                      );
                    }
                    const cell = model.cellAt(nIdx, u);
                    const locked = !!cell && (cell[3] & CELL_LOCKED) !== 0;
                    const override = !!cell && (cell[3] & CELL_OVERRIDE) !== 0;
                    const isEditing = editing?.r === r && editing?.c === c;
                    return (
                      <td key={u} data-cell={`${r}:${c}`} tabIndex={0}
                        className={cn("border-r border-b px-1 text-center relative cursor-cell outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500",
                          locked && "cursor-pointer")}
                        style={{ background: heat(cell ? cell[2] : 0, true) }}
                        onClick={(e) => {
                          if (e.shiftKey || locked) setDialogCell({ node: n, unitIdx: u });
                          else if (!isEditing) startEdit(r, c);
                        }}
                        onKeyDown={(e) => onCellKey(e, r, c)}>
                        {isEditing ? (
                          <input autoFocus type="text" inputMode="decimal"
                            className="w-12 bg-background border rounded px-1 text-center text-xs outline-none"
                            value={editing!.value}
                            onChange={(e) => setEditing({ ...editing!, value: e.target.value })}
                            onKeyDown={onInputKey}
                            onBlur={() => commit()} />
                        ) : (
                          <span className="inline-flex items-center gap-0.5">
                            {cell ? Number(cell[2].toFixed(2)) : ""}
                            {locked && <Lock className={cn("w-2.5 h-2.5", override ? "text-amber-600" : "text-emerald-700")} />}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CellDialog
        projectId={projectId}
        node={dialogCell?.node ?? null}
        unit={dialogCell ? payload.units[dialogCell.unitIdx] : null}
        open={!!dialogCell}
        onOpenChange={(o) => { if (!o) setDialogCell(null); }}
        canEdit={perms.canEdit}
        canOverride={perms.canOverrideLocked}
        onSave={(entries) => saveCells.mutate(entries)}
      />

      <Dialog open={!!fillNode} onOpenChange={(o) => { if (!o) setFillNode(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تطبيق نسبة على الوحدات المعروضة (Apply % to displayed units)</DialogTitle>
            <DialogDescription>
              {fillNode?.code} — {fillNode?.nameAr}. {cols.length} وحدة معروضة (units shown). الخانات المقفلة لن تتغير (Locked cells are skipped).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>النسبة % (Percent)</Label>
            <Input type="number" min={0} max={100} step="0.01" value={fillValue} onChange={(e) => setFillValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFillNode(null)}>إلغاء (Cancel)</Button>
            <Button onClick={applyFill} disabled={!(Number(fillValue) >= 0 && Number(fillValue) <= 100) || fillValue.trim() === ""}>تطبيق (Apply)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
