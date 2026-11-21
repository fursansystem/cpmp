// تحميل فاتورة على مقاول باطن: part or all of a supplier invoice charged to a subcontractor.
// The invoice and its bill request keep their own workflow; the charge ends up as a deduction on a
// subcontractor certificate (or, when there is none, as a deduction record).
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, ExternalLink, FileText, Paperclip, Repeat, Split, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { CHARGEBACK_LABELS, FINE_LABELS } from "@shared/payments";
import { SubcontractorSelect } from "./subcontractor-select";
import { LatestActivity, PaymentDialog, Section, Tile, TileRow, StatusBadge, useFocusFromUrl, errorMessage, fmtDate, invalidatePayments, money, type PaymentsContext } from "./payments-common";
import { BillRequestDialog } from "./bill-requests-tab";

const num = (v: unknown) => Number(v ?? 0) || 0;

// Amount of an invoice already charged, ignoring withdrawn/rejected charges
export const chargedOf = (chargebacks: any[], invoiceId: string) =>
  chargebacks.filter((c) => c.invoiceId === invoiceId && c.status !== "cancelled").reduce((s, c) => s + num(c.amount), 0);

export function ChargeInvoiceDialog({ ctx, bill, invoice, chargebacks, onClose }: {
  ctx: PaymentsContext; bill: any; invoice: any; chargebacks: any[]; onClose: () => void;
}) {
  const { t } = useTranslation("payments");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const remaining = Math.max(0, num(invoice.amount) - chargedOf(chargebacks, invoice.id));
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState("");
  const [subId, setSubId] = useState("");
  const [reason, setReason] = useState("");
  const value = mode === "full" ? remaining : num(amount);

  const create = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/payments/chargebacks", { invoiceId: invoice.id, subcontractorId: subId, amount: value, reason }),
    onSuccess: async (res) => {
      const created = await res.json().catch(() => null);
      invalidatePayments(queryClient);
      toast({ title: created?.status === "approved" ? t("toasts.charge_approved_auto") : t("toasts.charge_submitted") });
      onClose();
    },
    onError: (e) => toast({ title: t("errors.charge_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <PaymentDialog
      onClose={onClose}
      size="md"
      icon={Split}
      kind={t("chargebacks.kind")}
      title={t("chargebacks.charge_on_sub")}
      description={<>{t("chargebacks.invoice_desc", { invoiceNo: invoice.invoiceNo, requestNo: bill.requestNo, amount: money(invoice.amount) })}</>}
      amount={value > 0 ? money(value) : undefined}
      amountLabel={t("chargebacks.charged_amount")}
      footer={
        <>
          <Button disabled={create.isPending || remaining <= 0 || !subId || !reason.trim() || !(value > 0) || value > remaining + 0.005} onClick={() => create.mutate()}>
            <CheckCircle2 className="w-4 h-4 me-1" /> {t("chargebacks.register_btn")}
          </Button>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        </>
      }
    >
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("chargebacks.cycle_note")}</p>
          <div className="space-y-1.5">
            <Label>{t("chargebacks.subcontractor")}</Label>
            <SubcontractorSelect projectId={bill.projectId} value={subId} onChange={setSubId} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("chargebacks.amount_charged")}</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={mode === "full" ? "default" : "outline"} onClick={() => setMode("full")}>{t("chargebacks.full_remaining", { amount: money(remaining) })}</Button>
              <Button type="button" size="sm" variant={mode === "partial" ? "default" : "outline"} onClick={() => setMode("partial")}>{t("chargebacks.partial")}</Button>
            </div>
            {mode === "partial" && (
              <Input type="number" min="0" step="0.01" max={remaining} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("chargebacks.up_to", { amount: money(remaining) })} />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>{t("chargebacks.charge_reason")}</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("chargebacks.charge_reason_placeholder")} />
          </div>
          <p className="text-xs text-muted-foreground">
            {ctx.perms.canApprove ? t("chargebacks.auto_approve_note") : t("chargebacks.manual_approve_note")}
          </p>
        </div>
    </PaymentDialog>
  );
}

