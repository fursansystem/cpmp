// One licence / transaction: its steps (assigned to people, mirrored in Activity), requirements and documents,
// the fee and the payment order that pays it, its dates and its history.
import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowRight, Banknote, CheckCircle2, Circle, CircleDot, ExternalLink, FileText, History, Landmark, ListChecks, Paperclip, Pencil, Plus, RefreshCw, Save, SkipForward, Trash2, Undo2, Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { PaymentDialog } from "@/components/payments/payments-common";
import {
  OPEN_PERMIT,
  PERMIT_ACTIONS,
  PERMIT_CATEGORIES,
  PERMIT_TRANSITIONS,
  addMonths,
  type PermitAction,
  type PermitUserRef, REQUIREMENT_KINDS } from "@shared/permits";
import {
  AttentionBadge,
  PermitStatusBadge,
  StatusBadge,
  errorMessage,
  fmtDate,
  getJson,
  invalidatePermits,
  money,
  permitsQuery,
  uploadToPermits,
  usePermitsContext,
} from "@/components/permits/permits-common";
import { enumText, enumOptions } from "@/lib/enums";

interface Detail {
  transaction: any;
  steps: any[];
  requirements: any[];
  files: any[];
  activity: any[];
  orders: { id: string; orderNo: string; status: string; amount: string; paidDate: string | null }[];
  assignees: PermitUserRef[];
  perms: { canManage: boolean; canDelete: boolean; canWork: boolean; canTransition: boolean };
  me: string;
}

const LIVE_ORDER = ["requested", "request_approved", "draft", "pending_approval", "approved", "paid"];

