// تحميل فاتورة على مقاول باطن: part or all of a supplier invoice charged to a subcontractor.
// The invoice and its bill request keep their own workflow; the charge ends up as a deduction on a
// subcontractor certificate (or, when there is none, as a deduction record).
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, Repeat, Split, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
export function ChargebacksPanel({ ctx, projectId, rows, fines = [] }: { ctx: PaymentsContext; projectId: string; rows: any[]; fines?: any[] }) {
  const { t } = useTranslation("payments");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  useFocusFromUrl((id) => rows.some((r) => r.id === id), setOpenId);
  const [rejecting, setRejecting] = useState<any | null>(null);
  const [note, setNote] = useState("");
  const [show, setShow] = useState(false);

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
  const visible = show ? sorted : open;
  if (rows.length === 0) return null;
  const current = openId ? rows.find((r) => r.id === openId) ?? null : null;

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <span className="font-bold text-sm">{t("chargebacks.panel_title")}</span>
          <span className="text-xs text-muted-foreground">{t("chargebacks.pending_count", { count: open.length })}</span>
          <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setShow((v) => !v)}>{show ? t("chargebacks.hide_closed") : t("chargebacks.show_all", { count: rows.length })}</Button>
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
                    <TableCell className="text-sm"><span className="font-mono">{c.invoiceNo}</span><div className="text-xs text-muted-foreground">{c.payeeName} · {c.requestNo}</div></TableCell>
                    <TableCell className="font-semibold">{c.subcontractorName}</TableCell>
                    <TableCell className="text-end tabular-nums font-semibold">{money(c.amount)}{!c.isFull && <div className="text-xs font-normal text-muted-foreground">{t("chargebacks.amount_from", { total: money(c.invoiceAmount) })}</div>}</TableCell>
                    <TableCell><StatusBadge status={c.status} group="chargeback" /></TableCell>
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
              <Tile label={t("chargebacks.invoice")}><span className="font-mono">{current.invoiceNo}</span> · {current.requestNo}</Tile>
            </TileRow>
            <TileRow>
              <Tile label={t("chargebacks.reason")}>{current.reason}</Tile>
            </TileRow>
            <TileRow>
              <Tile label={t("chargebacks.proposed_by")}>{current.createdByName ?? "—"}</Tile>
              <Tile label={t("common.date")}>{fmtDate(current.createdAt)}</Tile>
            </TileRow>
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
    </Card>
  );
}
