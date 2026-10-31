import { useQuery } from "@tanstack/react-query";
import { Printer, FileSpreadsheet, FileText, Banknote, ShieldAlert, Gavel, Hourglass, HardHat, ShoppingCart, AlertTriangle, FileWarning, Clock, Receipt, Timer, Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { BILL_REQUEST_LABELS, CLEARANCE_LABELS, FINE_LABELS, LIABLE_PARTY_LABELS, type PaymentsReport } from "@shared/payments";
import { fmtDate, fmtDateTime, getJson, money, paymentsQuery } from "./payments-common";

const PURPOSE_LABEL: Record<string, string> = { advance: "دفعة مقدمة", other: "أخرى", subcontractor: "مستخلص باطن" };
const DECISION_KIND = { order: "أمر دفع", certificate: "مستخلص باطن", waiver: "طلب إعفاء", request: "طلب تحويل" } as const;
const REASON_LABEL ={ expired: "منتهي", expiring: "ينتهي قريباً", overdue: "متأخر" } as const;

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
  const { data, isLoading } = useQuery<PaymentsReport>({
    queryKey: ["payments", "reports", projectId],
    queryFn: () => getJson(`/api/payments/reports${projectId === "all" ? "" : `?projectId=${projectId}`}`),
    meta: paymentsQuery,
  });

  if (isLoading || !data) {
    return <div className="space-y-4"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>;
  }

  const t = data.totals;
  const m = data.monitoring;
  // The full list of purchase orders is in the Reports page; here only the ones that need a look
  const flaggedPos = data.purchaseOrders.filter((p) => p.over || p.goodsNotInvoiced > 0.005 || p.noActivity);
  const maxMonth = Math.max(1, ...data.monthlyPaid.map((m) => m.amount));

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const add = (name: string, rows: Record<string, unknown>[]) =>
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "—": "لا توجد بيانات" }]), name);
    add("مدفوعات بلا أصول", m.paymentsWithoutOriginals.rows.map((r) => ({
      الأمر: r.orderNo, المشروع: r.projectName, المستفيد: r.payeeName, النوع: PURPOSE_LABEL[r.purpose] ?? r.purpose, المبلغ: r.amount,
      الحالة: r.state === "not_requested" ? "لم يُطلب الأصل" : `طُلب ${r.requestNo ?? ""}`, "منذ (يوم)": r.ageDays,
    })));
    add("أوامر دفع متأخرة", m.delayedDecisions.rows.map((r) => ({
      النوع: DECISION_KIND[r.kind], المرجع: r.ref, المشروع: r.projectName, البيان: r.title, المبلغ: r.amount, "منذ (يوم)": r.ageDays,
    })));
    add("حسب المشروع", data.byProject.map((p) => ({
      المشروع: p.projectName,
      "أصول فواتير مفتوحة": p.openBillRequests,
      "متأخرة": p.overdueBillRequests,
      "أوامر بانتظار الاعتماد": p.pendingOrdersAmount,
      "معتمدة غير مصروفة": p.approvedUnpaidAmount,
      "المصروف": p.paidAmount,
      "رخص مفتوحة": p.openClearances,
      "رخص تحتاج انتباه": p.clearancesAttention,
      "خصومات مفتوحة": p.openFinesCount,
      "قيمة الخصومات المفتوحة": p.openFinesAmount,
    })));
    add("أصول الفواتير", data.billRequestAging.map((b) => ({
      المشروع: b.projectName, الرقم: b.requestNo, المستفيد: b.payeeName,
      الحالة: BILL_REQUEST_LABELS[b.status as keyof typeof BILL_REQUEST_LABELS] ?? b.status,
      "الأيام منذ الطلب": b.ageDays, الاستحقاق: b.dueDate ?? "", متأخر: b.overdue ? "نعم" : "",
    })));
    add("رخص تحتاج انتباه", data.clearancesAttention.map((c) => ({
      المشروع: c.projectName, البند: c.title, الجهة: c.authority ?? "",
      الحالة: CLEARANCE_LABELS[c.status as keyof typeof CLEARANCE_LABELS] ?? c.status,
      الانتهاء: c.expiryDate ?? "", الاستحقاق: c.dueDate ?? "", السبب: REASON_LABEL[c.reason],
    })));
    add("خصومات مفتوحة", data.openFines.map((f) => ({
      المشروع: f.projectName, الخصم: f.title, الجهة: f.authority ?? "",
      المتحمّل: LIABLE_PARTY_LABELS[f.liableParty as keyof typeof LIABLE_PARTY_LABELS] ?? f.liableParty,
      الحالة: FINE_LABELS[f.status as keyof typeof FINE_LABELS] ?? f.status, المتبقي: f.amount, الاستحقاق: f.dueDate ?? "",
    })));
    add("مستخلصات الباطن", data.subcontractors.map((s) => ({
      المشروع: s.projectName, "مقاول الباطن": s.subcontractorName, "قيمة العقد": s.contractValue,
      "المعتمد (قيمة الأعمال)": s.certifiedGross, "نسبة الإنجاز المعتمد %": s.contractValue > 0 ? Math.round((s.certifiedGross / s.contractValue) * 1000) / 10 : "",
      "الضمان المحتجز": s.retentionHeld, "المصروف": s.paidNet, "معتمد غير مصروف": s.payableNet, "عدد المستخلصات": s.certificates,
    })));
    add("أوامر الشراء", data.purchaseOrders.map((p) => ({
      المشروع: p.projectName, "أمر الشراء": p.poNumber, المورد: p.supplierName ?? "", "قيمة الأمر": p.value,
      المفوتر: p.invoiced, "أوامر الدفع": p.ordered, المدفوع: p.paid, "منها دفعات مقدمة": p.advances,
      المتبقي: p.remaining, الحالة: p.over ? "تجاوز القيمة" : "ضمن القيمة",
    })));
    add("المصروف شهرياً", data.monthlyPaid.map((m) => ({ الشهر: m.month, المبلغ: m.amount })));
    XLSX.writeFile(wb, `payments-report-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  return (
    <div className="space-y-5" id="payments-report">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-muted-foreground">
          {projectName} · أُنشئ {fmtDateTime(data.generatedAt)}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="w-4 h-4 mr-1" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" /> طباعة</Button>
        </div>
      </div>

      {/* Control cards: what needs a manager's attention first */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={FileWarning}
          label="مدفوعات بلا أصول فواتير"
          value={money(m.paymentsWithoutOriginals.notRequested.amount + m.paymentsWithoutOriginals.requestedPending.amount)}
          sub={`${m.paymentsWithoutOriginals.notRequested.count} لم يُطلب أصلها · ${m.paymentsWithoutOriginals.requestedPending.count} طُلبت ولم تصل · منها دفعات مقدمة ${m.paymentsWithoutOriginals.advances.count} (${money(m.paymentsWithoutOriginals.advances.amount)})`}
          tone={m.paymentsWithoutOriginals.notRequested.count + m.paymentsWithoutOriginals.requestedPending.count > 0 ? "warn" : "ok"}
        />
        <Kpi
          icon={Clock}
          label="أوامر دفع متأخرة"
          value={m.delayedDecisions.total}
          sub={m.delayedDecisions.total ? `${m.delayedDecisions.requests} طلب تحويل · ${m.delayedDecisions.orders} أمر · ${m.delayedDecisions.certificates} مستخلص · ${m.delayedDecisions.waivers} إعفاء · أقدمها ${m.delayedDecisions.oldestDays} يوماً` : `لا قرارات تجاوزت ${m.delayedDecisions.thresholdDays} أيام`}
          tone={m.delayedDecisions.total ? "warn" : "ok"}
        />
        <Kpi
          icon={Receipt}
          label="فواتير غير مسددة"
          value={money(m.unpaidInvoices.amount)}
          sub={`${m.unpaidInvoices.withoutOrder.requests} بلا أمر دفع (${money(m.unpaidInvoices.withoutOrder.amount)}) · ${m.unpaidInvoices.inPayment.requests} قيد الصرف (${money(m.unpaidInvoices.inPayment.amount)})`}
        />
        <Kpi
          icon={Split}
          label="خصومات فواتير غير مطبّقة"
          value={money(m.unappliedChargebacks.amount)}
          sub={m.unappliedChargebacks.count ? `${m.unappliedChargebacks.count} تحميل على مقاولي الباطن · أقدمها ${m.unappliedChargebacks.oldestDays} يوم` : "لا توجد تحميلات معلّقة"}
          tone={m.unappliedChargebacks.oldestDays > 30 ? "warn" : undefined}
        />
        <Kpi
          icon={Timer}
          label="متوسط زمن الدورة"
          value={`${m.cycleTimes.requestToReceiptDays ?? "—"} / ${m.cycleTimes.approvalToPaymentDays ?? "—"} يوم`}
          sub={`طلب الأصول ← الاستلام (${m.cycleTimes.requestToReceiptSamples}) / الاعتماد ← الصرف (${m.cycleTimes.approvalToPaymentSamples})`}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">مدفوعات بلا أصول فواتير</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>الأمر</TableHead><TableHead>المشروع</TableHead><TableHead>المستفيد</TableHead><TableHead>النوع</TableHead><TableHead className="text-end">المبلغ</TableHead><TableHead>الحالة</TableHead><TableHead className="text-end">منذ (يوم)</TableHead></TableRow></TableHeader>
              <TableBody>
                {m.paymentsWithoutOriginals.rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">كل المدفوعات لها أصول فواتير</TableCell></TableRow>}
                {m.paymentsWithoutOriginals.rows.map((r) => (
                  <TableRow key={r.orderNo + r.projectName}>
                    <TableCell className="font-mono text-xs">{r.orderNo}</TableCell>
                    <TableCell>{r.projectName}</TableCell>
                    <TableCell>{r.payeeName}</TableCell>
                    <TableCell>{PURPOSE_LABEL[r.purpose] ?? r.purpose}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(r.amount)}</TableCell>
                    <TableCell className={r.state === "not_requested" ? "text-destructive font-semibold" : ""}>{r.state === "not_requested" ? "لم يُطلب الأصل" : `طُلب ${r.requestNo ?? ""}`}</TableCell>
                    <TableCell className="text-end tabular-nums">{r.ageDays}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">أوامر دفع متأخرة (أكثر من {m.delayedDecisions.thresholdDays} أيام بانتظار القرار)</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>النوع</TableHead><TableHead>المرجع</TableHead><TableHead>المشروع</TableHead><TableHead>البيان</TableHead><TableHead className="text-end">المبلغ</TableHead><TableHead className="text-end">منذ (يوم)</TableHead></TableRow></TableHeader>
              <TableBody>
                {m.delayedDecisions.rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">لا توجد قرارات متأخرة</TableCell></TableRow>}
                {m.delayedDecisions.rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{DECISION_KIND[r.kind]}</TableCell>
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
        <Kpi icon={FileText} label="أصول فواتير مطلوبة" value={t.openBillRequests} sub={t.overdueBillRequests ? `${t.overdueBillRequests} متأخر` : "لا يوجد تأخير"} tone={t.overdueBillRequests ? "warn" : undefined} />
        <Kpi icon={Hourglass} label="بانتظار الاعتماد" value={money(t.ordersPendingApprovalAmount)} sub={`${t.ordersPendingApproval} أمر دفع`} />
        <Kpi icon={Banknote} label="معتمد وبانتظار الصرف" value={money(t.ordersApprovedUnpaidAmount)} />
        <Kpi icon={Banknote} label="المصروف هذا الشهر" value={money(t.paidThisMonthAmount)} sub={`الإجمالي ${money(t.paidTotalAmount)}`} tone="ok" />
        <Kpi icon={ShieldAlert} label="رخص مفتوحة" value={t.openClearances} sub={t.clearancesAttention ? `${t.clearancesAttention} تحتاج انتباه` : "لا تنبيهات"} tone={t.clearancesAttention ? "warn" : undefined} />
        <Kpi icon={Gavel} label="خصومات مفتوحة" value={t.openFinesCount} sub={money(t.openFinesAmount)} tone={t.openFinesCount ? "warn" : undefined} />
        <Kpi icon={Gavel} label="خصومات تم سدادها" value={money(t.paidFinesAmount)} tone="ok" />
        <Kpi icon={HardHat} label="مستخلصات باطن بانتظار الاعتماد" value={money(t.subCertsPendingAmount)} sub={`${t.subCertsPendingCount} مستخلص`} />
        <Kpi icon={HardHat} label="مستخلصات باطن معتمدة غير مصروفة" value={money(t.subCertsApprovedUnpaidAmount)} />
        <Kpi icon={HardHat} label="ضمان حسن التنفيذ المحتجز" value={money(t.subRetentionHeld)} sub="على مستخلصات الباطن" />
        <Kpi icon={ShoppingCart} label="بضاعة مستلمة بلا فاتورة" value={money(m.goodsReceivedNotInvoiced.amount)} sub={`${m.goodsReceivedNotInvoiced.count} أمر شراء`} tone={m.goodsReceivedNotInvoiced.count ? "warn" : "ok"} />
        <Kpi icon={ShoppingCart} label="أوامر شراء بلا حركة مالية" value={m.poNoActivity.count} sub={money(m.poNoActivity.value)} />
        <Kpi icon={ShoppingCart} label="أوامر شراء تجاوزت قيمتها" value={t.poOverCount} sub={data.purchaseOrders.length ? `من ${data.purchaseOrders.length} أمر شراء` : "لا توجد أوامر شراء مرتبطة"} tone={t.poOverCount ? "warn" : undefined} />
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">الوضع حسب المشروع</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المشروع</TableHead>
                <TableHead className="text-end">أصول مفتوحة</TableHead>
                <TableHead className="text-end">بانتظار الاعتماد</TableHead>
                <TableHead className="text-end">معتمد غير مصروف</TableHead>
                <TableHead className="text-end">المصروف</TableHead>
                <TableHead className="text-end">رخص مفتوحة</TableHead>
                <TableHead className="text-end">خصومات مفتوحة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byProject.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">لا توجد بيانات</TableCell></TableRow>}
              {data.byProject.map((p) => (
                <TableRow key={p.projectId}>
                  <TableCell className="font-semibold">{p.projectName}</TableCell>
                  <TableCell className={cn("text-end tabular-nums", p.overdueBillRequests > 0 && "text-destructive font-semibold")}>{p.openBillRequests}{p.overdueBillRequests > 0 && ` (${p.overdueBillRequests} متأخر)`}</TableCell>
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
        <CardHeader className="pb-2"><CardTitle className="text-base">مستخلصات مقاولي الباطن</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>مقاول الباطن</TableHead>
                <TableHead>المشروع</TableHead>
                <TableHead className="text-end">قيمة العقد</TableHead>
                <TableHead className="text-end">المعتمد</TableHead>
                <TableHead className="text-end">الإنجاز</TableHead>
                <TableHead className="text-end">الضمان المحتجز</TableHead>
                <TableHead className="text-end">المصروف</TableHead>
                <TableHead className="text-end">معتمد غير مصروف</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.subcontractors.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">لا توجد مستخلصات باطن</TableCell></TableRow>}
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
        <CardHeader className="pb-2"><CardTitle className="text-base">أوامر شراء تحتاج متابعة (تجاوز، بضاعة بلا فاتورة، أو بلا حركة مالية)</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>أمر الشراء</TableHead>
                <TableHead>المشروع</TableHead>
                <TableHead>المورد</TableHead>
                <TableHead className="text-end">القيمة</TableHead>
                <TableHead className="text-end">المفوتر</TableHead>
                <TableHead className="text-end">أوامر الدفع</TableHead>
                <TableHead className="text-end">المدفوع</TableHead>
                <TableHead className="text-end">المتبقي</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flaggedPos.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">لا توجد أوامر شراء تحتاج متابعة</TableCell></TableRow>}
              {flaggedPos.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">
                    {p.poNumber}
                    <div className="text-[11px] font-sans text-muted-foreground">{p.over ? "تجاوز القيمة" : p.goodsNotInvoiced > 0.005 ? `مستلم غير مفوتر ${money(p.goodsNotInvoiced)}` : "بلا حركة مالية"}</div>
                  </TableCell>
                  <TableCell>{p.projectName}</TableCell>
                  <TableCell>{p.supplierName ?? "—"}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(p.value)}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(p.invoiced)}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(p.ordered)}{p.advances > 0 && <div className="text-xs text-muted-foreground">منها مقدمة {money(p.advances)}</div>}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(p.paid)}</TableCell>
                  <TableCell className={cn("text-end tabular-nums", p.over && "text-destructive font-semibold")}>
                    {p.over && <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />}{money(p.remaining)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">المصروف خلال آخر 6 أشهر</CardTitle></CardHeader>
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
          <CardHeader className="pb-2"><CardTitle className="text-base">أصول فواتير لم تكتمل</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>الرقم</TableHead><TableHead>المشروع</TableHead><TableHead>المستفيد</TableHead><TableHead>الحالة</TableHead><TableHead className="text-end">منذ (يوم)</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.billRequestAging.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">لا توجد طلبات مفتوحة</TableCell></TableRow>}
                {data.billRequestAging.slice(0, 15).map((b) => (
                  <TableRow key={`${b.projectName}-${b.requestNo}`}>
                    <TableCell className="font-mono text-xs">{b.requestNo}</TableCell>
                    <TableCell>{b.projectName}</TableCell>
                    <TableCell>{b.payeeName}</TableCell>
                    <TableCell>{BILL_REQUEST_LABELS[b.status as keyof typeof BILL_REQUEST_LABELS] ?? b.status}</TableCell>
                    <TableCell className={cn("text-end tabular-nums", b.overdue && "text-destructive font-semibold")}>{b.ageDays}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">رخص تحتاج انتباه</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>البند</TableHead><TableHead>المشروع</TableHead><TableHead>الانتهاء / الاستحقاق</TableHead><TableHead>السبب</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.clearancesAttention.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">لا توجد تنبيهات</TableCell></TableRow>}
                {data.clearancesAttention.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-semibold">{c.title}</TableCell>
                    <TableCell>{c.projectName}</TableCell>
                    <TableCell>{fmtDate(c.reason === "overdue" ? c.dueDate : c.expiryDate)}</TableCell>
                    <TableCell className="text-destructive font-semibold">{REASON_LABEL[c.reason]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">الخصومات المفتوحة</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>الخصم</TableHead><TableHead>المشروع</TableHead><TableHead>الجهة</TableHead><TableHead>المتحمّل</TableHead><TableHead>الحالة</TableHead><TableHead>الاستحقاق</TableHead><TableHead className="text-end">المتبقي</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.openFines.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">لا توجد خصومات مفتوحة</TableCell></TableRow>}
              {data.openFines.map((f, i) => (
                <TableRow key={i}>
                  <TableCell className="font-semibold">{f.title}</TableCell>
                  <TableCell>{f.projectName}</TableCell>
                  <TableCell>{f.authority ?? "—"}</TableCell>
                  <TableCell>{LIABLE_PARTY_LABELS[f.liableParty as keyof typeof LIABLE_PARTY_LABELS] ?? f.liableParty}</TableCell>
                  <TableCell>{FINE_LABELS[f.status as keyof typeof FINE_LABELS] ?? f.status}</TableCell>
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
