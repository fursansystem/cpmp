import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Paperclip, Printer, Send, CheckCircle2, XCircle, Banknote, Ban } from "lucide-react";
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
  OPEN_PAYMENT_ORDER,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_ORDER_LABELS,
} from "@shared/payments";
import {
  ActivityTimeline,
  AttachmentsPanel,
  Field,
  StatusBadge,
  errorMessage,
  fmtDate,
  getJson,
  invalidatePayments,
  money,
  paymentsQuery,
  type PaymentsContext,
  type PaymentsOverview,
} from "./payments-common";

export interface OrderDraft {
  billRequestId?: string;
  fineId?: string;
  clearanceId?: string;
}

interface Props {
  ctx: PaymentsContext;
  projectId: string;
  data: PaymentsOverview;
  draft: OrderDraft | null;
  onDraftClose: () => void;
  onStartDraft: () => void;
}

const LIVE = [...OPEN_PAYMENT_ORDER, "paid"] as string[];

export function OrdersTab({ ctx, projectId, data, draft, onDraftClose, onStartDraft }: Props) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.orders.filter(
      (o) =>
        (status === "all" || o.status === status) &&
        (!q || [o.orderNo, o.payeeName, o.reason, o.projectName].some((s) => String(s ?? "").toLowerCase().includes(q))),
    );
  }, [data.orders, status, search]);

  const selected = data.orders.find((o) => o.id === openId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input className="ps-9" placeholder="بحث: رقم الأمر، المستفيد، المشروع…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(PAYMENT_ORDER_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        {ctx.perms.isAccounting && (
          <Button className="ms-auto" onClick={onStartDraft}>
            <Plus className="w-4 h-4 mr-1" /> أمر دفع جديد
          </Button>
        )}
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الرقم</TableHead>
                {projectId === "all" && <TableHead>المشروع</TableHead>}
                <TableHead>المستفيد</TableHead>
                <TableHead>المصدر</TableHead>
                <TableHead className="text-end">المبلغ</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>تاريخ الصرف</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">لا توجد أوامر دفع</TableCell></TableRow>
              )}
              {filtered.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => setOpenId(o.id)}>
                  <TableCell className="font-mono text-xs">{o.orderNo}</TableCell>
                  {projectId === "all" && <TableCell>{o.projectName}</TableCell>}
                  <TableCell className="font-semibold">{o.payeeName}</TableCell>
                  <TableCell className="text-muted-foreground">{sourceLabel(o, data)}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(o.amount)}</TableCell>
                  <TableCell><StatusBadge status={o.status} labels={PAYMENT_ORDER_LABELS} /></TableCell>
                  <TableCell>{fmtDate(o.paidDate)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    <Paperclip className="w-3.5 h-3.5 inline mr-1" />{o.attachments.length}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {draft && <CreateOrderDialog ctx={ctx} defaultProjectId={projectId} data={data} draft={draft} onClose={onDraftClose} />}
      {selected && <OrderDialog ctx={ctx} row={selected} data={data} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function sourceLabel(o: any, data: PaymentsOverview): string {
  if (o.billRequestId) return `فواتير ${data.billRequests.find((b) => b.id === o.billRequestId)?.requestNo ?? ""}`.trim();
  if (o.fineId) return `غرامة: ${data.fines.find((f) => f.id === o.fineId)?.title ?? ""}`;
  if (o.clearanceId) return `رسوم: ${data.clearances.find((c) => c.id === o.clearanceId)?.title ?? ""}`;
  if (o.purpose === "advance") return o.reason && o.reason !== ADVANCE_REASON ? `${ADVANCE_REASON}: ${o.reason}` : ADVANCE_REASON;
  return o.reason ?? "—";
}

type SourceKind = "bill" | "fine" | "clearance" | "advance" | "other";
// These three are paid against an existing record; advance and other stand on their own
const isSourced = (k: SourceKind): k is "bill" | "fine" | "clearance" => k === "bill" || k === "fine" || k === "clearance";
const ADVANCE_REASON = "دفعة مقدمة";

function CreateOrderDialog({ ctx, defaultProjectId, data, draft, onClose }: { ctx: PaymentsContext; defaultProjectId: string; data: PaymentsOverview; draft: OrderDraft; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const draftProject =
    data.billRequests.find((b) => b.id === draft.billRequestId)?.projectId ??
    data.fines.find((f) => f.id === draft.fineId)?.projectId ??
    data.clearances.find((c) => c.id === draft.clearanceId)?.projectId;

  const [projectId, setProjectId] = useState(draftProject ?? (defaultProjectId === "all" ? "" : defaultProjectId));
  const [kind, setKind] = useState<SourceKind>(draft.billRequestId ? "bill" : draft.fineId ? "fine" : draft.clearanceId ? "clearance" : "bill");
  const [sourceId, setSourceId] = useState(draft.billRequestId ?? draft.fineId ?? draft.clearanceId ?? "");
  const [payeeName, setPayeeName] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [advancePoId, setAdvancePoId] = useState("");

  const { data: sources } = useQuery<{ purchaseOrders: any[] }>({
    queryKey: ["payments", "sources", projectId],
    queryFn: () => getJson(`/api/payments/sources?projectId=${projectId}`),
    enabled: !!projectId && kind === "advance",
    meta: paymentsQuery,
  });

  const hasLive = (key: "billRequestId" | "fineId" | "clearanceId", id: string) =>
    data.orders.some((o) => o[key] === id && LIVE.includes(o.status));

  const options = useMemo(() => {
    const inProject = (r: any) => r.projectId === projectId;
    return {
      bill: data.billRequests.filter((b) => inProject(b) && b.status === "received" && !hasLive("billRequestId", b.id)),
      fine: data.fines.filter((f) => inProject(f) && ["open", "under_appeal"].includes(f.status) && !hasLive("fineId", f.id)),
      clearance: data.clearances.filter((c) => inProject(c) && !c.feePaid && Number(c.feeAmount) > 0 && !hasLive("clearanceId", c.id)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, projectId]);

  // Prefill payee / amount / reason from whatever the order is paying for
  useEffect(() => {
    if (!isSourced(kind) || !sourceId) return;
    if (kind === "bill") {
      const b = data.billRequests.find((x) => x.id === sourceId);
      if (b) { setPayeeName(b.payeeName); setAmount(String(b.amount)); setReason(b.description); }
    } else if (kind === "fine") {
      const f = data.fines.find((x) => x.id === sourceId);
      if (f) { setPayeeName(f.authority ?? ""); setAmount(String(Math.max(0, Number(f.amount) - Number(f.paidAmount)))); setReason(f.title); }
    } else {
      const c = data.clearances.find((x) => x.id === sourceId);
      if (c) { setPayeeName(c.authority ?? ""); setAmount(String(c.feeAmount)); setReason(`رسوم: ${c.title}`); }
    }
  }, [kind, sourceId, data]);

  const create = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/payments/orders", {
        projectId,
        billRequestId: kind === "bill" ? sourceId || null : null,
        fineId: kind === "fine" ? sourceId || null : null,
        clearanceId: kind === "clearance" ? sourceId || null : null,
        purchaseOrderId: kind === "bill" ? data.billRequests.find((b) => b.id === sourceId)?.purchaseOrderId ?? null : kind === "advance" ? advancePoId || null : null,
        certificateId: kind === "bill" ? data.billRequests.find((b) => b.id === sourceId)?.certificateId ?? null : null,
        purpose: kind === "advance" || kind === "other" ? kind : undefined,
        payeeName,
        amount,
        reason: reason || null,
      }),
    onSuccess: () => {
      invalidatePayments(queryClient);
      toast({ title: "تم إنشاء أمر الدفع كمسودة" });
      onClose();
    },
    onError: (e) => toast({ title: "تعذّر إنشاء أمر الدفع", description: errorMessage(e), variant: "destructive" }),
  });

  const list = isSourced(kind) ? options[kind] : [];
  const optionLabel = (r: any) =>
    kind === "bill" ? `${r.requestNo} · ${r.payeeName} · ${money(r.amount)}`
    : kind === "fine" ? `${r.title} · ${money(Number(r.amount) - Number(r.paidAmount))}`
    : `${r.title} · ${money(r.feeAmount)}`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>أمر دفع جديد</DialogTitle>
          <DialogDescription>يُصدر كمسودة، ثم يُرسل للاعتماد من الإدارة قبل الصرف.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>المشروع</Label>
            <Select value={projectId} onValueChange={(v) => { setProjectId(v); setSourceId(""); }} disabled={!!draftProject}>
              <SelectTrigger><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
              <SelectContent>{ctx.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>سبب الدفع</Label>
            <Select value={kind} onValueChange={(v) => { setKind(v as SourceKind); setSourceId(""); setAdvancePoId(""); setPayeeName(""); setAmount(""); setReason(v === "advance" ? ADVANCE_REASON : ""); }} disabled={!!draftProject}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bill">فواتير تم استلام أصولها</SelectItem>
                <SelectItem value="fine">سداد غرامة</SelectItem>
                <SelectItem value="clearance">رسوم مخالصة / تصريح</SelectItem>
                <SelectItem value="advance">دفعة مقدمة</SelectItem>
                <SelectItem value="other">أخرى (مع بيان السبب)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {kind === "advance" && (
            <div className="space-y-1.5">
              <Label>أمر شراء (اختياري)</Label>
              <Select value={advancePoId || "none"} onValueChange={(v) => {
                const po = sources?.purchaseOrders.find((p) => p.id === v);
                setAdvancePoId(v === "none" ? "" : v);
                if (po && !payeeName) setPayeeName(po.supplierName ?? "");
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {sources?.purchaseOrders.map((p) => <SelectItem key={p.id} value={p.id}>{p.poNumber} · {p.supplierName} · {money(p.totalAmount)}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">اربط الدفعة بأمر الشراء الذي تُدفع مقدماً عنه، إن وُجد.</p>
            </div>
          )}
          {isSourced(kind) && (
            <div className="space-y-1.5">
              <Label>المصدر</Label>
              <Select value={sourceId} onValueChange={setSourceId} disabled={!!draftProject}>
                <SelectTrigger><SelectValue placeholder={list.length ? "اختر" : "لا توجد عناصر متاحة"} /></SelectTrigger>
                <SelectContent>{list.map((r: any) => <SelectItem key={r.id} value={r.id}>{optionLabel(r)}</SelectItem>)}</SelectContent>
              </Select>
              {kind === "bill" && <p className="text-xs text-muted-foreground">تظهر هنا الطلبات التي أكدت المحاسبة استلام أصولها فقط.</p>}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>المستفيد</Label>
              <Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>المبلغ</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>البيان</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            disabled={create.isPending || !projectId || !payeeName.trim() || !(Number(amount) > 0) || (isSourced(kind) ? !sourceId : !reason.trim())}
            onClick={() => create.mutate()}
          >
            إنشاء المسودة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Panel = null | "reject" | "pay";

function OrderDialog({ ctx, row, data, onClose }: { ctx: PaymentsContext; row: any; data: PaymentsOverview; onClose: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<Panel>(null);
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<string>("bank_transfer");
  const [reference, setReference] = useState("");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));

  const act = useMutation({
    mutationFn: async (v: Record<string, unknown>) => apiRequest("POST", `/api/payments/orders/${row.id}/transition`, v),
    onSuccess: (_d, v) => {
      invalidatePayments(queryClient);
      const msg: Record<string, string> = { submit: "أُرسل للاعتماد", approve: "تم الاعتماد", reject: "تم الرفض", pay: "تم تسجيل الصرف", cancel: "تم الإلغاء" };
      toast({ title: msg[String(v.action)] });
      setPanel(null);
      setNote("");
    },
    onError: (e) => toast({ title: "تعذّر تنفيذ الإجراء", description: errorMessage(e), variant: "destructive" }),
  });

  const { isAccounting, canApprove } = ctx.perms;
  const ownOrder = row.createdBy === user?.id && user?.role !== "super_admin";
  const editable = ["draft", "rejected", "pending_approval", "approved"].includes(row.status);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono">{row.orderNo}</span>
            <StatusBadge status={row.status} labels={PAYMENT_ORDER_LABELS} />
          </DialogTitle>
          <DialogDescription>{row.projectName}</DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="المستفيد">{row.payeeName}</Field>
          <Field label="المبلغ">{money(row.amount)}</Field>
          <Field label="المصدر">{sourceLabel(row, data)}</Field>
          {row.reason && <div className="sm:col-span-3"><Field label="البيان">{row.reason}</Field></div>}
          <Field label="أنشأه">{row.createdByName ?? "—"}</Field>
          <Field label="اعتمده">{row.approvedByName ?? "—"}</Field>
          <Field label="تاريخ الاعتماد">{fmtDate(row.approvedAt)}</Field>
          {row.rejectReason && <div className="sm:col-span-3"><Field label="سبب الرفض"><span className="text-destructive">{row.rejectReason}</span></Field></div>}
          {row.status === "paid" && (
            <>
              <Field label="طريقة الدفع">{PAYMENT_METHOD_LABELS[row.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] ?? row.paymentMethod}</Field>
              <Field label="المرجع">{row.paymentReference ?? "—"}</Field>
              <Field label="تاريخ الصرف">{fmtDate(row.paidDate)}</Field>
            </>
          )}
        </div>

        <AttachmentsPanel
          entityType="payment_order"
          entityId={row.id}
          projectId={row.projectId}
          files={row.attachments}
          editable={isAccounting && editable}
          hint="أرفق ما يلزم لإثبات الدفع، مثل إشعار التحويل أو صورة الشيك."
          canRemove={() => true}
        />

        {panel === "reject" && (
          <div className="space-y-2 rounded-xl border p-3">
            <Label>سبب الرفض</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPanel(null)}>تراجع</Button>
              <Button size="sm" variant="destructive" disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ action: "reject", note })}>رفض الأمر</Button>
            </div>
          </div>
        )}
        {panel === "pay" && (
          <div className="space-y-3 rounded-xl border p-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>طريقة الدفع</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>رقم المرجع / الشيك</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>تاريخ الصرف</Label>
                <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPanel(null)}>تراجع</Button>
              <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ action: "pay", paymentMethod: method, paymentReference: reference || null, paidDate })}>
                تأكيد الصرف
              </Button>
            </div>
          </div>
        )}

        <ActivityTimeline entityType="payment_order" entityId={row.id} labels={PAYMENT_ORDER_LABELS} />

        <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
          <Button variant="outline" onClick={() => printVoucher(row, data)}>
            <Printer className="w-4 h-4 mr-1" /> طباعة
          </Button>
          {isAccounting && ["draft", "rejected"].includes(row.status) && (
            <Button disabled={act.isPending} onClick={() => act.mutate({ action: "submit" })}>
              <Send className="w-4 h-4 mr-1" /> إرسال للاعتماد
            </Button>
          )}
          {canApprove && row.status === "pending_approval" && (
            <>
              <Button disabled={act.isPending || ownOrder} title={ownOrder ? "لا يمكنك اعتماد أمر أنشأته" : undefined} onClick={() => act.mutate({ action: "approve" })}>
                <CheckCircle2 className="w-4 h-4 mr-1" /> اعتماد
              </Button>
              <Button variant="outline" disabled={act.isPending} onClick={() => setPanel("reject")}>
                <XCircle className="w-4 h-4 mr-1" /> رفض
              </Button>
            </>
          )}
          {isAccounting && row.status === "approved" && (
            <Button disabled={act.isPending} onClick={() => setPanel("pay")}>
              <Banknote className="w-4 h-4 mr-1" /> تسجيل الصرف
            </Button>
          )}
          {isAccounting && ["draft", "pending_approval", "approved", "rejected"].includes(row.status) && (
            <Button variant="ghost" className="text-destructive" disabled={act.isPending} onClick={() => act.mutate({ action: "cancel" })}>
              <Ban className="w-4 h-4 mr-1" /> إلغاء
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function printVoucher(row: any, data: PaymentsOverview) {
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return;
  const method = PAYMENT_METHOD_LABELS[row.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] ?? row.paymentMethod ?? "—";
  w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(row.orderNo)}</title>
<style>body{font-family:Arial,Tahoma,sans-serif;padding:32px;color:#111}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}
td{border:1px solid #bbb;padding:8px 10px;font-size:14px}td:first-child{background:#f3f4f6;width:30%;font-weight:700}.sig{display:flex;gap:24px;margin-top:64px}
.sig div{flex:1;border-top:1px solid #111;padding-top:6px;text-align:center;font-size:13px}</style></head><body>
<h1>أمر دفع — ${esc(row.orderNo)}</h1><div>${esc(row.projectName)}</div>
<table>
<tr><td>المستفيد</td><td>${esc(row.payeeName)}</td></tr>
<tr><td>المبلغ</td><td>${esc(money(row.amount))}</td></tr>
<tr><td>المصدر</td><td>${esc(sourceLabel(row, data))}</td></tr>
<tr><td>البيان</td><td>${esc(row.reason)}</td></tr>
<tr><td>الحالة</td><td>${esc(PAYMENT_ORDER_LABELS[row.status as keyof typeof PAYMENT_ORDER_LABELS] ?? row.status)}</td></tr>
<tr><td>أنشأه</td><td>${esc(row.createdByName)}</td></tr>
<tr><td>اعتمده</td><td>${esc(row.approvedByName)} ${esc(fmtDate(row.approvedAt))}</td></tr>
<tr><td>طريقة الدفع / المرجع</td><td>${esc(method)} ${esc(row.paymentReference)}</td></tr>
<tr><td>تاريخ الصرف</td><td>${esc(fmtDate(row.paidDate))}</td></tr>
</table>
<div class="sig"><div>المحاسب</div><div>المدير المالي</div><div>المدير المعتمد</div></div>
<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}
