// مقاولو الباطن: the project's register of subcontractors and the picker that every form uses instead of a typed name.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { errorMessage, getJson, invalidatePayments, paymentsQuery, type PaymentsContext } from "./payments-common";

export interface SubcontractorRow {
  id: string;
  projectId: string;
  name: string;
  taxNumber: string | null;
  contactPerson: string | null;
  phone: string | null;
  scope: string | null;
}

export function useSubcontractors(projectId: string) {
  return useQuery<SubcontractorRow[]>({
    queryKey: ["payments", "subcontractors", projectId],
    queryFn: () => getJson(`/api/payments/subcontractors?projectId=${projectId}`),
    enabled: !!projectId,
    meta: paymentsQuery,
  });
}

const NEW = "__new__";

// Choose a subcontractor of the project, or add one without leaving the form
export function SubcontractorSelect({ projectId, value, onChange, disabled, placeholder = "اختر مقاول الباطن" }: {
  projectId: string; value: string; onChange: (id: string, sub?: SubcontractorRow) => void; disabled?: boolean; placeholder?: string;
}) {
  const { data: subs = [] } = useSubcontractors(projectId);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Select
        value={value}
        disabled={disabled || !projectId}
        onValueChange={(v) => (v === NEW ? setAdding(true) : onChange(v, subs.find((s) => s.id === v)))}
      >
        <SelectTrigger><SelectValue placeholder={projectId ? placeholder : "اختر المشروع أولاً"} /></SelectTrigger>
        <SelectContent>
          {subs.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.scope ? ` — ${s.scope}` : ""}</SelectItem>)}
          <SelectItem value={NEW}><span className="flex items-center gap-1 font-semibold text-primary"><Plus className="w-3.5 h-3.5" /> مقاول باطن جديد</span></SelectItem>
        </SelectContent>
      </Select>
      {adding && <SubcontractorDialog projectId={projectId} onClose={() => setAdding(false)} onSaved={(s) => { setAdding(false); onChange(s.id, s); }} />}
    </>
  );
}

export function SubcontractorDialog({ projectId, row, onClose, onSaved }: {
  projectId: string; row?: SubcontractorRow | null; onClose: () => void; onSaved?: (s: SubcontractorRow) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: row?.name ?? "", taxNumber: row?.taxNumber ?? "", contactPerson: row?.contactPerson ?? "", phone: row?.phone ?? "", scope: row?.scope ?? "" });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const res = row
        ? await apiRequest("PATCH", `/api/payments/subcontractors/${row.id}`, form)
        : await apiRequest("POST", "/api/payments/subcontractors", { projectId, ...form });
      return row ? ({ ...row, ...form } as SubcontractorRow) : ((await res.json()) as SubcontractorRow);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast({ title: row ? "تم الحفظ" : "تمت إضافة مقاول الباطن" });
      if (onSaved) onSaved(saved); else onClose();
    },
    onError: (e) => toast({ title: "تعذّر الحفظ", description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{row ? "تعديل مقاول الباطن" : "مقاول باطن جديد"}</DialogTitle>
          <DialogDescription>يُسجَّل مرة واحدة في المشروع، ثم يُختار من القائمة في المستخلصات والخصومات.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label>الاسم</Label><Input value={form.name} onChange={(e) => set("name")(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>نطاق العمل</Label><Input value={form.scope} onChange={(e) => set("scope")(e.target.value)} placeholder="كهرباء، تشطيبات…" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>الرقم الضريبي</Label><Input value={form.taxNumber} onChange={(e) => set("taxNumber")(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>الهاتف</Label><Input value={form.phone} onChange={(e) => set("phone")(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>شخص التواصل</Label><Input value={form.contactPerson} onChange={(e) => set("contactPerson")(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button disabled={save.isPending || !form.name.trim()} onClick={() => save.mutate()}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The register itself, shown above the certificates
export function SubcontractorsPanel({ ctx, projectId, rows, certificates }: { ctx: PaymentsContext; projectId: string; rows: SubcontractorRow[]; certificates: any[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SubcontractorRow | "new" | null>(null);
  const projectName = (id: string) => ctx.projects.find((p) => p.id === id)?.name ?? "";

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/payments/subcontractors/${id}`),
    onSuccess: () => invalidatePayments(queryClient),
    onError: (e) => toast({ title: "تعذّر الحذف", description: errorMessage(e), variant: "destructive" }),
  });
  const canManage = ctx.perms.isAccounting || ctx.perms.canApprove;

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">مقاولو الباطن</span>
          <span className="text-xs text-muted-foreground">({rows.length})</span>
          {projectId !== "all" && <Button size="sm" variant="outline" className="ms-auto" onClick={() => setEditing("new")}><Plus className="w-4 h-4 mr-1" /> مقاول باطن</Button>}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">لم يُسجَّل مقاولو باطن بعد. أضفهم من هنا أو من قائمة الاختيار في المستخلص.</p>
        ) : (
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {rows.map((s) => {
              const count = certificates.filter((c) => c.subcontractorId === s.id && c.status !== "cancelled").length;
              return (
                <li key={s.id} className="rounded-xl border px-3 py-2 text-sm flex items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{[projectId === "all" ? projectName(s.projectId) : null, s.scope, s.taxNumber, s.phone].filter(Boolean).join(" · ") || "—"}</div>
                    <div className="text-xs text-muted-foreground">{count} مستخلص</div>
                  </div>
                  <div className="ms-auto flex shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                    {canManage && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      {editing && (
        <SubcontractorDialog
          projectId={editing === "new" ? projectId : editing.projectId}
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}
