import type { StockBalance } from "@shared/schema";

export async function exportStockBalances(balances: StockBalance[]) {
  const rows = balances.map((b) => ({
    المادة: b.materialName,
    الوحدة: b.unit,
    وارد: b.totalIn,
    منصرف: b.totalOut,
    الرصيد: b.balance,
    "الحد الأدنى": b.minStockLevel,
    الحالة: b.isLowStock ? "تحت الحد" : "طبيعي",
  }));
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "الأرصدة");
  XLSX.writeFile(wb, `stock-balances-${new Date().toISOString().split("T")[0]}.xlsx`);
}

