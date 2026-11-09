import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, RefreshCw, Send, Undo2, CheckCircle2, XCircle, Banknote, Trash2, Download, FileText } from "lucide-react";
import { format } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { CertificateAction, CertificateStatus } from "@shared/progress-matrix";
import { type MatrixModel, useMatrixApi, parseApiError, certsKey, fmtMoney, fmtPct } from "./use-progress-matrix";
import { exportCertificateExcel, type CertificateDetail } from "./excel";

interface CertificateRow {
  id: string; certNo: number; title: string | null; periodFrom: string | null; periodTo: string | null;
  status: CertificateStatus; notes: string | null; totalAmount: number; rejectReason: string | null;
  createdByName: string | null; createdAt: string; submittedAt: string | null; approvedAt: string | null;
  paidAt: string | null; rejectedAt: string | null; lineCount?: number;
  submittedByName?: string | null; approvedByName?: string | null; paidByName?: string | null; rejectedByName?: string | null;
}
type CertificateFull = CertificateRow & Omit<CertificateDetail, "lines"> & {
  lines: (CertificateDetail["lines"][number] & { id: string; workLocationId: string | null })[];
};

const STATUS: Record<CertificateStatus, { labelKey: string; className: string }> = {
  draft: { labelKey: "certificates.status.draft", className: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200" },
  submitted: { labelKey: "certificates.status.submitted", className: "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40" },
  approved: { labelKey: "certificates.status.approved", className: "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40" },
  paid: { labelKey: "certificates.status.paid", className: "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40" },
  rejected: { labelKey: "certificates.status.rejected", className: "bg-red-50 text-red-700 border-red-300 dark:bg-red-950/40" },
};
const fmtDate = (d: string | null) => (d ? format(new Date(d), "yyyy/MM/dd HH:mm") : "");

export function PaymentCertificates({ projectId, projectName, model }: { projectId: string; projectName: string; model: MatrixModel }) {
  const { t } = useTranslation("progress");
  const perms = model.payload.permissions;
  const api = useMatrixApi(projectId);
  const { toast } = useToast();
  const { data: certs = [], isLoading } = useQuery<CertificateRow[]>({ queryKey: certsKey(projectId) });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? certs[0]?.id ?? null;
  const { data: cert } = useQuery<CertificateFull>({
    queryKey: [...certsKey(projectId), activeId ?? ""],
    enabled: !!activeId,
    meta: { persist: false },
  });

  const claimable = useMemo(() => {
    let amount = 0; let units = 0;
    model.payload.units.forEach((u, i) => {
      if (!u.included) return;
      const f = model.financials(i);
      if (f.claimablePct > 0.0001) units++;
      amount += f.claimableAmount;
    });
    return { amount, units };
  }, [model]);

  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: t("certificates.toasts.done"), description: ok });
    } catch (err) {
      const e = parseApiError(err);
      if (e.status === 409 && e.data?.certificateId) setSelectedId(e.data.certificateId);
      toast({ title: t("certificates.toasts.failed"), description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // ---- create ----
  const [createOpen, setCreateOpen] = useState(false);
  const [info, setInfo] = useState({ title: "", periodFrom: "", periodTo: "", notes: "" });
  const create = () => run(async () => {
    const r = await api<{ id: string; certNo: number; lineCount: number; total: number }>("POST", "/payment-certificates", {
      title: info.title || null, periodFrom: info.periodFrom || null, periodTo: info.periodTo || null, notes: info.notes || null,
    });
    setSelectedId(r.id);
    setCreateOpen(false);
  }, t("certificates.toasts.draft_created"));

  // ---- transitions ----
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const transition = (action: CertificateAction, reason?: string) =>
    run(() => api("POST", `/payment-certificates/${activeId}/transition`, { action, reason: reason ?? null }), `${action} ✓`);

  const status = cert?.status;
  const total = cert?.lines.reduce((s, l) => ({ value: s.value + l.unitValue, amount: s.amount + l.amount }), { value: 0, amount: 0 });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
      {/* List */}
      <div className="space-y-3">
        <Card className="p-4 rounded-xl space-y-1">
          <div className="text-xs text-muted-foreground">{t("certificates.claimable_now")}</div>
          <div className="text-2xl font-black text-emerald-600">{fmtMoney(claimable.amount)}</div>
          <div className="text-xs text-muted-foreground">{t("certificates.claimable_units", { count: claimable.units })}</div>
          {perms.canSubmitCertificate && (
            <Button className="w-full mt-2" onClick={() => { setInfo({ title: "", periodFrom: "", periodTo: "", notes: "" }); setCreateOpen(true); }} disabled={busy}>
              <Plus className="w-4 h-4 me-1" />{t("certificates.new_certificate")}
            </Button>
          )}
        </Card>
        <div className="rounded-xl border divide-y max-h-[calc(100vh-460px)] overflow-auto">
          {isLoading && <div className="p-4 text-sm text-muted-foreground">{t("certificates.loading")}</div>}
          {!isLoading && !certs.length && (
            <div className="p-6 text-center text-sm text-muted-foreground">{t("certificates.no_certificates")}</div>
          )}
          {certs.map((c) => (
            <button key={c.id} onClick={() => setSelectedId(c.id)}
              className={cn("w-full text-start p-3 hover:bg-muted/40", c.id === activeId && "bg-muted")}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">#{c.certNo}</span>
                <Badge variant="outline" className={STATUS[c.status]?.className}>{t((STATUS[c.status]?.labelKey ?? c.status) as any)}</Badge>
              </div>
              <div className="text-xs text-muted-foreground truncate">{c.title || "—"}</div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span>{fmtMoney(c.totalAmount)}</span>
                <span className="text-muted-foreground">{t("certificates.units_count", { count: c.lineCount ?? 0 })}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="space-y-3 min-w-0">
        {!cert ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            {t("certificates.select_or_create")}
          </div>
        ) : (
          <>
            <Card className="p-4 rounded-xl space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black">{t("certificates.certificate_no", { number: cert.certNo })}</h3>
                    <Badge variant="outline" className={STATUS[cert.status]?.className}>{t((STATUS[cert.status]?.labelKey ?? cert.status) as any)}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">{cert.title || "—"}{cert.periodFrom || cert.periodTo ? ` · ${cert.periodFrom ?? ""} → ${cert.periodTo ?? ""}` : ""}</div>
                  {cert.notes && <div className="text-sm mt-1">{cert.notes}</div>}
                  {cert.status === "rejected" && cert.rejectReason && (
                    <div className="text-sm text-red-600 mt-1">{t("certificates.reject_reason", { reason: cert.rejectReason })}</div>
                  )}
                </div>
                <div className="text-end">
                  <div className="text-xs text-muted-foreground">{t("certificates.total")}</div>
                  <div className="text-2xl font-black">{fmtMoney(cert.totalAmount)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div><span className="text-muted-foreground">{t("certificates.dates.created")} </span>{fmtDate(cert.createdAt)} {cert.createdByName ?? ""}</div>
                {cert.submittedAt && <div><span className="text-muted-foreground">{t("certificates.dates.submitted")} </span>{fmtDate(cert.submittedAt)} {cert.submittedByName ?? ""}</div>}
                {cert.approvedAt && <div><span className="text-muted-foreground">{t("certificates.dates.approved")} </span>{fmtDate(cert.approvedAt)} {cert.approvedByName ?? ""}</div>}
                {cert.paidAt && <div><span className="text-muted-foreground">{t("certificates.dates.paid")} </span>{fmtDate(cert.paidAt)} {cert.paidByName ?? ""}</div>}
                {cert.rejectedAt && <div><span className="text-muted-foreground">{t("certificates.dates.rejected")} </span>{fmtDate(cert.rejectedAt)} {cert.rejectedByName ?? ""}</div>}
              </div>

              <div className="flex flex-wrap gap-2">
                {status === "draft" && perms.canSubmitCertificate && (
                  <>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => api("POST", `/payment-certificates/${cert.id}/refresh`), t("certificates.toasts.refreshed"))}>
                      <RefreshCw className="w-4 h-4 me-1" />{t("certificates.actions.refresh")}
                    </Button>
                    <Button size="sm" disabled={busy || cert.totalAmount <= 0} onClick={() => transition("submit")}><Send className="w-4 h-4 me-1" />{t("certificates.actions.submit")}</Button>
                    <Button size="sm" variant="outline" className="text-red-600" disabled={busy} onClick={() => setDeleteOpen(true)}><Trash2 className="w-4 h-4 me-1" />{t("certificates.actions.delete")}</Button>
                  </>
                )}
                {status === "submitted" && perms.canSubmitCertificate && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => transition("withdraw")}><Undo2 className="w-4 h-4 me-1" />{t("certificates.actions.withdraw")}</Button>
                )}
                {status === "submitted" && perms.canApproveCertificate && (
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={busy} onClick={() => transition("approve")}><CheckCircle2 className="w-4 h-4 me-1" />{t("certificates.actions.approve")}</Button>
                )}
                {(status === "submitted" || status === "approved") && perms.canApproveCertificate && (
                  <Button size="sm" variant="outline" className="text-red-600" disabled={busy} onClick={() => { setRejectReason(""); setRejectOpen(true); }}><XCircle className="w-4 h-4 me-1" />{t("certificates.actions.reject")}</Button>
                )}
                {status === "approved" && perms.canMarkPaid && (
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => transition("pay")}><Banknote className="w-4 h-4 me-1" />{t("certificates.actions.mark_paid")}</Button>
                )}
                <Button size="sm" variant="outline" className="ms-auto" onClick={() => exportCertificateExcel(cert, model, projectName)}><Download className="w-4 h-4 me-1" />{t("certificates.actions.excel")}</Button>
              </div>
            </Card>

            <div className="overflow-auto rounded-xl border max-h-[calc(100vh-520px)] min-h-[200px]">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr className="text-start whitespace-nowrap">
                    <th className="p-2">{t("certificates.table.unit")}</th>
                    <th className="p-2 text-end">{t("certificates.table.unit_value")}</th>
                    <th className="p-2 text-end">{t("certificates.table.previous")}</th>
                    <th className="p-2 text-end">{t("certificates.table.cumulative")}</th>
                    <th className="p-2 text-end">{t("certificates.table.current")}</th>
                    <th className="p-2 text-end">{t("certificates.table.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {!cert.lines.length && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">{t("certificates.table.no_lines")}</td></tr>}
                  {cert.lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2 font-semibold">{l.unitLabel}</td>
                      <td className="p-2 text-end">{fmtMoney(l.unitValue)}</td>
                      <td className="p-2 text-end">{fmtPct(l.previousPercent, 4)}</td>
                      <td className="p-2 text-end">{fmtPct(l.cumulativePercent, 4)}</td>
                      <td className="p-2 text-end font-semibold">{fmtPct(l.currentPercent, 4)}</td>
                      <td className="p-2 text-end">{fmtMoney(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                {!!cert.lines.length && total && (
                  <tfoot className="bg-muted/70 sticky bottom-0 font-semibold">
                    <tr className="border-t">
                      <td className="p-2">{t("certificates.table.total_lines", { count: cert.lines.length })}</td>
                      <td className="p-2 text-end">{fmtMoney(total.value)}</td>
                      <td colSpan={3} />
                      <td className="p-2 text-end">{fmtMoney(total.amount)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("certificates.create_dialog.title")}</DialogTitle>
            <DialogDescription>
              {t("certificates.create_dialog.desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>{t("certificates.create_dialog.title_label")}</Label><Input value={info.title} onChange={(e) => setInfo({ ...info, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>{t("certificates.create_dialog.from")}</Label><Input type="date" value={info.periodFrom} onChange={(e) => setInfo({ ...info, periodFrom: e.target.value })} /></div>
              <div className="space-y-1"><Label>{t("certificates.create_dialog.to")}</Label><Input type="date" value={info.periodTo} onChange={(e) => setInfo({ ...info, periodTo: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>{t("certificates.create_dialog.notes")}</Label><Textarea rows={2} value={info.notes} onChange={(e) => setInfo({ ...info, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("certificates.create_dialog.cancel")}</Button>
            <Button onClick={create} disabled={busy}>{t("certificates.create_dialog.create_draft")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("certificates.reject_dialog.title", { number: cert?.certNo })}</DialogTitle>
            <DialogDescription>{t("certificates.reject_dialog.desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1"><Label>{t("certificates.reject_dialog.reason")}</Label><Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>{t("certificates.reject_dialog.cancel")}</Button>
            <Button className="bg-red-600 hover:bg-red-700" disabled={!rejectReason.trim() || busy}
              onClick={() => { setRejectOpen(false); transition("reject", rejectReason.trim()); }}>{t("certificates.reject_dialog.reject")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("certificates.delete_dialog.title", { number: cert?.certNo })}</AlertDialogTitle>
            <AlertDialogDescription>{t("certificates.delete_dialog.desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("certificates.delete_dialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => run(async () => {
              await api("DELETE", `/payment-certificates/${activeId}`);
              setSelectedId(null);
            }, t("certificates.toasts.deleted"))}>{t("certificates.delete_dialog.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
