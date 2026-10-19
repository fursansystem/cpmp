// مصفوفة أوزان ونسب الإنجاز + المستخلصات — server-side data access and business rules.
// All percentages are computed with @shared/progress-matrix so server and client agree.
import { randomUUID } from "crypto";
import { db } from "./db";
import { sql, eq, and, inArray } from "drizzle-orm";
import {
  projects, workLocations, workLevels, workListActivities,
  progressMatrixSettings, progressWbsNodes, progressUnits, progressCells,
  progressPaymentCertificates, progressPaymentCertificateLines,
  type ProgressWbsNode,
} from "@shared/schema";
import {
  computeSummary, certificateLine, phaseContributions, round,
  CELL_LOCKED, CELL_WIR, CELL_OVERRIDE, CERTIFICATE_TRANSITIONS, UNIT_WEIGHT_MODES,
  type CompactCell, type MatrixPayload, type MatrixPayloadNode, type MatrixPermissions,
  type PmUnit, type UnitWeightMode, type CertificateAction, type CertificateStatus,
} from "@shared/progress-matrix";
import { notificationWss } from "./websocket";

export class ProgressMatrixError extends Error {
  constructor(public status: number, message: string, public details?: Record<string, unknown>) {
    super(message);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
const rowsOf = <T = any>(result: any): T[] => (result?.rows ?? []) as T[];
const json = (v: unknown) => JSON.stringify(v);

// Equal weights that add up to exactly 100 (remainder goes to the last sibling).
function equalWeights(count: number): number[] {
  if (count <= 0) return [];
  const each = Math.floor((100 / count) * 10000) / 10000;
  const out = Array(count).fill(each);
  out[count - 1] = round(100 - each * (count - 1), 4);
  return out;
}

// ---------- Loading ----------

export interface MatrixData {
  project: { id: string; name: string; progress: number };
  settings: MatrixPayload["settings"];
  nodes: MatrixPayloadNode[];
  units: PmUnit[];
  cells: CompactCell[];
  certTotals: MatrixPayload["certTotals"];
}

export async function loadMatrixData(projectId: string): Promise<MatrixData> {
  // independent queries run in parallel (each is a network round-trip to the database)
  const [projectRows, settingsRows, nodeRows, unitResult, cellRows, certResult] = await Promise.all([
    db.select({ id: projects.id, name: projects.name, progress: projects.progress })
      .from(projects).where(eq(projects.id, projectId)),
    db.select().from(progressMatrixSettings).where(eq(progressMatrixSettings.projectId, projectId)),
    db.select({
      n: progressWbsNodes,
      activityCode: workListActivities.code,
      activityName: workListActivities.nameEnglish,
      levelName: workLevels.nameEnglish,
    })
      .from(progressWbsNodes)
      .leftJoin(workListActivities, eq(workListActivities.id, progressWbsNodes.workListActivityId))
      .leftJoin(workLevels, eq(workLevels.id, progressWbsNodes.workLevelId))
      .where(eq(progressWbsNodes.projectId, projectId)),
    db.execute(sql`
      SELECT wl.id, wl.unit_custom_number, wl.building_no, wl.flat_no, wl.floor, wl.villa_type, wl.area_m2,
             pu.unit_value, pu.manual_weight, COALESCE(pu.included, true) AS included
      FROM work_locations wl
      LEFT JOIN progress_units pu ON pu.work_location_id = wl.id
      WHERE wl.project_id = ${projectId}
      ORDER BY CASE WHEN wl.unit_custom_number ~ '^[0-9]+$' THEN wl.unit_custom_number::numeric END NULLS LAST,
               wl.unit_custom_number, wl.building_no, wl.flat_no, wl.id
    `),
    db.select({
      nodeId: progressCells.nodeId,
      unitId: progressCells.workLocationId,
      percent: progressCells.percent,
      source: progressCells.source,
      locked: progressCells.locked,
    }).from(progressCells).where(eq(progressCells.projectId, projectId)),
    db.execute(sql`
      SELECT l.work_location_id, c.status, SUM(l.current_percent) AS pct
      FROM progress_payment_certificate_lines l
      JOIN progress_payment_certificates c ON c.id = l.certificate_id
      WHERE c.project_id = ${projectId} AND c.status <> 'rejected'
      GROUP BY l.work_location_id, c.status
    `),
  ]);
  const [project] = projectRows;
  if (!project) throw new ProgressMatrixError(404, "Project not found");

  const [settingsRow] = settingsRows;
  const mode = settingsRow?.unitWeightMode as UnitWeightMode;
  const settings = {
    unitWeightMode: UNIT_WEIGHT_MODES.includes(mode) ? mode : "equal",
    defaultUnitValue: num(settingsRow?.defaultUnitValue),
    driveProjectProgress: settingsRow?.driveProjectProgress ?? false,
  };

  const nodes: MatrixPayloadNode[] = nodeRows.map(({ n, activityCode, activityName, levelName }) => ({
    id: n.id,
    parentId: n.parentId,
    code: n.code,
    nameAr: n.nameAr,
    nameEn: n.nameEn,
    weight: num(n.weight),
    sortOrder: n.sortOrder,
    workListActivityId: n.workListActivityId,
    workLevelId: n.workLevelId,
    activityCode: activityCode ?? null,
    activityName: activityName ?? null,
    levelName: levelName ?? null,
  }));

  const units: PmUnit[] = rowsOf(unitResult).map((r) => ({
    id: r.id,
    label: r.unit_custom_number || r.flat_no || String(r.id).slice(0, 8),
    buildingNo: r.building_no,
    flatNo: r.flat_no,
    floor: r.floor,
    villaType: r.villa_type,
    areaM2: numOrNull(r.area_m2),
    unitValue: numOrNull(r.unit_value),
    manualWeight: numOrNull(r.manual_weight),
    included: r.included !== false,
  }));

  const unitIdx = new Map(units.map((u, i) => [u.id, i]));
  const nodeIdx = new Map(nodes.map((n, i) => [n.id, i]));
  const cells: CompactCell[] = [];
  for (const c of cellRows) {
    const u = unitIdx.get(c.unitId);
    const n = nodeIdx.get(c.nodeId);
    if (u === undefined || n === undefined) continue;
    const flags = (c.locked ? CELL_LOCKED : 0) | (c.source === "wir" ? CELL_WIR : 0) | (c.source === "override" ? CELL_OVERRIDE : 0);
    cells.push([u, n, num(c.percent), flags]);
  }

  const certRows = rowsOf(certResult);
  const totals = new Map<number, [number, number, number, number]>();
  for (const r of certRows) {
    const u = unitIdx.get(r.work_location_id);
    if (u === undefined) continue;
    const t = totals.get(u) ?? [u, 0, 0, 0];
    const pct = num(r.pct);
    if (r.status === "draft") t[1] += pct;
    else if (r.status === "paid") t[3] += pct;
    else t[2] += pct; // submitted + approved = pending
    totals.set(u, t);
  }

  return { project, settings, nodes, units, cells, certTotals: Array.from(totals.values()) };
}

export async function getMatrixPayload(projectId: string, permissions: MatrixPermissions): Promise<MatrixPayload> {
  const data = await loadMatrixData(projectId);
  return { ...data, permissions };
}

export async function getMatrixSummary(projectId: string) {
  const data = await loadMatrixData(projectId);
  const s = computeSummary({ ...data.settings, nodes: data.nodes, units: data.units, cells: data.cells });
  const [{ count }] = rowsOf(await db.execute(sql`SELECT COUNT(*)::int AS count FROM progress_payment_certificates WHERE project_id = ${projectId}`));
  return {
    projectProgress: round(s.projectProgress, 2),
    nodeCount: data.nodes.length,
    leafCount: s.tree.leaves.length,
    unitCount: data.units.length,
    cellCount: data.cells.length,
    lockedCount: data.cells.filter((c) => c[3] & CELL_LOCKED).length,
    weightIssues: s.issues.length,
    certificateCount: num(count),
    driveProjectProgress: data.settings.driveProjectProgress,
  };
}

// ---------- Recompute + notify ----------

export async function recomputeProjectProgress(projectId: string): Promise<number | null> {
  const [settingsRow] = await db.select().from(progressMatrixSettings).where(eq(progressMatrixSettings.projectId, projectId));
  if (!settingsRow?.driveProjectProgress) return null;
  const data = await loadMatrixData(projectId);
  const s = computeSummary({ ...data.settings, nodes: data.nodes, units: data.units, cells: data.cells });
  const pct = Math.max(0, Math.min(100, Math.round(s.projectProgress)));
  if (pct !== data.project.progress) {
    await db.update(projects).set({ progress: pct }).where(eq(projects.id, projectId));
    notificationWss.broadcastProjectUpdate(projectId);
  }
  return pct;
}

export async function afterChange(projectId: string, userId?: string) {
  try {
    await recomputeProjectProgress(projectId);
  } catch (err) {
    console.error("[ProgressMatrix] recompute failed:", err);
  }
  notificationWss.broadcastProgressMatrixUpdate(projectId, userId);
}

// ---------- Settings & units ----------

export async function updateSettings(projectId: string, userId: string, patch: {
  unitWeightMode?: UnitWeightMode; defaultUnitValue?: number; driveProjectProgress?: boolean;
}) {
  const values = {
    projectId,
    unitWeightMode: patch.unitWeightMode ?? "equal",
    defaultUnitValue: String(patch.defaultUnitValue ?? 0),
    driveProjectProgress: patch.driveProjectProgress ?? false,
    updatedBy: userId,
    updatedAt: new Date(),
  };
  const set: Record<string, unknown> = { updatedBy: userId, updatedAt: new Date() };
  if (patch.unitWeightMode !== undefined) set.unitWeightMode = patch.unitWeightMode;
  if (patch.defaultUnitValue !== undefined) set.defaultUnitValue = String(patch.defaultUnitValue);
  if (patch.driveProjectProgress !== undefined) set.driveProjectProgress = patch.driveProjectProgress;
  await db.insert(progressMatrixSettings).values(values)
    .onConflictDoUpdate({ target: progressMatrixSettings.projectId, set });
}

export interface UnitEntry {
  workLocationId: string;
  unitValue?: number | null;
  manualWeight?: number | null;
  included?: boolean;
}

export async function saveUnits(projectId: string, entries: UnitEntry[]) {
  if (entries.length === 0) return { saved: 0 };
  const ids = Array.from(new Set(entries.map((e) => e.workLocationId)));
  const valid = new Set((await db.select({ id: workLocations.id }).from(workLocations)
    .where(and(eq(workLocations.projectId, projectId), inArray(workLocations.id, ids)))).map((r) => r.id));
  const bad = ids.filter((id) => !valid.has(id));
  if (bad.length) throw new ProgressMatrixError(400, `Units not in this project: ${bad.length}`);

  const rows = entries.map((e) => ({
    id: e.workLocationId,
    has_value: e.unitValue !== undefined,
    unit_value: e.unitValue ?? null,
    has_weight: e.manualWeight !== undefined,
    manual_weight: e.manualWeight ?? null,
    has_included: e.included !== undefined,
    included: e.included ?? true,
  }));
  const data = json(rows);
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO progress_units (project_id, work_location_id)
      SELECT ${projectId}, x.id FROM jsonb_to_recordset(${data}::jsonb) AS x(id varchar)
      ON CONFLICT (work_location_id) DO NOTHING
    `);
    // only the fields present in each entry are changed
    await tx.execute(sql`
      UPDATE progress_units pu SET
        unit_value = CASE WHEN x.has_value THEN x.unit_value ELSE pu.unit_value END,
        manual_weight = CASE WHEN x.has_weight THEN x.manual_weight ELSE pu.manual_weight END,
        included = CASE WHEN x.has_included THEN x.included ELSE pu.included END,
        updated_at = NOW()
      FROM jsonb_to_recordset(${data}::jsonb) AS x(id varchar, has_value boolean, unit_value numeric, has_weight boolean,
           manual_weight numeric, has_included boolean, included boolean)
      WHERE pu.work_location_id = x.id AND pu.project_id = ${projectId}
    `);
  });
  return { saved: rows.length };
}

// ---------- Cells ----------

export interface CellEntry {
  nodeId: string;
  unitId: string;
  percent: number | null; // null clears the cell
  reason?: string | null;
}

export async function saveCells(projectId: string, user: { id: string; role: string }, entries: CellEntry[]) {
  const nodeRows = await db.select({ id: progressWbsNodes.id, code: progressWbsNodes.code, parentId: progressWbsNodes.parentId })
    .from(progressWbsNodes).where(eq(progressWbsNodes.projectId, projectId));
  const parents = new Set(nodeRows.map((n) => n.parentId).filter(Boolean) as string[]);
  const leafCode = new Map(nodeRows.filter((n) => !parents.has(n.id)).map((n) => [n.id, n.code]));
  const unitIds = new Set((await db.select({ id: workLocations.id }).from(workLocations)
    .where(eq(workLocations.projectId, projectId))).map((r) => r.id));

  const byKey = new Map<string, CellEntry>();
  for (const e of entries) {
    if (!leafCode.has(e.nodeId)) throw new ProgressMatrixError(400, "Cell must belong to a leaf item of this project");
    if (!unitIds.has(e.unitId)) throw new ProgressMatrixError(400, "Unit does not belong to this project");
    byKey.set(`${e.nodeId}|${e.unitId}`, e);
  }
  if (byKey.size === 0) return { saved: 0, skippedLocked: 0 };

  const nodeIds = Array.from(new Set(Array.from(byKey.values()).map((e) => e.nodeId)));
  const existing = await db.select().from(progressCells)
    .where(and(eq(progressCells.projectId, projectId), inArray(progressCells.nodeId, nodeIds)));
  const existingByKey = new Map(existing.map((c) => [`${c.nodeId}|${c.workLocationId}`, c]));

  const isAdmin = user.role === "super_admin";
  const upserts: any[] = [];
  const deletes: any[] = [];
  const logs: any[] = [];
  let skippedLocked = 0;

  byKey.forEach((e, key) => {
    const ex = existingByKey.get(key);
    const newPct = e.percent === null || e.percent === undefined ? null : round(Math.max(0, Math.min(100, e.percent)), 2);
    const oldPct = ex ? num(ex.percent) : null;
    if (newPct === oldPct) return;
    const reason = e.reason?.trim() || null;
    let source: string;
    if (ex?.locked) {
      if (!isAdmin || !reason) { skippedLocked++; return; }
      source = "override";
    } else {
      source = "manual";
    }
    const base = { node_id: e.nodeId, unit_id: e.unitId };
    if (newPct === null) deletes.push(base);
    else upserts.push({ ...base, percent: newPct, source, locked: !!ex?.locked, revision_id: ex?.revisionId ?? null });
    logs.push({
      ...base, node_code: leafCode.get(e.nodeId), old_percent: oldPct, new_percent: newPct,
      source, revision_id: ex?.revisionId ?? null, reason,
    });
  });

  // A single locked cell edited without permission is an error; in bulk edits locked cells are just skipped.
  if (skippedLocked > 0 && byKey.size === 1) {
    throw new ProgressMatrixError(403, isAdmin
      ? "A reason is required to change a cell locked by an approved WIR"
      : "This cell is locked by an approved WIR. Only a system admin can change it.");
  }

  if (upserts.length || deletes.length) {
    await db.transaction(async (tx) => {
      if (upserts.length) {
        await tx.execute(sql`
          INSERT INTO progress_cells (project_id, node_id, work_location_id, percent, source, locked, revision_id, updated_by, updated_at)
          SELECT ${projectId}, x.node_id, x.unit_id, x.percent, x.source, x.locked, x.revision_id, ${user.id}, NOW()
          FROM jsonb_to_recordset(${json(upserts)}::jsonb)
               AS x(node_id varchar, unit_id varchar, percent numeric, source text, locked boolean, revision_id varchar)
          ON CONFLICT (node_id, work_location_id) DO UPDATE SET
            percent = EXCLUDED.percent, source = EXCLUDED.source, locked = EXCLUDED.locked,
            revision_id = EXCLUDED.revision_id, updated_by = EXCLUDED.updated_by, updated_at = NOW()
          WHERE progress_cells.locked = false OR EXCLUDED.source = 'override'
        `);
      }
      if (deletes.length) {
        await tx.execute(sql`
          DELETE FROM progress_cells c
          USING jsonb_to_recordset(${json(deletes)}::jsonb) AS x(node_id varchar, unit_id varchar)
          WHERE c.project_id = ${projectId} AND c.node_id = x.node_id AND c.work_location_id = x.unit_id
            AND (c.locked = false OR ${isAdmin})
        `);
      }
      await insertLogs(tx, projectId, user.id, logs);
    });
  }
  return { saved: upserts.length + deletes.length, skippedLocked };
}

async function insertLogs(exec: Executor, projectId: string, userId: string | null, logs: any[]) {
  if (!logs.length) return;
  await exec.execute(sql`
    INSERT INTO progress_cell_logs (project_id, node_id, node_code, work_location_id, old_percent, new_percent, source,
                                    revision_id, request_number, reason, changed_by)
    SELECT ${projectId}, x.node_id, x.node_code, x.unit_id, x.old_percent, x.new_percent, x.source,
           x.revision_id, x.request_number, x.reason, ${userId}
    FROM jsonb_to_recordset(${json(logs)}::jsonb) AS x(node_id varchar, node_code varchar, unit_id varchar,
         old_percent numeric, new_percent numeric, source text, revision_id varchar, request_number varchar, reason text)
  `);
}

// Deletes cells (with a log row each) for the given nodes, optionally only the WIR-locked ones.
async function deleteCellsForNodes(exec: Executor, projectId: string, userId: string | null, nodeIds: string[],
  source: string, opts: { lockedOnly?: boolean; reason?: string } = {}) {
  if (!nodeIds.length) return 0;
  const ids = sql.join(nodeIds.map((id) => sql`${id}`), sql`, `);
  const lockedFilter = opts.lockedOnly ? sql`AND c.locked = true` : sql``;
  await exec.execute(sql`
    INSERT INTO progress_cell_logs (project_id, node_id, node_code, work_location_id, old_percent, new_percent, source, revision_id, reason, changed_by)
    SELECT c.project_id, c.node_id, n.code, c.work_location_id, c.percent, NULL, ${source}, c.revision_id, ${opts.reason ?? null}, ${userId}
    FROM progress_cells c JOIN progress_wbs_nodes n ON n.id = c.node_id
    WHERE c.project_id = ${projectId} AND c.node_id IN (${ids}) ${lockedFilter}
  `);
  const res = await exec.execute(sql`
    DELETE FROM progress_cells c WHERE c.project_id = ${projectId} AND c.node_id IN (${ids}) ${lockedFilter}
  `);
  return (res as any).rowCount ?? 0;
}

export async function getCellHistory(projectId: string, nodeId: string, unitId: string) {
  const [cell] = rowsOf(await db.execute(sql`
    SELECT c.percent, c.source, c.locked, c.revision_id, c.updated_at, u.full_name AS updated_by_name,
           r.request_number, r.id AS request_id, rr.approval_status_code
    FROM progress_cells c
    LEFT JOIN users u ON u.id = c.updated_by
    LEFT JOIN request_revisions rr ON rr.id = c.revision_id
    LEFT JOIN requests r ON r.id = rr.request_id
    WHERE c.project_id = ${projectId} AND c.node_id = ${nodeId} AND c.work_location_id = ${unitId}
  `));
  const logs = rowsOf(await db.execute(sql`
    SELECT l.id, l.old_percent, l.new_percent, l.source, l.revision_id, l.request_number, l.reason, l.changed_at,
           u.full_name AS changed_by_name
    FROM progress_cell_logs l
    LEFT JOIN users u ON u.id = l.changed_by
    WHERE l.project_id = ${projectId} AND l.node_id = ${nodeId} AND l.work_location_id = ${unitId}
    ORDER BY l.changed_at DESC
    LIMIT 100
  `));
  return {
    cell: cell ? {
      percent: num(cell.percent), source: cell.source, locked: cell.locked, revisionId: cell.revision_id,
      requestId: cell.request_id, requestNumber: cell.request_number, approvalStatusCode: cell.approval_status_code,
      updatedAt: cell.updated_at, updatedByName: cell.updated_by_name,
    } : null,
    logs: logs.map((l) => ({
      id: l.id, oldPercent: numOrNull(l.old_percent), newPercent: numOrNull(l.new_percent), source: l.source,
      revisionId: l.revision_id, requestNumber: l.request_number, reason: l.reason, changedAt: l.changed_at,
      changedByName: l.changed_by_name,
    })),
  };
}

// ---------- WIR → cells ----------

// Approved = current revision coded A/B at the final step (x07), WIR type, request not deleted.
// Only inserts missing cells or promotes unlocked (manual) ones: locked cells and admin overrides are never touched.
export async function syncFromApprovedWirs(projectId: string, userId: string | null, nodeIds?: string[]) {
  const nodeFilter = nodeIds && nodeIds.length
    ? sql`AND n.id IN (${sql.join(nodeIds.map((id) => sql`${id}`), sql`, `)})`
    : sql``;
  return await db.transaction(async (tx) => {
    const res = await tx.execute(sql`
      WITH approved AS (
        SELECT rr.id AS revision_id, r.request_number, rr.work_list_activity_id AS activity_id,
               rr.work_level_id, rr.work_location_id
        FROM requests r
        JOIN request_types rt ON rt.id = r.request_type_id AND rt.code = 'WIR'
        JOIN request_revisions rr ON rr.id = r.current_revision_id
        WHERE r.project_id = ${projectId} AND r.is_deleted = false
          AND rr.approval_status_code IN ('A', 'B') AND rr.current_step_id % 100 = 7
          AND rr.work_list_activity_id IS NOT NULL
      ),
      approved_units AS (
        SELECT a.revision_id, a.request_number, a.activity_id, rwl.work_location_id
        FROM approved a JOIN request_work_locations rwl ON rwl.revision_id = a.revision_id
        UNION
        SELECT a.revision_id, a.request_number, a.activity_id, a.work_location_id
        FROM approved a WHERE a.work_location_id IS NOT NULL
      ),
      approved_levels AS (
        SELECT a.revision_id, rwl.work_level_id FROM approved a JOIN request_work_levels rwl ON rwl.revision_id = a.revision_id
        UNION
        SELECT a.revision_id, a.work_level_id FROM approved a WHERE a.work_level_id IS NOT NULL
      ),
      leaves AS (
        SELECT n.id, n.code, n.work_list_activity_id, n.work_level_id
        FROM progress_wbs_nodes n
        WHERE n.project_id = ${projectId} AND n.work_list_activity_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM progress_wbs_nodes ch WHERE ch.parent_id = n.id)
          ${nodeFilter}
      ),
      matches AS (
        SELECT DISTINCT ON (l.id, au.work_location_id)
               l.id AS node_id, l.code AS node_code, au.work_location_id, au.revision_id, au.request_number
        FROM leaves l
        JOIN approved_units au ON au.activity_id = l.work_list_activity_id
        JOIN work_locations wl ON wl.id = au.work_location_id AND wl.project_id = ${projectId}
        WHERE l.work_level_id IS NULL
           OR EXISTS (SELECT 1 FROM approved_levels al WHERE al.revision_id = au.revision_id AND al.work_level_id = l.work_level_id)
        ORDER BY l.id, au.work_location_id, au.request_number
      ),
      old AS (
        SELECT c.node_id, c.work_location_id, c.percent FROM progress_cells c WHERE c.project_id = ${projectId}
      ),
      upserted AS (
        INSERT INTO progress_cells (project_id, node_id, work_location_id, percent, source, locked, revision_id, updated_by, updated_at)
        SELECT ${projectId}, m.node_id, m.work_location_id, 100, 'wir', true, m.revision_id, ${userId}, NOW()
        FROM matches m
        ON CONFLICT (node_id, work_location_id) DO UPDATE SET
          percent = 100, source = 'wir', locked = true, revision_id = EXCLUDED.revision_id,
          updated_by = EXCLUDED.updated_by, updated_at = NOW()
        WHERE progress_cells.locked = false
        RETURNING node_id, work_location_id, revision_id
      ),
      logged AS (
        INSERT INTO progress_cell_logs (project_id, node_id, node_code, work_location_id, old_percent, new_percent, source,
                                        revision_id, request_number, reason, changed_by)
        SELECT ${projectId}, u.node_id, m.node_code, u.work_location_id, o.percent, 100, 'wir',
               u.revision_id, m.request_number, NULL, ${userId}
        FROM upserted u
        JOIN matches m ON m.node_id = u.node_id AND m.work_location_id = u.work_location_id
        LEFT JOIN old o ON o.node_id = u.node_id AND o.work_location_id = u.work_location_id
        RETURNING 1
      )
      SELECT (SELECT COUNT(*) FROM upserted)::int AS applied, (SELECT COUNT(*) FROM matches)::int AS matched
    `);
    const [row] = rowsOf(res);
    return { applied: num(row?.applied), matched: num(row?.matched) };
  });
}

// Called (non-blocking) when a WIR revision is approved/closed with A or B at step x07. Idempotent.
export async function applyApprovedWirRevision(revisionId: string, userId: string | null) {
  const [rev] = rowsOf(await db.execute(sql`
    SELECT rr.id, rr.work_list_activity_id, rr.approval_status_code, rr.current_step_id, r.project_id, r.is_deleted,
           r.current_revision_id, rt.code AS type_code
    FROM request_revisions rr
    JOIN requests r ON r.id = rr.request_id
    JOIN request_types rt ON rt.id = r.request_type_id
    WHERE rr.id = ${revisionId}
  `));
  if (!rev || rev.type_code !== "WIR" || rev.is_deleted) return null;
  if (!["A", "B"].includes(rev.approval_status_code) || !rev.work_list_activity_id) return null;
  if (rev.current_revision_id !== revisionId) return null;

  const [hasNodes] = rowsOf(await db.execute(sql`
    SELECT 1 FROM progress_wbs_nodes WHERE project_id = ${rev.project_id} AND work_list_activity_id = ${rev.work_list_activity_id} LIMIT 1
  `));
  if (!hasNodes) return null;

  const nodeRows = rowsOf(await db.execute(sql`
    SELECT id FROM progress_wbs_nodes WHERE project_id = ${rev.project_id} AND work_list_activity_id = ${rev.work_list_activity_id}
  `));
  const result = await syncFromApprovedWirs(rev.project_id, userId, nodeRows.map((r) => r.id));
  if (result.applied > 0) {
    console.log(`[ProgressMatrix] WIR revision ${revisionId}: ${result.applied} cell(s) set to 100%`);
    await afterChange(rev.project_id);
  }
  return result;
}

// ---------- WBS nodes ----------

async function getProjectNodes(exec: Executor, projectId: string) {
  return await exec.select().from(progressWbsNodes).where(eq(progressWbsNodes.projectId, projectId));
}

async function requireNode(projectId: string, nodeId: string) {
  const [node] = await db.select().from(progressWbsNodes)
    .where(and(eq(progressWbsNodes.id, nodeId), eq(progressWbsNodes.projectId, projectId)));
  if (!node) throw new ProgressMatrixError(404, "Item not found in this project");
  return node;
}

async function validateLinks(projectId: string, activityId?: string | null, levelId?: string | null) {
  if (activityId) {
    const [a] = await db.select({ id: workListActivities.id }).from(workListActivities).where(eq(workListActivities.id, activityId));
    if (!a) throw new ProgressMatrixError(400, "Linked activity not found");
  }
  if (levelId) {
    const [l] = await db.select({ id: workLevels.id }).from(workLevels)
      .where(and(eq(workLevels.id, levelId), eq(workLevels.projectId, projectId)));
    if (!l) throw new ProgressMatrixError(400, "Work level not found in this project");
  }
}

async function countCells(nodeId: string) {
  const [r] = rowsOf(await db.execute(sql`
    SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE locked)::int AS locked FROM progress_cells WHERE node_id = ${nodeId}
  `));
  return { total: num(r?.total), locked: num(r?.locked) };
}

export interface NodeInput {
  parentId?: string | null;
  code?: string;
  nameAr: string;
  nameEn?: string | null;
  weight?: number;
  workListActivityId?: string | null;
  workLevelId?: string | null;
  confirmDropCells?: boolean;
}

export async function createNode(projectId: string, userId: string, input: NodeInput) {
  const all = await getProjectNodes(db, projectId);
  const parent = input.parentId ? all.find((n) => n.id === input.parentId) : null;
  if (input.parentId && !parent) throw new ProgressMatrixError(400, "Parent item not found in this project");
  await validateLinks(projectId, input.workListActivityId, input.workLevelId);

  const siblings = all.filter((n) => (n.parentId ?? null) === (parent?.id ?? null));
  const parentIsLeaf = parent && !all.some((n) => n.parentId === parent.id);
  if (parent && parentIsLeaf) {
    const counts = await countCells(parent.id);
    if (counts.total > 0 && !input.confirmDropCells) {
      throw new ProgressMatrixError(409, "The parent item has progress cells that will be removed", { needsConfirm: true, ...counts });
    }
  }

  const codes = new Set(all.map((n) => n.code));
  let code = input.code?.trim();
  if (code && codes.has(code)) throw new ProgressMatrixError(409, `Code "${code}" already exists`);
  if (!code) {
    let k = siblings.length + 1;
    do { code = parent ? `${parent.code}.${k}` : String(k).padStart(2, "0"); k++; } while (codes.has(code));
  }
  const weight = input.weight ?? (siblings.length
    ? round(siblings.reduce((s, n) => s + num(n.weight), 0) / siblings.length, 4)
    : 100);
  const sortOrder = siblings.reduce((m, n) => Math.max(m, n.sortOrder), 0) + 1;

  const created = await db.transaction(async (tx) => {
    if (parent && parentIsLeaf) {
      await deleteCellsForNodes(tx, projectId, userId, [parent.id], "restructure", { reason: "Sub-items added" });
      // the parent is no longer a leaf: its link moves to the new child if the child has none
    }
    const [node] = await tx.insert(progressWbsNodes).values({
      projectId,
      parentId: parent?.id ?? null,
      code: code!,
      nameAr: input.nameAr,
      nameEn: input.nameEn ?? null,
      weight: String(weight),
      sortOrder,
      workListActivityId: input.workListActivityId ?? null,
      workLevelId: input.workLevelId ?? null,
    }).returning();
    return node;
  });
  if (created.workListActivityId) await syncFromApprovedWirs(projectId, userId, [created.id]);
  return created;
}

export async function updateNode(projectId: string, nodeId: string, userId: string, patch: Partial<NodeInput> & { sortOrder?: number }) {
  const node = await requireNode(projectId, nodeId);
  const all = await getProjectNodes(db, projectId);
  const isLeaf = !all.some((n) => n.parentId === node.id);

  let dropCellsOf: string | null = null; // a leaf that becomes a parent loses its cells
  if (patch.parentId !== undefined && patch.parentId !== node.parentId && patch.parentId) {
    const newParent = all.find((n) => n.id === patch.parentId);
    if (!newParent) throw new ProgressMatrixError(400, "Parent item not found in this project");
    // no cycles: the new parent must not be inside this node's subtree
    let cur: ProgressWbsNode | undefined = newParent;
    while (cur) {
      if (cur.id === node.id) throw new ProgressMatrixError(400, "Cannot move an item under itself");
      cur = cur.parentId ? all.find((n) => n.id === cur!.parentId) : undefined;
    }
    if (!all.some((n) => n.parentId === newParent.id)) {
      const counts = await countCells(newParent.id);
      if (counts.total > 0 && !patch.confirmDropCells) {
        throw new ProgressMatrixError(409, "The new parent has progress cells that will be removed", { needsConfirm: true, ...counts });
      }
      if (counts.total > 0) dropCellsOf = newParent.id;
    }
  }
  if (patch.code !== undefined && patch.code.trim() !== node.code && all.some((n) => n.code === patch.code!.trim())) {
    throw new ProgressMatrixError(409, `Code "${patch.code}" already exists`);
  }
  await validateLinks(projectId, patch.workListActivityId, patch.workLevelId);

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.code !== undefined) set.code = patch.code.trim();
  if (patch.nameAr !== undefined) set.nameAr = patch.nameAr;
  if (patch.nameEn !== undefined) set.nameEn = patch.nameEn;
  if (patch.weight !== undefined) set.weight = String(patch.weight);
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  if (patch.parentId !== undefined) set.parentId = patch.parentId;
  if (patch.workListActivityId !== undefined) set.workListActivityId = patch.workListActivityId;
  if (patch.workLevelId !== undefined) set.workLevelId = patch.workLevelId;

  const linkChanged =
    (patch.workListActivityId !== undefined && patch.workListActivityId !== node.workListActivityId) ||
    (patch.workLevelId !== undefined && patch.workLevelId !== node.workLevelId);

  const updated = await db.transaction(async (tx) => {
    if (dropCellsOf) {
      await deleteCellsForNodes(tx, projectId, userId, [dropCellsOf], "restructure", { reason: "Sub-items added" });
    }
    if (linkChanged && isLeaf) {
      await deleteCellsForNodes(tx, projectId, userId, [node.id], "relink", { lockedOnly: true, reason: "Item link changed" });
    }
    const [row] = await tx.update(progressWbsNodes).set(set).where(eq(progressWbsNodes.id, node.id)).returning();
    return row;
  });
  if (linkChanged && isLeaf && updated.workListActivityId) await syncFromApprovedWirs(projectId, userId, [node.id]);
  return updated;
}

export async function deleteNode(projectId: string, nodeId: string, userId: string) {
  const node = await requireNode(projectId, nodeId);
  const subtree = rowsOf(await db.execute(sql`
    WITH RECURSIVE t AS (
      SELECT id FROM progress_wbs_nodes WHERE id = ${node.id}
      UNION ALL
      SELECT n.id FROM progress_wbs_nodes n JOIN t ON n.parent_id = t.id
    ) SELECT id FROM t
  `)).map((r) => r.id as string);
  await db.transaction(async (tx) => {
    await deleteCellsForNodes(tx, projectId, userId, subtree, "delete", { reason: `Item ${node.code} deleted` });
    await tx.delete(progressWbsNodes).where(eq(progressWbsNodes.id, node.id));
  });
  return { deletedNodes: subtree.length };
}

export async function saveWeights(projectId: string, entries: { id: string; weight?: number; sortOrder?: number }[]) {
  if (!entries.length) return { saved: 0 };
  const ids = entries.map((e) => e.id);
  const owned = new Set((await db.select({ id: progressWbsNodes.id }).from(progressWbsNodes)
    .where(and(eq(progressWbsNodes.projectId, projectId), inArray(progressWbsNodes.id, ids)))).map((r) => r.id));
  if (ids.some((id) => !owned.has(id))) throw new ProgressMatrixError(400, "Some items do not belong to this project");
  const rows = entries.map((e) => ({ id: e.id, weight: e.weight ?? null, sort_order: e.sortOrder ?? null }));
  await db.execute(sql`
    UPDATE progress_wbs_nodes n SET
      weight = COALESCE(x.weight, n.weight),
      sort_order = COALESCE(x.sort_order, n.sort_order),
      updated_at = NOW()
    FROM jsonb_to_recordset(${json(rows)}::jsonb) AS x(id varchar, weight numeric, sort_order integer)
    WHERE n.id = x.id AND n.project_id = ${projectId}
  `);
  return { saved: rows.length };
}

// Levels used by WIRs of this project for an activity (for "split by level").
export async function getActivityLevels(projectId: string, activityId: string) {
  return rowsOf(await db.execute(sql`
    SELECT DISTINCT lvl.id, lvl.code, lvl.name_english AS "nameEn", lvl.name_arabic AS "nameAr", lvl.sort_order AS "sortOrder"
    FROM requests r
    JOIN request_types rt ON rt.id = r.request_type_id AND rt.code = 'WIR'
    JOIN request_revisions rr ON rr.id = r.current_revision_id
    JOIN (
      SELECT revision_id, work_level_id FROM request_work_levels
      UNION
      SELECT id, work_level_id FROM request_revisions WHERE work_level_id IS NOT NULL
    ) l ON l.revision_id = rr.id
    JOIN work_levels lvl ON lvl.id = l.work_level_id
    WHERE r.project_id = ${projectId} AND r.is_deleted = false AND rr.work_list_activity_id = ${activityId}
    ORDER BY lvl.sort_order
  `));
}

export async function splitNodeByLevels(projectId: string, nodeId: string, userId: string,
  opts: { levelIds?: string[]; confirmDropCells?: boolean }) {
  const node = await requireNode(projectId, nodeId);
  const all = await getProjectNodes(db, projectId);
  if (all.some((n) => n.parentId === node.id)) throw new ProgressMatrixError(400, "Item already has sub-items");
  if (!node.workListActivityId) throw new ProgressMatrixError(400, "Link the item to an activity before splitting by level");

  let levels: { id: string; code: string; nameEn: string; nameAr: string }[];
  if (opts.levelIds && opts.levelIds.length) {
    levels = (await db.select({ id: workLevels.id, code: workLevels.code, nameEn: workLevels.nameEnglish, nameAr: workLevels.nameArabic, sortOrder: workLevels.sortOrder })
      .from(workLevels).where(and(eq(workLevels.projectId, projectId), inArray(workLevels.id, opts.levelIds))))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (levels.length !== new Set(opts.levelIds).size) throw new ProgressMatrixError(400, "Some levels are not in this project");
  } else {
    levels = await getActivityLevels(projectId, node.workListActivityId);
  }
  if (!levels.length) throw new ProgressMatrixError(400, "No work levels found for this activity in the WIR log");

  const counts = await countCells(node.id);
  if (counts.total > 0 && !opts.confirmDropCells) {
    throw new ProgressMatrixError(409, "The item has progress cells that will be removed", { needsConfirm: true, ...counts });
  }

  const codes = new Set(all.map((n) => n.code));
  const weights = equalWeights(levels.length);
  const children = levels.map((lvl, i) => {
    let code = `${node.code}-${lvl.code}`;
    for (let k = 2; codes.has(code); k++) code = `${node.code}-${lvl.code}-${k}`;
    codes.add(code);
    return {
      id: randomUUID(), projectId, parentId: node.id, code,
      nameAr: `${node.nameAr} - ${lvl.nameAr}`,
      nameEn: node.nameEn ? `${node.nameEn} - ${lvl.nameEn}` : lvl.nameEn,
      weight: String(weights[i]), sortOrder: i + 1,
      workListActivityId: node.workListActivityId, workLevelId: lvl.id,
    };
  });
  await db.transaction(async (tx) => {
    await deleteCellsForNodes(tx, projectId, userId, [node.id], "restructure", { reason: "Split by work level" });
    await tx.update(progressWbsNodes).set({ workListActivityId: null, workLevelId: null, updatedAt: new Date() })
      .where(eq(progressWbsNodes.id, node.id));
    await tx.insert(progressWbsNodes).values(children);
  });
  const sync = await syncFromApprovedWirs(projectId, userId, children.map((c) => c.id));
  return { created: children.length, synced: sync.applied };
}

// Builds Division → Chapter → Activity from the project's WIR log or chosen divisions.
// Merge-only: activities already linked anywhere in the tree are skipped; existing nodes are never changed.
export async function generateWbs(projectId: string, userId: string, opts: { source: "wir" | "divisions"; divisionIds?: string[] }) {
  let acts: any[];
  if (opts.source === "wir") {
    acts = rowsOf(await db.execute(sql`
      SELECT DISTINCT a.id AS a_id, a.code AS a_code, a.name_english AS a_en, a.name_arabic AS a_ar, a.sort_order AS a_sort,
             c.id AS c_id, c.code AS c_code, c.name_english AS c_en, c.name_arabic AS c_ar, c.sort_order AS c_sort,
             d.id AS d_id, d.code AS d_code, d.name_english AS d_en, d.name_arabic AS d_ar, d.sort_order AS d_sort
      FROM requests r
      JOIN request_types rt ON rt.id = r.request_type_id AND rt.code = 'WIR'
      JOIN request_revisions rr ON rr.id = r.current_revision_id
      JOIN work_list_activities a ON a.id = rr.work_list_activity_id
      JOIN work_list_chapters c ON c.id = a.chapter_id
      JOIN work_list_divisions d ON d.id = c.division_id
      WHERE r.project_id = ${projectId} AND r.is_deleted = false
    `));
  } else {
    if (!opts.divisionIds?.length) throw new ProgressMatrixError(400, "Choose at least one division");
    acts = rowsOf(await db.execute(sql`
      SELECT a.id AS a_id, a.code AS a_code, a.name_english AS a_en, a.name_arabic AS a_ar, a.sort_order AS a_sort,
             c.id AS c_id, c.code AS c_code, c.name_english AS c_en, c.name_arabic AS c_ar, c.sort_order AS c_sort,
             d.id AS d_id, d.code AS d_code, d.name_english AS d_en, d.name_arabic AS d_ar, d.sort_order AS d_sort
      FROM work_list_activities a
      JOIN work_list_chapters c ON c.id = a.chapter_id
      JOIN work_list_divisions d ON d.id = c.division_id
      WHERE d.id IN (${sql.join(opts.divisionIds.map((id) => sql`${id}`), sql`, `)})
    `));
  }
  if (!acts.length) throw new ProgressMatrixError(400, opts.source === "wir" ? "No WIR requests with linked activities in this project" : "No activities in the chosen divisions");

  const existing = await getProjectNodes(db, projectId);
  const linked = new Set(existing.map((n) => n.workListActivityId).filter(Boolean));
  const hasChildren = new Set(existing.map((n) => n.parentId).filter(Boolean));

  // level: 0 = division (phase), 1 = chapter (item), 2 = activity (leaf)
  type NewNode = { id: string; parentId: string | null; code: string; nameAr: string; nameEn: string | null; sortOrder: number; workListActivityId: string | null; level: number };
  type CodeEntry = { id: string; parentId: string | null; workListActivityId: string | null };
  const codeIndex = new Map<string, CodeEntry>(existing.map((n) => [n.code, n]));
  const created: NewNode[] = [];
  const toLink: { id: string; activityId: string }[] = [];
  const uniqueCode = (base: string) => {
    let code = base;
    for (let k = 2; codeIndex.has(code); k++) code = `${base}#${k}`;
    return code;
  };
  // returns the id of the node for a catalog entry, creating it if needed
  const ensure = (code: string, parentId: string | null, nameAr: string, nameEn: string, sortOrder: number, activityId: string | null, level: number): string => {
    const ex = codeIndex.get(code);
    if (ex && (ex.parentId ?? null) === parentId) {
      if (!activityId) return ex.id;
      // an unlinked leaf with the same code: link it instead of duplicating
      if (!ex.workListActivityId && !hasChildren.has(ex.id)) {
        toLink.push({ id: ex.id, activityId });
        ex.workListActivityId = activityId;
        return ex.id;
      }
    }
    const node: NewNode = {
      id: randomUUID(), parentId, code: ex ? uniqueCode(code) : code, nameAr: nameAr || nameEn, nameEn,
      sortOrder, workListActivityId: activityId, level,
    };
    codeIndex.set(node.code, node);
    created.push(node);
    return node.id;
  };

  acts.sort((x, y) => x.d_sort - y.d_sort || x.c_sort - y.c_sort || x.a_sort - y.a_sort ||
    String(x.a_code).localeCompare(String(y.a_code), undefined, { numeric: true }));
  for (const a of acts) {
    if (linked.has(a.a_id)) continue;
    const divId = ensure(a.d_code, null, a.d_ar, a.d_en, a.d_sort, null, 0);
    const chapId = ensure(a.c_code, divId, a.c_ar, a.c_en, a.c_sort, null, 1);
    ensure(a.a_code, chapId, a.a_ar, a.a_en, a.a_sort, a.a_id, 2);
    linked.add(a.a_id);
  }

  // Weights: equal within groups made only of new nodes; new nodes joining an existing group get the
  // average of their existing siblings (the sum then differs from 100% and the UI flags it for review).
  const groups = new Map<string | null, NewNode[]>();
  for (const n of created) {
    if (!groups.has(n.parentId)) groups.set(n.parentId, []);
    groups.get(n.parentId)!.push(n);
  }
  const weightOf = new Map<string, number>();
  groups.forEach((list, parentId) => {
    const existingSiblings = existing.filter((n) => (n.parentId ?? null) === parentId);
    if (!existingSiblings.length) {
      equalWeights(list.length).forEach((w, i) => weightOf.set(list[i].id, w));
    } else {
      const avg = round(existingSiblings.reduce((s, n) => s + num(n.weight), 0) / existingSiblings.length, 4);
      list.forEach((n) => weightOf.set(n.id, avg));
    }
  });

  await db.transaction(async (tx) => {
    // insert parents before children (created[] is already in that order)
    for (let i = 0; i < created.length; i += 200) {
      await tx.insert(progressWbsNodes).values(created.slice(i, i + 200).map((n) => ({
        id: n.id, projectId, parentId: n.parentId, code: n.code, nameAr: n.nameAr, nameEn: n.nameEn,
        weight: String(weightOf.get(n.id) ?? 0), sortOrder: n.sortOrder, workListActivityId: n.workListActivityId,
      })));
    }
    for (const l of toLink) {
      await tx.update(progressWbsNodes).set({ workListActivityId: l.activityId, updatedAt: new Date() })
        .where(eq(progressWbsNodes.id, l.id));
    }
  });

  const purged = await purgeNonLeafCells(projectId, userId);
  const sync = await syncFromApprovedWirs(projectId, userId);
  return {
    createdNodes: created.length,
    phases: created.filter((n) => n.level === 0).length,
    items: created.filter((n) => n.level === 1).length,
    leaves: created.filter((n) => n.level === 2).length + toLink.length,
    purgedCells: purged,
    cellsSynced: sync.applied,
  };
}

