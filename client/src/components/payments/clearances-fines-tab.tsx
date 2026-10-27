import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Paperclip, AlertTriangle, Banknote, Trash2, Save, HandHelping, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import {
  CLEARANCE_EXPIRY_WARNING_DAYS,
  CLEARANCE_LABELS,
  FINE_LABELS,
  LIABLE_PARTY_LABELS,
  OPEN_CLEARANCE,
  OPEN_PAYMENT_ORDER,
} from "@shared/payments";
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

const todayIso = () => new Date().toISOString().slice(0, 10);

// Mirrors the server's report logic so the table and the manager report agree
export function clearanceAttention(c: any): "expired" | "expiring" | "overdue" | null {
  const today = todayIso();
  const warnUntil = new Date(Date.now() + CLEARANCE_EXPIRY_WARNING_DAYS * 86_400_000).toISOString().slice(0, 10);
  if (c.status === "expired" || (c.status === "obtained" && c.expiryDate && c.expiryDate < today)) return "expired";
  if (c.status === "obtained" && c.expiryDate && c.expiryDate <= warnUntil) return "expiring";
  if ((OPEN_CLEARANCE as readonly string[]).includes(c.status) && c.dueDate && c.dueDate < today) return "overdue";
  return null;
}

const ATTENTION_LABEL = { expired: "منتهي", expiring: "ينتهي قريباً", overdue: "متأخر" } as const;

function AttentionBadge({ kind }: { kind: keyof typeof ATTENTION_LABEL | null }) {
  if (!kind) return null;
  return (
    <Badge variant="secondary" className="border-none bg-destructive/10 text-destructive font-semibold gap-1">
      <AlertTriangle className="w-3 h-3" /> {ATTENTION_LABEL[kind]}
    </Badge>
  );
}

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

// ---------------------------------------------------------------- Clearances

interface TabProps {
  ctx: PaymentsContext;
  projectId: string;
  rows: any[];
  orders: any[];
  onRequestPayment: (id: string) => void;
}

const emptyClearance = { title: "", authority: "", referenceNo: "", status: "pending", responsibleName: "", dueDate: "", issueDate: "", expiryDate: "", feeAmount: "", notes: "" };

export function ClearancesTab({ ctx, projectId, rows, orders, onRequestPayment }: TabProps) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | "new" | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (status === "all" || r.status === status) && (!q || [r.title, r.authority, r.referenceNo, r.projectName, r.responsibleName].some((s) => String(s ?? "").toLowerCase().includes(q))));
  }, [rows, status, search]);

  const current = editing && editing !== "new" ? rows.find((r) => r.id === editing.id) ?? null : null;

  return (
    <div className="space-y-4">
      <Toolbar search={search} setSearch={setSearch} status={status} setStatus={setStatus} labels={CLEARANCE_LABELS} onNew={() => setEditing("new")} newLabel="رخصة / تصريح جديد" />
      <Card className="rounded-2xl">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>البند</TableHead>
                {projectId === "all" && <TableHead>المشروع</TableHead>}
                <TableHead>الجهة</TableHead>
                <TableHead>المسؤول</TableHead>
                <TableHead>الاستحقاق</TableHead>
                <TableHead>الانتهاء</TableHead>
                <TableHead className="text-end">الرسوم</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">لا توجد بنود</TableCell></TableRow>}
              {filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setEditing(r)}>
                  <TableCell className="font-semibold">{r.title}{r.referenceNo && <div className="text-xs font-normal text-muted-foreground">{r.referenceNo}</div>}</TableCell>
                  {projectId === "all" && <TableCell>{r.projectName}</TableCell>}
                  <TableCell>{r.authority ?? "—"}</TableCell>
                  <TableCell>{r.responsibleName ?? "—"}</TableCell>
                  <TableCell>{fmtDate(r.dueDate)}</TableCell>
                  <TableCell>{fmtDate(r.expiryDate)}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {Number(r.feeAmount) > 0 ? money(r.feeAmount) : "—"}
                    {Number(r.feeAmount) > 0 && <div className="text-xs text-muted-foreground">{r.feePaid ? "مدفوعة" : "غير مدفوعة"}</div>}
                  </TableCell>
                  <TableCell className="space-y-1">
                    <StatusBadge status={r.status} labels={CLEARANCE_LABELS} />
                    <div><AttentionBadge kind={clearanceAttention(r)} /></div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap"><Paperclip className="w-3.5 h-3.5 inline mr-1" />{r.attachments.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {editing && (
        <ClearanceDialog ctx={ctx} defaultProjectId={projectId} row={current} orders={orders} onClose={() => setEditing(null)} onRequestPayment={(id) => { setEditing(null); onRequestPayment(id); }} />
      )}
    </div>
  );
}

