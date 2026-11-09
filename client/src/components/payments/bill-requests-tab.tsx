import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Paperclip, AlertTriangle, CheckCircle2, Undo2, Send, Ban, Banknote, Receipt, Trash2, Split } from "lucide-react";
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
import { BILL_REQUEST_LABELS, OPEN_BILL_REQUEST, OPEN_PAYMENT_ORDER, PAYMENT_ORDER_LABELS, type PoSummary, BILL_REQUEST_STATUSES } from "@shared/payments";
import { cn } from "@/lib/utils";
import { CHARGEBACK_LABELS } from "@shared/payments";
import { ChargeInvoiceDialog, chargedOf } from "./chargebacks";
import {
  LatestActivity,
  PaymentDialog,
  Section,
  Tile,
  TileRow,
  AttachmentsPanel,
  Field,
  PoCard,
  StatusBadge,
  errorMessage,
  fmtDate,
  getJson,
  invalidatePayments,
  money,
  paymentsQuery,
  useFocusFromUrl,
  type PaymentsContext,
} from "./payments-common";
import { enumText, enumOptions } from "@/lib/enums";

interface Props {
  ctx: PaymentsContext;
  projectId: string; // "all" or a project id
  rows: any[];
  orders: any[];
  purchaseOrders: PoSummary[];
  chargebacks: any[];
  // Open this request's dialog (set when jumping here from a payment order)
  focusId?: string | null;
  onFocusHandled?: () => void;
  onCreateOrder: (billRequestId: string) => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const num = (v: unknown) => Number(v ?? 0) || 0;

export function BillRequestsTab({ ctx, projectId, rows, orders, purchaseOrders, chargebacks, focusId, onFocusHandled, onCreateOrder }: Props) {
  const { t } = useTranslation("payments");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  useFocusFromUrl((id) => rows.some((r) => r.id === id), setOpenId);

  useEffect(() => {
    if (!focusId) return;
    setOpenId(focusId);
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

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
          <Input className="ps-9" placeholder={t("bill_requests.search_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all_statuses")}</SelectItem>
            {enumOptions("bill_request", BILL_REQUEST_STATUSES).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {ctx.perms.isAccounting && (
          <Button className="ms-auto" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 me-1" /> {t("bill_requests.create_btn")}
          </Button>
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
                <TableHead>{t("bill_requests.requested")}</TableHead>
                <TableHead className="text-end">{t("common.amount")}</TableHead>
                <TableHead>{t("common.due_date")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">{t("bill_requests.no_items")}</TableCell></TableRow>
              )}
              {filtered.map((r) => {
                const overdue = (OPEN_BILL_REQUEST as readonly string[]).includes(r.status) && r.dueDate && r.dueDate < todayIso();
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <TableCell className="font-mono text-xs">{r.requestNo}</TableCell>
                    {projectId === "all" && <TableCell>{r.projectName}</TableCell>}
                    <TableCell className="font-semibold">
                      {r.payeeName}
                      {r.purchaseOrderId && (() => {
                        const p = purchaseOrders.find((x) => x.id === r.purchaseOrderId);
                        return p ? <div className={cn("text-xs font-normal flex items-center gap-1", p.over ? "text-destructive" : "text-muted-foreground")}>{p.over && <AlertTriangle className="w-3 h-3" />}{p.poNumber}</div> : null;
                      })()}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate">{r.description}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(r.amount)}</TableCell>
                    <TableCell className={overdue ? "text-destructive font-semibold" : ""}>
                      {overdue && <AlertTriangle className="w-3.5 h-3.5 inline me-1" />}
                      {fmtDate(r.dueDate)}
                    </TableCell>
                    <TableCell><StatusBadge status={r.status} group="bill_request" /></TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      <Paperclip className="w-3.5 h-3.5 inline me-1" />{r.attachments.length}
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
          po={purchaseOrders.find((p) => p.id === selected.purchaseOrderId) ?? null}
          chargebacks={chargebacks.filter((c) => c.billRequestId === selected.id)}
          onClose={() => setOpenId(null)}
          onCreateOrder={(id) => { setOpenId(null); onCreateOrder(id); }}
        />
      )}
    </div>
  );
}

// Values a page can hand to the form, and where the request was started from
export interface BillRequestPrefill {
  supplierId?: string;
  purchaseOrderId?: string;
  payeeName?: string;
  amount?: number | string;
  description?: string;
  sourceType?: string;
  sourceId?: string;
}

export function CreateBillRequestDialog({ ctx, defaultProjectId, open, onClose, prefill }: { ctx: PaymentsContext; defaultProjectId: string; open: boolean; onClose: () => void; prefill?: BillRequestPrefill }) {
  const { t } = useTranslation("payments");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState(defaultProjectId === "all" ? "" : defaultProjectId);
  const [form, setForm] = useState({
    payeeName: prefill?.payeeName ?? "",
    description: prefill?.description ?? "",
    amount: prefill?.amount !== undefined ? String(prefill.amount) : "",
    dueDate: "",
    supplierId: prefill?.supplierId ?? "",
    purchaseOrderId: prefill?.purchaseOrderId ?? "",
    certificateId: "",
    notes: "",
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: sources } = useQuery<{ purchaseOrders: any[]; certificates: any[]; suppliers: { id: string; name: string; taxNumber: string | null }[] }>({
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
        supplierId: form.supplierId || null,
        sourceType: prefill?.sourceType ?? null,
        sourceId: prefill?.sourceId ?? null,
        purchaseOrderId: form.purchaseOrderId || null,
        certificateId: form.certificateId || null,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      invalidatePayments(queryClient);
      toast({ title: t("toasts.bill_request_sent") });
      setForm({ payeeName: "", description: "", amount: "", dueDate: "", supplierId: "", purchaseOrderId: "", certificateId: "", notes: "" });
      onClose();
    },
    onError: (e) => toast({ title: t("errors.create_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  const pickPo = (id: string) => {
    const po = sources?.purchaseOrders.find((p) => p.id === id);
    setForm((f) => ({
      ...f,
      purchaseOrderId: id === "none" ? "" : id,
      supplierId: po && !f.supplierId ? po.supplierId ?? "" : f.supplierId,
      payeeName: po && !f.payeeName ? po.supplierName ?? "" : f.payeeName,
      amount: po && !f.amount ? String(po.totalAmount ?? "") : f.amount,
    }));
  };

  return (
    <PaymentDialog
      open={open}
      onClose={onClose}
      size="md"
      icon={Receipt}
      kind={t("bill_requests.kind")}
      title={t("bill_requests.new_title")}
      description={t("bill_requests.new_description")}
      footer={
        <>
          <Button disabled={create.isPending || !projectId || !form.payeeName.trim() || !form.description.trim()} onClick={() => create.mutate()}>
            <Send className="w-4 h-4 me-1" /> {t("common.send_request")}
          </Button>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        </>
      }
    >
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>{t("common.project")}</Label>
            <Select value={projectId} onValueChange={(v) => { setProjectId(v); setForm((f) => ({ ...f, supplierId: "", purchaseOrderId: "", certificateId: "" })); }}>
              <SelectTrigger><SelectValue placeholder={t("common.select_project")} /></SelectTrigger>
              <SelectContent>{ctx.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {projectId && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("bill_requests.po_optional")}</Label>
                <Select value={form.purchaseOrderId || "none"} onValueChange={pickPo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {sources?.purchaseOrders.map((p) => <SelectItem key={p.id} value={p.id}>{p.poNumber} · {p.supplierName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("bill_requests.cert_optional")}</Label>
                <Select value={form.certificateId || "none"} onValueChange={(v) => set("certificateId")(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {sources?.certificates.map((c) => <SelectItem key={c.id} value={c.id}>{t("bill_requests.cert_item", { certNo: c.certNo })}{c.title ? ` · ${c.title}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {projectId && (sources?.suppliers.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <Label>{t("bill_requests.supplier_from_register")}</Label>
              <Select
                value={form.supplierId || "none"}
                onValueChange={(v) => {
                  const s = sources?.suppliers.find((x) => x.id === v);
                  setForm((f) => ({ ...f, supplierId: v === "none" ? "" : v, payeeName: s ? s.name : f.payeeName }));
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
          <div className="space-y-1.5">
            <Label>{t("bill_requests.payee_label")}</Label>
            <Input value={form.payeeName} onChange={(e) => set("payeeName")(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("bill_requests.invoices_required")}</Label>
            <Textarea rows={3} placeholder={t("bill_requests.invoices_placeholder")} value={form.description} onChange={(e) => set("description")(e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("bill_requests.expected_amount")}</Label>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("bill_requests.response_by_label")}</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate")(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes")(e.target.value)} />
          </div>
        </div>
    </PaymentDialog>
  );
}

// The invoices this request covers. A payment order raised from the request pays them.
function InvoicesPanel({ ctx, row, editable, canRemove, chargebacks }: { ctx: PaymentsContext; row: any; editable: boolean; canRemove: (i: any) => boolean; chargebacks: any[] }) {
  const { t } = useTranslation("payments");
  const { toast } = useToast();
  const [charging, setCharging] = useState<any | null>(null);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ invoiceNo: "", invoiceDate: "", amount: "" });

  const add = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/payments/bill-requests/${row.id}/invoices`, {
      invoiceNo: form.invoiceNo,
      invoiceDate: form.invoiceDate || null,
      amount: form.amount,
    }),
    onSuccess: () => { invalidatePayments(queryClient); setForm({ invoiceNo: "", invoiceDate: "", amount: "" }); },
    onError: (e) => toast({ title: t("errors.add_invoice_failed"), description: errorMessage(e), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/payments/invoices/${id}`),
    onSuccess: () => invalidatePayments(queryClient),
    onError: (e) => toast({ title: t("errors.remove_invoice_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm font-bold">
        <span className="flex items-center gap-2"><Receipt className="w-4 h-4" /> {t("invoices.title")} <span className="text-muted-foreground font-normal">({row.invoices.length})</span></span>
        {row.invoices.length > 0 && <span className="tabular-nums">{t("invoices.total")} {money(row.invoiceTotal)}</span>}
      </div>
      {row.invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-dashed rounded-xl p-4 text-center">{t("invoices.none")}</p>
      ) : (
        <ul className="space-y-1.5">
          {row.invoices.map((i: any) => (
            <li key={i.id} className="flex items-center gap-3 rounded-xl border px-3 py-2 text-sm">
              <span className="font-mono">{i.invoiceNo}</span>
              <span className="text-muted-foreground">{fmtDate(i.invoiceDate)}</span>
              {chargedOf(chargebacks, i.id) > 0 && (
                <span className="text-xs rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 px-2 py-0.5 whitespace-nowrap" title={chargebacks.filter((c) => c.invoiceId === i.id && c.status !== "cancelled").map((c) => `${c.chargeNo} → ${c.subcontractorName} (${enumText("chargeback", c.status)})`).join("\n")}>
                  {t("invoices.charged", { charged: money(chargedOf(chargebacks, i.id)), total: money(i.amount) })}
                </span>
              )}
              <span className="ms-auto tabular-nums font-semibold">{money(i.amount)}</span>
              {row.status !== "cancelled" && chargedOf(chargebacks, i.id) < num(i.amount) - 0.005 && (
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title={t("invoices.charge_on_sub")} onClick={() => setCharging(i)}>
                  <Split className="w-4 h-4" />
                </Button>
              )}
              {editable && canRemove(i) && (
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(i.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="grid grid-cols-[1.2fr_1fr_1fr_auto] gap-2 items-end">
          <div className="space-y-1"><Label className="text-xs">{t("invoices.invoice_no")}</Label><Input value={form.invoiceNo} onChange={(e) => setForm((f) => ({ ...f, invoiceNo: e.target.value }))} /></div>
          <div className="space-y-1"><Label className="text-xs">{t("invoices.date")}</Label><Input type="date" value={form.invoiceDate} onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))} /></div>
          <div className="space-y-1"><Label className="text-xs">{t("invoices.amount_with_tax")}</Label><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></div>
          <Button type="button" size="sm" disabled={add.isPending || !form.invoiceNo.trim() || !(Number(form.amount) > 0)} onClick={() => add.mutate()}><Plus className="w-4 h-4" /></Button>
        </div>
      )}
      {charging && <ChargeInvoiceDialog ctx={ctx} bill={row} invoice={charging} chargebacks={chargebacks} onClose={() => setCharging(null)} />}
    </div>
  );
}

function BillRequestDialog({ ctx, row, orders, po, chargebacks, onClose, onCreateOrder }: { ctx: PaymentsContext; row: any; orders: any[]; po: PoSummary | null; chargebacks: any[]; onClose: () => void; onCreateOrder: (id: string) => void }) {
  const { t } = useTranslation("payments");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");

  const act = useMutation({
    mutationFn: async (v: { action: string; note?: string }) => apiRequest("POST", `/api/payments/bill-requests/${row.id}/transition`, v),
    onSuccess: (_d, v) => {
      invalidatePayments(queryClient);
      const msg: Record<string, string> = { submit: t("toasts.originals_submitted"), receive: t("toasts.originals_received"), return: t("toasts.returned"), cancel: t("toasts.request_cancelled") };
      toast({ title: msg[v.action] });
      setReturning(false);
      setNote("");
    },
    onError: (e) => toast({ title: t("errors.action_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  const { isAccounting } = ctx.perms;
  const forOrder = row.paymentOrderId ? orders.find((o) => o.id === row.paymentOrderId) ?? null : null;
  const linkedOrders = orders.filter((o) => o.billRequestId === row.id && o.status !== "cancelled");
  const hasLiveOrder = orders.some((o) => o.billRequestId === row.id && ([...OPEN_PAYMENT_ORDER, "paid"] as string[]).includes(o.status));
  const filesEditable = ["requested", "returned", "submitted"].includes(row.status);

  return (
    <PaymentDialog
      onClose={onClose}
      icon={Receipt}
      kind={t("bill_requests.kind")}
      title={<span className="font-mono">{row.requestNo}</span>}
      badge={<StatusBadge status={row.status} group="bill_request" />}
      description={row.projectName}
      amount={money(row.amount)}
      amountLabel={t("bill_requests.expected_amount")}
      panel={returning && (
        <Section title={t("bill_requests.return_panel_title")} icon={Undo2} tone="danger">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setReturning(false)}>{t("common.back_btn")}</Button>
            <Button size="sm" disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ action: "return", note })}>{t("bill_requests.return_btn")}</Button>
          </div>
        </Section>
      )}
      footer={
        <>
          {["requested", "returned"].includes(row.status) && (
            <Button disabled={act.isPending || row.attachments.length === 0 || row.invoices.length === 0} onClick={() => act.mutate({ action: "submit" })}>
              <Send className="w-4 h-4 me-1" /> {t("bill_requests.send_to_accounting")}
            </Button>
          )}
          {isAccounting && row.status === "submitted" && (
            <>
              <Button disabled={act.isPending} onClick={() => act.mutate({ action: "receive" })}>
                <CheckCircle2 className="w-4 h-4 me-1" /> {t("bill_requests.confirm_receipt")}
              </Button>
              <Button variant="outline" disabled={act.isPending} onClick={() => setReturning(true)}>
                <Undo2 className="w-4 h-4 me-1" /> {t("bill_requests.return_for_correction")}
              </Button>
            </>
          )}
          {isAccounting && row.status === "received" && !hasLiveOrder && !row.paymentOrderId && (
            <Button onClick={() => onCreateOrder(row.id)}>
              <Banknote className="w-4 h-4 me-1" /> {t("bill_requests.issue_order")}
            </Button>
          )}
          {isAccounting && ["requested", "returned", "submitted"].includes(row.status) && (
            <Button variant="ghost" className="text-destructive" disabled={act.isPending} onClick={() => act.mutate({ action: "cancel" })}>
              <Ban className="w-4 h-4 me-1" /> {t("bill_requests.cancel_request")}
            </Button>
          )}
        </>
      }
    >
      <Section title={t("bill_requests.details_title")}>
        <TileRow>
          <Tile label={t("common.payee")}>{row.payeeName}</Tile>
          <Tile label={t("bill_requests.response_by")}>{fmtDate(row.dueDate)}</Tile>
        </TileRow>
        <TileRow>
          <Tile label={t("bill_requests.requested")}>{row.description}</Tile>
        </TileRow>
        {row.notes && (
          <TileRow>
            <Tile label={t("common.notes")}>{row.notes}</Tile>
          </TileRow>
        )}
        <TileRow>
          <Tile label={t("bill_requests.requested_by")}>{row.requestedByName ?? "—"}</Tile>
          <Tile label={t("bill_requests.request_date")}>{fmtDate(row.createdAt)}</Tile>
          {row.receivedAt && <Tile label={t("bill_requests.receipt_date")}>{fmtDate(row.receivedAt)}</Tile>}
        </TileRow>
        {forOrder && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm flex flex-wrap items-center gap-2">
            <span>{t("bill_requests.after_payment")} <span className="font-mono font-semibold">{forOrder.orderNo}</span></span>
            <StatusBadge status={forOrder.status} group="payment_order" />
            <span className="ms-auto tabular-nums font-bold">{money(forOrder.amount)}</span>
            <span className="w-full text-xs text-muted-foreground">{t("bill_requests.after_payment_desc")}</span>
          </div>
        )}
      </Section>

      {po && <PoCard po={po} />}

      <InvoicesPanel
        ctx={ctx}
        chargebacks={chargebacks}
        row={row}
        editable={["requested", "returned"].includes(row.status) || (row.status === "submitted" && isAccounting)}
        canRemove={(i) => i.createdBy === user?.id || isAccounting}
      />

      {linkedOrders.length > 0 && (
        <Section title={t("bill_requests.linked_orders")}>
          <div className="rounded-md border border-muted/50 bg-muted/30 divide-y divide-muted/60">
            {linkedOrders.map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="font-mono font-bold">{o.orderNo}</span>
                <StatusBadge status={o.status} group="payment_order" />
                <span className="ms-auto font-mono font-black text-primary tabular-nums">{money(o.amount)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <LatestActivity entityType="bill_request" entityId={row.id} group="bill_request" />

      <div className="rounded-md border border-dashed border-primary/20 bg-primary/5 p-3">
        <AttachmentsPanel
          entityType="bill_request"
          entityId={row.id}
          projectId={row.projectId}
          files={row.attachments}
          editable={filesEditable}
          hint={["requested", "returned"].includes(row.status) ? t("bill_requests.hint_submit") : undefined}
          canRemove={(f) => f.uploadedBy === user?.id || isAccounting}
        />
      </div>
    </PaymentDialog>
  );
}
