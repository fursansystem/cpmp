// One licence / transaction: its steps (assigned to people, mirrored in Activity), requirements and documents,
// the fee and the payment order that pays it, its dates and its history.
import { useRef, useState, type ReactNode } from "react";
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
import { PAYMENT_ORDER_LABELS } from "@shared/payments";
import {
  OPEN_PERMIT,
  PERMIT_ACTIONS,
  PERMIT_CATEGORIES,
  PERMIT_CATEGORY_LABELS,
  PERMIT_STATUS_LABELS,
  PERMIT_TRANSITIONS,
  REQUIREMENT_KIND_LABELS,
  REQUIREMENT_STATUS_LABELS,
  STEP_PARTY_LABELS,
  STEP_STATUS_LABELS,
  addMonths,
  type PermitAction,
  type PermitUserRef,
} from "@shared/permits";
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

const ACTION_LABELS: Record<string, string> = {
  created: "أُنشئت", edited: "عُدّلت", status_changed: "تغيّرت الحالة", assigned: "إسناد", step_completed: "أُنجزت خطوة", step_reopened: "أُعيد فتح خطوة",
  step_skipped: "تُجووزت خطوة", step_added: "أُضيفت خطوة", step_removed: "حُذفت خطوة", requirement_added: "أُضيف متطلب", requirement_removed: "حُذف متطلب",
  requirement_status: "تحديث متطلب", file_added: "أُرفق ملف", file_removed: "حُذف ملف", payment_requested: "طُلب سداد الرسوم", payment_reverted: "أُلغي طلب السداد",
  fee_paid: "سُدِّدت الرسوم", expired: "انتهت الصلاحية", renewed: "فُتح تجديد",
};
const LIVE_ORDER = ["requested", "request_approved", "draft", "pending_approval", "approved", "paid"];