export interface ImportRow {
  code: string;
  parentCode?: string | null;
  nameAr: string;
  nameEn?: string | null;
  weight?: number | null;
  activityRef?: string | null; // work_list_activities.code
  levelCode?: string | null; // work_levels.code (project)
}

// Upserts nodes by code. Parents can be in the file or already in the project.
export async function importWbs(projectId: string, userId: string, rows: ImportRow[]) {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.code?.trim()) errors.push(`Row ${i + 2}: missing code`);
    else if (seen.has(r.code.trim())) errors.push(`Row ${i + 2}: duplicate code ${r.code}`);
    seen.add(r.code?.trim());
    if (!r.nameAr?.trim()) errors.push(`Row ${i + 2}: missing name`);
  }
  const existing = await getProjectNodes(db, projectId);
  const byCode = new Map(existing.map((n) => [n.code, n]));
  const fileCodes = new Set(rows.map((r) => r.code.trim()));

  const actCodes = Array.from(new Set(rows.map((r) => r.activityRef?.trim()).filter(Boolean) as string[]));
  const actByCode = new Map<string, string>();
  if (actCodes.length) {
    for (const a of await db.select({ id: workListActivities.id, code: workListActivities.code }).from(workListActivities)
      .where(inArray(workListActivities.code, actCodes))) {
      if (!actByCode.has(a.code)) actByCode.set(a.code, a.id);
    }
  }
  const lvlByCode = new Map((await db.select({ id: workLevels.id, code: workLevels.code }).from(workLevels)
    .where(eq(workLevels.projectId, projectId))).map((l) => [l.code, l.id]));

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const pc = r.parentCode?.trim();
    if (pc && !fileCodes.has(pc) && !byCode.has(pc)) errors.push(`Row ${i + 2}: parent code ${pc} not found`);
    if (pc && pc === r.code.trim()) errors.push(`Row ${i + 2}: item cannot be its own parent`);
    if (r.activityRef?.trim() && !actByCode.has(r.activityRef.trim())) errors.push(`Row ${i + 2}: activity ${r.activityRef} not found`);
    if (r.levelCode?.trim() && !lvlByCode.has(r.levelCode.trim())) errors.push(`Row ${i + 2}: level ${r.levelCode} not found in this project`);
  }
  if (errors.length) throw new ProgressMatrixError(400, "Import has errors", { errors: errors.slice(0, 50) });

  // topological order: parents before children
  const rowByCode = new Map(rows.map((r) => [r.code.trim(), r]));
  const ordered: ImportRow[] = [];
  const state = new Map<string, number>();
  const visit = (code: string) => {
    if (state.get(code) === 2) return;
    if (state.get(code) === 1) throw new ProgressMatrixError(400, `Import has a parent cycle at ${code}`);
    state.set(code, 1);
    const r = rowByCode.get(code)!;
    const pc = r.parentCode?.trim();
    if (pc && rowByCode.has(pc)) visit(pc);
    state.set(code, 2);
    ordered.push(r);
  };
  rowByCode.forEach((_, code) => visit(code));

  const idByCode = new Map(existing.map((n) => [n.code, n.id]));
  const relinked: string[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  await db.transaction(async (tx) => {
    for (let i = 0; i < ordered.length; i++) {
      const r = ordered[i];
      const code = r.code.trim();
      const pc = r.parentCode?.trim() || null;
      const values = {
        parentId: pc ? idByCode.get(pc)! : null,
        nameAr: r.nameAr.trim(),
        nameEn: r.nameEn?.trim() || null,
        weight: String(r.weight ?? 0),
        workListActivityId: r.activityRef?.trim() ? actByCode.get(r.activityRef.trim())! : null,
        workLevelId: r.levelCode?.trim() ? lvlByCode.get(r.levelCode.trim())! : null,
        updatedAt: new Date(),
      };
      const ex = byCode.get(code);
      if (ex) {
        if (ex.workListActivityId !== values.workListActivityId || ex.workLevelId !== values.workLevelId) relinked.push(ex.id);
        await tx.update(progressWbsNodes).set(values).where(eq(progressWbsNodes.id, ex.id));
        updatedCount++;
      } else {
        const id = randomUUID();
        idByCode.set(code, id);
        await tx.insert(progressWbsNodes).values({ id, projectId, code, sortOrder: i + 1, ...values });
        createdCount++;
      }
    }
    if (relinked.length) await deleteCellsForNodes(tx, projectId, userId, relinked, "relink", { lockedOnly: true, reason: "Item link changed (import)" });
  });
  const purged = await purgeNonLeafCells(projectId, userId);
  const sync = await syncFromApprovedWirs(projectId, userId);
  return { created: createdCount, updated: updatedCount, purgedCells: purged, cellsSynced: sync.applied };
}

