import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { format } from "date-fns";
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

const STATUS: Record<CertificateStatus, { label: string; className: string }> = {
  draft: { label: "مسودة (Draft)", className: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200" },
  submitted: { label: "مرفوع (Submitted)", className: "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40" },
  approved: { label: "معتمد (Approved)", className: "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40" },
  paid: { label: "مدفوع (Paid)", className: "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40" },
  rejected: { label: "مرفوض (Rejected)", className: "bg-red-50 text-red-700 border-red-300 dark:bg-red-950/40" },
};
const fmtDate = (d: string | null) => (d ? format(new Date(d), "yyyy/MM/dd HH:mm") : "");

export function PaymentCertificates({ projectId, projectName, model }: { projectId: string; projectName: string; model: MatrixModel }) {
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
      toast({ title: "تم (Done)", description: ok });
    } catch (err) {
      const e = parseApiError(err);
      if (e.status === 409 && e.data?.certificateId) setSelectedId(e.data.certificateId);
      toast({ title: "فشلت العملية (Failed)", description: e.message, variant: "destructive" });
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
  }, "تم إنشاء المسودة (Draft created)");

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
          <div className="text-xs text-muted-foreground">القابل للمطالبة الآن (Claimable now)</div>
          <div className="text-2xl font-black text-emerald-600">{fmtMoney(claimable.amount)}</div>
          <div className="text-xs text-muted-foreground">{claimable.units} وحدة (units) · الإنجاز − (المعلّق + المدفوع)</div>
          {perms.canSubmitCertificate && (
            <Button className="w-full mt-2" onClick={() => { setInfo({ title: "", periodFrom: "", periodTo: "", notes: "" }); setCreateOpen(true); }} disabled={busy}>
              <Plus className="w-4 h-4 mr-1" />مستخلص جديد (New certificate)
            </Button>
          )}
        </Card>
        <div className="rounded-xl border divide-y max-h-[calc(100vh-460px)] overflow-auto">
          {isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && !certs.length && (
            <div className="p-6 text-center text-sm text-muted-foreground">لا توجد مستخلصات (No certificates yet)</div>
          )}
          {certs.map((c) => (
            <button key={c.id} onClick={() => setSelectedId(c.id)}
              className={cn("w-full text-left p-3 hover:bg-muted/40", c.id === activeId && "bg-muted")}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">#{c.certNo}</span>
                <Badge variant="outline" className={STATUS[c.status]?.className}>{STATUS[c.status]?.label ?? c.status}</Badge>
              </div>
              <div className="text-xs text-muted-foreground truncate">{c.title || "—"}</div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span>{fmtMoney(c.totalAmount)}</span>
                <span className="text-muted-foreground">{c.lineCount ?? 0} وحدة (units)</span>
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
            اختر مستخلصاً أو أنشئ واحداً جديداً (Select or create a certificate)
          </div>
        ) : (
          <>
            <Card className="p-4 rounded-xl space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black">مستخلص رقم #{cert.certNo} (Certificate No. {cert.certNo})</h3>
                    <Badge variant="outline" className={STATUS[cert.status]?.className}>{STATUS[cert.status]?.label}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">{cert.title || "—"}{cert.periodFrom || cert.periodTo ? ` · ${cert.periodFrom ?? ""} → ${cert.periodTo ?? ""}` : ""}</div>
                  {cert.notes && <div className="text-sm mt-1">{cert.notes}</div>}
                  {cert.status === "rejected" && cert.rejectReason && (
                    <div className="text-sm text-red-600 mt-1">سبب الرفض (Reason): {cert.rejectReason}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">إجمالي المستخلص (Total)</div>
                  <div className="text-2xl font-black">{fmtMoney(cert.totalAmount)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div><span className="text-muted-foreground">أنشئ (Created): </span>{fmtDate(cert.createdAt)} {cert.createdByName ?? ""}</div>
                {cert.submittedAt && <div><span className="text-muted-foreground">رُفع (Submitted): </span>{fmtDate(cert.submittedAt)} {cert.submittedByName ?? ""}</div>}
                {cert.approvedAt && <div><span className="text-muted-foreground">اعتُمد (Approved): </span>{fmtDate(cert.approvedAt)} {cert.approvedByName ?? ""}</div>}
                {cert.paidAt && <div><span className="text-muted-foreground">صُرف (Paid): </span>{fmtDate(cert.paidAt)} {cert.paidByName ?? ""}</div>}
                {cert.rejectedAt && <div><span className="text-muted-foreground">رُفض (Rejected): </span>{fmtDate(cert.rejectedAt)} {cert.rejectedByName ?? ""}</div>}
              </div>

              <div className="flex flex-wrap gap-2">
                {status === "draft" && perms.canSubmitCertificate && (
                  <>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => api("POST", `/payment-certificates/${cert.id}/refresh`), "تم التحديث (Refreshed)")}>
                      <RefreshCw className="w-4 h-4 mr-1" />تحديث من المصفوفة (Refresh)
                    </Button>
                    <Button size="sm" disabled={busy || cert.totalAmount <= 0} onClick={() => transition("submit")}><Send className="w-4 h-4 mr-1" />رفع (Submit)</Button>
                    <Button size="sm" variant="outline" className="text-red-600" disabled={busy} onClick={() => setDeleteOpen(true)}><Trash2 className="w-4 h-4 mr-1" />حذف (Delete)</Button>
                  </>
                )}
                {status === "submitted" && perms.canSubmitCertificate && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => transition("withdraw")}><Undo2 className="w-4 h-4 mr-1" />سحب (Withdraw)</Button>
                )}
                {status === "submitted" && perms.canApproveCertificate && (
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={busy} onClick={() => transition("approve")}><CheckCircle2 className="w-4 h-4 mr-1" />اعتماد (Approve)</Button>
                )}
                {(status === "submitted" || status === "approved") && perms.canApproveCertificate && (
                  <Button size="sm" variant="outline" className="text-red-600" disabled={busy} onClick={() => { setRejectReason(""); setRejectOpen(true); }}><XCircle className="w-4 h-4 mr-1" />رفض (Reject)</Button>
                )}
                {status === "approved" && perms.canMarkPaid && (
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => transition("pay")}><Banknote className="w-4 h-4 mr-1" />تسجيل الصرف (Mark paid)</Button>
                )}
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => exportCertificateExcel(cert, model, projectName)}><Download className="w-4 h-4 mr-1" />Excel</Button>
              </div>
            </Card>

            <div className="overflow-auto rounded-xl border max-h-[calc(100vh-520px)] min-h-[200px]">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr className="text-left whitespace-nowrap">
                    <th className="p-2">الوحدة (Villa No)</th>
                    <th className="p-2 text-right">قيمة الوحدة (Unit value)</th>
                    <th className="p-2 text-right">السابق (Previous %)</th>
                    <th className="p-2 text-right">التراكمي (Cumulative %)</th>
                    <th className="p-2 text-right">الحالي (Current %)</th>
                    <th className="p-2 text-right">المبلغ (Amount)</th>
                  </tr>
                </thead>
                <tbody>
                  {!cert.lines.length && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">لا توجد أسطر — لا يوجد إنجاز جديد قابل للمطالبة (No lines — nothing new to claim)</td></tr>}
                  {cert.lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2 font-semibold">{l.unitLabel}</td>
                      <td className="p-2 text-right">{fmtMoney(l.unitValue)}</td>
                      <td className="p-2 text-right">{fmtPct(l.previousPercent, 4)}</td>
                      <td className="p-2 text-right">{fmtPct(l.cumulativePercent, 4)}</td>
                      <td className="p-2 text-right font-semibold">{fmtPct(l.currentPercent, 4)}</td>
                      <td className="p-2 text-right">{fmtMoney(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                {!!cert.lines.length && total && (
                  <tfoot className="bg-muted/70 sticky bottom-0 font-semibold">
                    <tr className="border-t">
                      <td className="p-2">المجموع (Total) — {cert.lines.length}</td>
                      <td className="p-2 text-right">{fmtMoney(total.value)}</td>
                      <td colSpan={3} />
                      <td className="p-2 text-right">{fmtMoney(total.amount)}</td>
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
            <DialogTitle>مستخلص جديد (New payment certificate)</DialogTitle>
            <DialogDescription>
              يُنشأ كمسودة من الإنجاز الحالي: الحالي = التراكمي − ما سبقت المطالبة به. (Created as a draft from current progress: current = cumulative − already certified.)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>العنوان (Title)</Label><Input value={info.title} onChange={(e) => setInfo({ ...info, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>من (From)</Label><Input type="date" value={info.periodFrom} onChange={(e) => setInfo({ ...info, periodFrom: e.target.value })} /></div>
              <div className="space-y-1"><Label>إلى (To)</Label><Input type="date" value={info.periodTo} onChange={(e) => setInfo({ ...info, periodTo: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>ملاحظات (Notes)</Label><Textarea rows={2} value={info.notes} onChange={(e) => setInfo({ ...info, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء (Cancel)</Button>
            <Button onClick={create} disabled={busy}>إنشاء مسودة (Create draft)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>رفض المستخلص (Reject certificate) #{cert?.certNo}</DialogTitle>
            <DialogDescription>تعود النسب قابلة للمطالبة في مستخلص لاحق. (Its percentages become claimable again.)</DialogDescription>
          </DialogHeader>
          <div className="space-y-1"><Label>السبب (Reason) *</Label><Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>إلغاء (Cancel)</Button>
            <Button className="bg-red-600 hover:bg-red-700" disabled={!rejectReason.trim() || busy}
              onClick={() => { setRejectOpen(false); transition("reject", rejectReason.trim()); }}>رفض (Reject)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المسودة (Delete draft) #{cert?.certNo}?</AlertDialogTitle>
            <AlertDialogDescription>لا يمكن التراجع. (This cannot be undone.)</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء (Cancel)</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => run(async () => {
              await api("DELETE", `/payment-certificates/${activeId}`);
              setSelectedId(null);
            }, "تم الحذف (Deleted)")}>حذف (Delete)</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
