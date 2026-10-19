import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  ChevronDown, ChevronRight, MoreHorizontal, Plus, Wand2, RefreshCw, Download, Upload, Link2, Lock,
  Scissors, Scale, Pencil, Trash2, Save, Undo2, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { MatrixPayloadNode } from "@shared/progress-matrix";
import type { WorkListActivity, WorkListChapter, WorkListDivision, WorkLevel } from "@shared/schema";
import { type MatrixModel, useMatrixApi, parseApiError } from "./use-progress-matrix";
import { exportWbsExcel, readWbsExcel } from "./excel";

type NodeForm = {
  mode: "create" | "edit";
  id?: string;
  parentId: string | null;
  code: string;
  nameAr: string;
  nameEn: string;
  weight: string;
  workListActivityId: string | null;
  workLevelId: string | null;
};
const NONE = "__none__";

function equalWeights(count: number) {
  if (count <= 0) return [];
  const each = Math.floor((100 / count) * 10000) / 10000;
  const out = Array(count).fill(each);
  out[count - 1] = Math.round((100 - each * (count - 1)) * 10000) / 10000;
  return out as number[];
}

export function WbsEditor({ projectId, projectName, model }: { projectId: string; projectName: string; model: MatrixModel }) {
  const { payload, summary } = model;
  const { tree } = summary;
  const canEdit = payload.permissions.canEdit;
  const api = useMatrixApi(projectId);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: activities = [] } = useQuery<WorkListActivity[]>({ queryKey: ["/api/work-list-activities"], staleTime: 10 * 60 * 1000 });
  const { data: chapters = [] } = useQuery<WorkListChapter[]>({ queryKey: ["/api/work-list-chapters"], staleTime: 10 * 60 * 1000 });
  const { data: divisions = [] } = useQuery<WorkListDivision[]>({ queryKey: ["/api/work-list-divisions"], staleTime: 10 * 60 * 1000 });
  const { data: levels = [] } = useQuery<WorkLevel[]>({ queryKey: ["/api/projects", projectId, "work-levels"] });
  const activityById = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);

  // ---- tree view ----
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = useMemo(() => tree.order.filter((n) => !(tree.ancestors.get(n.id) || []).slice(1).some((id) => collapsed.has(id))), [tree, collapsed]);
  const toggle = (id: string) => setCollapsed((p) => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s; });

  // ---- pending weight edits ----
  const [dirty, setDirty] = useState<Map<string, string>>(new Map());
  const weightOf = (n: MatrixPayloadNode) => {
    const d = dirty.get(n.id);
    return d !== undefined ? Number(d) || 0 : n.weight;
  };
  const childSum = (id: string) => (tree.children.get(id) || []).reduce((s, c) => s + weightOf(c as MatrixPayloadNode), 0);
  const rootSum = tree.roots.reduce((s, r) => s + weightOf(r as MatrixPayloadNode), 0);

  const run = async <T,>(label: string, fn: () => Promise<T>, done?: (r: T) => string) => {
    setBusy(label);
    try {
      const r = await fn();
      if (done) toast({ title: "تم (Done)", description: done(r) });
      return r;
    } catch (err) {
      toast({ title: "فشلت العملية (Failed)", description: parseApiError(err).message, variant: "destructive" });
      throw err;
    } finally {
      setBusy(null);
    }
  };

  const saveWeights = () => run("weights", async () => {
    const entries = Array.from(dirty.entries()).map(([id, w]) => ({ id, weight: Math.max(0, Math.min(100, Number(w) || 0)) }));
    await api("PUT", "/progress-matrix/nodes/weights", { entries });
    setDirty(new Map());
    return entries.length;
  }, (n) => `${n} weight(s) saved`).catch(() => {});

  const equalize = (parentId: string | null) => run("equalize", async () => {
    const kids = (parentId ? tree.children.get(parentId) : tree.roots) || [];
    const ws = equalWeights(kids.length);
    await api("PUT", "/progress-matrix/nodes/weights", { entries: kids.map((k, i) => ({ id: k.id, weight: ws[i] })) });
    setDirty((p) => { const s = new Map(p); kids.forEach((k) => s.delete(k.id)); return s; });
    return kids.length;
  }, (n) => `${n} item(s) set to equal weights`).catch(() => {});

  // ---- generate / sync ----
  const [divisionsOpen, setDivisionsOpen] = useState(false);
  const [pickedDivisions, setPickedDivisions] = useState<Set<string>>(new Set());
  const generate = (body: { source: "wir" | "divisions"; divisionIds?: string[] }) =>
    run("generate", () => api<any>("POST", "/progress-matrix/wbs/generate", body),
      (r) => `Added ${r.phases} phase(s), ${r.items} item(s), ${r.leaves} linked sub-item(s). ${r.cellsSynced} cell(s) filled from approved WIRs.`).catch(() => {});
  const sync = () => run("sync", () => api<any>("POST", "/progress-matrix/sync-wir"),
    (r) => `${r.applied} new cell(s) set to 100% (${r.matched} approved item/unit pairs matched).`).catch(() => {});

  // ---- node dialog ----
  const [form, setForm] = useState<NodeForm | null>(null);
  const [confirm, setConfirm] = useState<{ message: string; total: number; locked: number; retry: () => void } | null>(null);
  const openCreate = (parentId: string | null) => setForm({
    mode: "create", parentId, code: "", nameAr: "", nameEn: "", weight: "", workListActivityId: null, workLevelId: null,
  });
  const openEdit = (n: MatrixPayloadNode) => setForm({
    mode: "edit", id: n.id, parentId: n.parentId, code: n.code, nameAr: n.nameAr, nameEn: n.nameEn ?? "",
    weight: String(n.weight), workListActivityId: n.workListActivityId ?? null, workLevelId: n.workLevelId ?? null,
  });

  // Runs a request; if the server says cells would be removed, asks first and retries with confirmDropCells.
  const withConfirm = async (send: (confirmDropCells: boolean) => Promise<unknown>, onDone: () => void) => {
    try {
      await send(false);
      onDone();
    } catch (err) {
      const e = parseApiError(err);
      if (e.status === 409 && e.data?.needsConfirm) {
        setConfirm({
          message: e.message, total: e.data.total ?? 0, locked: e.data.locked ?? 0,
          retry: () => { send(true).then(onDone).catch((er) => toast({ title: "فشلت العملية (Failed)", description: parseApiError(er).message, variant: "destructive" })); },
        });
      } else {
        toast({ title: "فشلت العملية (Failed)", description: e.message, variant: "destructive" });
      }
    }
  };

  const submitForm = () => {
    if (!form) return;
    const body: Record<string, unknown> = {
      nameAr: form.nameAr.trim(),
      nameEn: form.nameEn.trim() || null,
      workListActivityId: form.workListActivityId,
      workLevelId: form.workLevelId,
    };
    if (form.code.trim()) body.code = form.code.trim();
    if (form.weight.trim() !== "") body.weight = Number(form.weight);
    const f = form;
    withConfirm(
      (confirmDropCells) => f.mode === "create"
        ? api("POST", "/progress-matrix/nodes", { ...body, parentId: f.parentId, confirmDropCells })
        : api("PATCH", `/progress-matrix/nodes/${f.id}`, { ...body, confirmDropCells }),
      () => { setForm(null); toast({ title: "تم الحفظ (Saved)" }); },
    );
  };

  // ---- split by level ----
  const [splitNode, setSplitNode] = useState<MatrixPayloadNode | null>(null);
  const [splitLevels, setSplitLevels] = useState<Set<string>>(new Set());
  const { data: usedLevels, isFetching: loadingLevels } = useQuery<{ id: string; code: string; nameEn: string; nameAr: string }[]>({
    queryKey: ["/api/projects", projectId, "progress-matrix", "nodes", splitNode?.id ?? "", "levels"],
    enabled: !!splitNode,
    meta: { persist: false },
  });
  const openSplit = (n: MatrixPayloadNode) => { setSplitNode(n); setSplitLevels(new Set()); };
  const levelChoices = useMemo(() => {
    const used = new Set((usedLevels || []).map((l) => l.id));
    return [...(usedLevels || []).map((l) => ({ ...l, used: true })), ...levels.filter((l) => !used.has(l.id)).map((l) => ({ id: l.id, code: l.code, nameEn: l.nameEnglish, nameAr: l.nameArabic, used: false }))];
  }, [usedLevels, levels]);
  const effectiveSplit = splitLevels.size ? splitLevels : new Set((usedLevels || []).map((l) => l.id));
  const submitSplit = () => {
    const n = splitNode;
    if (!n) return;
    withConfirm(
      (confirmDropCells) => api("POST", `/progress-matrix/nodes/${n.id}/split-levels`, { levelIds: Array.from(effectiveSplit), confirmDropCells }),
      () => { setSplitNode(null); toast({ title: "تم التقسيم (Split done)" }); },
    );
  };

  // ---- delete ----
  const [deleteNode, setDeleteNode] = useState<MatrixPayloadNode | null>(null);
  const descendantCount = (id: string) => tree.order.filter((n) => (tree.ancestors.get(n.id) || []).slice(1).includes(id)).length;

  // ---- import ----
  const onImport = async (file: File) => {
    try {
      const rows = await readWbsExcel(file);
      if (!rows.length) { toast({ title: "الملف فارغ (Empty file)" }); return; }
      await run("import", () => api<any>("POST", "/progress-matrix/wbs/import", { rows }),
        (r) => `${r.created} created, ${r.updated} updated. ${r.cellsSynced} cell(s) filled from approved WIRs${r.purgedCells ? `, ${r.purgedCells} cell(s) removed from items that now have sub-items` : ""}.`);
    } catch (err) {
      if (!(err instanceof Error && /^\d{3}:/.test(err.message))) {
        toast({ title: "تعذّر قراءة الملف (Could not read file)", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
      }
    }
  };

  const linkLabel = (n: MatrixPayloadNode) => {
    if (!n.workListActivityId) return null;
    const a = activityById.get(n.workListActivityId);
    return `${n.activityCode ?? a?.code ?? ""} ${a?.nameEnglish ?? n.activityName ?? ""}`.trim();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <>
            <Button size="sm" onClick={() => generate({ source: "wir" })} disabled={!!busy}>
              <Wand2 className="w-4 h-4 mr-1" />{busy === "generate" ? "…" : "توليد من سجل WIR (Generate from WIR log)"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setPickedDivisions(new Set()); setDivisionsOpen(true); }} disabled={!!busy}>
              توليد من أقسام… (From divisions…)
            </Button>
            <Button size="sm" variant="outline" onClick={sync} disabled={!!busy}>
              <RefreshCw className={cn("w-4 h-4 mr-1", busy === "sync" && "animate-spin")} />مزامنة من الفحوصات المعتمدة (Sync approved WIRs)
            </Button>
            <Button size="sm" variant="outline" onClick={() => openCreate(null)} disabled={!!busy}>
              <Plus className="w-4 h-4 mr-1" />إضافة مرحلة (Add phase)
            </Button>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => exportWbsExcel(model, levels, projectName)}><Download className="w-4 h-4 mr-1" />Excel</Button>
          {canEdit && (
            <>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={!!busy}><Upload className="w-4 h-4 mr-1" />استيراد (Import)</Button>
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onImport(f); }} />
            </>
          )}
        </div>
      </div>

      {dirty.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm">
          <span>{dirty.size} وزن غير محفوظ (unsaved weight changes)</span>
          <Button size="sm" onClick={saveWeights} disabled={!!busy}><Save className="w-4 h-4 mr-1" />حفظ الأوزان (Save weights)</Button>
          <Button size="sm" variant="ghost" onClick={() => setDirty(new Map())}><Undo2 className="w-4 h-4 mr-1" />تراجع (Discard)</Button>
        </div>
      )}

      {!payload.nodes.length ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          لا توجد بنود. استخدم «توليد من سجل WIR» لإنشاء المراحل والبنود من طلبات الفحص الخاصة بالمشروع.
          <div className="text-xs mt-1">(No items. Use "Generate from WIR log" to build phases and items from this project's inspection requests.)</div>
        </div>
      ) : (
        <div className="overflow-auto rounded-xl border max-h-[calc(100vh-330px)]">
          <table className="w-full text-sm">
            <thead className="bg-muted sticky top-0 z-10">
              <tr className="text-left">
                <th className="p-2 w-36">الكود (Code)</th>
                <th className="p-2">البند (Item)</th>
                <th className="p-2 w-28 text-right">الوزن % (Weight)</th>
                <th className="p-2 w-28 text-center">Σ الأبناء (Children)</th>
                <th className="p-2">الربط (Link)</th>
                <th className="p-2 w-24 text-center">الخانات (Cells)</th>
                <th className="p-2 w-10" />
              </tr>
              <tr className="bg-muted/60 text-xs">
                <td colSpan={2} className="px-2 py-1 text-muted-foreground">مجموع المراحل (Phases total)</td>
                <td className="px-2 py-1 text-right" />
                <td className="px-2 py-1 text-center">
                  <Badge variant="outline" className={cn(Math.abs(rootSum - 100) > 0.01 ? "border-red-400 text-red-600" : "border-emerald-400 text-emerald-700")}>
                    {rootSum.toFixed(2)}%
                  </Badge>
                </td>
                <td colSpan={3} className="px-2 py-1">
                  {canEdit && <button className="text-xs text-blue-600 hover:underline" onClick={() => equalize(null)}>توزيع متساوٍ (Equalize phases)</button>}
                </td>
              </tr>
            </thead>
            <tbody>
              {rows.map((node) => {
                const n = node as MatrixPayloadNode;
                const leaf = tree.isLeaf(n.id);
                const depth = tree.depth.get(n.id) ?? 0;
                const sum = leaf ? null : childSum(n.id);
                const counts = model.subtreeCellCounts(n.id);
                const link = linkLabel(n);
                const isDirty = dirty.has(n.id);
                return (
                  <tr key={n.id} className={cn("border-t hover:bg-muted/30", depth === 0 && "bg-slate-50 dark:bg-slate-900 font-semibold")}>
                    <td className="p-2 whitespace-nowrap font-mono text-xs">{n.code}</td>
                    <td className="p-2">
                      <div className="flex items-start gap-1" style={{ paddingLeft: depth * 16 }}>
                        {!leaf ? (
                          <button className="mt-0.5 text-muted-foreground" onClick={() => toggle(n.id)}>
                            {collapsed.has(n.id) ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        ) : <span className="w-4" />}
                        <div>
                          <div>{n.nameAr}</div>
                          {n.nameEn && <div className="text-xs text-muted-foreground font-normal">{n.nameEn}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-2 text-right">
                      {canEdit ? (
                        <Input type="number" min={0} max={100} step="0.01"
                          className={cn("h-7 w-24 ml-auto text-right", isDirty && "border-amber-400 bg-amber-50 dark:bg-amber-950/30")}
                          value={dirty.get(n.id) ?? String(n.weight)}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDirty((p) => { const s = new Map(p); if (Number(v) === n.weight) s.delete(n.id); else s.set(n.id, v); return s; });
                          }} />
                      ) : `${n.weight.toFixed(2)}`}
                    </td>
                    <td className="p-2 text-center">
                      {sum !== null && (
                        <Badge variant="outline" className={cn(Math.abs(sum - 100) > 0.01 ? "border-red-400 text-red-600" : "border-emerald-400 text-emerald-700")}>
                          {sum.toFixed(2)}%
                        </Badge>
                      )}
                    </td>
                    <td className="p-2 text-xs">
                      {link ? (
                        <span className="inline-flex items-center gap-1"><Link2 className="w-3 h-3 text-blue-600 shrink-0" /><span className="line-clamp-1">{link}</span>
                          {n.levelName && <Badge variant="secondary" className="ml-1 font-normal">{n.levelName}</Badge>}</span>
                      ) : leaf ? <span className="text-muted-foreground">يدوي (manual)</span> : null}
                    </td>
                    <td className="p-2 text-center text-xs whitespace-nowrap">
                      {counts.total > 0 && <>{counts.total}{counts.locked > 0 && <span className="text-emerald-700 inline-flex items-center gap-0.5 ml-1"><Lock className="w-3 h-3" />{counts.locked}</span>}</>}
                    </td>
                    <td className="p-1">
                      {canEdit && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7"><MoreHorizontal className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(n)}><Pencil className="w-4 h-4 mr-2" />تعديل (Edit)</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openCreate(n.id)}><Plus className="w-4 h-4 mr-2" />إضافة بند فرعي (Add sub-item)</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openCreate(n.parentId)}><Plus className="w-4 h-4 mr-2" />إضافة بند مجاور (Add sibling)</DropdownMenuItem>
                            {leaf && n.workListActivityId && (
                              <DropdownMenuItem onClick={() => openSplit(n)}><Scissors className="w-4 h-4 mr-2" />تقسيم حسب المستوى (Split by level)</DropdownMenuItem>
                            )}
                            {!leaf && (
                              <DropdownMenuItem onClick={() => equalize(n.id)}><Scale className="w-4 h-4 mr-2" />توزيع متساوٍ للأبناء (Equalize children)</DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600" onClick={() => setDeleteNode(n)}><Trash2 className="w-4 h-4 mr-2" />حذف (Delete)</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / edit item */}
      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form?.mode === "create" ? "إضافة بند (Add item)" : "تعديل بند (Edit item)"}</DialogTitle>
            <DialogDescription>
              {form?.parentId ? `تحت (Under): ${tree.byId.get(form.parentId)?.code} — ${tree.byId.get(form.parentId)?.nameAr}` : "مرحلة رئيسية (Top-level phase)"}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>الكود (Code){form.mode === "create" ? " — اختياري (optional)" : ""}</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>الوزن % بين الإخوة (Weight among siblings)</Label>
                <Input type="number" min={0} max={100} step="0.01" value={form.weight} placeholder={form.mode === "create" ? "auto" : ""}
                  onChange={(e) => setForm({ ...form, weight: e.target.value })} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>الاسم بالعربي (Arabic name) *</Label>
                <Input dir="rtl" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>الاسم بالإنجليزي (English name)</Label>
                <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>ربط النشاط (Linked activity — fills cells from approved WIRs)</Label>
                <ActivityPicker
                  value={form.workListActivityId}
                  activities={activities} chapters={chapters} divisions={divisions}
                  onChange={(id) => {
                    const a = id ? activityById.get(id) : null;
                    setForm({
                      ...form, workListActivityId: id,
                      nameAr: form.nameAr || a?.nameArabic || "", nameEn: form.nameEn || a?.nameEnglish || "",
                    });
                  }} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>مستوى العمل (Work level — optional filter)</Label>
                <Select value={form.workLevelId ?? NONE} onValueChange={(v) => setForm({ ...form, workLevelId: v === NONE ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>كل المستويات (Any level)</SelectItem>
                    {levels.map((l) => <SelectItem key={l.id} value={l.id}>{l.code} — {l.nameEnglish} ({l.nameArabic})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>إلغاء (Cancel)</Button>
            <Button onClick={submitForm} disabled={!form?.nameAr.trim()}>حفظ (Save)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split by level */}
      <Dialog open={!!splitNode} onOpenChange={(o) => { if (!o) setSplitNode(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تقسيم حسب مستوى العمل (Split by work level)</DialogTitle>
            <DialogDescription>
              {splitNode?.code} — {splitNode?.nameAr}. سيُنشأ بند فرعي لكل مستوى بأوزان متساوية، وكل منها مرتبط بنفس النشاط والمستوى.
              (One sub-item per level, equal weights, each linked to the same activity and its level.)
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-auto space-y-1 border rounded-lg p-2">
            {loadingLevels && <div className="text-sm text-muted-foreground p-2">Loading…</div>}
            {levelChoices.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-sm p-1 rounded hover:bg-muted/40 cursor-pointer">
                <Checkbox checked={effectiveSplit.has(l.id)} onCheckedChange={(c) => {
                  const s = new Set(effectiveSplit);
                  if (c) s.add(l.id); else s.delete(l.id);
                  setSplitLevels(s);
                }} />
                <span>{l.code} — {l.nameEn} ({l.nameAr})</span>
                {l.used && <Badge variant="secondary" className="ml-auto text-[10px]">في سجل WIR (in WIR log)</Badge>}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitNode(null)}>إلغاء (Cancel)</Button>
            <Button onClick={submitSplit} disabled={effectiveSplit.size === 0}>تقسيم (Split) — {effectiveSplit.size}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate from divisions */}
      <Dialog open={divisionsOpen} onOpenChange={setDivisionsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>توليد من أقسام (Generate from divisions)</DialogTitle>
            <DialogDescription>
              يضيف كل أنشطة الأقسام المختارة غير المربوطة بعد. البنود الموجودة لا تتغير. (Adds every not-yet-linked activity of the chosen divisions. Existing items are not changed.)
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-auto space-y-1 border rounded-lg p-2">
            {divisions.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm p-1 rounded hover:bg-muted/40 cursor-pointer">
                <Checkbox checked={pickedDivisions.has(d.id)} onCheckedChange={(c) => {
                  const s = new Set(pickedDivisions);
                  if (c) s.add(d.id); else s.delete(d.id);
                  setPickedDivisions(s);
                }} />
                <span className="font-mono text-xs">{d.code}</span>
                <span>{d.nameEnglish} ({d.nameArabic})</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDivisionsOpen(false)}>إلغاء (Cancel)</Button>
            <Button disabled={!pickedDivisions.size || !!busy}
              onClick={() => { setDivisionsOpen(false); generate({ source: "divisions", divisionIds: Array.from(pickedDivisions) }); }}>
              توليد (Generate)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteNode} onOpenChange={(o) => { if (!o) setDeleteNode(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف البند (Delete item) {deleteNode?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteNode && (() => {
                const c = model.subtreeCellCounts(deleteNode.id);
                return `سيُحذف البند و${descendantCount(deleteNode.id)} بنداً فرعياً و${c.total} خانة منها ${c.locked} مقفلة بفحوصات معتمدة. ` +
                  `(The item, ${descendantCount(deleteNode.id)} sub-item(s) and ${c.total} cell(s) — ${c.locked} locked by approved WIRs — will be deleted.)`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء (Cancel)</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => {
              const n = deleteNode!;
              run("delete", () => api("DELETE", `/progress-matrix/nodes/${n.id}`), () => `${n.code} deleted`).catch(() => {});
            }}>حذف (Delete)</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm dropping cells */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الخانات (Confirm removing cells)</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && `البند الأب فيه ${confirm.total} خانة (منها ${confirm.locked} مقفلة) ستُحذف لأنه سيصبح بنداً له أبناء. ` +
                `(${confirm.message}: ${confirm.total} cell(s), ${confirm.locked} locked.)`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء (Cancel)</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const c = confirm; setConfirm(null); c?.retry(); }}>متابعة (Continue)</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ActivityPicker({ value, activities, chapters, divisions, onChange }: {
  value: string | null;
  activities: WorkListActivity[];
  chapters: WorkListChapter[];
  divisions: WorkListDivision[];
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const chapterById = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);
  const divisionById = useMemo(() => new Map(divisions.map((d) => [d.id, d])), [divisions]);
  const selected = value ? activities.find((a) => a.id === value) : null;
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s
      ? activities.filter((a) => `${a.code} ${a.nameEnglish} ${a.nameArabic}`.toLowerCase().includes(s))
      : activities;
    return list.slice(0, 80);
  }, [activities, q]);
  const path = (a: WorkListActivity) => {
    const c = chapterById.get(a.chapterId);
    const d = c ? divisionById.get(c.divisionId) : null;
    return [d?.nameEnglish, c?.nameEnglish].filter(Boolean).join(" › ");
  };
  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="flex-1 justify-start font-normal truncate">
            {selected ? `${selected.code} — ${selected.nameEnglish}` : "بدون ربط — يدوي (No link — manual)"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[520px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="ابحث بالكود أو الاسم (Search code or name)…" value={q} onValueChange={setQ} />
            <CommandList>
              <CommandEmpty>لا نتائج (No results)</CommandEmpty>
              {matches.map((a) => (
                <CommandItem key={a.id} value={a.id} onSelect={() => { onChange(a.id); setOpen(false); }}>
                  <Check className={cn("w-4 h-4 mr-2 shrink-0", value === a.id ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <div className="truncate"><span className="font-mono text-xs mr-2">{a.code}</span>{a.nameEnglish}</div>
                    <div className="text-xs text-muted-foreground truncate">{path(a)} · {a.nameArabic}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && <Button variant="ghost" onClick={() => onChange(null)}>إزالة (Clear)</Button>}
    </div>
  );
}
