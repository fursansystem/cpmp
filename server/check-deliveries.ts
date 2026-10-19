
import { db } from "./db";
import { deliveries } from "../shared/schema";
import { desc } from "drizzle-orm";

async function checkDeliveries() {
  console.log("Checking recent deliveries...");
  try {
    const recent = await db.select().from(deliveries).orderBy(desc(deliveries.createdAt)).limit(10);
    recent.forEach(d => {
      console.log(`ID: ${d.id}, Shipment #: ${d.shipmentNumber}, Created At: ${d.createdAt}`);
    });
    process.exit(0);
  } catch (error) {
    console.error("Check failed:", error);
    process.exit(1);
  }
}

checkDeliveries();
