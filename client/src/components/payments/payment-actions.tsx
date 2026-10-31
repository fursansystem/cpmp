import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, FilePlus2, HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BILL_REQUEST_LABELS, PAYMENT_ORDER_LABELS } from "@shared/payments";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CreateBillRequestDialog, type BillRequestPrefill } from "./bill-requests-tab";
import { CreateOrderDialog } from "./orders-tab";
import { FineDialog, type DeductionPrefill } from "./clearances-fines-tab";
import { PoCard, StatusBadge, errorMessage, fmtDate, getJson, invalidatePayments, money, paymentsQuery, type PaymentsContext, type PaymentsOverview } from "./payments-common";

// What a page knows when it starts a payment action. Whatever is missing, the person fills in.
export interface PaymentContext {
  projectId: string;
  purchaseOrderId?: string;
  supplierId?: string;
  payeeName?: string;
  amount?: number | string;
  description?: string;
  // The page it was started from, so that page can list what came of it
  sourceType?: "purchase_order" | "delivery" | "snag" | "ncr" | "project";
  sourceId?: string;
}

export type PaymentMode = "bill" | "order" | "request";

// Who the signed-in person is on this project, and the data the dialogs need. Shares the cache with the Payments page.
export function usePaymentRoles(projectId: string) {
  const { data: ctx } = useQuery<PaymentsContext>({
    queryKey: ["payments", "context"],
    queryFn: () => getJson("/api/payments/context"),
    meta: paymentsQuery,
  });
  const { data: overview } = useQuery<PaymentsOverview>({
    queryKey: ["payments", "overview", projectId],
    queryFn: () => getJson(`/api/payments/overview?projectId=${projectId}`),
    enabled: !!projectId && !!ctx,
    meta: paymentsQuery,
  });
  const project = ctx?.projects.find((p) => p.id === projectId);
  // With no project chosen yet (the Payments page across all projects) it is enough that they may request on one of them
  const mayRequest = !ctx ? false : projectId ? !!project?.canRequest : ctx.projects.some((p) => p.canRequest);
  return {
    ctx,
    overview,
    // accounting issues orders and asks for originals; everyone else on the project (except the consultant) asks for a transfer
    mode: !ctx ? null : ctx.perms.isAccounting ? ("accounting" as const) : mayRequest ? ("requester" as const) : null,
    ready: !!ctx && !!overview,
  };
}

// The dialog for one action, already filled with what the page knows
export function PaymentActionDialog({ mode, context, onClose }: { mode: PaymentMode; context: PaymentContext; onClose: () => void }) {
  const { ctx, overview } = usePaymentRoles(context.projectId);
  if (!ctx) return null;
  if (mode === "request") return <RequestTransferDialog ctx={ctx} context={context} onClose={onClose} />;
  if (!overview) return null;

  if (mode === "bill") {
    const prefill: BillRequestPrefill = {
      supplierId: context.supplierId,
      purchaseOrderId: context.purchaseOrderId,
      payeeName: context.payeeName,
      amount: context.amount,
      description: context.description,
      sourceType: context.sourceType,
      sourceId: context.sourceId,
    };
    return <CreateBillRequestDialog ctx={ctx} defaultProjectId={context.projectId} open onClose={onClose} prefill={prefill} />;
  }
  if (mode === "order") {
    return (
      <CreateOrderDialog
        ctx={ctx}
        defaultProjectId={context.projectId}
        data={overview}
        onClose={onClose}
        draft={{
          prefill: {
            kind: "advance",
            projectId: context.projectId,
            purchaseOrderId: context.purchaseOrderId,
            supplierId: context.supplierId,
            payeeName: context.payeeName,
            amount: context.amount,
            sourceType: context.sourceType,
            sourceId: context.sourceId,
          },
        }}
      />
    );
  }
  return null;
}

