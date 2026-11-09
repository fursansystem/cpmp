import { enumLabelBilingual } from "@shared/i18n";
import { fmtDate, money, poLabel, type PaymentsOverview } from "./payments-common";

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export function printVoucher(row: any, data: PaymentsOverview, sourceText: string) {
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return;
  const method = enumLabelBilingual("payment_method", row.paymentMethod) ?? "—";
  const statusLabel = enumLabelBilingual("payment_order", row.status);
  w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(row.orderNo)}</title>
<style>body{font-family:Arial,Tahoma,sans-serif;padding:32px;color:#111}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}
td{border:1px solid #bbb;padding:8px 10px;font-size:14px}td:first-child{background:#f3f4f6;width:30%;font-weight:700}.sig{display:flex;gap:24px;margin-top:64px}
.sig div{flex:1;border-top:1px solid #111;padding-top:6px;text-align:center;font-size:13px}</style></head><body>
<h1>أمر دفع — ${esc(row.orderNo)}</h1><div>${esc(row.projectName)}</div>
<table>
<tr><td>المستفيد</td><td>${esc(row.payeeName)}</td></tr>
<tr><td>المبلغ</td><td>${esc(money(row.amount))}</td></tr>
<tr><td>المصدر</td><td>${esc(sourceText)}</td></tr>
${(() => { const p = data.purchaseOrders.find((x) => x.id === row.purchaseOrderId); return p ? `<tr><td>أمر الشراء</td><td>${esc(poLabel(p))} — قيمته ${esc(money(p.value))}</td></tr>` : ""; })()}
${(data.billRequests.find((b) => b.id === row.billRequestId)?.invoices ?? []).map((i: any) => `<tr><td>فاتورة ${esc(i.invoiceNo)}</td><td>${esc(fmtDate(i.invoiceDate))} — ${esc(money(i.amount))}</td></tr>`).join("")}
<tr><td>البيان</td><td>${esc(row.reason)}</td></tr>
<tr><td>الحالة</td><td>${esc(statusLabel)}</td></tr>
<tr><td>أنشأه</td><td>${esc(row.createdByName)}</td></tr>
<tr><td>اعتمده</td><td>${esc(row.approvedByName)} ${esc(fmtDate(row.approvedAt))}</td></tr>
<tr><td>طريقة الدفع / المرجع</td><td>${esc(method)} ${esc(row.paymentReference)}</td></tr>
<tr><td>تاريخ الصرف</td><td>${esc(fmtDate(row.paidDate))}</td></tr>
</table>
<div class="sig"><div>المحاسب</div><div>المدير المالي</div><div>المدير المعتمد</div></div>
<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

