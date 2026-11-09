import { enumLabelBilingual } from "@/lib/enums";

export interface Sheet {
  name: string;
  rows: Record<string, unknown>[];
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const sum = <T,>(list: readonly T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
export const todayIso = () => new Date().toISOString().slice(0, 10);

export const PO_STATUS_AR: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمد",
  issued: "صادر",
  partially_received: "مستلم جزئياً",
  completed: "مكتمل",
};

export const poFlagAr = (p: any) =>
  p.over ? "تجاوز القيمة" : p.goodsNotInvoiced > 0.005 ? "بضاعة مستلمة بلا فاتورة" : p.noActivity ? "بلا حركة مالية" : p.status === "draft" ? "مسودة" : "";

export async function exportSheetsToExcel(title: string, sheets: Sheet[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ "—": "لا توجد بيانات" }]), s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${title}-${todayIso()}.xlsx`);
}

export function buildAgingSheet(rows: { type: string; party: string; buckets: number[] }[], buckets: readonly string[]): Sheet {
  return {
    name: "أعمار الالتزامات",
    rows: rows.map((r) => ({
      النوع: r.type === "supplier" ? "مورد" : r.type === "subcontractor" ? "مقاول باطن" : r.type,
      الجهة: r.party,
      ...Object.fromEntries(buckets.map((b, i) => [`${b} يوم`, r.buckets[i]])),
      الإجمالي: sum(r.buckets, (x) => x),
    })),
  };
}

export function buildSubcontractorSheets(view: any): Sheet[] {
  const sheet: Sheet = {
    name: "كشف مقاول",
    rows: view.lines.map(({ c, cumulative }: any) => ({
      المستخلص: c.certNo,
      من: c.periodFrom ?? "",
      إلى: c.periodTo ?? "",
      "قيمة الأعمال": num(c.grossAmount),
      التراكمي: cumulative ?? "",
      الاستقطاع: num(c.retentionAmount),
      "استرداد الدفعة المقدمة": num(c.advanceRecovery),
      "خصومات أخرى": num(c.otherDeductions),
      "خصومات فواتير": num(c.chargebackDeductions),
      الضريبة: num(c.vatAmount),
      الصافي: num(c.netPayable),
      الحالة: enumLabelBilingual("sub_cert", c.status),
    })),
  };
  const chargeSheet: Sheet = {
    name: "فواتير محمَّلة",
    rows: view.charges.map((c: any) => ({
      الرقم: c.chargeNo,
      الفاتورة: c.invoiceNo,
      الطلب: c.requestNo,
      المبلغ: num(c.amount),
      السبب: c.reason,
      الحالة: enumLabelBilingual("chargeback", c.status),
    })),
  };
  return view.charges.length ? [sheet, chargeSheet] : [sheet];
}

export function buildPoStatementSheets(bills: any[], orders: any[]): Sheet[] {
  return [
    {
      name: "الفواتير",
      rows: bills.flatMap((b) =>
        b.invoices.map((i: any) => ({
          الطلب: b.requestNo,
          الفاتورة: i.invoiceNo,
          التاريخ: i.invoiceDate ?? "",
          المبلغ: num(i.amount),
        })),
      ),
    },
    {
      name: "أوامر الدفع",
      rows: orders.map((o) => ({
        الأمر: o.orderNo,
        النوع: o.purpose ?? "",
        المستفيد: o.payeeName,
        المبلغ: num(o.amount),
        الحالة: enumLabelBilingual("payment_order", o.status),
        "تاريخ الصرف": o.paidDate ?? "",
      })),
    },
  ];
}

export function buildLicencesSheet(rows: any[]): Sheet {
  return {
    name: "متابعة الرخص",
    rows: rows.map((r) => ({
      الفترة: r.group === "expired_late" ? "منتهية / متأخرة" : r.group,
      الرقم: r.c.transactionNo,
      الرخصة: r.c.title,
      المشروع: r.c.projectName,
      الجهة: r.c.authorityName ?? "",
      الحالة: enumLabelBilingual("permit_status", r.c.status),
      النوع: r.what === "expiry" ? "انتهاء" : r.what === "due" ? "استحقاق" : r.what,
      التاريخ: r.date,
      الرسوم: num(r.c.feeAmount),
      "الرسوم مدفوعة": r.c.feePaid ? "نعم" : "لا",
    })),
  };
}

export function buildDeductionsSheets(byParty: any[], byAuthority: any[]): Sheet[] {
  const toRows = (list: any[], label: string) =>
    list.map((r) => ({
      [label]: r.label,
      العدد: r.count,
      الإجمالي: r.total,
      المسدد: r.paid,
      "المتبقي المفتوح": r.open,
      "عدد المعفى": r.waivedCount,
      "نسبة الإعفاء %": r.count ? Math.round((r.waivedCount / r.count) * 1000) / 10 : 0,
    }));
  return [
    { name: "حسب المتحمّل", rows: toRows(byParty, "المتحمّل") },
    { name: "حسب الجهة", rows: toRows(byAuthority, "الجهة") },
  ];
}

export function buildApprovalsSheets(data: any): Sheet[] {
  return [
    {
      name: "أداء الموافقات",
      rows: data.approvers.map((a: any) => ({
        المعتمِد: a.name,
        اعتمادات: a.approvals,
        مرفوضات: a.rejections,
        "متوسط زمن القرار (ساعة)": a.avgDecisionHours ?? "",
      })),
    },
    {
      name: "أسباب الرفض",
      rows: data.rejectionReasons.map((r: any) => ({
        السبب: r.reason,
        العدد: r.count,
      })),
    },
  ];
}

export function buildCashFlowSheet(perProject: any[], flowItems: readonly { key: string; label: string }[]): Sheet {
  return {
    name: "تدفق نقدي 30 يوم",
    rows: perProject.map((r) => ({
      المشروع: r.name,
      ...Object.fromEntries(flowItems.map((f) => [f.label, r[f.key]])),
      الإجمالي: flowItems.reduce((s, f) => s + (r[f.key] || 0), 0),
    })),
  };
}

export function buildPurchaseOrdersSheet(rows: any[], poStatusMap = PO_STATUS_AR, poFlagFn = poFlagAr): Sheet {
  return {
    name: "أوامر الشراء",
    rows: rows.map((p) => ({
      "أمر الشراء": p.poNumber,
      المشروع: p.projectName,
      المورد: p.supplierName ?? "",
      الحالة: poStatusMap[p.status] ?? p.status,
      القيمة: p.value,
      المستلم: p.receivedValue,
      "نسبة الاستلام %": Math.round(p.receivedPct * 10) / 10,
      المفوتر: p.invoiced,
      "أوامر الدفع": p.ordered,
      المدفوع: p.paid,
      المتبقي: p.remaining,
      "مستلم غير مفوتر": p.goodsNotInvoiced,
      ملاحظة: poFlagFn(p),
    })),
  };
}

export function buildBudgetSheet(rows: any[]): Sheet {
  return {
    name: "الميزانية مقابل الملتزَم",
    rows: rows.map((b) => ({
      المشروع: b.projectName,
      "قيمة العقد": b.contractValue,
      "التكلفة المقدّرة": b.estimatedCost,
      "التكلفة الفعلية": b.actualCost,
      "ملتزَم: أوامر شراء": b.committedPo,
      "ملتزَم: عقود باطن": b.committedSub,
      "إجمالي الملتزَم": b.committed,
      المدفوع: b.paid,
      "المتبقي من الميزانية": b.remainingBudget,
      "الهامش المتوقع": b.expectedMargin,
      الحالة: b.over ? "تجاوز التكلفة المقدّرة" : "ضمن الميزانية",
    })),
  };
}

export function buildSupplierSheets(view: any, poStatusMap = PO_STATUS_AR): Sheet[] {
  return [
    {
      name: "أوامر الشراء",
      rows: view.pos.map((p: any) => ({
        "أمر الشراء": p.poNumber,
        المشروع: p.projectName,
        الحالة: poStatusMap[p.status] ?? p.status,
        القيمة: p.value,
        المستلم: p.receivedValue,
        المفوتر: p.invoiced,
        المدفوع: p.paid,
      })),
    },
    {
      name: "الفواتير",
      rows: view.bills.flatMap((b: any) =>
        b.invoices.map((i: any) => ({
          الطلب: b.requestNo,
          المشروع: b.projectName,
          الفاتورة: i.invoiceNo,
          التاريخ: i.invoiceDate ?? "",
          المبلغ: num(i.amount),
          "حالة الطلب": enumLabelBilingual("bill_request", b.status),
        })),
      ),
    },
    {
      name: "المدفوعات",
      rows: view.orders.map((o: any) => ({
        الأمر: o.orderNo,
        المشروع: o.projectName,
        النوع: o.purpose === "advance" ? "دفعة مقدمة" : o.billRequestId ? "فواتير" : "أخرى",
        المبلغ: num(o.amount),
        الحالة: enumLabelBilingual("payment_order", o.status),
        "تاريخ الصرف": o.paidDate ?? "",
      })),
    },
  ];
}
