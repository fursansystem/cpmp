import assert from "node:assert/strict";
import {
  PAYMENT_ORDER_STATUSES,
  STANDING_IPC_ORDER_STATUSES,
  isStandingIpcOrderStatus,
} from "../shared/payments";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`PASS: ${name}`);
}

test("Only 'cancelled' releases an IPC; all other payment order statuses block creating a second order", () => {
  for (const status of PAYMENT_ORDER_STATUSES) {
    if (status === "cancelled") {
      assert.equal(isStandingIpcOrderStatus(status), false, "cancelled must not block a replacement IPC order");
    } else {
      assert.equal(isStandingIpcOrderStatus(status), true, `${status} must block creating a second IPC order`);
    }
  }
});

test("Transfer requests ('requested', 'request_approved') and 'rejected' orders are included in STANDING_IPC_ORDER_STATUSES", () => {
  const standingSet = new Set<string>(STANDING_IPC_ORDER_STATUSES);
  assert.equal(standingSet.has("requested"), true);
  assert.equal(standingSet.has("request_approved"), true);
  assert.equal(standingSet.has("draft"), true);
  assert.equal(standingSet.has("pending_approval"), true);
  assert.equal(standingSet.has("approved"), true);
  assert.equal(standingSet.has("paid"), true);
  assert.equal(standingSet.has("rejected"), true);
  assert.equal(standingSet.has("cancelled"), false);
});

test("Null/undefined/unknown statuses return false safely", () => {
  assert.equal(isStandingIpcOrderStatus(null), false);
  assert.equal(isStandingIpcOrderStatus(undefined), false);
  assert.equal(isStandingIpcOrderStatus(""), false);
  assert.equal(isStandingIpcOrderStatus("unknown_status"), false);
});

console.log(`\nAll ${passed} single-IPC-order tests passed.`);
