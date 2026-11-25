// Excel import/export and bilingual Printable IPC Statement for Subcontractor BOQ & Certificates
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
import {
  computeBoqContractAmount,
  roundMoney,
  roundQty,
  type BoqBillingMode,
  type BoqValuationSummary,
  type CertificateBoqLineDto,
  type ContractBoqItemDto,
} from "@shared/subcontractor-boq";
import { enumLabelBilingual } from "@shared/i18n";
import { fmtDate, money } from "./payments-common";

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const fmtNum = (v: number, dp = 2) =>
  Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

const fmtQty = (v: number) =>
  Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const fmtPct = (v: number) =>
  `${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;

// ---- 1. Contract BOQ Excel Template ----
export async function downloadContractBoqTemplate(isAr: boolean) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(isAr ? "نموذج جدول الكميات" : "BOQ Template", {
    views: [{ rightToLeft: isAr, state: "frozen", ySplit: 1 }],
  });

  const headers = isAr
    ? ["رقم البند", "القسم / التصنيف", "كود التكلفة", "وصف البند", "الوحدة", "طريقة الحساب (qty / progress)", "كمية العقد", "سعر الوحدة", "أمر تغيير (نعم/لا)", "مرجع أمر التغيير", "ملاحظات"]
    : ["Item Code", "Section", "Cost Code", "Description", "Unit", "Billing Mode (qty / progress)", "Contract Qty", "Unit Rate", "Is Variation (yes/no)", "VO Ref", "Notes"];

  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD0D7DE" } },
      bottom: { style: "thin", color: { argb: "FFD0D7DE" } },
      left: { style: "thin", color: { argb: "FFD0D7DE" } },
      right: { style: "thin", color: { argb: "FFD0D7DE" } },
    };
  });
  headerRow.height = 28;

  // Sample rows illustrating both Progress % (Lump Sum) and Qty-based (Re-measured) items + Variation
  const samples = isAr
    ? [
        ["1.1", "الأعمال التمهيدية", "WBS-01", "تجهيز الموقع والرسومات التنفيذية", "LS", "progress", 1, 50000, "لا", "", "احتساب بنسبة الإنجاز"],
        ["2.1", "الأعمال المدنية", "WBS-02", "توريد وصب خرسانة مسلحة للقواعد", "m³", "qty", 250, 420, "لا", "", "احتساب بالكميات (سابق وحالي)"],
        ["2.2", "الأعمال المدنية", "WBS-02", "أعمال اللياسة الداخلية للواجهات", "m²", "qty", 1200, 35, "لا", "", ""],
        ["VO-01", "أوامر التغيير", "VO-01", "أعمال إضافية لعزل السطح", "m²", "qty", 180, 65, "نعم", "VO-01", "ملحق عقد رقم 1"],
      ]
    : [
        ["1.1", "Preliminaries", "WBS-01", "Mobilization & Shop Drawings", "LS", "progress", 1, 50000, "no", "", "Billed by progress %"],
        ["2.1", "Civil Works", "WBS-02", "Supply & Pour Reinforced Concrete Footings", "m³", "qty", 250, 420, "no", "", "Measured by Previous vs Current Qty"],
        ["2.2", "Civil Works", "WBS-02", "Internal Wall Plastering", "m²", "qty", 1200, 35, "no", "", ""],
        ["VO-01", "Variations", "VO-01", "Additional Roof Waterproofing Works", "m²", "qty", 180, 65, "yes", "VO-01", "Variation Order #1"],
      ];

  for (const s of samples) {
    const r = ws.addRow(s);
    r.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  }

  ws.columns = [
    { width: 14 }, { width: 22 }, { width: 14 }, { width: 42 }, { width: 10 },
    { width: 24 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 28 },
  ];

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), isAr ? "نموذج_جدول_الكميات.xlsx" : "Contract_BOQ_Template.xlsx");
}

// ---- 2. Export Contract BOQ to Excel ----
export async function exportContractBoqExcel(
  contract: { contractNo: string; title: string; subcontractorName?: string },
  items: ContractBoqItemDto[],
  isAr: boolean,
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(isAr ? "جدول كميات العقد" : "Contract BOQ", {
    views: [{ rightToLeft: isAr, state: "frozen", ySplit: 4 }],
  });

  ws.mergeCells("A1:L1");
  const titleCell = ws.getCell("A1");
  titleCell.value = isAr
    ? `جدول كميات العقد — ${contract.contractNo} — ${contract.title}`
    : `Contract Bill of Quantities — ${contract.contractNo} — ${contract.title}`;
  titleCell.font = { bold: true, size: 14, color: { argb: "FF1E3A5F" } };
  titleCell.alignment = { vertical: "middle", horizontal: isAr ? "right" : "left" };
  ws.getRow(1).height = 28;

  ws.mergeCells("A2:L2");
  ws.getCell("A2").value = contract.subcontractorName
    ? `${isAr ? "مقاول الباطن:" : "Subcontractor:"} ${contract.subcontractorName}`
    : "";
  ws.getCell("A2").font = { size: 11, color: { argb: "FF475569" } };
  ws.addRow([]);

  const headers = isAr
    ? ["رقم البند", "القسم", "كود التكلفة", "الوصف", "الوحدة", "طريقة الحساب", "كمية العقد", "سعر الوحدة", "إجمالي العقد", "أمر تغيير", "مرجع VO", "المنجز المعتمد %"]
    : ["Item Code", "Section", "Cost Code", "Description", "Unit", "Billing Mode", "Contract Qty", "Unit Rate", "Contract Amount", "Scope", "VO Ref", "Certified %"];

  const hRow = ws.addRow(headers);
  hRow.height = 26;
  hRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  let origTotal = 0;
  let voTotal = 0;

  for (const it of items) {
    const amt = computeBoqContractAmount(it.contractQty, it.unitRate);
    if (it.isVariation) voTotal += amt;
    else origTotal += amt;

    const r = ws.addRow([
      it.itemCode,
      it.section ?? "",
      it.costCode ?? "",
      it.description,
      it.unit,
      it.billingMode === "progress" ? (isAr ? "نسبة إنجاز %" : "Progress %") : (isAr ? "كميات" : "Qty"),
      Number(it.contractQty || 0),
      Number(it.unitRate || 0),
      amt,
      it.isVariation ? (isAr ? "أمر تغيير" : "Variation") : (isAr ? "أساسي" : "Original"),
      it.variationRef ?? "",
      Number(it.certifiedPercent || 0) / 100,
    ]);
    r.getCell(7).numFmt = "#,##0.####";
    r.getCell(8).numFmt = "#,##0.00";
    r.getCell(9).numFmt = "#,##0.00";
    r.getCell(12).numFmt = "0.00%";
    if (it.isVariation) {
      r.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F9FF" } };
      });
    }
  }

  ws.addRow([]);
  const addTotalRow = (label: string, val: number, bold = true, bg = "FFF1F5F9") => {
    const r = ws.addRow(["", "", "", label, "", "", "", "", roundMoney(val), "", "", ""]);
    r.eachCell((c) => {
      c.font = { bold, size: 11 };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    });
    r.getCell(9).numFmt = "#,##0.00";
  };
  addTotalRow(isAr ? "إجمالي بنود العقد الأساسية" : "Original Scope Total", origTotal);
  if (voTotal > 0) addTotalRow(isAr ? "إجمالي أوامر التغيير (VO)" : "Variations (VO) Total", voTotal);
  addTotalRow(isAr ? "الإجمالي المعدّل للعقد" : "Revised Contract Total", roundMoney(origTotal + voTotal), true, "FFDBEAFE");

  ws.columns = [
    { width: 14 }, { width: 20 }, { width: 14 }, { width: 42 }, { width: 10 },
    { width: 14 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 },
  ];

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${contract.contractNo}_BOQ.xlsx`);
}

