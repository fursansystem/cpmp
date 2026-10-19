// مصفوفة أوزان ونسب الإنجاز (Progress Matrix) — pure calculation shared by server and client,
// so both sides always compute identical percentages.
//
// Rows: WBS tree (phases → items → optional sub-items). A node's weight is its % among siblings.
// Columns: units (work_locations), each with a share of the whole project.
// Cell: completion % of a leaf item in a unit.

export type UnitWeightMode = "equal" | "area" | "value" | "manual";
export const UNIT_WEIGHT_MODES: UnitWeightMode[] = ["equal", "area", "value", "manual"];

export type CellSource = "manual" | "wir" | "override";
export type CertificateStatus = "draft" | "submitted" | "approved" | "paid" | "rejected";
export type CertificateAction = "submit" | "withdraw" | "approve" | "reject" | "pay";

// Compact cell: [unitIdx, nodeIdx, percent, flags] — indexes into the payload's units/nodes arrays.
export type CompactCell = [number, number, number, number];
export const CELL_LOCKED = 1;
export const CELL_WIR = 2;
export const CELL_OVERRIDE = 4;

export interface PmNode {
  id: string;
  parentId: string | null;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  weight: number;
  sortOrder: number;
  workListActivityId?: string | null;
  workLevelId?: string | null;
}

export interface PmUnit {
  id: string; // work_location_id
  label: string; // unit_custom_number (Villa No)
  buildingNo?: string | null;
  flatNo?: string | null;
  floor?: string | null;
  villaType?: string | null;
  areaM2?: number | null;
  unitValue?: number | null; // override; falls back to settings.defaultUnitValue
  manualWeight?: number | null;
  included: boolean;
}

export interface PmTree {
  nodes: PmNode[];
  byId: Map<string, PmNode>;
  children: Map<string | null, PmNode[]>;
  roots: PmNode[];
  order: PmNode[]; // depth-first display order
  depth: Map<string, number>;
  leaves: PmNode[];
  isLeaf: (id: string) => boolean;
  localShare: Map<string, number>; // 0..1 among siblings (normalized)
  globalWeight: Map<string, number>; // 0..1 of the whole WBS; leaves sum to 1
  ancestors: Map<string, string[]>; // [self, parent, ..., root]
}

const sortNodes = (a: PmNode, b: PmNode) =>
  a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, undefined, { numeric: true });

export function buildTree(nodes: PmNode[]): PmTree {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string | null, PmNode[]>();
  for (const n of nodes) {
    // Orphans (parent missing) are treated as roots so nothing silently disappears.
    const key = n.parentId && byId.has(n.parentId) ? n.parentId : null;
    if (!children.has(key)) children.set(key, []);
    children.get(key)!.push(n);
  }
  children.forEach((list) => list.sort(sortNodes));

  const localShare = new Map<string, number>();
  children.forEach((list) => {
    const sum = list.reduce((s, n) => s + Math.max(0, n.weight || 0), 0);
    for (const n of list) {
      localShare.set(n.id, sum > 0 ? Math.max(0, n.weight || 0) / sum : 1 / list.length);
    }
  });

  const roots = children.get(null) || [];
  const order: PmNode[] = [];
  const depth = new Map<string, number>();
  const globalWeight = new Map<string, number>();
  const ancestors = new Map<string, string[]>();
  const visit = (n: PmNode, d: number, parentGw: number, chain: string[]) => {
    if (depth.has(n.id)) return; // guard against cycles
    order.push(n);
    depth.set(n.id, d);
    const gw = parentGw * (localShare.get(n.id) ?? 0);
    globalWeight.set(n.id, gw);
    const myChain = [n.id, ...chain];
    ancestors.set(n.id, myChain);
    for (const c of children.get(n.id) || []) visit(c, d + 1, gw, myChain);
  };
  for (const r of roots) visit(r, 0, 1, []);

  const isLeaf = (id: string) => !(children.get(id)?.length);
  const leaves = order.filter((n) => isLeaf(n.id));
  return { nodes, byId, children, roots, order, depth, leaves, isLeaf, localShare, globalWeight, ancestors };
}

export interface SiblingIssue {
  parentId: string | null;
  sum: number;
  count: number;
}