// Everything charged so far, with the decisions that move it along
export function ChargebacksPanel({
  ctx,
  projectId,
  rows,
  fines = [],
  billRequests = [],
  orders = [],
  purchaseOrders = [],
}: {
  ctx: PaymentsContext;
  projectId: string;
  rows: any[];
  fines?: any[];
  billRequests?: any[];
  orders?: any[];
  purchaseOrders?: any[];
}) {
  const { t } = useTranslation("payments");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  useFocusFromUrl((id) => rows.some((r) => r.id === id), setOpenId);
  const [rejecting, setRejecting] = useState<any | null>(null);
  const [note, setNote] = useState("");
  const [viewingBillId, setViewingBillId] = useState<string | null>(null);

  const targetBill = useMemo(() => {
    if (!viewingBillId) return null;
    return billRequests.find((b: any) => b.id === viewingBillId) ?? null;
  }, [viewingBillId, billRequests]);

  const { data: billFallback } = useQuery({
    queryKey: ["payments", "bill-fallback", viewingBillId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/payments/overview?projectId=${projectId}`);
      const data = await res.json();
      return (data.billRequests ?? []).find((b: any) => b.id === viewingBillId) ?? null;
    },
    enabled: !!viewingBillId && !targetBill,
  });

  const activeBill = targetBill ?? billFallback ?? null;

  const act = useMutation({
    mutationFn: async (v: { id: string; action: string; note?: string }) => apiRequest("POST", `/api/payments/chargebacks/${v.id}/transition`, { action: v.action, note: v.note }),
    onSuccess: (_d, v) => {
      invalidatePayments(queryClient);
      const msg: Record<string, string> = { approve: t("toasts.charge_approved"), reject: t("toasts.charge_rejected"), withdraw: t("toasts.charge_withdrawn"), convert: t("toasts.charge_converted") };
      toast({ title: msg[v.action] });
      setRejecting(null);
      setNote("");
    },
    onError: (e) => toast({ title: t("errors.action_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  const sorted = useMemo(() => rows.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), [rows]);
  const open = sorted.filter((c) => c.status === "proposed" || c.status === "approved");
  const visible = sorted;
  const current = openId ? rows.find((r) => r.id === openId) ?? null : null;

  const currentBill = useMemo(() => {
    if (!current?.billRequestId) return null;
    return billRequests.find((b: any) => b.id === current.billRequestId) ?? null;
  }, [current?.billRequestId, billRequests]);

  if (rows.length === 0) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
          <Split className="w-8 h-8 opacity-40 text-muted-foreground" />
          <p className="font-semibold text-sm">{t("chargebacks.panel_title")}</p>
          <p className="text-xs">{t("chargebacks.no_pending")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{t("chargebacks.panel_title")}</span>
            <Badge variant="secondary" className="text-xs font-mono">{rows.length}</Badge>
            {open.length > 0 ? (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                {t("chargebacks.pending_count", { count: open.length })}
              </span>
            ) : (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                (جميع الخصومات مطبقة أو منتهية)
              </span>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.number")}</TableHead>
                {projectId === "all" && <TableHead>{t("common.project")}</TableHead>}
                <TableHead>{t("chargebacks.invoice")}</TableHead>
                <TableHead>{t("chargebacks.subcontractor")}</TableHead>
                <TableHead className="text-end">{t("common.amount")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">{t("chargebacks.no_pending")}</TableCell></TableRow>}
              {visible.map((c) => {
                const mine = c.createdBy === user?.id;
                const own = mine && user?.role !== "super_admin";
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)}>
                    <TableCell className="font-mono text-xs">{c.chargeNo}</TableCell>
                    {projectId === "all" && <TableCell>{c.projectName}</TableCell>}
                    <TableCell className="text-sm">
                      <button
                        type="button"
                        className="group/inv text-start hover:opacity-80 transition-opacity flex flex-col items-start"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (c.billRequestId) setViewingBillId(c.billRequestId);
                        }}
                        title="انقر لفتح الفاتورة ومرفقاتها"
                      >
                        <span className="font-mono font-bold text-primary group-hover/inv:underline inline-flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 opacity-80" />
                          {c.invoiceNo || "—"}
                          <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                        </span>
                        <div className="text-xs text-muted-foreground">{c.payeeName} · {c.requestNo}</div>
                      </button>
                    </TableCell>
                    <TableCell className="font-semibold">{c.subcontractorName}</TableCell>
                    <TableCell className="text-end tabular-nums font-semibold">{money(c.amount)}{!c.isFull && <div className="text-xs font-normal text-muted-foreground">{t("chargebacks.amount_from", { total: money(c.invoiceAmount) })}</div>}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        <StatusBadge status={c.status} group="chargeback" />
                        {c.status === "applied" && c.certificateNo && (
                          <span className="text-[11px] font-mono font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded px-1.5 py-0.5">
                            مستخلص: {c.certificateNo}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        {c.status === "proposed" && ctx.perms.canApprove && (
                          <>
                            <Button size="sm" disabled={act.isPending || own} title={own ? t("chargebacks.cannot_approve_own") : undefined} onClick={() => act.mutate({ id: c.id, action: "approve" })}><CheckCircle2 className="w-4 h-4 me-1" /> {t("common.approve")}</Button>
                            <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => setRejecting(c)}><XCircle className="w-4 h-4 me-1" /> {t("common.reject")}</Button>
                          </>
                        )}
                        {c.status === "approved" && (ctx.perms.isAccounting || ctx.perms.canApprove) && (
                          <Button size="sm" variant="outline" disabled={act.isPending} title={t("chargebacks.convert_hint")} onClick={() => act.mutate({ id: c.id, action: "convert" })}><Repeat className="w-4 h-4 me-1" /> {t("chargebacks.convert_btn")}</Button>
                        )}
                        {["proposed", "approved"].includes(c.status) && (mine || ctx.perms.isAccounting || ctx.perms.canApprove) && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={act.isPending} title={t("common.withdraw")} onClick={() => act.mutate({ id: c.id, action: "withdraw" })}><Ban className="w-4 h-4" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {rejecting && (
        <PaymentDialog
          onClose={() => setRejecting(null)}
          size="sm"
          icon={XCircle}
          kind={t("chargebacks.kind")}
          title={<>{t("chargebacks.reject_title")} <span className="font-mono">{rejecting.chargeNo}</span></>}
          description={rejecting.subcontractorName}
          footer={
            <>
              <Button variant="destructive" disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ id: rejecting.id, action: "reject", note })}>
                <XCircle className="w-4 h-4 me-1" /> {t("common.reject")}
              </Button>
              <Button variant="outline" onClick={() => setRejecting(null)}>{t("common.back_btn")}</Button>
            </>
          }
        >
          <Section title={t("chargebacks.reject_reason")} tone="danger">
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </Section>
        </PaymentDialog>
      )}

      {current && (
        <PaymentDialog
          onClose={() => setOpenId(null)}
          size="md"
          icon={Split}
          kind={t("chargebacks.kind")}
          title={<span className="font-mono">{current.chargeNo}</span>}
          badge={<StatusBadge status={current.status} group="chargeback" />}
          description={current.projectName}
          amount={money(current.amount)}
          amountLabel={t("chargebacks.amount_from", { total: money(current.invoiceAmount) })}
        >
          <Section title={t("chargebacks.details_title")}>
            <TileRow>
              <Tile label={t("chargebacks.subcontractor")}>{current.subcontractorName}</Tile>
              <Tile label={t("chargebacks.invoice")}>
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 font-mono text-xs font-bold text-primary hover:bg-primary/10 hover:text-primary border-primary/30 shadow-xs"
                      onClick={() => {
                        if (current.billRequestId) {
                          setViewingBillId(current.billRequestId);
                        }
                      }}
                      title="فتح تفاصيل الفاتورة والمرفقات"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>{current.invoiceNo || "فاتورة"}</span>
                      {current.requestNo && (
                        <span className="text-[11px] font-normal text-muted-foreground">({current.requestNo})</span>
                      )}
                      <ExternalLink className="w-3 h-3 ms-0.5 opacity-70" />
                    </Button>

                    {currentBill?.attachments && currentBill.attachments.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 px-2"
                        asChild
                      >
                        <a href={currentBill.attachments[0].objectPath} target="_blank" rel="noreferrer" title={currentBill.attachments[0].fileName}>
                          <Paperclip className="w-3.5 h-3.5" />
                          <span>فتح المرفق ({currentBill.attachments.length})</span>
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </Tile>
            </TileRow>
            <TileRow>
              <Tile label={t("chargebacks.reason")}>{current.reason}</Tile>
            </TileRow>
            <TileRow>
              <Tile label={t("chargebacks.proposed_by")}>{current.createdByName ?? "—"}</Tile>
              <Tile label={t("common.date")}>{fmtDate(current.createdAt)}</Tile>
            </TileRow>
            {current.certificateNo && (
              <TileRow>
                <Tile label="المستخلص المخصوم منه"><span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{current.certificateNo}</span></Tile>
              </TileRow>
            )}
            {current.fineId && (() => {
              const f = fines.find((x) => x.id === current.fineId);
              return f ? (
                <TileRow>
                  <Tile label={t("chargebacks.converted_fine")}><span className="inline-flex flex-wrap items-center gap-2">{f.title} <StatusBadge status={f.status} group="fine" /></span></Tile>
                </TileRow>
              ) : null;
            })()}
            {current.rejectReason && (
              <TileRow className="border-destructive/30 bg-destructive/5">
                <Tile label={t("chargebacks.note")}><span className="text-destructive">{current.rejectReason}</span></Tile>
              </TileRow>
            )}
          </Section>
          <LatestActivity entityType="chargeback" entityId={current.id} group="chargeback" />
        </PaymentDialog>
      )}

      {activeBill && (
        <BillRequestDialog
          ctx={ctx}
          row={activeBill}
          orders={orders}
          po={purchaseOrders.find((p: any) => p.id === activeBill.purchaseOrderId) ?? null}
          chargebacks={rows.filter((c: any) => c.billRequestId === activeBill.id)}
          onClose={() => setViewingBillId(null)}
          onCreateOrder={() => {}}
        />
      )}
    </Card>
  );
}
