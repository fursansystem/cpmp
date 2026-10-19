import { useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  computeSummary, unitFinancials, CELL_LOCKED, CELL_OVERRIDE,
  type MatrixPayload, type MatrixSummary, type CompactCell, type UnitFinancials,
} from "@shared/progress-matrix";

export const projectKey = (projectId: string) => ["/api/projects", projectId];
export const matrixKey = (projectId: string) => ["/api/projects", projectId, "progress-matrix"];
export const certsKey = (projectId: string) => ["/api/projects", projectId, "payment-certificates"];

export interface CellEntry {
  nodeId: string;
  unitId: string;
  percent: number | null;
  reason?: string | null;
}

export interface MatrixModel {
  payload: MatrixPayload;
  summary: MatrixSummary;
  nodeIndex: Map<string, number>;
  unitIndex: Map<string, number>;
  cellAt: (nodeIdx: number, unitIdx: number) => CompactCell | undefined;
  // per node (subtree) cell counts, for delete warnings
  subtreeCellCounts: (nodeId: string) => { total: number; locked: number };
  pendingPct: Float64Array;
  paidPct: Float64Array;
  draftPct: Float64Array;
  financials: (unitIdx: number) => UnitFinancials;
  totals: { value: number; earned: number; pending: number; paid: number; remaining: number };
}

export function buildModel(payload: MatrixPayload): MatrixModel {
  const summary = computeSummary({
    nodes: payload.nodes,
    units: payload.units,
    cells: payload.cells,
    unitWeightMode: payload.settings.unitWeightMode,
    defaultUnitValue: payload.settings.defaultUnitValue,
  });
  const nU = payload.units.length;
  const nodeIndex = new Map(payload.nodes.map((n, i) => [n.id, i]));
  const unitIndex = new Map(payload.units.map((u, i) => [u.id, i]));
  const cellPos = new Map<number, number>();
  payload.cells.forEach((c, i) => cellPos.set(c[1] * nU + c[0], i));
  const cellAt = (nodeIdx: number, unitIdx: number) => {
    const i = cellPos.get(nodeIdx * nU + unitIdx);
    return i === undefined ? undefined : payload.cells[i];
  };

  const perNode = new Map<string, { total: number; locked: number }>();
  for (const c of payload.cells) {
    const node = payload.nodes[c[1]];
    if (!node) continue;
    for (const anc of summary.tree.ancestors.get(node.id) || [node.id]) {
      const t = perNode.get(anc) ?? { total: 0, locked: 0 };
      t.total++;
      if (c[3] & CELL_LOCKED) t.locked++;
      perNode.set(anc, t);
    }
  }

  const draftPct = new Float64Array(nU);
  const pendingPct = new Float64Array(nU);
  const paidPct = new Float64Array(nU);
  for (const [u, draft, pending, paid] of payload.certTotals) {
    if (u < 0 || u >= nU) continue;
    draftPct[u] = draft;
    pendingPct[u] = pending;
    paidPct[u] = paid;
  }
  const financials = (u: number) =>
    unitFinancials(summary.unitValue[u], summary.unitProgress[u], pendingPct[u], paidPct[u]);

  const totals = { value: 0, earned: 0, pending: 0, paid: 0, remaining: 0 };
  payload.units.forEach((unit, u) => {
    if (!unit.included) return;
    const f = financials(u);
    totals.value += f.value;
    totals.earned += f.earnedAmount;
    totals.pending += f.pendingAmount;
    totals.paid += f.paidAmount;
    totals.remaining += f.remainingAmount;
  });

  return {
    payload, summary, nodeIndex, unitIndex, cellAt,
    subtreeCellCounts: (id) => perNode.get(id) ?? { total: 0, locked: 0 },
    draftPct, pendingPct, paidPct, financials, totals,
  };
}

export function useProgressMatrix(projectId: string) {
  const query = useQuery<MatrixPayload>({
    queryKey: matrixKey(projectId),
    enabled: !!projectId,
    meta: { persist: false }, // too large for localStorage
  });
  const model = useMemo(() => (query.data ? buildModel(query.data) : null), [query.data]);
  return { ...query, model };
}

