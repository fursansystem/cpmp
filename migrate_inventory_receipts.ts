import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Adding receipt-source columns...");

  // 1. New columns. receipt_source defaults to 'legacy' so existing rows are valid
  //    the moment the column exists, with no window where NOT NULL could fail.
  await db.execute(sql`
    ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS receipt_source TEXT NOT NULL DEFAULT 'legacy';
    ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS purchase_order_id VARCHAR REFERENCES purchase_orders(id) ON DELETE SET NULL;
    ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS source_reason TEXT;
    ALTER TABLE delivery_items ADD COLUMN IF NOT EXISTS po_item_id VARCHAR REFERENCES po_items(id) ON DELETE SET NULL;
  `);
  console.log("Columns on 'deliveries' and 'delivery_items' verified/added.");

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_deliveries_po ON deliveries (purchase_order_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_deliveries_receipt_source ON deliveries (project_id, receipt_source);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_delivery_items_po_item ON delivery_items (po_item_id);
  `);
  console.log("Indexes verified/created.");

  // 2. Label pre-existing receipts. The column default already covers rows created
  //    before this run; this catches any that were written as NULL by an older path.
  const labelled = await db.execute(sql`
    UPDATE deliveries SET receipt_source = 'legacy' WHERE receipt_source IS NULL;
  `);
  console.log(`Receipts labelled 'legacy': ${labelled.rowCount ?? 0}`);

  // 3. Data quality report for the purchase-order tightening.
  //    Free-text PO lines cannot be received into stock, so they must be fixed by hand
  //    before the stricter validation starts rejecting edits to those orders.
  const freeText = await db.execute(sql`
    SELECT po.po_number, po.status, i.item_description, i.quantity, i.unit
    FROM po_items i
    JOIN purchase_orders po ON po.id = i.po_id
    WHERE i.material_id IS NULL
    ORDER BY po.po_number;
  `);
  if (freeText.rows.length > 0) {
    console.warn(
      `\n[تنبيه] ${freeText.rows.length} بند أمر شراء بلا مادة من الكتالوج. هذه البنود لا يمكن استلامها في المخزون - اربطها بمادة يدويًا:`
    );
    for (const row of freeText.rows as any[]) {
      console.warn(`  - ${row.po_number} (${row.status}): "${row.item_description}" ${row.quantity} ${row.unit}`);
    }
  } else {
    console.log("\nAll purchase order lines are linked to catalog materials.");
  }

  // 4. Current state, so the receipt flow can be exercised against something real.
  const summary = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM deliveries) AS deliveries,
      (SELECT COUNT(*)::int FROM deliveries WHERE receipt_source = 'legacy') AS legacy_receipts,
      (SELECT COUNT(*)::int FROM purchase_orders) AS purchase_orders,
      (SELECT COUNT(*)::int FROM purchase_orders
         WHERE status IN ('approved','issued','partially_received')) AS receivable_orders;
  `);
  console.log("\nState:", summary.rows[0]);
  if (((summary.rows[0] as any)?.receivable_orders ?? 0) === 0) {
    console.warn(
      "[ملاحظة] لا يوجد أمر شراء معتمد بعد، فلا يمكن تجربة الاستلام من أمر شراء حتى يُعتمد أمر واحد."
    );
  }

  console.log("\nReceipt-source migration completed.");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration error:", err);
    process.exit(1);
  });
