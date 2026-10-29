// تحميل فاتورة على مقاول باطن: part or all of a supplier invoice charged to a subcontractor.
// The invoice and its bill request keep their own workflow; the charge ends up as a deduction on a
// subcontractor certificate (or, when there is none, as a deduction record).
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, Repeat, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { CHARGEBACK_LABELS } from "@shared/payments";
import { SubcontractorSelect } from "./subcontractor-select";
import { ActivityTimeline, StatusBadge, errorMessage, fmtDate, invalidatePayments, money, type PaymentsContext } from "./payments-common";

const num = (v: unknown) => Number(v ?? 0) || 0;

// Amount of an invoice already charged, ignoring withdrawn/rejected charges
export const chargedOf = (chargebacks: any[], invoiceId: string) =>
  chargebacks.filter((c) => c.invoiceId === invoiceId && c.status !== "cancelled").reduce((s, c) => s + num(c.amount), 0);

export function ChargeInvoiceDialog({ ctx, bill, invoice, chargebacks, onClose }: {
  ctx: PaymentsContext; bill: any; invoice: any; chargebacks: any[]; onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const remaining = Math.max(0, num(invoice.amount) - chargedOf(chargebacks, invoice.id));
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState("");
  const [subId, setSubId] = useState("");
  const [reason, setReason] = useState("");
  const value = mode === "full" ? remaining : num(amount);

  const create = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/payments/chargebacks", { invoiceId: invoice.id, subcontractorId: subId, amount: value, reason }),
    onSuccess: async (res) => {
      const created = await res.json().catch(() => null);
      invalidatePayments(queryClient);
      toast({ title: created?.status === "approved" ? "تم تسجيل التحميل واعتماده" : "تم رفع التحميل لمدير المشروع" });
      onClose();
    },
    onError: (e) => toast({ title: "تعذّر تسجيل التحميل", description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>تحميل الفاتورة على مقاول باطن</DialogTitle>
          <DialogDescription>
            الفاتورة <span className="font-mono">{invoice.invoiceNo}</span> ({bill.requestNo}) بقيمة {money(invoice.amount)} شاملة الضريبة. دورة الفاتورة تبقى كما هي، ويُسجَّل التحميل كخصم منفصل.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>مقاول الباطن</Label>
            <SubcontractorSelect projectId={bill.projectId} value={subId} onChange={setSubId} />
          </div>
          <div className="space-y-1.5">
            <Label>المبلغ المحمَّل</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={mode === "full" ? "default" : "outline"} onClick={() => setMode("full")}>كامل المتبقي ({money(remaining)})</Button>
              <Button type="button" size="sm" variant={mode === "partial" ? "default" : "outline"} onClick={() => setMode("partial")}>جزء منه</Button>
            </div>
            {mode === "partial" && (
              <Input type="number" min="0" step="0.01" max={remaining} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`حتى ${money(remaining)}`} />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>سبب التحميل</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مواد صُرفت للمقاول، أعمال تمت على حسابه…" />
          </div>
          <p className="text-xs text-muted-foreground">
            {ctx.perms.canApprove ? "سيُعتمد التحميل مباشرة لأنك مدير المشروع." : "يُرفع للتحميل لمدير المشروع ليعتمده، ثم يُخصم من مستخلص المقاول."}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button disabled={create.isPending || remaining <= 0 || !subId || !reason.trim() || !(value > 0) || value > remaining + 0.005} onClick={() => create.mutate()}>تسجيل التحميل</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Everything charged so far, with the decisions that move it along
export function ChargebacksPanel({ ctx, projectId, rows }: { ctx: PaymentsContext; projectId: string; rows: any[] }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<any | null>(null);
  const [note, setNote] = useState("");
  const [show, setShow] = useState(false);

  const act = useMutation({
    mutationFn: async (v: { id: string; action: string; note?: string }) => apiRequest("POST", `/api/payments/chargebacks/${v.id}/transition`, { action: v.action, note: v.note }),
    onSuccess: (_d, v) => {
      invalidatePayments(queryClient);
      const msg: Record<string, string> = { approve: "تم اعتماد التحميل", reject: "تم رفض التحميل", withdraw: "تم سحب التحميل", convert: "تم تحويله إلى خصم" };
      toast({ title: msg[v.action] });
      setRejecting(null);
      setNote("");
    },
    onError: (e) => toast({ title: "تعذّر تنفيذ الإجراء", description: errorMessage(e), variant: "destructive" }),
  });

  const sorted = useMemo(() => rows.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), [rows]);
  const open = sorted.filter((c) => c.status === "proposed" || c.status === "approved");
  const visible = show ? sorted : open;
  if (rows.length === 0) return null;
  const current = openId ? rows.find((r) => r.id === openId) ?? null : null;

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <span className="font-bold text-sm">خصومات الفواتير على مقاولي الباطن</span>
          <span className="text-xs text-muted-foreground">({open.length} بانتظار الخصم في مستخلص)</span>
          <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setShow((v) => !v)}>{show ? "إخفاء المنتهية" : `عرض الكل (${rows.length})`}</Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الرقم</TableHead>
                {projectId === "all" && <TableHead>المشروع</TableHead>}
                <TableHead>الفاتورة</TableHead>
                <TableHead>مقاول الباطن</TableHead>
                <TableHead className="text-end">المبلغ</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">لا توجد خصومات معلّقة</TableCell></TableRow>}
              {visible.map((c) => {
                const mine = c.createdBy === user?.id;
                const own = mine && user?.role !== "super_admin";
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)}>
                    <TableCell className="font-mono text-xs">{c.chargeNo}</TableCell>
                    {projectId === "all" && <TableCell>{c.projectName}</TableCell>}
                    <TableCell className="text-sm"><span className="font-mono">{c.invoiceNo}</span><div className="text-xs text-muted-foreground">{c.payeeName} · {c.requestNo}</div></TableCell>
                    <TableCell className="font-semibold">{c.subcontractorName}</TableCell>
                    <TableCell className="text-end tabular-nums font-semibold">{money(c.amount)}{!c.isFull && <div className="text-xs font-normal text-muted-foreground">من {money(c.invoiceAmount)}</div>}</TableCell>
                    <TableCell><StatusBadge status={c.status} labels={CHARGEBACK_LABELS} /></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        {c.status === "proposed" && ctx.perms.canApprove && (
                          <>
                            <Button size="sm" disabled={act.isPending || own} title={own ? "لا يمكنك اعتماد تحميل اقترحته" : undefined} onClick={() => act.mutate({ id: c.id, action: "approve" })}><CheckCircle2 className="w-4 h-4 mr-1" /> اعتماد</Button>
                            <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => setRejecting(c)}><XCircle className="w-4 h-4 mr-1" /> رفض</Button>
                          </>
                        )}
                        {c.status === "approved" && (ctx.perms.isAccounting || ctx.perms.canApprove) && (
                          <Button size="sm" variant="outline" disabled={act.isPending} title="لا يوجد مستخلص لخصمه منه: يُسجَّل كخصم على المقاول" onClick={() => act.mutate({ id: c.id, action: "convert" })}><Repeat className="w-4 h-4 mr-1" /> تحويل إلى خصم</Button>
                        )}
                        {["proposed", "approved"].includes(c.status) && (mine || ctx.perms.isAccounting || ctx.perms.canApprove) && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={act.isPending} title="سحب" onClick={() => act.mutate({ id: c.id, action: "withdraw" })}><Ban className="w-4 h-4" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {rejecting && (
        <Dialog open onOpenChange={(o) => !o && setRejecting(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>رفض التحميل {rejecting.chargeNo}</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Label>سبب الرفض</Label>
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejecting(null)}>تراجع</Button>
              <Button variant="destructive" disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ id: rejecting.id, action: "reject", note })}>رفض</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {current && (
        <Dialog open onOpenChange={(o) => !o && setOpenId(null)}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3"><span className="font-mono">{current.chargeNo}</span><StatusBadge status={current.status} labels={CHARGEBACK_LABELS} /></DialogTitle>
              <DialogDescription>{current.projectName}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-muted-foreground">مقاول الباطن</div>{current.subcontractorName}</div>
              <div><div className="text-xs text-muted-foreground">المبلغ (شامل الضريبة)</div><span className="tabular-nums font-semibold">{money(current.amount)}</span> من {money(current.invoiceAmount)}</div>
              <div><div className="text-xs text-muted-foreground">الفاتورة</div><span className="font-mono">{current.invoiceNo}</span> · {current.requestNo}</div>
              <div><div className="text-xs text-muted-foreground">اقترحه</div>{current.createdByName ?? "—"} · {fmtDate(current.createdAt)}</div>
              <div className="col-span-2"><div className="text-xs text-muted-foreground">السبب</div>{current.reason}</div>
              {current.rejectReason && <div className="col-span-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3"><b>ملاحظة: </b>{current.rejectReason}</div>}
            </div>
            <ActivityTimeline entityType="chargeback" entityId={current.id} labels={CHARGEBACK_LABELS} />
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
