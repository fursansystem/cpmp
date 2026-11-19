import http from "node:http";
import crypto from "node:crypto";
import express from "express";
import { eq } from "drizzle-orm";

// Enable private URLs for local loopback testing before importing webhook-service
process.env.WEBHOOK_ALLOW_PRIVATE_URLS = "true";

import { db } from "../server/db";
import {
  organizations,
  projects,
  webhooks,
  webhookDeliveries,
  erpConnections,
  erpSuppliers,
  erpInboundLog,
} from "@shared/schema";
import { WEBHOOK_HEADERS } from "@shared/webhooks";
import {
  assertDeliverableUrl,
  generateSecret,
  signBody,
  webhookService,
} from "../server/webhook-service";
import { registerErpRoutes, verifyFrappeSignature } from "../server/erp-routes";

type ReceivedRequest = {
  headers: http.IncomingHttpHeaders;
  rawBody: string;
  json: any;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log("==================================================");
  console.log("🚀 بدء الاختبار الشامل لنظام الـ Webhooks (الصادر والوارد)");
  console.log("==================================================\n");

  // ---------------------------------------------------------------------------
  // 1. اختبارات التوقيع الرقمي وحماية الروابط (Unit Checks)
  // ---------------------------------------------------------------------------
  console.log("1️⃣  اختبار التواقيع الرقمية (HMAC-SHA256) وفحص الروابط...");
  const testSecret = generateSecret();
  const sampleBody = JSON.stringify({ hello: "world", timestamp: Date.now() });
  const outgoingSig = signBody(testSecret, sampleBody);
  const expectedOutgoingSig =
    "sha256=" + crypto.createHmac("sha256", testSecret).update(sampleBody).digest("hex");
  assert(outgoingSig === expectedOutgoingSig, "Outgoing signature must match HMAC-SHA256 hex format");
  console.log("   ✅ توقيع الـ Webhook الصادر (X-PMP-Signature-256) يعمل بشكل صحيح.");

  const rawBuffer = Buffer.from(sampleBody, "utf8");
  const frappeSig = crypto.createHmac("sha256", testSecret).update(rawBuffer).digest("base64");
  assert(verifyFrappeSignature(testSecret, rawBuffer, frappeSig) === true, "Valid Frappe signature should pass");
  assert(verifyFrappeSignature(testSecret, rawBuffer, "invalid-sig") === false, "Invalid Frappe signature should fail");
  assert(verifyFrappeSignature(testSecret, rawBuffer, undefined) === false, "Missing Frappe signature should fail");
  console.log("   ✅ التحقق من توقيع ERPNext الوارد (X-Frappe-Webhook-Signature) يعمل بشكل صحيح.");

  // Check SSRF protection when WEBHOOK_ALLOW_PRIVATE_URLS is disabled
  process.env.WEBHOOK_ALLOW_PRIVATE_URLS = "false";
  let blockedPrivate = false;
  try {
    await assertDeliverableUrl("http://127.0.0.1:9999/webhook");
  } catch {
    blockedPrivate = true;
  }
  assert(blockedPrivate, "Private loopback URL should be blocked when WEBHOOK_ALLOW_PRIVATE_URLS=false");
  process.env.WEBHOOK_ALLOW_PRIVATE_URLS = "true";
  await assertDeliverableUrl("http://127.0.0.1:9999/webhook");
  console.log("   ✅ حماية SSRF للروابط الداخلية تعمل بشكل سليم.\n");

  // ---------------------------------------------------------------------------
  // 2. تجهيز مستقبل محلي (Mock Receiver) + بيانات الاختبار
  // ---------------------------------------------------------------------------
  console.log("2️⃣  تشغيل خادم الاستقبال التجريبي المحلي (Local Mock Receiver)...");
  const receivedOutgoing: ReceivedRequest[] = [];
  let shouldFailNextOutgoing = false;

  const receiverServer = http.createServer((req, res) => {
    let rawBody = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      rawBody += chunk;
    });
    req.on("end", () => {
      let json: any = null;
      try {
        json = JSON.parse(rawBody);
      } catch {
        // ignore
      }
      receivedOutgoing.push({ headers: req.headers, rawBody, json });
      if (shouldFailNextOutgoing) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Simulated ERP receiver failure" }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ received: true }));
      }
    });
  });

  await new Promise<void>((resolve) => receiverServer.listen(0, "127.0.0.1", resolve));
  const receiverAddr = receiverServer.address() as { port: number };
  const receiverUrl = `http://127.0.0.1:${receiverAddr.port}/erp-webhook-receiver`;
  console.log(`   ✅ خادم الاستقبال يستمع على: ${receiverUrl}\n`);

  // Find a project and organization to attach temporary test records to
  const [sampleProject] = await db
    .select({
      id: projects.id,
      name: projects.name,
      organizationId: projects.organizationId,
    })
    .from(projects)
    .limit(1);

  let orgId = sampleProject?.organizationId ?? null;
  if (!orgId) {
    const [sampleOrg] = await db.select({ id: organizations.id }).from(organizations).limit(1);
    orgId = sampleOrg?.id ?? null;
  }
  assert(orgId, "No organization found in database to run integration test");

  let createdWebhookId: string | null = null;
  let createdErpConnId: string | null = null;
  let existingErpConnBackup: typeof erpConnections.$inferSelect | null = null;
  const testErpSupplierName = `TEST-SUP-${Date.now()}`;

  try {
    // -------------------------------------------------------------------------
    // 3. اختبار الـ Webhooks الصادرة (Outgoing Webhooks: Ping, Emit, Redeliver, Retry)
    // -------------------------------------------------------------------------
    console.log("3️⃣  اختبار الـ Webhooks الصادرة (Outgoing Webhooks)...");
    const webhookSecret = generateSecret();
    const [createdWebhook] = await db
      .insert(webhooks)
      .values({
        organizationId: orgId,
        name: "Test Webhook Receiver (Automated)",
        url: receiverUrl,
        secret: webhookSecret,
        events: ["payment_order", "purchase_order"],
        active: true,
      })
      .returning();
    createdWebhookId = createdWebhook.id;

    // 3.a: Ping test
    const pingDelivery = await webhookService.ping(createdWebhook);
    assert(pingDelivery.status === "success", `Expected ping status 'success', got '${pingDelivery.status}'`);
    assert(pingDelivery.responseStatus === 200, `Expected HTTP 200, got ${pingDelivery.responseStatus}`);
    assert(receivedOutgoing.length === 1, "Receiver should have received 1 ping request");

    const pingReq = receivedOutgoing[0];
    assert(pingReq.headers[WEBHOOK_HEADERS.event.toLowerCase()] === "ping", "Header X-PMP-Event should be 'ping'");
    assert(
      pingReq.headers[WEBHOOK_HEADERS.delivery.toLowerCase()] === pingDelivery.id,
      "Header X-PMP-Delivery should match delivery ID",
    );
    assert(
      pingReq.headers[WEBHOOK_HEADERS.signature.toLowerCase()] === signBody(webhookSecret, pingReq.rawBody),
      "Header X-PMP-Signature-256 must match HMAC of rawBody",
    );
    console.log(`   ✅ [Ping] تم إرسال واستقبال حدث ping بنجاح (Delivery ID: ${pingDelivery.id}, المدة: ${pingDelivery.durationMs}ms).`);

    // 3.b: Event emit test (if a project exists for this org)
    if (sampleProject && sampleProject.organizationId === orgId) {
      await (webhookService as any).dispatch({
        event: "payment_order",
        action: "pay",
        projectId: sampleProject.id,
        record: {
          id: "test-po-id",
          orderNo: "PO-TEST-001",
          amount: "15000.00",
          status: "paid",
        },
        change: { from: "approved", to: "paid", note: "تم الصرف للاختبار" },
      });

      assert(receivedOutgoing.length === 2, "Receiver should have received the emitted payment_order event");
      const emitReq = receivedOutgoing[1];
      assert(emitReq.headers[WEBHOOK_HEADERS.event.toLowerCase()] === "payment_order", "Event header should be payment_order");
      assert(emitReq.json.action === "paid", "Action 'pay' should map to 'paid'");
      assert(emitReq.json.data?.orderNo === "PO-TEST-001", "Payload data.orderNo should match");
      assert(
        emitReq.headers[WEBHOOK_HEADERS.signature.toLowerCase()] === signBody(webhookSecret, emitReq.rawBody),
        "Emitted event signature must be valid",
      );
      console.log("   ✅ [Emit] تم إطلاق حدث (payment_order -> paid) والتحقق من البيانات والتوقيع بنجاح.");
    }

    // 3.c: Redeliver test
    const redelivered = await webhookService.redeliver(pingDelivery.id);
    assert(redelivered && redelivered.status === "success", "Redelivery should succeed");
    assert(redelivered.id !== pingDelivery.id, "Redelivery should create a new delivery record");
    console.log(`   ✅ [Redeliver] تمت إعادة إرسال الشحنة بنجاح (New Delivery ID: ${redelivered.id}).`);

    // 3.d: Failure & Retry scheduling test
    shouldFailNextOutgoing = true;
    const failedPing = await webhookService.ping(createdWebhook);
    shouldFailNextOutgoing = false;
    assert(failedPing.status === "pending", `Failed first attempt should stay 'pending' for retry, got '${failedPing.status}'`);
    assert(failedPing.attempts === 1, `Expected 1 attempt, got ${failedPing.attempts}`);
    assert(failedPing.responseStatus === 500, `Expected responseStatus 500, got ${failedPing.responseStatus}`);
    assert(failedPing.nextAttemptAt !== null, "nextAttemptAt should be scheduled for retry");
    console.log(
      `   ✅ [Retry Scheduling] عند فشل المستقبل (HTTP 500)، تم جدولة إعادة المحاولة تلقائياً في: ${failedPing.nextAttemptAt?.toISOString()}\n`,
    );

    // -------------------------------------------------------------------------
    // 4. اختبار الـ Webhook الوارد من ERPNext (Incoming ERPNext Webhook)
    // -------------------------------------------------------------------------
    console.log("4️⃣  اختبار الـ Webhook الوارد من ERPNext (/api/erp/inbound/:connectionId)...");

    // Check if org already has an erp_connection; if so, back it up or reuse it temporarily
    const [existingConn] = await db
      .select()
      .from(erpConnections)
      .where(eq(erpConnections.organizationId, orgId));

    const inboundSecret = generateSecret();
    let connId: string;

    if (existingConn) {
      existingErpConnBackup = existingConn;
      await db
        .update(erpConnections)
        .set({ webhookSecret: inboundSecret, active: true })
        .where(eq(erpConnections.id, existingConn.id));
      connId = existingConn.id;
    } else {
      const [newConn] = await db
        .insert(erpConnections)
        .values({
          organizationId: orgId,
          baseUrl: "https://erp.example.com",
          company: "Test Company",
          webhookSecret: inboundSecret,
          active: true,
        })
        .returning();
      createdErpConnId = newConn.id;
      connId = newConn.id;
    }

    let paidOrderCapture: any = null;
    const testApp = express();
    testApp.use(
      express.json({
        verify: (req: any, _res, buf) => {
          req.rawBody = buf;
        },
      }),
    );
    registerErpRoutes(testApp, {
      getCurrentUserWithOrg: async () => null,
      handleError: (res, err: any) => res.status(500).json({ error: err?.message || "Server error" }),
      markOrderPaidFromErp: async (orderId, _orgProjectIds, details) => {
        paidOrderCapture = { orderId, details };
        return { ok: true, orderNo: "PO-ERP-999", orderId: "order-uuid-12345", projectId: sampleProject?.id ?? "proj-1" };
      },
    });

    const erpServer = await new Promise<http.Server>((resolve) => {
      const s = testApp.listen(0, "127.0.0.1", () => resolve(s));
    });
    const erpPort = (erpServer.address() as { port: number }).port;
    const inboundEndpoint = `http://127.0.0.1:${erpPort}/api/erp/inbound/${connId}`;

    try {
      // 4.a: Reject unsigned request
      const unsignedRes = await fetch(inboundEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctype: "Supplier", name: testErpSupplierName }),
      });
      assert(unsignedRes.status === 401, `Unsigned inbound webhook must return 401, got ${unsignedRes.status}`);
      console.log("   ✅ [Security] تم رفض الطلب غير الموقع (HTTP 401) كما هو متوقع.");

      // 4.b: Valid Supplier inbound webhook
      const supplierBody = JSON.stringify({
        event: "after_insert",
        doc: {
          doctype: "Supplier",
          name: testErpSupplierName,
          supplier_name: "شركة المورد التجريبي المحدودة",
          tax_id: "300000000000003",
          email_id: "supplier@test.example.com",
          mobile_no: "0500000000",
          supplier_group: "Raw Material",
          disabled: 0,
        },
      });
      const supplierSig = crypto.createHmac("sha256", inboundSecret).update(Buffer.from(supplierBody)).digest("base64");
      const supplierRes = await fetch(inboundEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Frappe-Webhook-Signature": supplierSig,
        },
        body: supplierBody,
      });
      const supplierJson: any = await supplierRes.json();
      assert(supplierRes.status === 200 && supplierJson.status === "applied", `Supplier webhook failed: ${JSON.stringify(supplierJson)}`);
      console.log(`   ✅ [Supplier Inbound] تم استقبال وحفظ بيانات المورد من ERPNext بنجاح (${supplierJson.message}).`);

      // 4.c: Valid Payment Entry inbound webhook (matching by PAY-0015 in remarks without pmp_payment_order!)
      const paymentBody = JSON.stringify({
        event: "on_submit",
        doc: {
          doctype: "Payment Entry",
          name: "ACC-PAY-2026-00001",
          docstatus: 1,
          payment_type: "Pay",
          party_type: "Supplier",
          party: testErpSupplierName,
          party_name: "شركة المورد التجريبي المحدودة",
          mode_of_payment: "Bank Transfer",
          reference_no: "BANK-REF-7788",
          reference_date: "2026-11-18",
          paid_amount: 25000,
          remarks: "سداد أمر الدفع رقم PAY-0015 للمشروع",
        },
      });
      const paymentSig = crypto.createHmac("sha256", inboundSecret).update(Buffer.from(paymentBody)).digest("base64");
      const paymentRes = await fetch(inboundEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Frappe-Webhook-Signature": paymentSig,
        },
        body: paymentBody,
      });
      const paymentJson: any = await paymentRes.json();
      assert(paymentRes.status === 200 && paymentJson.status === "applied", `Payment Entry webhook failed: ${JSON.stringify(paymentJson)}`);
      assert(paidOrderCapture?.orderId === "PAY-0015", `markOrderPaidFromErp should extract 'PAY-0015' from remarks, got '${paidOrderCapture?.orderId}'`);
      assert(paidOrderCapture?.details?.amount === 25000, "markOrderPaidFromErp should receive the paid amount");
      assert(paidOrderCapture?.details?.paymentMethod === "bank_transfer", "Mode of payment should map to bank_transfer");
      console.log(`   ✅ [Payment Entry Inbound] تم استخراج رقم أمر الدفع (PAY-0015) من الملاحظات وتحديث أمر الدفع (${paymentJson.message}).\n`);
    } finally {
      erpServer.close();
    }
  } finally {
    // Clean up test data
    console.log("🧹 تنظيف بيانات الاختبار المؤقتة من قاعدة البيانات...");
    receiverServer.close();
    if (createdWebhookId) {
      await db.delete(webhooks).where(eq(webhooks.id, createdWebhookId));
    }
    if (createdErpConnId) {
      await db.delete(erpConnections).where(eq(erpConnections.id, createdErpConnId));
    } else if (existingErpConnBackup) {
      await db
        .update(erpConnections)
        .set({
          webhookSecret: existingErpConnBackup.webhookSecret,
          active: existingErpConnBackup.active,
          updatedAt: existingErpConnBackup.updatedAt,
        })
        .where(eq(erpConnections.id, existingErpConnBackup.id));
    }
    await db.delete(erpSuppliers).where(eq(erpSuppliers.erpName, testErpSupplierName));
    await db.delete(erpInboundLog).where(eq(erpInboundLog.docName, testErpSupplierName));
    await db.delete(erpInboundLog).where(eq(erpInboundLog.docName, "ACC-PAY-2026-00001"));
    console.log("   ✅ تم حذف جميع سجلات الاختبار المؤقتة بنجاح.\n");
  }

  console.log("==================================================");
  console.log("🎉 اكتملت جميع اختبارات الـ Webhook (الصادرة والواردة) بنجاح 100%!");
  console.log("==================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("\n❌ فشل الاختبار:", err);
  process.exit(1);
});
