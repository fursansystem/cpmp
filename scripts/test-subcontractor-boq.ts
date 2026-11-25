// Verification suite for shared/subcontractor-boq.ts & shared/payments.ts
// Run: npx tsx scripts/test-subcontractor-boq.ts
import assert from "node:assert/strict";
import {
  computeBoqContractAmount,
  computeBoqLine,
  roundMoney,
  summarizeBoqLines,
  validateCertificateBoqLine,
  type CertificateBoqLineDto,
} from "../shared/subcontractor-boq";
import { computeSubCert } from "../shared/payments";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  PASS  ${name}`);
}

console.log("Running Subcontractor BOQ & IPC Valuation Tests...\n");

test("1. Qty-based bidirectional: Current -> Cumulative", () => {
  const res = computeBoqLine({
    billingMode: "qty",
    contractQty: 250,
    unitRate: 420,
    previousQty: 100,
    previousPercent: 40,
    previousAmount: 42000,
    source: "current",
    currentQty: 50,
  });
  assert.equal(res.contractAmount, 105000);
  assert.equal(res.cumulativeQty, 150);
  assert.equal(res.currentQty, 50);
  assert.equal(res.cumulativeAmount, 63000);
  assert.equal(res.currentAmount, 21000);
  assert.equal(res.cumulativePercent, 60);
  assert.equal(res.remainingAmount, 42000);
  assert.equal(res.isOverContract, false);
  assert.equal(res.isNegativeAdjustment, false);
});

test("2. Qty-based bidirectional: Cumulative -> Current + Over-Qty warning flag", () => {
  const res = computeBoqLine({
    billingMode: "qty",
    contractQty: 200,
    unitRate: 100,
    previousQty: 180,
    previousPercent: 90,
    previousAmount: 18000,
    source: "cumulative",
    cumulativeQty: 215,
  });
  assert.equal(res.currentQty, 35);
  assert.equal(res.cumulativeQty, 215);
  assert.equal(res.currentAmount, 3500);
  assert.equal(res.cumulativeAmount, 21500);
  assert.equal(res.isOverContract, true);
  assert.equal(res.overQty, 15);
  // Over-qty is allowed (warn-only) on Qty-based items
  assert.deepEqual(
    validateCertificateBoqLine({ billingMode: "qty", cumulativeQty: res.cumulativeQty, cumulativePercent: res.cumulativePercent }),
    [],
  );
});

test("3. Qty-based negative adjustment allowed down to 0, rejected below 0", () => {
  const validAdj = computeBoqLine({
    billingMode: "qty",
    contractQty: 100,
    unitRate: 50,
    previousQty: 40,
    previousPercent: 40,
    previousAmount: 2000,
    source: "current",
    currentQty: -10,
  });
  assert.equal(validAdj.cumulativeQty, 30);
  assert.equal(validAdj.currentAmount, -500);
  assert.equal(validAdj.isNegativeAdjustment, true);
  assert.deepEqual(
    validateCertificateBoqLine({ billingMode: "qty", cumulativeQty: validAdj.cumulativeQty, cumulativePercent: validAdj.cumulativePercent }),
    [],
  );

  const invalidAdj = computeBoqLine({
    billingMode: "qty",
    contractQty: 100,
    unitRate: 50,
    previousQty: 40,
    previousPercent: 40,
    previousAmount: 2000,
    source: "current",
    currentQty: -45,
  });
  assert.equal(invalidAdj.cumulativeQty, -5);
  assert.deepEqual(
    validateCertificateBoqLine({ billingMode: "qty", cumulativeQty: invalidAdj.cumulativeQty, cumulativePercent: invalidAdj.cumulativePercent }),
    ["cumulative_below_zero"],
  );
});

test("4. Progress-based (%): 3-IPC sequence 33.33% + 33.33% + 33.34% has ZERO penny drift", () => {
  const contractAmount = 100000;
  // IPC #1: 33.33%
  const ipc1 = computeBoqLine({
    billingMode: "progress",
    contractQty: 1,
    unitRate: contractAmount,
    previousQty: 0,
    previousPercent: 0,
    previousAmount: 0,
    source: "current",
    currentPercent: 33.33,
  });
  assert.equal(ipc1.currentAmount, 33330);
  assert.equal(ipc1.cumulativeAmount, 33330);

  // IPC #2: +33.33% (cum 66.66%)
  const ipc2 = computeBoqLine({
    billingMode: "progress",
    contractQty: 1,
    unitRate: contractAmount,
    previousQty: ipc1.cumulativeQty,
    previousPercent: ipc1.cumulativePercent,
    previousAmount: ipc1.cumulativeAmount,
    source: "current",
    currentPercent: 33.33,
  });
  assert.equal(ipc2.cumulativePercent, 66.66);
  assert.equal(ipc2.currentAmount, 33330);

  // IPC #3: set Cumulative = 100% (bidirectional) -> Current = 33.34%
  const ipc3 = computeBoqLine({
    billingMode: "progress",
    contractQty: 1,
    unitRate: contractAmount,
    previousQty: ipc2.cumulativeQty,
    previousPercent: ipc2.cumulativePercent,
    previousAmount: ipc2.cumulativeAmount,
    source: "cumulative",
    cumulativePercent: 100,
  });
  assert.equal(ipc3.currentPercent, 33.34);
  assert.equal(ipc3.currentAmount, 33340);
  assert.equal(roundMoney(ipc1.currentAmount + ipc2.currentAmount + ipc3.currentAmount), contractAmount);
});

test("5. Progress-based (%): hard cap at 100% enforced by validator", () => {
  const over = computeBoqLine({
    billingMode: "progress",
    contractQty: 1,
    unitRate: 50000,
    previousQty: 0.8,
    previousPercent: 80,
    previousAmount: 40000,
    source: "current",
    currentPercent: 25,
  });
  assert.equal(over.cumulativePercent, 105);
  assert.deepEqual(
    validateCertificateBoqLine({ billingMode: "progress", cumulativeQty: over.cumulativeQty, cumulativePercent: over.cumulativePercent }),
    ["progress_exceeds_100"],
  );
});

test("6. Hybrid BOQ (Qty + Progress + Variations) summary & Certificate Net Payable integration", () => {
  const l1Calc = computeBoqLine({
    billingMode: "progress",
    contractQty: 1,
    unitRate: 50000,
    previousQty: 0.5,
    previousPercent: 50,
    previousAmount: 25000,
    source: "cumulative",
    cumulativePercent: 100,
  });
  const l2Calc = computeBoqLine({
    billingMode: "qty",
    contractQty: 100,
    unitRate: 300,
    previousQty: 40,
    previousPercent: 40,
    previousAmount: 12000,
    source: "current",
    currentQty: 30,
  });
  const voCalc = computeBoqLine({
    billingMode: "qty",
    contractQty: 20,
    unitRate: 500,
    previousQty: 0,
    previousPercent: 0,
    previousAmount: 0,
    source: "current",
    currentQty: 10,
  });

  const lines: CertificateBoqLineDto[] = [
    {
      contractBoqItemId: "item-1",
      sortOrder: 0,
      section: "Preliminaries",
      itemCode: "1.1",
      description: "Mobilization",
      unit: "LS",
      billingMode: "progress",
      isVariation: false,
      contractQty: 1,
      unitRate: 50000,
      ...l1Calc,
    },
    {
      contractBoqItemId: "item-2",
      sortOrder: 1,
      section: "Civil",
      itemCode: "2.1",
      description: "Concrete",
      unit: "m³",
      billingMode: "qty",
      isVariation: false,
      contractQty: 100,
      unitRate: 300,
      ...l2Calc,
    },
    {
      contractBoqItemId: "item-vo1",
      sortOrder: 2,
      section: "Variations",
      itemCode: "VO-01",
      description: "Extra Waterproofing",
      unit: "m²",
      billingMode: "qty",
      isVariation: true,
      variationRef: "VO-01",
      contractQty: 20,
      unitRate: 500,
      ...voCalc,
    },
  ];

  const summary = summarizeBoqLines(lines);
  assert.equal(summary.originalContractTotal, 80000);
  assert.equal(summary.variationsTotal, 10000);
  assert.equal(summary.revisedContractTotal, 90000);
  assert.equal(summary.previousTotal, 37000);
  assert.equal(summary.currentTotal, 39000); // 25,000 + 9,000 + 5,000
  assert.equal(summary.cumulativeTotal, 76000);
  assert.equal(summary.remainingTotal, 14000);
  assert.equal(summary.sections.length, 3);
  assert.equal(computeBoqContractAmount(20, 500), 10000);

  // Feed BOQ Current Total into computeSubCert (10% retention, 15% VAT)
  const cert = computeSubCert({
    grossAmount: summary.currentTotal,
    retentionPercent: 10,
    advanceRecovery: 2000,
    otherDeductions: 500,
    chargebackDeductions: 1000,
    vatPercent: 15,
  });
  assert.equal(cert.retentionAmount, 3900);
  assert.equal(cert.vatAmount, 5850);
  assert.equal(cert.netPayable, 37450); // 39000 - 3900 - 2000 - 500 - 1000 + 5850
});

console.log(`\nAll ${passed} Subcontractor BOQ verification tests passed!`);
