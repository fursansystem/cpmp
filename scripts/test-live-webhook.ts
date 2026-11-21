import crypto from "node:crypto";
import { db } from "../server/db";
import { webhooks, erpConnections, erpInboundLog, erpSuppliers, organizations } from "@shared/schema";
import { desc, eq } from "drizzle-orm";

async function main() {
  console.log("==================================================");
  console.log("🌐 اختبار فعلي مباشر على النظام المربوط (Production Live Test)");
  console.log("==================================================\n");

  const allConns = await db.select().from(erpConnections);
  if (allConns.length === 0) {
    console.log("❌ لا يوجد أي ربط ERPNext مسجل في قاعدة البيانات.");
    process.exit(1);
  }

  for (const c of allConns) {
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, c.organizationId));
    const appUrl = (process.env.APP_URL || "https://semat.fursan.sa").replace(/\/+$/, "");
    const inboundUrl = `${appUrl}/api/erp/inbound/${c.id}`;

    console.log(`🏢 المنظمة: ${org?.name ?? c.organizationId}`);
    console.log(`🔗 نظام ERPNext المربوط: ${c.baseUrl} (الشركة: ${c.company ?? "-"})`);
    console.log(`📥 رابط استقبال الـ Webhook الفعلي: ${inboundUrl}\n`);

    // 1. فحص الوصول الفعلي لخادم ERPNext (https://ammarhome.fursan.sa/api/method/ping)
    console.log(`1️⃣  فحص الاتصال بخادم ERPNext (${c.baseUrl})...`);
    try {
      const pingUrl = new URL("api/method/ping", c.baseUrl.replace(/\/+$/, "") + "/");
      const t0 = Date.now();
      const pingRes = await fetch(pingUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      const pingText = await pingRes.text();
      console.log(`   ✅ استجاب خادم ERPNext خلال ${Date.now() - t0}ms (HTTP ${pingRes.status}): ${pingText.trim()}`);
    } catch (err: any) {
      console.log(`   ❌ تعذر الوصول لخادم ERPNext: ${err?.message || err}`);
    }

    if (c.apiKey && c.apiSecret) {
      try {
        const authUrl = new URL("api/method/frappe.auth.get_logged_user", c.baseUrl.replace(/\/+$/, "") + "/");
        const authRes = await fetch(authUrl, {
          headers: {
            Accept: "application/json",
            Authorization: `token ${c.apiKey}:${c.apiSecret}`,
          },
          signal: AbortSignal.timeout(15000),
        });
        const authText = await authRes.text();
        console.log(`   ✅ التحقق من مفاتيح API في ERPNext (HTTP ${authRes.status}): ${authText.trim()}`);
      } catch (err: any) {
        console.log(`   ❌ فشل التحقق من مفاتيح API: ${err?.message || err}`);
      }
    } else {
      console.log(`   ℹ️ ملاحظة: لم يتم إدخال API Key / API Secret بعد في إعدادات الربط (مطلوبة فقط للمزامنة اليدوية وكشف الحساب، بينما الـ Webhook الوارد يعمل بدونها عبر Webhook Secret).`);
    }

    // 2. إرسال Webhook فعلي موقّع إلى الرابط الحي https://semat.fursan.sa/api/erp/inbound/:id
    console.log(`\n2️⃣  إرسال طلب Webhook فعلي موقّع إلى (${inboundUrl})...`);
    const payloadObj = {
      event: "on_update",
      doc: {
        doctype: "Supplier",
        name: "TEST-ERP-WEBHOOK-01",
        supplier_name: "مورد اختبار الربط المباشر (ERPNext Webhook Test)",
        tax_id: "310000000000003",
        email_id: "erp-test@fursan.sa",
        mobile_no: "0500000000",
        supplier_group: "Services",
        disabled: 0,
      },
    };
    const rawBody = JSON.stringify(payloadObj);
    const signature = crypto
      .createHmac("sha256", c.webhookSecret)
      .update(Buffer.from(rawBody, "utf8"))
      .digest("base64");

    try {
      const t1 = Date.now();
      const liveRes = await fetch(inboundUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Frappe-Webhook-Signature": signature,
        },
        body: rawBody,
        signal: AbortSignal.timeout(15000),
      });
      const liveText = await liveRes.text();
      console.log(`   📡 رد الخادم الحي (${appUrl}) خلال ${Date.now() - t1}ms:`);
      console.log(`      - HTTP Status: ${liveRes.status}`);
      console.log(`      - Response Body: ${liveText}`);
    } catch (err: any) {
      console.log(`   ❌ فشل الإرسال إلى الرابط الحي: ${err?.message || err}`);
    }

    // 3. التحقق من وصول وتسجيل الرسالة في قاعدة البيانات الفعلية
    console.log(`\n3️⃣  التحقق من السجلات في قاعدة البيانات بعد الإرسال الفعلي...`);
    const logs = await db
      .select()
      .from(erpInboundLog)
      .where(eq(erpInboundLog.organizationId, c.organizationId))
      .orderBy(desc(erpInboundLog.createdAt))
      .limit(5);

    for (const l of logs) {
      console.log(
        `   ✅ سجل وارد: [${l.createdAt.toISOString()}] doctype=${l.doctype} | docName=${l.docName} | event=${l.event} | status=${l.status} | message=${l.message}`,
      );
    }

    const syncedSuppliers = await db
      .select()
      .from(erpSuppliers)
      .where(eq(erpSuppliers.organizationId, c.organizationId));
    console.log(`   📦 إجمالي الموردين في دليل ERPNext للمنظمة الآن: ${syncedSuppliers.length}`);
    for (const s of syncedSuppliers) {
      console.log(`      - ${s.erpName}: ${s.supplierName} (الرقم الضريبي: ${s.taxId ?? "-"})`);
    }
  }

  // Also check outgoing webhooks count
  const outHooks = await db.select().from(webhooks);
  console.log(`\n4️⃣  الـ Webhooks الصادرة (Outgoing Webhooks): عدد الروابط المسجلة حالياً = ${outHooks.length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
