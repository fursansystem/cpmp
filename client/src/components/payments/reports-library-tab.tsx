import { useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  CHARGEBACK_LABELS,
  CLEARANCE_LABELS,
  LIABLE_PARTY_LABELS,
  OPEN_FINE,
  SUB_CERT_LABELS,
  PAYMENT_ORDER_LABELS,
  BILL_REQUEST_LABELS,
  type ApprovalsReport,
  type PaymentsReport,
  type PoSummary,
} from "@shared/payments";
import { PoCard, fmtDate, getJson, money, paymentsQuery, supplierKey, type PaymentsContext, type PaymentsOverview } from "./payments-common";

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
const todayIso = () => new Date().toISOString().slice(0, 10);
const addDaysIso = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const same = (a?: string | null, b?: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

interface Sheet { name: string; rows: Record<string, unknown>[] }

// Title, print and Excel for one report. Print opens just the report in its own window so the
// sidebar and header stay out of the paper copy.
function ReportShell({ title, subtitle, sheets, children }: { title: string; subtitle: string; sheets: Sheet[]; children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    for (const s of sheets) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ "—": "لا توجد بيانات" }]), s.name.slice(0, 31));
    }
    XLSX.writeFile(wb, `${title}-${todayIso()}.xlsx`);
  };

  const print = () => {
    const w = window.open("", "_blank", "width=1000,height=800");
    if (!w || !body.current) return;
    w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,Tahoma,sans-serif;padding:24px;color:#111}h1{margin:0 0 4px;font-size:20px}h2{font-size:15px;margin:18px 0 6px}
.sub{color:#555;margin-bottom:12px;font-size:13px}table{width:100%;border-collapse:collapse;margin:6px 0 14px;font-size:12px}
th,td{border:1px solid #bbb;padding:5px 7px;text-align:start}th{background:#f3f4f6}button,input,select{display:none}</style></head>
<body><h1>${title}</h1><div class="sub">${subtitle} — ${new Date().toLocaleDateString("ar-SA")}</div>${body.current.innerHTML}
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
          <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="w-4 h-4 mr-1" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={print}><Printer className="w-4 h-4 mr-1" /> طباعة</Button>
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

const Empty = ({ cols, text = "لا توجد بيانات" }: { cols: number; text?: string }) => (
  <TableRow><TableCell colSpan={cols} className="text-center text-muted-foreground py-6">{text}</TableCell></TableRow>
);

// ------------------------------------------------------------------ 1. Aging

const BUCKETS = ["0–30", "31–60", "61–90", "+90"] as const;
const bucketIndex = (days: number) => (days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3);

function AgingReport({ data, projectName }: { data: PaymentsOverview; projectName: string }) {
  const rows = useMemo(() => {
    const parties = new Map<string, { type: string; party: string; buckets: number[] }>();
    const add = (type: string, party: string, days: number, amount: number) => {
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
      if (b.invoices.length) for (const i of b.invoices) add("مورد", b.payeeName, daysSince(i.invoiceDate ?? b.receivedAt ?? b.createdAt), num(i.amount));
      else add("مورد", b.payeeName, daysSince(b.receivedAt ?? b.createdAt), num(b.amount));
    }
    // Subcontractors: approved certificates not paid yet (aged from approval)
    for (const c of data.subcontractorCertificates) {
      if (c.status === "approved") add("مقاول باطن", c.subcontractorName, daysSince(c.approvedAt), num(c.netPayable));
    }
    return Array.from(parties.values()).sort((a, b) => sum(b.buckets, (x) => x) - sum(a.buckets, (x) => x));
  }, [data]);

  const totals = BUCKETS.map((_, i) => sum(rows, (r) => r.buckets[i]));
  const sheet: Sheet = {
    name: "أعمار الالتزامات",
    rows: rows.map((r) => ({ النوع: r.type, الجهة: r.party, ...Object.fromEntries(BUCKETS.map((b, i) => [`${b} يوم`, r.buckets[i]])), الإجمالي: sum(r.buckets, (x) => x) })),
  };

  return (
    <ReportShell title="أعمار الالتزامات" subtitle={`${projectName} — المفوتر غير المصروف للموردين، والمستخلصات المعتمدة غير المصروفة لمقاولي الباطن`} sheets={[sheet]}>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {BUCKETS.map((b, i) => <Mini key={b} label={`${b} يوم`} value={money(totals[i])} tone={i === 3 && totals[i] > 0 ? "warn" : undefined} />)}
        <Mini label="الإجمالي" value={money(sum(totals, (x) => x))} />
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>الجهة</TableHead><TableHead>النوع</TableHead>{BUCKETS.map((b) => <TableHead key={b} className="text-end">{b} يوم</TableHead>)}<TableHead className="text-end">الإجمالي</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 && <Empty cols={7} text="لا توجد التزامات غير مسددة" />}
          {rows.map((r) => (
            <TableRow key={r.type + r.party}>
              <TableCell className="font-semibold">{r.party}</TableCell>
              <TableCell>{r.type}</TableCell>
              {r.buckets.map((v, i) => <TableCell key={i} className={cn("text-end tabular-nums", i === 3 && v > 0 && "text-destructive font-semibold")}>{v ? money(v) : "—"}</TableCell>)}
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
      chargedApplied,
      chargedWaiting,
      chargedConverted,
      advanceRemaining: Math.max(0, advancesPaid - recovered),
      paid: sum(certs.filter((c) => c.status === "paid"), (c) => num(c.netPayable)),
      payable: sum(certs.filter((c) => c.status === "approved"), (c) => num(c.netPayable)),
    };
  }, [data, sel]);

  if (!sel || !view) {
    return <ReportShell title="كشف مقاول باطن" subtitle={projectName} sheets={[]}><p className="text-sm text-muted-foreground">لا توجد مستخلصات باطن بعد.</p></ReportShell>;
  }

  const sheet: Sheet = {
    name: "كشف مقاول",
    rows: view.lines.map(({ c, cumulative }) => ({
      المستخلص: c.certNo, من: c.periodFrom ?? "", إلى: c.periodTo ?? "", "قيمة الأعمال": num(c.grossAmount), التراكمي: cumulative ?? "",
      الاستقطاع: num(c.retentionAmount), "استرداد الدفعة المقدمة": num(c.advanceRecovery), "خصومات أخرى": num(c.otherDeductions), "خصومات فواتير": num(c.chargebackDeductions),
      الضريبة: num(c.vatAmount), الصافي: num(c.netPayable), الحالة: SUB_CERT_LABELS[c.status as keyof typeof SUB_CERT_LABELS] ?? c.status,
    })),
  };
  const chargeSheet: Sheet = {
    name: "فواتير محمَّلة",
    rows: view.charges.map((c: any) => ({ الرقم: c.chargeNo, الفاتورة: c.invoiceNo, الطلب: c.requestNo, المبلغ: num(c.amount), السبب: c.reason, الحالة: CHARGEBACK_LABELS[c.status as keyof typeof CHARGEBACK_LABELS] ?? c.status })),
  };

  return (
    <div className="space-y-3">
      <div className="max-w-sm">
        <Select value={sel.key} onValueChange={setPick}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{subs.map((s) => <SelectItem key={s.key} value={s.key}>{s.name} — {s.projectName}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <ReportShell title={`كشف مقاول باطن: ${sel.name}`} subtitle={sel.projectName} sheets={view.charges.length ? [sheet, chargeSheet] : [sheet]}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Mini label="قيمة العقد" value={view.contractValue ? money(view.contractValue) : "—"} />
          <Mini label="المعتمد (قيمة الأعمال)" value={money(view.certified)} />
          <Mini label="نسبة الإنجاز المعتمد" value={view.pct === null ? "—" : `${view.pct.toFixed(1)}%`} tone={view.pct !== null && view.pct > 100 ? "warn" : undefined} />
          <Mini label="الضمان المحتجز" value={money(view.retention)} />
          <Mini label="دفعات مقدمة مصروفة" value={money(view.advancesPaid)} />
          <Mini label="المستردّ منها" value={money(view.recovered)} />
          <Mini label="المتبقي من الدفعة المقدمة" value={money(view.advanceRemaining)} tone={view.advanceRemaining > 0 ? "warn" : undefined} />
          <Mini label="المصروف / المعتمد غير المصروف" value={`${money(view.paid)} / ${money(view.payable)}`} />
          {view.deductions.length > 0 && <Mini label="خصومات مسجّلة عليه (مفتوحة)" value={money(view.deductionsOpen)} tone={view.deductionsOpen > 0 ? "warn" : undefined} />}
          {view.charges.length > 0 && (
            <>
              <Mini label="فواتير محمَّلة ومخصومة" value={money(view.chargedApplied)} />
              <Mini label="فواتير محمَّلة بانتظار الخصم" value={money(view.chargedWaiting)} tone={view.chargedWaiting > 0 ? "warn" : undefined} />
              <Mini label="حُوّلت إلى خصم" value={money(view.chargedConverted)} />
            </>
          )}
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>المستخلص</TableHead><TableHead>الفترة</TableHead><TableHead className="text-end">قيمة الأعمال</TableHead><TableHead className="text-end">التراكمي</TableHead>
            <TableHead className="text-end">الاستقطاع</TableHead><TableHead className="text-end">دفعة مقدمة</TableHead><TableHead className="text-end">خصومات</TableHead><TableHead className="text-end">خصومات فواتير</TableHead>
            <TableHead className="text-end">الضريبة</TableHead><TableHead className="text-end">الصافي</TableHead><TableHead>الحالة</TableHead>
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
                <TableCell>{SUB_CERT_LABELS[c.status as keyof typeof SUB_CERT_LABELS] ?? c.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">يُحتسب التراكمي والضمان والمسترد من المستخلصات المعتمدة والمدفوعة فقط. الدفعات المقدمة تُطابق باسم المستفيد.</p>
      </ReportShell>
    </div>
  );
}

// ---------------------------------------------------------- 3. PO statement

function PoStatement({ data, projectName, initialPoId }: { data: PaymentsOverview; projectName: string; initialPoId?: string }) {
  const [pick, setPick] = useState(initialPoId ?? "");
  const po = data.purchaseOrders.find((p) => p.id === pick) ?? data.purchaseOrders[0] ?? null;

  if (!po) {
    return <ReportShell title="كشف أمر شراء" subtitle={projectName} sheets={[]}><p className="text-sm text-muted-foreground">لا توجد أوامر شراء مرتبطة بطلبات أو دفعات.</p></ReportShell>;
  }
  const bills = data.billRequests.filter((b) => b.purchaseOrderId === po.id && b.status !== "cancelled");
  const orders = data.orders.filter((o) => o.purchaseOrderId === po.id && !["cancelled", "rejected"].includes(o.status));

  const sheets: Sheet[] = [
    { name: "الفواتير", rows: bills.flatMap((b) => b.invoices.map((i: any) => ({ الطلب: b.requestNo, الفاتورة: i.invoiceNo, التاريخ: i.invoiceDate ?? "", المبلغ: num(i.amount) }))) },
    { name: "أوامر الدفع", rows: orders.map((o) => ({ الأمر: o.orderNo, النوع: o.purpose ?? "", المستفيد: o.payeeName, المبلغ: num(o.amount), الحالة: PAYMENT_ORDER_LABELS[o.status as keyof typeof PAYMENT_ORDER_LABELS] ?? o.status, "تاريخ الصرف": o.paidDate ?? "" })) },
  ];

  return (
    <div className="space-y-3">
      <div className="max-w-sm">
        <Select value={po.id} onValueChange={setPick}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{data.purchaseOrders.map((p) => <SelectItem key={p.id} value={p.id}>{p.poNumber}{p.supplierName ? ` — ${p.supplierName}` : ""}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <ReportShell title={`كشف أمر شراء: ${po.poNumber}`} subtitle={`${po.projectName}${po.supplierName ? ` — ${po.supplierName}` : ""}`} sheets={sheets}>
        <PoCard po={po} />
        <div>
          <h3 className="text-sm font-bold mb-2">الفواتير المسجلة</h3>
          <Table>
            <TableHeader><TableRow><TableHead>الطلب</TableHead><TableHead>الحالة</TableHead><TableHead>الفاتورة</TableHead><TableHead>التاريخ</TableHead><TableHead className="text-end">المبلغ</TableHead></TableRow></TableHeader>
            <TableBody>
              {bills.every((b) => b.invoices.length === 0) && <Empty cols={5} text="لا توجد فواتير مسجلة" />}
              {bills.flatMap((b) => b.invoices.map((i: any) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{b.requestNo}</TableCell>
                  <TableCell>{BILL_REQUEST_LABELS[b.status as keyof typeof BILL_REQUEST_LABELS] ?? b.status}</TableCell>
                  <TableCell className="font-mono text-xs">{i.invoiceNo}</TableCell>
                  <TableCell>{fmtDate(i.invoiceDate)}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(i.amount)}</TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </div>
        <div>
          <h3 className="text-sm font-bold mb-2">أوامر الدفع (بما فيها الدفعات المقدمة)</h3>
          <Table>
            <TableHeader><TableRow><TableHead>الأمر</TableHead><TableHead>النوع</TableHead><TableHead>المستفيد</TableHead><TableHead className="text-end">المبلغ</TableHead><TableHead>الحالة</TableHead><TableHead>تاريخ الصرف</TableHead></TableRow></TableHeader>
            <TableBody>
              {orders.length === 0 && <Empty cols={6} text="لا توجد أوامر دفع" />}
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.orderNo}</TableCell>
                  <TableCell>{o.purpose === "advance" ? "دفعة مقدمة" : o.billRequestId ? "فواتير" : "أخرى"}</TableCell>
                  <TableCell>{o.payeeName}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(o.amount)}</TableCell>
                  <TableCell>{PAYMENT_ORDER_LABELS[o.status as keyof typeof PAYMENT_ORDER_LABELS] ?? o.status}</TableCell>
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

function LicencesTimeline({ data, projectName }: { data: PaymentsOverview; projectName: string }) {
  const rows = useMemo(() => {
    const today = todayIso();
    const horizon = addDaysIso(92);
    const out: { c: any; date: string; what: "انتهاء" | "استحقاق"; group: string }[] = [];
    for (const c of data.clearances) {
      // an obtained licence matters by its expiry; one still being chased matters by its due date
      const open = ["pending", "in_progress"].includes(c.status);
      const date = open ? c.dueDate : c.status === "obtained" || c.status === "expired" ? c.expiryDate : null;
      if (!date || date > horizon) continue;
      const month = date.slice(0, 7);
      const group = date < today ? "منتهية / متأخرة" : month;
      out.push({ c, date, what: open ? "استحقاق" : "انتهاء", group });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const unpaidFees = sum(rows.filter((r) => !r.c.feePaid), (r) => num(r.c.feeAmount));
  const groups = Array.from(new Set(rows.map((r) => r.group)));
  const sheet: Sheet = {
    name: "متابعة الرخص",
    rows: rows.map((r) => ({ الفترة: r.group, الرخصة: r.c.title, المشروع: r.c.projectName, الجهة: r.c.authority ?? "", الحالة: CLEARANCE_LABELS[r.c.status as keyof typeof CLEARANCE_LABELS] ?? r.c.status, النوع: r.what, التاريخ: r.date, الرسوم: num(r.c.feeAmount), "الرسوم مدفوعة": r.c.feePaid ? "نعم" : "لا" })),
  };

  return (
    <ReportShell title="متابعة الرخص" subtitle={`${projectName} — المنتهية والمتأخرة والمستحقة خلال الأشهر الثلاثة القادمة`} sheets={[sheet]}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini label="رخص في النطاق" value={rows.length} />
        <Mini label="منتهية / متأخرة" value={rows.filter((r) => r.group === "منتهية / متأخرة").length} tone={rows.some((r) => r.group === "منتهية / متأخرة") ? "warn" : undefined} />
        <Mini label="رسوم غير مدفوعة" value={money(unpaidFees)} tone={unpaidFees > 0 ? "warn" : undefined} />
        <Mini label="خلال 30 يوماً" value={rows.filter((r) => r.date >= todayIso() && r.date <= addDaysIso(30)).length} />
      </div>
      {groups.length === 0 && <p className="text-sm text-muted-foreground">لا توجد رخص تنتهي أو تستحق خلال الأشهر الثلاثة القادمة.</p>}
      {groups.map((g) => (
        <div key={g}>
          <h3 className={cn("text-sm font-bold mb-2", g === "منتهية / متأخرة" && "text-destructive")}>{g}</h3>
          <Table>
            <TableHeader><TableRow><TableHead>الرخصة</TableHead><TableHead>المشروع</TableHead><TableHead>الجهة</TableHead><TableHead>الحالة</TableHead><TableHead>النوع</TableHead><TableHead>التاريخ</TableHead><TableHead className="text-end">الرسوم</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.filter((r) => r.group === g).map((r) => (
                <TableRow key={r.c.id}>
                  <TableCell className="font-semibold">{r.c.title}</TableCell>
                  <TableCell>{r.c.projectName}</TableCell>
                  <TableCell>{r.c.authority ?? "—"}</TableCell>
                  <TableCell>{CLEARANCE_LABELS[r.c.status as keyof typeof CLEARANCE_LABELS] ?? r.c.status}</TableCell>
                  <TableCell>{r.what}</TableCell>
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
  const byParty = group((f) => LIABLE_PARTY_LABELS[f.liableParty as keyof typeof LIABLE_PARTY_LABELS] ?? f.liableParty);
  const byAuthority = group((f) => f.authority || "بدون جهة");
  const waived = live.filter((f) => f.status === "waived");

  const toRows = (list: ReturnType<typeof group>, label: string) => list.map((r) => ({ [label]: r.label, العدد: r.count, الإجمالي: r.total, المسدد: r.paid, "المتبقي المفتوح": r.open, "عدد المعفى": r.waivedCount, "نسبة الإعفاء %": r.count ? Math.round((r.waivedCount / r.count) * 1000) / 10 : 0 }));
  const sheets: Sheet[] = [{ name: "حسب المتحمّل", rows: toRows(byParty, "المتحمّل") }, { name: "حسب الجهة", rows: toRows(byAuthority, "الجهة") }];

  const table = (title: string, list: ReturnType<typeof group>) => (
    <div>
      <h3 className="text-sm font-bold mb-2">{title}</h3>
      <Table>
        <TableHeader><TableRow><TableHead>{title.replace("حسب ", "")}</TableHead><TableHead className="text-end">العدد</TableHead><TableHead className="text-end">الإجمالي</TableHead><TableHead className="text-end">المسدد</TableHead><TableHead className="text-end">المتبقي المفتوح</TableHead><TableHead className="text-end">المعفى</TableHead><TableHead className="text-end">نسبة الإعفاء</TableHead></TableRow></TableHeader>
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
    <ReportShell title="الخصومات حسب الجهة والمتحمّل" subtitle={`${projectName} — من يتحمّل أكثر، وأي جهة تصدر أكثر، ونسبة الإعفاء المعتمدة`} sheets={sheets}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini label="عدد الخصومات" value={live.length} />
        <Mini label="إجمالي المبالغ" value={money(sum(live, (f) => num(f.amount)))} />
        <Mini label="المعفى" value={`${waived.length} (${money(sum(waived, (f) => num(f.amount)))})`} />
        <Mini label="نسبة الإعفاء" value={live.length ? `${((waived.length / live.length) * 100).toFixed(0)}%` : "—"} />
      </div>
      {table("حسب المتحمّل", byParty)}
      {table("حسب الجهة", byAuthority)}
    </ReportShell>
  );
}

// --------------------------------------------------------- 6. Approvals performance

function ApprovalsPerformance({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { data, isLoading } = useQuery<ApprovalsReport>({
    queryKey: ["payments", "reports", "approvals", projectId],
    queryFn: () => getJson(`/api/payments/reports/approvals${projectId === "all" ? "" : `?projectId=${projectId}`}`),
    meta: paymentsQuery,
  });
  if (isLoading || !data) return <Skeleton className="h-48 rounded-2xl" />;

  const speed = (h: number | null) => (h === null ? "—" : h < 48 ? `${h} ساعة` : `${(h / 24).toFixed(1)} يوم`);
  const sheets: Sheet[] = [
    { name: "أداء الموافقات", rows: data.approvers.map((a) => ({ المعتمِد: a.name, اعتمادات: a.approvals, مرفوضات: a.rejections, "متوسط زمن القرار (ساعة)": a.avgDecisionHours ?? "" })) },
    { name: "أسباب الرفض", rows: data.rejectionReasons.map((r) => ({ السبب: r.reason, العدد: r.count })) },
  ];

  return (
    <ReportShell title="أداء الموافقات" subtitle={`${projectName} — أوامر الدفع ومستخلصات الباطن وطلبات الإعفاء، من سجل المتابعة`} sheets={sheets}>
      <div className="grid grid-cols-3 gap-3">
        <Mini label="اعتمادات" value={data.totals.approvals} tone="ok" />
        <Mini label="مرفوضات" value={data.totals.rejections} tone={data.totals.rejections ? "warn" : undefined} />
        <Mini label="متوسط زمن القرار" value={speed(data.totals.avgDecisionHours)} />
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>المعتمِد</TableHead><TableHead className="text-end">اعتمادات</TableHead><TableHead className="text-end">مرفوضات</TableHead><TableHead className="text-end">متوسط زمن القرار</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.approvers.length === 0 && <Empty cols={4} text="لا توجد قرارات مسجلة بعد" />}
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
        <h3 className="text-sm font-bold mb-2">أسباب الرفض الشائعة</h3>
        <Table>
          <TableHeader><TableRow><TableHead>السبب</TableHead><TableHead className="text-end">العدد</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.rejectionReasons.length === 0 && <Empty cols={2} text="لا توجد مرفوضات" />}
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

const FLOW = [
  { key: "ready", label: "جاهز للصرف (أوامر معتمدة)" },
  { key: "awaitingOrder", label: "بانتظار أمر دفع (فواتير مستلمة ومستخلصات معتمدة)" },
  { key: "awaitingApproval", label: "بانتظار الاعتماد (أوامر ومستخلصات)" },
  { key: "licences", label: "رسوم رخص مستحقة" },
  { key: "deductions", label: "خصومات مستحقة" },
] as const;
type FlowKey = (typeof FLOW)[number]["key"];

function CashFlowForecast({ data, projectName }: { data: PaymentsOverview; projectName: string }) {
  const { perProject, totals } = useMemo(() => {
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
    for (const c of data.clearances) {
      if (!c.feePaid && num(c.feeAmount) > 0 && ["pending", "in_progress"].includes(c.status) && c.dueDate && c.dueDate <= horizon) add(c.projectId, c.projectName, "licences", num(c.feeAmount));
    }
    for (const f of data.fines) {
      if ((OPEN_FINE as readonly string[]).includes(f.status) && f.dueDate && f.dueDate <= horizon) add(f.projectId, f.projectName, "deductions", Math.max(0, num(f.amount) - num(f.paidAmount)));
    }
    const list = Array.from(projects.values()).sort((a, b) => a.name.localeCompare(b.name));
    return {
      perProject: list,
      totals: Object.fromEntries(FLOW.map((f) => [f.key, sum(list, (r) => r[f.key])])) as Record<FlowKey, number>,
    };
  }, [data]);

  const grand = sum(FLOW, (f) => totals[f.key]);
  const sheet: Sheet = { name: "تدفق نقدي 30 يوم", rows: perProject.map((r) => ({ المشروع: r.name, ...Object.fromEntries(FLOW.map((f) => [f.label, r[f.key]])), الإجمالي: sum(FLOW, (f) => r[f.key]) })) };

  return (
    <ReportShell title="تدفق نقدي متوقع (30 يوماً)" subtitle={`${projectName} — ما يُتوقع صرفه من الأوامر والفواتير والمستخلصات والرسوم والخصومات المستحقة`} sheets={[sheet]}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {FLOW.map((f) => <Mini key={f.key} label={f.label} value={money(totals[f.key])} />)}
        <Mini label="إجمالي المتوقع" value={money(grand)} tone={grand > 0 ? "warn" : undefined} />
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>المشروع</TableHead>{FLOW.map((f) => <TableHead key={f.key} className="text-end">{f.label.split(" (")[0]}</TableHead>)}<TableHead className="text-end">الإجمالي</TableHead></TableRow></TableHeader>
        <TableBody>
          {perProject.length === 0 && <Empty cols={7} text="لا توجد التزامات متوقعة" />}
          {perProject.map((r) => (
            <TableRow key={r.name}>
              <TableCell className="font-semibold">{r.name}</TableCell>
              {FLOW.map((f) => <TableCell key={f.key} className="text-end tabular-nums">{r[f.key] ? money(r[f.key]) : "—"}</TableCell>)}
              <TableCell className="text-end tabular-nums font-semibold">{money(sum(FLOW, (f) => r[f.key]))}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">لا يوجد تاريخ استحقاق للدفع على الأوامر والفواتير، فتُعدّ كلها مستحقة الآن. الرسوم والخصومات تدخل إذا كان موعدها خلال 30 يوماً أو فات.</p>
    </ReportShell>
  );
}

// ------------------------------------------------------- 8. All purchase orders

const PO_STATUS: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمد",
  issued: "صادر",
  partially_received: "مستلم جزئياً",
  completed: "مكتمل",
};

const poFlag = (p: PoSummary) =>
  p.over ? "تجاوز القيمة" : p.goodsNotInvoiced > 0.005 ? "بضاعة مستلمة بلا فاتورة" : p.noActivity ? "بلا حركة مالية" : p.status === "draft" ? "مسودة" : "";

function PurchaseOrdersStatus({ data, projectName }: { data: PaymentsOverview; projectName: string }) {
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const rows = filter === "attention" ? data.purchaseOrders.filter((p) => poFlag(p) && p.status !== "draft") : data.purchaseOrders;
  const live = data.purchaseOrders.filter((p) => p.status !== "draft");

  const sheet: Sheet = {
    name: "أوامر الشراء",
    rows: rows.map((p) => ({
      "أمر الشراء": p.poNumber, المشروع: p.projectName, المورد: p.supplierName ?? "", الحالة: PO_STATUS[p.status] ?? p.status,
      القيمة: p.value, المستلم: p.receivedValue, "نسبة الاستلام %": Math.round(p.receivedPct * 10) / 10, المفوتر: p.invoiced,
      "أوامر الدفع": p.ordered, المدفوع: p.paid, المتبقي: p.remaining, "مستلم غير مفوتر": p.goodsNotInvoiced, ملاحظة: poFlag(p),
    })),
  };

  return (
    <ReportShell title="حالة أوامر الشراء" subtitle={`${projectName} — كل أوامر الشراء غير الملغاة، سواء لُمست مالياً أم لا`} sheets={[sheet]}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini label="أوامر الشراء" value={data.purchaseOrders.length} />
        <Mini label="قيمتها (غير المسودة)" value={money(sum(live, (p) => p.value))} />
        <Mini label="بضاعة مستلمة بلا فاتورة" value={money(sum(live, (p) => p.goodsNotInvoiced))} tone={live.some((p) => p.goodsNotInvoiced > 0.005) ? "warn" : undefined} />
        <Mini label="بلا حركة مالية" value={live.filter((p) => p.noActivity).length} tone={live.some((p) => p.noActivity) ? "warn" : undefined} />
      </div>
      <div className="max-w-xs">
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل أوامر الشراء</SelectItem>
            <SelectItem value="attention">التي تحتاج متابعة فقط</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead>أمر الشراء</TableHead><TableHead>المشروع</TableHead><TableHead>المورد</TableHead><TableHead>الحالة</TableHead>
          <TableHead className="text-end">القيمة</TableHead><TableHead className="text-end">المستلم</TableHead><TableHead className="text-end">المفوتر</TableHead>
          <TableHead className="text-end">المدفوع</TableHead><TableHead className="text-end">المتبقي</TableHead><TableHead>ملاحظة</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 && <Empty cols={10} text="لا توجد أوامر شراء" />}
          {rows.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono text-xs">{p.poNumber}</TableCell>
              <TableCell>{p.projectName}</TableCell>
              <TableCell>{p.supplierName ?? "—"}</TableCell>
              <TableCell>{PO_STATUS[p.status] ?? p.status}</TableCell>
              <TableCell className="text-end tabular-nums">{money(p.value)}</TableCell>
              <TableCell className="text-end tabular-nums">{money(p.receivedValue)} <span className="text-xs text-muted-foreground">({p.receivedPct.toFixed(0)}%)</span></TableCell>
              <TableCell className="text-end tabular-nums">{money(p.invoiced)}</TableCell>
              <TableCell className="text-end tabular-nums">{money(p.paid)}</TableCell>
              <TableCell className={cn("text-end tabular-nums", p.over && "text-destructive font-semibold")}>{money(p.remaining)}</TableCell>
              <TableCell className={cn("text-xs", poFlag(p) && p.status !== "draft" && "text-destructive font-semibold")}>{poFlag(p) || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ReportShell>
  );
}

// ------------------------------------------------- 9. Budget against committed

function BudgetReport({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { data, isLoading } = useQuery<PaymentsReport>({
    queryKey: ["payments", "reports", projectId],
    queryFn: () => getJson(`/api/payments/reports${projectId === "all" ? "" : `?projectId=${projectId}`}`),
    meta: paymentsQuery,
  });
  if (isLoading || !data) return <Skeleton className="h-48 rounded-2xl" />;

  const rows = data.projectBudgets;
  const sheet: Sheet = {
    name: "الميزانية مقابل الملتزَم",
    rows: rows.map((b) => ({
      المشروع: b.projectName, "قيمة العقد": b.contractValue, "التكلفة المقدّرة": b.estimatedCost, "التكلفة الفعلية": b.actualCost,
      "ملتزَم: أوامر شراء": b.committedPo, "ملتزَم: عقود باطن": b.committedSub, "إجمالي الملتزَم": b.committed, المدفوع: b.paid,
      "المتبقي من الميزانية": b.remainingBudget, "الهامش المتوقع": b.expectedMargin, الحالة: b.over ? "تجاوز التكلفة المقدّرة" : "ضمن الميزانية",
    })),
  };

  return (
    <ReportShell title="الميزانية مقابل الملتزَم" subtitle={`${projectName} — الملتزَم = أوامر الشراء المعتمدة فما بعد + قيم عقود الباطن`} sheets={[sheet]}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini label="قيمة العقود" value={money(sum(rows, (b) => b.contractValue))} />
        <Mini label="التكلفة المقدّرة" value={money(sum(rows, (b) => b.estimatedCost))} />
        <Mini label="الملتزَم" value={money(sum(rows, (b) => b.committed))} />
        <Mini label="المدفوع" value={money(sum(rows, (b) => b.paid))} tone="ok" />
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead>المشروع</TableHead><TableHead className="text-end">قيمة العقد</TableHead><TableHead className="text-end">التكلفة المقدّرة</TableHead>
          <TableHead className="text-end">ملتزَم (شراء)</TableHead><TableHead className="text-end">ملتزَم (باطن)</TableHead><TableHead className="text-end">الإجمالي</TableHead>
          <TableHead className="text-end">المدفوع</TableHead><TableHead className="text-end">المتبقي من الميزانية</TableHead><TableHead className="text-end">الهامش المتوقع</TableHead>
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
      <p className="text-xs text-muted-foreground">الأوامر المسودة والملغاة لا تُعدّ التزاماً. الهامش المتوقع = قيمة العقد − الملتزَم، وهو تقدير أولي لا يشمل مصروفات خارج أوامر الشراء وعقود الباطن.</p>
    </ReportShell>
  );
}

// ------------------------------------------------------ 10. Supplier statement

function SupplierStatement({ data, projectName }: { data: PaymentsOverview; projectName: string }) {
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
    return <ReportShell title="كشف مورد" subtitle={projectName} sheets={[]}><p className="text-sm text-muted-foreground">لا يوجد موردون في المشاريع المتاحة.</p></ReportShell>;
  }

  const sheets: Sheet[] = [
    { name: "أوامر الشراء", rows: view.pos.map((p) => ({ "أمر الشراء": p.poNumber, المشروع: p.projectName, الحالة: PO_STATUS[p.status] ?? p.status, القيمة: p.value, المستلم: p.receivedValue, المفوتر: p.invoiced, المدفوع: p.paid })) },
    { name: "الفواتير", rows: view.bills.flatMap((b) => b.invoices.map((i: any) => ({ الطلب: b.requestNo, المشروع: b.projectName, الفاتورة: i.invoiceNo, التاريخ: i.invoiceDate ?? "", المبلغ: num(i.amount), "حالة الطلب": BILL_REQUEST_LABELS[b.status as keyof typeof BILL_REQUEST_LABELS] ?? b.status }))) },
    { name: "المدفوعات", rows: view.orders.map((o) => ({ الأمر: o.orderNo, المشروع: o.projectName, النوع: o.purpose === "advance" ? "دفعة مقدمة" : o.billRequestId ? "فواتير" : "أخرى", المبلغ: num(o.amount), الحالة: PAYMENT_ORDER_LABELS[o.status as keyof typeof PAYMENT_ORDER_LABELS] ?? o.status, "تاريخ الصرف": o.paidDate ?? "" })) },
  ];

  return (
    <div className="space-y-3">
      <div className="max-w-sm">
        <Select value={sel.key} onValueChange={setPick}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{options.map((g) => <SelectItem key={g.key} value={g.key}>{g.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <ReportShell title={`كشف مورد: ${sel.name}`} subtitle={`${projectName} — أوامر الشراء والفواتير والمدفوعات، ويجمع المورد نفسه عبر المشاريع بالرقم الضريبي أو الاسم`} sheets={sheets}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Mini label="قيمة أوامر الشراء" value={money(view.poValue)} />
          <Mini label="المستلم" value={money(view.received)} />
          <Mini label="المفوتر" value={money(view.invoiced)} />
          <Mini label="المدفوع" value={money(view.paid)} tone="ok" />
          <Mini label="دفعات مقدمة" value={money(view.advances)} />
          <Mini label="فواتير غير مسددة" value={`${money(view.unpaidAmount)} (${view.unpaidCount})`} tone={view.unpaidAmount > 0 ? "warn" : undefined} />
        </div>
        <div>
          <h3 className="text-sm font-bold mb-2">أوامر الشراء</h3>
          <Table>
            <TableHeader><TableRow><TableHead>أمر الشراء</TableHead><TableHead>المشروع</TableHead><TableHead>الحالة</TableHead><TableHead className="text-end">القيمة</TableHead><TableHead className="text-end">المستلم</TableHead><TableHead className="text-end">المفوتر</TableHead><TableHead className="text-end">المدفوع</TableHead></TableRow></TableHeader>
            <TableBody>
              {view.pos.length === 0 && <Empty cols={7} text="لا توجد أوامر شراء" />}
              {view.pos.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.poNumber}</TableCell><TableCell>{p.projectName}</TableCell><TableCell>{PO_STATUS[p.status] ?? p.status}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(p.value)}</TableCell><TableCell className="text-end tabular-nums">{money(p.receivedValue)}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(p.invoiced)}</TableCell><TableCell className="text-end tabular-nums">{money(p.paid)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div>
          <h3 className="text-sm font-bold mb-2">المدفوعات وأوامر الدفع</h3>
          <Table>
            <TableHeader><TableRow><TableHead>الأمر</TableHead><TableHead>المشروع</TableHead><TableHead>النوع</TableHead><TableHead className="text-end">المبلغ</TableHead><TableHead>الحالة</TableHead><TableHead>تاريخ الصرف</TableHead></TableRow></TableHeader>
            <TableBody>
              {view.orders.length === 0 && <Empty cols={6} text="لا توجد مدفوعات" />}
              {view.orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.orderNo}</TableCell><TableCell>{o.projectName}</TableCell>
                  <TableCell>{o.purpose === "advance" ? "دفعة مقدمة" : o.billRequestId ? "فواتير" : "أخرى"}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(o.amount)}</TableCell>
                  <TableCell>{PAYMENT_ORDER_LABELS[o.status as keyof typeof PAYMENT_ORDER_LABELS] ?? o.status}</TableCell><TableCell>{fmtDate(o.paidDate)}</TableCell>
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

const REPORTS = [
  { id: "aging", label: "أعمار الالتزامات" },
  { id: "cashflow", label: "تدفق نقدي متوقع (30 يوماً)" },
  { id: "sub", label: "كشف مقاول باطن" },
  { id: "po", label: "كشف أمر شراء" },
  { id: "licences", label: "متابعة الرخص" },
  { id: "deductions", label: "الخصومات حسب الجهة والمتحمّل" },
  { id: "approvals", label: "أداء الموافقات" },
  { id: "pos", label: "حالة أوامر الشراء (كلها)" },
  { id: "budget", label: "الميزانية مقابل الملتزَم" },
  { id: "supplier", label: "كشف مورد" },
] as const;

export type ReportId = (typeof REPORTS)[number]["id"];
export const isReportId = (v: unknown): v is ReportId => REPORTS.some((r) => r.id === v);

export function ReportsLibraryTab({ projectId, projectName, data, initialReport = "aging", initialPoId }: Props & { initialReport?: ReportId; initialPoId?: string }) {
  const [report, setReport] = useState<ReportId>(initialReport);
  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <Select value={report} onValueChange={(v) => setReport(v as typeof report)}>
          <SelectTrigger data-testid="select-report"><SelectValue /></SelectTrigger>
          <SelectContent>{REPORTS.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent>
        </Select>
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
