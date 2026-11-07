// الرخص والمعاملات — what the section's page, detail page and tabs share.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  PERMIT_ATTENTION_LABELS,
  PERMIT_STATUS_LABELS,
  type PermitAttention,
  type PermitsContext,
} from "@shared/permits";
import { getJson, StatusBadge } from "@/components/payments/payments-common";

export { getJson, errorMessage, fmtDate, money, StatusBadge } from "@/components/payments/payments-common";

// Never kept in the offline cache: who is assigned what changes under the user's feet
export const permitsQuery = { persist: false } as const;

export function usePermitsContext() {
  return useQuery<PermitsContext>({ queryKey: ["permits", "context"], queryFn: () => getJson("/api/permits/context"), meta: permitsQuery });
}

export function invalidatePermits(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["permits"] });
  queryClient.invalidateQueries({ queryKey: ["payments"] });
  queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
}

export interface PermitRow {
  id: string;
  projectId: string;
  projectName: string;
  transactionNo: string;
  title: string;
  kind: string;
  category: string;
  authorityName: string | null;
  portalUrl: string | null;
  status: string;
  assigneeUserId: string | null;
  assigneeName: string | null;
  referenceNo: string | null;
  licenseNo: string | null;
  dueDate: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  renewalLeadDays: number | null;
  feeAmount: string;
  feePaid: boolean;
  renewalOfId: string | null;
  stepsTotal: number;
  stepsDone: number;
  nextStep: { id: string; title: string; dueDate: string | null; assigneeUserId: string | null } | null;
  requirementsMissing: number;
  attention: PermitAttention | null;
  order: { id: string; orderNo: string; status: string } | null;
  renewedBy: string | null;
  isDeveloper: boolean;
}

export function PermitStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} labels={PERMIT_STATUS_LABELS} />;
}

export function AttentionBadge({ kind }: { kind: PermitAttention | null }) {
  if (!kind) return null;
  const tone = kind === "awaiting_payment" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-destructive/10 text-destructive";
  return (
    <Badge variant="secondary" className={`border-none font-semibold gap-1 whitespace-nowrap ${tone}`}>
      <AlertTriangle className="w-3 h-3" /> {PERMIT_ATTENTION_LABELS[kind]}
    </Badge>
  );
}

// The server only accepts files under /projects/<id>/permits/, which is where this uploads them
export async function uploadToPermits(file: File, projectId: string) {
  const presign = await fetch("/api/uploads/request-url", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream", folder: "permits", projectId }),
  });
  if (!presign.ok) throw new Error((await presign.json().catch(() => ({}))).error || "Failed to prepare upload");
  const { uploadURL, objectPath } = await presign.json();
  const put = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
  if (!put.ok) throw new Error("Failed to upload the file");
  return objectPath as string;
}

// Progress of the steps, as a thin bar with "3/5"
export function StepsProgress({ done, total }: { done: number; total: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="min-w-[90px] space-y-1">
      <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
      <div className="text-[11px] text-muted-foreground tabular-nums">{done}/{total}</div>
    </div>
  );
}