// ---- 3. Parse Uploaded Excel into Contract BOQ Rows ----
export async function parseContractBoqExcel(
  file: File,
  defaultBillingMode: BoqBillingMode,
): Promise<{ items: ContractBoqItemDto[]; warnings: string[] }> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { items: [], warnings: ["No worksheet found in file"] };
  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const normalizeKey = (k: string) => k.trim().toLowerCase().replace(/[\s_\-()/%]+/g, "");
  const pick = (row: Record<string, unknown>, candidates: string[]): string => {
    for (const [k, v] of Object.entries(row)) {
      const nk = normalizeKey(k);
      if (candidates.some((c) => nk === c || nk.includes(c))) {
        const s = String(v ?? "").trim();
        if (s !== "") return s;
      }
    }
    return "";
  };

  const toNum = (s: string, fallback = 0) => {
    const cleaned = s.replace(/[,،\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : fallback;
  };

  const items: ContractBoqItemDto[] = [];
  const warnings: string[] = [];

  rawRows.forEach((raw, idx) => {
    const desc = pick(raw, ["description", "desc", "itemname", "الوصف", "وصفالبند", "البيان", "البند"]);
    if (!desc) return; // skip blank or subtotal lines without description

    const itemCode = pick(raw, ["itemcode", "itemno", "code", "رقمالبند", "الكود", "الرقم"]) || `${items.length + 1}`;
    const section = pick(raw, ["section", "group", "division", "category", "القسم", "التصنيف", "الباب"]) || null;
    const costCode = pick(raw, ["costcode", "wbs", "كودالتكلفة", "رمزالتكلفة"]) || null;
    const unit = pick(raw, ["unit", "uom", "الوحدة", "وحدةالقياس"]) || "LS";
    const modeRaw = pick(raw, ["billingmode", "mode", "type", "طريقةالحساب", "نوعالاحتساب"]).toLowerCase();
    let billingMode: BoqBillingMode = defaultBillingMode;
    if (modeRaw.includes("progress") || modeRaw.includes("%") || modeRaw.includes("نسبة") || modeRaw.includes("انجاز") || modeRaw.includes("إنجاز") || modeRaw === "ls") {
      billingMode = "progress";
    } else if (modeRaw.includes("qty") || modeRaw.includes("quantity") || modeRaw.includes("كمي")) {
      billingMode = "qty";
    } else if (unit.toUpperCase() === "LS" || unit === "مقطوعية") {
      billingMode = "progress";
    }

    const qtyRaw = pick(raw, ["contractqty", "qty", "quantity", "كميةالعقد", "الكمية"]);
    const rateRaw = pick(raw, ["unitrate", "rate", "unitprice", "price", "سعرالوحدة", "السعر", "الفئة"]);
    const totalRaw = pick(raw, ["contractamount", "totalamount", "total", "amount", "الإجمالي", "الاجمالي", "قيمةالبند"]);

    let contractQty = qtyRaw ? Math.max(0, roundQty(toNum(qtyRaw, 1))) : 1;
    let unitRate = rateRaw ? Math.max(0, roundMoney(toNum(rateRaw, 0))) : 0;
    if (unitRate === 0 && totalRaw) {
      const parsedTotal = Math.max(0, roundMoney(toNum(totalRaw, 0)));
      if (contractQty > 0) unitRate = roundMoney(parsedTotal / contractQty);
      else {
        contractQty = 1;
        unitRate = parsedTotal;
      }
    }

    const voRaw = pick(raw, ["isvariation", "variation", "scope", "أمرالتغيير", "امرتغيير", "أوامرالتغيير"]).toLowerCase();
    const variationRef = pick(raw, ["voref", "variationref", "مرجعأمرالتغيير", "مرجعvo"]) || null;
    const isVariation =
      Boolean(variationRef) ||
      ["yes", "true", "1", "vo", "variation", "نعم", "أمر تغيير", "تغيير", "إضافي"].some((tok) => voRaw.includes(tok));
    const notes = pick(raw, ["notes", "note", "remarks", "ملاحظات"]) || null;

    if (unitRate === 0) {
      warnings.push(`Row ${idx + 2} (${itemCode}): unit rate is 0`);
    }

    items.push({
      sortOrder: items.length,
      section,
      itemCode,
      costCode,
      description: desc,
      unit,
      billingMode,
      contractQty,
      unitRate,
      contractAmount: computeBoqContractAmount(contractQty, unitRate),
      isVariation,
      variationRef: isVariation ? variationRef : null,
      notes,
    });
  });

  return { items, warnings };
}

// ---- 4. Export Subcontractor Certificate + BOQ Valuation to Excel ----
export interface CertExportMeta {
  certNo: string;
  projectName: string;
  subcontractorName: string;
  contractNo?: string | null;
  contractTitle?: string | null;
  scope?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  status: string;
  contractValue: number;
  grossAmount: number;
  retentionPercent: number;
  retentionAmount: number;
  advanceRecovery: number;
  otherDeductions: number;
  chargebackDeductions: number;
  vatPercent: number;
  vatAmount: number;
  netPayable: number;
  previousGross?: number;
  cumulativeGross?: number;
  createdByName?: string | null;
  approvedByName?: string | null;
}

export async function exportCertificateBoqExcel(
  meta: CertExportMeta,
  lines: CertificateBoqLineDto[],
  summary: BoqValuationSummary | null,
  isAr: boolean,
) {
  const wb = new ExcelJS.Workbook();

  // Sheet 1: Financial Summary
  const wsSummary = wb.addWorksheet(isAr ? "ملخص المستخلص" : "IPC Summary", {
    views: [{ rightToLeft: isAr }],
  });
  wsSummary.mergeCells("A1:D1");
  wsSummary.getCell("A1").value = isAr
    ? `مستخلص مقاول باطن — ${meta.certNo}`
    : `Subcontractor Interim Payment Certificate — ${meta.certNo}`;
  wsSummary.getCell("A1").font = { bold: true, size: 15, color: { argb: "FF1E3A5F" } };
  wsSummary.getRow(1).height = 30;

  const infoRows: [string, string | number][] = [
    [isAr ? "المشروع" : "Project", meta.projectName],
    [isAr ? "مقاول الباطن" : "Subcontractor", meta.subcontractorName],
    [isAr ? "العقد" : "Contract", meta.contractNo ? `${meta.contractNo}${meta.contractTitle ? ` — ${meta.contractTitle}` : ""}` : "—"],
    [isAr ? "نطاق العمل" : "Scope of Work", meta.scope || "—"],
    [isAr ? "الفترة" : "Valuation Period", `${fmtDate(meta.periodFrom)} → ${fmtDate(meta.periodTo)}`],
    [isAr ? "الحالة" : "Status", enumLabelBilingual("sub_cert", meta.status)],
  ];
  infoRows.forEach(([k, v]) => {
    const r = wsSummary.addRow([k, v]);
    r.getCell(1).font = { bold: true };
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  });

  wsSummary.addRow([]);
  const finHeader = wsSummary.addRow([isAr ? "البيان المالي" : "Financial Line", isAr ? "المبلغ" : "Amount"]);
  finHeader.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  });

  const finRows: [string, number, boolean?][] = [
    [isAr ? "قيمة العقد الأصلية" : "Original Contract Value", summary ? summary.originalContractTotal : meta.contractValue],
    ...(summary && summary.variationsTotal > 0 ? ([[isAr ? "أوامر التغيير (VO)" : "Variations (VO)", summary.variationsTotal]] as [string, number][]) : []),
    [isAr ? "إجمالي قيمة العقد المعدّلة" : "Revised Contract Value", summary ? summary.revisedContractTotal : meta.contractValue, true],
    [isAr ? "الأعمال المعتمدة سابقاً" : "Previous Certified Work", summary ? summary.previousTotal : Number(meta.previousGross || 0)],
    [isAr ? "قيمة الأعمال للفترة الحالية (إجمالي المستخلص)" : "Current Period Work Value (Gross)", meta.grossAmount, true],
    [isAr ? "الأعمال التراكمية حتى تاريخه" : "Cumulative Certified to Date", summary ? summary.cumulativeTotal : Number(meta.cumulativeGross || meta.grossAmount)],
    [isAr ? `(-) ضمان حسن التنفيذ (${meta.retentionPercent}%)` : `(-) Retention (${meta.retentionPercent}%)`, -meta.retentionAmount],
    [isAr ? "(-) استرداد الدفعة المقدمة" : "(-) Advance Recovery", -meta.advanceRecovery],
    [isAr ? "(-) خصومات أخرى" : "(-) Other Deductions", -meta.otherDeductions],
    [isAr ? "(-) تحميل فواتير وغرامات" : "(-) Chargebacks & Fines", -meta.chargebackDeductions],
    [isAr ? `(+) ضريبة القيمة المضافة (${meta.vatPercent}%)` : `(+) VAT (${meta.vatPercent}%)`, meta.vatAmount],
    [isAr ? "(=) الصافي المستحق للصرف" : "(=) Net Payable Amount", meta.netPayable, true],
  ];

  finRows.forEach(([label, val, bold], idx) => {
    const r = wsSummary.addRow([label, roundMoney(val)]);
    r.getCell(2).numFmt = "#,##0.00";
    if (bold) {
      r.eachCell((c) => {
        c.font = { bold: true };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: idx === finRows.length - 1 ? "FFDBEAFE" : "FFF8FAFC" } };
      });
    }
  });
  wsSummary.columns = [{ width: 42 }, { width: 28 }, { width: 18 }, { width: 18 }];

  // Sheet 2: Detailed BOQ Valuation Schedule
  if (lines.length > 0 && summary) {
    const ws = wb.addWorksheet(isAr ? "جدول كميات المستخلص" : "BOQ Valuation", {
      views: [{ rightToLeft: isAr, state: "frozen", ySplit: 2 }],
    });

    ws.mergeCells("A1:P1");
    ws.getCell("A1").value = isAr
      ? `جدول حصر وتقييم الأعمال — ${meta.certNo} — ${meta.subcontractorName}`
      : `BOQ Valuation Schedule — ${meta.certNo} — ${meta.subcontractorName}`;
    ws.getCell("A1").font = { bold: true, size: 13, color: { argb: "FF1E3A5F" } };
    ws.getRow(1).height = 26;

    const cols = isAr
      ? [
          "رقم البند", "القسم", "الوصف", "الوحدة", "الطريقة",
          "كمية العقد", "السعر", "قيمة العقد",
          "سابق (كمية/%)", "حالي (كمية/%)", "تراكمي (كمية/%)",
          "قيمة سابقة", "قيمة حالية", "قيمة تراكمية", "المتبقي", "نسبة الإنجاز %",
        ]
      : [
          "Item #", "Section", "Description", "Unit", "Mode",
          "Contract Qty", "Unit Rate", "Contract Amt",
          "Previous", "Current", "Cumulative",
          "Previous Amt", "Current Amt", "Cumulative Amt", "Remaining Amt", "% Done",
        ];

    const hr = ws.addRow(cols);
    hr.height = 26;
    hr.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });

    for (const l of lines) {
      const isPct = l.billingMode === "progress";
      const rem = roundMoney(l.contractAmount - l.cumulativeAmount);
      const r = ws.addRow([
        l.itemCode,
        l.section ?? "",
        l.isVariation && l.variationRef ? `[${l.variationRef}] ${l.description}` : l.description,
        l.unit,
        isPct ? (isAr ? "نسبة %" : "Progress %") : (isAr ? "كميات" : "Qty"),
        Number(l.contractQty),
        Number(l.unitRate),
        Number(l.contractAmount),
        isPct ? Number(l.previousPercent) / 100 : Number(l.previousQty),
        isPct ? Number(l.currentPercent) / 100 : Number(l.currentQty),
        isPct ? Number(l.cumulativePercent) / 100 : Number(l.cumulativeQty),
        Number(l.previousAmount),
        Number(l.currentAmount),
        Number(l.cumulativeAmount),
        rem,
        Number(l.cumulativePercent) / 100,
      ]);

      r.getCell(6).numFmt = "#,##0.####";
      r.getCell(7).numFmt = "#,##0.00";
      r.getCell(8).numFmt = "#,##0.00";
      const valFmt = isPct ? "0.00%" : "#,##0.####";
      r.getCell(9).numFmt = valFmt;
      r.getCell(10).numFmt = valFmt;
      r.getCell(11).numFmt = valFmt;
      r.getCell(12).numFmt = "#,##0.00";
      r.getCell(13).numFmt = "#,##0.00";
      r.getCell(14).numFmt = "#,##0.00";
      r.getCell(15).numFmt = "#,##0.00";
      r.getCell(16).numFmt = "0.00%";
      r.getCell(13).font = { bold: true, color: { argb: "FF1D4ED8" } };
    }

    const addSummaryRow = (label: string, cAmt: number, pAmt: number, curAmt: number, cumAmt: number, bg: string) => {
      const r = ws.addRow([
        "", "", label, "", "", "", "", cAmt, "", "", "", pAmt, curAmt, cumAmt, roundMoney(cAmt - cumAmt),
        cAmt > 0 ? cumAmt / cAmt : 0,
      ]);
      r.eachCell((c) => {
        c.font = { bold: true, size: 10 };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      });
      [8, 12, 13, 14, 15].forEach((idx) => (r.getCell(idx).numFmt = "#,##0.00"));
      r.getCell(16).numFmt = "0.00%";
    };

    if (summary.variationsTotal > 0) {
      addSummaryRow(isAr ? "مجموع بنود العقد الأساسية" : "Original Scope Subtotal", summary.originalContractTotal, summary.originalPreviousTotal, summary.originalCurrentTotal, summary.originalCumulativeTotal, "FFF8FAFC");
      addSummaryRow(isAr ? "مجموع أوامر التغيير (VO)" : "Variations (VO) Subtotal", summary.variationsTotal, summary.variationsPreviousTotal, summary.variationsCurrentTotal, summary.variationsCumulativeTotal, "FFF0F9FF");
    }
    addSummaryRow(isAr ? "الإجمالي العام — قيمة الأعمال للمستخلص" : "GRAND TOTAL — Certificate Work Value", summary.revisedContractTotal, summary.previousTotal, summary.currentTotal, summary.cumulativeTotal, "FFDBEAFE");

    ws.columns = [
      { width: 12 }, { width: 18 }, { width: 38 }, { width: 9 }, { width: 11 },
      { width: 12 }, { width: 12 }, { width: 15 },
      { width: 13 }, { width: 13 }, { width: 13 },
      { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 12 },
    ];
  }

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${meta.certNo}_IPC_BOQ.xlsx`);
}

// ---- 5. Bilingual Printable IPC Valuation Statement ----
export function printSubcontractorCertificate(
  meta: CertExportMeta,
  lines: CertificateBoqLineDto[],
  summary: BoqValuationSummary | null,
  isAr: boolean,
) {
  const w = window.open("", "_blank", "width=1200,height=900");
  if (!w) return;

  const dir = isAr ? "rtl" : "ltr";
  const alignEnd = isAr ? "left" : "right";
  const statusLabel = enumLabelBilingual("sub_cert", meta.status);

  // Group lines by section for clean visual display
  const groups: { section: string; lines: CertificateBoqLineDto[] }[] = [];
  const secIndex = new Map<string, number>();
  for (const l of lines) {
    const sec = (l.section ?? "").trim();
    if (!secIndex.has(sec)) {
      secIndex.set(sec, groups.length);
      groups.push({ section: sec, lines: [] });
    }
    groups[secIndex.get(sec)!].lines.push(l);
  }

  const hasMultipleSections = groups.length > 1 || (groups.length === 1 && groups[0].section !== "");

  const boqRowsHtml = groups
    .map((g) => {
      const secHeader =
        hasMultipleSections && g.section
          ? `<tr class="sec-row"><td colspan="14">${esc(g.section)}</td></tr>`
          : "";
      const rows = g.lines
        .map((l) => {
          const isPct = l.billingMode === "progress";
          const rem = roundMoney(l.contractAmount - l.cumulativeAmount);
          const isOver = !isPct && l.contractQty > 0 && l.cumulativeQty > l.contractQty + 0.0001;
          return `<tr class="${l.isVariation ? "vo-row" : ""}">
            <td class="mono">${esc(l.itemCode)}</td>
            <td>${esc(l.description)}${l.isVariation ? ` <span class="badge-vo">${esc(l.variationRef || "VO")}</span>` : ""}</td>
            <td class="center">${esc(l.unit)}</td>
            <td class="center">${isPct ? "%" : isAr ? "كمية" : "Qty"}</td>
            <td class="num">${fmtQty(l.contractQty)}</td>
            <td class="num">${fmtNum(l.unitRate)}</td>
            <td class="num bold">${fmtNum(l.contractAmount)}</td>
            <td class="num muted">${isPct ? fmtPct(l.previousPercent) : fmtQty(l.previousQty)}</td>
            <td class="num bold">${isPct ? fmtPct(l.currentPercent) : fmtQty(l.currentQty)}</td>
            <td class="num ${isOver ? "warn" : ""}">${isPct ? fmtPct(l.cumulativePercent) : fmtQty(l.cumulativeQty)}</td>
            <td class="num muted">${fmtNum(l.previousAmount)}</td>
            <td class="num bold primary">${fmtNum(l.currentAmount)}</td>
            <td class="num">${fmtNum(l.cumulativeAmount)}</td>
            <td class="num">${fmtNum(rem)}</td>
          </tr>`;
        })
        .join("");

      if (hasMultipleSections && g.section) {
        const sContract = roundMoney(g.lines.reduce((s, x) => s + x.contractAmount, 0));
        const sPrev = roundMoney(g.lines.reduce((s, x) => s + x.previousAmount, 0));
        const sCur = roundMoney(g.lines.reduce((s, x) => s + x.currentAmount, 0));
        const sCum = roundMoney(g.lines.reduce((s, x) => s + x.cumulativeAmount, 0));
        const subRow = `<tr class="sub-row">
          <td colspan="6">${isAr ? `مجموع القسم: ${esc(g.section)}` : `Subtotal: ${esc(g.section)}`}</td>
          <td class="num bold">${fmtNum(sContract)}</td>
          <td colspan="3"></td>
          <td class="num">${fmtNum(sPrev)}</td>
          <td class="num bold primary">${fmtNum(sCur)}</td>
          <td class="num">${fmtNum(sCum)}</td>
          <td class="num">${fmtNum(roundMoney(sContract - sCum))}</td>
        </tr>`;
        return secHeader + rows + subRow;
      }
      return secHeader + rows;
    })
    .join("");

  const boqSectionHtml =
    lines.length > 0 && summary
      ? `<h2>${isAr ? "جدول الكميات وحصر الأعمال (BOQ Valuation)" : "Bill of Quantities (BOQ) Valuation Schedule"}</h2>
         <table>
           <thead>
             <tr>
               <th>${isAr ? "البند" : "Item"}</th>
               <th>${isAr ? "الوصف" : "Description"}</th>
               <th>${isAr ? "الوحدة" : "Unit"}</th>
               <th>${isAr ? "النوع" : "Mode"}</th>
               <th>${isAr ? "كمية العقد" : "Contract Qty"}</th>
               <th>${isAr ? "السعر" : "Rate"}</th>
               <th>${isAr ? "قيمة العقد" : "Contract Amt"}</th>
               <th>${isAr ? "السابق" : "Previous"}</th>
               <th>${isAr ? "الحالي" : "Current"}</th>
               <th>${isAr ? "التراكمي" : "Cumulative"}</th>
               <th>${isAr ? "قيمة سابقة" : "Prev Amt"}</th>
               <th>${isAr ? "قيمة حالية" : "Current Amt"}</th>
               <th>${isAr ? "قيمة تراكمية" : "Cum Amt"}</th>
               <th>${isAr ? "المتبقي" : "Remaining"}</th>
             </tr>
           </thead>
           <tbody>${boqRowsHtml}</tbody>
           <tfoot>
             ${
               summary.variationsTotal > 0
                 ? `<tr class="sub-row"><td colspan="6">${isAr ? "مجموع بنود العقد الأساسية" : "Original Scope Subtotal"}</td><td class="num">${fmtNum(summary.originalContractTotal)}</td><td colspan="3"></td><td class="num">${fmtNum(summary.originalPreviousTotal)}</td><td class="num">${fmtNum(summary.originalCurrentTotal)}</td><td class="num">${fmtNum(summary.originalCumulativeTotal)}</td><td class="num">${fmtNum(roundMoney(summary.originalContractTotal - summary.originalCumulativeTotal))}</td></tr>
                    <tr class="vo-row"><td colspan="6">${isAr ? "مجموع أوامر التغيير (VO)" : "Variations (VO) Subtotal"}</td><td class="num">${fmtNum(summary.variationsTotal)}</td><td colspan="3"></td><td class="num">${fmtNum(summary.variationsPreviousTotal)}</td><td class="num">${fmtNum(summary.variationsCurrentTotal)}</td><td class="num">${fmtNum(summary.variationsCumulativeTotal)}</td><td class="num">${fmtNum(roundMoney(summary.variationsTotal - summary.variationsCumulativeTotal))}</td></tr>`
                 : ""
             }
             <tr class="grand-row">
               <td colspan="6">${isAr ? "الإجمالي العام — قيمة الأعمال للفترة الحالية" : "GRAND TOTAL — Current Certificate Work Value"}</td>
               <td class="num">${fmtNum(summary.revisedContractTotal)}</td>
               <td colspan="3" class="center">${fmtPct(summary.overallProgressPercent)}</td>
               <td class="num">${fmtNum(summary.previousTotal)}</td>
               <td class="num primary">${fmtNum(summary.currentTotal)}</td>
               <td class="num">${fmtNum(summary.cumulativeTotal)}</td>
               <td class="num">${fmtNum(summary.remainingTotal)}</td>
             </tr>
           </tfoot>
         </table>`
      : "";

  w.document.write(`<!doctype html><html dir="${dir}"><head><meta charset="utf-8">
