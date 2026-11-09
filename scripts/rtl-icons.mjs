// Directional icons: an arrow or chevron that means back, next, or "expand into" has to turn with the
// reading direction. Vertical icons (ChevronDown/Up) and non-directional ones are untouched.
//
// Two groups, because the codebase already contains both conventions:
//   - icons written for LTR (ArrowLeft = back)  → rtl:rotate-180
//   - icons written for RTL (ArrowRight = back) → ltr:rotate-180
// Either way the arrow ends up pointing at the inline start in both languages, and no imports move.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, posix, sep } from "node:path";

// ArrowRight already used as "back" in the Arabic pages, by file and 1-based line
const BACK_IS_RIGHT = {
  "client/src/pages/PermitDetail.tsx": [127],
  "client/src/pages/ProjectPurchaseOrderDetail.tsx": [149],
  "client/src/pages/ProjectWarehouse.tsx": [215],
  "client/src/pages/ProjectCreatePo.tsx": [224],
  "client/src/components/payments/reports-library-tab.tsx": [1001],
};

const ICON = /<(ArrowLeft|ArrowRight|ChevronLeft|ChevronRight|ChevronsLeft|ChevronsRight)(\s[^>]*?)?\/>/g;

function addVariant(tag, name, attrs, variant) {
  if (/rotate-180/.test(attrs ?? "")) return tag;
  const a = attrs ?? "";
  if (/className="([^"]*)"/.test(a)) {
    return `<${name}${a.replace(/className="([^"]*)"/, (_m, c) => `className="${c} ${variant}"`)}/>`;
  }
  return `<${name}${a || " "}className="${variant}" />`;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx$/.test(name)) acc.push(full);
  }
  return acc;
}

let edits = 0;
let files = 0;
for (const file of walk("client/src")) {
  const rel = file.split(sep).join(posix.sep);
  const src = readFileSync(file, "utf8");
  const backLines = new Set(BACK_IS_RIGHT[rel] ?? []);

  let changed = 0;
  // line-wise so the "back is right" exceptions can be addressed by line number
  const out = src
    .split("\n")
    .map((line, i) => {
      const variant = backLines.has(i + 1) ? "ltr:rotate-180" : "rtl:rotate-180";
      return line.replace(ICON, (tag, name, attrs) => {
        const next = addVariant(tag, name, attrs, variant);
        if (next !== tag) changed++;
        return next;
      });
    })
    .join("\n");

  if (!changed) continue;
  files++;
  edits += changed;
  writeFileSync(file, out, "utf8");
  console.log(`${rel}  (${changed})`);
}
console.log(`\nturned ${edits} icons in ${files} files`);
