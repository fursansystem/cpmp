import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, FilePlus2, HandCoins, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BILL_REQUEST_LABELS, PAYMENT_ORDER_LABELS } from "@shared/payments";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { RefLink } from "@/components/procurement/ref-link";
import { CreateBillRequestDialog, type BillRequestPrefill } from "./bill-requests-tab";
import { CreateOrderDialog } from "./orders-tab";
import { FineDialog, type DeductionPrefill } from "./clearances-fines-tab";
import { PaymentDialog, PoCard, StatusBadge, errorMessage, fmtDate, getJson, invalidatePayments, money, paymentsQuery, type PaymentsContext, type PaymentsOverview } from "./payments-common";

// What a page knows when it starts a payment action. Whatever is missing, the person fills in.
export interface PaymentContext {
  projectId: string;
  purchaseOrderId?: string;
  supplierId?: string;
  subcontractorId?: string;
  payeeName?: string;
  amount?: number | string;
  description?: string;
  // The page it was started from, so that page can list what came of it
  sourceType?: "purchase_order" | "delivery" | "snag" | "ncr" | "project" | "subcontractor";
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
  const { t } = useTranslation("payments");
  const { mode } = usePaymentRoles(context.projectId);
  const [open, setOpen] = useState<PaymentMode | null>(null);
  if (!mode) return null;

