import { type PaymentsReport } from "@shared/payments";
import { enumLabelBilingual } from "@/lib/enums";

export async function exportPaymentsReportExcel(data: PaymentsReport, t: (key: string, opts?: any) => string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const m = data.monitoring;
  const add = (name: string, rows: Record<string, unknown>[]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "—": t("reports.excel_no_data") }]), name);

  const PURPOSE_KEYS: Record<string, string> = { advance: "reports.purpose_advance", other: "reports.purpose_other", subcontractor: "reports.purpose_subcontractor" };
  const DECISION_KEYS: Record<string, string> = { order: "reports.decision_order", certificate: "reports.decision_certificate", waiver: "reports.decision_waiver", request: "reports.decision_request" };
  const REASON_KEYS: Record<string, string> = { expired: "reports.reason_expired", expiring: "reports.reason_expiring", overdue: "reports.reason_overdue" };

  add(t("reports.excel_payments_no_originals"), m.paymentsWithoutOriginals.rows.map((r: any) => ({
    [t("reports.th_order")]: r.orderNo,
    [t("reports.th_project")]: r.projectName,
    [t("reports.th_payee")]: r.payeeName,
    [t("reports.th_type")]: PURPOSE_KEYS[r.purpose] ? t(PURPOSE_KEYS[r.purpose]) : r.purpose,
    [t("reports.th_amount")]: r.amount,
    [t("reports.th_status")]: r.state === "not_requested" ? t("reports.state_not_requested") : t("reports.state_requested", { requestNo: r.requestNo ?? "" }),
    [t("reports.th_days")]: r.ageDays,
  })));

  add(t("reports.excel_delayed"), m.delayedDecisions.rows.map((r: any) => ({
    [t("reports.th_kind")]: DECISION_KEYS[r.kind] ? t(DECISION_KEYS[r.kind]) : r.kind,
    [t("reports.th_ref")]: r.ref,
    [t("reports.th_project")]: r.projectName,
    [t("reports.th_description")]: r.title,
    [t("reports.th_amount")]: r.amount,
    [t("reports.th_days")]: r.ageDays,
  })));

  add(t("reports.excel_by_project"), data.byProject.map((p: any) => ({
    [t("reports.th_project")]: p.projectName,
    [t("reports.th_open_originals")]: p.openBillRequests,
    [t("reports.overdue_count")]: p.overdueBillRequests,
    [t("reports.th_pending_approval")]: p.pendingOrdersAmount,
    [t("reports.th_approved_unpaid")]: p.approvedUnpaidAmount,
    [t("reports.th_paid")]: p.paidAmount,
    [t("reports.th_open_clearances")]: p.openClearances,
    [t("reports.kpi_clearances_attention")]: p.clearancesAttention,
    [t("reports.th_open_fines")]: p.openFinesCount,
    [t("reports.kpi_open_fines")]: p.openFinesAmount,
  })));

  add(t("reports.excel_bill_aging"), data.billRequestAging.map((b: any) => ({
    [t("reports.th_project")]: b.projectName,
    [t("reports.th_number")]: b.requestNo,
    [t("reports.th_payee")]: b.payeeName,
    [t("reports.th_status")]: enumLabelBilingual("bill_request", b.status),
    [t("reports.th_days")]: b.ageDays,
    [t("reports.th_due")]: b.dueDate ?? "",
    [t("reports.overdue_count")]: b.overdue ? t("common.yes") : "",
  })));

  add(t("reports.excel_clearances"), data.clearancesAttention.map((c: any) => ({
    [t("reports.th_project")]: c.projectName,
    [t("reports.th_item")]: c.title,
    [t("reports.th_authority")]: c.authority ?? "",
    [t("reports.th_status")]: enumLabelBilingual("permit_status", c.status),
    [t("reports.th_expiry_due")]: c.expiryDate ?? "",
    [t("reports.th_due")]: c.dueDate ?? "",
    [t("reports.th_reason")]: REASON_KEYS[c.reason] ? t(REASON_KEYS[c.reason]) : c.reason,
  })));

  add(t("reports.excel_fines"), data.openFines.map((f: any) => ({
    [t("reports.th_project")]: f.projectName,
    [t("reports.th_fine")]: f.title,
    [t("reports.th_authority")]: f.authority ?? "",
    [t("reports.th_liable")]: enumLabelBilingual("liable_party", f.liableParty),
    [t("reports.th_status")]: enumLabelBilingual("fine", f.status),
    [t("reports.th_remaining")]: f.amount,
    [t("reports.th_due")]: f.dueDate ?? "",
  })));

  add(t("reports.excel_sub_certs"), data.subcontractors.map((s: any) => ({
    [t("reports.th_project")]: s.projectName,
    [t("reports.th_subcontractor")]: s.subcontractorName,
    [t("reports.th_contract_value")]: s.contractValue,
    [t("reports.th_certified")]: s.certifiedGross,
    [t("reports.th_completion")]: s.contractValue > 0 ? Math.round((s.certifiedGross / s.contractValue) * 1000) / 10 : "",
    [t("reports.th_retention")]: s.retentionHeld,
    [t("reports.th_paid")]: s.paidNet,
    [t("reports.th_approved_unpaid")]: s.payableNet,
    [t("reports.kpi_sub_certs_count")]: s.certificates,
  })));

  add(t("reports.excel_po"), data.purchaseOrders.map((p: any) => ({
    [t("reports.th_project")]: p.projectName,
    [t("reports.th_po")]: p.poNumber,
    [t("reports.th_supplier")]: p.supplierName ?? "",
    [t("reports.th_value")]: p.value,
    [t("reports.th_invoiced")]: p.invoiced,
    [t("reports.th_orders")]: p.ordered,
    [t("reports.th_paid")]: p.paid,
    [t("reports.po_advances_of")]: p.advances,
    [t("reports.th_remaining")]: p.remaining,
    [t("reports.th_status")]: p.over ? t("reports.po_over") : t("reports.po_within"),
  })));

  add(t("reports.excel_monthly"), data.monthlyPaid.map((m: any) => ({
    [t("common.date")]: m.month,
    [t("reports.th_amount")]: m.amount,
  })));

  XLSX.writeFile(wb, `payments-report-${new Date().toISOString().split("T")[0]}.xlsx`);
}
