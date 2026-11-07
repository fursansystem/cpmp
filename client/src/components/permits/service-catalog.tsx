// دليل الخدمات: the service catalogue, laid out like the national portal's service directory — search, categories,
// an authority filter and service cards — plus the forms that start a transaction and edit a service.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowDown, ArrowUp, BadgeCheck, Building2, Clock, Copy, ExternalLink, FileText, Landmark, ListChecks, Pencil, Plus, Rocket, Save, Search, Trash2, Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { PaymentDialog, Section } from "@/components/payments/payments-common";
import {
  PERMIT_CATEGORIES,
  PERMIT_CATEGORY_LABELS,
  REQUIREMENT_KIND_LABELS,
  STEP_PARTIES,
  STEP_PARTY_LABELS,
  type PermitsContext,
  type PermitUserRef,
} from "@shared/permits";
import { errorMessage, getJson, invalidatePermits, money, permitsQuery } from "./permits-common";

export interface CatalogStep { title: string; description: string | null; party: string; slaDays: number | null; isPaymentStep: boolean }
export interface CatalogRequirement { kind: string; title: string; description: string | null; mandatory: boolean }
export interface CatalogService {
  id: string;
  name: string;
  category: string;
  description: string | null;
  serviceUrl: string | null;
  channels: string | null;
  isLicense: boolean;
  validityMonths: number | null;
  renewalLeadDays: number;
  feeAmount: string;
  feeNote: string | null;
  slaDays: number | null;
  active: boolean;
  authorityId: string | null;
  authorityName: string | null;
  authorityPortalUrl: string | null;
  isSystem: boolean;
  canEdit: boolean;
  steps: CatalogStep[];
  requirements: CatalogRequirement[];
}
export interface CatalogAuthority { id: string; name: string; portalUrl: string | null; organizationId: string | null }

export function useCatalog() {
  return useQuery<{ services: CatalogService[]; authorities: CatalogAuthority[] }>({
    queryKey: ["permits", "services"],
    queryFn: () => getJson("/api/permits/services"),
    meta: permitsQuery,
  });
}

export const feeText = (s: CatalogService) => (Number(s.feeAmount) > 0 ? money(s.feeAmount) : s.feeNote ?? "تُحدَّد من الجهة");

// ------------------------------------------------------------------ catalogue tab

