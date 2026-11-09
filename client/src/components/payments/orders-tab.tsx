import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Paperclip, Printer, Send, CheckCircle2, XCircle, Banknote, Ban, AlertTriangle, FileSearch, FileCheck, FileText } from "lucide-react";
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
  BILL_REQUEST_LABELS,
  OPEN_PAYMENT_ORDER,
  isPoOver,
  poCommitted,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_ORDER_LABELS, PAYMENT_ORDER_STATUSES } from "@shared/payments";
import {
  LatestActivity,
  AttachmentsPanel,
  Field,
  StatusBadge,
  errorMessage,
  fmtDate,
  getJson,
  invalidatePayments,
  money,
  useFocusFromUrl,
  paymentsQuery,
  PaymentDialog,
  PoCard,
  PoOverAlert,
  poLabel,
  Section,
  Tile,
  TileRow,
  type PaymentsContext,
  type PaymentsOverview,
} from "./payments-common";
import { enumOptions, enumText } from "@/lib/enums";
import { printVoucher } from "./payment-order-print";

export interface OrderDraft {
  billRequestId?: string;
  fineId?: string;
  permitTransactionId?: string;
  subcontractorCertificateId?: string;
  // A page that starts a standalone payment (an advance on a purchase order, say) hands over what it knows
  prefill?: {
    kind: "advance" | "other";
    projectId: string;
    purchaseOrderId?: string;
    supplierId?: string;
    payeeName?: string;
    amount?: number | string;
    reason?: string;
    sourceType?: string;
    sourceId?: string;
  };
}

interface Props {
  ctx: PaymentsContext;
  projectId: string;
  data: PaymentsOverview;
  draft: OrderDraft | null;
  onDraftClose: () => void;
  onStartDraft: () => void;
  onOpenBillRequest: (billRequestId: string) => void;
  // For people who may ask for a transfer but not issue an order: their button sits where accounting's "new order" does
  requesterAction?: ReactNode;
}

const LIVE = [...OPEN_PAYMENT_ORDER, "paid"] as string[];

