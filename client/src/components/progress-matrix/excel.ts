// Excel import/export for the progress matrix (ExcelJS + file-saver, same pattern as activity-table.tsx).
import ExcelJS from "exceljs";
// @ts-ignore
import { saveAs } from "file-saver";
import { format } from "date-fns";
import { CELL_LOCKED, phaseContributions, round, type MatrixPayloadNode } from "@shared/progress-matrix";
import type { MatrixModel, CellEntry } from "./use-progress-matrix";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const thin = { style: "thin" as const };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = border;
  });
}

async function save(workbook: ExcelJS.Workbook, name: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: XLSX_TYPE }), `${name}_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40);

// Plain value of a cell (formula results, rich text, hyperlinks).
function plain(v: ExcelJS.CellValue): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  const o = v as any;
  if ("result" in o) return plain(o.result);
  if ("richText" in o) return o.richText.map((t: any) => t.text).join("");
  if ("text" in o) return String(o.text);
  return null;
}
const text = (v: ExcelJS.CellValue) => { const p = plain(v); return p === null ? "" : String(p).trim(); };
const numberOrNull = (v: ExcelJS.CellValue) => {
  const p = plain(v);
  if (p === null || p === "") return null;
  const n = typeof p === "number" ? p : Number(String(p).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

async function loadFirstSheet(file: File) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const ws = workbook.worksheets[0];
  if (!ws) throw new Error("The file has no worksheet");
  return ws;
}

// ---------- Cost and ratio (same layout as the reference "Cost and ratio.xlsx") ----------

export async function exportCostAndRatioExcel(model: MatrixModel, projectName: string) {
  const { payload, summary } = model;
  const roots = summary.tree.roots as MatrixPayloadNode[];
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Cost and ratio");
  const fixed = ["Villa No", "Unit Cost", "Payment Ratio", "Pending Ratio", "Paid Ratio", "Payment Cost", "Pending Cost", "Paid Cost", "Remaining Cost"];

  // phase totals: Σ unit value × phase contribution
  const phaseTotals = roots.map(() => 0);
  const contributions = payload.units.map((_, u) => phaseContributions(summary, u));
  payload.units.forEach((unit, u) => {
    if (!unit.included) return;
    roots.forEach((r, i) => { phaseTotals[i] += (summary.unitValue[u] * (contributions[u][r.code] ?? 0)) / 100; });
  });
  const projectValue = summary.totalValue || 1;

  const row1 = ws.getRow(1);
  const row2 = ws.getRow(2);
  fixed.forEach((h, i) => {
    row1.getCell(i + 1).value = h;
    ws.mergeCells(1, i + 1, 2, i + 1);
  });
  roots.forEach((r, i) => {
    const col = fixed.length + 1 + i * 2;
    row1.getCell(col).value =
      `${r.code} : ${(r.nameEn || r.nameAr).toUpperCase()} - ${round(phaseTotals[i], 2).toFixed(2)} - (${((phaseTotals[i] / projectValue) * 100).toFixed(2)} %)`;
    ws.mergeCells(1, col, 1, col + 1);
    row2.getCell(col).value = "Amount";
    row2.getCell(col + 1).value = "%";
  });
  styleHeader(row1);
  styleHeader(row2);
  row1.height = 45;

  payload.units.forEach((unit, u) => {
    if (!unit.included) return;
    const f = model.financials(u);
    const values: (string | number)[] = [
      isNaN(Number(unit.label)) ? unit.label : Number(unit.label),
      round(f.value, 2), round(f.earnedPct, 2), round(f.pendingPct, 2), round(f.paidPct, 2),
      f.earnedAmount, f.pendingAmount, f.paidAmount, f.remainingAmount,
    ];
    roots.forEach((r) => {
      const pct = contributions[u][r.code] ?? 0;
      values.push(round((f.value * pct) / 100, 2), round(pct, 2));
    });
    const row = ws.addRow(values);
    row.eachCell((cell, col) => {
      cell.border = border;
      if (col > 1) cell.numFmt = "#,##0.00";
    });
  });

  const t = model.totals;
  const totalRow = ws.addRow(["Total", round(t.value, 2), "", "", "", round(t.earned, 2), round(t.pending, 2), round(t.paid, 2), round(t.remaining, 2),
    ...roots.flatMap((_, i) => [round(phaseTotals[i], 2), round((phaseTotals[i] / projectValue) * 100, 2)])]);
  totalRow.eachCell((cell, col) => { cell.font = { bold: true }; cell.border = border; if (col > 1) cell.numFmt = "#,##0.00"; });

  ws.columns.forEach((c, i) => { c.width = i === 0 ? 10 : i < fixed.length ? 15 : 16; });
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 2 }];
  await save(workbook, `Cost_and_ratio_${safeName(projectName)}`);
}

// Unit values import: any sheet with "Villa No" and "Unit Cost" headers in the first rows.
export async function readUnitValuesExcel(file: File, model: MatrixModel) {
  const ws = await loadFirstSheet(file);
  let headerRow = 0; let villaCol = 0; let costCol = 0;
  for (let r = 1; r <= Math.min(10, ws.rowCount) && !headerRow; r++) {
    ws.getRow(r).eachCell((cell, col) => {
      const h = text(cell.value).toLowerCase();
      if (h === "villa no" || h === "unit" || h === "unit no") villaCol = col;
      if (h === "unit cost" || h === "unit value" || h === "value") costCol = col;
    });
    if (villaCol && costCol) headerRow = r; else { villaCol = 0; costCol = 0; }
  }
  if (!headerRow) throw new Error('Header row with "Villa No" and "Unit Cost" not found');
  const byLabel = new Map(model.payload.units.map((u) => [u.label, u.id]));
  const entries: { workLocationId: string; unitValue: number }[] = [];
  let unknown = 0; let invalid = 0;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const label = text(row.getCell(villaCol).value);
    if (!label) continue;
    const value = numberOrNull(row.getCell(costCol).value);
    const id = byLabel.get(label);
    if (!id) { if (label.toLowerCase() !== "total") unknown++; continue; }
    if (value === null || Number.isNaN(value) || value < 0) { invalid++; continue; }
    entries.push({ workLocationId: id, unitValue: round(value, 2) });
  }
  return { entries, unknown, invalid };
}

// ---------- Matrix (items × units) ----------

const MATRIX_FIXED = ["Code", "Item", "Level", "Weight %", "Global %"];

export async function exportMatrixExcel(model: MatrixModel, projectName: string) {
  const { payload, summary } = model;
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Matrix");
  ws.addRow([...MATRIX_FIXED, ...payload.units.map((u) => u.label)]);
  ws.addRow(["", "Unit weight %", "", "", "", ...payload.units.map((_, u) => round(summary.unitShare[u] * 100, 4))]);
  ws.addRow(["", "Unit progress %", "", "", "", ...payload.units.map((_, u) => round(summary.unitProgress[u], 2))]);
  styleHeader(ws.getRow(1));
  [2, 3].forEach((r) => ws.getRow(r).eachCell((c) => { c.font = { italic: true, color: { argb: "FF666666" } }; c.border = border; }));

  for (const node of summary.tree.order as MatrixPayloadNode[]) {
    const leaf = summary.tree.isLeaf(node.id);
    const depth = summary.tree.depth.get(node.id) ?? 0;
    const nIdx = model.nodeIndex.get(node.id)!;
    const arr = summary.nodeUnit.get(node.id);
    const values = payload.units.map((_, u) => {
      if (!leaf) return arr ? round(arr[u], 2) : null;
      const cell = model.cellAt(nIdx, u);
      return cell ? cell[2] : null;
    });
    const row = ws.addRow([node.code, `${"  ".repeat(depth)}${node.nameAr}`, node.levelName ?? "", node.weight,
      round((summary.tree.globalWeight.get(node.id) ?? 0) * 100, 4), ...values]);
    row.eachCell((cell) => { cell.border = border; });
    if (!leaf) row.eachCell((cell) => { cell.font = { bold: depth === 0, italic: true, color: { argb: "FF1F4E79" } }; });
    else payload.units.forEach((_, u) => {
      const cell = model.cellAt(nIdx, u);
      if (cell && cell[3] & CELL_LOCKED) {
        row.getCell(MATRIX_FIXED.length + 1 + u).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
      }
    });
  }
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 45;
  ws.getColumn(3).width = 18;
  ws.views = [{ state: "frozen", xSplit: MATRIX_FIXED.length, ySplit: 3 }];
  const legend = workbook.addWorksheet("Legend");
  legend.addRow(["Only leaf rows (not bold/italic) are imported. Green cells are locked by approved WIRs and are skipped on import."]);
  legend.addRow(["Empty cells are ignored on import (they do not clear values)."]);
  await save(workbook, `Progress_Matrix_${safeName(projectName)}`);
}

export async function readMatrixExcel(file: File, model: MatrixModel) {
  const ws = await loadFirstSheet(file);
  const { payload, summary } = model;
  const byLabel = new Map(payload.units.map((u, i) => [u.label, i]));
  const byCode = new Map(payload.nodes.map((n) => [n.code, n]));
  const header = ws.getRow(1);
  const unitCols: { col: number; u: number }[] = [];
  let unknownUnits = 0;
  header.eachCell((cell, col) => {
    if (col <= MATRIX_FIXED.length) return;
    const u = byLabel.get(text(cell.value));
    if (u === undefined) unknownUnits++; else unitCols.push({ col, u });
  });
  if (!unitCols.length) throw new Error("No unit columns found in row 1 (expected Villa No labels after the first 5 columns)");

  const entries: CellEntry[] = [];
  let skippedLocked = 0; let skippedNonLeaf = 0; let unknownCodes = 0; let invalid = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const code = text(row.getCell(1).value);
    if (!code) continue;
    const node = byCode.get(code);
    if (!node) { unknownCodes++; continue; }
    if (!summary.tree.isLeaf(node.id)) { skippedNonLeaf++; continue; }
    const nIdx = model.nodeIndex.get(node.id)!;
    for (const { col, u } of unitCols) {
      const v = numberOrNull(row.getCell(col).value);
      if (v === null) continue;
      if (Number.isNaN(v) || v < 0 || v > 100) { invalid++; continue; }
      const cell = model.cellAt(nIdx, u);
      if (cell && cell[3] & CELL_LOCKED) { if (cell[2] !== v) skippedLocked++; continue; }
      const pct = round(v, 2);
      if (cell && cell[2] === pct) continue;
      entries.push({ nodeId: node.id, unitId: payload.units[u].id, percent: pct });
    }
  }
  return { entries, skippedLocked, skippedNonLeaf, unknownUnits, unknownCodes, invalid };
}

// ---------- WBS (weights) ----------

const WBS_HEADERS = ["Code", "Parent Code", "Name AR", "Name EN", "Weight %", "Activity Ref", "Level Code"];

export async function exportWbsExcel(model: MatrixModel, levels: { id: string; code: string }[], projectName: string) {
  const { summary } = model;
  const levelCode = new Map(levels.map((l) => [l.id, l.code]));
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("WBS");
  ws.addRow(WBS_HEADERS);
  styleHeader(ws.getRow(1));
  for (const node of summary.tree.order as MatrixPayloadNode[]) {
    const parent = node.parentId ? summary.tree.byId.get(node.parentId) : null;
    const row = ws.addRow([node.code, parent?.code ?? "", node.nameAr, node.nameEn ?? "", node.weight,
      node.activityCode ?? "", node.workLevelId ? levelCode.get(node.workLevelId) ?? "" : ""]);
    row.eachCell((c) => { c.border = border; });
    if (!parent) row.font = { bold: true };
  }
  [14, 14, 50, 50, 10, 14, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  await save(workbook, `WBS_Weights_${safeName(projectName)}`);
}

export async function readWbsExcel(file: File) {
  const ws = await loadFirstSheet(file);
  const header = ws.getRow(1);
  const colOf = new Map<string, number>();
  header.eachCell((cell, col) => colOf.set(text(cell.value).toLowerCase(), col));
  const need = (name: string) => {
    const c = colOf.get(name.toLowerCase());
    if (!c) throw new Error(`Missing column "${name}"`);
    return c;
  };
  const cCode = need("Code"); const cParent = need("Parent Code"); const cAr = need("Name AR");
  const cEn = colOf.get("name en"); const cW = need("Weight %");
  const cAct = colOf.get("activity ref"); const cLvl = colOf.get("level code");
  const rows: { code: string; parentCode: string | null; nameAr: string; nameEn: string | null; weight: number | null; activityRef: string | null; levelCode: string | null }[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const code = text(row.getCell(cCode).value);
    if (!code) continue;
    const w = numberOrNull(row.getCell(cW).value);
    rows.push({
      code,
      parentCode: text(row.getCell(cParent).value) || null,
      nameAr: text(row.getCell(cAr).value) || (cEn ? text(row.getCell(cEn).value) : ""),
      nameEn: cEn ? text(row.getCell(cEn).value) || null : null,
      weight: w === null || Number.isNaN(w) ? null : w,
      activityRef: cAct ? text(row.getCell(cAct).value) || null : null,
      levelCode: cLvl ? text(row.getCell(cLvl).value) || null : null,
    });
  }
  return rows;
}

// ---------- Payment certificate ----------

export interface CertificateDetail {
  certNo: number; title: string | null; status: string; periodFrom: string | null; periodTo: string | null;
  totalAmount: number; notes: string | null;
  lines: { unitLabel: string | null; unitValue: number; previousPercent: number; cumulativePercent: number; currentPercent: number; amount: number; phaseBreakdown: Record<string, number> }[];
}

export async function exportCertificateExcel(cert: CertificateDetail, model: MatrixModel | null, projectName: string) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(`Certificate ${cert.certNo}`);
  const phases = model ? (model.summary.tree.roots as MatrixPayloadNode[]) : [];
  ws.addRow([`${projectName} — Payment Certificate No. ${cert.certNo}`]).font = { bold: true, size: 14 };
  ws.addRow([`Title: ${cert.title ?? ""}`, "", `Status: ${cert.status}`]);
  ws.addRow([`Period: ${cert.periodFrom ?? ""} → ${cert.periodTo ?? ""}`, "", `Total: ${cert.totalAmount.toFixed(2)}`]);
  if (cert.notes) ws.addRow([`Notes: ${cert.notes}`]);
  ws.addRow([]);
  const header = ws.addRow(["Villa No", "Unit Value", "Previous %", "Cumulative %", "Current %", "Amount",
    ...phases.map((p) => `${p.code} cumulative %`)]);
  styleHeader(header);
  for (const l of cert.lines) {
    const row = ws.addRow([l.unitLabel, l.unitValue, l.previousPercent, l.cumulativePercent, l.currentPercent, l.amount,
      ...phases.map((p) => l.phaseBreakdown?.[p.code] ?? 0)]);
    row.eachCell((c, col) => { c.border = border; if (col > 1) c.numFmt = col === 2 || col === 6 ? "#,##0.00" : "0.0000"; });
  }
  const total = ws.addRow(["Total", round(cert.lines.reduce((s, l) => s + l.unitValue, 0), 2), "", "", "", cert.totalAmount]);
  total.eachCell((c, col) => { c.font = { bold: true }; c.border = border; if (col === 2 || col === 6) c.numFmt = "#,##0.00"; });
  ws.columns.forEach((c, i) => { c.width = i === 0 ? 12 : 15; });
  await save(workbook, `Payment_Certificate_${cert.certNo}_${safeName(projectName)}`);
}