export function ServiceCatalogTab({ ctx, projectId }: { ctx: PermitsContext; projectId: string }) {
  const { data, isLoading } = useCatalog();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [authority, setAuthority] = useState("all");
  const [open, setOpen] = useState<CatalogService | null>(null);
  const [starting, setStarting] = useState<string | null | undefined>(undefined); // serviceId, null = free transaction
  const [editing, setEditing] = useState<CatalogService | "new" | null>(null);

  const services = data?.services ?? [];
  const canStart = ctx.projects.some((p) => p.isDeveloper);
  const canAdd = ctx.canManageOrgCatalog || ctx.canManageSystemCatalog;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) =>
      (s.active || s.canEdit) &&
      (category === "all" || s.category === category) &&
      (authority === "all" || s.authorityId === authority) &&
      (!q || [s.name, s.description, s.authorityName].some((v) => String(v ?? "").toLowerCase().includes(q))));
  }, [services, search, category, authority]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of services) m.set(s.category, (m.get(s.category) ?? 0) + 1);
    return m;
  }, [services]);

  const usedAuthorities = (data?.authorities ?? []).filter((a) => services.some((s) => s.authorityId === a.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute start-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input className="ps-9" placeholder="ابحث عن خدمة أو جهة…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-catalog-search" />
        </div>
        <Select value={authority} onValueChange={setAuthority}>
          <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الجهات</SelectItem>
            {usedAuthorities.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ms-auto flex gap-2">
          {canStart && <Button variant="outline" onClick={() => setStarting(null)}><Plus className="w-4 h-4 me-1" /> معاملة حرة</Button>}
          {canAdd && <Button onClick={() => setEditing("new")} data-testid="button-new-service"><Plus className="w-4 h-4 me-1" /> خدمة جديدة</Button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <CategoryChip active={category === "all"} onClick={() => setCategory("all")} label="الكل" count={services.length} />
        {PERMIT_CATEGORIES.filter((c) => counts.get(c)).map((c) => (
          <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)} label={PERMIT_CATEGORY_LABELS[c]} count={counts.get(c) ?? 0} />
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
      {!isLoading && filtered.length === 0 && <Card className="p-10 text-center text-muted-foreground">لا توجد خدمات مطابقة</Card>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((s) => (
          <Card key={s.id} className={cn("rounded-2xl p-5 flex flex-col gap-3 hover:shadow-lg transition-shadow cursor-pointer", !s.active && "opacity-60")} onClick={() => setOpen(s)} data-testid="card-service">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Landmark className="w-5 h-5" /></div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold leading-snug">{s.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{s.authorityName ?? "—"}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="border-none">{PERMIT_CATEGORY_LABELS[s.category as keyof typeof PERMIT_CATEGORY_LABELS] ?? s.category}</Badge>
              {s.isLicense && <Badge variant="secondary" className="border-none bg-teal-500/10 text-teal-700 dark:text-teal-400">رخصة بتاريخ انتهاء</Badge>}
              {!s.isSystem && <Badge variant="secondary" className="border-none bg-violet-500/10 text-violet-700 dark:text-violet-400">خدمة خاصة</Badge>}
              {!s.active && <Badge variant="secondary" className="border-none">موقوفة</Badge>}
            </div>
            {s.description && <p className="text-sm text-muted-foreground line-clamp-2">{s.description}</p>}
            <div className="mt-auto grid grid-cols-3 gap-2 text-xs text-muted-foreground border-t pt-3">
              <span className="flex items-center gap-1"><ListChecks className="w-3.5 h-3.5" /> {s.steps.length} خطوات</span>
              <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {s.requirements.length} متطلبات</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {s.slaDays ? `${s.slaDays} يوم` : "—"}</span>
            </div>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        الخدمات النظامية مرجع عام لخطوات ومستندات الإجراءات الشائعة، وتختلف التفاصيل والرسوم والمدد حسب المدينة ونوع المشروع. تحقّق منها لدى الجهة عبر رابط بوابتها، ويمكنك نسخ أي خدمة إلى خدماتك وتعديلها.
      </p>

      {open && (
        <ServiceDetailDialog
          ctx={ctx}
          service={services.find((s) => s.id === open.id) ?? open}
          onClose={() => setOpen(null)}
          onStart={() => { setStarting(open.id); setOpen(null); }}
          onEdit={() => { setEditing(open); setOpen(null); }}
        />
      )}
      {starting !== undefined && (
        <NewTransactionDialog ctx={ctx} services={services} defaultProjectId={projectId} serviceId={starting} onClose={() => setStarting(undefined)} />
      )}
      {editing && (
        <ServiceEditorDialog ctx={ctx} service={editing === "new" ? null : editing} authorities={data?.authorities ?? []} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function CategoryChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-full border px-3 py-1 text-sm transition-colors", active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted")}
    >
      {label} <span className={cn("ms-1 text-xs", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
    </button>
  );
}

// ------------------------------------------------------------------ one service

export function ServiceDetailDialog({ ctx, service: s, onClose, onStart, onEdit }: { ctx: PermitsContext; service: CatalogService; onClose: () => void; onStart: () => void; onEdit: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const duplicate = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/permits/services/${s.id}/duplicate`),
    onSuccess: () => { invalidatePermits(queryClient); toast({ title: "نُسخت الخدمة إلى خدماتك" }); onClose(); },
    onError: (e) => toast({ title: "تعذّر النسخ", description: errorMessage(e), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/permits/services/${s.id}`),
    onSuccess: () => { invalidatePermits(queryClient); onClose(); },
    onError: (e) => toast({ title: "تعذّر الحذف", description: errorMessage(e), variant: "destructive" }),
  });
  const documents = s.requirements.filter((r) => r.kind === "document");
  const conditions = s.requirements.filter((r) => r.kind !== "document");
  const portal = s.serviceUrl ?? s.authorityPortalUrl;

  return (
    <PaymentDialog
      onClose={onClose}
      icon={Landmark}
      kind="خدمة"
      title={s.name}
      description={s.authorityName ?? undefined}
      footer={
        <>
          {ctx.projects.some((p) => p.isDeveloper) && s.active && <Button onClick={onStart} data-testid="button-start-transaction"><Rocket className="w-4 h-4 me-1" /> بدء معاملة لمشروع</Button>}
          {portal && <Button variant="outline" asChild><a href={portal} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 me-1" /> بوابة الجهة</a></Button>}
          {s.canEdit && <Button variant="outline" onClick={onEdit}><Pencil className="w-4 h-4 me-1" /> تعديل</Button>}
          {s.isSystem && ctx.canManageOrgCatalog && <Button variant="ghost" disabled={duplicate.isPending} onClick={() => duplicate.mutate()}><Copy className="w-4 h-4 me-1" /> نسخ إلى خدماتي</Button>}
          {s.canEdit && <Button variant="ghost" className="text-destructive" disabled={remove.isPending} onClick={() => confirm("حذف هذه الخدمة من الدليل؟ تبقى المعاملات التي بُدئت منها.") && remove.mutate()}><Trash2 className="w-4 h-4 me-1" /> حذف</Button>}
        </>
      }
    >
      {s.description && <p className="text-sm leading-7">{s.description}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InfoTile icon={Building2} label="الجهة" value={s.authorityName ?? "—"} />
        <InfoTile icon={Wallet} label="رسوم الخدمة" value={feeText(s)} />
        <InfoTile icon={Clock} label="مدة التنفيذ" value={s.slaDays ? `${s.slaDays} يوم` : "حسب الجهة"} />
        <InfoTile icon={BadgeCheck} label="الصلاحية" value={s.isLicense ? (s.validityMonths ? `${s.validityMonths} شهر` : "حسب الرخصة") : "لا تنتهي"} />
      </div>
      {s.channels && <p className="text-sm"><span className="font-semibold">قنوات التقديم: </span>{s.channels}</p>}

      <Section title="خطوات الحصول على الخدمة" icon={ListChecks}>
        <ol className="space-y-2">
          {s.steps.map((st, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <div className="flex-1 text-sm">
                <span className="font-medium">{st.title}</span>
                <span className="text-xs text-muted-foreground"> · {STEP_PARTY_LABELS[st.party as keyof typeof STEP_PARTY_LABELS] ?? st.party}{st.slaDays ? ` · ${st.slaDays} يوم` : ""}{st.isPaymentStep ? " · سداد عبر المدفوعات" : ""}</span>
              </div>
            </li>
          ))}
          {s.steps.length === 0 && <p className="text-sm text-muted-foreground">لم تُحدَّد خطوات.</p>}
        </ol>
      </Section>
      {conditions.length > 0 && (
        <Section title="متطلبات الخدمة" icon={BadgeCheck}>
          <ul className="list-disc ps-5 space-y-1 text-sm">{conditions.map((r, i) => <li key={i}>{r.title}{!r.mandatory && <span className="text-muted-foreground"> (اختياري)</span>}</li>)}</ul>
        </Section>
      )}
      <Section title="المستندات المطلوبة" icon={FileText}>
        <ul className="list-disc ps-5 space-y-1 text-sm">{documents.map((r, i) => <li key={i}>{r.title}{!r.mandatory && <span className="text-muted-foreground"> (اختياري)</span>}</li>)}</ul>
        {documents.length === 0 && <p className="text-sm text-muted-foreground">لا توجد مستندات محددة.</p>}
      </Section>
    </PaymentDialog>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground"><Icon className="w-3.5 h-3.5" /> {label}</div>
      <div className="text-sm font-semibold mt-1">{value}</div>
    </div>
  );
}

// ------------------------------------------------------------------ start a transaction

export function NewTransactionDialog({ ctx, services, defaultProjectId, serviceId, onClose }: {
  ctx: PermitsContext; services: CatalogService[]; defaultProjectId: string; serviceId: string | null; onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const devProjects = ctx.projects.filter((p) => p.isDeveloper);
  const [projectId, setProjectId] = useState(devProjects.some((p) => p.id === defaultProjectId) ? defaultProjectId : devProjects.length === 1 ? devProjects[0].id : "");
  const [svcId, setSvcId] = useState<string>(serviceId ?? "none");
  const service = services.find((s) => s.id === svcId) ?? null;
  const [form, setForm] = useState({
    title: service?.name ?? "",
    authorityName: "",
    kind: service?.isLicense ? "license" : "transaction",
    assigneeUserId: "",
    startDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    feeAmount: service && Number(service.feeAmount) > 0 ? String(Number(service.feeAmount)) : "",
    referenceNo: "",
    notes: "",
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: assignees = [] } = useQuery<PermitUserRef[]>({
    queryKey: ["permits", "assignees", projectId],
    queryFn: () => getJson(`/api/permits/projects/${projectId}/assignees`),
    enabled: !!projectId,
    meta: permitsQuery,
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/permits/transactions", {
        projectId,
        serviceId: service?.id ?? null,
        title: form.title || null,
        kind: form.kind,
        authorityName: service ? null : form.authorityName || null,
        assigneeUserId: form.assigneeUserId || null,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        feeAmount: form.feeAmount === "" ? undefined : Number(form.feeAmount),
        referenceNo: form.referenceNo || null,
        notes: form.notes || null,
      });
      return res.json();
    },
    onSuccess: (row: { id: string }) => {
      invalidatePermits(queryClient);
      toast({ title: "أُنشئت المعاملة" });
      onClose();
      navigate(`/permits/${row.id}`);
    },
    onError: (e) => toast({ title: "تعذّر الإنشاء", description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <PaymentDialog
      onClose={onClose}
      size="md"
      icon={Rocket}
      kind="معاملة جديدة"
      title={service?.name ?? "معاملة حرة"}
      description={service?.authorityName ?? "خارج دليل الخدمات"}
      footer={<Button disabled={create.isPending || !projectId || (!service && !form.title.trim())} onClick={() => create.mutate()} data-testid="button-create-transaction"><Save className="w-4 h-4 me-1" /> إنشاء</Button>}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>المشروع (أنت المطوّر فيه)</Label>
          <Select value={projectId} onValueChange={(v) => { setProjectId(v); set("assigneeUserId")(""); }}>
            <SelectTrigger><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
            <SelectContent>{devProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>الخدمة</Label>
          <Select value={svcId} onValueChange={(v) => {
            setSvcId(v);
            const s = services.find((x) => x.id === v);
            setForm((f) => ({ ...f, title: s?.name ?? f.title, kind: s ? (s.isLicense ? "license" : "transaction") : f.kind, feeAmount: s && Number(s.feeAmount) > 0 ? String(Number(s.feeAmount)) : "" }));
          }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">معاملة حرة (بدون خدمة من الدليل)</SelectItem>
              {services.filter((s) => s.active).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} — {s.authorityName ?? ""}</SelectItem>)}
            </SelectContent>
          </Select>
          {service && <p className="text-xs text-muted-foreground">تُنسخ {service.steps.length} خطوات و{service.requirements.length} متطلبات من الخدمة، ويمكن تعديلها بعد الإنشاء.</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2"><Label>العنوان</Label><Input value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="مثال: رخصة بناء البرج A" /></div>
        {!service && (
          <>
            <div className="space-y-1.5"><Label>الجهة</Label><Input value={form.authorityName} onChange={(e) => set("authorityName")(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>النوع</Label>
              <Select value={form.kind} onValueChange={set("kind")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="transaction">معاملة</SelectItem><SelectItem value="license">رخصة (لها تاريخ انتهاء)</SelectItem></SelectContent>
              </Select>
            </div>
          </>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label>المسؤول عن المتابعة</Label>
          <Select value={form.assigneeUserId || "none"} onValueChange={(v) => set("assigneeUserId")(v === "none" ? "" : v)} disabled={!projectId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— بدون —</SelectItem>
              {assignees.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {STEP_PARTY_LABELS[u.party]}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">تُسند إليه خطوات المطوّر تلقائياً، وتُسند خطوات المقاول والاستشاري من صفحة المعاملة.</p>
        </div>
        <div className="space-y-1.5"><Label>تاريخ البدء</Label><Input type="date" value={form.startDate} onChange={(e) => set("startDate")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>المستهدف إنجازها قبل</Label><Input type="date" value={form.dueDate} onChange={(e) => set("dueDate")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>الرسوم المتوقعة</Label><Input type="number" min="0" step="0.01" value={form.feeAmount} onChange={(e) => set("feeAmount")(e.target.value)} placeholder={service?.feeNote ?? "0"} /></div>
        <div className="space-y-1.5"><Label>رقم الطلب لدى الجهة</Label><Input value={form.referenceNo} onChange={(e) => set("referenceNo")(e.target.value)} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>ملاحظات</Label><Textarea rows={2} value={form.notes} onChange={(e) => set("notes")(e.target.value)} /></div>
      </div>
    </PaymentDialog>
  );
}

// ------------------------------------------------------------------ edit a service

export function ServiceEditorDialog({ ctx, service, authorities, onClose }: { ctx: PermitsContext; service: CatalogService | null; authorities: CatalogAuthority[]; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<"system" | "org">(service ? (service.isSystem ? "system" : "org") : ctx.canManageOrgCatalog ? "org" : "system");
  const [form, setForm] = useState({
    name: service?.name ?? "",
    authorityId: service?.authorityId ?? "",
    authorityName: "",
    authorityPortalUrl: "",
    category: service?.category ?? "municipal",
    description: service?.description ?? "",
    serviceUrl: service?.serviceUrl ?? "",
    channels: service?.channels ?? "",
    isLicense: service?.isLicense ?? false,
    validityMonths: service?.validityMonths != null ? String(service.validityMonths) : "",
    renewalLeadDays: String(service?.renewalLeadDays ?? 30),
    feeAmount: service && Number(service.feeAmount) > 0 ? String(Number(service.feeAmount)) : "",
    feeNote: service?.feeNote ?? "",
    slaDays: service?.slaDays != null ? String(service.slaDays) : "",
    active: service?.active ?? true,
  });
  const [steps, setSteps] = useState<CatalogStep[]>(service?.steps.map((s) => ({ ...s })) ?? [{ title: "", description: null, party: "developer", slaDays: null, isPaymentStep: false }]);
  const [reqs, setReqs] = useState<CatalogRequirement[]>(service?.requirements.map((r) => ({ ...r })) ?? []);
  const set = <K extends keyof typeof form>(k: K) => (v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: string) => (v === "" ? null : Number(v));

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        scope,
        name: form.name,
        authorityId: form.authorityId && form.authorityId !== "new" ? form.authorityId : null,
        authorityName: form.authorityId === "new" ? form.authorityName : null,
        authorityPortalUrl: form.authorityId === "new" ? form.authorityPortalUrl : null,
        category: form.category,
        description: form.description,
        serviceUrl: form.serviceUrl,
        channels: form.channels,
        isLicense: form.isLicense,
        validityMonths: num(form.validityMonths),
        renewalLeadDays: Number(form.renewalLeadDays || 30),
        feeAmount: Number(form.feeAmount || 0),
        feeNote: form.feeNote,
        slaDays: num(form.slaDays),
        active: form.active,
        steps: steps.filter((s) => s.title.trim()),
        requirements: reqs.filter((r) => r.title.trim()),
      };
      return service ? apiRequest("PATCH", `/api/permits/services/${service.id}`, body) : apiRequest("POST", "/api/permits/services", body);
    },
    onSuccess: () => { invalidatePermits(queryClient); toast({ title: "حُفظت الخدمة" }); onClose(); },
    onError: (e) => toast({ title: "تعذّر الحفظ", description: errorMessage(e), variant: "destructive" }),
  });

  const move = <T,>(list: T[], i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return list;
    const copy = [...list];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  };

  return (
    <PaymentDialog
      onClose={onClose}
      size="lg"
      icon={Landmark}
      kind={service ? "تعديل خدمة" : "خدمة جديدة"}
      title={form.name || "خدمة جديدة"}
      footer={<Button disabled={save.isPending || !form.name.trim() || (form.authorityId === "new" && !form.authorityName.trim())} onClick={() => save.mutate()}><Save className="w-4 h-4 me-1" /> حفظ</Button>}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        {!service && ctx.canManageSystemCatalog && ctx.canManageOrgCatalog && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>تُضاف إلى</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "system" | "org")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="org">خدمات منظمتي</SelectItem><SelectItem value="system">الدليل النظامي (لكل المطوّرين)</SelectItem></SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5 sm:col-span-2"><Label>اسم الخدمة</Label><Input value={form.name} onChange={(e) => set("name")(e.target.value)} /></div>
        <div className="space-y-1.5">
          <Label>الجهة</Label>
          <Select value={form.authorityId || "none"} onValueChange={(v) => set("authorityId")(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— بدون —</SelectItem>
              {authorities.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              <SelectItem value="new">+ جهة جديدة…</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>التصنيف</Label>
          <Select value={form.category} onValueChange={set("category")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PERMIT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{PERMIT_CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {form.authorityId === "new" && (
          <>
            <div className="space-y-1.5"><Label>اسم الجهة الجديدة</Label><Input value={form.authorityName} onChange={(e) => set("authorityName")(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>رابط بوابة الجهة</Label><Input dir="ltr" value={form.authorityPortalUrl} onChange={(e) => set("authorityPortalUrl")(e.target.value)} placeholder="https://" /></div>
          </>
        )}
        <div className="space-y-1.5 sm:col-span-2"><Label>وصف الخدمة</Label><Textarea rows={3} value={form.description} onChange={(e) => set("description")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>رابط الخدمة</Label><Input dir="ltr" value={form.serviceUrl} onChange={(e) => set("serviceUrl")(e.target.value)} placeholder="https://" /></div>
        <div className="space-y-1.5"><Label>قنوات التقديم</Label><Input value={form.channels} onChange={(e) => set("channels")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>الرسوم المعتادة</Label><Input type="number" min="0" step="0.01" value={form.feeAmount} onChange={(e) => set("feeAmount")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>ملاحظة الرسوم</Label><Input value={form.feeNote} onChange={(e) => set("feeNote")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>مدة التنفيذ المتوقعة (يوم)</Label><Input type="number" min="0" value={form.slaDays} onChange={(e) => set("slaDays")(e.target.value)} /></div>
        <div className="flex items-center gap-3 pt-6"><Switch checked={form.active} onCheckedChange={set("active")} /><Label>الخدمة متاحة</Label></div>
        <div className="flex items-center gap-3"><Switch checked={form.isLicense} onCheckedChange={set("isLicense")} /><Label>تُنتج رخصة لها تاريخ انتهاء</Label></div>
        {form.isLicense && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>الصلاحية (شهر)</Label><Input type="number" min="0" value={form.validityMonths} onChange={(e) => set("validityMonths")(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>التنبيه قبل الانتهاء (يوم)</Label><Input type="number" min="0" value={form.renewalLeadDays} onChange={(e) => set("renewalLeadDays")(e.target.value)} /></div>
          </div>
        )}
      </div>

      <Section title="الخطوات" icon={ListChecks}>
        <div className="space-y-2">
          {steps.map((st, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center rounded-lg border p-2">
              <span className="col-span-12 sm:col-span-1 text-xs font-bold text-muted-foreground">{i + 1}</span>
              <Input className="col-span-12 sm:col-span-5" value={st.title} placeholder="عنوان الخطوة" onChange={(e) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <Select value={st.party} onValueChange={(v) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, party: v } : x)))}>
                <SelectTrigger className="col-span-6 sm:col-span-2"><SelectValue /></SelectTrigger>
                <SelectContent>{STEP_PARTIES.map((p) => <SelectItem key={p} value={p}>{STEP_PARTY_LABELS[p]}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="col-span-6 sm:col-span-1" type="number" min="0" placeholder="أيام" value={st.slaDays ?? ""} onChange={(e) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, slaDays: e.target.value === "" ? null : Number(e.target.value) } : x)))} />
              <label className="col-span-6 sm:col-span-2 flex items-center gap-1.5 text-xs"><Switch checked={st.isPaymentStep} onCheckedChange={(v) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, isPaymentStep: v } : x)))} /> خطوة سداد</label>
              <div className="col-span-6 sm:col-span-1 flex justify-end">
                <Button type="button" variant="ghost" size="icon" onClick={() => setSteps((l) => move(l, i, -1))}><ArrowUp className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => setSteps((l) => move(l, i, 1))}><ArrowDown className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => setSteps((l) => l.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setSteps((l) => [...l, { title: "", description: null, party: "any", slaDays: null, isPaymentStep: false }])}><Plus className="w-4 h-4 me-1" /> خطوة</Button>
        </div>
      </Section>

      <Section title="المتطلبات والمستندات" icon={FileText}>
        <div className="space-y-2">
          {reqs.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center rounded-lg border p-2">
              <Select value={r.kind} onValueChange={(v) => setReqs((l) => l.map((x, j) => (j === i ? { ...x, kind: v } : x)))}>
                <SelectTrigger className="col-span-5 sm:col-span-3"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(REQUIREMENT_KIND_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="col-span-7 sm:col-span-6" value={r.title} placeholder="المتطلب أو المستند" onChange={(e) => setReqs((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <label className="col-span-8 sm:col-span-2 flex items-center gap-1.5 text-xs"><Switch checked={r.mandatory} onCheckedChange={(v) => setReqs((l) => l.map((x, j) => (j === i ? { ...x, mandatory: v } : x)))} /> إلزامي</label>
              <Button type="button" variant="ghost" size="icon" className="col-span-4 sm:col-span-1 text-destructive justify-self-end" onClick={() => setReqs((l) => l.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setReqs((l) => [...l, { kind: "document", title: "", description: null, mandatory: true }])}><Plus className="w-4 h-4 me-1" /> متطلب / مستند</Button>
        </div>
      </Section>
    </PaymentDialog>
  );
}
