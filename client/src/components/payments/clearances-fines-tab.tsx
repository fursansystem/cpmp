import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Paperclip, AlertTriangle, Banknote, Trash2, Save, HandHelping, CheckCircle2, XCircle, FileBadge, Gavel } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import {
  FINE_LABELS,
  LIABLE_PARTY_LABELS,
  OPEN_PAYMENT_ORDER,
} from "@shared/payments";
import {
  LatestActivity,
  PaymentDialog,
  Section,
  AttachmentsPanel,
  StatusBadge,
  errorMessage,
  fmtDate,
  invalidatePayments,
  money,
  type PaymentsContext,
  useFocusFromUrl,
} from "./payments-common";
import { SubcontractorSelect } from "./subcontractor-select";

const todayIso = () => new Date().toISOString().slice(0, 10);

function ProjectSelect({ ctx, value, onChange, disabled }: { ctx: PaymentsContext; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label>المشروع</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
        <SelectContent>{ctx.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function Toolbar({ search, setSearch, status, setStatus, labels, onNew, newLabel }: {
  search: string; setSearch: (v: string) => void; status: string; setStatus: (v: string) => void;
  labels: Record<string, string>; onNew: () => void; newLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute start-3 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input className="ps-9" placeholder="بحث…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل الحالات</SelectItem>
          {Object.entries(labels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button className="ms-auto" onClick={onNew}><Plus className="w-4 h-4 mr-1" /> {newLabel}</Button>
    </div>
  );
}

interface TabProps {
  ctx: PaymentsContext;
  projectId: string;
  rows: any[];
  orders: any[];
  onRequestPayment: (id: string) => void;
}

// --------------------------------------------------------------------- Fines

const emptyFine = { title: "", authority: "", referenceNo: "", reason: "", liableParty: "contractor", subcontractorId: "", amount: "", issueDate: "", dueDate: "", status: "open", notes: "" };

export function FinesTab({ ctx, projectId, rows, orders, onRequestPayment }: TabProps) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | "new" | null>(null);
  useFocusFromUrl((id) => rows.some((r) => r.id === id), (id) => setEditing(rows.find((r) => r.id === id) ?? null));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (status === "all" || r.status === status) && (!q || [r.title, r.authority, r.referenceNo, r.projectName, r.reason].some((s) => String(s ?? "").toLowerCase().includes(q))));
  }, [rows, status, search]);

  const current = editing && editing !== "new" ? rows.find((r) => r.id === editing.id) ?? null : null;
  const today = todayIso();

  return (
    <div className="space-y-4">
      <Toolbar search={search} setSearch={setSearch} status={status} setStatus={setStatus} labels={FINE_LABELS} onNew={() => setEditing("new")} newLabel="خصم جديد" />
      <Card className="rounded-2xl">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الخصم</TableHead>
                {projectId === "all" && <TableHead>المشروع</TableHead>}
                <TableHead>الجهة</TableHead>
                <TableHead>المتحمّل</TableHead>
                <TableHead className="text-end">المبلغ</TableHead>
                <TableHead className="text-end">المسدد</TableHead>
                <TableHead>الاستحقاق</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">لا توجد خصومات</TableCell></TableRow>}
              {filtered.map((r) => {
                const overdue = ["open", "under_appeal"].includes(r.status) && r.dueDate && r.dueDate < today;
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setEditing(r)}>
                    <TableCell className="font-semibold">{r.title}{r.referenceNo && <div className="text-xs font-normal text-muted-foreground">{r.referenceNo}</div>}</TableCell>
                    {projectId === "all" && <TableCell>{r.projectName}</TableCell>}
                    <TableCell>{r.authority ?? "—"}</TableCell>
                    <TableCell>{LIABLE_PARTY_LABELS[r.liableParty as keyof typeof LIABLE_PARTY_LABELS] ?? r.liableParty}{r.subcontractorName && <div className="text-xs text-muted-foreground">{r.subcontractorName}</div>}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(r.amount)}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(r.paidAmount)}</TableCell>
                    <TableCell className={overdue ? "text-destructive font-semibold" : ""}>{overdue && <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />}{fmtDate(r.dueDate)}</TableCell>
                    <TableCell><StatusBadge status={r.status} labels={FINE_LABELS} /></TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap"><Paperclip className="w-3.5 h-3.5 inline mr-1" />{r.attachments.length}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {editing && <FineDialog ctx={ctx} defaultProjectId={projectId} row={current} orders={orders} onClose={() => setEditing(null)} onRequestPayment={(id) => { setEditing(null); onRequestPayment(id); }} />}
    </div>
  );
}

// What a page (a snag item, an NCR) hands over when it starts a deduction, and where it came from
export interface DeductionPrefill {
  title?: string;
  reason?: string;
  authority?: string;
  liableParty?: string;
  subcontractorId?: string;
  amount?: number | string;
  sourceType?: string;
  sourceId?: string;
}

export function FineDialog({ ctx, defaultProjectId, row, orders, onClose, onRequestPayment, prefill }: {
  prefill?: DeductionPrefill; ctx: PaymentsContext; defaultProjectId: string; row: any | null; orders: any[]; onClose: () => void; onRequestPayment: (id: string) => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState(row?.projectId ?? (defaultProjectId === "all" ? "" : defaultProjectId));
  const [form, setForm] = useState(
    row
      ? { title: row.title, authority: row.authority ?? "", referenceNo: row.referenceNo ?? "", reason: row.reason ?? "", liableParty: row.liableParty, subcontractorId: row.subcontractorId ?? "", amount: String(Number(row.amount) || ""), issueDate: row.issueDate ?? "", dueDate: row.dueDate ?? "", status: row.status, notes: row.notes ?? "" }
      : {
          ...emptyFine,
          title: prefill?.title ?? "",
          reason: prefill?.reason ?? "",
          authority: prefill?.authority ?? "",
          liableParty: prefill?.liableParty ?? emptyFine.liableParty,
          subcontractorId: prefill?.subcontractorId ?? "",
          amount: prefill?.amount !== undefined ? String(prefill.amount) : "",
        },
  );
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  // With payment under way or complete the fine is owned by the payment flow
  const locked = !!row && (["payment_requested", "paid", "waiver_requested", "waived", "recovered"].includes(row.status) || !!row.deductedCertificateId);
  const [waiverPanel, setWaiverPanel] = useState<null | "request" | "reject" | "recover">(null);
  const [waiverNote, setWaiverNote] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...form, subcontractorId: form.liableParty === "subcontractor" ? form.subcontractorId || null : null, authority: form.authority || null, referenceNo: form.referenceNo || null, reason: form.reason || null, issueDate: form.issueDate || null, dueDate: form.dueDate || null, amount: form.amount || 0, notes: form.notes || null };
      return row ? apiRequest("PATCH", `/api/payments/fines/${row.id}`, body) : apiRequest("POST", "/api/payments/fines", { projectId, ...body, sourceType: prefill?.sourceType ?? null, sourceId: prefill?.sourceId ?? null });
    },
    onSuccess: () => { invalidatePayments(queryClient); toast({ title: row ? "تم الحفظ" : "تمت الإضافة" }); onClose(); },
    onError: (e) => toast({ title: "تعذّر الحفظ", description: errorMessage(e), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/payments/fines/${row.id}`),
    onSuccess: () => { invalidatePayments(queryClient); onClose(); },
    onError: (e) => toast({ title: "تعذّر الحذف", description: errorMessage(e), variant: "destructive" }),
  });

  const waiver = useMutation({
    mutationFn: async (v: { action: string; note?: string }) => apiRequest("POST", `/api/payments/fines/${row.id}/waiver`, v),
    onSuccess: (_d, v) => {
      invalidatePayments(queryClient);
      const msg: Record<string, string> = { request: "أُرسل طلب الإعفاء لمدير المشروع", withdraw: "تم سحب طلب الإعفاء", approve: "تم اعتماد الإعفاء", reject: "تم رفض طلب الإعفاء" };
      toast({ title: msg[v.action] });
      onClose();
    },
    onError: (e) => toast({ title: "تعذّر تنفيذ الإجراء", description: errorMessage(e), variant: "destructive" }),
  });

  const recover = useMutation({
    mutationFn: async (note: string) => apiRequest("POST", `/api/payments/fines/${row.id}/recover`, { note }),
    onSuccess: () => { invalidatePayments(queryClient); toast({ title: "سُجّل استرداد الخصم" }); onClose(); },
    onError: (e) => toast({ title: "تعذّر تسجيل الاسترداد", description: errorMessage(e), variant: "destructive" }),
  });

  const hasLiveOrder = row ? orders.some((o) => o.fineId === row.id && ([...OPEN_PAYMENT_ORDER, "paid"] as string[]).includes(o.status)) : false;
  const canRequestPayment = ctx.perms.isAccounting && row && ["open", "under_appeal"].includes(row.status) && !hasLiveOrder && !row.deductedCertificateId;
  const canRequestWaiver = !!row && ["open", "under_appeal"].includes(row.status) && !hasLiveOrder && !row.deductedCertificateId;
  // A deduction charged to a subcontractor that was settled outside a certificate (recorded by accounting or a project manager)
  const canRecover = !!row && (ctx.perms.isAccounting || ctx.perms.canApprove) && ["open", "under_appeal"].includes(row.status) && !!row.subcontractorId && !row.deductedCertificateId && !hasLiveOrder;
  const ownWaiverRequest = row?.waiverRequestedBy === user?.id && user?.role !== "super_admin";
  // "waived" is reached only through the waiver flow, never picked from the status list
  const editableStatuses = Array.from(new Set(["open", "under_appeal", "cancelled", row?.status ?? "open"]));

  return (
    <PaymentDialog
      onClose={onClose}
      icon={Gavel}
      kind="خصم"
      title={row ? row.title : "خصم جديد"}
      badge={row ? <StatusBadge status={row.status} labels={FINE_LABELS} /> : undefined}
      description={row ? row.projectName : "سجّل الخصم لتُتابع مع المشروع والمالية حتى السداد"}
      amount={Number(form.amount) > 0 ? money(form.amount) : undefined}
      panel={waiverPanel && (
        <Section
          title={waiverPanel === "request" ? "لماذا يجب إعفاء هذا الخصم؟" : waiverPanel === "recover" ? "كيف استُرد هذا الخصم من المقاول؟" : "سبب رفض الإعفاء"}
          icon={waiverPanel === "reject" ? XCircle : waiverPanel === "recover" ? CheckCircle2 : HandHelping}
          tone={waiverPanel === "reject" ? "danger" : undefined}
        >
          <Textarea rows={2} value={waiverNote} onChange={(e) => setWaiverNote(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setWaiverPanel(null)}>تراجع</Button>
            <Button size="sm" variant={waiverPanel === "reject" ? "destructive" : "default"} disabled={!waiverNote.trim() || waiver.isPending || recover.isPending} onClick={() => (waiverPanel === "recover" ? recover.mutate(waiverNote) : waiver.mutate({ action: waiverPanel, note: waiverNote }))}>
              {waiverPanel === "request" ? "إرسال الطلب" : waiverPanel === "recover" ? "تسجيل الاسترداد" : "رفض الطلب"}
            </Button>
          </div>
        </Section>
      )}
      footer={
        <>
          {/* The step this deduction is waiting for comes first */}
          {!locked && <Button disabled={save.isPending || !form.title.trim() || !projectId} onClick={() => save.mutate()}><Save className="w-4 h-4 mr-1" /> حفظ</Button>}
          {row?.status === "waiver_requested" && ctx.perms.canApprove && (
            <>
              <Button disabled={waiver.isPending || ownWaiverRequest} title={ownWaiverRequest ? "لا يمكنك اعتماد طلب قدمته" : undefined} onClick={() => waiver.mutate({ action: "approve" })}>
                <CheckCircle2 className="w-4 h-4 mr-1" /> اعتماد الإعفاء
              </Button>
              <Button variant="outline" disabled={waiver.isPending} onClick={() => { setWaiverNote(""); setWaiverPanel("reject"); }}>
                <XCircle className="w-4 h-4 mr-1" /> رفض
              </Button>
            </>
          )}
          {canRequestPayment && <Button variant="outline" onClick={() => onRequestPayment(row.id)}><Banknote className="w-4 h-4 mr-1" /> أمر دفع للخصم</Button>}
          {canRecover && <Button variant="outline" onClick={() => { setWaiverNote(""); setWaiverPanel("recover"); }}><CheckCircle2 className="w-4 h-4 mr-1" /> تسجيل الاسترداد</Button>}
          {canRequestWaiver && <Button variant="outline" onClick={() => { setWaiverNote(""); setWaiverPanel("request"); }}><HandHelping className="w-4 h-4 mr-1" /> طلب إعفاء</Button>}
          {row?.status === "waiver_requested" && (row.waiverRequestedBy === user?.id || ctx.perms.canApprove) && (
            <Button variant="ghost" disabled={waiver.isPending} onClick={() => waiver.mutate({ action: "withdraw" })}>سحب الطلب</Button>
          )}
          {row && ctx.perms.isAccounting && !locked && (
            <Button variant="ghost" className="text-destructive" disabled={remove.isPending} onClick={() => remove.mutate()}><Trash2 className="w-4 h-4 mr-1" /> حذف</Button>
          )}
        </>
      }
    >
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><ProjectSelect ctx={ctx} value={projectId} onChange={setProjectId} disabled={!!row} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>الخصم</Label><Input value={form.title} disabled={locked} onChange={(e) => set("title")(e.target.value)} placeholder="مثال: خصم تأخير، مخالفة سلامة موقع…" /></div>
          <div className="space-y-1.5"><Label>الجهة المصدرة</Label><Input value={form.authority} disabled={locked} onChange={(e) => set("authority")(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>رقم المرجع</Label><Input value={form.referenceNo} disabled={locked} onChange={(e) => set("referenceNo")(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>المتحمّل</Label>
            <Select value={form.liableParty} onValueChange={set("liableParty")} disabled={locked}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(LIABLE_PARTY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {form.liableParty === "subcontractor" && (
            <div className="space-y-1.5 sm:col-span-2"><Label>مقاول الباطن</Label><SubcontractorSelect projectId={projectId} value={form.subcontractorId} disabled={locked} onChange={(id) => set("subcontractorId")(id)} /></div>
          )}
          <div className="space-y-1.5"><Label>المبلغ</Label><Input type="number" min="0" step="0.01" value={form.amount} disabled={locked} onChange={(e) => set("amount")(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>تاريخ الإصدار</Label><Input type="date" value={form.issueDate} disabled={locked} onChange={(e) => set("issueDate")(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>آخر موعد للسداد</Label><Input type="date" value={form.dueDate} disabled={locked} onChange={(e) => set("dueDate")(e.target.value)} /></div>
          {!locked && (
            <div className="space-y-1.5">
              <Label>الحالة</Label>
              <Select value={form.status} onValueChange={set("status")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{editableStatuses.map((k) => <SelectItem key={k} value={k}>{FINE_LABELS[k as keyof typeof FINE_LABELS]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {row && <div className="space-y-1.5"><Label>المسدد حتى الآن</Label><div className="h-10 flex items-center text-sm tabular-nums">{money(row.paidAmount)}</div></div>}
          <div className="space-y-1.5 sm:col-span-2"><Label>سبب الخصم</Label><Textarea rows={2} value={form.reason} disabled={locked} onChange={(e) => set("reason")(e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>ملاحظات</Label><Textarea rows={2} value={form.notes} disabled={locked} onChange={(e) => set("notes")(e.target.value)} /></div>
        </div>
        {locked && <p className="text-xs text-muted-foreground">هذا الخصم ضمن مسار السداد أو الإعفاء ولا يمكن تعديلها.</p>}
        {row?.waiverReason && ["waiver_requested", "waived"].includes(row.status) && (
          <div className="rounded-md border bg-violet-50 dark:bg-violet-900/10 p-3 text-sm">
            <div className="font-bold mb-1">سبب طلب الإعفاء</div>
            {row.waiverReason}
          </div>
        )}
        {row?.status === "recovered" && (
          <div className="rounded-md border bg-emerald-50 dark:bg-emerald-900/10 p-3 text-sm">
            <div className="font-bold mb-1">مُسترَد من المقاول{row.subcontractorName ? ` (${row.subcontractorName})` : ""}</div>
            {row.recoveredNote}
          </div>
        )}
        {row?.deductedCertificateId && row.status === "open" && (
          <div className="rounded-md border bg-violet-50 dark:bg-violet-900/10 p-3 text-sm">محجوز للخصم من مستخلص مقاول الباطن، ويُسجَّل مُستَرَدّاً عند اعتماد المستخلص.</div>
        )}

        {row && (
          <>
            <LatestActivity entityType="fine" entityId={row.id} labels={FINE_LABELS} />
            <div className="rounded-md border border-dashed border-primary/20 bg-primary/5 p-3">
              <AttachmentsPanel entityType="fine" entityId={row.id} projectId={row.projectId} files={row.attachments} editable canRemove={(f) => f.uploadedBy === user?.id || ctx.perms.isAccounting} hint="أرفق إشعار الخصم وأي مراسلات اعتراض أو إيصال السداد." />
            </div>
          </>
        )}
    </PaymentDialog>
  );
}
