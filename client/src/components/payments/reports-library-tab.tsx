import { OPEN_PERMIT, type PermitFeeRow } from "@shared/permits";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileSpreadsheet, FileText, HardHat, Hourglass, Landmark, PackageSearch, PieChart, Printer, Scissors, Store, Timer, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  OPEN_FINE,
  type ApprovalsReport,
  type PaymentsReport,
  type PoSummary,
} from "@shared/payments";
import { PoCard, fmtDate, getJson, money, paymentsQuery, supplierKey, type PaymentsContext, type PaymentsOverview } from "./payments-common";
import { enumText } from "@/lib/enums";
import {
  type Sheet,
  todayIso,
  exportSheetsToExcel,
  poFlagAr,
  PO_STATUS_AR,
  buildAgingSheet,
  buildSubcontractorSheets,
  buildPoStatementSheets,
  buildLicencesSheet,
  buildDeductionsSheets,
  buildApprovalsSheets,
  buildCashFlowSheet,
  buildPurchaseOrdersSheet,
  buildBudgetSheet,
  buildSupplierSheets,
} from "./reports-library-export";

interface Props {
  ctx: PaymentsContext;
  projectId: string; // "all" or a project id
  projectName: string;
  data: PaymentsOverview;
}

const DAY = 86_400_000;
const num = (v: unknown) => Number(v ?? 0) || 0;
const sum = <T,>(list: readonly T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
const daysSince = (d?: string | Date | null) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / DAY)) : 0);
const addDaysIso = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const same = (a?: string | null, b?: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

// Title, print and Excel for one report. Print opens just the report in its own window so the
// sidebar and header stay out of the paper copy.
function ReportShell({ title, subtitle, sheets, children }: { title: string; subtitle: string; sheets: Sheet[]; children: ReactNode }) {
  const { t, i18n } = useTranslation("payments");
  const body = useRef<HTMLDivElement>(null);

  const exportExcel = async () => {
    await exportSheetsToExcel(title, sheets);
  };

  const print = () => {
    const w = window.open("", "_blank", "width=1000,height=800");
    if (!w || !body.current) return;
    const isRtl = i18n.dir() === "rtl";
    const locale = isRtl ? "ar-SA" : "en-US";
    w.document.write(`<!doctype html><html dir="${isRtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,Tahoma,sans-serif;padding:24px;color:#111}h1{margin:0 0 4px;font-size:20px}h2{font-size:15px;margin:18px 0 6px}
.sub{color:#555;margin-bottom:12px;font-size:13px}table{width:100%;border-collapse:collapse;margin:6px 0 14px;font-size:12px}
th,td{border:1px solid #bbb;padding:5px 7px;text-align:start}th{background:#f3f4f6}button,input,select{display:none}</style></head>
<body><h1>${title}</h1><div class="sub">${subtitle} — ${new Date().toLocaleDateString(locale)}</div>${body.current.innerHTML}
<script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="w-4 h-4 me-1" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={print}><Printer className="w-4 h-4 me-1" /> {t("reports_lib.th.print")}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div ref={body} className="space-y-4">{children}</div>
      </CardContent>
    </Card>
  );
}

function Mini({ label, value, tone }: { label: string; value: ReactNode; tone?: "warn" | "ok" }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums", tone === "warn" && "text-destructive", tone === "ok" && "text-emerald-700 dark:text-emerald-300")}>{value}</div>
    </div>
  );
}

const Empty = ({ cols, text }: { cols: number; text?: string }) => {
  const { t } = useTranslation("payments");
  return (
    <TableRow><TableCell colSpan={cols} className="text-center text-muted-foreground py-6">{text ?? t("reports_lib.empty")}</TableCell></TableRow>
  );
};

// ------------------------------------------------------------------ 1. Aging

const BUCKETS = ["0–30", "31–60", "61–90", "+90"] as const;
const bucketIndex = (days: number) => (days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3);

// Unpaid liabilities by party and age bucket. The library card reads the same rows for its headline figure.
function agingRows(data: PaymentsOverview) {
  const parties = new Map<string, { type: "supplier" | "subcontractor"; party: string; buckets: number[] }>();
  const add = (type: "supplier" | "subcontractor", party: string, days: number, amount: number) => {
    if (!(amount > 0)) return;
    const key = `${type}|${party.trim().toLowerCase()}`;
    const row = parties.get(key) ?? { type, party, buckets: [0, 0, 0, 0] };
    row.buckets[bucketIndex(days)] += amount;
    parties.set(key, row);
  };
  // Suppliers: invoices on received requests that are not paid yet (aged from the invoice date)
  for (const b of data.billRequests) {
    if (b.status !== "received" || b.paymentOrderId) continue;
    if (data.orders.some((o) => o.billRequestId === b.id && o.status === "paid")) continue;
    if (b.invoices.length) for (const i of b.invoices) add("supplier", b.payeeName, daysSince(i.invoiceDate ?? b.receivedAt ?? b.createdAt), num(i.amount));
    else add("supplier", b.payeeName, daysSince(b.receivedAt ?? b.createdAt), num(b.amount));
  }
  // Subcontractors: approved certificates not paid yet (aged from approval)
  for (const c of data.subcontractorCertificates) {
    if (c.status === "approved") add("subcontractor", c.subcontractorName, daysSince(c.approvedAt), num(c.netPayable));
  }
  return Array.from(parties.values()).sort((a, b) => sum(b.buckets, (x) => x) - sum(a.buckets, (x) => x));
}

function AgingReport({ data, projectName }: { data: PaymentsOverview; projectName: string }) {
  const { t } = useTranslation("payments");
  const rows = useMemo(() => agingRows(data), [data]);

  const totals = BUCKETS.map((_, i) => sum(rows, (r) => r.buckets[i]));
  const sheet = useMemo(() => buildAgingSheet(rows, BUCKETS), [rows]);

  return (
    <ReportShell
      title={t("reports_lib.reports.aging.title")}
      subtitle={t("reports_lib.reports.aging.subtitle", { project: projectName })}
      sheets={[sheet]}
    >
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {BUCKETS.map((b, i) => (
          <Mini
            key={b}
            label={t("reports_lib.reports.aging.days", { bucket: b })}
            value={money(totals[i])}
            tone={i === 3 && totals[i] > 0 ? "warn" : undefined}
          />
        ))}
        <Mini label={t("reports_lib.total")} value={money(sum(totals, (x) => x))} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("reports_lib.th.party")}</TableHead>
            <TableHead>{t("reports_lib.th.type")}</TableHead>
            {BUCKETS.map((b) => (
              <TableHead key={b} className="text-end">
                {t("reports_lib.reports.aging.days", { bucket: b })}
              </TableHead>
            ))}
            <TableHead className="text-end">{t("reports_lib.total")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && <Empty cols={7} text={t("reports_lib.reports.aging.empty")} />}
          {rows.map((r) => (
            <TableRow key={r.type + r.party}>
              <TableCell className="font-semibold">{r.party}</TableCell>
              <TableCell>{r.type === "supplier" ? t("reports_lib.supplier") : t("reports_lib.subcontractor")}</TableCell>
              {r.buckets.map((v, i) => (
                <TableCell key={i} className={cn("text-end tabular-nums", i === 3 && v > 0 && "text-destructive font-semibold")}>
                  {v ? money(v) : "—"}
                </TableCell>
              ))}
              <TableCell className="text-end tabular-nums font-semibold">{money(sum(r.buckets, (x) => x))}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ReportShell>
  );
}

// ---------------------------------------------------- 2. Subcontractor statement

function SubcontractorStatement({ data, projectName }: { data: PaymentsOverview; projectName: string }) {
  const { t } = useTranslation("payments");
  const subs = useMemo(() => {
    // Every subcontractor in the register, with or without certificates: a deduction alone is worth a statement
    return (data.subcontractors ?? [])
      .map((s: any) => ({ key: s.id as string, id: s.id as string, projectId: s.projectId as string, projectName: s.projectName as string, name: s.name as string }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const [pick, setPick] = useState("");
  const sel = subs.find((s) => s.key === pick) ?? subs[0] ?? null;

  const view = useMemo(() => {
    if (!sel) return null;
    const certs = data.subcontractorCertificates
      .filter((c) => c.subcontractorId === sel.id && c.status !== "cancelled")
      .sort((a, b) => a.certNo.localeCompare(b.certNo));
    const counted = certs.filter((c) => ["approved", "paid"].includes(c.status));
    const contractValue = Math.max(0, ...certs.map((c) => num(c.contractValue)));
    const certified = sum(counted, (c) => num(c.grossAmount));
    const recovered = sum(counted, (c) => num(c.advanceRecovery));
    // Invoice amounts charged to this subcontractor: deducted on certificates, or still waiting for one
    const charges = (data.chargebacks ?? []).filter((c) => c.subcontractorId === sel.id);
    // Deductions recorded against this subcontractor (including those a charge-back was converted to)
    const deductions = (data.fines ?? []).filter((f) => f.subcontractorId === sel.id && !["cancelled", "waived"].includes(f.status));
    const deductionsOpen = sum(deductions.filter((f) => ["open", "under_appeal", "waiver_requested", "payment_requested"].includes(f.status)), (f) => Math.max(0, num(f.amount) - num(f.paidAmount)));
    const deductionsRecovered = sum(deductions.filter((f) => f.status === "recovered"), (f) => num(f.amount));
    const chargedApplied = sum(charges.filter((c) => c.status === "applied"), (c) => num(c.amount));
    const chargedWaiting = sum(charges.filter((c) => ["proposed", "approved"].includes(c.status)), (c) => num(c.amount));
    const chargedConverted = sum(charges.filter((c) => c.status === "converted"), (c) => num(c.amount));
    // Advance payments made to this subcontractor, matched by payee name
    const advances = data.orders.filter((o) => o.projectId === sel.projectId && o.purpose === "advance" && o.status === "paid" && same(o.payeeName, sel.name));
    const advancesPaid = sum(advances, (o) => num(o.amount));
    let cumulative = 0;
    const lines = certs.map((c) => {
      const counts = ["approved", "paid"].includes(c.status);
      if (counts) cumulative += num(c.grossAmount);
      return { c, cumulative: counts ? cumulative : null };
    });
    return {
      lines,
      contractValue,
      certified,
      pct: contractValue > 0 ? (certified / contractValue) * 100 : null,
      retention: sum(counted, (c) => num(c.retentionAmount)),
      recovered,
      advancesPaid,
      charges,
      deductions,
      deductionsOpen,
      deductionsRecovered,
      chargedApplied,
      chargedWaiting,
      chargedConverted,
      advanceRemaining: Math.max(0, advancesPaid - recovered),
      paid: sum(certs.filter((c) => c.status === "paid"), (c) => num(c.netPayable)),
      payable: sum(certs.filter((c) => c.status === "approved"), (c) => num(c.netPayable)),
    };
  }, [data, sel]);

  if (!sel || !view) {
    return (
      <ReportShell title={t("reports_lib.reports.sub.title")} subtitle={projectName} sheets={[]}>
        <p className="text-sm text-muted-foreground">{t("reports_lib.reports.sub.empty")}</p>
      </ReportShell>
    );
  }

  const sheets = buildSubcontractorSheets(view);

  return (
    <div className="space-y-3">
      <div className="max-w-sm">
        <Select value={sel.key} onValueChange={setPick}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{subs.map((s) => <SelectItem key={s.key} value={s.key}>{s.name} — {s.projectName}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <ReportShell title={`${t("reports_lib.reports.sub.title")}: ${sel.name}`} subtitle={sel.projectName} sheets={sheets}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Mini label={t("reports_lib.reports.sub.contract_value")} value={view.contractValue ? money(view.contractValue) : "—"} />
          <Mini label={t("reports_lib.reports.sub.certified")} value={money(view.certified)} />
          <Mini label={t("reports_lib.reports.sub.completion")} value={view.pct === null ? "—" : `${view.pct.toFixed(1)}%`} tone={view.pct !== null && view.pct > 100 ? "warn" : undefined} />
          <Mini label={t("reports_lib.reports.sub.retention")} value={money(view.retention)} />
          <Mini label={t("reports_lib.reports.sub.advances_paid")} value={money(view.advancesPaid)} />
          <Mini label={t("reports_lib.reports.sub.recovered")} value={money(view.recovered)} />
          <Mini label={t("reports_lib.reports.sub.advance_remaining")} value={money(view.advanceRemaining)} tone={view.advanceRemaining > 0 ? "warn" : undefined} />
          <Mini label={t("reports_lib.reports.sub.paid_payable")} value={`${money(view.paid)} / ${money(view.payable)}`} />
          {view.deductionsRecovered > 0 && <Mini label={t("reports_lib.reports.sub.deductions_recovered")} value={money(view.deductionsRecovered)} />}
          {view.deductions.length > 0 && <Mini label={t("reports_lib.reports.sub.deductions_open")} value={money(view.deductionsOpen)} tone={view.deductionsOpen > 0 ? "warn" : undefined} />}
          {view.charges.length > 0 && (
            <>
              <Mini label={t("reports_lib.reports.sub.charged_applied")} value={money(view.chargedApplied)} />
              <Mini label={t("reports_lib.reports.sub.charged_waiting")} value={money(view.chargedWaiting)} tone={view.chargedWaiting > 0 ? "warn" : undefined} />
              <Mini label={t("reports_lib.reports.sub.charged_converted")} value={money(view.chargedConverted)} />
            </>
          )}
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("reports_lib.reports.sub.th_cert")}</TableHead>
            <TableHead>{t("reports_lib.reports.sub.th_period")}</TableHead>
            <TableHead className="text-end">{t("reports_lib.reports.sub.th_work_value")}</TableHead>
            <TableHead className="text-end">{t("reports_lib.reports.sub.th_cumulative")}</TableHead>
            <TableHead className="text-end">{t("reports_lib.reports.sub.th_retention")}</TableHead>
            <TableHead className="text-end">{t("reports_lib.reports.sub.th_advance")}</TableHead>
            <TableHead className="text-end">{t("reports_lib.reports.sub.th_deductions")}</TableHead>
            <TableHead className="text-end">{t("reports_lib.reports.sub.th_chargebacks")}</TableHead>
            <TableHead className="text-end">{t("reports_lib.reports.sub.th_vat")}</TableHead>
            <TableHead className="text-end">{t("reports_lib.reports.sub.th_net")}</TableHead>
            <TableHead>{t("reports_lib.reports.sub.th_status")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {view.lines.map(({ c, cumulative }) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.certNo}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{fmtDate(c.periodFrom)} → {fmtDate(c.periodTo)}</TableCell>
                <TableCell className="text-end tabular-nums">{money(c.grossAmount)}</TableCell>
                <TableCell className="text-end tabular-nums">{cumulative === null ? "—" : money(cumulative)}</TableCell>
                <TableCell className="text-end tabular-nums">{money(c.retentionAmount)}</TableCell>
                <TableCell className="text-end tabular-nums">{money(c.advanceRecovery)}</TableCell>
                <TableCell className="text-end tabular-nums">{money(c.otherDeductions)}</TableCell>
                <TableCell className="text-end tabular-nums">{money(c.chargebackDeductions)}</TableCell>
                <TableCell className="text-end tabular-nums">{money(c.vatAmount)}</TableCell>
                <TableCell className="text-end tabular-nums font-semibold">{money(c.netPayable)}</TableCell>
                <TableCell>{enumText("sub_cert", c.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">{t("reports_lib.reports.sub.note")}</p>
      </ReportShell>
    </div>
  );
}

// ---------------------------------------------------------- 3. PO statement

function PoStatement({ data, projectName, initialPoId }: { data: PaymentsOverview; projectName: string; initialPoId?: string }) {
  const { t } = useTranslation("payments");
  const [pick, setPick] = useState(initialPoId ?? "");
  const po = data.purchaseOrders.find((p) => p.id === pick) ?? data.purchaseOrders[0] ?? null;

  if (!po) {
    return (
      <ReportShell title={t("reports_lib.reports.po.title")} subtitle={projectName} sheets={[]}>
        <p className="text-sm text-muted-foreground">{t("reports_lib.reports.po.empty")}</p>
      </ReportShell>
    );
  }
  const bills = data.billRequests.filter((b) => b.purchaseOrderId === po.id && b.status !== "cancelled");
  const orders = data.orders.filter((o) => o.purchaseOrderId === po.id && !["cancelled", "rejected"].includes(o.status));

  const sheets = buildPoStatementSheets(bills, orders);

  return (
    <div className="space-y-3">
      <div className="max-w-sm">
        <Select value={po.id} onValueChange={setPick}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{data.purchaseOrders.map((p) => <SelectItem key={p.id} value={p.id}>{p.poNumber}{p.supplierName ? ` — ${p.supplierName}` : ""}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <ReportShell title={`${t("reports_lib.reports.po.title")}: ${po.poNumber}`} subtitle={`${po.projectName}${po.supplierName ? ` — ${po.supplierName}` : ""}`} sheets={sheets}>
        <PoCard po={po} />
        <div>
          <h3 className="text-sm font-bold mb-2">{t("reports_lib.reports.po.bills_title")}</h3>
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("reports_lib.th.request")}</TableHead>
              <TableHead>{t("reports_lib.th.status")}</TableHead>
              <TableHead>{t("reports_lib.th.invoice")}</TableHead>
              <TableHead>{t("reports_lib.th.date")}</TableHead>
              <TableHead className="text-end">{t("reports_lib.th.amount")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {bills.every((b) => b.invoices.length === 0) && <Empty cols={5} text={t("reports_lib.reports.po.no_bills")} />}
              {bills.flatMap((b) => b.invoices.map((i: any) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{b.requestNo}</TableCell>
                  <TableCell>{enumText("bill_request", b.status)}</TableCell>
                  <TableCell className="font-mono text-xs">{i.invoiceNo}</TableCell>
                  <TableCell>{fmtDate(i.invoiceDate)}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(i.amount)}</TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </div>
        <div>
          <h3 className="text-sm font-bold mb-2">{t("reports_lib.reports.po.orders_title")}</h3>
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("reports_lib.th.order")}</TableHead>
              <TableHead>{t("reports_lib.th.type")}</TableHead>
              <TableHead>{t("reports_lib.th.payee")}</TableHead>
              <TableHead className="text-end">{t("reports_lib.th.amount")}</TableHead>
              <TableHead>{t("reports_lib.th.status")}</TableHead>
              <TableHead>{t("reports_lib.th.paid_date")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {orders.length === 0 && <Empty cols={6} text={t("reports_lib.reports.po.no_orders")} />}
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.orderNo}</TableCell>
                  <TableCell>{o.purpose === "advance" ? t("reports_lib.th.advance") : o.billRequestId ? t("reports_lib.th.bills") : t("reports_lib.th.other")}</TableCell>
                  <TableCell>{o.payeeName}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(o.amount)}</TableCell>
                  <TableCell>{enumText("payment_order", o.status)}</TableCell>
                  <TableCell>{fmtDate(o.paidDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ReportShell>
    </div>
  );
}

// ---------------------------------------------------------- 4. Licences timeline

// Licences expiring or falling due within the next three months, oldest first. Shared with the library card.
function licenceRows(data: PaymentsOverview) {
  const today = todayIso();
  const horizon = addDaysIso(92);
  const out: { c: PermitFeeRow; date: string; what: "expiry" | "due"; group: string }[] = [];
  for (const c of data.permits) {
    // an issued licence matters by its expiry; one still being chased matters by its due date
    const open = (OPEN_PERMIT as readonly string[]).includes(c.status);
    const date = open ? c.dueDate : c.status === "completed" || c.status === "expired" ? c.expiryDate : null;
    if (!date || date > horizon) continue;
    const month = date.slice(0, 7);
    const group = date < today ? "expired_late" : month;
    out.push({ c, date, what: open ? "due" : "expiry", group });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function LicencesTimeline({ data, projectName }: { data: PaymentsOverview; projectName: string }) {
  const { t } = useTranslation("payments");
  const rows = useMemo(() => licenceRows(data), [data]);

  const unpaidFees = sum(rows.filter((r) => !r.c.feePaid), (r) => num(r.c.feeAmount));
  const groups = Array.from(new Set(rows.map((r) => r.group)));
  const sheet = useMemo(() => buildLicencesSheet(rows), [rows]);

  return (
    <ReportShell
      title={t("reports_lib.reports.licences.title")}
      subtitle={t("reports_lib.reports.licences.subtitle", { project: projectName })}
      sheets={[sheet]}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini label={t("reports_lib.reports.licences.in_scope")} value={rows.length} />
        <Mini
          label={t("reports_lib.reports.licences.expired_late")}
          value={rows.filter((r) => r.group === "expired_late").length}
          tone={rows.some((r) => r.group === "expired_late") ? "warn" : undefined}
        />
        <Mini label={t("reports_lib.reports.licences.unpaid_fees")} value={money(unpaidFees)} tone={unpaidFees > 0 ? "warn" : undefined} />
        <Mini label={t("reports_lib.reports.licences.within_30")} value={rows.filter((r) => r.date >= todayIso() && r.date <= addDaysIso(30)).length} />
      </div>
      {groups.length === 0 && <p className="text-sm text-muted-foreground">{t("reports_lib.reports.licences.empty")}</p>}
      {groups.map((g) => (
        <div key={g}>
          <h3 className={cn("text-sm font-bold mb-2", g === "expired_late" && "text-destructive")}>
            {g === "expired_late" ? t("reports_lib.reports.licences.expired_late") : g}
          </h3>
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("reports_lib.reports.licences.th_licence")}</TableHead>
              <TableHead>{t("reports_lib.th.project")}</TableHead>
              <TableHead>{t("reports_lib.th.authority")}</TableHead>
              <TableHead>{t("reports_lib.th.status")}</TableHead>
              <TableHead>{t("reports_lib.th.type")}</TableHead>
              <TableHead>{t("reports_lib.th.date")}</TableHead>
              <TableHead className="text-end">{t("reports_lib.reports.licences.th_fee")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.filter((r) => r.group === g).map((r) => (
                <TableRow key={r.c.id}>
                  <TableCell className="font-semibold"><a className="hover:underline" href={`/permits/${r.c.id}`}>{r.c.title}</a><div className="text-xs font-normal text-muted-foreground">{r.c.transactionNo}</div></TableCell>
                  <TableCell>{r.c.projectName}</TableCell>
                  <TableCell>{r.c.authorityName ?? "—"}</TableCell>
                  <TableCell>{enumText("permit_status", r.c.status)}</TableCell>
                  <TableCell>{r.what === "expiry" ? t("reports_lib.reports.licences.expiry") : t("reports_lib.reports.licences.due")}</TableCell>
                  <TableCell>{fmtDate(r.date)}</TableCell>
                  <TableCell className="text-end tabular-nums">{num(r.c.feeAmount) > 0 ? `${money(r.c.feeAmount)}${r.c.feePaid ? " ✓" : ""}` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </ReportShell>
  );
}

// ------------------------------------------------ 5. Deductions by party and authority

function DeductionsReport({ data, projectName }: { data: PaymentsOverview; projectName: string }) {
  const { t } = useTranslation("payments");
  const live = data.fines.filter((f) => f.status !== "cancelled");
  const group = (key: (f: any) => string) => {
    const map = new Map<string, { label: string; count: number; total: number; paid: number; open: number; waivedCount: number; waivedAmount: number }>();
    for (const f of live) {
      const label = key(f);
      const row = map.get(label) ?? { label, count: 0, total: 0, paid: 0, open: 0, waivedCount: 0, waivedAmount: 0 };
      row.count += 1;
      row.total += num(f.amount);
      row.paid += num(f.paidAmount);
      if ((OPEN_FINE as readonly string[]).includes(f.status)) row.open += Math.max(0, num(f.amount) - num(f.paidAmount));
      if (f.status === "waived") { row.waivedCount += 1; row.waivedAmount += num(f.amount); }
      map.set(label, row);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  };
  const byParty = group((f) => enumText("liable_party", f.liableParty));
  const byAuthority = group((f) => f.authority || t("reports_lib.reports.deductions.no_authority"));
  const waived = live.filter((f) => f.status === "waived");

  const sheets = useMemo(() => buildDeductionsSheets(byParty, byAuthority), [byParty, byAuthority]);

  const renderTable = (title: string, headLabel: string, list: ReturnType<typeof group>) => (
    <div>
      <h3 className="text-sm font-bold mb-2">{title}</h3>
      <Table>
        <TableHeader><TableRow>
          <TableHead>{headLabel}</TableHead>
          <TableHead className="text-end">{t("reports_lib.reports.deductions.th_count")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.reports.deductions.th_total")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.reports.deductions.th_paid")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.reports.deductions.th_open")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.reports.deductions.th_waived")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.reports.deductions.th_waived_pct")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {list.length === 0 && <Empty cols={7} />}
          {list.map((r) => (
            <TableRow key={r.label}>
              <TableCell className="font-semibold">{r.label}</TableCell>
              <TableCell className="text-end tabular-nums">{r.count}</TableCell>
              <TableCell className="text-end tabular-nums">{money(r.total)}</TableCell>
              <TableCell className="text-end tabular-nums">{money(r.paid)}</TableCell>
              <TableCell className="text-end tabular-nums">{money(r.open)}</TableCell>
              <TableCell className="text-end tabular-nums">{r.waivedCount ? `${r.waivedCount} (${money(r.waivedAmount)})` : "—"}</TableCell>
              <TableCell className="text-end tabular-nums">{r.count ? `${((r.waivedCount / r.count) * 100).toFixed(0)}%` : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <ReportShell
      title={t("reports_lib.reports.deductions.title")}
      subtitle={t("reports_lib.reports.deductions.subtitle", { project: projectName })}
      sheets={sheets}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini label={t("reports_lib.reports.deductions.count")} value={live.length} />
        <Mini label={t("reports_lib.reports.deductions.total_amount")} value={money(sum(live, (f) => num(f.amount)))} />
        <Mini label={t("reports_lib.reports.deductions.waived")} value={`${waived.length} (${money(sum(waived, (f) => num(f.amount)))})`} />
        <Mini label={t("reports_lib.reports.deductions.waived_pct")} value={live.length ? `${((waived.length / live.length) * 100).toFixed(0)}%` : "—"} />
      </div>
      {renderTable(t("reports_lib.reports.deductions.by_party"), t("reports_lib.reports.deductions.th_party"), byParty)}
      {renderTable(t("reports_lib.reports.deductions.by_authority"), t("reports_lib.reports.deductions.th_authority"), byAuthority)}
    </ReportShell>
  );
}

// --------------------------------------------------------- 6. Approvals performance

function ApprovalsPerformance({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { t } = useTranslation("payments");
  const { data, isLoading } = useQuery<ApprovalsReport>({
    queryKey: ["payments", "reports", "approvals", projectId],
    queryFn: () => getJson(`/api/payments/reports/approvals${projectId === "all" ? "" : `?projectId=${projectId}`}`),
    meta: paymentsQuery,
  });
  if (isLoading || !data) return <Skeleton className="h-48 rounded-2xl" />;

  const speed = (h: number | null) =>
    h === null
      ? "—"
      : h < 48
        ? t("reports_lib.reports.approvals.hours", { h })
        : t("reports_lib.reports.approvals.days", { d: (h / 24).toFixed(1) });

  const sheets = buildApprovalsSheets(data);

  return (
    <ReportShell
      title={t("reports_lib.reports.approvals.title")}
      subtitle={t("reports_lib.reports.approvals.subtitle", { project: projectName })}
      sheets={sheets}
    >
      <div className="grid grid-cols-3 gap-3">
        <Mini label={t("reports_lib.reports.approvals.approvals")} value={data.totals.approvals} tone="ok" />
        <Mini label={t("reports_lib.reports.approvals.rejections")} value={data.totals.rejections} tone={data.totals.rejections ? "warn" : undefined} />
        <Mini label={t("reports_lib.reports.approvals.avg_time")} value={speed(data.totals.avgDecisionHours)} />
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead>{t("reports_lib.reports.approvals.th_approver")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.reports.approvals.approvals")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.reports.approvals.rejections")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.reports.approvals.avg_time")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {data.approvers.length === 0 && <Empty cols={4} text={t("reports_lib.reports.approvals.no_decisions")} />}
          {data.approvers.map((a) => (
            <TableRow key={a.name}>
              <TableCell className="font-semibold">{a.name}</TableCell>
              <TableCell className="text-end tabular-nums">{a.approvals}</TableCell>
              <TableCell className="text-end tabular-nums">{a.rejections}</TableCell>
              <TableCell className="text-end tabular-nums">{speed(a.avgDecisionHours)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div>
        <h3 className="text-sm font-bold mb-2">{t("reports_lib.reports.approvals.reasons_title")}</h3>
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("reports_lib.reports.approvals.th_reason")}</TableHead>
            <TableHead className="text-end">{t("reports_lib.reports.deductions.th_count")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.rejectionReasons.length === 0 && <Empty cols={2} text={t("reports_lib.reports.approvals.no_rejections")} />}
            {data.rejectionReasons.map((r) => (
              <TableRow key={r.reason}><TableCell>{r.reason}</TableCell><TableCell className="text-end tabular-nums">{r.count}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </ReportShell>
  );
}

// ------------------------------------------------------------ 7. Cash-flow forecast

const FLOW_KEYS = ["ready", "awaitingOrder", "awaitingApproval", "licences", "deductions"] as const;
type FlowKey = (typeof FLOW_KEYS)[number];

// What the next 30 days are expected to cost, per project and in total. Shared with the library card.
function cashFlow(data: PaymentsOverview) {
  const horizon = addDaysIso(30);
  const projects = new Map<string, { name: string } & Record<FlowKey, number>>();
  const add = (projectId: string, projectName: string, key: FlowKey, amount: number) => {
    if (!(amount > 0)) return;
    const row = projects.get(projectId) ?? { name: projectName, ready: 0, awaitingOrder: 0, awaitingApproval: 0, licences: 0, deductions: 0 };
    row[key] += amount;
    projects.set(projectId, row);
  };
  const live = ["draft", "pending_approval", "approved", "paid"];
  for (const o of data.orders) {
    if (o.status === "approved") add(o.projectId, o.projectName, "ready", num(o.amount));
    else if (o.status === "draft" || o.status === "pending_approval") add(o.projectId, o.projectName, "awaitingApproval", num(o.amount));
  }
  for (const b of data.billRequests) {
    if (b.status !== "received" || b.paymentOrderId) continue;
    if (data.orders.some((o) => o.billRequestId === b.id && live.includes(o.status))) continue; // already counted through its order
    add(b.projectId, b.projectName, "awaitingOrder", b.invoiceTotal > 0 ? num(b.invoiceTotal) : num(b.amount));
  }
  for (const c of data.subcontractorCertificates) {
    if (c.status === "submitted") add(c.projectId, c.projectName, "awaitingApproval", num(c.netPayable));
    if (c.status === "approved" && !data.orders.some((o) => o.subcontractorCertificateId === c.id && live.includes(o.status))) add(c.projectId, c.projectName, "awaitingOrder", num(c.netPayable));
  }
  for (const c of data.permits) {
    if (!c.feePaid && num(c.feeAmount) > 0 && (OPEN_PERMIT as readonly string[]).includes(c.status) && c.dueDate && c.dueDate <= horizon) add(c.projectId, c.projectName, "licences", num(c.feeAmount));
  }
  for (const f of data.fines) {
    if ((OPEN_FINE as readonly string[]).includes(f.status) && f.dueDate && f.dueDate <= horizon) add(f.projectId, f.projectName, "deductions", Math.max(0, num(f.amount) - num(f.paidAmount)));
  }
  const list = Array.from(projects.values()).sort((a, b) => a.name.localeCompare(b.name));
  return {
    perProject: list,
    totals: Object.fromEntries(FLOW_KEYS.map((k) => [k, sum(list, (r) => r[k])])) as Record<FlowKey, number>,
  };
}

function CashFlowForecast({ data, projectName }: { data: PaymentsOverview; projectName: string }) {
  const { t } = useTranslation("payments");
  const { perProject, totals } = useMemo(() => cashFlow(data), [data]);

  const flowItems = useMemo(
    () => FLOW_KEYS.map((k) => ({ key: k, label: t(`reports_lib.reports.cashflow.flow.${k}`) })),
    [t],
  );

  const grand = sum(FLOW_KEYS, (k) => totals[k]);
  const sheet = useMemo(() => buildCashFlowSheet(perProject, flowItems), [perProject, flowItems]);

  return (
    <ReportShell
      title={t("reports_lib.reports.cashflow.title")}
      subtitle={t("reports_lib.reports.cashflow.subtitle", { project: projectName })}
      sheets={[sheet]}
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {flowItems.map((f) => <Mini key={f.key} label={f.label} value={money(totals[f.key as FlowKey])} />)}
        <Mini label={t("reports_lib.reports.cashflow.grand_total")} value={money(grand)} tone={grand > 0 ? "warn" : undefined} />
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>{t("reports_lib.th.project")}</TableHead>{flowItems.map((f) => <TableHead key={f.key} className="text-end">{f.label.split(" (")[0]}</TableHead>)}<TableHead className="text-end">{t("reports_lib.total")}</TableHead></TableRow></TableHeader>
        <TableBody>
          {perProject.length === 0 && <Empty cols={7} text={t("reports_lib.reports.cashflow.empty")} />}
          {perProject.map((r) => (
            <TableRow key={r.name}>
              <TableCell className="font-semibold">{r.name}</TableCell>
              {flowItems.map((f) => <TableCell key={f.key} className="text-end tabular-nums">{r[f.key as FlowKey] ? money(r[f.key as FlowKey]) : "—"}</TableCell>)}
              <TableCell className="text-end tabular-nums font-semibold">{money(sum(FLOW_KEYS, (k) => r[k]))}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">{t("reports_lib.reports.cashflow.note")}</p>
    </ReportShell>
  );
}

// ------------------------------------------------------- 8. All purchase orders

const getPoFlag = (p: PoSummary, t: any) =>
  p.over
    ? t("reports_lib.reports.pos.flags.over")
    : p.goodsNotInvoiced > 0.005
      ? t("reports_lib.reports.pos.flags.goods_not_invoiced")
      : p.noActivity
        ? t("reports_lib.reports.pos.flags.no_activity")
        : p.status === "draft"
          ? t("reports_lib.reports.pos.flags.draft")
          : "";

function PurchaseOrdersStatus({ data, projectName }: { data: PaymentsOverview; projectName: string }) {
  const { t } = useTranslation("payments");
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const rows = filter === "attention" ? data.purchaseOrders.filter((p) => poFlagAr(p) && p.status !== "draft") : data.purchaseOrders;
  const live = data.purchaseOrders.filter((p) => p.status !== "draft");

  const sheet = useMemo(() => buildPurchaseOrdersSheet(rows), [rows]);

  return (
    <ReportShell
      title={t("reports_lib.reports.pos.title")}
      subtitle={t("reports_lib.reports.pos.subtitle", { project: projectName })}
      sheets={[sheet]}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini label={t("reports_lib.reports.pos.total_pos")} value={data.purchaseOrders.length} />
        <Mini label={t("reports_lib.reports.pos.total_value")} value={money(sum(live, (p) => p.value))} />
        <Mini label={t("reports_lib.reports.pos.goods_not_invoiced")} value={money(sum(live, (p) => p.goodsNotInvoiced))} tone={live.some((p) => p.goodsNotInvoiced > 0.005) ? "warn" : undefined} />
        <Mini label={t("reports_lib.reports.pos.no_activity")} value={live.filter((p) => p.noActivity).length} tone={live.some((p) => p.noActivity) ? "warn" : undefined} />
      </div>
      <div className="max-w-xs">
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("reports_lib.reports.pos.all_pos")}</SelectItem>
            <SelectItem value="attention">{t("reports_lib.reports.pos.attention_only")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead>{t("reports_lib.reports.pos.th_po")}</TableHead>
          <TableHead>{t("reports_lib.th.project")}</TableHead>
          <TableHead>{t("reports_lib.th.supplier")}</TableHead>
          <TableHead>{t("reports_lib.th.status")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.th.value")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.th.received")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.th.invoiced")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.th.paid")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.th.remaining")}</TableHead>
          <TableHead>{t("reports_lib.reports.pos.th_note")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 && <Empty cols={10} text={t("reports_lib.reports.pos.no_pos")} />}
          {rows.map((p) => {
            const flag = getPoFlag(p, t);
            return (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.poNumber}</TableCell>
                <TableCell>{p.projectName}</TableCell>
                <TableCell>{p.supplierName ?? "—"}</TableCell>
                <TableCell>{t(`reports_lib.reports.pos.status.${p.status}`, { defaultValue: p.status })}</TableCell>
                <TableCell className="text-end tabular-nums">{money(p.value)}</TableCell>
                <TableCell className="text-end tabular-nums">{money(p.receivedValue)} <span className="text-xs text-muted-foreground">({p.receivedPct.toFixed(0)}%)</span></TableCell>
                <TableCell className="text-end tabular-nums">{money(p.invoiced)}</TableCell>
                <TableCell className="text-end tabular-nums">{money(p.paid)}</TableCell>
                <TableCell className={cn("text-end tabular-nums", p.over && "text-destructive font-semibold")}>{money(p.remaining)}</TableCell>
                <TableCell className={cn("text-xs", flag && p.status !== "draft" && "text-destructive font-semibold")}>{flag || "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ReportShell>
  );
}

// ------------------------------------------------- 9. Budget against committed

function BudgetReport({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { t } = useTranslation("payments");
  const { data, isLoading } = useQuery<PaymentsReport>({
    queryKey: ["payments", "reports", projectId],
    queryFn: () => getJson(`/api/payments/reports${projectId === "all" ? "" : `?projectId=${projectId}`}`),
    meta: paymentsQuery,
  });
  if (isLoading || !data) return <Skeleton className="h-48 rounded-2xl" />;

  const rows = data.projectBudgets;
  const sheet = buildBudgetSheet(rows);

  return (
    <ReportShell
      title={t("reports_lib.reports.budget.title")}
      subtitle={t("reports_lib.reports.budget.subtitle", { project: projectName })}
      sheets={[sheet]}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini label={t("reports_lib.reports.budget.contracts_value")} value={money(sum(rows, (b) => b.contractValue))} />
        <Mini label={t("reports_lib.reports.budget.estimated_cost")} value={money(sum(rows, (b) => b.estimatedCost))} />
        <Mini label={t("reports_lib.reports.budget.committed")} value={money(sum(rows, (b) => b.committed))} />
        <Mini label={t("reports_lib.reports.budget.paid")} value={money(sum(rows, (b) => b.paid))} tone="ok" />
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead>{t("reports_lib.th.project")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.reports.budget.contracts_value")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.reports.budget.estimated_cost")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.reports.budget.committed_po")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.reports.budget.committed_sub")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.total")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.reports.budget.paid")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.reports.budget.remaining_budget")}</TableHead>
          <TableHead className="text-end">{t("reports_lib.reports.budget.expected_margin")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 && <Empty cols={9} />}
          {rows.map((b) => (
            <TableRow key={b.projectId}>
              <TableCell className="font-semibold">{b.projectName}</TableCell>
              <TableCell className="text-end tabular-nums">{money(b.contractValue)}</TableCell>
              <TableCell className="text-end tabular-nums">{money(b.estimatedCost)}</TableCell>
              <TableCell className="text-end tabular-nums">{money(b.committedPo)}</TableCell>
              <TableCell className="text-end tabular-nums">{money(b.committedSub)}</TableCell>
              <TableCell className="text-end tabular-nums font-semibold">{money(b.committed)}</TableCell>
              <TableCell className="text-end tabular-nums">{money(b.paid)}</TableCell>
              <TableCell className={cn("text-end tabular-nums", b.over && "text-destructive font-semibold")}>{money(b.remainingBudget)}</TableCell>
              <TableCell className="text-end tabular-nums">{money(b.expectedMargin)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">{t("reports_lib.reports.budget.note")}</p>
    </ReportShell>
  );
}

// ------------------------------------------------------ 10. Supplier statement

function SupplierStatement({ data, projectName }: { data: PaymentsOverview; projectName: string }) {
  const { t } = useTranslation("payments");
  // One supplier across projects: suppliers are per project, so group them by tax number (or name)
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; ids: Set<string> }>();
    for (const s of data.suppliers) {
      const key = supplierKey(s);
      const g = map.get(key) ?? { key, name: s.name, ids: new Set<string>() };
      g.ids.add(s.id);
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data.suppliers]);

  const [pick, setPick] = useState("");
  const withActivity = useMemo(
    () => groups.filter((g) => data.purchaseOrders.some((p) => p.supplierId && g.ids.has(p.supplierId)) || data.billRequests.some((b) => (b.supplierId && g.ids.has(b.supplierId)) || same(b.payeeName, g.name))),
    [groups, data],
  );
  const options = withActivity.length ? withActivity : groups;
  const sel = options.find((g) => g.key === pick) ?? options[0] ?? null;

  const view = useMemo(() => {
    if (!sel) return null;
    const mineSupplier = (id?: string | null, payee?: string | null) => (id ? sel.ids.has(id) : same(payee, sel.name));
    const pos = data.purchaseOrders.filter((p) => p.supplierId && sel.ids.has(p.supplierId));
    const bills = data.billRequests.filter((b) => b.status !== "cancelled" && mineSupplier(b.supplierId, b.payeeName));
    const orders = data.orders.filter((o) => !["cancelled", "rejected"].includes(o.status) && mineSupplier(o.supplierId, o.payeeName));
    const owed = (b: any) => (b.invoiceTotal > 0 ? num(b.invoiceTotal) : num(b.amount));
    const unpaid = bills.filter((b) => b.status === "received" && !b.paymentOrderId && !data.orders.some((o) => o.billRequestId === b.id && o.status === "paid"));
    return {
      pos, bills, orders,
      poValue: sum(pos.filter((p) => p.status !== "draft"), (p) => p.value),
      received: sum(pos, (p) => p.receivedValue),
      invoiced: sum(bills, (b) => num(b.invoiceTotal)),
      paid: sum(orders.filter((o) => o.status === "paid"), (o) => num(o.amount)),
      advances: sum(orders.filter((o) => o.purpose === "advance"), (o) => num(o.amount)),
      unpaidAmount: sum(unpaid, owed),
      unpaidCount: unpaid.length,
    };
  }, [data, sel]);

  if (!sel || !view) {
    return (
      <ReportShell title={t("reports_lib.reports.supplier.title")} subtitle={projectName} sheets={[]}>
        <p className="text-sm text-muted-foreground">{t("reports_lib.reports.supplier.empty")}</p>
      </ReportShell>
    );
  }

  const sheets = buildSupplierSheets(view, PO_STATUS_AR);

  return (
    <div className="space-y-3">
      <div className="max-w-sm">
        <Select value={sel.key} onValueChange={setPick}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{options.map((g) => <SelectItem key={g.key} value={g.key}>{g.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <ReportShell
        title={`${t("reports_lib.reports.supplier.title")}: ${sel.name}`}
        subtitle={t("reports_lib.reports.supplier.subtitle", { project: projectName })}
        sheets={sheets}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Mini label={t("reports_lib.reports.supplier.po_value")} value={money(view.poValue)} />
          <Mini label={t("reports_lib.reports.supplier.received")} value={money(view.received)} />
          <Mini label={t("reports_lib.reports.supplier.invoiced")} value={money(view.invoiced)} />
          <Mini label={t("reports_lib.reports.supplier.paid")} value={money(view.paid)} tone="ok" />
          <Mini label={t("reports_lib.reports.supplier.advances")} value={money(view.advances)} />
          <Mini label={t("reports_lib.reports.supplier.unpaid_invoices")} value={`${money(view.unpaidAmount)} (${view.unpaidCount})`} tone={view.unpaidAmount > 0 ? "warn" : undefined} />
        </div>
        <div>
          <h3 className="text-sm font-bold mb-2">{t("reports_lib.reports.supplier.po_title")}</h3>
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("reports_lib.reports.pos.th_po")}</TableHead>
              <TableHead>{t("reports_lib.th.project")}</TableHead>
              <TableHead>{t("reports_lib.th.status")}</TableHead>
              <TableHead className="text-end">{t("reports_lib.th.value")}</TableHead>
              <TableHead className="text-end">{t("reports_lib.th.received")}</TableHead>
              <TableHead className="text-end">{t("reports_lib.th.invoiced")}</TableHead>
              <TableHead className="text-end">{t("reports_lib.th.paid")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {view.pos.length === 0 && <Empty cols={7} text={t("reports_lib.reports.supplier.no_pos")} />}
              {view.pos.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.poNumber}</TableCell><TableCell>{p.projectName}</TableCell><TableCell>{t(`reports_lib.reports.pos.status.${p.status}`, { defaultValue: p.status })}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(p.value)}</TableCell><TableCell className="text-end tabular-nums">{money(p.receivedValue)}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(p.invoiced)}</TableCell><TableCell className="text-end tabular-nums">{money(p.paid)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div>
          <h3 className="text-sm font-bold mb-2">{t("reports_lib.reports.supplier.payments_title")}</h3>
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("reports_lib.th.order")}</TableHead>
              <TableHead>{t("reports_lib.th.project")}</TableHead>
              <TableHead>{t("reports_lib.th.type")}</TableHead>
              <TableHead className="text-end">{t("reports_lib.th.amount")}</TableHead>
              <TableHead>{t("reports_lib.th.status")}</TableHead>
              <TableHead>{t("reports_lib.th.paid_date")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {view.orders.length === 0 && <Empty cols={6} text={t("reports_lib.reports.supplier.no_payments")} />}
              {view.orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.orderNo}</TableCell><TableCell>{o.projectName}</TableCell>
                  <TableCell>{o.purpose === "advance" ? t("reports_lib.th.advance") : o.billRequestId ? t("reports_lib.th.bills") : t("reports_lib.th.other")}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(o.amount)}</TableCell>
                  <TableCell>{enumText("payment_order", o.status)}</TableCell><TableCell>{fmtDate(o.paidDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ReportShell>
    </div>
  );
}

// ------------------------------------------------------------------- The tab

const REPORT_DEFS = [
  { id: "aging", group: "cash", icon: Hourglass },
  { id: "cashflow", group: "cash", icon: TrendingUp },
  { id: "budget", group: "cash", icon: PieChart },
  { id: "supplier", group: "parties", icon: Store },
  { id: "sub", group: "parties", icon: HardHat },
  { id: "po", group: "parties", icon: FileText },
  { id: "licences", group: "obligations", icon: Landmark },
  { id: "deductions", group: "obligations", icon: Scissors },
  { id: "approvals", group: "performance", icon: Timer },
  { id: "pos", group: "performance", icon: PackageSearch },
] as const;

const GROUP_KEYS = ["cash", "parties", "obligations", "performance"] as const;

export type ReportId = (typeof REPORT_DEFS)[number]["id"];
export const isReportId = (v: unknown): v is ReportId => REPORT_DEFS.some((r) => r.id === v);

type Headline = { text: string; tone?: "warn" | "ok" };

function headlines(data: PaymentsOverview, t: (key: string, opts?: any) => string): Partial<Record<ReportId, Headline>> {
  const aging = agingRows(data);
  const over90 = sum(aging, (r) => r.buckets[3]);
  const unpaid = sum(aging, (r) => sum(r.buckets, (x) => x));
  const flow = cashFlow(data);
  const expected = sum(FLOW_KEYS, (k) => flow.totals[k]);
  const licences = licenceRows(data);
  const late = licences.filter((r) => r.group === "expired_late").length;
  const openFines = data.fines.filter((f) => (OPEN_FINE as readonly string[]).includes(f.status));
  const finesOpen = sum(openFines, (f) => Math.max(0, num(f.amount) - num(f.paidAmount)));
  const livePos = data.purchaseOrders.filter((p) => p.status !== "draft");
  const needPos = livePos.filter((p) => poFlagAr(p)).length;
  const suppliers = new Set(data.suppliers.map(supplierKey)).size;

  return {
    aging: unpaid > 0 ? { text: t("reports_lib.reports.aging.unpaid_stat", { amount: money(unpaid) }), tone: over90 > 0 ? "warn" : undefined } : { text: t("reports_lib.reports.aging.none_stat"), tone: "ok" },
    cashflow: { text: expected > 0 ? t("reports_lib.reports.cashflow.expected_stat", { amount: money(expected) }) : t("reports_lib.reports.cashflow.none_stat"), tone: expected > 0 ? "warn" : "ok" },
    licences: licences.length ? { text: late ? t("reports_lib.reports.licences.stat_late", { count: late }) : t("reports_lib.reports.licences.stat_3months", { count: licences.length }), tone: late ? "warn" : undefined } : { text: t("reports_lib.reports.licences.none_stat"), tone: "ok" },
    deductions: openFines.length ? { text: t("reports_lib.reports.deductions.stat_open", { amount: money(finesOpen), count: openFines.length }), tone: "warn" } : { text: t("reports_lib.reports.deductions.none_stat"), tone: "ok" },
    pos: livePos.length ? { text: needPos ? t("reports_lib.reports.pos.stat_attention", { count: needPos }) : t("reports_lib.reports.pos.stat_count", { count: livePos.length }), tone: needPos ? "warn" : undefined } : undefined,
    supplier: suppliers ? { text: t("reports_lib.reports.supplier.stat_count", { count: suppliers }) } : undefined,
    sub: data.subcontractors.length ? { text: t("reports_lib.reports.sub.stat_count", { count: data.subcontractors.length }) } : undefined,
    po: data.purchaseOrders.length ? { text: t("reports_lib.reports.po.stat_count", { count: data.purchaseOrders.length }) } : undefined,
  };
}

// The library itself: every report as a card under its group, carrying its live figure.
function ReportsBrowser({ data, onOpen }: { data: PaymentsOverview; onOpen: (id: ReportId) => void }) {
  const { t } = useTranslation("payments");
  const stats = useMemo(() => headlines(data, t), [data, t]);

  return (
    <div className="space-y-6" data-testid="reports-browser">
      {GROUP_KEYS.map((g) => (
        <section key={g} className="space-y-3">
          <h2 className="text-sm font-bold text-muted-foreground">{t(`reports_lib.groups.${g}`)}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {REPORT_DEFS.filter((r) => r.group === g).map((r) => {
              const stat = stats[r.id];
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onOpen(r.id)}
                  data-testid={`card-report-${r.id}`}
                  className="group text-start rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center transition-transform group-hover:scale-110">
                      <r.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="font-bold leading-tight">{t(`reports_lib.reports.${r.id}.title`)}</div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{t(`reports_lib.reports.${r.id}.desc`)}</p>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "mt-4 text-sm font-bold tabular-nums",
                      stat?.tone === "warn" ? "text-destructive" : stat?.tone === "ok" ? "text-emerald-700 dark:text-emerald-300" : "text-foreground",
                      !stat && "font-normal text-muted-foreground",
                    )}
                  >
                    {stat?.text ?? t("reports_lib.open_report")}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// The open report keeps its place in the URL, so a report can be shared and Back returns to the library.
function writeReportParam(id: ReportId | null, push: boolean) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("report", id);
  else {
    url.searchParams.delete("report");
    url.searchParams.delete("po");
  }
  window.history[push ? "pushState" : "replaceState"](null, "", url);
}

const readReportParam = (): ReportId | null => {
  try {
    const v = new URLSearchParams(window.location.search).get("report");
    return isReportId(v) ? v : null;
  } catch {
    return null;
  }
};

export function ReportsLibraryTab({ projectId, projectName, data, initialReport = null, initialPoId }: Props & { initialReport?: ReportId | null; initialPoId?: string }) {
  const { t } = useTranslation("payments");
  const [report, setReport] = useState<ReportId | null>(initialReport);

  // Back and Forward move between the library and the open report
  useEffect(() => {
    const sync = () => setReport(readReportParam());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const open = (id: ReportId) => { writeReportParam(id, true); setReport(id); };
  const close = () => { writeReportParam(null, true); setReport(null); };

  if (!report) return <ReportsBrowser data={data} onOpen={open} />;

  const current = REPORT_DEFS.find((r) => r.id === report)!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={close} data-testid="button-reports-library">
          <ArrowRight className="w-4 h-4 me-1 ltr:rotate-180" /> {t("reports_lib.all_reports")}
        </Button>
        <Select value={report} onValueChange={(v) => open(v as ReportId)}>
          <SelectTrigger className="w-[280px]" data-testid="select-report"><SelectValue /></SelectTrigger>
          <SelectContent>
            {REPORT_DEFS.map((r) => (
              <SelectItem key={r.id} value={r.id}>{t(`reports_lib.reports.${r.id}.title`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="hidden text-xs text-muted-foreground sm:inline">{t(`reports_lib.reports.${current.id}.desc`)}</span>
      </div>
      {report === "aging" && <AgingReport data={data} projectName={projectName} />}
      {report === "cashflow" && <CashFlowForecast data={data} projectName={projectName} />}
      {report === "sub" && <SubcontractorStatement data={data} projectName={projectName} />}
      {report === "po" && <PoStatement data={data} projectName={projectName} initialPoId={initialPoId} />}
      {report === "licences" && <LicencesTimeline data={data} projectName={projectName} />}
      {report === "deductions" && <DeductionsReport data={data} projectName={projectName} />}
      {report === "approvals" && <ApprovalsPerformance projectId={projectId} projectName={projectName} />}
      {report === "pos" && <PurchaseOrdersStatus data={data} projectName={projectName} />}
      {report === "budget" && <BudgetReport projectId={projectId} projectName={projectName} />}
      {report === "supplier" && <SupplierStatement data={data} projectName={projectName} />}
    </div>
  );
}