// Sibling groups whose weights don't add up to 100%.
export function siblingWeightIssues(tree: PmTree, tolerance = 0.01): SiblingIssue[] {
  const issues: SiblingIssue[] = [];
  tree.children.forEach((list, parentId) => {
    const sum = list.reduce((s, n) => s + (n.weight || 0), 0);
    if (Math.abs(sum - 100) > tolerance) issues.push({ parentId, sum: round(sum, 4), count: list.length });
  });
  return issues;
}

export function effectiveUnitValue(unit: PmUnit, defaultUnitValue: number): number {
  return unit.unitValue != null ? unit.unitValue : defaultUnitValue || 0;
}

// Share (0..1) of each unit in the whole project. Excluded units get 0.
// Falls back to equal shares when the chosen basis sums to zero.
export function unitShares(units: PmUnit[], mode: UnitWeightMode, defaultUnitValue: number): Float64Array {
  const basis = new Float64Array(units.length);
  units.forEach((u, i) => {
    if (!u.included) return;
    if (mode === "area") basis[i] = Math.max(0, u.areaM2 || 0);
    else if (mode === "value") basis[i] = Math.max(0, effectiveUnitValue(u, defaultUnitValue));
    else if (mode === "manual") basis[i] = Math.max(0, u.manualWeight || 0);
    else basis[i] = 1;
  });
  let sum = 0;
  for (let i = 0; i < basis.length; i++) sum += basis[i];
  if (sum <= 0) {
    const n = units.filter((u) => u.included).length;
    units.forEach((u, i) => { basis[i] = u.included && n > 0 ? 1 : 0; });
    sum = n;
  }
  if (sum > 0) for (let i = 0; i < basis.length; i++) basis[i] /= sum;
  return basis;
}

export interface MatrixSummary {
  tree: PmTree;
  unitShare: Float64Array; // 0..1
  unitValue: Float64Array; // effective money value per unit
  unitProgress: Float64Array; // 0..100
  nodeUnit: Map<string, Float64Array>; // node completion per unit, 0..100
  nodeProject: Map<string, number>; // node completion across the project, 0..100
  projectProgress: number; // 0..100
  totalValue: number;
  issues: SiblingIssue[];
}

export interface SummaryInput {
  nodes: PmNode[];
  units: PmUnit[];
  cells: CompactCell[];
  unitWeightMode: UnitWeightMode;
  defaultUnitValue: number;
  tree?: PmTree;
}

// One pass over stored cells. Cells on non-leaf nodes (stale) are ignored.
export function computeSummary(input: SummaryInput): MatrixSummary {
  const { nodes, units, cells, unitWeightMode, defaultUnitValue } = input;
  const tree = input.tree ?? buildTree(nodes);
  const nU = units.length;
  const unitShare = unitShares(units, unitWeightMode, defaultUnitValue);
  const unitValue = new Float64Array(nU);
  let totalValue = 0;
  units.forEach((u, i) => {
    unitValue[i] = effectiveUnitValue(u, defaultUnitValue);
    if (u.included) totalValue += unitValue[i];
  });

  const nodeUnit = new Map<string, Float64Array>();
  for (const n of tree.order) nodeUnit.set(n.id, new Float64Array(nU));

  // ratio of a leaf inside each ancestor = product of local shares from leaf up to (excluding) the ancestor
  const leafRatios = new Map<string, Array<[Float64Array, number]>>();
  for (const leaf of tree.leaves) {
    const chain = tree.ancestors.get(leaf.id) || [leaf.id];
    const list: Array<[Float64Array, number]> = [];
    let ratio = 1;
    for (const ancId of chain) {
      list.push([nodeUnit.get(ancId)!, ratio]);
      ratio *= tree.localShare.get(ancId) ?? 0;
    }
    leafRatios.set(leaf.id, list);
  }

  for (const [u, nIdx, pct] of cells) {
    const node = nodes[nIdx];
    if (!node || u < 0 || u >= nU) continue;
    const list = leafRatios.get(node.id);
    if (!list) continue; // not a leaf any more
    for (const [arr, ratio] of list) arr[u] += ratio * pct;
  }

  const unitProgress = new Float64Array(nU);
  for (const r of tree.roots) {
    const arr = nodeUnit.get(r.id);
    const share = tree.localShare.get(r.id) ?? 0;
    if (!arr) continue;
    for (let u = 0; u < nU; u++) unitProgress[u] += share * arr[u];
  }

  const nodeProject = new Map<string, number>();
  nodeUnit.forEach((arr, id) => {
    let s = 0;
    for (let u = 0; u < nU; u++) s += unitShare[u] * arr[u];
    nodeProject.set(id, s);
  });

  let projectProgress = 0;
  for (let u = 0; u < nU; u++) projectProgress += unitShare[u] * unitProgress[u];

  return {
    tree, unitShare, unitValue, unitProgress, nodeUnit, nodeProject, projectProgress, totalValue,
    issues: siblingWeightIssues(tree),
  };
}