  return (
    <>
      {mode === "accounting" ? (
        <>
          <Button variant="outline" size={size} className="rounded-xl gap-1.5" onClick={() => setOpen("bill")}>
            <FilePlus2 className="w-4 h-4" /> {t("actions.bill_request_originals")}
          </Button>
          <Button variant="outline" size={size} className="rounded-xl gap-1.5" onClick={() => setOpen("order")}>
            <Banknote className="w-4 h-4" /> {t("actions.payment_order")}
          </Button>
        </>
      ) : (
        <Button variant="outline" size={size} className="rounded-xl gap-1.5" onClick={() => setOpen("request")}>
          <HandCoins className="w-4 h-4" /> {t("actions.request_transfer")}
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
  const { t } = useTranslation("payments");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const initialBeneficiaryType: "supplier" | "subcontractor" | "other" =
    context.subcontractorId || context.sourceType === "subcontractor"
      ? "subcontractor"
      : context.supplierId || context.purchaseOrderId
        ? "supplier"
        : "supplier";

  const [beneficiaryType, setBeneficiaryType] = useState<"supplier" | "subcontractor" | "other">(initialBeneficiaryType);

  const [form, setForm] = useState({
    purpose: context.purchaseOrderId ? "advance" : "other",
    payeeName: context.payeeName ?? "",
    amount: context.amount !== undefined ? String(context.amount) : "",
    reason: context.description ?? "",
    supplierId: context.supplierId ?? "",
    purchaseOrderId: context.purchaseOrderId ?? "",
    subcontractorId: context.subcontractorId ?? "",
    subcontractorContractId: "",
    subcontractorCertificateId: "",
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  // A page that knows the project fixes it; the Payments page across all projects lets the person pick
  const [projectId, setProjectId] = useState(context.projectId);

  const { data: sources } = useQuery<{
    purchaseOrders: any[];
    suppliers: { id: string; name: string }[];
    subcontractors?: { id: string; name: string; scope?: string; phone?: string; taxNumber?: string }[];
    subcontractorContracts?: { id: string; contractNo: string; title: string; subcontractorId: string; contractValue: string; status: string }[];
    subcontractorCertificates?: { id: string; certNo: string; subcontractorId: string; contractId?: string; netPayable: string; status: string }[];
  }>({
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
        purpose: beneficiaryType === "subcontractor" ? "subcontractor" : form.purpose,
        payeeName: form.payeeName,
        amount: form.amount,
        reason: form.reason,
        supplierId: beneficiaryType === "supplier" ? form.supplierId || null : null,
        purchaseOrderId: beneficiaryType === "supplier" ? form.purchaseOrderId || null : null,
        subcontractorId: beneficiaryType === "subcontractor" ? form.subcontractorId || null : null,
        subcontractorContractId: beneficiaryType === "subcontractor" ? form.subcontractorContractId || null : null,
        subcontractorCertificateId: beneficiaryType === "subcontractor" ? form.subcontractorCertificateId || null : null,
        sourceType: context.sourceType ?? (beneficiaryType === "subcontractor" ? "subcontractor" : null),
        sourceId: context.sourceId ?? (beneficiaryType === "subcontractor" ? form.subcontractorId : null),
      }),
    onSuccess: () => {
      invalidatePayments(queryClient);
      toast({
        title: t("toasts.transfer_sent"),
        description: goesToManagerFirst ? t("toasts.transfer_sent_desc_manager") : t("toasts.transfer_sent_desc_direct"),
      });
      onClose();
    },
    onError: (e) => toast({ title: t("errors.send_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  const po = sources?.purchaseOrders.find((p) => p.id === form.purchaseOrderId);

  return (
    <PaymentDialog
      onClose={onClose}
      size="md"
      icon={HandCoins}
      kind={t("transfer.kind")}
      title={t("transfer.title")}
      description={goesToManagerFirst ? t("transfer.desc_via_manager") : t("transfer.desc_direct")}
      amount={Number(form.amount) > 0 ? money(form.amount) : undefined}
      amountLabel={t("transfer.requested_amount")}
      footer={
        <>
          <Button disabled={send.isPending || !projectId || !form.payeeName.trim() || !(Number(form.amount) > 0) || !form.reason.trim()} onClick={() => send.mutate()}>
            <Send className="w-4 h-4 me-1" /> {t("common.send_request")}
          </Button>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        </>
      }
    >
        <div className="grid gap-3">
          {!context.projectId && (
            <Field label={t("common.project")}>
              <Select
                value={projectId}
                onValueChange={(v) => {
                  setProjectId(v);
                  setForm((f) => ({
                    ...f,
                    supplierId: "",
                    purchaseOrderId: "",
                    subcontractorId: "",
                    subcontractorContractId: "",
                    subcontractorCertificateId: "",
                  }));
                }}
              >
                <SelectTrigger><SelectValue placeholder={t("common.select_project")} /></SelectTrigger>
                <SelectContent>{ctx.projects.filter((p) => p.canRequest).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={t("transfer.request_type")}>
              <Select value={form.purpose} onValueChange={set("purpose")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">{t("transfer.advance")}</SelectItem>
                  <SelectItem value="other">{t("transfer.other")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label={t("transfer.beneficiary_type")}>
              <Select
                value={beneficiaryType}
                onValueChange={(v: "supplier" | "subcontractor" | "other") => {
                  setBeneficiaryType(v);
                  if (v === "supplier") {
                    setForm((f) => ({ ...f, subcontractorId: "", subcontractorContractId: "", subcontractorCertificateId: "" }));
                  } else if (v === "subcontractor") {
                    setForm((f) => ({ ...f, supplierId: "", purchaseOrderId: "" }));
                  } else {
                    setForm((f) => ({ ...f, supplierId: "", purchaseOrderId: "", subcontractorId: "", subcontractorContractId: "", subcontractorCertificateId: "" }));
                  }
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplier">{t("transfer.beneficiary_supplier")}</SelectItem>
                  <SelectItem value="subcontractor">{t("transfer.beneficiary_subcontractor")}</SelectItem>
                  <SelectItem value="other">{t("transfer.beneficiary_other")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Supplier Fields */}
          {beneficiaryType === "supplier" && (
            <>
              {(sources?.suppliers.length ?? 0) > 0 && (
                <Field label={t("bill_requests.supplier_from_register")}>
                  <Select
                    value={form.supplierId || "none"}
                    onValueChange={(v) => {
                      const s = sources?.suppliers.find((x) => x.id === v);
                      setForm((f) => ({ ...f, supplierId: v === "none" ? "" : v, payeeName: s && !f.payeeName ? s.name : f.payeeName }));
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("common.unspecified")}</SelectItem>
                      {sources?.suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {(sources?.purchaseOrders.length ?? 0) > 0 && (
                <Field label={t("bill_requests.po_optional")}>
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
            </>
          )}

          {/* Subcontractor Fields */}
          {beneficiaryType === "subcontractor" && (
            <>
              <Field label={t("transfer.subcontractor_label")}>
                <Select
                  value={form.subcontractorId || "none"}
                  onValueChange={(v) => {
                    const sub = (sources?.subcontractors ?? []).find((x) => x.id === v);
                    setForm((f) => ({
                      ...f,
                      subcontractorId: v === "none" ? "" : v,
                      subcontractorContractId: "",
                      subcontractorCertificateId: "",
                      payeeName: sub ? sub.name : f.payeeName,
                    }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder={t("transfer.subcontractor_placeholder")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("common.unspecified")}</SelectItem>
                    {(sources?.subcontractors ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} {s.scope ? `— ${s.scope}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {form.subcontractorId && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label={t("transfer.contract_label")}>
                    <Select
                      value={form.subcontractorContractId || "none"}
                      onValueChange={(v) => {
                        const cnt = (sources?.subcontractorContracts ?? []).find((c) => c.id === v);
                        setForm((f) => ({
                          ...f,
                          subcontractorContractId: v === "none" ? "" : v,
                          reason: cnt && !f.reason ? `دفعة لحساب العقد ${cnt.contractNo} — ${cnt.title}` : f.reason,
                        }));
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {(sources?.subcontractorContracts ?? [])
                          .filter((c) => c.subcontractorId === form.subcontractorId)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.contractNo} — {c.title} ({money(Number(c.contractValue) || 0)})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label={t("transfer.certificate_label")}>
                    <Select
                      value={form.subcontractorCertificateId || "none"}
                      onValueChange={(v) => {
                        const cert = (sources?.subcontractorCertificates ?? []).find((c) => c.id === v);
                        setForm((f) => ({
                          ...f,
                          subcontractorCertificateId: v === "none" ? "" : v,
                          amount: cert ? String(cert.netPayable) : f.amount,
                          reason: cert ? `صرف مستخلص معتمد رقم ${cert.certNo}` : f.reason,
                        }));
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {(sources?.subcontractorCertificates ?? [])
                          .filter((c) => c.subcontractorId === form.subcontractorId)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.certNo} · {t("certificates.net_payable")}: {money(Number(c.netPayable) || 0)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              )}
            </>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={t("common.payee")}><Input value={form.payeeName} onChange={(e) => set("payeeName")(e.target.value)} /></Field>
            <Field label={t("transfer.requested_amount")}><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount")(e.target.value)} /></Field>
          </div>
          {po && <p className="text-xs text-muted-foreground">{t("transfer.po_value_hint", { poNumber: po.poNumber, amount: money(po.totalAmount) })}</p>}
          <Field label={t("transfer.reason_label")}>
            <Textarea rows={3} value={form.reason} onChange={(e) => set("reason")(e.target.value)} placeholder={t("transfer.reason_placeholder")} />
          </Field>
        </div>
    </PaymentDialog>
  );
}

// The payments side of one purchase order, for its own page: where it stands, what was asked and paid on it,
// and the actions this person may take.
export function PoPaymentsPanel({ projectId, poId, poNumber, supplierId, supplierName }: { projectId: string; poId: string; poNumber: string; supplierId?: string | null; supplierName?: string | null }) {
  const { t } = useTranslation("payments");
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
        <CardTitle className="text-base">{t("po_payments.title")}</CardTitle>
        {mode && (
          <div className="flex flex-wrap gap-2">
            <PaymentActionButtons
              context={{
                projectId,
                purchaseOrderId: poId,
                supplierId: supplierId ?? undefined,
                payeeName: supplierName ?? undefined,
                amount: toInvoice && toInvoice > 0 ? toInvoice : undefined,
                description: t("actions.original_invoice_for_po", { poNumber }),
                sourceType: "purchase_order",
                sourceId: poId,
              }}
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {summary ? <PoCard po={summary} /> : <p className="text-sm text-muted-foreground">{t("po_payments.none")}</p>}
        {bills.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-sm font-bold">{t("po_payments.bill_requests_title")}</div>
            {bills.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-xl border px-3 py-2 text-sm">
                <RefLink href={`/payments?tab=bills&project=${projectId}`} className="font-mono">{b.requestNo}</RefLink>
                <StatusBadge status={b.status} group="bill_request" />
                <span className="text-muted-foreground">{t("po_payments.invoice_count", { count: b.invoices.length })}</span>
                <span className="ms-auto tabular-nums">{money(b.invoiceTotal > 0 ? b.invoiceTotal : b.amount)}</span>
              </div>
            ))}
          </div>
        )}
        {orders.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-sm font-bold">{t("po_payments.orders_title")}</div>
            {orders.map((o) => (
              <div key={o.id} className="flex items-center gap-3 rounded-xl border px-3 py-2 text-sm">
                <RefLink href={`/payments?tab=orders&project=${projectId}`} className="font-mono">{o.orderNo}</RefLink>
                <StatusBadge status={o.status} group="payment_order" />
                <span className="text-muted-foreground">{o.purpose === "advance" ? t("orders.purpose_advance") : o.billRequestId ? t("orders.purpose_invoices") : t("orders.purpose_other")}{o.paidDate ? ` · ${fmtDate(o.paidDate)}` : ""}</span>
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
export function DeductionButton({ projectId, prefill, label, size = "sm" }: { projectId: string; prefill: DeductionPrefill; label?: string; size?: "sm" | "default" }) {
  const { t } = useTranslation("payments");
  const { ctx } = usePaymentRoles(projectId);
  const [open, setOpen] = useState(false);
  if (!ctx || !ctx.projects.some((p) => p.id === projectId)) return null;
  return (
    <>
      <Button variant="outline" size={size} className="rounded-xl gap-1.5" onClick={() => setOpen(true)}>
        <HandCoins className="w-4 h-4" /> {label ?? t("fines.log_deduction")}
      </Button>
      {open && <FineDialog ctx={ctx} defaultProjectId={projectId} row={null} orders={[]} onClose={() => setOpen(false)} onRequestPayment={() => setOpen(false)} prefill={prefill} />}
    </>
  );
}