<title>${esc(meta.certNo)} — ${isAr ? "مستخلص مقاول باطن" : "Subcontractor IPC"}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: Arial, Tahoma, sans-serif; color: #0f172a; margin: 0; padding: 18px; font-size: 11px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; margin-bottom: 14px; }
  .header h1 { margin: 0 0 4px; font-size: 18px; color: #1e3a5f; }
  .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; margin-bottom: 14px; }
  .meta-item label { display: block; font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; }
  .meta-item span { font-weight: 700; font-size: 11px; }
  h2 { font-size: 13px; color: #1e3a5f; margin: 14px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 6px; }
  th { background: #1e3a5f; color: #fff; font-size: 10px; font-weight: 700; text-align: center; }
  .num { text-align: ${alignEnd}; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .center { text-align: center; }
  .mono { font-family: monospace; font-weight: 700; }
  .bold { font-weight: 700; }
  .muted { color: #64748b; }
  .primary { color: #1d4ed8; }
  .warn { color: #b45309; font-weight: 700; }
  .sec-row td { background: #e2e8f0; font-weight: 700; color: #1e293b; }
  .sub-row td { background: #f8fafc; font-weight: 700; }
  .vo-row td { background: #f0f9ff; }
  .grand-row td { background: #dbeafe; font-weight: 800; font-size: 11.5px; border-top: 2px solid #1e3a5f; }
  .badge-vo { display: inline-block; background: #0284c7; color: #fff; font-size: 9px; padding: 1px 4px; border-radius: 3px; font-weight: 700; }
  .fin-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; page-break-inside: avoid; }
  .fin-table td:first-child { background: #f8fafc; font-weight: 600; width: 65%; }
  .net-row td { background: #dbeafe !important; font-weight: 800; font-size: 13px; color: #1e3a5f; }
  .sigs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-top: 36px; page-break-inside: avoid; }
  .sig-box { border-top: 1px solid #334155; padding-top: 6px; text-align: center; font-weight: 700; font-size: 11px; }
  .sig-sub { font-weight: 400; font-size: 9.5px; color: #64748b; margin-top: 2px; }
</style></head><body>
  <div class="header">
    <div>
      <h1>${isAr ? "مستخلص مقاول باطن (شهادة دفع مرحلية)" : "Subcontractor Interim Payment Certificate (IPC)"}</h1>
      <div>${esc(meta.projectName)}</div>
    </div>
    <div style="text-align:${alignEnd}">
      <div class="mono" style="font-size:16px;color:#1e3a5f">${esc(meta.certNo)}</div>
      <div style="color:#475569">${esc(statusLabel)}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item"><label>${isAr ? "مقاول الباطن" : "Subcontractor"}</label><span>${esc(meta.subcontractorName)}</span></div>
    <div class="meta-item"><label>${isAr ? "رقم العقد" : "Contract"}</label><span>${esc(meta.contractNo ? `${meta.contractNo} — ${meta.contractTitle ?? ""}` : "—")}</span></div>
    <div class="meta-item"><label>${isAr ? "فترة المستخلص" : "Period"}</label><span>${esc(fmtDate(meta.periodFrom))} → ${esc(fmtDate(meta.periodTo))}</span></div>
    <div class="meta-item"><label>${isAr ? "قيمة العقد" : "Contract Value"}</label><span>${esc(money(summary ? summary.revisedContractTotal : meta.contractValue))}</span></div>
  </div>

  ${boqSectionHtml}

  <div class="fin-wrap">
    <div>
      <h2>${isAr ? "الملخص التراكمي للعقد" : "Cumulative Contract Position"}</h2>
      <table class="fin-table">
        <tr><td>${isAr ? "قيمة العقد الأصلية" : "Original Contract Value"}</td><td class="num">${esc(money(summary ? summary.originalContractTotal : meta.contractValue))}</td></tr>
        ${summary && summary.variationsTotal > 0 ? `<tr><td>${isAr ? "أوامر التغيير (VO)" : "Variations (VO)"}</td><td class="num">${esc(money(summary.variationsTotal))}</td></tr>` : ""}
        <tr><td>${isAr ? "إجمالي قيمة العقد المعدّلة" : "Revised Contract Value"}</td><td class="num bold">${esc(money(summary ? summary.revisedContractTotal : meta.contractValue))}</td></tr>
        <tr><td>${isAr ? "المعتمد سابقاً" : "Previously Certified"}</td><td class="num">${esc(money(summary ? summary.previousTotal : Number(meta.previousGross || 0)))}</td></tr>
        <tr><td>${isAr ? "قيمة الأعمال الحالية" : "Current Work Value"}</td><td class="num bold primary">${esc(money(meta.grossAmount))}</td></tr>
        <tr><td>${isAr ? "الإجمالي التراكمي حتى تاريخه" : "Cumulative Certified to Date"}</td><td class="num bold">${esc(money(summary ? summary.cumulativeTotal : Number(meta.cumulativeGross || meta.grossAmount)))}</td></tr>
      </table>
    </div>
    <div>
      <h2>${isAr ? "احتساب صافي المستحق للمستخلص الحالي" : "Current Certificate Net Payable"}</h2>
      <table class="fin-table">
        <tr><td>${isAr ? "قيمة الأعمال للفترة الحالية" : "Gross Work Value (Current Period)"}</td><td class="num bold">${esc(money(meta.grossAmount))}</td></tr>
        <tr><td>${isAr ? `(−) ضمان حسن التنفيذ (${meta.retentionPercent}%)` : `(−) Retention (${meta.retentionPercent}%)`}</td><td class="num">− ${esc(money(meta.retentionAmount))}</td></tr>
        <tr><td>${isAr ? "(−) استرداد الدفعة المقدمة" : "(−) Advance Recovery"}</td><td class="num">− ${esc(money(meta.advanceRecovery))}</td></tr>
        <tr><td>${isAr ? "(−) خصومات أخرى وتحميل فواتير" : "(−) Deductions & Chargebacks"}</td><td class="num">− ${esc(money(roundMoney(meta.otherDeductions + meta.chargebackDeductions)))}</td></tr>
        <tr><td>${isAr ? `(+) ضريبة القيمة المضافة (${meta.vatPercent}%)` : `(+) VAT (${meta.vatPercent}%)`}</td><td class="num">+ ${esc(money(meta.vatAmount))}</td></tr>
        <tr class="net-row"><td>${isAr ? "(=) الصافي المستحق للصرف" : "(=) Net Payable"}</td><td class="num">${esc(money(meta.netPayable))}</td></tr>
      </table>
    </div>
  </div>

  <div class="sigs">
    <div class="sig-box">${isAr ? "مهندس الموقع / المهندس المشرف" : "Senior / Site Engineer"}<div class="sig-sub">${esc(meta.createdByName || "")}</div></div>
    <div class="sig-box">${isAr ? "مهندس حصر الكميات (QS)" : "Quantity Surveyor (QS)"}<div class="sig-sub">&nbsp;</div></div>
    <div class="sig-box">${isAr ? "مدير المشروع" : "Project Manager"}<div class="sig-sub">${esc(meta.approvedByName || "")}</div></div>
    <div class="sig-box">${isAr ? "الإدارة المالية / المحاسبة" : "Finance / Accounting"}<div class="sig-sub">&nbsp;</div></div>
  </div>

  <script>window.onload=function(){window.print()}</script>
</body></html>`);
  w.document.close();
}
