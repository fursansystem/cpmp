// دليل الخدمات: the service catalogue, laid out like the national portal's service directory — search, categories,
// an authority filter and service cards — plus the forms that start a transaction and edit a service.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  STEP_PARTIES,
  type PermitsContext,
  type PermitUserRef, REQUIREMENT_KINDS } from "@shared/permits";
import { errorMessage, getJson, invalidatePermits, money, permitsQuery } from "./permits-common";
import { enumText, enumOptions } from "@/lib/enums";

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

export const feeText = (s: CatalogService) => (Number(s.feeAmount) > 0 ? money(s.feeAmount) : s.feeNote ?? "");

// ------------------------------------------------------------------ catalogue tab

export function ServiceCatalogTab({ ctx, projectId }: { ctx: PermitsContext; projectId: string }) {
  const { t } = useTranslation("permits");
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
          <Input className="ps-9" placeholder={t("hero.search_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-catalog-search" />
        </div>
        <Select value={authority} onValueChange={setAuthority}>
          <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("catalog.all_authorities")}</SelectItem>
            {usedAuthorities.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ms-auto flex gap-2">
          {canStart && <Button variant="outline" onClick={() => setStarting(null)}><Plus className="w-4 h-4 me-1" /> {t("hero.free_transaction")}</Button>}
          {canAdd && <Button onClick={() => setEditing("new")} data-testid="button-new-service"><Plus className="w-4 h-4 me-1" /> {t("hero.new_service")}</Button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <CategoryChip active={category === "all"} onClick={() => setCategory("all")} label={t("catalog.filter_all")} count={services.length} />
        {PERMIT_CATEGORIES.filter((c) => counts.get(c)).map((c) => (
          <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)} label={enumText("permit_category", c)} count={counts.get(c) ?? 0} />
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t("catalog.loading")}</p>}
      {!isLoading && filtered.length === 0 && <Card className="p-10 text-center text-muted-foreground">{t("catalog.no_matches")}</Card>}

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
              <Badge variant="secondary" className="border-none">{enumText("permit_category", s.category)}</Badge>
              {s.isLicense && <Badge variant="secondary" className="border-none bg-teal-500/10 text-teal-700 dark:text-teal-400">{t("catalog.license_with_expiry")}</Badge>}
              {!s.isSystem && <Badge variant="secondary" className="border-none bg-violet-500/10 text-violet-700 dark:text-violet-400">{t("catalog.custom_service")}</Badge>}
              {!s.active && <Badge variant="secondary" className="border-none">{t("catalog.suspended")}</Badge>}
            </div>
            {s.description && <p className="text-sm text-muted-foreground line-clamp-2">{s.description}</p>}
            <div className="mt-auto grid grid-cols-3 gap-2 text-xs text-muted-foreground border-t pt-3">
              <span className="flex items-center gap-1"><ListChecks className="w-3.5 h-3.5" /> {t("catalog.steps_count", { count: s.steps.length })}</span>
              <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {t("catalog.requirements_count", { count: s.requirements.length })}</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {s.slaDays ? t("catalog.sla_days", { count: s.slaDays }) : "—"}</span>
            </div>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {t("catalog.disclaimer_tab")}
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
  const { t } = useTranslation("permits");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const duplicate = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/permits/services/${s.id}/duplicate`),
    onSuccess: () => { invalidatePermits(queryClient); toast({ title: t("service_dialog.copy_success") }); onClose(); },
    onError: (e) => toast({ title: t("service_dialog.copy_error"), description: errorMessage(e), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/permits/services/${s.id}`),
    onSuccess: () => { invalidatePermits(queryClient); onClose(); },
    onError: (e) => toast({ title: t("service_dialog.delete_error"), description: errorMessage(e), variant: "destructive" }),
  });
  const documents = s.requirements.filter((r) => r.kind === "document");
  const conditions = s.requirements.filter((r) => r.kind !== "document");
  const portal = s.serviceUrl ?? s.authorityPortalUrl;

  return (
    <PaymentDialog
      onClose={onClose}
      icon={Landmark}
      kind={t("service_dialog.kind")}
      title={s.name}
      description={s.authorityName ?? undefined}
      footer={
        <>
          {ctx.projects.some((p) => p.isDeveloper) && s.active && <Button onClick={onStart} data-testid="button-start-transaction"><Rocket className="w-4 h-4 me-1" /> {t("service_dialog.btn_start_transaction")}</Button>}
          {portal && <Button variant="outline" asChild><a href={portal} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 me-1" /> {t("service_dialog.btn_portal")}</a></Button>}
          {s.canEdit && <Button variant="outline" onClick={onEdit}><Pencil className="w-4 h-4 me-1" /> {t("service_dialog.btn_edit")}</Button>}
          {s.isSystem && ctx.canManageOrgCatalog && <Button variant="ghost" disabled={duplicate.isPending} onClick={() => duplicate.mutate()}><Copy className="w-4 h-4 me-1" /> {t("service_dialog.btn_copy_to_mine")}</Button>}
          {s.canEdit && <Button variant="ghost" className="text-destructive" disabled={remove.isPending} onClick={() => confirm(t("service_dialog.confirm_delete")) && remove.mutate()}><Trash2 className="w-4 h-4 me-1" /> {t("service_dialog.btn_delete")}</Button>}
        </>
      }
    >
      {s.description && <p className="text-sm leading-7">{s.description}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InfoTile icon={Building2} label={t("service_dialog.authority")} value={s.authorityName ?? "—"} />
        <InfoTile icon={Wallet} label={t("service_dialog.service_fee")} value={feeText(s) || t("catalog.fee_determined_by_authority")} />
        <InfoTile icon={Clock} label={t("service_dialog.duration")} value={s.slaDays ? t("catalog.sla_days", { count: s.slaDays }) : t("service_dialog.per_authority")} />
        <InfoTile icon={BadgeCheck} label={t("service_dialog.validity")} value={s.isLicense ? (s.validityMonths ? t("service_dialog.months_count", { count: s.validityMonths }) : t("service_dialog.per_license")) : t("service_dialog.no_expiry")} />
      </div>
      {s.channels && <p className="text-sm"><span className="font-semibold">{t("service_dialog.channels")}: </span>{s.channels}</p>}

      <Section title={t("service_dialog.steps_title")} icon={ListChecks}>
        <ol className="space-y-2">
          {s.steps.map((st, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <div className="flex-1 text-sm">
                <span className="font-medium">{st.title}</span>
                <span className="text-xs text-muted-foreground"> · {enumText("step_party", st.party)}{st.slaDays ? ` · ${t("catalog.sla_days", { count: st.slaDays })}` : ""}{st.isPaymentStep ? ` · ${t("service_dialog.payment_via_payments")}` : ""}</span>
              </div>
            </li>
          ))}
          {s.steps.length === 0 && <p className="text-sm text-muted-foreground">{t("service_dialog.no_steps")}</p>}
        </ol>
      </Section>
      {conditions.length > 0 && (
        <Section title={t("service_dialog.requirements_title")} icon={BadgeCheck}>
          <ul className="list-disc ps-5 space-y-1 text-sm">{conditions.map((r, i) => <li key={i}>{r.title}{!r.mandatory && <span className="text-muted-foreground"> ({t("service_dialog.optional")})</span>}</li>)}</ul>
        </Section>
      )}
      <Section title={t("service_dialog.documents_title")} icon={FileText}>
        <ul className="list-disc ps-5 space-y-1 text-sm">{documents.map((r, i) => <li key={i}>{r.title}{!r.mandatory && <span className="text-muted-foreground"> ({t("service_dialog.optional")})</span>}</li>)}</ul>
        {documents.length === 0 && <p className="text-sm text-muted-foreground">{t("service_dialog.no_documents")}</p>}
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
  const { t } = useTranslation("permits");
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
      toast({ title: t("new_transaction.title_success") });
      onClose();
      navigate(`/permits/${row.id}`);
    },
    onError: (e) => toast({ title: t("new_transaction.toast_error"), description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <PaymentDialog
      onClose={onClose}
      size="md"
      icon={Rocket}
      kind={t("new_transaction.title")}
      title={service?.name ?? t("new_transaction.free_service_option")}
      description={service?.authorityName ?? t("new_transaction.free_desc")}
      footer={<Button disabled={create.isPending || !projectId || (!service && !form.title.trim())} onClick={() => create.mutate()} data-testid="button-create-transaction"><Save className="w-4 h-4 me-1" /> {t("new_transaction.btn_start")}</Button>}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("new_transaction.field_project_dev")}</Label>
          <Select value={projectId} onValueChange={(v) => { setProjectId(v); set("assigneeUserId")(""); }}>
            <SelectTrigger><SelectValue placeholder={t("new_transaction.select_project")} /></SelectTrigger>
            <SelectContent>{devProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("new_transaction.field_service")}</Label>
          <Select value={svcId} onValueChange={(v) => {
            setSvcId(v);
            const s = services.find((x) => x.id === v);
            setForm((f) => ({ ...f, title: s?.name ?? f.title, kind: s ? (s.isLicense ? "license" : "transaction") : f.kind, feeAmount: s && Number(s.feeAmount) > 0 ? String(Number(s.feeAmount)) : "" }));
          }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("new_transaction.free_service_option")}</SelectItem>
              {services.filter((s) => s.active).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} — {s.authorityName ?? ""}</SelectItem>)}
            </SelectContent>
          </Select>
          {service && <p className="text-xs text-muted-foreground">{t("new_transaction.copy_note", { steps: service.steps.length, reqs: service.requirements.length })}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2"><Label>{t("new_transaction.field_title")}</Label><Input value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder={t("new_transaction.title_ph")} /></div>
        {!service && (
          <>
            <div className="space-y-1.5"><Label>{t("new_transaction.field_authority")}</Label><Input value={form.authorityName} onChange={(e) => set("authorityName")(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>{t("new_transaction.field_kind")}</Label>
              <Select value={form.kind} onValueChange={set("kind")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="transaction">{t("new_transaction.kind_transaction")}</SelectItem><SelectItem value="license">{t("new_transaction.kind_license")}</SelectItem></SelectContent>
              </Select>
            </div>
          </>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("new_transaction.field_assignee")}</Label>
          <Select value={form.assigneeUserId || "none"} onValueChange={(v) => set("assigneeUserId")(v === "none" ? "" : v)} disabled={!projectId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("service_editor.authority_none")}</SelectItem>
              {assignees.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {enumText("step_party", u.party)}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("new_transaction.assignee_help")}</p>
        </div>
        <div className="space-y-1.5"><Label>{t("new_transaction.field_start_date")}</Label><Input type="date" value={form.startDate} onChange={(e) => set("startDate")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{t("new_transaction.field_due_date")}</Label><Input type="date" value={form.dueDate} onChange={(e) => set("dueDate")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{t("new_transaction.field_fee")}</Label><Input type="number" min="0" step="0.01" value={form.feeAmount} onChange={(e) => set("feeAmount")(e.target.value)} placeholder={service?.feeNote ?? "0"} /></div>
        <div className="space-y-1.5"><Label>{t("new_transaction.field_reference_no")}</Label><Input value={form.referenceNo} onChange={(e) => set("referenceNo")(e.target.value)} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>{t("new_transaction.field_notes")}</Label><Textarea rows={2} value={form.notes} onChange={(e) => set("notes")(e.target.value)} /></div>
      </div>
    </PaymentDialog>
  );
}

// ------------------------------------------------------------------ edit a service

export function ServiceEditorDialog({ ctx, service, authorities, onClose }: { ctx: PermitsContext; service: CatalogService | null; authorities: CatalogAuthority[]; onClose: () => void }) {
  const { t } = useTranslation("permits");
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
    onSuccess: () => { invalidatePermits(queryClient); toast({ title: t("service_editor.saved_toast") }); onClose(); },
    onError: (e) => toast({ title: t("service_editor.toast_error"), description: errorMessage(e), variant: "destructive" }),
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
      kind={service ? t("service_editor.kind_edit") : t("service_editor.title_new")}
      title={form.name || t("service_editor.title_new")}
      footer={<Button disabled={save.isPending || !form.name.trim() || (form.authorityId === "new" && !form.authorityName.trim())} onClick={() => save.mutate()}><Save className="w-4 h-4 me-1" /> {t("service_editor.btn_save")}</Button>}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        {!service && ctx.canManageSystemCatalog && ctx.canManageOrgCatalog && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("service_editor.add_to")}</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "system" | "org")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="org">{t("service_editor.scope_org")}</SelectItem><SelectItem value="system">{t("service_editor.scope_system")}</SelectItem></SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5 sm:col-span-2"><Label>{t("service_editor.field_name")}</Label><Input value={form.name} onChange={(e) => set("name")(e.target.value)} /></div>
        <div className="space-y-1.5">
          <Label>{t("service_editor.field_authority")}</Label>
          <Select value={form.authorityId || "none"} onValueChange={(v) => set("authorityId")(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("service_editor.authority_none")}</SelectItem>
              {authorities.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              <SelectItem value="new">{t("service_editor.authority_new")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("service_editor.field_category")}</Label>
          <Select value={form.category} onValueChange={set("category")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PERMIT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{enumText("permit_category", c)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {form.authorityId === "new" && (
          <>
            <div className="space-y-1.5"><Label>{t("service_editor.new_authority_name")}</Label><Input value={form.authorityName} onChange={(e) => set("authorityName")(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t("service_editor.new_authority_url")}</Label><Input dir="ltr" value={form.authorityPortalUrl} onChange={(e) => set("authorityPortalUrl")(e.target.value)} placeholder="https://" /></div>
          </>
        )}
        <div className="space-y-1.5 sm:col-span-2"><Label>{t("service_editor.field_desc")}</Label><Textarea rows={3} value={form.description} onChange={(e) => set("description")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{t("service_editor.field_service_url")}</Label><Input dir="ltr" value={form.serviceUrl} onChange={(e) => set("serviceUrl")(e.target.value)} placeholder="https://" /></div>
        <div className="space-y-1.5"><Label>{t("service_editor.field_channels")}</Label><Input value={form.channels} onChange={(e) => set("channels")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{t("service_editor.field_fee")}</Label><Input type="number" min="0" step="0.01" value={form.feeAmount} onChange={(e) => set("feeAmount")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{t("service_editor.field_fee_note")}</Label><Input value={form.feeNote} onChange={(e) => set("feeNote")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{t("service_editor.field_sla_days")}</Label><Input type="number" min="0" value={form.slaDays} onChange={(e) => set("slaDays")(e.target.value)} /></div>
        <div className="flex items-center gap-3 pt-6"><Switch checked={form.active} onCheckedChange={set("active")} /><Label>{t("service_editor.service_available")}</Label></div>
        <div className="flex items-center gap-3"><Switch checked={form.isLicense} onCheckedChange={set("isLicense")} /><Label>{t("service_editor.produces_license")}</Label></div>
        {form.isLicense && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>{t("service_editor.field_validity_months")}</Label><Input type="number" min="0" value={form.validityMonths} onChange={(e) => set("validityMonths")(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t("service_editor.field_renewal_lead")}</Label><Input type="number" min="0" value={form.renewalLeadDays} onChange={(e) => set("renewalLeadDays")(e.target.value)} /></div>
          </div>
        )}
      </div>

      <Section title={t("service_editor.steps_title")} icon={ListChecks}>
        <div className="space-y-2">
          {steps.map((st, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center rounded-lg border p-2">
              <span className="col-span-12 sm:col-span-1 text-xs font-bold text-muted-foreground">{i + 1}</span>
              <Input className="col-span-12 sm:col-span-5" value={st.title} placeholder={t("service_editor.step_title_ph")} onChange={(e) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <Select value={st.party} onValueChange={(v) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, party: v } : x)))}>
                <SelectTrigger className="col-span-6 sm:col-span-2"><SelectValue /></SelectTrigger>
                <SelectContent>{STEP_PARTIES.map((p) => <SelectItem key={p} value={p}>{enumText("step_party", p)}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="col-span-6 sm:col-span-1" type="number" min="0" placeholder={t("service_editor.days_ph")} value={st.slaDays ?? ""} onChange={(e) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, slaDays: e.target.value === "" ? null : Number(e.target.value) } : x)))} />
              <label className="col-span-6 sm:col-span-2 flex items-center gap-1.5 text-xs"><Switch checked={st.isPaymentStep} onCheckedChange={(v) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, isPaymentStep: v } : x)))} /> {t("service_editor.payment_step")}</label>
              <div className="col-span-6 sm:col-span-1 flex justify-end">
                <Button type="button" variant="ghost" size="icon" onClick={() => setSteps((l) => move(l, i, -1))}><ArrowUp className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => setSteps((l) => move(l, i, 1))}><ArrowDown className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => setSteps((l) => l.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setSteps((l) => [...l, { title: "", description: null, party: "any", slaDays: null, isPaymentStep: false }])}><Plus className="w-4 h-4 me-1" /> {t("service_editor.step_btn")}</Button>
        </div>
      </Section>

      <Section title={t("service_editor.requirements_title")} icon={FileText}>
        <div className="space-y-2">
          {reqs.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center rounded-lg border p-2">
              <Select value={r.kind} onValueChange={(v) => setReqs((l) => l.map((x, j) => (j === i ? { ...x, kind: v } : x)))}>
                <SelectTrigger className="col-span-5 sm:col-span-3"><SelectValue /></SelectTrigger>
                <SelectContent>{enumOptions("requirement_kind", REQUIREMENT_KINDS).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="col-span-7 sm:col-span-6" value={r.title} placeholder={t("service_editor.req_title_ph")} onChange={(e) => setReqs((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <label className="col-span-8 sm:col-span-2 flex items-center gap-1.5 text-xs"><Switch checked={r.mandatory} onCheckedChange={(v) => setReqs((l) => l.map((x, j) => (j === i ? { ...x, mandatory: v } : x)))} /> {t("service_editor.mandatory")}</label>
              <Button type="button" variant="ghost" size="icon" className="col-span-4 sm:col-span-1 text-destructive justify-self-end" onClick={() => setReqs((l) => l.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setReqs((l) => [...l, { kind: "document", title: "", description: null, mandatory: true }])}><Plus className="w-4 h-4 me-1" /> {t("service_editor.req_btn")}</Button>
        </div>
      </Section>
    </PaymentDialog>
  );
}
