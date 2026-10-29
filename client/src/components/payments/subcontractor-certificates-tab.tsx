import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Paperclip, AlertTriangle, Send, CheckCircle2, XCircle, Ban, Banknote, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { OPEN_PAYMENT_ORDER, SUB_CERT_LABELS, computeSubCert } from "@shared/payments";
import { ChargebacksPanel } from "./chargebacks";
import { SubcontractorSelect, SubcontractorsPanel, type SubcontractorRow } from "./subcontractor-select";
import {
  ActivityTimeline,
  AttachmentsPanel,
  StatusBadge,
  errorMessage,
  fmtDate,
  invalidatePayments,
  money,
  type PaymentsContext,
} from "./payments-common";

interface Props {
  ctx: PaymentsContext;
  projectId: string; // "all" or a project id
  rows: any[];
  chargebacks: any[];
  subcontractors: SubcontractorRow[];
  orders: any[];
  onRequestOrder: (certId: string) => void;
}

const num = (v: unknown) => Number(v ?? 0) || 0;
// Saudi VAT, the starting value for a new certificate; it can be changed per certificate
const DEFAULT_VAT = "15";

export function SubcontractorCertificatesTab({ ctx, projectId, rows, chargebacks, subcontractors, orders, onRequestOrder }: Props) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | "new" | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (status === "all" || r.status === status) && (!q || [r.certNo, r.subcontractorName, r.scope, r.projectName].some((s) => String(s ?? "").toLowerCase().includes(q))));
  }, [rows, status, search]);

  const current = editing && editing !== "new" ? rows.find((r) => r.id === editing.id) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input className="ps-9" placeholder="بحث: رقم المستخلص، المقاول، المشروع…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(SUB_CERT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className="ms-auto" onClick={() => setEditing("new")}><Plus className="w-4 h-4 mr-1" /> مستخلص مقاول باطن</Button>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الرقم</TableHead>
                {projectId === "all" && <TableHead>المشروع</TableHead>}
                <TableHead>مقاول الباطن</TableHead>
                <TableHead>الفترة</TableHead>
                <TableHead className="text-end">قيمة الأعمال</TableHead>
                <TableHead className="text-end">الصافي المستحق</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">لا توجد مستخلصات</TableCell></TableRow>}
              {filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setEditing(r)}>
                  <TableCell className="font-mono text-xs">{r.certNo}</TableCell>
                  {projectId === "all" && <TableCell>{r.projectName}</TableCell>}
                  <TableCell className="font-semibold">{r.subcontractorName}{r.scope && <div className="text-xs font-normal text-muted-foreground truncate max-w-[220px]">{r.scope}</div>}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmtDate(r.periodFrom)} → {fmtDate(r.periodTo)}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(r.grossAmount)}</TableCell>
                  <TableCell className="text-end tabular-nums font-semibold">{money(r.netPayable)}</TableCell>
                  <TableCell><StatusBadge status={r.status} labels={SUB_CERT_LABELS} /></TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap"><Paperclip className="w-3.5 h-3.5 inline mr-1" />{r.attachments.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SubcontractorsPanel ctx={ctx} projectId={projectId} rows={subcontractors} certificates={rows} />

      <ChargebacksPanel ctx={ctx} projectId={projectId} rows={chargebacks} />

      {editing && (
        <SubCertDialog
          ctx={ctx}
          defaultProjectId={projectId}
          row={current}
          chargebacks={chargebacks}
          allRows={rows}
          orders={orders}
          onClose={() => setEditing(null)}
          onRequestOrder={(id) => { setEditing(null); onRequestOrder(id); }}
        />
      )}
    </div>
  );
}

const emptyForm = (vat = DEFAULT_VAT) => ({
  subcontractorId: "", scope: "", contractValue: "", periodFrom: "", periodTo: "",
  grossAmount: "", retentionPercent: "10", advanceRecovery: "", otherDeductions: "", deductionsNote: "", vatPercent: vat, notes: "",
});