// Cells left on items that now have sub-items no longer count; remove them (logged).
async function purgeNonLeafCells(projectId: string, userId: string) {
  const ids = rowsOf(await db.execute(sql`
    SELECT DISTINCT c.node_id FROM progress_cells c
    WHERE c.project_id = ${projectId} AND EXISTS (SELECT 1 FROM progress_wbs_nodes ch WHERE ch.parent_id = c.node_id)
  `)).map((r) => r.node_id as string);
  if (!ids.length) return 0;
  return await deleteCellsForNodes(db, projectId, userId, ids, "restructure", { reason: "Item now has sub-items" });
}

// ---------- Payment certificates ----------

async function requireCertificate(exec: Executor, projectId: string, certId: string) {
  const [cert] = await exec.select().from(progressPaymentCertificates)
    .where(and(eq(progressPaymentCertificates.id, certId), eq(progressPaymentCertificates.projectId, projectId)));
  if (!cert) throw new ProgressMatrixError(404, "Payment certificate not found");
  return cert;
}

export async function listCertificates(projectId: string) {
  const rows = rowsOf(await db.execute(sql`
    SELECT c.*, cu.full_name AS created_by_name,
           (SELECT COUNT(*)::int FROM progress_payment_certificate_lines l WHERE l.certificate_id = c.id) AS line_count
    FROM progress_payment_certificates c
    LEFT JOIN users cu ON cu.id = c.created_by
    WHERE c.project_id = ${projectId}
    ORDER BY c.cert_no DESC
  `));
  return rows.map(mapCertRow);
}

