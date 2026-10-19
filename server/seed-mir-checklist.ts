import { db } from "./db";
import { checklistItems } from "../shared/schema";
import { eq } from "drizzle-orm";

async function seedChecklists() {
  console.log("Seeding checklist items...");

  const itemsToSeed = [
    // MIR Items
    {
      category: "mir",
      code: "MIR-01",
      nameEnglish: "Providing samples of materials to be approved",
      nameArabic: "",
      description: "Ensure that physical samples of the materials are provided for inspection and approval.",
      sortOrder: 1,
    },
    {
      category: "mir",
      code: "MIR-02",
      nameEnglish: "Mentioned company is approved company",
      nameArabic: "",
      description: "Verify that the manufacturer or supplier company is on the project's approved list.",
      sortOrder: 2,
    },
    {
      category: "mir",
      code: "MIR-03",
      nameEnglish: "Delivered material is approved materials and according to specification",
      nameArabic: "",
      description: "Confirm that the materials delivered to the site match the approved submittals and technical specifications.",
      sortOrder: 3,
    },
    // MAR Items
    {
      category: "mar",
      code: "MAR-01",
      nameEnglish: "Technical data sheets and catalogs provided",
      nameArabic: "تقديم البيانات الفنية والكتالوجات للمواد",
      description: "Ensure technical data sheets, compliance statements, and product catalogues are attached.",
      sortOrder: 1,
    },
    {
      category: "mar",
      code: "MAR-02",
      nameEnglish: "Physical sample of material submitted",
      nameArabic: "تقديم عينة مادية من المواد",
      description: "Verify physical samples have been submitted for visual and physical inspection.",
      sortOrder: 2,
    },
    {
      category: "mar",
      code: "MAR-03",
      nameEnglish: "Compliance with project specifications and drawings",
      nameArabic: "مطابقة مواصفات المواد مع متطلبات المشروع ومخططاته",
      description: "Verify the material specifications match the contract requirements and project drawings.",
      sortOrder: 3,
    },
    {
      category: "mar",
      code: "MAR-04",
      nameEnglish: "Test reports and certificates provided",
      nameArabic: "تقديم تقارير الاختبار وشهادات الجودة للمواد",
      description: "Ensure manufacturer test certificates, quality assurance certificates, and independent lab test reports are attached.",
      sortOrder: 4,
    },
    {
      category: "mar",
      code: "MAR-05",
      nameEnglish: "Supplier/Manufacturer pre-qualification status",
      nameArabic: "التحقق من حالة اعتماد المورد أو المصنع",
      description: "Confirm the manufacturer or local supplier is on the project approved list.",
      sortOrder: 5,
    }
  ];

  try {
    for (const item of itemsToSeed) {
      const existing = await db
        .select()
        .from(checklistItems)
        .where(eq(checklistItems.code, item.code));

      if (existing.length === 0) {
        await db.insert(checklistItems).values(item);
        console.log(`Added: ${item.nameEnglish}`);
      } else {
        await db.update(checklistItems).set(item).where(eq(checklistItems.code, item.code));
        console.log(`Updated: ${item.nameEnglish}`);
      }
    }
    console.log("Checklist seeding completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding checklist:", error);
    process.exit(1);
  }
}

seedChecklists();