function SubCertDialog({ ctx, defaultProjectId, row, chargebacks, allRows, orders, onClose, onRequestOrder }: {
  ctx: PaymentsContext; defaultProjectId: string; row: any | null; chargebacks: any[]; allRows: any[]; orders: any[]; onClose: () => void; onRequestOrder: (id: string) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState(row?.projectId ?? (defaultProjectId === "all" ? "" : defaultProjectId));
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [form, setForm] = useState(
    row
      ? {
          subcontractorId: row.subcontractorId ?? "", scope: row.scope ?? "", contractValue: String(num(row.contractValue) || ""),
          periodFrom: row.periodFrom ?? "", periodTo: row.periodTo ?? "", grossAmount: String(num(row.grossAmount) || ""),
          retentionPercent: String(num(row.retentionPercent)), advanceRecovery: String(num(row.advanceRecovery) || ""),
          otherDeductions: String(num(row.otherDeductions) || ""), deductionsNote: row.deductionsNote ?? "",
          vatPercent: String(num(row.vatPercent)), notes: row.notes ?? "",
        }
      : emptyForm(),
  );
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  // Approved invoice charge-backs this certificate can deduct: the subcontractor's own, not taken by another certificate
  const available = useMemo(() => chargebacks.filter((c) =>
    row && c.projectId === row.projectId
    && c.subcontractorId === form.subcontractorId
    && (c.status === "approved" || (c.status === "applied" && c.certificateId === row.id))), [chargebacks, row, form.subcontractorId]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(row ? chargebacks.filter((c) => c.status === "applied" && c.certificateId === row.id).map((c) => c.id) : []));
  const pickedTotal = available.filter((c) => picked.has(c.id)).reduce((s, c) => s + num(c.amount), 0);
  const chargebackTotal = row && !["draft", "rejected"].includes(row.status) ? num(row.chargebackDeductions) : pickedTotal;

  const isOwner = !row || row.createdBy === user?.id || ctx.perms.isAccounting;
  const editable = isOwner && (!row || ["draft", "rejected"].includes(row.status));

  // A repeat certificate for the same subcontractor starts from the contract of its latest one
  const onSubChange = (id: string, sub?: SubcontractorRow) => {
    const match = allRows.find((r) => r.projectId === projectId && r.subcontractorId === id);
    setPicked(new Set());
    setForm((f) => ({
      ...f,
      subcontractorId: id,
      ...(!row && sub && !match ? { scope: f.scope || (sub.scope ?? "") } : {}),
      ...(match && !row ? { scope: f.scope || (match.scope ?? ""), contractValue: f.contractValue || String(num(match.contractValue) || ""), retentionPercent: String(num(match.retentionPercent)), vatPercent: String(num(match.vatPercent)) } : {}),
    }));
  };

  const figures = computeSubCert({
    grossAmount: num(form.grossAmount),
    retentionPercent: num(form.retentionPercent),
    advanceRecovery: num(form.advanceRecovery),
    otherDeductions: num(form.otherDeductions),
    chargebackDeductions: chargebackTotal,
    vatPercent: num(form.vatPercent),
  });

  // What this subcontractor has already been certified for, against its contract value
  const previousGross = allRows
    .filter((r) => r.projectId === projectId && r.id !== row?.id && r.subcontractorId === form.subcontractorId && ["approved", "paid"].includes(r.status))
    .reduce((s, r) => s + num(r.grossAmount), 0);
  const cumulative = previousGross + num(form.grossAmount);
  const overContract = num(form.contractValue) > 0 && cumulative > num(form.contractValue) + 0.005;

  const body = () => ({
    ...form,
    scope: form.scope || null,
    periodFrom: form.periodFrom || null,
    periodTo: form.periodTo || null,
    deductionsNote: form.deductionsNote || null,
    notes: form.notes || null,
    contractValue: form.contractValue || 0,
    grossAmount: form.grossAmount || 0,
    advanceRecovery: form.advanceRecovery || 0,
    otherDeductions: form.otherDeductions || 0,
  });

  // The chosen charge-backs are applied first so the saved net already includes them
  const syncChargebacks = async () => {
    if (row && editable) await apiRequest("POST", `/api/payments/subcontractor-certificates/${row.id}/chargebacks`, { ids: available.filter((c) => picked.has(c.id)).map((c) => c.id) });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!row) return apiRequest("POST", "/api/payments/subcontractor-certificates", { projectId, ...body() });
      await syncChargebacks();
      return apiRequest("PATCH", `/api/payments/subcontractor-certificates/${row.id}`, body());
    },
    onSuccess: () => { invalidatePayments(queryClient); toast({ title: row ? "تم الحفظ" : "تم إنشاء المستخلص كمسودة" }); onClose(); },
    onError: (e) => toast({ title: "تعذّر الحفظ", description: errorMessage(e), variant: "destructive" }),
  });

  const act = useMutation({
    mutationFn: async (v: { action: string; note?: string }) => apiRequest("POST", `/api/payments/subcontractor-certificates/${row.id}/transition`, v),
    onSuccess: (_d, v) => {
      invalidatePayments(queryClient);
      const msg: Record<string, string> = { submit: "أُرسل للاعتماد", approve: "تم اعتماد المستخلص", reject: "تم رفض المستخلص", cancel: "تم إلغاء المستخلص" };
      toast({ title: msg[v.action] });
      onClose();
    },
    onError: (e) => toast({ title: "تعذّر تنفيذ الإجراء", description: errorMessage(e), variant: "destructive" }),
  });

  // Submitting sends what is on screen, so save it first
  const saveAndSubmit = useMutation({
    mutationFn: async () => {
      await syncChargebacks();
      await apiRequest("PATCH", `/api/payments/subcontractor-certificates/${row.id}`, body());
      await apiRequest("POST", `/api/payments/subcontractor-certificates/${row.id}/transition`, { action: "submit" });
    },
    onSuccess: () => { invalidatePayments(queryClient); toast({ title: "أُرسل للاعتماد" }); onClose(); },
    onError: (e) => { invalidatePayments(queryClient); toast({ title: "تعذّر الإرسال", description: errorMessage(e), variant: "destructive" }); },
  });

  const hasLiveOrder = row ? orders.some((o) => o.subcontractorCertificateId === row.id && ([...OPEN_PAYMENT_ORDER, "paid"] as string[]).includes(o.status)) : false;
  const ownCert = row?.createdBy === user?.id && user?.role !== "super_admin";
  const L = (label: string, child: React.ReactNode, cls = "") => <div className={`space-y-1.5 ${cls}`}><Label>{label}</Label>{child}</div>;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {row ? <><span className="font-mono">{row.certNo}</span><StatusBadge status={row.status} labels={SUB_CERT_LABELS} /></> : "مستخلص مقاول باطن جديد"}
          </DialogTitle>
          <DialogDescription>{row ? row.projectName : "يُعدّه فريق المشروع، يعتمده مدير المشروع، ثم تصرفه المحاسبة بأمر دفع."}</DialogDescription>
        </DialogHeader>

        {row?.rejectReason && row.status === "rejected" && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"><b>سبب الرفض: </b>{row.rejectReason}</div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          {L("المشروع", (
            <Select value={projectId} onValueChange={setProjectId} disabled={!!row}>
              <SelectTrigger><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
              <SelectContent>{ctx.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          ), "sm:col-span-2")}
          {L("مقاول الباطن", (
            <>
              <SubcontractorSelect projectId={projectId} value={form.subcontractorId} disabled={!editable} onChange={onSubChange} />
            </>
          ))}
          {L("نطاق العمل", <Input value={form.scope} disabled={!editable} onChange={(e) => set("scope")(e.target.value)} placeholder="مثال: أعمال الكهرباء، التشطيبات…" />)}
          {L("قيمة عقد الباطن", <Input type="number" min="0" step="0.01" value={form.contractValue} disabled={!editable} onChange={(e) => set("contractValue")(e.target.value)} />)}
          {L("قيمة الأعمال في هذا المستخلص", <Input type="number" min="0" step="0.01" value={form.grossAmount} disabled={!editable} onChange={(e) => set("grossAmount")(e.target.value)} />)}
          {L("الفترة من", <Input type="date" value={form.periodFrom} disabled={!editable} onChange={(e) => set("periodFrom")(e.target.value)} />)}
          {L("الفترة إلى", <Input type="date" value={form.periodTo} disabled={!editable} onChange={(e) => set("periodTo")(e.target.value)} />)}
          {L("نسبة الاستقطاع (ضمان حسن التنفيذ) %", <Input type="number" min="0" max="100" step="0.01" value={form.retentionPercent} disabled={!editable} onChange={(e) => set("retentionPercent")(e.target.value)} />)}
          {L("نسبة ضريبة القيمة المضافة %", <Input type="number" min="0" max="100" step="0.01" value={form.vatPercent} disabled={!editable} onChange={(e) => set("vatPercent")(e.target.value)} />)}
          {L("استرداد الدفعة المقدمة", <Input type="number" min="0" step="0.01" value={form.advanceRecovery} disabled={!editable} onChange={(e) => set("advanceRecovery")(e.target.value)} />)}
          {L("خصومات أخرى", <Input type="number" min="0" step="0.01" value={form.otherDeductions} disabled={!editable} onChange={(e) => set("otherDeductions")(e.target.value)} />)}
          {L("بيان الخصومات", <Input value={form.deductionsNote} disabled={!editable} onChange={(e) => set("deductionsNote")(e.target.value)} placeholder="خصم تأخير، مواد مصروفة…" />, "sm:col-span-2")}
          {L("ملاحظات", <Textarea rows={2} value={form.notes} disabled={!editable} onChange={(e) => set("notes")(e.target.value)} />, "sm:col-span-2")}
        </div>

        <div className="rounded-2xl border bg-muted/30 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><div className="text-xs text-muted-foreground">قيمة الأعمال</div><div className="font-semibold tabular-nums">{money(num(form.grossAmount))}</div></div>
          <div><div className="text-xs text-muted-foreground">الاستقطاع</div><div className="font-semibold tabular-nums">− {money(figures.retentionAmount)}</div></div>
          <div><div className="text-xs text-muted-foreground">الدفعة المقدمة والخصومات</div><div className="font-semibold tabular-nums">− {money(num(form.advanceRecovery) + num(form.otherDeductions) + chargebackTotal)}</div></div>
          <div><div className="text-xs text-muted-foreground">ضريبة القيمة المضافة</div><div className="font-semibold tabular-nums">+ {money(figures.vatAmount)}</div></div>
          <div className="col-span-2 sm:col-span-4 border-t pt-2 flex items-center justify-between">
            <span className="font-bold">الصافي المستحق</span>
            <span className={`text-lg font-bold tabular-nums ${figures.netPayable < 0 ? "text-destructive" : ""}`}>{money(figures.netPayable)}</span>
          </div>
          {form.subcontractorId && (
            <div className={`col-span-2 sm:col-span-4 text-xs flex items-center gap-1 ${overContract ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
              {overContract && <AlertTriangle className="w-3.5 h-3.5" />}
              المعتمد سابقاً {money(previousGross)} + هذا المستخلص = {money(cumulative)}
              {num(form.contractValue) > 0 && ` من قيمة العقد ${money(num(form.contractValue))}`}
              {overContract && " — يتجاوز قيمة العقد"}
            </div>
          )}
        </div>

        {!row && (
          <p className="text-xs text-muted-foreground">لخصم فواتير محمَّلة على المقاول، احفظ المستخلص كمسودة ثم افتحه واختر الخصومات.</p>
        )}
        {row && (available.length > 0 || chargebackTotal > 0) && (
          <div className="space-y-2 rounded-xl border p-3">
            <div className="text-sm font-bold">خصومات فواتير محمَّلة على المقاول</div>
            {editable ? (
              <ul className="space-y-1.5">
                {available.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={picked.has(c.id)} onChange={(e) => setPicked((s) => { const next = new Set(s); if (e.target.checked) next.add(c.id); else next.delete(c.id); return next; })} />
                    <span className="font-mono text-xs">{c.chargeNo}</span>
                    <span>فاتورة <span className="font-mono">{c.invoiceNo}</span> <span className="text-xs text-muted-foreground">({c.payeeName})</span></span>
                    <span className="ms-auto tabular-nums font-semibold">{money(c.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-1.5">
                {chargebacks.filter((c) => c.certificateId === row.id && c.status === "applied").map((c) => (
                  <li key={c.id} className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-xs">{c.chargeNo}</span>
                    <span>فاتورة <span className="font-mono">{c.invoiceNo}</span></span>
                    <span className="ms-auto tabular-nums font-semibold">{money(c.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-between text-sm border-t pt-2"><span>المجموع المخصوم</span><span className="tabular-nums font-bold">{money(chargebackTotal)}</span></div>
          </div>
        )}

        {row && (
          <>
            <AttachmentsPanel
              entityType="subcontractor_certificate"
              entityId={row.id}
              projectId={row.projectId}
              files={row.attachments}
              editable={!["paid", "cancelled"].includes(row.status)}
              hint="أرفق المستخلص الموقّع وجداول الكميات وأي مستندات داعمة."
              canRemove={(f) => f.uploadedBy === user?.id || ctx.perms.isAccounting}
            />
            <ActivityTimeline entityType="subcontractor_certificate" entityId={row.id} labels={SUB_CERT_LABELS} />
          </>
        )}

        {rejecting && (
          <div className="space-y-2 rounded-xl border p-3">
            <Label>سبب الرفض</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setRejecting(false)}>تراجع</Button>
              <Button size="sm" variant="destructive" disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ action: "reject", note })}>رفض المستخلص</Button>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
          {row && isOwner && ["draft", "submitted", "rejected", "approved"].includes(row.status) && !hasLiveOrder && (
            <Button variant="ghost" className="text-destructive me-auto" disabled={act.isPending} onClick={() => act.mutate({ action: "cancel" })}><Ban className="w-4 h-4 mr-1" /> إلغاء المستخلص</Button>
          )}
          {row?.status === "approved" && ctx.perms.isAccounting && !hasLiveOrder && (
            <Button onClick={() => onRequestOrder(row.id)}><Banknote className="w-4 h-4 mr-1" /> إصدار أمر دفع</Button>
          )}
          {row?.status === "submitted" && ctx.perms.canApprove && (
            <>
              <Button disabled={act.isPending || ownCert} title={ownCert ? "لا يمكنك اعتماد مستخلص أعددته" : undefined} onClick={() => act.mutate({ action: "approve" })}><CheckCircle2 className="w-4 h-4 mr-1" /> اعتماد</Button>
              <Button variant="outline" disabled={act.isPending} onClick={() => setRejecting(true)}><XCircle className="w-4 h-4 mr-1" /> رفض</Button>
            </>
          )}
          {row && editable && (
            <Button variant="outline" disabled={act.isPending || save.isPending || saveAndSubmit.isPending} onClick={() => saveAndSubmit.mutate()}><Send className="w-4 h-4 mr-1" /> إرسال للاعتماد</Button>
          )}
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          {editable && (
            <Button disabled={save.isPending || !projectId || !form.subcontractorId} onClick={() => save.mutate()}><Save className="w-4 h-4 mr-1" /> حفظ</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