function mapCertRow(c: any) {
  return {
    id: c.id, projectId: c.project_id, certNo: c.cert_no, title: c.title, periodFrom: c.period_from, periodTo: c.period_to,
    status: c.status as CertificateStatus, notes: c.notes, totalAmount: num(c.total_amount), rejectReason: c.reject_reason,
    createdBy: c.created_by, createdByName: c.created_by_name ?? null, createdAt: c.created_at,
    submittedAt: c.submitted_at, approvedAt: c.approved_at, paidAt: c.paid_at, rejectedAt: c.rejected_at,
    submittedByName: c.submitted_by_name ?? null, approvedByName: c.approved_by_name ?? null,
    paidByName: c.paid_by_name ?? null, rejectedByName: c.rejected_by_name ?? null,
    lineCount: c.line_count ?? undefined,
  };
}

export async function getCertificate(projectId: string, certId: string) {
  const [row] = rowsOf(await db.execute(sql`
    SELECT c.*, cu.full_name AS created_by_name, su.full_name AS submitted_by_name, au.full_name AS approved_by_name,
           pu.full_name AS paid_by_name, ru.full_name AS rejected_by_name
    FROM progress_payment_certificates c
    LEFT JOIN users cu ON cu.id = c.created_by
    LEFT JOIN users su ON su.id = c.submitted_by
    LEFT JOIN users au ON au.id = c.approved_by
    LEFT JOIN users pu ON pu.id = c.paid_by
    LEFT JOIN users ru ON ru.id = c.rejected_by
    WHERE c.id = ${certId} AND c.project_id = ${projectId}
  `));
  if (!row) throw new ProgressMatrixError(404, "Payment certificate not found");
  const lines = await db.select().from(progressPaymentCertificateLines)
    .where(eq(progressPaymentCertificateLines.certificateId, certId));
  lines.sort((a, b) => String(a.unitLabel ?? "").localeCompare(String(b.unitLabel ?? ""), undefined, { numeric: true }));
  return {
    ...mapCertRow(row),
    lines: lines.map((l) => ({
      id: l.id, workLocationId: l.workLocationId, unitLabel: l.unitLabel, unitValue: num(l.unitValue),
      cumulativePercent: num(l.cumulativePercent), previousPercent: num(l.previousPercent),
      currentPercent: num(l.currentPercent), amount: num(l.amount), phaseBreakdown: l.phaseBreakdown,
    })),
  };
}

