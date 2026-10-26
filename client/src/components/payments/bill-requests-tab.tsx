import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Paperclip, AlertTriangle, CheckCircle2, Undo2, Send, Ban, Banknote } from "lucide-react";
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
import { BILL_REQUEST_LABELS, OPEN_BILL_REQUEST, OPEN_PAYMENT_ORDER } from "@shared/payments";
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
} from "./payments-common";

interface Props {
  ctx: PaymentsContext;
  projectId: string; // "all" or a project id
  rows: any[];
  orders: any[];
  onCreateOrder: (billRequestId: string) => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function BillRequestsTab({ ctx, projectId, rows, orders, onCreateOrder }: Props) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (!q || [r.requestNo, r.payeeName, r.description, r.projectName].some((s) => String(s ?? "").toLowerCase().includes(q))),
    );
  }, [rows, status, search]);

  const selected = rows.find((r) => r.id === openId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input className="ps-9" placeholder="بحث: رقم الطلب، المستفيد، المشروع…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(BILL_REQUEST_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        {ctx.perms.isAccounting && (
          <Button className="ms-auto" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1" /> طلب أصول فواتير
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
                <TableHead>المطلوب</TableHead>
                <TableHead className="text-end">المبلغ</TableHead>
                <TableHead>الاستحقاق</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">لا توجد طلبات</TableCell></TableRow>
              )}
              {filtered.map((r) => {
                const overdue = (OPEN_BILL_REQUEST as readonly string[]).includes(r.status) && r.dueDate && r.dueDate < todayIso();
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <TableCell className="font-mono text-xs">{r.requestNo}</TableCell>
                    {projectId === "all" && <TableCell>{r.projectName}</TableCell>}
                    <TableCell className="font-semibold">{r.payeeName}</TableCell>
                    <TableCell className="max-w-[280px] truncate">{r.description}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(r.amount)}</TableCell>
                    <TableCell className={overdue ? "text-destructive font-semibold" : ""}>
                      {overdue && <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />}
                      {fmtDate(r.dueDate)}
                    </TableCell>
                    <TableCell><StatusBadge status={r.status} labels={BILL_REQUEST_LABELS} /></TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      <Paperclip className="w-3.5 h-3.5 inline mr-1" />{r.attachments.length}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateBillRequestDialog ctx={ctx} defaultProjectId={projectId} open={creating} onClose={() => setCreating(false)} />
      {selected && (
        <BillRequestDialog
          ctx={ctx}
          row={selected}
          orders={orders}
          onClose={() => setOpenId(null)}
          onCreateOrder={(id) => { setOpenId(null); onCreateOrder(id); }}
        />
      )}
    </div>
  );
}