function ClearanceDialog({ ctx, defaultProjectId, row, orders, onClose, onRequestPayment }: { ctx: PaymentsContext; defaultProjectId: string; row: any | null; orders: any[]; onClose: () => void; onRequestPayment: (id: string) => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState(row?.projectId ?? (defaultProjectId === "all" ? "" : defaultProjectId));
  const [form, setForm] = useState(
    row
      ? { title: row.title, authority: row.authority ?? "", referenceNo: row.referenceNo ?? "", status: row.status, responsibleName: row.responsibleName ?? "", dueDate: row.dueDate ?? "", issueDate: row.issueDate ?? "", expiryDate: row.expiryDate ?? "", feeAmount: String(Number(row.feeAmount) || ""), notes: row.notes ?? "" }
      : emptyClearance,
  );
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const body = () => ({
    ...form,
    authority: form.authority || null,
    referenceNo: form.referenceNo || null,
    responsibleName: form.responsibleName || null,
    dueDate: form.dueDate || null,
    issueDate: form.issueDate || null,
    expiryDate: form.expiryDate || null,
    feeAmount: form.feeAmount || 0,
    notes: form.notes || null,
  });

  const save = useMutation({
    mutationFn: async () => row
      ? apiRequest("PATCH", `/api/payments/clearances/${row.id}`, body())
      : apiRequest("POST", "/api/payments/clearances", { projectId, ...body() }),
    onSuccess: () => { invalidatePayments(queryClient); toast({ title: row ? "تم الحفظ" : "تمت الإضافة" }); onClose(); },
    onError: (e) => toast({ title: "تعذّر الحفظ", description: errorMessage(e), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/payments/clearances/${row.id}`),
    onSuccess: () => { invalidatePayments(queryClient); onClose(); },
    onError: (e) => toast({ title: "تعذّر الحذف", description: errorMessage(e), variant: "destructive" }),
  });

  const hasLiveOrder = row ? orders.some((o) => o.clearanceId === row.id && ([...OPEN_PAYMENT_ORDER, "paid"] as string[]).includes(o.status)) : false;
  const canRequestPayment = ctx.perms.isAccounting && row && Number(row.feeAmount) > 0 && !row.feePaid && !hasLiveOrder;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{row ? row.title : "رخصة / تصريح جديد"}</DialogTitle>
          <DialogDescription>{row ? row.projectName : "تتبّع الرخص ورسومها مع المشروع والمالية."}</DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><ProjectSelect ctx={ctx} value={projectId} onChange={setProjectId} disabled={!!row} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>البند</Label><Input value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="مثال: رخصة الدفاع المدني، شهادة إتمام البناء…" /></div>
          <div className="space-y-1.5"><Label>الجهة</Label><Input value={form.authority} onChange={(e) => set("authority")(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>رقم المرجع</Label><Input value={form.referenceNo} onChange={(e) => set("referenceNo")(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>الحالة</Label>
            <Select value={form.status} onValueChange={set("status")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CLEARANCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>المسؤول عن المتابعة</Label><Input value={form.responsibleName} onChange={(e) => set("responsibleName")(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>مطلوب الحصول عليه قبل</Label><Input type="date" value={form.dueDate} onChange={(e) => set("dueDate")(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>تاريخ الإصدار</Label><Input type="date" value={form.issueDate} onChange={(e) => set("issueDate")(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>تاريخ الانتهاء</Label><Input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate")(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>الرسوم</Label>
            <Input type="number" min="0" step="0.01" value={form.feeAmount} onChange={(e) => set("feeAmount")(e.target.value)} disabled={!!row?.feePaid} />
            {row?.feePaid && <p className="text-xs text-muted-foreground">تم سداد الرسوم.</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label>ملاحظات</Label><Textarea rows={2} value={form.notes} onChange={(e) => set("notes")(e.target.value)} /></div>
        </div>

        {row && (
          <>
            <AttachmentsPanel entityType="clearance" entityId={row.id} projectId={row.projectId} files={row.attachments} editable canRemove={(f) => f.uploadedBy === user?.id || ctx.perms.isAccounting} hint="أرفق صورة الرخصة أو إيصال الرسوم." />
            <ActivityTimeline entityType="clearance" entityId={row.id} labels={CLEARANCE_LABELS} />
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
          {row && ctx.perms.isAccounting && (
            <Button variant="ghost" className="text-destructive me-auto" disabled={remove.isPending} onClick={() => remove.mutate()}><Trash2 className="w-4 h-4 mr-1" /> حذف</Button>
          )}
          {canRequestPayment && <Button variant="outline" onClick={() => onRequestPayment(row.id)}><Banknote className="w-4 h-4 mr-1" /> أمر دفع للرسوم</Button>}
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          <Button disabled={save.isPending || !form.title.trim() || !projectId} onClick={() => save.mutate()}><Save className="w-4 h-4 mr-1" /> حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------------- Fines

const emptyFine = { title: "", authority: "", referenceNo: "", reason: "", liableParty: "contractor", amount: "", issueDate: "", dueDate: "", status: "open", notes: "" };

export function FinesTab({ ctx, projectId, rows, orders, onRequestPayment }: TabProps) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | "new" | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (status === "all" || r.status === status) && (!q || [r.title, r.authority, r.referenceNo, r.projectName, r.reason].some((s) => String(s ?? "").toLowerCase().includes(q))));
  }, [rows, status, search]);

  const current = editing && editing !== "new" ? rows.find((r) => r.id === editing.id) ?? null : null;
  const today = todayIso();

  return (
    <div className="space-y-4">
      <Toolbar search={search} setSearch={setSearch} status={status} setStatus={setStatus} labels={FINE_LABELS} onNew={() => setEditing("new")} newLabel="غرامة جديدة" />
      <Card className="rounded-2xl">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الغرامة</TableHead>
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
              {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">لا توجد غرامات</TableCell></TableRow>}
              {filtered.map((r) => {
                const overdue = ["open", "under_appeal"].includes(r.status) && r.dueDate && r.dueDate < today;
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setEditing(r)}>
                    <TableCell className="font-semibold">{r.title}{r.referenceNo && <div className="text-xs font-normal text-muted-foreground">{r.referenceNo}</div>}</TableCell>
                    {projectId === "all" && <TableCell>{r.projectName}</TableCell>}
                    <TableCell>{r.authority ?? "—"}</TableCell>
                    <TableCell>{LIABLE_PARTY_LABELS[r.liableParty as keyof typeof LIABLE_PARTY_LABELS] ?? r.liableParty}</TableCell>
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

function FineDialog({ ctx, defaultProjectId, row, orders, onClose, onRequestPayment }: { ctx: PaymentsContext; defaultProjectId: string; row: any | null; orders: any[]; onClose: () => void; onRequestPayment: (id: string) => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState(row?.projectId ?? (defaultProjectId === "all" ? "" : defaultProjectId));
  const [form, setForm] = useState(
    row
      ? { title: row.title, authority: row.authority ?? "", referenceNo: row.referenceNo ?? "", reason: row.reason ?? "", liableParty: row.liableParty, amount: String(Number(row.amount) || ""), issueDate: row.issueDate ?? "", dueDate: row.dueDate ?? "", status: row.status, notes: row.notes ?? "" }
      : emptyFine,
  );
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  // With payment under way or complete the fine is owned by the payment flow
  const locked = !!row && ["payment_requested", "paid", "waiver_requested", "waived"].includes(row.status);
  const [waiverPanel, setWaiverPanel] = useState<null | "request" | "reject">(null);
  const [waiverNote, setWaiverNote] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...form, authority: form.authority || null, referenceNo: form.referenceNo || null, reason: form.reason || null, issueDate: form.issueDate || null, dueDate: form.dueDate || null, amount: form.amount || 0, notes: form.notes || null };
      return row ? apiRequest("PATCH", `/api/payments/fines/${row.id}`, body) : apiRequest("POST", "/api/payments/fines", { projectId, ...body });
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

  const hasLiveOrder = row ? orders.some((o) => o.fineId === row.id && ([...OPEN_PAYMENT_ORDER, "paid"] as string[]).includes(o.status)) : false;
  const canRequestPayment = ctx.perms.isAccounting && row && ["open", "under_appeal"].includes(row.status) && !hasLiveOrder;
  const canRequestWaiver = !!row && ["open", "under_appeal"].includes(row.status) && !hasLiveOrder;
  const ownWaiverRequest = row?.waiverRequestedBy === user?.id && user?.role !== "super_admin";
  // "waived" is reached only through the waiver flow, never picked from the status list
  const editableStatuses = Array.from(new Set(["open", "under_appeal", "cancelled", row?.status ?? "open"]));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">{row ? row.title : "غرامة جديدة"}{row && <StatusBadge status={row.status} labels={FINE_LABELS} />}</DialogTitle>
          <DialogDescription>{row ? row.projectName : "سجّل الغرامة لتُتابع مع المشروع والمالية حتى السداد."}</DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><ProjectSelect ctx={ctx} value={projectId} onChange={setProjectId} disabled={!!row} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>الغرامة</Label><Input value={form.title} disabled={locked} onChange={(e) => set("title")(e.target.value)} placeholder="مثال: غرامة تأخير، مخالفة سلامة موقع…" /></div>
          <div className="space-y-1.5"><Label>الجهة المصدرة</Label><Input value={form.authority} disabled={locked} onChange={(e) => set("authority")(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>رقم المرجع</Label><Input value={form.referenceNo} disabled={locked} onChange={(e) => set("referenceNo")(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>المتحمّل</Label>
            <Select value={form.liableParty} onValueChange={set("liableParty")} disabled={locked}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(LIABLE_PARTY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
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
          <div className="space-y-1.5 sm:col-span-2"><Label>سبب الغرامة</Label><Textarea rows={2} value={form.reason} disabled={locked} onChange={(e) => set("reason")(e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>ملاحظات</Label><Textarea rows={2} value={form.notes} disabled={locked} onChange={(e) => set("notes")(e.target.value)} /></div>
        </div>
        {locked && <p className="text-xs text-muted-foreground">هذه الغرامة ضمن مسار السداد أو الإعفاء ولا يمكن تعديلها.</p>}
        {row?.waiverReason && ["waiver_requested", "waived"].includes(row.status) && (
          <div className="rounded-xl border bg-violet-50 dark:bg-violet-900/10 p-3 text-sm">
            <div className="font-bold mb-1">سبب طلب الإعفاء</div>
            {row.waiverReason}
          </div>
        )}
        {waiverPanel && (
          <div className="space-y-2 rounded-xl border p-3">
            <Label>{waiverPanel === "request" ? "لماذا يجب إعفاء هذه الغرامة؟" : "سبب رفض الإعفاء"}</Label>
            <Textarea rows={2} value={waiverNote} onChange={(e) => setWaiverNote(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setWaiverPanel(null)}>تراجع</Button>
              <Button size="sm" disabled={!waiverNote.trim() || waiver.isPending} onClick={() => waiver.mutate({ action: waiverPanel, note: waiverNote })}>
                {waiverPanel === "request" ? "إرسال الطلب" : "رفض الطلب"}
              </Button>
            </div>
          </div>
        )}

        {row && (
          <>
            <AttachmentsPanel entityType="fine" entityId={row.id} projectId={row.projectId} files={row.attachments} editable canRemove={(f) => f.uploadedBy === user?.id || ctx.perms.isAccounting} hint="أرفق إشعار الغرامة وأي مراسلات اعتراض أو إيصال السداد." />
            <ActivityTimeline entityType="fine" entityId={row.id} labels={FINE_LABELS} />
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
          {row && ctx.perms.isAccounting && !locked && (
            <Button variant="ghost" className="text-destructive me-auto" disabled={remove.isPending} onClick={() => remove.mutate()}><Trash2 className="w-4 h-4 mr-1" /> حذف</Button>
          )}
          {canRequestPayment && <Button variant="outline" onClick={() => onRequestPayment(row.id)}><Banknote className="w-4 h-4 mr-1" /> أمر دفع للغرامة</Button>}
          {canRequestWaiver && <Button variant="outline" onClick={() => { setWaiverNote(""); setWaiverPanel("request"); }}><HandHelping className="w-4 h-4 mr-1" /> طلب إعفاء</Button>}
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
          {row?.status === "waiver_requested" && (row.waiverRequestedBy === user?.id || ctx.perms.canApprove) && (
            <Button variant="ghost" disabled={waiver.isPending} onClick={() => waiver.mutate({ action: "withdraw" })}>سحب الطلب</Button>
          )}
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          {!locked && <Button disabled={save.isPending || !form.title.trim() || !projectId} onClick={() => save.mutate()}><Save className="w-4 h-4 mr-1" /> حفظ</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