// Snapshot: cumulative earned % per unit; previous = Σ current % of submitted/approved/paid certificates.
async function buildCertificateLines(tx: Tx, projectId: string, certId: string) {
  const data = await loadMatrixData(projectId);
  const s = computeSummary({ ...data.settings, nodes: data.nodes, units: data.units, cells: data.cells });
  const prevRows = rowsOf(await tx.execute(sql`
    SELECT l.work_location_id, SUM(l.current_percent) AS pct
    FROM progress_payment_certificate_lines l
    JOIN progress_payment_certificates c ON c.id = l.certificate_id
    WHERE c.project_id = ${projectId} AND c.status IN ('submitted', 'approved', 'paid') AND c.id <> ${certId}
    GROUP BY l.work_location_id
  `));
  const prev = new Map(prevRows.map((r) => [r.work_location_id as string, num(r.pct)]));
  const lines: any[] = [];
  data.units.forEach((u, i) => {
    if (!u.included) return;
    const line = certificateLine(s.unitValue[i], s.unitProgress[i], prev.get(u.id) ?? 0);
    if (line.currentPercent <= 0) return;
    lines.push({
      work_location_id: u.id, unit_label: u.label, unit_value: round(s.unitValue[i], 2),
      cumulative_percent: line.cumulativePercent, previous_percent: line.previousPercent,
      current_percent: line.currentPercent, amount: line.amount, phase_breakdown: phaseContributions(s, i),
    });
  });
  await tx.delete(progressPaymentCertificateLines).where(eq(progressPaymentCertificateLines.certificateId, certId));
  if (lines.length) {
    await tx.execute(sql`
      INSERT INTO progress_payment_certificate_lines (certificate_id, work_location_id, unit_label, unit_value,
             cumulative_percent, previous_percent, current_percent, amount, phase_breakdown)
      SELECT ${certId}, x.work_location_id, x.unit_label, x.unit_value, x.cumulative_percent, x.previous_percent,
             x.current_percent, x.amount, x.phase_breakdown
      FROM jsonb_to_recordset(${json(lines)}::jsonb) AS x(work_location_id varchar, unit_label text, unit_value numeric,
           cumulative_percent numeric, previous_percent numeric, current_percent numeric, amount numeric, phase_breakdown jsonb)
    `);
  }
  const total = round(lines.reduce((sum, l) => sum + l.amount, 0), 2);
  await tx.update(progressPaymentCertificates).set({ totalAmount: String(total), updatedAt: new Date() })
    .where(eq(progressPaymentCertificates.id, certId));
  return { lineCount: lines.length, total };
}