export default function PermitDetail() {
  const { t } = useTranslation("permits");
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data: ctx } = usePermitsContext();
  const { data, isLoading, error } = useQuery<Detail>({
    queryKey: ["permits", "transaction", id],
    queryFn: () => getJson(`/api/permits/transactions/${id}`),
    meta: permitsQuery,
  });
  const [transition, setTransition] = useState<PermitAction | null>(null);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);

  const done = () => invalidatePermits(queryClient);
  const fail = (title: string) => (e: unknown) => toast({ title, description: errorMessage(e), variant: "destructive" });

  const renew = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/permits/transactions/${id}/renew`)).json(),
    onSuccess: (row: { id: string }) => { done(); navigate(`/permits/${row.id}`); },
    onError: fail(t("detail.toasts.renew_error")),
  });
  const remove = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/permits/transactions/${id}`),
    onSuccess: () => { done(); navigate("/permits"); },
    onError: fail(t("detail.toasts.delete_error")),
  });

  if (isLoading) return <div className="p-6 lg:p-8 space-y-4"><Skeleton className="h-12 w-64" /><Skeleton className="h-96 rounded-2xl" /></div>;
  if (error || !data) {
    return (
      <div className="p-6 lg:p-8">
        <Card className="p-10 text-center space-y-3">
          <p className="text-muted-foreground">{errorMessage(error) || t("overview.table.no_transactions")}</p>
          <Button variant="outline" asChild><Link href="/permits">{t("detail.back_to_permits")}</Link></Button>
        </Card>
      </div>
    );
  }

  const { transaction: tr, perms } = data;
  const open = (OPEN_PERMIT as readonly string[]).includes(tr.status);
  const fee = Number(tr.feeAmount) || 0;
  const liveOrder = data.orders.find((o) => LIVE_ORDER.includes(o.status));
  const isAccounting = !!ctx?.isAccounting;
  const canRequestPayment = perms.canManage && fee > 0 && !tr.feePaid && !liveOrder;
  const allowedActions = PERMIT_ACTIONS.filter((a) => (PERMIT_TRANSITIONS[a].from as readonly string[]).includes(tr.status));
  const missingMandatory = data.requirements.filter((r) => r.mandatory && r.status !== "provided").length;
  const portal = tr.portalUrl || tr.authorityPortalUrl;

  return (
    <div className="p-6 lg:p-8 space-y-6" data-testid="page-permit-detail">
      {/* breadcrumb & title */}
      <div className="space-y-2">
        <Link href="/permits" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowRight className="w-4 h-4 ltr:rotate-180" /> {t("detail.back_to_permits")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black font-display">{tr.title}</h1>
              <PermitStatusBadge status={tr.status} />
              <AttentionBadge kind={tr.attention} />
            </div>
            <p className="text-xs text-muted-foreground">
              {tr.transactionNo} · {tr.kind === "license" ? t("detail.kind_license") : t("detail.kind_transaction")} · {enumText("permit_category", tr.category)} · {tr.projectName}
              {tr.serviceName && <> · {t("detail.from_service", { name: tr.serviceName })}</>}
            </p>
            <p className="text-sm">{tr.authorityName ?? "—"}{portal && <a href={portal} target="_blank" rel="noreferrer" className="ms-2 inline-flex items-center gap-1 text-primary hover:underline">{t("detail.authority_portal")} <ExternalLink className="w-3.5 h-3.5" /></a>}</p>
            {tr.renewalOf && <p className="text-xs text-muted-foreground">{t("detail.renewal_of")} <Link className="text-primary hover:underline" href={`/permits/${tr.renewalOf.id}`}>{tr.renewalOf.transactionNo}</Link></p>}
            {tr.renewals?.length > 0 && <p className="text-xs text-muted-foreground">{t("detail.renewed_by")} {tr.renewals.map((r: any) => <Link key={r.id} className="text-primary hover:underline me-1" href={`/permits/${r.id}`}>{r.transactionNo}</Link>)}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {perms.canTransition && allowedActions.map((a) => (
              <Button key={a} size="sm" variant={a === "complete" ? "default" : "outline"} onClick={() => setTransition(a)} data-testid={`action-${a}`}>
                {enumText("permit_action", a)}
              </Button>
            ))}
            {perms.canManage && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="w-4 h-4 me-1" /> {t("detail.btn_edit")}</Button>}
            {tr.kind === "license" && (tr.status === "completed" || tr.status === "expired") && tr.isDeveloper && (
              <Button size="sm" variant="outline" disabled={renew.isPending} onClick={() => renew.mutate()}><RefreshCw className="w-4 h-4 me-1" /> {t("detail.btn_renew")}</Button>
            )}
            {perms.canDelete && <Button size="sm" variant="ghost" className="text-destructive" disabled={remove.isPending} onClick={() => confirm(t("detail.btn_confirm_delete")) && remove.mutate()}><Trash2 className="w-4 h-4" /></Button>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-2">
          <Tile label={t("detail.tiles.assignee")}>{tr.assigneeName ?? "—"}</Tile>
          <Tile label={t("detail.tiles.reference_no")}>{tr.referenceNo ?? "—"}</Tile>
          <Tile label={t("detail.tiles.license_no")}>{tr.licenseNo ?? "—"}</Tile>
          <Tile label={t("detail.tiles.start")}>{fmtDate(tr.startDate)}</Tile>
          <Tile label={t("detail.tiles.target")}>{fmtDate(tr.dueDate)}</Tile>
          <Tile label={t("detail.tiles.issue_date")}>{fmtDate(tr.issueDate)}</Tile>
          <Tile label={t("detail.tiles.expiry_date")}>{fmtDate(tr.expiryDate)}</Tile>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <StepsPanel data={data} />
          <RequirementsPanel data={data} />
          <FilesPanel data={data} />
        </div>

        <div className="space-y-6">
          {/* Fee & payment card */}
          <Panel title={t("detail.tiles.fees_payment")} icon={Banknote}>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black tabular-nums">{fee > 0 ? money(fee) : t("detail.tiles.no_fee")}</span>
              {fee > 0 && <Badge variant="secondary" className={cn("border-none", tr.feePaid ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700")}>{tr.feePaid ? t("detail.tiles.paid_at", { date: fmtDate(tr.feePaidAt) }) : t("detail.tiles.fee_unpaid")}</Badge>}
            </div>
            {data.orders.map((o) => (
              <div key={o.id} className="rounded-lg border p-2.5 text-xs flex items-center justify-between">
                <div>
                  <div className="font-semibold">{t("detail.orders.order_no", { no: o.orderNo })} · {money(o.amount)}</div>
                  <div className="text-muted-foreground">{o.paidDate ? t("detail.orders.paid", { date: fmtDate(o.paidDate) }) : enumText("payment_order", o.status)}</div>
                </div>
                <Button size="sm" variant="ghost" asChild><Link href="/payments?tab=orders">{t("detail.orders.view_order")}</Link></Button>
              </div>
            ))}
            {canRequestPayment && <Button className="w-full" onClick={() => setPaying(true)} data-testid="button-request-payment"><Banknote className="w-4 h-4 me-1" /> {t("detail.btn_request_payment")}</Button>}
            {fee > 0 && !tr.feePaid && !canRequestPayment && !liveOrder && open && <p className="text-xs text-muted-foreground">{t("detail.orders.dev_team_note")}</p>}
            <p className="text-xs text-muted-foreground">{t("detail.orders.desc")}</p>
          </Panel>

          {/* Activity / history */}
          <Panel title={t("detail.activity.title")} icon={History}>
            <ol className="space-y-3 text-xs">
              {data.activity.map((a) => (
                <li key={a.id} className="relative ps-4 border-s pb-2 last:pb-0">
                  <span className="absolute -start-1.5 top-1 w-3 h-3 rounded-full bg-primary/20 border-2 border-background" />
                  <div className="font-semibold">{t(`detail.activity.actions.${a.action}` as any, { defaultValue: a.action })}</div>
                  {a.note && <div className="text-muted-foreground mt-0.5">{a.note}</div>}
                  <div className="text-xs text-muted-foreground">{a.userName ?? t("detail.activity.system")} · {new Date(a.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</div>
                </li>
              ))}
              {data.activity.length === 0 && <p className="text-muted-foreground">{t("detail.activity.empty")}</p>}
            </ol>
          </Panel>
        </div>
      </div>

      {transition && (
        <TransitionDialog
          detail={data}
          action={transition}
          missing={missingMandatory}
          onClose={() => setTransition(null)}
        />
      )}
      {editing && <EditDialog detail={data} onClose={() => setEditing(false)} />}
      {paying && <RequestPaymentDialog detail={data} isAccounting={isAccounting} onClose={() => setPaying(false)} />}
    </div>
  );
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xs font-semibold mt-0.5 truncate">{children}</div>
    </div>
  );
}

function Panel({ title, icon: Icon, action, children }: { title: string; icon: typeof ListChecks; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm"><Icon className="w-4 h-4 text-primary" /> {title}</div>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ steps

function StepsPanel({ data }: { data: Detail }) {
  const { t: trn } = useTranslation("permits");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { perms, transaction: t } = data;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", assigneeUserId: "", dueDate: "" });
  const onError = (e: unknown) => toast({ title: trn("detail.toasts.step_error"), description: errorMessage(e), variant: "destructive" });
  const ok = () => invalidatePermits(queryClient);

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => apiRequest("POST", `/api/permits/steps/${id}/status`, { status }),
    onSuccess: ok, onError,
  });
  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => apiRequest("PATCH", `/api/permits/steps/${id}`, body),
    onSuccess: ok, onError,
  });
  const del = useMutation({ mutationFn: async (id: string) => apiRequest("DELETE", `/api/permits/steps/${id}`), onSuccess: ok, onError });
  const add = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/permits/transactions/${t.id}/steps`, { title: draft.title, assigneeUserId: draft.assigneeUserId || null, dueDate: draft.dueDate || null }),
    onSuccess: () => { ok(); setDraft({ title: "", assigneeUserId: "", dueDate: "" }); setAdding(false); }, onError,
  });

  const today = new Date().toISOString().slice(0, 10);
  const open = (OPEN_PERMIT as readonly string[]).includes(t.status);

  return (
    <Panel title={trn("detail.steps.title")} icon={ListChecks} action={perms.canManage && <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}><Plus className="w-4 h-4 me-1" /> {trn("service_editor.step_btn")}</Button>}>
      <p className="text-xs text-muted-foreground">{trn("detail.steps.activity_note")}</p>
      <ol className="space-y-2">
        {data.steps.map((s) => {
          const mine = s.assigneeUserId && s.assigneeUserId === data.me;
          const canAct = open && (perms.canManage || perms.canWork);
          const overdue = s.dueDate && s.dueDate < today && !["done", "skipped"].includes(s.status);
          const feeBlocked = s.isPaymentStep && Number(t.feeAmount) > 0 && !t.feePaid;
          return (
            <li key={s.id} className={cn("rounded-xl border p-3", s.status === "done" && "bg-emerald-500/5", mine && "border-primary/40")}>
              <div className="flex flex-wrap items-center gap-3">
                {s.status === "done" ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : s.status === "in_progress" ? <CircleDot className="w-5 h-5 text-blue-600" /> : s.status === "skipped" ? <SkipForward className="w-5 h-5 text-muted-foreground" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                <div className="flex-1 min-w-[180px]">
                  <div className={cn("font-semibold", s.status === "skipped" && "line-through text-muted-foreground")}>{s.seq}. {s.title}{s.isPaymentStep && <Badge variant="secondary" className="ms-2 border-none bg-amber-500/10 text-amber-700">{trn("detail.steps.payment_badge")}</Badge>}</div>
                  <div className="text-xs text-muted-foreground">
                    {enumText("step_party", s.party)} · {enumText("step_status", s.status)}
                    {s.completedByName && ` · ${s.completedByName} ${fmtDate(s.completedAt)}`}
                    {s.note && ` · ${s.note}`}
                  </div>
                </div>
                {perms.canManage ? (
                  <>
                    <Select value={s.assigneeUserId ?? "none"} onValueChange={(v) => patch.mutate({ id: s.id, body: { assigneeUserId: v === "none" ? null : v } })}>
                      <SelectTrigger className="w-[190px] h-9"><SelectValue placeholder={trn("detail.steps.assign_ph")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{trn("detail.steps.unassigned")}</SelectItem>
                        {data.assignees.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {enumText("step_party", u.party)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="date" className={cn("w-[150px] h-9", overdue && "border-destructive text-destructive")} value={s.dueDate ?? ""} onChange={(e) => patch.mutate({ id: s.id, body: { dueDate: e.target.value || null } })} />
                  </>
                ) : (
                  <div className="text-xs text-end">
                    <div>{s.assigneeName ?? trn("detail.steps.unassigned")}</div>
                    <div className={cn(overdue && "text-destructive font-semibold")}>{fmtDate(s.dueDate)}</div>
                  </div>
                )}
                {canAct && (
                  <div className="flex gap-1">
                    {s.status !== "done" && !feeBlocked && <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: s.id, status: "done" })} data-testid="button-step-done"><CheckCircle2 className="w-4 h-4 me-1" /> {trn("detail.steps.done")}</Button>}
                    {s.status === "pending" && <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: s.id, status: "in_progress" })}>{trn("detail.steps.start_btn")}</Button>}
                    {(s.status === "done" || s.status === "skipped") && !(s.isPaymentStep && t.feePaid) && <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: s.id, status: "pending" })}><Undo2 className="w-4 h-4" /></Button>}
                    {perms.canManage && s.status !== "skipped" && s.status !== "done" && <Button size="sm" variant="ghost" title={trn("detail.steps.skip")} onClick={() => setStatus.mutate({ id: s.id, status: "skipped" })}><SkipForward className="w-4 h-4" /></Button>}
                    {perms.canManage && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm(trn("detail.steps.delete_confirm")) && del.mutate(s.id)}><Trash2 className="w-4 h-4" /></Button>}
                  </div>
                )}
              </div>
              {feeBlocked && s.status !== "done" && <p className="text-xs text-amber-700 mt-2">{trn("detail.steps.fee_blocked_note")}</p>}
            </li>
          );
        })}
        {data.steps.length === 0 && <p className="text-sm text-muted-foreground">{trn("detail.steps.empty")}</p>}
      </ol>
      {adding && (
        <div className="grid sm:grid-cols-4 gap-2 rounded-xl border border-dashed p-3">
          <Input className="sm:col-span-2" placeholder={trn("service_editor.step_title_ph")} value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          <Select value={draft.assigneeUserId || "none"} onValueChange={(v) => setDraft((d) => ({ ...d, assigneeUserId: v === "none" ? "" : v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{trn("detail.steps.unassigned")}</SelectItem>
              {data.assignees.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={draft.dueDate} onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))} />
          <Button className="sm:col-span-4" disabled={!draft.title.trim() || add.isPending} onClick={() => add.mutate()}><Save className="w-4 h-4 me-1" /> {trn("detail.steps.add_step")}</Button>
        </div>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ requirements & documents

function RequirementsPanel({ data }: { data: Detail }) {
  const { t } = useTranslation("permits");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { perms, transaction: tRecord } = data;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ kind: "document", title: "", mandatory: true });
  const onError = (e: unknown) => toast({ title: t("detail.toasts.step_error"), description: errorMessage(e), variant: "destructive" });
  const ok = () => invalidatePermits(queryClient);

  const patch = useMutation({ mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => apiRequest("PATCH", `/api/permits/requirements/${id}`, body), onSuccess: ok, onError });
  const del = useMutation({ mutationFn: async (id: string) => apiRequest("DELETE", `/api/permits/requirements/${id}`), onSuccess: ok, onError });
  const add = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/permits/transactions/${tRecord.id}/requirements`, draft),
    onSuccess: () => { ok(); setDraft({ kind: "document", title: "", mandatory: true }); setAdding(false); }, onError,
  });

  const groups = [
    { kind: "document", title: t("service_dialog.documents_title") },
    { kind: "condition", title: t("service_dialog.requirements_title") },
  ];

  return (
    <Panel title={t("detail.requirements.title")} icon={FileText} action={perms.canManage && <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}><Plus className="w-4 h-4 me-1" /> {t("detail.requirements.add_req")}</Button>}>
      {groups.map((g) => {
        const items = data.requirements.filter((r) => (g.kind === "document" ? r.kind === "document" : r.kind !== "document"));
        if (items.length === 0) return null;
        return (
          <div key={g.kind} className="space-y-2">
            <div className="text-xs font-bold text-muted-foreground">{g.title}</div>
            {items.map((r) => {
              const files = data.files.filter((f) => f.requirementId === r.id);
              return (
                <div key={r.id} className="rounded-xl border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.status === "provided" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                    <span className={cn("flex-1 font-medium", r.status === "not_applicable" && "line-through text-muted-foreground")}>{r.title}{!r.mandatory && <span className="text-xs text-muted-foreground"> ({t("detail.requirements.optional")})</span>}</span>
                    <StatusBadge status={r.status} group="requirement_status" />
                    {perms.canWork && r.kind === "document" && <UploadButton detail={data} requirementId={r.id} />}
                    {perms.canWork && r.kind !== "document" && r.status !== "provided" && <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: r.id, body: { status: "provided" } })}>{t("detail.requirements.provided")}</Button>}
                    {perms.canWork && r.status === "provided" && files.length === 0 && <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: r.id, body: { status: "missing" } })}><Undo2 className="w-4 h-4" /></Button>}
                    {perms.canManage && r.status === "missing" && <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: r.id, body: { status: "not_applicable" } })}>{t("detail.requirements.na")}</Button>}
                    {perms.canManage && r.status === "not_applicable" && <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: r.id, body: { status: "missing" } })}><Undo2 className="w-4 h-4" /></Button>}
                    {perms.canManage && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm(t("detail.requirements.del_confirm")) && del.mutate(r.id)}><Trash2 className="w-4 h-4" /></Button>}
                  </div>
                  {files.length > 0 && <FileList detail={data} files={files} />}
                </div>
              );
            })}
          </div>
        );
      })}
      {data.requirements.length === 0 && <p className="text-sm text-muted-foreground">{t("detail.requirements.empty")}</p>}
      {adding && (
        <div className="grid sm:grid-cols-6 gap-2 rounded-xl border border-dashed p-3">
          <Select value={draft.kind} onValueChange={(v) => setDraft((d) => ({ ...d, kind: v }))}>
            <SelectTrigger className="sm:col-span-2"><SelectValue /></SelectTrigger>
            <SelectContent>{enumOptions("requirement_kind", REQUIREMENT_KINDS).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input className="sm:col-span-3" placeholder={t("service_editor.req_title_ph")} value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          <label className="flex items-center gap-1.5 text-xs"><Switch checked={draft.mandatory} onCheckedChange={(v) => setDraft((d) => ({ ...d, mandatory: v }))} /> {t("detail.requirements.mandatory")}</label>
          <Button className="sm:col-span-6" disabled={!draft.title.trim() || add.isPending} onClick={() => add.mutate()}><Save className="w-4 h-4 me-1" /> {t("detail.requirements.add_btn")}</Button>
        </div>
      )}
    </Panel>
  );
}

