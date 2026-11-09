// Rewrites physical-direction Tailwind classes to logical ones so the UI follows `dir` instead of
// assuming left-to-right. Kept in the repo so the sweep is auditable and repeatable.
//
//   node scripts/rtl-codemod.mjs --check         report what would change
//   node scripts/rtl-codemod.mjs client/src/pages  rewrite a directory
//
// Only plain quoted strings are touched. Template literals are skipped entirely, which is what keeps
// the printed-HTML blocks (document.write(`…`)) out of reach. Files whose physical direction is
// deliberate are blocked outright: printed and exported documents render on paper, not in the app,
// and the frozen-column grid computes its offsets in JavaScript.
import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, posix, sep } from "node:path";

const BLOCKED = new Set([
  // printed documents: their layout is paper, and @media print rules use physical offsets
  "client/src/components/ncr-form-dialog.tsx",
  "client/src/components/si-form-dialog.tsx",
  "client/src/components/wir-form-dialog.tsx",
  "client/src/components/snag-item-report-dialog.tsx",
  "client/src/components/snag-list-report-dialog.tsx",
  "client/src/components/request-forms-export-dialog.tsx",
  "client/src/components/procurement/po-details-print-dialog.tsx",
  // frozen columns positioned from a cumulative-width array in JS
  "client/src/components/progress-matrix/matrix-grid.tsx",
  // already written with explicit rtl: variants
  "client/src/pages/ProjectCreatePo.tsx",
]);

// Order matters: the longer prefixes have to be tried before the shorter ones.
const RULES = [
  [/\brounded-tl-/g, "rounded-ss-"],
  [/\brounded-tr-/g, "rounded-se-"],
  [/\brounded-bl-/g, "rounded-es-"],
  [/\brounded-br-/g, "rounded-ee-"],
  [/\brounded-l-/g, "rounded-s-"],
  [/\brounded-r-/g, "rounded-e-"],
  [/\brounded-l\b/g, "rounded-s"],
  [/\brounded-r\b/g, "rounded-e"],
  [/\bborder-l-/g, "border-s-"],
  [/\bborder-r-/g, "border-e-"],
  [/\bborder-l\b/g, "border-s"],
  [/\bborder-r\b/g, "border-e"],
  [/\btext-left\b/g, "text-start"],
  [/\btext-right\b/g, "text-end"],
  [/(^|[\s:[\]])-ml-/g, "$1-ms-"],
  [/(^|[\s:[\]])-mr-/g, "$1-me-"],
  [/(^|[\s:[\]])ml-/g, "$1ms-"],
  [/(^|[\s:[\]])mr-/g, "$1me-"],
  [/(^|[\s:[\]])pl-/g, "$1ps-"],
  [/(^|[\s:[\]])pr-/g, "$1pe-"],
];

// A string is treated as a class list only if it reads like one: Tailwind tokens, no spaces-with-prose.
const CLASSY = /^[\w\s:[\]()\-/.,#%&>*+~='"!]*$/;

function rewriteStrings(source) {
  let changed = 0;
  // Double-quoted literals only. Every className in this codebase uses them, and pairing single quotes
  // as well desynchronises on the first apostrophe in prose, silently skipping the rest of the file.
  // Backtick templates are left alone on purpose, which is what keeps printed HTML out of reach.
  const out = source.replace(/"([^"\\\r\n]*)"/g, (whole, body) => {
    if (!body || !CLASSY.test(body)) return whole;
    let next = body;
    for (const [re, to] of RULES) next = next.replace(re, to);
    if (next === body) return whole;
    changed++;
    return `"${next}"`;
  });
  return { out, changed };
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(tsx|ts)$/.test(name)) acc.push(full);
  }
  return acc;
}

const args = process.argv.slice(2);
const check = args.includes("--check");
const roots = args.filter((a) => !a.startsWith("--"));
if (!roots.length) roots.push("client/src");

let files = 0;
let edits = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    const rel = file.split(sep).join(posix.sep);
    if (BLOCKED.has(rel)) continue;
    const src = readFileSync(file, "utf8");
    const { out, changed } = rewriteStrings(src);
    if (!changed) continue;
    files++;
    edits += changed;
    if (!check) writeFileSync(file, out, "utf8");
    console.log(`${check ? "would change" : "changed"}  ${rel}  (${changed} strings)`);
  }
}
console.log(`\n${check ? "would touch" : "touched"} ${edits} strings in ${files} files`);