export async function createCertificate(projectId: string, userId: string, input: {
  title?: string | null; periodFrom?: string | null; periodTo?: string | null; notes?: string | null;
}) {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"progress-cert:" + projectId}))`);
    const [draft] = await tx.select({ id: progressPaymentCertificates.id, certNo: progressPaymentCertificates.certNo })
      .from(progressPaymentCertificates)
      .where(and(eq(progressPaymentCertificates.projectId, projectId), eq(progressPaymentCertificates.status, "draft")));
    if (draft) throw new ProgressMatrixError(409, `Draft certificate #${draft.certNo} is already open`, { certificateId: draft.id });
    const [{ next }] = rowsOf(await tx.execute(sql`
      SELECT COALESCE(MAX(cert_no), 0) + 1 AS next FROM progress_payment_certificates WHERE project_id = ${projectId}
    `));
    const [cert] = await tx.insert(progressPaymentCertificates).values({
      projectId, certNo: num(next), title: input.title || null, periodFrom: input.periodFrom || null,
      periodTo: input.periodTo || null, notes: input.notes || null, status: "draft", createdBy: userId,
    }).returning();
    const built = await buildCertificateLines(tx, projectId, cert.id);
    return { id: cert.id, certNo: cert.certNo, ...built };
  });
}

export async function refreshCertificate(projectId: string, certId: string) {
  return await db.transaction(async (tx) => {
    const cert = await requireCertificate(tx, projectId, certId);
    if (cert.status !== "draft") throw new ProgressMatrixError(400, "Only a draft certificate can be refreshed");
    return await buildCertificateLines(tx, projectId, certId);
  });
}

