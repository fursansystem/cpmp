import { db } from "../server/db";
import { workLocations } from "@shared/schema";
import { readFileSync } from "fs";

async function importWorkLocations() {
  try {
    // Find "الفرسان قولد" project
    const fursan = await db.query.projects.findFirst({
      where: (projects, { ilike }) => ilike(projects.name, "%الفرسان%"),
    });

    if (!fursan) {
      console.error("❌ Project 'الفرسان قولد' not found");
      process.exit(1);
    }

    console.log(`✅ Found project: ${fursan.name} (${fursan.id})`);

    // Read CSV file
    const csvData = readFileSync("attached_assets/work_location_1766929111537.csv", "utf-8");
    
    // Simple CSV parser
    const lines = csvData.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim());
    
    console.log(`📊 Parsing CSV with ${lines.length - 1} data rows\n`);

    const workLocationsData = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim());
      
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || null;
      });

      workLocationsData.push({
        projectId: fursan.id,
        unitZone: row["Unit Zone"] || null,
        unitCluster: row["Unit Cluster"] || null,
        unitBlock: row["Unit Block"] || null,
        buildingNo: row[" Building no."] || row["Building no."] || null,
        flatNo: row["Flat no."] || null,
        areaM2: row["Area_M2"] ? parseFloat(row["Area_M2"]) : null,
        floor: row["Floor"] || null,
        villaType: row["Villa type"] || null,
        part: row["PART"] || null,
      });
    }

    // Insert in batches
    const batchSize = 100;
    let inserted = 0;

    for (let i = 0; i < workLocationsData.length; i += batchSize) {
      const batch = workLocationsData.slice(i, i + batchSize);
      await db.insert(workLocations).values(batch);
      inserted += batch.length;
      console.log(`  ✅ Inserted ${inserted}/${workLocationsData.length}`);
    }

    console.log(`\n🎉 Successfully imported ${inserted} work locations!`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Import failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

importWorkLocations();