function CreateBillRequestDialog({ ctx, defaultProjectId, open, onClose }: { ctx: PaymentsContext; defaultProjectId: string; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState(defaultProjectId === "all" ? "" : defaultProjectId);
  const [form, setForm] = useState({ payeeName: "", description: "", amount: "", dueDate: "", purchaseOrderId: "", certificateId: "", notes: "" });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: sources } = useQuery<{ purchaseOrders: any[]; certificates: any[] }>({
    queryKey: ["payments", "sources", projectId],
    queryFn: () => getJson(`/api/payments/sources?projectId=${projectId}`),
    enabled: !!projectId && open,
    meta: paymentsQuery,
  });

  const create = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/payments/bill-requests", {
        projectId,
        payeeName: form.payeeName,
        description: form.description,
        amount: form.amount || 0,
        dueDate: form.dueDate || null,
        purchaseOrderId: form.purchaseOrderId || null,
        certificateId: form.certificateId || null,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      invalidatePayments(queryClient);
      toast({ title: "تم إرسال طلب أصول الفواتير" });
      setForm({ payeeName: "", description: "", amount: "", dueDate: "", purchaseOrderId: "", certificateId: "", notes: "" });
      onClose();
    },
    onError: (e) => toast({ title: "تعذّر إنشاء الطلب", description: errorMessage(e), variant: "destructive" }),
  });

  const pickPo = (id: string) => {
    const po = sources?.purchaseOrders.find((p) => p.id === id);
    setForm((f) => ({
      ...f,
      purchaseOrderId: id === "none" ? "" : id,
      payeeName: po && !f.payeeName ? po.supplierName ?? "" : f.payeeName,
      amount: po && !f.amount ? String(po.totalAmount ?? "") : f.amount,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>طلب أصول الفواتير والمرفقات</DialogTitle>
          <DialogDescription>يُرسل الطلب إلى المشروع ليرفع الفواتير الأصلية وما يلزم قبل إصدار أمر الدفع.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>المشروع</Label>
            <Select value={projectId} onValueChange={(v) => { setProjectId(v); setForm((f) => ({ ...f, purchaseOrderId: "", certificateId: "" })); }}>
              <SelectTrigger><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
              <SelectContent>{ctx.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {projectId && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>أمر شراء (اختياري)</Label>
                <Select value={form.purchaseOrderId || "none"} onValueChange={pickPo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {sources?.purchaseOrders.map((p) => <SelectItem key={p.id} value={p.id}>{p.poNumber} · {p.supplierName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>مستخلص (اختياري)</Label>
                <Select value={form.certificateId || "none"} onValueChange={(v) => set("certificateId")(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {sources?.certificates.map((c) => <SelectItem key={c.id} value={c.id}>مستخلص #{c.certNo}{c.title ? ` · ${c.title}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>المستفيد (المورد / المقاول)</Label>
            <Input value={form.payeeName} onChange={(e) => set("payeeName")(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>الفواتير والمرفقات المطلوبة</Label>
            <Textarea rows={3} placeholder="مثال: الفاتورة الضريبية الأصلية، إذن الاستلام، شهادة الإنجاز…" value={form.description} onChange={(e) => set("description")(e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>المبلغ المتوقع</Label>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>الرد المطلوب قبل</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate")(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>ملاحظات</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes")(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button disabled={create.isPending || !projectId || !form.payeeName.trim() || !form.description.trim()} onClick={() => create.mutate()}>
            إرسال الطلب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BillRequestDialog({ ctx, row, orders, onClose, onCreateOrder }: { ctx: PaymentsContext; row: any; orders: any[]; onClose: () => void; onCreateOrder: (id: string) => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");

  const act = useMutation({
    mutationFn: async (v: { action: string; note?: string }) => apiRequest("POST", `/api/payments/bill-requests/${row.id}/transition`, v),
    onSuccess: (_d, v) => {
      invalidatePayments(queryClient);
      const msg: Record<string, string> = { submit: "تم إرسال الأصول للمحاسبة", receive: "تم تأكيد استلام الأصول", return: "تمت إعادة الطلب للتصحيح", cancel: "تم إلغاء الطلب" };
      toast({ title: msg[v.action] });
      setReturning(false);
      setNote("");
    },
    onError: (e) => toast({ title: "تعذّر تنفيذ الإجراء", description: errorMessage(e), variant: "destructive" }),
  });

  const { isAccounting } = ctx.perms;
  const hasLiveOrder = orders.some((o) => o.billRequestId === row.id && ([...OPEN_PAYMENT_ORDER, "paid"] as string[]).includes(o.status));
  const filesEditable = ["requested", "returned", "submitted"].includes(row.status);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono">{row.requestNo}</span>
            <StatusBadge status={row.status} labels={BILL_REQUEST_LABELS} />
          </DialogTitle>
          <DialogDescription>{row.projectName}</DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="المستفيد">{row.payeeName}</Field>
          <Field label="المبلغ المتوقع">{money(row.amount)}</Field>
          <Field label="الرد قبل">{fmtDate(row.dueDate)}</Field>
          <div className="sm:col-span-3"><Field label="المطلوب">{row.description}</Field></div>
          {row.notes && <div className="sm:col-span-3"><Field label="ملاحظات">{row.notes}</Field></div>}
          <Field label="طلبه">{row.requestedByName ?? "—"}</Field>
          <Field label="تاريخ الطلب">{fmtDate(row.createdAt)}</Field>
          {row.receivedAt && <Field label="تاريخ الاستلام">{fmtDate(row.receivedAt)}</Field>}
        </div>

        <AttachmentsPanel
          entityType="bill_request"
          entityId={row.id}
          projectId={row.projectId}
          files={row.attachments}
          editable={filesEditable}
          hint={["requested", "returned"].includes(row.status) ? "أرفق الفواتير الأصلية ثم اضغط «إرسال للمحاسبة»." : undefined}
          canRemove={(f) => f.uploadedBy === user?.id || isAccounting}
        />

        {returning && (
          <div className="space-y-2 rounded-xl border p-3">
            <Label>ما المطلوب تصحيحه؟</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setReturning(false)}>تراجع</Button>
              <Button size="sm" disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ action: "return", note })}>إعادة الطلب</Button>
            </div>
          </div>
        )}

        <ActivityTimeline entityType="bill_request" entityId={row.id} labels={BILL_REQUEST_LABELS} />

        <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
          {["requested", "returned"].includes(row.status) && (
            <Button disabled={act.isPending || row.attachments.length === 0} onClick={() => act.mutate({ action: "submit" })}>
              <Send className="w-4 h-4 mr-1" /> إرسال للمحاسبة
            </Button>
          )}
          {isAccounting && row.status === "submitted" && (
            <>
              <Button disabled={act.isPending} onClick={() => act.mutate({ action: "receive" })}>
                <CheckCircle2 className="w-4 h-4 mr-1" /> تأكيد استلام الأصول
              </Button>
              <Button variant="outline" disabled={act.isPending} onClick={() => setReturning(true)}>
                <Undo2 className="w-4 h-4 mr-1" /> إعادة للتصحيح
              </Button>
            </>
          )}
          {isAccounting && row.status === "received" && !hasLiveOrder && (
            <Button onClick={() => onCreateOrder(row.id)}>
              <Banknote className="w-4 h-4 mr-1" /> إصدار أمر دفع
            </Button>
          )}
          {isAccounting && ["requested", "returned", "submitted"].includes(row.status) && (
            <Button variant="ghost" className="text-destructive" disabled={act.isPending} onClick={() => act.mutate({ action: "cancel" })}>
              <Ban className="w-4 h-4 mr-1" /> إلغاء الطلب
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
