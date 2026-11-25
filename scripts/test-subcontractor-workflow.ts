// Verification suite for shared/subcontractor-workflow.ts
// Run: npx tsx scripts/test-subcontractor-workflow.ts
import assert from "node:assert/strict";
import {
  DEFAULT_VO_THRESHOLD_PERCENT,
  SUBCONTRACTOR_WORKFLOW_STAGES,
  SUBCONTRACTOR_WORKFLOW_STAGE_KEYS,
  isVoApprovalRequired,
  normalizeVoThresholdPercent,
  resolveStageAccess,
} from "../shared/subcontractor-workflow";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  PASS  ${name}`);
}

console.log("Running Subcontractor Workflow & Delegation Tests...\n");

test("1. All 6 standard subcontractor workflow stages are defined consistently", () => {
  assert.equal(SUBCONTRACTOR_WORKFLOW_STAGE_KEYS.length, 6);
  assert.equal(SUBCONTRACTOR_WORKFLOW_STAGES.length, 6);
  assert.equal(DEFAULT_VO_THRESHOLD_PERCENT, 10);
  const keys = SUBCONTRACTOR_WORKFLOW_STAGES.map((s) => s.key);
  assert.deepEqual(keys, [...SUBCONTRACTOR_WORKFLOW_STAGE_KEYS]);
  for (const s of SUBCONTRACTOR_WORKFLOW_STAGES) {
    assert.equal(s.module, "subcontractors");
    assert.ok(s.titleAr.length > 0 && s.titleEn.length > 0);
  }
});

test("2. Major VO threshold: 0 VOs never require approval; 0% threshold requires approval for any VO", () => {
  assert.equal(isVoApprovalRequired(100000, 0, 10), false);
  assert.equal(isVoApprovalRequired(100000, 0, 0), false);
  assert.equal(isVoApprovalRequired(100000, 1, 0), true);
});

test("3. Major VO threshold: exact boundary vs exceeded at 10% and 5%", () => {
  // 10% of 100,000 = 10,000
  assert.equal(isVoApprovalRequired(100000, 5000, 10), false);
  assert.equal(isVoApprovalRequired(100000, 10000, 10), false);
  assert.equal(isVoApprovalRequired(100000, 10001, 10), true);

  // 5% of 100,000 = 5,000
  assert.equal(isVoApprovalRequired(100000, 5000, 5), false);
  assert.equal(isVoApprovalRequired(100000, 5000.5, 5), true);

  // VO-only contract (0 original scope) always triggers approval
  assert.equal(isVoApprovalRequired(0, 2500, 10), true);
});

test("4. Threshold normalization clamps to 0..100 and falls back to 10%", () => {
  assert.equal(normalizeVoThresholdPercent("10"), 10);
  assert.equal(normalizeVoThresholdPercent("0"), 0);
  assert.equal(normalizeVoThresholdPercent(-5), 0);
  assert.equal(normalizeVoThresholdPercent(150), 100);
  assert.equal(normalizeVoThresholdPercent("invalid"), 10);
});

test("5. Stage access resolution: Default Mode vs Custom Delegation vs Super Admin", () => {
  // Default mode (hasConfig: false) -> uses fallback
  const defAllow = resolveStageAccess({ allowed: true, hasConfig: false, assignedMembers: [] }, true, false);
  assert.equal(defAllow.allowed, true);
  assert.equal(defAllow.viaDelegation, false);

  const defDeny = resolveStageAccess({ allowed: true, hasConfig: false, assignedMembers: [] }, false, false);
  assert.equal(defDeny.allowed, false);
  assert.equal(defDeny.viaDelegation, false);

  // Custom delegation (hasConfig: true) -> overrides fallback strictly
  const delAllow = resolveStageAccess(
    { allowed: true, hasConfig: true, assignedMembers: [{ id: "m1", name: "Eng. Ali" }] },
    false,
    false,
  );
  assert.equal(delAllow.allowed, true);
  assert.equal(delAllow.viaDelegation, true);
  assert.deepEqual(delAllow.assignedNames, ["Eng. Ali"]);

  const delDeny = resolveStageAccess(
    { allowed: false, hasConfig: true, assignedMembers: [{ id: "m1", name: "Eng. Ali" }] },
    true,
    false,
  );
  assert.equal(delDeny.allowed, false);
  assert.equal(delDeny.viaDelegation, true);
  assert.deepEqual(delDeny.assignedNames, ["Eng. Ali"]);

  // Super Admin retains emergency override
  const superOverride = resolveStageAccess(
    { allowed: false, hasConfig: true, assignedMembers: [{ id: "m1", name: "Eng. Ali" }] },
    false,
    true,
  );
  assert.equal(superOverride.allowed, true);
});

console.log(`\nAll ${passed} Subcontractor Workflow tests passed!`);
