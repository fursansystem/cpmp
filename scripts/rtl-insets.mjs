// Second half of the direction sweep: absolutely positioned affordances.
//
// `ms-/me-/ps-/pe-` (scripts/rtl-codemod.mjs) move an element's own spacing, but an element pinned
// with `absolute left-3` stays pinned to the physical left. In an input whose padding just became
// logical, that leaves the search icon on one side and the room for it on the other.
//
// So: inside a class list that positions something (`absolute`), left-/right- become start-/end-.
// Decorative glows are exempt — every one of them carries `blur-*`, and a blurred circle has no
// reading order. `components/ui` is exempt because its left/right classes are Radix's own resolved
// placement (`data-[side=…]`), which is physical on purpose, and those files were fixed by hand.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, posix, sep } from "node:path";

const SKIP_DIRS = ["client/src/components/ui"];
const BLOCKED = new Set([
  "client/src/components/ncr-form-dialog.tsx",
  "client/src/components/si-form-dialog.tsx",
  "client/src/components/wir-form-dialog.tsx",
  "client/src/components/snag-item-report-dialog.tsx",
  "client/src/components/snag-list-report-dialog.tsx",
  "client/src/components/request-forms-export-dialog.tsx",
  "client/src/components/procurement/po-details-print-dialog.tsx",
  "client/src/components/progress-matrix/matrix-grid.tsx",
  "client/src/pages/ProjectCreatePo.tsx",
]);

const STRING = /"((?:\\.|[^"\\\r\n])*)"/g;
const TOKEN = /(^|[\s:])(-?)(left|right)-/g;
const CLASSY = /^[\w\s:[\]()\-/.,#%&>*+~='!]*$/;

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(tsx|ts)$/.test(name)) acc.push(full);
  }
  return acc;
}

const check = process.argv.includes("--check");
let files = 0;
let edits = 0;

for (const file of walk("client/src")) {
  const rel = file.split(sep).join(posix.sep);
  if (SKIP_DIRS.some((d) => rel.startsWith(d)) || BLOCKED.has(rel)) continue;

  let changed = 0;
  const out = readFileSync(file, "utf8").replace(STRING, (whole, body) => {
    if (!body.includes("absolute") || body.includes("blur-") || !CLASSY.test(body)) return whole;
    const next = body.replace(TOKEN, (_m, lead, neg, side) => `${lead}${neg}${side === "left" ? "start" : "end"}-`);
    if (next === body) return whole;
    changed++;
    return `"${next}"`;
  });

  if (!changed) continue;
  files++;
  edits += changed;
  if (!check) writeFileSync(file, out, "utf8");
  console.log(`${check ? "would flip" : "flipped"}  ${rel}  (${changed})`);
}
console.log(`\n${check ? "would flip" : "flipped"} ${edits} class lists in ${files} files`);