export function OrdersTab({ ctx, projectId, data, draft, onDraftClose, onStartDraft, onOpenBillRequest, requesterAction }: Props) {
  const { t } = useTranslation("payments");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  useFocusFromUrl((id) => data.orders.some((o: any) => o.id === id), setOpenId);

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
          <Input className="ps-9" placeholder={t("orders.search_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all_statuses")}</SelectItem>
            {enumOptions("payment_order", PAYMENT_ORDER_STATUSES).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {ctx.perms.isAccounting ? (
          <Button className="ms-auto" onClick={onStartDraft}>
            <Plus className="w-4 h-4 me-1" /> {t("orders.create_btn")}
          </Button>
        ) : (
          <div className="ms-auto flex gap-2">{requesterAction}</div>
        )}
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.number")}</TableHead>
                {projectId === "all" && <TableHead>{t("common.project")}</TableHead>}
                <TableHead>{t("common.payee")}</TableHead>
                <TableHead>{t("common.source")}</TableHead>
                <TableHead className="text-end">{t("common.amount")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("orders.payment_date")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">{t("orders.no_items")}</TableCell></TableRow>
              )}
              {filtered.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => setOpenId(o.id)}>
                  <TableCell className="font-mono text-xs">{o.orderNo}</TableCell>
                  {projectId === "all" && <TableCell>{o.projectName}</TableCell>}
                  <TableCell className="font-semibold">{o.payeeName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {sourceLabel(o, data, t)}
                    {o.purchaseOrderId && (() => {
                      const p = data.purchaseOrders.find((x) => x.id === o.purchaseOrderId);
                      return p ? <div className={`text-xs flex items-center gap-1 ${p.over ? "text-destructive" : ""}`}>{p.over && <AlertTriangle className="w-3 h-3" />}{p.poNumber}</div> : null;
                    })()}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{money(o.amount)}</TableCell>
                  <TableCell><StatusBadge status={o.status} group="payment_order" /></TableCell>
                  <TableCell>{fmtDate(o.paidDate)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    <Paperclip className="w-3.5 h-3.5 inline me-1" />{o.attachments.length}
                    <OriginalsControl ctx={ctx} order={o} data={data} compact onOpen={onOpenBillRequest} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {draft && <CreateOrderDialog ctx={ctx} defaultProjectId={projectId} data={data} draft={draft} onClose={onDraftClose} />}
      {selected && <OrderDialog ctx={ctx} row={selected} data={data} onClose={() => setOpenId(null)} onOpenBillRequest={(id) => { setOpenId(null); onOpenBillRequest(id); }} />}
    </div>
  );
}

function sourceLabel(o: any, data: PaymentsOverview, t?: (key: string, opts?: any) => string): string {
  const tr = (k: string, opts?: any): string => String(t ? t(k, opts) : i18n.t(k, { ns: "payments", ...opts }));
  if (o.billRequestId) {
    const b = data.billRequests.find((x) => x.id === o.billRequestId);
    const nos = (b?.invoices ?? []).map((i: any) => i.invoiceNo).join(", ");
    return `${tr("orders.purpose_invoices")} ${b?.requestNo ?? ""}${nos ? ` (${nos})` : ""}`.trim();
  }
  if (o.fineId) return tr("orders.fine_source", { title: data.fines.find((f) => f.id === o.fineId)?.title ?? "" });
  if (o.permitTransactionId) {
    const p = data.permits.find((c) => c.id === o.permitTransactionId);
    return tr("orders.permit_reason", { info: p ? `${p.transactionNo} · ${p.title}` : "" });
  }
  if (o.subcontractorCertificateId) return tr("orders.cert_source", { certNo: data.subcontractorCertificates.find((c) => c.id === o.subcontractorCertificateId)?.certNo ?? "" });
  if (o.purpose === "advance") return o.reason && o.reason !== "دفعة مقدمة" && o.reason !== "Advance payment" ? `${tr("orders.purpose_advance")}: ${o.reason}` : tr("orders.purpose_advance");
  return o.reason ?? "—";
}

type SourceKind = "bill" | "fine" | "clearance" | "subcontractor" | "advance" | "other";
// These are paid against an existing record; advance and other stand on their own
const isSourced = (k: SourceKind): k is "bill" | "fine" | "clearance" | "subcontractor" =>
  k === "bill" || k === "fine" || k === "clearance" || k === "subcontractor";

export function CreateOrderDialog({ ctx, defaultProjectId, data, draft, onClose }: { ctx: PaymentsContext; defaultProjectId: string; data: PaymentsOverview; draft: OrderDraft; onClose: () => void }) {
  const { t } = useTranslation("payments");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const draftProject =
    data.billRequests.find((b) => b.id === draft.billRequestId)?.projectId ??
    data.fines.find((f) => f.id === draft.fineId)?.projectId ??
    data.permits.find((c) => c.id === draft.permitTransactionId)?.projectId ??
    data.subcontractorCertificates.find((c) => c.id === draft.subcontractorCertificateId)?.projectId;

  const pre = draft.prefill;
  const [projectId, setProjectId] = useState(draftProject ?? pre?.projectId ?? (defaultProjectId === "all" ? "" : defaultProjectId));
  const [kind, setKind] = useState<SourceKind>(
    pre?.kind ?? (draft.billRequestId ? "bill" : draft.fineId ? "fine" : draft.permitTransactionId ? "clearance" : draft.subcontractorCertificateId ? "subcontractor" : "bill"),
  );
  const [sourceId, setSourceId] = useState(draft.billRequestId ?? draft.fineId ?? draft.permitTransactionId ?? draft.subcontractorCertificateId ?? "");
  const [payeeName, setPayeeName] = useState(pre?.payeeName ?? "");
  const [amount, setAmount] = useState(pre?.amount !== undefined ? String(pre.amount) : "");
  const [reason, setReason] = useState(pre?.reason ?? (pre?.kind === "advance" ? t("orders.advance_reason") : ""));
  const [advancePoId, setAdvancePoId] = useState(pre?.purchaseOrderId ?? "");
  const [supplierId, setSupplierId] = useState(pre?.supplierId ?? "");

  const { data: sources } = useQuery<{ purchaseOrders: any[]; suppliers: { id: string; name: string }[] }>({
    queryKey: ["payments", "sources", projectId],
    queryFn: () => getJson(`/api/payments/sources?projectId=${projectId}`),
    enabled: !!projectId,
    meta: paymentsQuery,
  });

  const hasLive = (key: "billRequestId" | "fineId" | "permitTransactionId" | "subcontractorCertificateId", id: string) =>
    data.orders.some((o) => o[key] === id && LIVE.includes(o.status));

  const options = useMemo(() => {
    const inProject = (r: any) => r.projectId === projectId;
    return {
      bill: data.billRequests.filter((b) => inProject(b) && b.status === "received" && !hasLive("billRequestId", b.id)),
      fine: data.fines.filter((f) => inProject(f) && ["open", "under_appeal"].includes(f.status) && !hasLive("fineId", f.id)),
      // licence / transaction fees from الرخص والمعاملات; a transfer request already raised for one counts as its order
      clearance: data.permits.filter((c) => inProject(c) && !c.feePaid && Number(c.feeAmount) > 0 && !["cancelled", "rejected"].includes(c.status) &&
        !data.orders.some((o) => o.permitTransactionId === c.id && !["rejected", "cancelled"].includes(o.status))),
      subcontractor: data.subcontractorCertificates.filter((c) => inProject(c) && c.status === "approved" && !hasLive("subcontractorCertificateId", c.id)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, projectId]);

  // Prefill payee / amount / reason from whatever the order is paying for
  useEffect(() => {
    if (!isSourced(kind) || !sourceId) return;
    if (kind === "bill") {
      const b = data.billRequests.find((x) => x.id === sourceId);
      if (b) {
        // Pay what the listed invoices add up to; fall back to the expected amount if none are listed
        const nos = (b.invoices ?? []).map((i: any) => i.invoiceNo).join(", ");
        setPayeeName(b.payeeName);
        setAmount(String(b.invoiceTotal > 0 ? b.invoiceTotal : b.amount));
        setReason(nos ? t("orders.invoices_with_nos", { description: b.description, nos }) : b.description);
      }
    } else if (kind === "fine") {
      const f = data.fines.find((x) => x.id === sourceId);
      if (f) { setPayeeName(f.authority ?? ""); setAmount(String(Math.max(0, Number(f.amount) - Number(f.paidAmount)))); setReason(f.title); }
    } else if (kind === "subcontractor") {
      const c = data.subcontractorCertificates.find((x) => x.id === sourceId);
      if (c) { setPayeeName(c.subcontractorName); setAmount(String(c.netPayable)); setReason(t("orders.cert_reason", { certNo: c.certNo, name: c.subcontractorName })); }
    } else {
      const c = data.permits.find((x) => x.id === sourceId);
      if (c) { setPayeeName(c.authorityName ?? ""); setAmount(String(c.feeAmount)); setReason(t("orders.permit_reason", { info: `${c.transactionNo} · ${c.title}` })); }
    }
  }, [kind, sourceId, data]);

  const create = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/payments/orders", {
        projectId,
        billRequestId: kind === "bill" ? sourceId || null : null,
        fineId: kind === "fine" ? sourceId || null : null,
        permitTransactionId: kind === "clearance" ? sourceId || null : null,
        subcontractorCertificateId: kind === "subcontractor" ? sourceId || null : null,
        // a bill request brings its own supplier and PO; anything else can name them
        supplierId: kind === "bill" ? null : supplierId || null,
        sourceType: pre?.sourceType ?? null,
        sourceId: pre?.sourceId ?? null,
        purchaseOrderId: kind === "bill" ? data.billRequests.find((b) => b.id === sourceId)?.purchaseOrderId ?? null : advancePoId || null,
        certificateId: kind === "bill" ? data.billRequests.find((b) => b.id === sourceId)?.certificateId ?? null : null,
        purpose: kind === "advance" || kind === "other" ? kind : undefined,
        payeeName,
        amount,
        reason: reason || null,
      }),
    onSuccess: () => {
      invalidatePayments(queryClient);
      toast({ title: t("toasts.order_created") });
      onClose();
    },
    onError: (e) => toast({ title: t("errors.create_order_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  // The purchase order this payment counts against: a bill request brings its own, anything else can pick one
  const billForPo = kind === "bill" ? data.billRequests.find((b) => b.id === sourceId) : null;
  const effPoId: string = kind === "bill" ? billForPo?.purchaseOrderId ?? "" : advancePoId;
  const poSummary = data.purchaseOrders.find((p) => p.id === effPoId) ?? null;
  const poSource = sources?.purchaseOrders.find((p) => p.id === effPoId);
  const poValue = poSummary?.value ?? Number(poSource?.totalAmount ?? 0);
  // What would be committed on the PO once this order exists. Warn only, never block.
  const projectedCommitted = poCommitted(poSummary?.invoiced ?? 0, (poSummary?.ordered ?? 0) + (Number(amount) || 0));
  const poOver = !!effPoId && isPoOver(projectedCommitted, poValue);

  const list = isSourced(kind) ? options[kind] : [];
  const optionLabel = (r: any) =>
    kind === "bill" ? `${r.requestNo} · ${r.payeeName} · ${money(r.invoiceTotal > 0 ? r.invoiceTotal : r.amount)}`
    : kind === "fine" ? `${r.title} · ${money(Number(r.amount) - Number(r.paidAmount))}`
    : kind === "subcontractor" ? `${r.certNo} · ${r.subcontractorName} · ${money(r.netPayable)}`
    : `${r.transactionNo} · ${r.title} · ${money(r.feeAmount)}`;

  return (
    <PaymentDialog
      onClose={onClose}
      size="md"
      icon={Banknote}
      kind={t("orders.kind")}
      title={t("orders.new_title")}
      description={t("orders.new_description")}
      footer={
        <>
          <Button
            disabled={create.isPending || !projectId || !payeeName.trim() || !(Number(amount) > 0) || (isSourced(kind) ? !sourceId : !reason.trim())}
            onClick={() => create.mutate()}
          >
            <Plus className="w-4 h-4 me-1" /> {t("orders.create_btn")}
          </Button>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        </>
      }
    >
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>{t("common.project")}</Label>
            <Select value={projectId} onValueChange={(v) => { setProjectId(v); setSourceId(""); }} disabled={!!draftProject}>
              <SelectTrigger><SelectValue placeholder={t("common.select_project")} /></SelectTrigger>
              <SelectContent>{ctx.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("orders.reason_label")}</Label>
            <Select value={kind} onValueChange={(v) => { setKind(v as SourceKind); setSourceId(""); setAdvancePoId(""); setSupplierId(""); setPayeeName(""); setAmount(""); setReason(v === "advance" ? t("orders.advance_reason") : ""); }} disabled={!!draftProject}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bill">{t("orders.source_invoices")}</SelectItem>
                <SelectItem value="fine">{t("orders.source_fine")}</SelectItem>
                <SelectItem value="clearance">{t("orders.source_permit")}</SelectItem>
                <SelectItem value="subcontractor">{t("orders.source_subcontractor")}</SelectItem>
                <SelectItem value="advance">{t("orders.source_advance")}</SelectItem>
                <SelectItem value="other">{t("orders.source_other")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(kind === "advance" || kind === "other") && (sources?.suppliers.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <Label>{t("orders.supplier_from_register")}</Label>
              <Select
                value={supplierId || "none"}
                onValueChange={(v) => {
                  const s = sources?.suppliers.find((x) => x.id === v);
                  setSupplierId(v === "none" ? "" : v);
                  if (s && !payeeName) setPayeeName(s.name);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("common.unspecified")}</SelectItem>
                  {sources?.suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {kind !== "bill" && (
            <div className="space-y-1.5">
              <Label>{t("orders.po_optional")}</Label>
              <Select value={advancePoId || "none"} onValueChange={(v) => {
                const po = sources?.purchaseOrders.find((p) => p.id === v);
                setAdvancePoId(v === "none" ? "" : v);
                if (po && !payeeName && (kind === "advance" || kind === "other")) setPayeeName(po.supplierName ?? "");
                if (po?.supplierId && !supplierId) setSupplierId(po.supplierId);
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {sources?.purchaseOrders.map((p) => <SelectItem key={p.id} value={p.id}>{p.poNumber} · {p.supplierName} · {money(p.totalAmount)}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{kind === "advance" ? t("orders.source_advance_hint") : t("orders.source_other_hint")}</p>
            </div>
          )}
          {kind === "bill" && effPoId && poSource && (
            <p className="text-xs text-muted-foreground">{t("orders.linked_po")} <span className="font-mono">{poSource.poNumber}</span></p>
          )}
          {effPoId && poSummary && <PoCard po={poSummary} />}
          {poOver && !poSummary?.over && <PoOverAlert po={{ poNumber: poSource?.poNumber ?? poSummary?.poNumber ?? "", value: poValue }} projected={projectedCommitted} />}
          {isSourced(kind) && (
            <div className="space-y-1.5">
              <Label>{t("common.source")}</Label>
              <Select value={sourceId} onValueChange={setSourceId} disabled={!!draftProject}>
                <SelectTrigger><SelectValue placeholder={list.length ? t("common.select") : t("common.no_items")} /></SelectTrigger>
                <SelectContent>{list.map((r: any) => <SelectItem key={r.id} value={r.id}>{optionLabel(r)}</SelectItem>)}</SelectContent>
              </Select>
              {kind === "bill" && <p className="text-xs text-muted-foreground">{t("orders.bills_hint")}</p>}
              {kind === "subcontractor" && <p className="text-xs text-muted-foreground">{t("orders.certs_hint")}</p>}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("common.payee")}</Label>
              <Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.amount")}</Label>
              <Input type="number" min="0" step="0.01" value={amount} disabled={kind === "subcontractor"} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.description")}</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
    </PaymentDialog>
  );
}

// After payment, accounting can ask for the original invoice behind it. This is the icon for that:
// it creates a bill request (under أصول الفواتير) linked to this order, then shows that request's state.
function OriginalsControl({ ctx, order, data, compact, onOpen }: { ctx: PaymentsContext; order: any; data: PaymentsOverview; compact?: boolean; onOpen: (billRequestId: string) => void }) {
  const { t } = useTranslation("payments");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const request = data.billRequests.find((b) => b.paymentOrderId === order.id && b.status !== "cancelled");

  const ask = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/payments/orders/${order.id}/request-originals`, {})).json(),
    onSuccess: (created: any) => {
      invalidatePayments(queryClient);
      toast({ title: t("toasts.original_requested", { requestNo: created.requestNo }), description: t("toasts.original_requested_desc") });
    },
    onError: (e) => toast({ title: t("errors.request_original_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  // Only a paid order that was not raised from a bill request (those collected the originals before paying)
  if (order.status !== "paid" || order.billRequestId) return null;

  if (request) {
    const label = enumText("bill_request", request.status);
    return compact ? (
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-emerald-700" title={t("orders.original_label", { requestNo: request.requestNo, label })} onClick={(e) => { e.stopPropagation(); onOpen(request.id); }}>
        <FileCheck className="w-4 h-4" />
      </Button>
    ) : (
      <Button type="button" variant="outline" onClick={() => onOpen(request.id)}>
        <FileCheck className="w-4 h-4 me-1" /> {t("orders.original_label", { requestNo: request.requestNo, label })}
      </Button>
    );
  }
  if (!ctx.perms.isAccounting) return null;
  return compact ? (
    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title={t("orders.request_original")} disabled={ask.isPending} onClick={(e) => { e.stopPropagation(); ask.mutate(); }}>
      <FileSearch className="w-4 h-4" />
    </Button>
  ) : (
    <Button type="button" variant="outline" disabled={ask.isPending} onClick={() => ask.mutate()}>
      <FileSearch className="w-4 h-4 me-1" /> {t("orders.request_original")}
    </Button>
  );
}

type Panel = null | "reject" | "pay" | "decline";

function OrderDialog({ ctx, row, data, onClose, onOpenBillRequest }: { ctx: PaymentsContext; row: any; data: PaymentsOverview; onClose: () => void; onOpenBillRequest: (id: string) => void }) {
  const { t } = useTranslation("payments");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<Panel>(null);
  const poForOrder = data.purchaseOrders.find((p) => p.id === row.purchaseOrderId) ?? null;
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<string>("bank_transfer");
  const [reference, setReference] = useState("");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));

  const act = useMutation({
    mutationFn: async (v: Record<string, unknown>) => apiRequest("POST", `/api/payments/orders/${row.id}/transition`, v),
    onSuccess: (_d, v) => {
      invalidatePayments(queryClient);
      const msg: Record<string, string> = { submit: t("orders.toast_submitted"), approve: t("orders.toast_approved"), reject: t("orders.toast_rejected"), pay: t("orders.toast_paid"), cancel: t("orders.toast_cancelled"), approve_request: t("orders.toast_request_approved"), decline_request: t("orders.toast_request_declined"), accept_request: t("orders.toast_request_accepted"), withdraw_request: t("orders.toast_request_withdrawn") };
      toast({ title: msg[String(v.action)] });
      setPanel(null);
      setNote("");
    },
    onError: (e) => toast({ title: t("errors.action_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  const { isAccounting, canApprove } = ctx.perms;
  const ownOrder = row.createdBy === user?.id && user?.role !== "super_admin";
  const editable = ["draft", "rejected", "pending_approval", "approved"].includes(row.status);

  // Reject, decline and pay open above the actions, so the form is in view however far the body is scrolled
  const panelForm =
    panel === "reject" || panel === "decline" ? (
      <Section title={panel === "reject" ? t("orders.reject_panel_title") : t("orders.decline_panel_title")} icon={XCircle} tone="danger">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setPanel(null)}>{t("common.back_btn")}</Button>
          <Button size="sm" variant="destructive" disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ action: panel === "reject" ? "reject" : "decline_request", note })}>
            {panel === "reject" ? t("orders.reject_btn") : t("orders.decline_btn")}
          </Button>
        </div>
      </Section>
    ) : panel === "pay" ? (
      <Section title={t("orders.payment_panel")} icon={Banknote}>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>{t("orders.payment_method")}</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{enumText("payment_method", m)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("orders.method_ref_label")}</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("orders.payment_date")}</Label>
            <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setPanel(null)}>{t("common.back_btn")}</Button>
          <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ action: "pay", paymentMethod: method, paymentReference: reference || null, paidDate })}>
            {t("orders.confirm_payment")}
          </Button>
        </div>
      </Section>
    ) : null;

  return (
    <PaymentDialog
      onClose={onClose}
      icon={Banknote}
      kind={t("orders.kind")}
      title={<span className="font-mono">{row.orderNo}</span>}
      badge={<StatusBadge status={row.status} group="payment_order" />}
      description={row.projectName}
      amount={money(row.amount)}
      panel={panelForm}
      footer={
        <>
          {/* The step this order is waiting for comes first */}
          {isAccounting && ["draft", "rejected"].includes(row.status) && (
            <Button disabled={act.isPending} onClick={() => act.mutate({ action: "submit" })}>
              <Send className="w-4 h-4 me-1" /> {t("orders.send_for_approval")}
            </Button>
          )}
          {/* A transfer request: the project manager first, then accounting */}
          {row.status === "requested" && canApprove && (
            <Button disabled={act.isPending || ownOrder} title={ownOrder ? t("orders.cannot_approve_own_request") : undefined} onClick={() => act.mutate({ action: "approve_request" })}>
              <CheckCircle2 className="w-4 h-4 me-1" /> {t("orders.pm_approve")}
            </Button>
          )}
          {row.status === "request_approved" && isAccounting && (
            <Button disabled={act.isPending} onClick={() => act.mutate({ action: "accept_request" })}>
              <CheckCircle2 className="w-4 h-4 me-1" /> {t("orders.accept_as_order")}
            </Button>
          )}
          {canApprove && row.status === "pending_approval" && (
            <Button disabled={act.isPending || ownOrder} title={ownOrder ? t("orders.cannot_approve_own") : undefined} onClick={() => act.mutate({ action: "approve" })}>
              <CheckCircle2 className="w-4 h-4 me-1" /> {t("orders.approve_order")}
            </Button>
          )}
          {isAccounting && row.status === "approved" && (
            <Button disabled={act.isPending} onClick={() => setPanel("pay")}>
              <Banknote className="w-4 h-4 me-1" /> {t("orders.record_payment")}
            </Button>
          )}
          {canApprove && row.status === "pending_approval" && (
            <Button variant="outline" disabled={act.isPending} onClick={() => setPanel("reject")}>
              <XCircle className="w-4 h-4 me-1" /> {t("common.reject")}
            </Button>
          )}
          {((row.status === "requested" && canApprove) || (row.status === "request_approved" && isAccounting)) && (
            <Button variant="outline" disabled={act.isPending} onClick={() => setPanel("decline")}>
              <XCircle className="w-4 h-4 me-1" /> {t("orders.decline_btn")}
            </Button>
          )}
          <OriginalsControl ctx={ctx} order={row} data={data} onOpen={onOpenBillRequest} />
          <Button variant="outline" onClick={() => printVoucher(row, data, sourceLabel(row, data, t))}>
            <Printer className="w-4 h-4 me-1" /> {t("common.print")}
          </Button>
          {/* Only whoever made the request may withdraw it */}
          {["requested", "request_approved"].includes(row.status) && row.createdBy === user?.id && (
            <Button variant="ghost" className="text-destructive" disabled={act.isPending} onClick={() => act.mutate({ action: "withdraw_request" })}>
              <Ban className="w-4 h-4 me-1" /> {t("common.withdraw_request")}
            </Button>
          )}
          {isAccounting && ["draft", "pending_approval", "approved", "rejected"].includes(row.status) && (
            <Button variant="ghost" className="text-destructive" disabled={act.isPending} onClick={() => act.mutate({ action: "cancel" })}>
              <Ban className="w-4 h-4 me-1" /> {t("common.cancel")}
            </Button>
          )}
        </>
      }
    >
      <Section title={t("orders.details_title")}>
        <TileRow>
          <Tile label={t("common.payee")}>{row.payeeName}</Tile>
          <Tile label={t("common.source")}>{sourceLabel(row, data, t)}</Tile>
        </TileRow>
        {row.reason && (
          <TileRow>
            <Tile label={t("common.description")}>{row.reason}</Tile>
          </TileRow>
        )}
        {row.billRequestId && (() => {
          const invoices = data.billRequests.find((b) => b.id === row.billRequestId)?.invoices ?? [];
          return invoices.length > 0 ? (
            <div className="rounded-md border border-muted/50 overflow-hidden shadow-xl bg-background">
              <div className="flex gap-3 bg-muted/50 px-4 py-2.5 text-[11px] font-bold text-muted-foreground">
                <span>{t("orders.paid_invoices")}</span><span className="ms-auto">{t("common.amount")}</span>
              </div>
              <ul className="divide-y divide-muted/40">
                {invoices.map((i: any) => (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-primary/5">
                    <span className="font-mono font-bold">{i.invoiceNo}</span>
                    <span className="text-muted-foreground">{fmtDate(i.invoiceDate)}</span>
                    <span className="ms-auto font-mono font-black text-primary tabular-nums">{money(i.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null;
        })()}
      </Section>

      {poForOrder && <PoCard po={poForOrder} />}

      <Section title={t("orders.approval_title")}>
        <TileRow>
          <Tile label={t("orders.created_by")}>{row.createdByName ?? "—"}</Tile>
          <Tile label={t("orders.approved_by")}>{row.approvedByName ?? "—"}</Tile>
          <Tile label={t("orders.approval_date")}>{fmtDate(row.approvedAt)}</Tile>
        </TileRow>
        {row.status === "paid" && (
          <TileRow>
            <Tile label={t("orders.payment_method")}>{enumText("payment_method", row.paymentMethod)}</Tile>
            <Tile label={t("common.reference")}>{row.paymentReference ?? "—"}</Tile>
            <Tile label={t("orders.payment_date")}>{fmtDate(row.paidDate)}</Tile>
          </TileRow>
        )}
        {row.rejectReason && (
          <TileRow className="border-destructive/30 bg-destructive/5">
            <Tile label={t("orders.reject_panel_title")}><span className="text-destructive">{row.rejectReason}</span></Tile>
          </TileRow>
        )}
      </Section>

      <LatestActivity entityType="payment_order" entityId={row.id} group="payment_order" />

      <div className="rounded-md border border-dashed border-primary/20 bg-primary/5 p-3">
        <AttachmentsPanel
          entityType="payment_order"
          entityId={row.id}
          projectId={row.projectId}
          files={row.attachments}
          editable={isAccounting && editable}
          hint={t("orders.attachment_hint")}
          canRemove={() => true}
        />
      </div>
    </PaymentDialog>
  );
}
