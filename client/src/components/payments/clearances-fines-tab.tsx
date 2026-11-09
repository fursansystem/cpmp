import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Paperclip, AlertTriangle, Banknote, Trash2, Save, HandHelping, CheckCircle2, XCircle, FileBadge, Gavel } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import {
  FINE_LABELS,
  LIABLE_PARTY_LABELS,
  OPEN_PAYMENT_ORDER, LIABLE_PARTIES, FINE_STATUSES } from "@shared/payments";
import {
  LatestActivity,
  PaymentDialog,
  Section,
  AttachmentsPanel,
  StatusBadge,
  errorMessage,
  fmtDate,
  invalidatePayments,
  money,
  type PaymentsContext,
  useFocusFromUrl,
} from "./payments-common";
import { SubcontractorSelect } from "./subcontractor-select";
import { enumText, enumOptions, type EnumGroup } from "@/lib/enums";

const todayIso = () => new Date().toISOString().slice(0, 10);

function ProjectSelect({ ctx, value, onChange, disabled }: { ctx: PaymentsContext; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const { t } = useTranslation("payments");
  return (
    <div className="space-y-1.5">
      <Label>{t("common.project")}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger><SelectValue placeholder={t("common.select_project")} /></SelectTrigger>
        <SelectContent>{ctx.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function Toolbar({ search, setSearch, status, setStatus, group, codes, onNew, newLabel }: {
  search: string; setSearch: (v: string) => void; status: string; setStatus: (v: string) => void;
  group: EnumGroup; codes: readonly string[]; onNew: () => void; newLabel: string;
}) {
  const { t } = useTranslation("payments");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute start-3 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input className="ps-9" placeholder={t("common.search_ellipsis")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("common.all_statuses")}</SelectItem>
          {enumOptions(group, codes).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button className="ms-auto" onClick={onNew}><Plus className="w-4 h-4 me-1" /> {newLabel}</Button>
    </div>
  );
}

interface TabProps {
  ctx: PaymentsContext;
  projectId: string;
  rows: any[];
  orders: any[];
  onRequestPayment: (id: string) => void;
}

// --------------------------------------------------------------------- Fines

const emptyFine = { title: "", authority: "", referenceNo: "", reason: "", liableParty: "contractor", subcontractorId: "", amount: "", issueDate: "", dueDate: "", status: "open", notes: "" };

export function FinesTab({ ctx, projectId, rows, orders, onRequestPayment }: TabProps) {
  const { t } = useTranslation("payments");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | "new" | null>(null);
  useFocusFromUrl((id) => rows.some((r) => r.id === id), (id) => setEditing(rows.find((r) => r.id === id) ?? null));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (status === "all" || r.status === status) && (!q || [r.title, r.authority, r.referenceNo, r.projectName, r.reason].some((s) => String(s ?? "").toLowerCase().includes(q))));
  }, [rows, status, search]);

  const current = editing && editing !== "new" ? rows.find((r) => r.id === editing.id) ?? null : null;
  const today = todayIso();

  return (
    <div className="space-y-4">
      <Toolbar search={search} setSearch={setSearch} status={status} setStatus={setStatus} group="fine" codes={FINE_STATUSES} onNew={() => setEditing("new")} newLabel={t("fines.new_btn")} />
      <Card className="rounded-2xl">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fines.table.fine")}</TableHead>
                {projectId === "all" && <TableHead>{t("common.project")}</TableHead>}
                <TableHead>{t("fines.table.authority")}</TableHead>
                <TableHead>{t("fines.table.liable")}</TableHead>
                <TableHead className="text-end">{t("fines.table.amount")}</TableHead>
                <TableHead className="text-end">{t("fines.table.paid")}</TableHead>
                <TableHead>{t("common.due_date")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">{t("fines.no_items")}</TableCell></TableRow>}
              {filtered.map((r) => {
                const overdue = ["open", "under_appeal"].includes(r.status) && r.dueDate && r.dueDate < today;
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setEditing(r)}>
                    <TableCell className="font-semibold">{r.title}{r.referenceNo && <div className="text-xs font-normal text-muted-foreground">{r.referenceNo}</div>}</TableCell>
                    {projectId === "all" && <TableCell>{r.projectName}</TableCell>}
                    <TableCell>{r.authority ?? "—"}</TableCell>
                    <TableCell>{enumText("liable_party", r.liableParty)}{r.subcontractorName && <div className="text-xs text-muted-foreground">{r.subcontractorName}</div>}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(r.amount)}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(r.paidAmount)}</TableCell>
                    <TableCell className={overdue ? "text-destructive font-semibold" : ""}>{overdue && <AlertTriangle className="w-3.5 h-3.5 inline me-1" />}{fmtDate(r.dueDate)}</TableCell>
                    <TableCell><StatusBadge status={r.status} group="fine" /></TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap"><Paperclip className="w-3.5 h-3.5 inline me-1" />{r.attachments.length}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {editing && <FineDialog ctx={ctx} defaultProjectId={projectId} row={current} orders={orders} onClose={() => setEditing(null)} onRequestPayment={(id) => { setEditing(null); onRequestPayment(id); }} />}
    </div>
  );
}

// What a page (a snag item, an NCR) hands over when it starts a deduction, and where it came from
export interface DeductionPrefill {
  title?: string;
  reason?: string;
  authority?: string;
  liableParty?: string;
  subcontractorId?: string;
  amount?: number | string;
  sourceType?: string;
  sourceId?: string;
}

export function FineDialog({ ctx, defaultProjectId, row, orders, onClose, onRequestPayment, prefill }: {
  prefill?: DeductionPrefill; ctx: PaymentsContext; defaultProjectId: string; row: any | null; orders: any[]; onClose: () => void; onRequestPayment: (id: string) => void }) {
  const { t } = useTranslation("payments");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState(row?.projectId ?? (defaultProjectId === "all" ? "" : defaultProjectId));
  const [form, setForm] = useState(
    row
      ? { title: row.title, authority: row.authority ?? "", referenceNo: row.referenceNo ?? "", reason: row.reason ?? "", liableParty: row.liableParty, subcontractorId: row.subcontractorId ?? "", amount: String(Number(row.amount) || ""), issueDate: row.issueDate ?? "", dueDate: row.dueDate ?? "", status: row.status, notes: row.notes ?? "" }
      : {
          ...emptyFine,
          title: prefill?.title ?? "",
          reason: prefill?.reason ?? "",
          authority: prefill?.authority ?? "",
          liableParty: prefill?.liableParty ?? emptyFine.liableParty,
          subcontractorId: prefill?.subcontractorId ?? "",
          amount: prefill?.amount !== undefined ? String(prefill.amount) : "",
        },
  );
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  // With payment under way or complete the fine is owned by the payment flow
  const locked = !!row && (["payment_requested", "paid", "waiver_requested", "waived", "recovered"].includes(row.status) || !!row.deductedCertificateId);
  const [waiverPanel, setWaiverPanel] = useState<null | "request" | "reject" | "recover">(null);
  const [waiverNote, setWaiverNote] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...form, subcontractorId: form.liableParty === "subcontractor" ? form.subcontractorId || null : null, authority: form.authority || null, referenceNo: form.referenceNo || null, reason: form.reason || null, issueDate: form.issueDate || null, dueDate: form.dueDate || null, amount: form.amount || 0, notes: form.notes || null };
      return row ? apiRequest("PATCH", `/api/payments/fines/${row.id}`, body) : apiRequest("POST", "/api/payments/fines", { projectId, ...body, sourceType: prefill?.sourceType ?? null, sourceId: prefill?.sourceId ?? null });
    },
    onSuccess: () => { invalidatePayments(queryClient); toast({ title: row ? t("toasts.saved") : t("toasts.added") }); onClose(); },
    onError: (e) => toast({ title: t("errors.save_failed"), description: errorMessage(e), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/payments/fines/${row.id}`),
    onSuccess: () => { invalidatePayments(queryClient); onClose(); },
    onError: (e) => toast({ title: t("errors.delete_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  const waiver = useMutation({
    mutationFn: async (v: { action: string; note?: string }) => apiRequest("POST", `/api/payments/fines/${row.id}/waiver`, v),
    onSuccess: (_d, v) => {
      invalidatePayments(queryClient);
      const msg: Record<string, string> = { request: t("toasts.waiver_sent"), withdraw: t("toasts.waiver_withdrawn"), approve: t("toasts.waiver_approved"), reject: t("toasts.waiver_rejected") };
      toast({ title: msg[v.action] });
      onClose();
    },
    onError: (e) => toast({ title: t("errors.waiver_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  const recover = useMutation({
    mutationFn: async (note: string) => apiRequest("POST", `/api/payments/fines/${row.id}/recover`, { note }),
    onSuccess: () => { invalidatePayments(queryClient); toast({ title: t("toasts.recovery_recorded") }); onClose(); },
    onError: (e) => toast({ title: t("errors.recover_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  const hasLiveOrder = row ? orders.some((o) => o.fineId === row.id && ([...OPEN_PAYMENT_ORDER, "paid"] as string[]).includes(o.status)) : false;
  const canRequestPayment = ctx.perms.isAccounting && row && ["open", "under_appeal"].includes(row.status) && !hasLiveOrder && !row.deductedCertificateId;
  const canRequestWaiver = !!row && ["open", "under_appeal"].includes(row.status) && !hasLiveOrder && !row.deductedCertificateId;
  // A deduction charged to a subcontractor that was settled outside a certificate (recorded by accounting or a project manager)
  const canRecover = !!row && (ctx.perms.isAccounting || ctx.perms.canApprove) && ["open", "under_appeal"].includes(row.status) && !!row.subcontractorId && !row.deductedCertificateId && !hasLiveOrder;
  const ownWaiverRequest = row?.waiverRequestedBy === user?.id && user?.role !== "super_admin";
  // "waived" is reached only through the waiver flow, never picked from the status list
  const editableStatuses = Array.from(new Set(["open", "under_appeal", "cancelled", row?.status ?? "open"]));

  return (
    <PaymentDialog
      onClose={onClose}
      icon={Gavel}
      kind={t("fines.kind")}
      title={row ? row.title : t("fines.new_title")}
      badge={row ? <StatusBadge status={row.status} group="fine" /> : undefined}
      description={row ? row.projectName : t("fines.description")}
      amount={Number(form.amount) > 0 ? money(form.amount) : undefined}
      panel={waiverPanel && (
        <Section
          title={waiverPanel === "request" ? t("fines.waiver_panel_title") : waiverPanel === "recover" ? t("fines.recover_panel_title") : t("fines.reject_waiver_title")}
          icon={waiverPanel === "reject" ? XCircle : waiverPanel === "recover" ? CheckCircle2 : HandHelping}
          tone={waiverPanel === "reject" ? "danger" : undefined}
        >
          <Textarea rows={2} value={waiverNote} onChange={(e) => setWaiverNote(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setWaiverPanel(null)}>{t("common.back_btn")}</Button>
            <Button size="sm" variant={waiverPanel === "reject" ? "destructive" : "default"} disabled={!waiverNote.trim() || waiver.isPending || recover.isPending} onClick={() => (waiverPanel === "recover" ? recover.mutate(waiverNote) : waiver.mutate({ action: waiverPanel, note: waiverNote }))}>
              {waiverPanel === "request" ? t("common.send_request") : waiverPanel === "recover" ? t("fines.record_recovery") : t("common.reject")}
            </Button>
          </div>
        </Section>
      )}
      footer={
        <>
          {/* The step this deduction is waiting for comes first */}
          {!locked && <Button disabled={save.isPending || !form.title.trim() || !projectId} onClick={() => save.mutate()}><Save className="w-4 h-4 me-1" /> {t("common.save")}</Button>}
          {row?.status === "waiver_requested" && ctx.perms.canApprove && (
            <>
              <Button disabled={waiver.isPending || ownWaiverRequest} title={ownWaiverRequest ? t("fines.cannot_approve_own_waiver") : undefined} onClick={() => waiver.mutate({ action: "approve" })}>
                <CheckCircle2 className="w-4 h-4 me-1" /> {t("fines.approve_waiver")}
              </Button>
              <Button variant="outline" disabled={waiver.isPending} onClick={() => { setWaiverNote(""); setWaiverPanel("reject"); }}>
                <XCircle className="w-4 h-4 me-1" /> {t("fines.reject_waiver")}
              </Button>
            </>
          )}
          {canRequestPayment && <Button variant="outline" onClick={() => onRequestPayment(row.id)}><Banknote className="w-4 h-4 me-1" /> {t("fines.order_for_fine")}</Button>}
          {canRecover && <Button variant="outline" onClick={() => { setWaiverNote(""); setWaiverPanel("recover"); }}><CheckCircle2 className="w-4 h-4 me-1" /> {t("fines.record_recovery")}</Button>}
          {canRequestWaiver && <Button variant="outline" onClick={() => { setWaiverNote(""); setWaiverPanel("request"); }}><HandHelping className="w-4 h-4 me-1" /> {t("fines.request_waiver")}</Button>}
          {row?.status === "waiver_requested" && (row.waiverRequestedBy === user?.id || ctx.perms.canApprove) && (
            <Button variant="ghost" disabled={waiver.isPending} onClick={() => waiver.mutate({ action: "withdraw" })}>{t("common.withdraw_request")}</Button>
          )}
          {row && ctx.perms.isAccounting && !locked && (
            <Button variant="ghost" className="text-destructive" disabled={remove.isPending} onClick={() => remove.mutate()}><Trash2 className="w-4 h-4 me-1" /> {t("common.delete")}</Button>
          )}
        </>
      }
    >
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><ProjectSelect ctx={ctx} value={projectId} onChange={setProjectId} disabled={!!row} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>{t("fines.title_label")}</Label><Input value={form.title} disabled={locked} onChange={(e) => set("title")(e.target.value)} placeholder={t("fines.title_placeholder")} /></div>
          <div className="space-y-1.5"><Label>{t("fines.authority")}</Label><Input value={form.authority} disabled={locked} onChange={(e) => set("authority")(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t("fines.reference_no")}</Label><Input value={form.referenceNo} disabled={locked} onChange={(e) => set("referenceNo")(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>{t("fines.liable_party")}</Label>
            <Select value={form.liableParty} onValueChange={set("liableParty")} disabled={locked}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{enumOptions("liable_party", LIABLE_PARTIES).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {form.liableParty === "subcontractor" && (
            <div className="space-y-1.5 sm:col-span-2"><Label>{t("subcontractors.kind")}</Label><SubcontractorSelect projectId={projectId} value={form.subcontractorId} disabled={locked} onChange={(id) => set("subcontractorId")(id)} /></div>
          )}
          <div className="space-y-1.5"><Label>{t("fines.amount_label")}</Label><Input type="number" min="0" step="0.01" value={form.amount} disabled={locked} onChange={(e) => set("amount")(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t("fines.issue_date")}</Label><Input type="date" value={form.issueDate} disabled={locked} onChange={(e) => set("issueDate")(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t("fines.deadline")}</Label><Input type="date" value={form.dueDate} disabled={locked} onChange={(e) => set("dueDate")(e.target.value)} /></div>
          {!locked && (
            <div className="space-y-1.5">
              <Label>{t("common.status")}</Label>
              <Select value={form.status} onValueChange={set("status")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{editableStatuses.map((k) => <SelectItem key={k} value={k}>{enumText("fine", k)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {row && <div className="space-y-1.5"><Label>{t("fines.paid_so_far")}</Label><div className="h-10 flex items-center text-sm tabular-nums">{money(row.paidAmount)}</div></div>}
          <div className="space-y-1.5 sm:col-span-2"><Label>{t("fines.reason")}</Label><Textarea rows={2} value={form.reason} disabled={locked} onChange={(e) => set("reason")(e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>{t("common.notes")}</Label><Textarea rows={2} value={form.notes} disabled={locked} onChange={(e) => set("notes")(e.target.value)} /></div>
        </div>
        {locked && <p className="text-xs text-muted-foreground">{t("fines.locked_note")}</p>}
        {row?.waiverReason && ["waiver_requested", "waived"].includes(row.status) && (
          <div className="rounded-md border bg-violet-50 dark:bg-violet-900/10 p-3 text-sm">
            <div className="font-bold mb-1">{t("fines.waiver_reason_title")}</div>
            {row.waiverReason}
          </div>
        )}
        {row?.status === "recovered" && (
          <div className="rounded-md border bg-emerald-50 dark:bg-emerald-900/10 p-3 text-sm">
            <div className="font-bold mb-1">{t("fines.recovered_title")}{row.subcontractorName ? ` (${row.subcontractorName})` : ""}</div>
            {row.recoveredNote}
          </div>
        )}
        {row?.deductedCertificateId && row.status === "open" && (
          <div className="rounded-md border bg-violet-50 dark:bg-violet-900/10 p-3 text-sm">{t("fines.reserved_note")}</div>
        )}

        {row && (
          <>
            <LatestActivity entityType="fine" entityId={row.id} group="fine" />
            <div className="rounded-md border border-dashed border-primary/20 bg-primary/5 p-3">
              <AttachmentsPanel entityType="fine" entityId={row.id} projectId={row.projectId} files={row.attachments} editable canRemove={(f) => f.uploadedBy === user?.id || ctx.perms.isAccounting} hint={t("fines.hint_attachments")} />
            </div>
          </>
        )}
    </PaymentDialog>
  );
}
