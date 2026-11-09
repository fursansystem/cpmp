import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Printer, FileSpreadsheet, FileText, Banknote, ShieldAlert, Gavel, Hourglass, HardHat, ShoppingCart, AlertTriangle, FileWarning, Clock, Receipt, Timer, Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type PaymentsReport } from "@shared/payments";
import { fmtDate, fmtDateTime, getJson, money, paymentsQuery } from "./payments-common";
import { enumText } from "@/lib/enums";
import { exportPaymentsReportExcel } from "./payments-reports-export";

const PURPOSE_KEYS: Record<string, string> = { advance: "reports.purpose_advance", other: "reports.purpose_other", subcontractor: "reports.purpose_subcontractor" };
const DECISION_KEYS: Record<string, string> = { order: "reports.decision_order", certificate: "reports.decision_certificate", waiver: "reports.decision_waiver", request: "reports.decision_request" };
const REASON_KEYS: Record<string, string> = { expired: "reports.reason_expired", expiring: "reports.reason_expiring", overdue: "reports.reason_overdue" };

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: any; label: string; value: string | number; sub?: string; tone?: "warn" | "ok" }) {
  return (
    <Card className="rounded-2xl border-border/60">
      <CardContent className="py-4 flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", tone === "warn" ? "bg-destructive/10 text-destructive" : tone === "ok" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-primary/10 text-primary")}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground font-semibold">{label}</div>
          <div className="text-xl font-bold tabular-nums">{value}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportsTab({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { t } = useTranslation("payments");
  const { data, isLoading } = useQuery<PaymentsReport>({
    queryKey: ["payments", "reports", projectId],
    queryFn: () => getJson(`/api/payments/reports${projectId === "all" ? "" : `?projectId=${projectId}`}`),
    meta: paymentsQuery,
  });

  if (isLoading || !data) {
    return <div className="space-y-4"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>;
  }

  const totals = data.totals;
  const m = data.monitoring;
  // The full list of purchase orders is in the Reports page; here only the ones that need a look
  const flaggedPos = data.purchaseOrders.filter((p) => p.over || p.goodsNotInvoiced > 0.005 || p.noActivity);
  const maxMonth = Math.max(1, ...data.monthlyPaid.map((m) => m.amount));

  const exportExcel = () => exportPaymentsReportExcel(data, t);

  return (
    <div className="space-y-5" id="payments-report">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-muted-foreground">
          {t("reports.generated_at", { project: projectName, date: fmtDateTime(data.generatedAt) })}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="w-4 h-4 me-1" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 me-1" /> {t("reports.print")}</Button>
        </div>
      </div>

      {/* Control cards: what needs a manager's attention first */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={FileWarning}
          label={t("reports.kpi_payments_no_originals")}
          value={money(m.paymentsWithoutOriginals.notRequested.amount + m.paymentsWithoutOriginals.requestedPending.amount)}
          sub={t("reports.kpi_payments_no_originals_sub", {
            notRequested: m.paymentsWithoutOriginals.notRequested.count,
            requestedPending: m.paymentsWithoutOriginals.requestedPending.count,
            advancesCount: m.paymentsWithoutOriginals.advances.count,
            advancesAmount: money(m.paymentsWithoutOriginals.advances.amount),
          })}
          tone={m.paymentsWithoutOriginals.notRequested.count + m.paymentsWithoutOriginals.requestedPending.count > 0 ? "warn" : "ok"}
        />
        <Kpi
          icon={Clock}
          label={t("reports.kpi_delayed_decisions")}
          value={m.delayedDecisions.total}
          sub={
            m.delayedDecisions.total
              ? t("reports.kpi_delayed_sub", {
                  requests: m.delayedDecisions.requests,
                  orders: m.delayedDecisions.orders,
                  certificates: m.delayedDecisions.certificates,
                  waivers: m.delayedDecisions.waivers,
                  oldestDays: m.delayedDecisions.oldestDays,
                })
              : t("reports.kpi_delayed_none", {
                  thresholdDays: m.delayedDecisions.thresholdDays,
                })
          }
          tone={m.delayedDecisions.total ? "warn" : "ok"}
        />
        <Kpi
          icon={Receipt}
          label={t("reports.kpi_unpaid_invoices")}
          value={money(m.unpaidInvoices.amount)}
          sub={t("reports.kpi_unpaid_sub", {
            withoutOrderRequests: m.unpaidInvoices.withoutOrder.requests,
            withoutOrderAmount: money(m.unpaidInvoices.withoutOrder.amount),
            inPaymentRequests: m.unpaidInvoices.inPayment.requests,
            inPaymentAmount: money(m.unpaidInvoices.inPayment.amount),
          })}
        />
        <Kpi
          icon={Split}
          label={t("reports.kpi_unapplied_chargebacks")}
          value={money(m.unappliedChargebacks.amount)}
          sub={
            m.unappliedChargebacks.count
              ? t("reports.kpi_unapplied_sub", {
                  count: m.unappliedChargebacks.count,
                  oldestDays: m.unappliedChargebacks.oldestDays,
                })
              : t("reports.kpi_unapplied_none")
          }
          tone={m.unappliedChargebacks.oldestDays > 30 ? "warn" : undefined}
        />
        <Kpi
          icon={Timer}
          label={t("reports.kpi_cycle_time")}
          value={t("reports.kpi_cycle_value", {
            requestDays: m.cycleTimes.requestToReceiptDays ?? "—",
            approvalDays: m.cycleTimes.approvalToPaymentDays ?? "—",
          })}
          sub={t("reports.kpi_cycle_sub", {
            requestSamples: m.cycleTimes.requestToReceiptSamples,
            approvalSamples: m.cycleTimes.approvalToPaymentSamples,
          })}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("reports.card_payments_no_originals")}</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>{t("reports.th_order")}</TableHead><TableHead>{t("reports.th_project")}</TableHead><TableHead>{t("reports.th_payee")}</TableHead><TableHead>{t("reports.th_type")}</TableHead><TableHead className="text-end">{t("reports.th_amount")}</TableHead><TableHead>{t("reports.th_status")}</TableHead><TableHead className="text-end">{t("reports.th_days")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {m.paymentsWithoutOriginals.rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">{t("reports.all_have_originals")}</TableCell></TableRow>}
                {m.paymentsWithoutOriginals.rows.map((r) => (
                  <TableRow key={r.orderNo + r.projectName}>
                    <TableCell className="font-mono text-xs">{r.orderNo}</TableCell>
                    <TableCell>{r.projectName}</TableCell>
                    <TableCell>{r.payeeName}</TableCell>
                    <TableCell>{PURPOSE_KEYS[r.purpose] ? t(PURPOSE_KEYS[r.purpose]) : r.purpose}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(r.amount)}</TableCell>
                    <TableCell className={r.state === "not_requested" ? "text-destructive font-semibold" : ""}>{r.state === "not_requested" ? t("reports.state_not_requested") : t("reports.state_requested", { requestNo: r.requestNo ?? "" })}</TableCell>
                    <TableCell className="text-end tabular-nums">{r.ageDays}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("reports.card_delayed", { thresholdDays: m.delayedDecisions.thresholdDays })}</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>{t("reports.th_kind")}</TableHead><TableHead>{t("reports.th_ref")}</TableHead><TableHead>{t("reports.th_project")}</TableHead><TableHead>{t("reports.th_description")}</TableHead><TableHead className="text-end">{t("reports.th_amount")}</TableHead><TableHead className="text-end">{t("reports.th_days")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {m.delayedDecisions.rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">{t("reports.no_delayed")}</TableCell></TableRow>}
                {m.delayedDecisions.rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{DECISION_KEYS[r.kind] ? t(DECISION_KEYS[r.kind]) : r.kind}</TableCell>
                    <TableCell className="font-mono text-xs">{r.ref || "—"}</TableCell>
                    <TableCell>{r.projectName}</TableCell>
                    <TableCell>{r.title}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(r.amount)}</TableCell>
                    <TableCell className="text-end tabular-nums text-destructive font-semibold">{r.ageDays}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={FileText} label={t("reports.kpi_open_bill_requests")} value={totals.openBillRequests} sub={totals.overdueBillRequests ? t("reports.kpi_overdue_count", { count: totals.overdueBillRequests }) : t("reports.kpi_no_overdue")} tone={totals.overdueBillRequests ? "warn" : undefined} />
        <Kpi icon={Hourglass} label={t("reports.kpi_pending_approval")} value={money(totals.ordersPendingApprovalAmount)} sub={t("reports.kpi_pending_orders", { count: totals.ordersPendingApproval })} />
        <Kpi icon={Banknote} label={t("reports.kpi_approved_unpaid")} value={money(totals.ordersApprovedUnpaidAmount)} />
        <Kpi icon={Banknote} label={t("reports.kpi_paid_this_month")} value={money(totals.paidThisMonthAmount)} sub={t("reports.kpi_paid_total", { amount: money(totals.paidTotalAmount) })} tone="ok" />
        <Kpi icon={ShieldAlert} label={t("reports.kpi_open_clearances")} value={totals.openClearances} sub={totals.clearancesAttention ? t("reports.kpi_clearances_attention", { count: totals.clearancesAttention }) : t("reports.kpi_no_alerts")} tone={totals.clearancesAttention ? "warn" : undefined} />
        <Kpi icon={Gavel} label={t("reports.kpi_open_fines")} value={totals.openFinesCount} sub={money(totals.openFinesAmount)} tone={totals.openFinesCount ? "warn" : undefined} />
        <Kpi icon={Gavel} label={t("reports.kpi_paid_fines")} value={money(totals.paidFinesAmount)} tone="ok" />
        <Kpi icon={HardHat} label={t("reports.kpi_sub_certs_pending")} value={money(totals.subCertsPendingAmount)} sub={t("reports.kpi_sub_certs_count", { count: totals.subCertsPendingCount })} />
        <Kpi icon={HardHat} label={t("reports.kpi_sub_certs_approved_unpaid")} value={money(totals.subCertsApprovedUnpaidAmount)} />
        <Kpi icon={HardHat} label={t("reports.kpi_retention_held")} value={money(totals.subRetentionHeld)} sub={t("reports.kpi_retention_sub")} />
        <Kpi icon={ShoppingCart} label={t("reports.kpi_goods_not_invoiced")} value={money(m.goodsReceivedNotInvoiced.amount)} sub={t("reports.kpi_goods_sub", { count: m.goodsReceivedNotInvoiced.count })} tone={m.goodsReceivedNotInvoiced.count ? "warn" : "ok"} />
        <Kpi icon={ShoppingCart} label={t("reports.kpi_po_no_activity")} value={m.poNoActivity.count} sub={money(m.poNoActivity.value)} />
        <Kpi icon={ShoppingCart} label={t("reports.kpi_po_over")} value={totals.poOverCount} sub={data.purchaseOrders.length ? t("reports.kpi_po_over_sub", { count: data.purchaseOrders.length }) : t("reports.kpi_po_none")} tone={totals.poOverCount ? "warn" : undefined} />
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">{t("reports.card_by_project")}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.project")}</TableHead>
                <TableHead className="text-end">{t("reports.th_open_originals")}</TableHead>
                <TableHead className="text-end">{t("reports.th_pending_approval")}</TableHead>
                <TableHead className="text-end">{t("reports.th_approved_unpaid")}</TableHead>
                <TableHead className="text-end">{t("reports.th_paid")}</TableHead>
                <TableHead className="text-end">{t("reports.th_open_clearances")}</TableHead>
                <TableHead className="text-end">{t("reports.th_open_fines")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byProject.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t("reports.no_data")}</TableCell></TableRow>}
              {data.byProject.map((p) => (
                <TableRow key={p.projectId}>
                  <TableCell className="font-semibold">{p.projectName}</TableCell>
                  <TableCell className={cn("text-end tabular-nums", p.overdueBillRequests > 0 && "text-destructive font-semibold")}>{p.openBillRequests}{p.overdueBillRequests > 0 && ` ${t("reports.overdue_count", { count: p.overdueBillRequests })}`}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(p.pendingOrdersAmount)}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(p.approvedUnpaidAmount)}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(p.paidAmount)}</TableCell>
                  <TableCell className={cn("text-end tabular-nums", p.clearancesAttention > 0 && "text-destructive font-semibold")}>{p.openClearances}{p.clearancesAttention > 0 && ` (${p.clearancesAttention} !)`}</TableCell>
                  <TableCell className="text-end tabular-nums">{p.openFinesCount ? `${p.openFinesCount} · ${money(p.openFinesAmount)}` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">{t("reports.card_sub_certs")}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("reports.th_subcontractor")}</TableHead>
                <TableHead>{t("common.project")}</TableHead>
                <TableHead className="text-end">{t("reports.th_contract_value")}</TableHead>
                <TableHead className="text-end">{t("reports.th_certified")}</TableHead>
                <TableHead className="text-end">{t("reports.th_completion")}</TableHead>
                <TableHead className="text-end">{t("reports.th_retention")}</TableHead>
                <TableHead className="text-end">{t("reports.th_paid")}</TableHead>
                <TableHead className="text-end">{t("reports.th_approved_unpaid")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.subcontractors.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">{t("reports.no_sub_certs")}</TableCell></TableRow>}
              {data.subcontractors.map((s, i) => {
                const pct = s.contractValue > 0 ? (s.certifiedGross / s.contractValue) * 100 : null;
                return (
                  <TableRow key={i}>
                    <TableCell className="font-semibold">{s.subcontractorName}</TableCell>
                    <TableCell>{s.projectName}</TableCell>
                    <TableCell className="text-end tabular-nums">{s.contractValue ? money(s.contractValue) : "—"}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(s.certifiedGross)}</TableCell>
                    <TableCell className={cn("text-end tabular-nums", pct !== null && pct > 100 && "text-destructive font-semibold")}>{pct === null ? "—" : `${pct.toFixed(1)}%`}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(s.retentionHeld)}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(s.paidNet)}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(s.payableNet)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">{t("reports.card_po_flagged")}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("reports.th_po")}</TableHead>
                <TableHead>{t("common.project")}</TableHead>
                <TableHead>{t("reports.th_supplier")}</TableHead>
                <TableHead className="text-end">{t("reports.th_value")}</TableHead>
                <TableHead className="text-end">{t("reports.th_invoiced")}</TableHead>
                <TableHead className="text-end">{t("reports.th_orders")}</TableHead>
                <TableHead className="text-end">{t("reports.th_paid")}</TableHead>
                <TableHead className="text-end">{t("reports.th_remaining")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flaggedPos.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">{t("reports.no_flagged_po")}</TableCell></TableRow>}
              {flaggedPos.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">
                    {p.poNumber}
                    <div className="text-[11px] font-sans text-muted-foreground">{p.over ? t("reports.po_over") : p.goodsNotInvoiced > 0.005 ? t("reports.po_goods_not_invoiced", { amount: money(p.goodsNotInvoiced) }) : t("reports.po_no_activity")}</div>
                  </TableCell>
                  <TableCell>{p.projectName}</TableCell>
                  <TableCell>{p.supplierName ?? "—"}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(p.value)}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(p.invoiced)}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(p.ordered)}{p.advances > 0 && <div className="text-xs text-muted-foreground">{t("reports.po_advances_of", { amount: money(p.advances) })}</div>}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(p.paid)}</TableCell>
                  <TableCell className={cn("text-end tabular-nums", p.over && "text-destructive font-semibold")}>
                    {p.over && <AlertTriangle className="w-3.5 h-3.5 inline me-1" />}{money(p.remaining)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">{t("reports.card_monthly")}</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 h-40">
            {data.monthlyPaid.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                <div className="text-[11px] tabular-nums text-muted-foreground">{m.amount ? money(m.amount) : ""}</div>
                <div className="w-full rounded-t-lg bg-primary/80" style={{ height: `${Math.max(m.amount ? 4 : 0, (m.amount / maxMonth) * 100)}%` }} />
                <div className="text-xs text-muted-foreground">{m.month}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("reports.card_bill_aging")}</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>{t("reports.th_number")}</TableHead><TableHead>{t("common.project")}</TableHead><TableHead>{t("reports.th_payee")}</TableHead><TableHead>{t("common.status")}</TableHead><TableHead className="text-end">{t("reports.th_days")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.billRequestAging.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">{t("reports.no_open_requests")}</TableCell></TableRow>}
                {data.billRequestAging.slice(0, 15).map((b) => (
                  <TableRow key={`${b.projectName}-${b.requestNo}`}>
                    <TableCell className="font-mono text-xs">{b.requestNo}</TableCell>
                    <TableCell>{b.projectName}</TableCell>
                    <TableCell>{b.payeeName}</TableCell>
                    <TableCell>{enumText("bill_request", b.status)}</TableCell>
                    <TableCell className={cn("text-end tabular-nums", b.overdue && "text-destructive font-semibold")}>{b.ageDays}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("reports.card_clearances_attention")}</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>{t("reports.th_item")}</TableHead><TableHead>{t("common.project")}</TableHead><TableHead>{t("reports.th_expiry_due")}</TableHead><TableHead>{t("reports.th_reason")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.clearancesAttention.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">{t("reports.no_alerts")}</TableCell></TableRow>}
                {data.clearancesAttention.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-semibold">{c.title}</TableCell>
                    <TableCell>{c.projectName}</TableCell>
                    <TableCell>{fmtDate(c.reason === "overdue" ? c.dueDate : c.expiryDate)}</TableCell>
                    <TableCell className="text-destructive font-semibold">{REASON_KEYS[c.reason] ? t(REASON_KEYS[c.reason]) : c.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">{t("reports.card_open_fines")}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>{t("reports.th_fine")}</TableHead><TableHead>{t("common.project")}</TableHead><TableHead>{t("reports.th_authority")}</TableHead><TableHead>{t("reports.th_liable")}</TableHead><TableHead>{t("common.status")}</TableHead><TableHead>{t("reports.th_due")}</TableHead><TableHead className="text-end">{t("reports.th_remaining")}</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.openFines.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">{t("reports.no_open_fines")}</TableCell></TableRow>}
              {data.openFines.map((f, i) => (
                <TableRow key={i}>
                  <TableCell className="font-semibold">{f.title}</TableCell>
                  <TableCell>{f.projectName}</TableCell>
                  <TableCell>{f.authority ?? "—"}</TableCell>
                  <TableCell>{enumText("liable_party", f.liableParty)}</TableCell>
                  <TableCell>{enumText("fine", f.status)}</TableCell>
                  <TableCell>{fmtDate(f.dueDate)}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(f.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