// Buttons for the person's role. Accounting gets "request the original invoices" and "payment order";
// everyone else on the project (except the consultant's team) gets "request a transfer".
export function PaymentActionButtons({ context, size = "sm" }: { context: PaymentContext; size?: "sm" | "default" }) {
  const { mode } = usePaymentRoles(context.projectId);
  const [open, setOpen] = useState<PaymentMode | null>(null);
  if (!mode) return null;

  return (
    <>
      {mode === "accounting" ? (
        <>
          <Button variant="outline" size={size} className="rounded-xl gap-1.5" onClick={() => setOpen("bill")}>
            <FilePlus2 className="w-4 h-4" /> طلب أصول فواتير
          </Button>
          <Button variant="outline" size={size} className="rounded-xl gap-1.5" onClick={() => setOpen("order")}>
            <Banknote className="w-4 h-4" /> أمر دفع
          </Button>
        </>
      ) : (
        <Button variant="outline" size={size} className="rounded-xl gap-1.5" onClick={() => setOpen("request")}>
          <HandCoins className="w-4 h-4" /> طلب تحويل
        </Button>
      )}
      {open && <PaymentActionDialog mode={open} context={context} onClose={() => setOpen(null)} />}
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

// A project member asks for a transfer. It goes to the project manager, then to accounting.
function RequestTransferDialog({ ctx, context, onClose }: { ctx: PaymentsContext; context: PaymentContext; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    purpose: context.purchaseOrderId ? "advance" : "other",
    payeeName: context.payeeName ?? "",
    amount: context.amount !== undefined ? String(context.amount) : "",
    reason: context.description ?? "",
    supplierId: context.supplierId ?? "",
    purchaseOrderId: context.purchaseOrderId ?? "",
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  // A page that knows the project fixes it; the Payments page across all projects lets the person pick
  const [projectId, setProjectId] = useState(context.projectId);

  const { data: sources } = useQuery<{ purchaseOrders: any[]; suppliers: { id: string; name: string }[] }>({
    queryKey: ["payments", "sources", projectId],
    queryFn: () => getJson(`/api/payments/sources?projectId=${projectId}`),
    enabled: !!projectId,
    meta: paymentsQuery,
  });

  const goesToManagerFirst = !ctx.perms.canApprove;
  const send = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/payments/orders/request", {
        projectId,
        purpose: form.purpose,
        payeeName: form.payeeName,
        amount: form.amount,
        reason: form.reason,
        supplierId: form.supplierId || null,
        purchaseOrderId: form.purchaseOrderId || null,
        sourceType: context.sourceType ?? null,
        sourceId: context.sourceId ?? null,
      }),
    onSuccess: () => {
      invalidatePayments(queryClient);
      toast({
        title: "أُرسل طلب التحويل",
        description: goesToManagerFirst ? "ينتظر موافقة مدير المشروع ثم المحاسبة، ويمكنك متابعته من المدفوعات ← أوامر الدفع." : "ينتظر المحاسبة، ويمكنك متابعته من المدفوعات ← أوامر الدفع.",
      });
      onClose();
    },
    onError: (e) => toast({ title: "تعذّر إرسال الطلب", description: errorMessage(e), variant: "destructive" }),
  });

  const po = sources?.purchaseOrders.find((p) => p.id === form.purchaseOrderId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>طلب تحويل مالي</DialogTitle>
          <DialogDescription>
            {goesToManagerFirst ? "يصل الطلب أولاً إلى مدير المشروع للموافقة، ثم إلى المحاسبة لإصدار أمر الدفع." : "يصل الطلب إلى المحاسبة لإصدار أمر الدفع."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {!context.projectId && (
            <Field label="المشروع">
              <Select value={projectId} onValueChange={(v) => { setProjectId(v); setForm((f) => ({ ...f, supplierId: "", purchaseOrderId: "" })); }}>
                <SelectTrigger><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
                <SelectContent>{ctx.projects.filter((p) => p.canRequest).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          <Field label="نوع الطلب">
            <Select value={form.purpose} onValueChange={set("purpose")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="advance">دفعة مقدمة</SelectItem>
                <SelectItem value="other">تحويل آخر</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {(sources?.suppliers.length ?? 0) > 0 && (
            <Field label="المورد (من سجل الموردين)">
              <Select
                value={form.supplierId || "none"}
                onValueChange={(v) => {
                  const s = sources?.suppliers.find((x) => x.id === v);
                  setForm((f) => ({ ...f, supplierId: v === "none" ? "" : v, payeeName: s && !f.payeeName ? s.name : f.payeeName }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— غير محدد —</SelectItem>
                  {sources?.suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          {(sources?.purchaseOrders.length ?? 0) > 0 && (
            <Field label="أمر شراء (اختياري)">
              <Select
                value={form.purchaseOrderId || "none"}
                onValueChange={(v) => {
                  const p = sources?.purchaseOrders.find((x) => x.id === v);
                  setForm((f) => ({ ...f, purchaseOrderId: v === "none" ? "" : v, supplierId: p?.supplierId && !f.supplierId ? p.supplierId : f.supplierId, payeeName: p && !f.payeeName ? p.supplierName ?? "" : f.payeeName }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {sources?.purchaseOrders.map((p) => <SelectItem key={p.id} value={p.id}>{p.poNumber} · {p.supplierName} · {money(p.totalAmount)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="المستفيد"><Input value={form.payeeName} onChange={(e) => set("payeeName")(e.target.value)} /></Field>
            <Field label="المبلغ المطلوب"><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount")(e.target.value)} /></Field>
          </div>
          {po && <p className="text-xs text-muted-foreground">قيمة أمر الشراء {po.poNumber}: {money(po.totalAmount)}</p>}
          <Field label="سبب الطلب">
            <Textarea rows={3} value={form.reason} onChange={(e) => set("reason")(e.target.value)} placeholder="لماذا يلزم التحويل؟ مثال: دفعة مقدمة لتوريد الألواح حسب شروط أمر الشراء." />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button disabled={send.isPending || !projectId || !form.payeeName.trim() || !(Number(form.amount) > 0) || !form.reason.trim()} onClick={() => send.mutate()}>إرسال الطلب</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The payments side of one purchase order, for its own page: where it stands, what was asked and paid on it,
// and the actions this person may take.
export function PoPaymentsPanel({ projectId, poId, poNumber, supplierId, supplierName }: { projectId: string; poId: string; poNumber: string; supplierId?: string | null; supplierName?: string | null }) {
  const { overview, mode } = usePaymentRoles(projectId);
  if (!overview) return null;

  const summary = overview.purchaseOrders.find((p) => p.id === poId) ?? null;
  const bills = overview.billRequests.filter((b) => b.purchaseOrderId === poId && b.status !== "cancelled");
  const orders = overview.orders.filter((o) => o.purchaseOrderId === poId && o.status !== "cancelled");
  // What is still to be invoiced is a sensible first guess for the amount of a request
  const toInvoice = summary ? Math.max(0, summary.value - summary.invoiced) : undefined;

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">المدفوعات المرتبطة بأمر الشراء</CardTitle>
        {mode && (
          <div className="flex flex-wrap gap-2">
            <PaymentActionButtons
              context={{
                projectId,
                purchaseOrderId: poId,
                supplierId: supplierId ?? undefined,
                payeeName: supplierName ?? undefined,
                amount: toInvoice && toInvoice > 0 ? toInvoice : undefined,
                description: `أصل فاتورة أمر الشراء ${poNumber}`,
                sourceType: "purchase_order",
                sourceId: poId,
              }}
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {summary ? <PoCard po={summary} /> : <p className="text-sm text-muted-foreground">لم يُطلب أو يُدفع شيء على هذا الأمر بعد.</p>}
        {bills.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-sm font-bold">طلبات أصول الفواتير</div>
            {bills.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-xl border px-3 py-2 text-sm">
                <span className="font-mono">{b.requestNo}</span>
                <StatusBadge status={b.status} labels={BILL_REQUEST_LABELS} />
                <span className="text-muted-foreground">{b.invoices.length} فاتورة</span>
                <span className="ms-auto tabular-nums">{money(b.invoiceTotal > 0 ? b.invoiceTotal : b.amount)}</span>
              </div>
            ))}
          </div>
        )}
        {orders.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-sm font-bold">أوامر الدفع وطلبات التحويل</div>
            {orders.map((o) => (
              <div key={o.id} className="flex items-center gap-3 rounded-xl border px-3 py-2 text-sm">
                <span className="font-mono">{o.orderNo}</span>
                <StatusBadge status={o.status} labels={PAYMENT_ORDER_LABELS} />
                <span className="text-muted-foreground">{o.purpose === "advance" ? "دفعة مقدمة" : o.billRequestId ? "فواتير" : "أخرى"}{o.paidDate ? ` · ${fmtDate(o.paidDate)}` : ""}</span>
                <span className="ms-auto tabular-nums">{money(o.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// "Log a deduction" for a page that found a reason for one (a snag item, an NCR). Opens the deduction form
// with the project, the reason and the party at fault already filled in.
export function DeductionButton({ projectId, prefill, label = "تسجيل خصم", size = "sm" }: { projectId: string; prefill: DeductionPrefill; label?: string; size?: "sm" | "default" }) {
  const { ctx } = usePaymentRoles(projectId);
  const [open, setOpen] = useState(false);
  if (!ctx || !ctx.projects.some((p) => p.id === projectId)) return null;
  return (
    <>
      <Button variant="outline" size={size} className="rounded-xl gap-1.5" onClick={() => setOpen(true)}>
        <HandCoins className="w-4 h-4" /> {label}
      </Button>
      {open && <FineDialog ctx={ctx} defaultProjectId={projectId} row={null} orders={[]} onClose={() => setOpen(false)} onRequestPayment={() => setOpen(false)} prefill={prefill} />}
    </>
  );
}