export async function updateCertificateInfo(projectId: string, certId: string, input: {
  title?: string | null; periodFrom?: string | null; periodTo?: string | null; notes?: string | null;
}) {
  const cert = await requireCertificate(db, projectId, certId);
  if (cert.status !== "draft") throw new ProgressMatrixError(400, "Only a draft certificate can be edited");
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) set.title = input.title || null;
  if (input.periodFrom !== undefined) set.periodFrom = input.periodFrom || null;
  if (input.periodTo !== undefined) set.periodTo = input.periodTo || null;
  if (input.notes !== undefined) set.notes = input.notes || null;
  await db.update(progressPaymentCertificates).set(set).where(eq(progressPaymentCertificates.id, certId));
}

export async function deleteCertificate(projectId: string, certId: string) {
  const cert = await requireCertificate(db, projectId, certId);
  if (cert.status !== "draft") throw new ProgressMatrixError(400, "Only a draft certificate can be deleted");
  await db.delete(progressPaymentCertificates).where(eq(progressPaymentCertificates.id, certId));
}

export async function transitionCertificate(projectId: string, certId: string, userId: string,
  permissions: MatrixPermissions, action: CertificateAction, reason?: string | null) {
  const rule = CERTIFICATE_TRANSITIONS[action];
  if (!rule) throw new ProgressMatrixError(400, "Unknown action");
  const allowed =
    action === "submit" || action === "withdraw" ? permissions.canSubmitCertificate
      : action === "approve" || action === "reject" ? permissions.canApproveCertificate
        : permissions.canMarkPaid;
  if (!allowed) throw new ProgressMatrixError(403, "You don't have permission for this certificate action");
  if (action === "reject" && !reason?.trim()) throw new ProgressMatrixError(400, "A rejection reason is required");

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"progress-cert:" + projectId}))`);
    const cert = await requireCertificate(tx, projectId, certId);
    if (!rule.from.includes(cert.status as CertificateStatus)) {
      throw new ProgressMatrixError(400, `Cannot ${action} a certificate that is ${cert.status}`);
    }
    if (action === "submit" && num(cert.totalAmount) <= 0) {
      throw new ProgressMatrixError(400, "Nothing to claim in this certificate");
    }
    if (action === "withdraw") {
      const [other] = await tx.select({ certNo: progressPaymentCertificates.certNo }).from(progressPaymentCertificates)
        .where(and(eq(progressPaymentCertificates.projectId, projectId), eq(progressPaymentCertificates.status, "draft")));
      if (other) throw new ProgressMatrixError(409, `Draft certificate #${other.certNo} is already open`);
    }
    const now = new Date();
    const set: Record<string, unknown> = { status: rule.to, updatedAt: now };
    if (action === "submit") Object.assign(set, { submittedBy: userId, submittedAt: now, rejectReason: null });
    if (action === "withdraw") Object.assign(set, { submittedBy: null, submittedAt: null });
    if (action === "approve") Object.assign(set, { approvedBy: userId, approvedAt: now });
    if (action === "reject") Object.assign(set, { rejectedBy: userId, rejectedAt: now, rejectReason: reason!.trim() });
    if (action === "pay") Object.assign(set, { paidBy: userId, paidAt: now });
    await tx.update(progressPaymentCertificates).set(set).where(eq(progressPaymentCertificates.id, certId));
    return { status: rule.to };
  });
}

export async function countCertificatesByProject(projectIds: string[]) {
  if (!projectIds.length) return new Map<string, number>();
  const rows = await db.select({
    projectId: progressPaymentCertificates.projectId,
    count: sql<number>`cast(count(${progressPaymentCertificates.id}) as integer)`,
  }).from(progressPaymentCertificates)
    .where(inArray(progressPaymentCertificates.projectId, projectIds))
    .groupBy(progressPaymentCertificates.projectId);
  return new Map(rows.map((r) => [r.projectId, r.count]));
}