// apiRequest throws "STATUS: body"; pull the JSON error out of it.
export function parseApiError(err: unknown): { status: number; message: string; data: any } {
  const text = err instanceof Error ? err.message : String(err);
  const m = text.match(/^(\d{3}): ([\s\S]*)$/);
  if (!m) return { status: 0, message: text, data: null };
  let data: any = null;
  try { data = JSON.parse(m[2]); } catch { /* not JSON */ }
  let message = data?.error || m[2];
  if (data?.error === "Validation error" && Array.isArray(data.details) && data.details[0]?.message) {
    message = `${data.error}: ${data.details[0].path?.join(".") ?? ""} ${data.details[0].message}`;
  } else if (Array.isArray(data?.errors) && data.errors.length) {
    message = `${message}: ${data.errors.slice(0, 3).join(" · ")}${data.errors.length > 3 ? " …" : ""}`;
  }
  return { status: Number(m[1]), message, data };
}

// Calls a project-scoped endpoint and refreshes the project, matrix and certificates afterwards.
export function useMatrixApi(projectId: string) {
  const qc = useQueryClient();
  return useCallback(async <T = any>(method: string, path: string, body?: unknown): Promise<T> => {
    try {
      const res = await apiRequest(method, `/api/projects/${projectId}${path}`, body);
      return (res.status === 204 ? null : await res.json()) as T;
    } finally {
      await qc.invalidateQueries({ queryKey: projectKey(projectId) });
    }
  }, [projectId, qc]);
}

// Mirrors the server rules so the grid updates instantly: locked cells change only with a reason (admin override).
function applyCellEntries(payload: MatrixPayload, entries: CellEntry[], isAdmin: boolean): MatrixPayload {
  const nU = payload.units.length;
  const nodeIdx = new Map(payload.nodes.map((n, i) => [n.id, i]));
  const unitIdx = new Map(payload.units.map((u, i) => [u.id, i]));
  const pos = new Map<number, number>();
  payload.cells.forEach((c, i) => pos.set(c[1] * nU + c[0], i));
  const cells = payload.cells.slice();
  const removed = new Set<number>();
  for (const e of entries) {
    const n = nodeIdx.get(e.nodeId);
    const u = unitIdx.get(e.unitId);
    if (n === undefined || u === undefined) continue;
    const i = pos.get(n * nU + u);
    const ex = i === undefined ? undefined : cells[i];
    const locked = !!ex && (ex[3] & CELL_LOCKED) !== 0;
    if (locked && !(isAdmin && e.reason?.trim())) continue;
    if (e.percent === null) {
      if (i !== undefined) removed.add(i);
      continue;
    }
    const flags = locked ? (ex![3] | CELL_OVERRIDE) : 0;
    if (i !== undefined) cells[i] = [u, n, e.percent, flags];
    else { pos.set(n * nU + u, cells.length); cells.push([u, n, e.percent, flags]); }
  }
  return { ...payload, cells: removed.size ? cells.filter((_, i) => !removed.has(i)) : cells };
}

export function useSaveCells(projectId: string, isAdmin: boolean) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const mutationKey = ["pm-save-cells", projectId];
  return useMutation({
    mutationKey,
    mutationFn: async (entries: CellEntry[]) => {
      const res = await apiRequest("PUT", `/api/projects/${projectId}/progress-matrix/cells`, { entries });
      return (await res.json()) as { saved: number; skippedLocked: number };
    },
    onMutate: async (entries) => {
      await qc.cancelQueries({ queryKey: matrixKey(projectId) });
      const prev = qc.getQueryData<MatrixPayload>(matrixKey(projectId));
      if (prev) qc.setQueryData(matrixKey(projectId), applyCellEntries(prev, entries, isAdmin));
      return { prev };
    },
    onSuccess: (result, entries) => {
      if (entries.length > 1) {
        toast({
          title: "تم الحفظ (Saved)",
          description: `${result.saved} cell(s) saved${result.skippedLocked ? `, ${result.skippedLocked} locked cell(s) skipped` : ""}.`,
        });
      }
    },
    onError: (err, _entries, ctx) => {
      if (ctx?.prev) qc.setQueryData(matrixKey(projectId), ctx.prev);
      toast({ title: "لم يتم الحفظ (Not saved)", description: parseApiError(err).message, variant: "destructive" });
    },
    onSettled: () => {
      // refetch once the last queued save finishes
      if (qc.isMutating({ mutationKey }) <= 1) qc.invalidateQueries({ queryKey: projectKey(projectId) });
    },
  });
}

export const fmtPct = (n: number, dp = 1) => `${(Number.isFinite(n) ? n : 0).toFixed(dp)}%`;
export const fmtMoney = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
