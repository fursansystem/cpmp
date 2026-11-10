// Measures how much text is still written into the code instead of coming from shared/i18n.
//
//   node scripts/i18n-scan.mjs            every area, worst first
//   node scripts/i18n-scan.mjs --done     only the areas declared finished; exits 1 if any regressed
//   node scripts/i18n-scan.mjs payments   one area
//
// The `--done` list is the point of this script. An area is added to it the moment its last string
// moves to the catalogue, and from then on CI fails if anyone writes a literal back into it. That is
// what stops a long migration from sliding backwards while it is still in progress.
//
// The project has no linter, so this stands in for an eslint rule. It is deliberately a single file
// with no dependencies.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix, sep } from "node:path";

const ARABIC = /[؀-ۿ]/;

// Areas already migrated. Adding one here makes its regressions fail the build.
const DONE = [
  "payments",
  "permits",
  "procurement",
  "progress",
  "projects",
  "server",
  "settings",
  "shared",
  "shell",
  "warehouse",
];

// Arabic the code COMPARES rather than displays. Translating any of these breaks authorisation, a
// lookup or a status mapping, so they are not findings — they are load-bearing values.
// See the plan: positions are editable in the UI today, which is a real bug filed separately.
const IDENTIFIERS = [
  "مدير مشروع",
  "محاسب",
  "أمين مستودع",
  "أمين المستودع",
  "سلة المحذوفات",
  "شيك",
  "نقد",
  "دفعة مقدمة",
  "استشاري",
  "مقاول",
  "مرفوض",
  // the HTTP status ladder in server/routes.ts matches on these substrings
  "غير موجود",
  "غير موجودة",
  "تعارض",
  "لا يمكن",
  "يجب",
  "مطلوب",
  "لا ينتمي",
  "لا تنتمي",
  "مربوطة",
];

// Files whose Arabic is data or paper, not interface.
const EXEMPT_FILES = [
  "shared/i18n/",
  "server/permit-catalog-seed.ts", // the licence catalogue stays Arabic by decision
  "migrate_",
  "seed",
  "-print",
  "-export",
];

const AREAS = {
  payments: ["client/src/components/payments", "client/src/pages/Payments.tsx", "client/src/pages/Reports.tsx"],
  permits: ["client/src/components/permits", "client/src/pages/Permits.tsx", "client/src/pages/PermitDetail.tsx", "client/src/pages/Services.tsx"],
  warehouse: ["client/src/components/warehouse", "client/src/pages/ProjectWarehouse.tsx"],
  procurement: [
    "client/src/components/procurement",
    "client/src/pages/ProjectPurchaseOrders.tsx",
    "client/src/pages/ProjectPurchaseOrderDetail.tsx",
    "client/src/pages/ProjectCreatePo.tsx",
    "client/src/pages/ProjectCreateRfq.tsx",
    "client/src/pages/ProjectRfqDetail.tsx"
  ],
  progress: ["client/src/components/progress-matrix"],
  shell: ["client/src/components/app-sidebar.tsx", "client/src/components/app-header.tsx", "client/src/components/notification-center.tsx", "client/src/components/login-summary.tsx"],
  projects: ["client/src/pages/home.tsx", "client/src/pages/projects.tsx", "client/src/pages/project-detail.tsx"],
  settings: ["client/src/pages/settings.tsx", "client/src/pages/about.tsx"],
  server: ["server"],
  shared: ["shared"],
};

function walk(path, acc = []) {
  let st;
  try {
    st = statSync(path);
  } catch {
    return acc;
  }
  if (st.isFile()) {
    if (/\.(tsx|ts)$/.test(path)) acc.push(path);
    return acc;
  }
  for (const name of readdirSync(path)) walk(join(path, name), acc);
  return acc;
}

const exempt = (rel) => EXEMPT_FILES.some((p) => rel.includes(p));

function findings(file) {
  const rel = file.split(sep).join(posix.sep);
  if (exempt(rel)) return [];
  const out = [];
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    const code = line.replace(/\/\/.*$/, "").replace(/^\s*(\*|\/\*).*/, ""); // comments are not user-facing
    if (!ARABIC.test(code)) continue;
    if (IDENTIFIERS.some((id) => code.includes(id))) continue;
    out.push({ rel, line: i + 1, text: code.trim().slice(0, 100) });
  }
  return out;
}

const args = process.argv.slice(2);
const onlyDone = args.includes("--check") || args.includes("--done");
const verbose = args.includes("-v");
const byFile = args.includes("--files") || args.includes("-f");
const picked = args.filter((a) => !a.startsWith("-"));

const report = [];
for (const [area, paths] of Object.entries(AREAS)) {
  if (picked.length && !picked.includes(area)) continue;
  if (onlyDone && !DONE.includes(area)) continue;
  const hits = paths.flatMap((p) => walk(p)).flatMap(findings);
  report.push({ area, count: hits.length, hits, done: DONE.includes(area) });
}

report.sort((a, b) => b.count - a.count);

let failed = 0;
for (const { area, count, hits, done } of report) {
  const mark = done ? (count ? "REGRESSED" : "clean") : `${count} left`;
  console.log(`${area.padEnd(12)} ${String(count).padStart(5)}  ${mark}`);
  if (done && count) failed += count;
  if (byFile) {
    const fileMap = {};
    for (const h of hits) fileMap[h.rel] = (fileMap[h.rel] || 0) + 1;
    for (const [f, c] of Object.entries(fileMap).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(c).padStart(4)}  ${f}`);
    }
  } else if (verbose || (done && count)) {
    for (const h of hits.slice(0, 20)) console.log(`    ${h.rel}:${h.line}  ${h.text}`);
    if (hits.length > 20) console.log(`    … and ${hits.length - 20} more`);
  }
}

const total = report.reduce((n, r) => n + r.count, 0);
console.log(`\n${total} line(s) still carrying interface text, across ${report.length} area(s).`);
console.log(`Declared finished: ${DONE.length ? DONE.join(", ") : "none yet"}.`);

if (failed) {
  console.error(`\nFAIL: ${failed} literal(s) written back into an area that was finished.`);
  process.exit(1);
}