// Contribution (0..100 of the unit) of each phase (root) for one unit.
export function phaseContributions(summary: MatrixSummary, unitIdx: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of summary.tree.roots) {
    const share = summary.tree.localShare.get(r.id) ?? 0;
    out[r.code] = round(share * (summary.nodeUnit.get(r.id)?.[unitIdx] ?? 0), 4);
  }
  return out;
}

export interface UnitFinancials {
  value: number;
  earnedPct: number;
  earnedAmount: number;
  pendingPct: number; // submitted + approved certificates
  pendingAmount: number;
  paidPct: number;
  paidAmount: number;
  remainingAmount: number; // value − earned
  claimablePct: number; // earned − (pending + paid), never negative
  claimableAmount: number;
}

export function unitFinancials(value: number, earnedPct: number, pendingPct: number, paidPct: number): UnitFinancials {
  const amt = (p: number) => round((value * p) / 100, 2);
  const claimablePct = Math.max(0, earnedPct - pendingPct - paidPct);
  return {
    value,
    earnedPct,
    earnedAmount: amt(earnedPct),
    pendingPct,
    pendingAmount: amt(pendingPct),
    paidPct,
    paidAmount: amt(paidPct),
    remainingAmount: round(value - amt(earnedPct), 2),
    claimablePct,
    claimableAmount: amt(claimablePct),
  };
}

// Payment certificate line: current = cumulative − already certified (submitted/approved/paid). Never negative.
// The amount uses the unrounded percent so certificate totals match earned value to the cent.
export function certificateLine(unitValue: number, cumulativePct: number, previousPct: number) {
  const raw = Math.max(0, cumulativePct - previousPct);
  return {
    cumulativePercent: round(cumulativePct, 4),
    previousPercent: round(previousPct, 4),
    currentPercent: round(raw, 4),
    amount: round((unitValue * raw) / 100, 2),
  };
}

// Allowed certificate transitions: action → [from statuses, to status]
export const CERTIFICATE_TRANSITIONS: Record<CertificateAction, { from: CertificateStatus[]; to: CertificateStatus }> = {
  submit: { from: ["draft"], to: "submitted" },
  withdraw: { from: ["submitted"], to: "draft" },
  approve: { from: ["submitted"], to: "approved" },
  reject: { from: ["submitted", "approved"], to: "rejected" },
  pay: { from: ["approved"], to: "paid" },
};

export const CERTIFIED_STATUSES: CertificateStatus[] = ["submitted", "approved", "paid"];
export const PENDING_STATUSES: CertificateStatus[] = ["submitted", "approved"];

export function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

// ---- API payload shapes ----

export interface MatrixPermissions {
  canView: boolean;
  canEdit: boolean;
  canOverrideLocked: boolean;
  canSubmitCertificate: boolean;
  canApproveCertificate: boolean;
  canMarkPaid: boolean;
}

export interface MatrixPayloadNode extends PmNode {
  activityCode?: string | null;
  activityName?: string | null;
  levelName?: string | null;
}

export interface MatrixPayload {
  project: { id: string; name: string; progress: number };
  settings: { unitWeightMode: UnitWeightMode; defaultUnitValue: number; driveProjectProgress: boolean };
  nodes: MatrixPayloadNode[];
  units: PmUnit[];
  cells: CompactCell[];
  // [unitIdx, draftPct, pendingPct, paidPct]
  certTotals: Array<[number, number, number, number]>;
  permissions: MatrixPermissions;
}
