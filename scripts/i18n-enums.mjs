// Point the screens at the locale-aware enum resolver instead of the shared constant maps.
//
// The `*_LABELS` maps are evaluated once at module load, so they can only hold one language. On screen
// the name has to follow the reader, which is what `enumText(group, code)` does.
//
// Three shapes are rewritten, in this order:
//   X_LABELS[expr as keyof typeof X_LABELS] ?? fallback   ->  enumText("group", expr)
//   X_LABELS[expr as keyof typeof X_LABELS]               ->  enumText("group", expr)
//   X_LABELS[expr]                                        ->  enumText("group", expr)
// A bare `X_LABELS` left after that (passed as a prop, or iterated to build Select options) is
// reported, not rewritten — those need a human.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, posix, sep } from "node:path";

const GROUPS = {
  SUB_CERT_LABELS: "sub_cert",
  CHARGEBACK_LABELS: "chargeback",
  BILL_REQUEST_LABELS: "bill_request",
  PAYMENT_ORDER_LABELS: "payment_order",
  FINE_LABELS: "fine",
  LIABLE_PARTY_LABELS: "liable_party",
  PAYMENT_METHOD_LABELS: "payment_method",
  PERMIT_STATUS_LABELS: "permit_status",
  PERMIT_KIND_LABELS: "permit_kind",
  STEP_STATUS_LABELS: "step_status",
  REQUIREMENT_KIND_LABELS: "requirement_kind",
  REQUIREMENT_STATUS_LABELS: "requirement_status",
  STEP_PARTY_LABELS: "step_party",
  PERMIT_CATEGORY_LABELS: "permit_category",
  PERMIT_ATTENTION_LABELS: "permit_attention",
  RECEIPT_SOURCE_LABELS: "receipt_source",
  MANUAL_MOVEMENT_LABELS: "manual_movement",
};

// Printed documents keep both languages on purpose, so they keep reading the shared maps.
const BLOCKED = new Set([
  "client/src/components/payments/orders-tab.tsx",
  "client/src/components/payments/reports-library-tab.tsx",
  "client/src/components/payments/reports-tab.tsx",
  "client/src/components/procurement/po-details-print-dialog.tsx",
]);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(tsx|ts)$/.test(name)) acc.push(full);
  }
  return acc;
}

const check = process.argv.includes("--check");
const leftovers = [];
let files = 0;
let edits = 0;

for (const file of walk("client/src")) {
  const rel = file.split(sep).join(posix.sep);
  if (rel.endsWith("lib/enums.ts")) continue;
  let s = readFileSync(file, "utf8");
  if (!/_LABELS/.test(s)) continue;

  let changed = 0;
  for (const [name, group] of Object.entries(GROUPS)) {
    if (!s.includes(name)) continue;
    if (BLOCKED.has(rel)) continue;

    // index with a cast and a fallback, then with a cast, then bare
    const patterns = [
      new RegExp(`${name}\\[([^\\]]+?) as keyof typeof ${name}\\]\\s*\\?\\?\\s*[\\w.$?]+`, "g"),
      new RegExp(`${name}\\[([^\\]]+?) as keyof typeof ${name}\\]`, "g"),
      new RegExp(`${name}\\[([^\\]]+?)\\]`, "g"),
    ];
    for (const re of patterns) {
      s = s.replace(re, (_m, expr) => {
        changed++;
        return `enumText("${group}", ${expr.trim()})`;
      });
    }
  }

  // anything still naming a map here needs eyes
  for (const name of Object.keys(GROUPS)) {
    if (!new RegExp(`\\b${name}\\b`).test(s)) continue;
    for (const [i, line] of s.split(/\r?\n/).entries()) {
      if (line.includes(name) && !line.startsWith("import")) leftovers.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
    }
  }

  if (!changed) continue;
  files++;
  edits += changed;
  if (!check) writeFileSync(file, s, "utf8");
  console.log(`${check ? "would rewrite" : "rewrote"}  ${rel}  (${changed})`);
}

console.log(`\n${check ? "would rewrite" : "rewrote"} ${edits} lookups in ${files} files`);
if (leftovers.length) {
  console.log(`\n${leftovers.length} place(s) still naming a map — review by hand:`);
  for (const l of leftovers) console.log("   " + l);
}