export default function PermitDetail() {
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
    onError: fail("تعذّر التجديد"),
  });
  const remove = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/permits/transactions/${id}`),
    onSuccess: () => { done(); navigate("/permits"); },
    onError: fail("تعذّر الحذف"),
  });

  if (isLoading) return <div className="p-6 lg:p-8 space-y-4"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div>;
  if (error || !data) {
    return (
      <div className="p-6 lg:p-8" dir="rtl">
        <Card className="p-10 text-center space-y-3">
          <p className="text-muted-foreground">لا يمكن فتح هذه المعاملة: غير موجودة أو غير مُسندة إليك.</p>
          <Button variant="outline" asChild><Link href="/permits">الرخص والمعاملات</Link></Button>
        </Card>
      </div>
    );
  }

  const t = data.transaction;
  const { perms } = data;
  const open = (OPEN_PERMIT as readonly string[]).includes(t.status);
  const fee = Number(t.feeAmount);
  const liveOrder = data.orders.find((o) => LIVE_ORDER.includes(o.status));
  const project = ctx?.projects.find((p) => p.id === t.projectId);
  const canRequestPayment = fee > 0 && !t.feePaid && !liveOrder && open && (project?.canRequestPayment ?? false);
  const actions = PERMIT_ACTIONS.filter((a) => (PERMIT_TRANSITIONS[a].from as readonly string[]).includes(t.status));
  const missing = data.requirements.filter((r) => r.mandatory && r.status === "missing").length;
  const portal = t.portalUrl ?? t.serviceUrl;

  return (
    <div className="p-6 lg:p-8 space-y-6" dir="rtl" data-testid="page-permit-detail">
      <Link href={`/permits?project=${t.projectId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="w-4 h-4" /> الرخص والمعاملات
      </Link>

      <Card className="rounded-2xl">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-wrap items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0"><Landmark className="w-7 h-7" /></div>
            <div className="flex-1 min-w-[240px] space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black">{t.title}</h1>
                <PermitStatusBadge status={t.status} />
                <AttentionBadge kind={t.attention} />
              </div>
              <p className="text-sm text-muted-foreground">
                {t.transactionNo} · {t.kind === "license" ? "رخصة" : "معاملة"} · {PERMIT_CATEGORY_LABELS[t.category as keyof typeof PERMIT_CATEGORY_LABELS] ?? t.category} · {t.projectName}
                {t.serviceName && <> · من خدمة: {t.serviceName}</>}
              </p>
              <p className="text-sm">{t.authorityName ?? "—"}{portal && <a href={portal} target="_blank" rel="noreferrer" className="ms-2 inline-flex items-center gap-1 text-primary hover:underline">بوابة الجهة <ExternalLink className="w-3.5 h-3.5" /></a>}</p>
              {t.renewalOf && <p className="text-xs text-muted-foreground">تجديد للمعاملة <Link className="text-primary hover:underline" href={`/permits/${t.renewalOf.id}`}>{t.renewalOf.transactionNo}</Link></p>}
              {t.renewals?.length > 0 && <p className="text-xs text-muted-foreground">جُدّدت بـ {t.renewals.map((r: any) => <Link key={r.id} className="text-primary hover:underline me-1" href={`/permits/${r.id}`}>{r.transactionNo}</Link>)}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {perms.canTransition && actions.map((a) => (
                <Button key={a} size="sm" variant={a === "complete" || a === "submit" ? "default" : a === "cancel" || a === "reject" ? "ghost" : "outline"} className={cn((a === "cancel" || a === "reject") && "text-destructive")} onClick={() => setTransition(a)} data-testid={`button-action-${a}`}>
                  {PERMIT_TRANSITIONS[a].label}
                </Button>
              ))}
              {perms.canManage && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="w-4 h-4 me-1" /> تعديل</Button>}
              {perms.canManage && t.kind === "license" && ["completed", "expired"].includes(t.status) && !(t.renewals ?? []).some((r: any) => (OPEN_PERMIT as readonly string[]).includes(r.status)) && (
                <Button size="sm" variant="outline" disabled={renew.isPending} onClick={() => renew.mutate()}><RefreshCw className="w-4 h-4 me-1" /> تجديد</Button>
              )}
              {perms.canDelete && <Button size="sm" variant="ghost" className="text-destructive" disabled={remove.isPending} onClick={() => confirm("حذف المعاملة بخطواتها ومستنداتها؟") && remove.mutate()}><Trash2 className="w-4 h-4" /></Button>}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <Tile label="المسؤول">{t.assigneeName ?? "—"}</Tile>
            <Tile label="رقم الطلب لدى الجهة">{t.referenceNo ?? "—"}</Tile>
            <Tile label="رقم الرخصة">{t.licenseNo ?? "—"}</Tile>
            <Tile label="البدء">{fmtDate(t.startDate)}</Tile>
            <Tile label="المستهدف">{fmtDate(t.dueDate)}</Tile>
            <Tile label="الإصدار">{fmtDate(t.issueDate)}</Tile>
            <Tile label="الانتهاء">{fmtDate(t.expiryDate)}</Tile>
          </div>
          {t.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{t.notes}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-6">
          <StepsPanel data={data} />
          <RequirementsPanel data={data} />
        </div>
        <div className="space-y-6">
          <Panel title="الرسوم والسداد" icon={Banknote}>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black tabular-nums">{fee > 0 ? money(fee) : "لا رسوم"}</span>
              {fee > 0 && <Badge variant="secondary" className={cn("border-none", t.feePaid ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700")}>{t.feePaid ? `مسددة ${fmtDate(t.feePaidAt)}` : "غير مسددة"}</Badge>}
            </div>
            {data.orders.map((o) => (
              <Link key={o.id} href={`/payments?tab=orders&project=${t.projectId}&focus=${o.id}`} className="flex items-center justify-between rounded-lg border p-2 text-sm hover:bg-muted/50">
                <span className="font-semibold">{o.orderNo}</span>
                <span className="tabular-nums">{money(o.amount)}</span>
                <StatusBadge status={o.status} labels={PAYMENT_ORDER_LABELS} />
              </Link>
            ))}
            {canRequestPayment && <Button className="w-full" onClick={() => setPaying(true)} data-testid="button-request-payment"><Banknote className="w-4 h-4 me-1" /> طلب سداد الرسوم</Button>}
            {fee > 0 && !t.feePaid && !canRequestPayment && !liveOrder && open && <p className="text-xs text-muted-foreground">يطلب سداد الرسوم فريق المطوّر من هذه الصفحة.</p>}
            <p className="text-xs text-muted-foreground">يُسدَّد عبر أوامر الدفع في المدفوعات؛ وعند صرف الأمر تُسجَّل الرسوم مسددة وتكتمل خطوة السداد تلقائياً.</p>
          </Panel>
          <FilesPanel data={data} />
          <Panel title="سجل المعاملة" icon={History}>
            <ol className="space-y-3 max-h-[420px] overflow-y-auto">
              {data.activity.map((a) => (
                <li key={a.id} className="text-sm border-s-2 border-primary/30 ps-3">
                  <div className="font-semibold">{ACTION_LABELS[a.action] ?? a.action}{a.toStatus && ` → ${PERMIT_STATUS_LABELS[a.toStatus as keyof typeof PERMIT_STATUS_LABELS] ?? REQUIREMENT_STATUS_LABELS[a.toStatus as keyof typeof REQUIREMENT_STATUS_LABELS] ?? a.toStatus}`}</div>
                  {a.note && <div className="text-muted-foreground">{a.note}</div>}
                  <div className="text-xs text-muted-foreground">{a.userName ?? "النظام"} · {new Date(a.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>

      {transition && <TransitionDialog detail={data} action={transition} missing={missing} onClose={() => setTransition(null)} />}
      {editing && <EditDialog detail={data} onClose={() => setEditing(false)} />}
      {paying && <RequestPaymentDialog detail={data} isAccounting={ctx?.isAccounting ?? false} onClose={() => setPaying(false)} />}
    </div>
  );
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3 min-w-0">
      <div className="text-[11px] font-bold text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-1 truncate">{children}</div>
    </div>
  );
}

function Panel({ title, icon: Icon, action, children }: { title: string; icon: typeof Landmark; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          <h2 className="font-bold flex-1">{title}</h2>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ steps

function StepsPanel({ data }: { data: Detail }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { perms, transaction: t } = data;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", assigneeUserId: "", dueDate: "" });
  const onError = (e: unknown) => toast({ title: "تعذّر التحديث", description: errorMessage(e), variant: "destructive" });
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
    <Panel title="الخطوات" icon={ListChecks} action={perms.canManage && <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}><Plus className="w-4 h-4 me-1" /> خطوة</Button>}>
      <p className="text-xs text-muted-foreground">كل خطوة مُسندة تظهر أيضاً في Activity لمن أُسندت إليه، وإنجازها هناك يُنجزها هنا.</p>
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
                  <div className={cn("font-semibold", s.status === "skipped" && "line-through text-muted-foreground")}>{s.seq}. {s.title}{s.isPaymentStep && <Badge variant="secondary" className="ms-2 border-none bg-amber-500/10 text-amber-700">سداد</Badge>}</div>
                  <div className="text-xs text-muted-foreground">
                    {STEP_PARTY_LABELS[s.party as keyof typeof STEP_PARTY_LABELS] ?? s.party} · {STEP_STATUS_LABELS[s.status as keyof typeof STEP_STATUS_LABELS] ?? s.status}
                    {s.completedByName && ` · ${s.completedByName} ${fmtDate(s.completedAt)}`}
                    {s.note && ` · ${s.note}`}
                  </div>
                </div>
                {perms.canManage ? (
                  <>
                    <Select value={s.assigneeUserId ?? "none"} onValueChange={(v) => patch.mutate({ id: s.id, body: { assigneeUserId: v === "none" ? null : v } })}>
                      <SelectTrigger className="w-[190px] h-9"><SelectValue placeholder="إسناد" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— غير مُسندة —</SelectItem>
                        {data.assignees.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {STEP_PARTY_LABELS[u.party]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="date" className={cn("w-[150px] h-9", overdue && "border-destructive text-destructive")} value={s.dueDate ?? ""} onChange={(e) => patch.mutate({ id: s.id, body: { dueDate: e.target.value || null } })} />
                  </>
                ) : (
                  <div className="text-xs text-end">
                    <div>{s.assigneeName ?? "غير مُسندة"}</div>
                    <div className={cn(overdue && "text-destructive font-semibold")}>{fmtDate(s.dueDate)}</div>
                  </div>
                )}
                {canAct && (
                  <div className="flex gap-1">
                    {s.status !== "done" && !feeBlocked && <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: s.id, status: "done" })} data-testid="button-step-done"><CheckCircle2 className="w-4 h-4 me-1" /> تم</Button>}
                    {s.status === "pending" && <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: s.id, status: "in_progress" })}>بدء</Button>}
                    {(s.status === "done" || s.status === "skipped") && !(s.isPaymentStep && t.feePaid) && <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: s.id, status: "pending" })}><Undo2 className="w-4 h-4" /></Button>}
                    {perms.canManage && s.status !== "skipped" && s.status !== "done" && <Button size="sm" variant="ghost" title="تجاوز" onClick={() => setStatus.mutate({ id: s.id, status: "skipped" })}><SkipForward className="w-4 h-4" /></Button>}
                    {perms.canManage && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm("حذف الخطوة؟") && del.mutate(s.id)}><Trash2 className="w-4 h-4" /></Button>}
                  </div>
                )}
              </div>
              {feeBlocked && s.status !== "done" && <p className="text-xs text-amber-700 mt-2">تكتمل هذه الخطوة تلقائياً عند صرف أمر الدفع للرسوم.</p>}
            </li>
          );
        })}
        {data.steps.length === 0 && <p className="text-sm text-muted-foreground">لا توجد خطوات بعد.</p>}
      </ol>
      {adding && (
        <div className="grid sm:grid-cols-4 gap-2 rounded-xl border border-dashed p-3">
          <Input className="sm:col-span-2" placeholder="عنوان الخطوة" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          <Select value={draft.assigneeUserId || "none"} onValueChange={(v) => setDraft((d) => ({ ...d, assigneeUserId: v === "none" ? "" : v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— غير مُسندة —</SelectItem>
              {data.assignees.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={draft.dueDate} onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))} />
          <Button className="sm:col-span-4" disabled={!draft.title.trim() || add.isPending} onClick={() => add.mutate()}><Save className="w-4 h-4 me-1" /> إضافة الخطوة</Button>
        </div>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ requirements & documents

function RequirementsPanel({ data }: { data: Detail }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { perms, transaction: t } = data;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ kind: "document", title: "", mandatory: true });
  const onError = (e: unknown) => toast({ title: "تعذّر التحديث", description: errorMessage(e), variant: "destructive" });
  const ok = () => invalidatePermits(queryClient);

  const patch = useMutation({ mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => apiRequest("PATCH", `/api/permits/requirements/${id}`, body), onSuccess: ok, onError });
  const del = useMutation({ mutationFn: async (id: string) => apiRequest("DELETE", `/api/permits/requirements/${id}`), onSuccess: ok, onError });
  const add = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/permits/transactions/${t.id}/requirements`, draft),
    onSuccess: () => { ok(); setDraft({ kind: "document", title: "", mandatory: true }); setAdding(false); }, onError,
  });

  const groups = [
    { kind: "document", title: "المستندات المطلوبة" },
    { kind: "condition", title: "المتطلبات والشروط" },
  ];

  return (
    <Panel title="المتطلبات والمستندات" icon={FileText} action={perms.canManage && <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}><Plus className="w-4 h-4 me-1" /> متطلب</Button>}>
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
                    <span className={cn("flex-1 font-medium", r.status === "not_applicable" && "line-through text-muted-foreground")}>{r.title}{!r.mandatory && <span className="text-xs text-muted-foreground"> (اختياري)</span>}</span>
                    <StatusBadge status={r.status} labels={REQUIREMENT_STATUS_LABELS} />
                    {perms.canWork && r.kind === "document" && <UploadButton detail={data} requirementId={r.id} />}
                    {perms.canWork && r.kind !== "document" && r.status !== "provided" && <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: r.id, body: { status: "provided" } })}>مستوفى</Button>}
                    {perms.canWork && r.status === "provided" && files.length === 0 && <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: r.id, body: { status: "missing" } })}><Undo2 className="w-4 h-4" /></Button>}
                    {perms.canManage && r.status === "missing" && <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: r.id, body: { status: "not_applicable" } })}>لا ينطبق</Button>}
                    {perms.canManage && r.status === "not_applicable" && <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: r.id, body: { status: "missing" } })}><Undo2 className="w-4 h-4" /></Button>}
                    {perms.canManage && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm("حذف المتطلب؟") && del.mutate(r.id)}><Trash2 className="w-4 h-4" /></Button>}
                  </div>
                  {files.length > 0 && <FileList detail={data} files={files} />}
                </div>
              );
            })}
          </div>
        );
      })}
      {data.requirements.length === 0 && <p className="text-sm text-muted-foreground">لا توجد متطلبات.</p>}
      {adding && (
        <div className="grid sm:grid-cols-6 gap-2 rounded-xl border border-dashed p-3">
          <Select value={draft.kind} onValueChange={(v) => setDraft((d) => ({ ...d, kind: v }))}>
            <SelectTrigger className="sm:col-span-2"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(REQUIREMENT_KIND_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Input className="sm:col-span-3" placeholder="المتطلب أو المستند" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          <label className="flex items-center gap-1.5 text-xs"><Switch checked={draft.mandatory} onCheckedChange={(v) => setDraft((d) => ({ ...d, mandatory: v }))} /> إلزامي</label>
          <Button className="sm:col-span-6" disabled={!draft.title.trim() || add.isPending} onClick={() => add.mutate()}><Save className="w-4 h-4 me-1" /> إضافة</Button>
        </div>
      )}
    </Panel>
  );
}

function UploadButton({ detail, requirementId, label = "رفع" }: { detail: Detail; requirementId?: string; label?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const t = detail.transaction;
  const onPick = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        if (file.size > 25 * 1024 * 1024) { toast({ title: `${file.name} أكبر من 25MB`, variant: "destructive" }); continue; }
        const objectPath = await uploadToPermits(file, t.projectId);
        await apiRequest("POST", "/api/permits/attachments", { transactionId: t.id, requirementId: requirementId ?? null, fileName: file.name, objectPath, contentType: file.type || null, size: file.size });
      }
      invalidatePermits(queryClient);
    } catch (e) {
      toast({ title: "تعذّر رفع الملف", description: errorMessage(e), variant: "destructive" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <>
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => onPick(e.target.files)} />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload className="w-4 h-4 me-1" /> {busy ? "جارٍ الرفع…" : label}</Button>
    </>
  );
}

function FileList({ detail, files }: { detail: Detail; files: any[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const del = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/permits/attachments/${id}`),
    onSuccess: () => invalidatePermits(queryClient),
    onError: (e) => toast({ title: "تعذّر حذف الملف", description: errorMessage(e), variant: "destructive" }),
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
  const general = data.files.filter((f) => !f.requirementId);
  return (
    <Panel title="مرفقات أخرى" icon={Paperclip} action={data.perms.canWork && <UploadButton detail={data} label="إرفاق" />}>
      {general.length === 0 ? <p className="text-sm text-muted-foreground">صورة الرخصة، إيصالات، مراسلات الجهة…</p> : <FileList detail={data} files={general} />}
    </Panel>
  );
}

// ------------------------------------------------------------------ dialogs

function TransitionDialog({ detail, action, missing, onClose }: { detail: Detail; action: PermitAction; missing: number; onClose: () => void }) {
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
    onSuccess: () => { invalidatePermits(queryClient); toast({ title: rule.label }); onClose(); },
    onError: (e) => toast({ title: "تعذّر التحديث", description: errorMessage(e), variant: "destructive" }),
  });
  const needsExpiry = action === "complete" && t.kind === "license" && !form.expiryDate;
  return (
    <PaymentDialog
      onClose={onClose}
      size="md"
      icon={Landmark}
      kind={t.transactionNo}
      title={rule.label}
      description={`${PERMIT_STATUS_LABELS[t.status as keyof typeof PERMIT_STATUS_LABELS]} ← ${PERMIT_STATUS_LABELS[rule.to]}`}
      footer={<Button disabled={go.isPending || needsExpiry} onClick={() => go.mutate()}><Save className="w-4 h-4 me-1" /> تأكيد</Button>}
    >
      {missing > 0 && (action === "submit" || action === "complete") && (
        <p className="rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 p-3 text-sm">تنبيه: {missing} من المتطلبات الإلزامية غير مستوفاة بعد.</p>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {(action === "submit" || action === "complete") && <div className="space-y-1.5 sm:col-span-2"><Label>رقم الطلب لدى الجهة</Label><Input value={form.referenceNo} onChange={(e) => set("referenceNo")(e.target.value)} /></div>}
        {action === "complete" && (
          <>
            <div className="space-y-1.5 sm:col-span-2"><Label>رقم الرخصة / الشهادة</Label><Input value={form.licenseNo} onChange={(e) => set("licenseNo")(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>تاريخ الإصدار</Label><Input type="date" value={form.issueDate} onChange={(e) => set("issueDate")(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>تاريخ الانتهاء{t.kind === "license" && " *"}</Label><Input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate")(e.target.value)} /></div>
          </>
        )}
        <div className="space-y-1.5 sm:col-span-2"><Label>ملاحظة</Label><Textarea rows={2} value={form.note} onChange={(e) => set("note")(e.target.value)} /></div>
      </div>
    </PaymentDialog>
  );
}

function EditDialog({ detail, onClose }: { detail: Detail; onClose: () => void }) {
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
    onSuccess: () => { invalidatePermits(queryClient); toast({ title: "تم الحفظ" }); onClose(); },
    onError: (e) => toast({ title: "تعذّر الحفظ", description: errorMessage(e), variant: "destructive" }),
  });
  return (
    <PaymentDialog onClose={onClose} icon={Pencil} kind={t.transactionNo} title="تعديل المعاملة" footer={<Button disabled={save.isPending || !form.title.trim()} onClick={() => save.mutate()}><Save className="w-4 h-4 me-1" /> حفظ</Button>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 sm:col-span-2"><Label>العنوان</Label><Input value={form.title} onChange={(e) => set("title")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>النوع</Label>
          <Select value={form.kind} onValueChange={set("kind")}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="transaction">معاملة</SelectItem><SelectItem value="license">رخصة (لها تاريخ انتهاء)</SelectItem></SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label>التصنيف</Label>
          <Select value={form.category} onValueChange={set("category")}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PERMIT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{PERMIT_CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label>الجهة</Label><Input value={form.authorityName} onChange={(e) => set("authorityName")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>رابط الخدمة / البوابة</Label><Input dir="ltr" value={form.portalUrl} onChange={(e) => set("portalUrl")(e.target.value)} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>المسؤول عن المتابعة</Label>
          <Select value={form.assigneeUserId || "none"} onValueChange={(v) => set("assigneeUserId")(v === "none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">— بدون —</SelectItem>{detail.assignees.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {STEP_PARTY_LABELS[u.party]}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label>رقم الطلب لدى الجهة</Label><Input value={form.referenceNo} onChange={(e) => set("referenceNo")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>رقم الرخصة</Label><Input value={form.licenseNo} onChange={(e) => set("licenseNo")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>تاريخ البدء</Label><Input type="date" value={form.startDate} onChange={(e) => set("startDate")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>المستهدف إنجازها قبل</Label><Input type="date" value={form.dueDate} onChange={(e) => set("dueDate")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>تاريخ الإصدار</Label><Input type="date" value={form.issueDate} onChange={(e) => set("issueDate")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>تاريخ الانتهاء</Label><Input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>التنبيه قبل الانتهاء (يوم)</Label><Input type="number" min="0" placeholder="30" value={form.renewalLeadDays} onChange={(e) => set("renewalLeadDays")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>الرسوم</Label><Input type="number" min="0" step="0.01" disabled={feeLocked} value={form.feeAmount} onChange={(e) => set("feeAmount")(e.target.value)} />{feeLocked && <p className="text-xs text-muted-foreground">للرسوم أمر دفع قائم أو مسددة.</p>}</div>
        <div className="space-y-1.5 sm:col-span-2"><Label>ملاحظات</Label><Textarea rows={2} value={form.notes} onChange={(e) => set("notes")(e.target.value)} /></div>
      </div>
    </PaymentDialog>
  );
}

// Accounting raises a draft payment order directly; anyone else on the developer's side sends a transfer request
// that goes to the project manager, then accounting — the ordinary المدفوعات route.
function RequestPaymentDialog({ detail, isAccounting, onClose }: { detail: Detail; isAccounting: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = detail.transaction;
  const [payeeName, setPayee] = useState(t.authorityName ?? "");
  const [reason, setReason] = useState(`رسوم: ${t.transactionNo} · ${t.title}`);
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
    onSuccess: () => { invalidatePermits(queryClient); toast({ title: isAccounting ? "أُنشئ أمر الدفع (مسودة)" : "أُرسل طلب السداد إلى مدير المشروع" }); onClose(); },
    onError: (e) => toast({ title: "تعذّر الطلب", description: errorMessage(e), variant: "destructive" }),
  });
  return (
    <PaymentDialog
      onClose={onClose}
      size="md"
      icon={Banknote}
      kind={t.transactionNo}
      title="طلب سداد الرسوم"
      description={isAccounting ? "أمر دفع (مسودة) في المدفوعات" : "طلب تحويل: مدير المشروع ثم المحاسبة"}
      amount={money(t.feeAmount)}
      footer={<Button disabled={go.isPending || !payeeName.trim() || !reason.trim()} onClick={() => go.mutate()}><Save className="w-4 h-4 me-1" /> إرسال</Button>}
    >
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>المستفيد</Label><Input value={payeeName} onChange={(e) => setPayee(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>البيان</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
    </PaymentDialog>
  );
}