function UploadButton({ detail, requirementId, label }: { detail: Detail; requirementId?: string; label?: string }) {
  const { t } = useTranslation("permits");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const tr = detail.transaction;
  const onPick = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        if (file.size > 25 * 1024 * 1024) { toast({ title: t("detail.files.size_limit", { name: file.name }), variant: "destructive" }); continue; }
        const objectPath = await uploadToPermits(file, tr.projectId);
        await apiRequest("POST", "/api/permits/attachments", { transactionId: tr.id, requirementId: requirementId ?? null, fileName: file.name, objectPath, contentType: file.type || null, size: file.size });
      }
      invalidatePermits(queryClient);
    } catch (e) {
      toast({ title: t("detail.toasts.file_error"), description: errorMessage(e), variant: "destructive" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <>
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => onPick(e.target.files)} />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload className="w-4 h-4 me-1" /> {busy ? t("detail.files.uploading") : (label ?? t("detail.files.upload_btn"))}</Button>
    </>
  );
}

function FileList({ detail, files }: { detail: Detail; files: any[] }) {
  const { t } = useTranslation("permits");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const del = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/permits/attachments/${id}`),
    onSuccess: () => invalidatePermits(queryClient),
    onError: (e) => toast({ title: t("detail.files.del_error"), description: errorMessage(e), variant: "destructive" }),
  });
  return (
    <ul className="space-y-1">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-2 text-sm">
          <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
          <a href={f.objectPath} target="_blank" rel="noreferrer" className="flex-1 truncate text-primary hover:underline">{f.fileName}</a>
          <span className="text-xs text-muted-foreground">{f.uploadedByName ?? ""}</span>
          {(detail.perms.canManage || f.uploadedBy === detail.me) && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => del.mutate(f.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}
        </li>
      ))}
    </ul>
  );
}

function FilesPanel({ data }: { data: Detail }) {
  const { t } = useTranslation("permits");
  const general = data.files.filter((f) => !f.requirementId);
  return (
    <Panel title={t("detail.files.other_title")} icon={Paperclip} action={data.perms.canWork && <UploadButton detail={data} label={t("detail.files.attach")} />}>
      {general.length === 0 ? <p className="text-sm text-muted-foreground">{t("detail.files.help_text")}</p> : <FileList detail={data} files={general} />}
    </Panel>
  );
}

// ------------------------------------------------------------------ dialogs

function TransitionDialog({ detail, action, missing, onClose }: { detail: Detail; action: PermitAction; missing: number; onClose: () => void }) {
  const { t: trn } = useTranslation("permits");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = detail.transaction;
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    note: "",
    referenceNo: t.referenceNo ?? "",
    licenseNo: t.licenseNo ?? "",
    issueDate: t.issueDate ?? today,
    expiryDate: t.expiryDate ?? (t.validityMonths ? addMonths(t.issueDate ?? today, t.validityMonths) : ""),
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const rule = PERMIT_TRANSITIONS[action];
  const go = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/permits/transactions/${t.id}/transition`, {
      action,
      note: form.note || null,
      referenceNo: form.referenceNo || null,
      licenseNo: action === "complete" ? form.licenseNo || null : null,
      issueDate: action === "complete" ? form.issueDate || null : null,
      expiryDate: action === "complete" ? form.expiryDate || null : null,
    })).json(),
    onSuccess: () => { invalidatePermits(queryClient); toast({ title: enumText("permit_action", action) }); onClose(); },
    onError: (e) => toast({ title: trn("detail.toasts.update_error"), description: errorMessage(e), variant: "destructive" }),
  });
  const needsExpiry = action === "complete" && t.kind === "license" && !form.expiryDate;
  return (
    <PaymentDialog
      onClose={onClose}
      size="md"
      icon={Landmark}
      kind={t.transactionNo}
      title={enumText("permit_action", action)}
      description={`${enumText("permit_status", t.status)} ← ${enumText("permit_status", rule.to)}`}
      footer={<Button disabled={go.isPending || needsExpiry} onClick={() => go.mutate()}><Save className="w-4 h-4 me-1" /> {trn("detail.dialog_transition.confirm")}</Button>}
    >
      {missing > 0 && (action === "submit" || action === "complete") && (
        <p className="rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 p-3 text-sm">{trn("detail.dialog_transition.missing_alert", { missing })}</p>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {(action === "submit" || action === "complete") && <div className="space-y-1.5 sm:col-span-2"><Label>{trn("detail.dialog_edit.field_reference_no")}</Label><Input value={form.referenceNo} onChange={(e) => set("referenceNo")(e.target.value)} /></div>}
        {action === "complete" && (
          <>
            <div className="space-y-1.5 sm:col-span-2"><Label>{trn("detail.dialog_edit.field_license_no")}</Label><Input value={form.licenseNo} onChange={(e) => set("licenseNo")(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{trn("detail.dialog_edit.field_issue_date")}</Label><Input type="date" value={form.issueDate} onChange={(e) => set("issueDate")(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{trn("detail.dialog_edit.field_expiry_date")}{t.kind === "license" && " *"}</Label><Input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate")(e.target.value)} /></div>
          </>
        )}
        <div className="space-y-1.5 sm:col-span-2"><Label>{trn("detail.dialog_edit.field_notes")}</Label><Textarea rows={2} value={form.note} onChange={(e) => set("note")(e.target.value)} placeholder={trn("detail.dialog_transition.notes_placeholder")} /></div>
      </div>
    </PaymentDialog>
  );
}

function EditDialog({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  const { t: trn } = useTranslation("permits");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = detail.transaction;
  const [form, setForm] = useState({
    title: t.title ?? "", kind: t.kind, category: t.category, authorityName: t.authorityName ?? "", portalUrl: t.portalUrl ?? "",
    assigneeUserId: t.assigneeUserId ?? "", referenceNo: t.referenceNo ?? "", licenseNo: t.licenseNo ?? "", startDate: t.startDate ?? "", dueDate: t.dueDate ?? "",
    issueDate: t.issueDate ?? "", expiryDate: t.expiryDate ?? "", renewalLeadDays: t.renewalLeadDays != null ? String(t.renewalLeadDays) : "",
    feeAmount: String(Number(t.feeAmount) || ""), notes: t.notes ?? "",
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const feeLocked = t.feePaid || detail.orders.some((o) => LIVE_ORDER.includes(o.status));
  const save = useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/permits/transactions/${t.id}`, {
      ...form,
      authorityName: form.authorityName || null, portalUrl: form.portalUrl || null, assigneeUserId: form.assigneeUserId || null,
      referenceNo: form.referenceNo || null, licenseNo: form.licenseNo || null, startDate: form.startDate || null, dueDate: form.dueDate || null,
      issueDate: form.issueDate || null, expiryDate: form.expiryDate || null, renewalLeadDays: form.renewalLeadDays === "" ? null : Number(form.renewalLeadDays),
      feeAmount: Number(form.feeAmount || 0), notes: form.notes || null,
    }),
    onSuccess: () => { invalidatePermits(queryClient); toast({ title: trn("service_editor.saved_toast") }); onClose(); },
    onError: (e) => toast({ title: trn("detail.toasts.update_error"), description: errorMessage(e), variant: "destructive" }),
  });
  return (
    <PaymentDialog onClose={onClose} icon={Pencil} kind={t.transactionNo} title={trn("detail.dialog_edit.title")} footer={<Button disabled={save.isPending || !form.title.trim()} onClick={() => save.mutate()}><Save className="w-4 h-4 me-1" /> {trn("detail.dialog_edit.save")}</Button>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 sm:col-span-2"><Label>{trn("detail.dialog_edit.field_title")}</Label><Input value={form.title} onChange={(e) => set("title")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{trn("new_transaction.field_kind")}</Label>
          <Select value={form.kind} onValueChange={set("kind")}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="transaction">{trn("new_transaction.kind_transaction")}</SelectItem><SelectItem value="license">{trn("new_transaction.kind_license")}</SelectItem></SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label>{trn("service_editor.field_category")}</Label>
          <Select value={form.category} onValueChange={set("category")}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PERMIT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{enumText("permit_category", c)}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label>{trn("detail.dialog_edit.field_authority")}</Label><Input value={form.authorityName} onChange={(e) => set("authorityName")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{trn("service_editor.field_service_url")}</Label><Input dir="ltr" value={form.portalUrl} onChange={(e) => set("portalUrl")(e.target.value)} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>{trn("new_transaction.field_assignee")}</Label>
          <Select value={form.assigneeUserId || "none"} onValueChange={(v) => set("assigneeUserId")(v === "none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">{trn("service_editor.authority_none")}</SelectItem>{detail.assignees.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {enumText("step_party", u.party)}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label>{trn("detail.dialog_edit.field_reference_no")}</Label><Input value={form.referenceNo} onChange={(e) => set("referenceNo")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{trn("detail.dialog_edit.field_license_no")}</Label><Input value={form.licenseNo} onChange={(e) => set("licenseNo")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{trn("new_transaction.field_start_date")}</Label><Input type="date" value={form.startDate} onChange={(e) => set("startDate")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{trn("new_transaction.field_due_date")}</Label><Input type="date" value={form.dueDate} onChange={(e) => set("dueDate")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{trn("detail.dialog_edit.field_issue_date")}</Label><Input type="date" value={form.issueDate} onChange={(e) => set("issueDate")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{trn("detail.dialog_edit.field_expiry_date")}</Label><Input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{trn("service_editor.field_renewal_lead")}</Label><Input type="number" min="0" placeholder="30" value={form.renewalLeadDays} onChange={(e) => set("renewalLeadDays")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{trn("detail.dialog_edit.field_fee")}</Label><Input type="number" min="0" step="0.01" disabled={feeLocked} value={form.feeAmount} onChange={(e) => set("feeAmount")(e.target.value)} />{feeLocked && <p className="text-xs text-muted-foreground">{trn("detail.dialog_edit.fee_locked")}</p>}</div>
        <div className="space-y-1.5 sm:col-span-2"><Label>{trn("detail.dialog_edit.field_notes")}</Label><Textarea rows={2} value={form.notes} onChange={(e) => set("notes")(e.target.value)} /></div>
      </div>
    </PaymentDialog>
  );
}

// Accounting raises a draft payment order directly; anyone else on the developer's side sends a transfer request
// that goes to the project manager, then accounting — the ordinary المدفوعات route.
function RequestPaymentDialog({ detail, isAccounting, onClose }: { detail: Detail; isAccounting: boolean; onClose: () => void }) {
  const { t: trn } = useTranslation("permits");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = detail.transaction;
  const [payeeName, setPayee] = useState(t.authorityName ?? "");
  const [reason, setReason] = useState(trn("detail.dialog_payment.fee_reason", { no: t.transactionNo, title: t.title }));
  const go = useMutation({
    mutationFn: async () => apiRequest("POST", isAccounting ? "/api/payments/orders" : "/api/payments/orders/request", {
      projectId: t.projectId,
      permitTransactionId: t.id,
      payeeName,
      amount: Number(t.feeAmount),
      reason,
      sourceType: "project",
      sourceId: t.projectId,
    }),
    onSuccess: () => { invalidatePermits(queryClient); toast({ title: trn(isAccounting ? "detail.dialog_payment.success_order" : "detail.dialog_payment.success_request") }); onClose(); },
    onError: (e) => toast({ title: trn("detail.dialog_payment.error"), description: errorMessage(e), variant: "destructive" }),
  });
  return (
    <PaymentDialog
      onClose={onClose}
      size="md"
      icon={Banknote}
      kind={t.transactionNo}
      title={trn("detail.dialog_payment.title")}
      description={isAccounting ? trn("detail.dialog_payment.desc_accounting") : trn("detail.dialog_payment.desc_pm")}
      amount={money(t.feeAmount)}
      footer={<Button disabled={go.isPending || !payeeName.trim() || !reason.trim()} onClick={() => go.mutate()}><Save className="w-4 h-4 me-1" /> {trn("detail.dialog_payment.submit")}</Button>}
    >
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>{trn("detail.dialog_payment.payee")}</Label><Input value={payeeName} onChange={(e) => setPayee(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{trn("detail.dialog_payment.notes")}</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
    </PaymentDialog>
  );
}
