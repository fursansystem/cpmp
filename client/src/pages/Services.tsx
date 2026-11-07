// دليل الخدمات — the landing page of the service directory, in the spirit of the national portal's services page:
// a search hero, the categories with their counts, the authorities, then the services themselves. Opening a service
// shows its steps, requirements, documents, fee and duration, and the developer can start a transaction from it.
import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Building2, Clock, Droplets, FileText, Flame, Home, Landmark, Leaf, ListChecks, Plus, Search, ShieldCheck, Sparkles, Zap, type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PERMIT_CATEGORIES, PERMIT_CATEGORY_LABELS, type PermitCategory } from "@shared/permits";
import { usePermitsContext } from "@/components/permits/permits-common";
import {
  NewTransactionDialog, ServiceDetailDialog, ServiceEditorDialog, feeText, useCatalog, type CatalogService,
} from "@/components/permits/service-catalog";

const CATEGORY_ICON: Record<PermitCategory, LucideIcon> = {
  municipal: Building2,
  civil_defense: Flame,
  electricity: Zap,
  water: Droplets,
  environment: Leaf,
  real_estate: Home,
  insurance: ShieldCheck,
  other: Sparkles,
};

export default function Services() {
  const { data: ctx } = usePermitsContext();
  const { data, isLoading } = useCatalog();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [authority, setAuthority] = useState<string>("all");
  const [kind, setKind] = useState<"all" | "license" | "transaction">("all");
  const [open, setOpen] = useState<CatalogService | null>(null);
  const [starting, setStarting] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState<CatalogService | "new" | null>(null);

  const services = (data?.services ?? []).filter((s) => s.active || s.canEdit);
  const authorities = (data?.authorities ?? []).filter((a) => services.some((s) => s.authorityId === a.id));

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return services.filter((s) =>
      (category === "all" || s.category === category) &&
      (authority === "all" || s.authorityId === authority) &&
      (kind === "all" || (kind === "license") === s.isLicense) &&
      (!text || [s.name, s.description, s.authorityName, ...s.requirements.map((r) => r.title)].some((v) => String(v ?? "").toLowerCase().includes(text))));
  }, [services, q, category, authority, kind]);

  const countBy = (c: string) => services.filter((s) => s.category === c).length;
  const canStart = !!ctx?.projects.some((p) => p.isDeveloper);
  const canAdd = !!ctx && (ctx.canManageOrgCatalog || ctx.canManageSystemCatalog);
  const filtering = q || category !== "all" || authority !== "all" || kind !== "all";

  return (
    <div className="min-h-full" dir="rtl" data-testid="page-services">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-bl from-primary/15 via-primary/5 to-background border-b">
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative px-4 sm:px-8 py-10 sm:py-14 max-w-6xl mx-auto space-y-6">
          <div className="flex items-center gap-2 text-sm text-primary font-bold"><Landmark className="w-4 h-4" /> الرخص والمعاملات</div>
          <h1 className="text-3xl sm:text-5xl font-black font-display leading-tight">دليل الخدمات</h1>
          <p className="text-muted-foreground max-w-2xl text-base sm:text-lg">
            خدمات الجهات الحكومية والخدمية التي يمر بها المشروع الإنشائي: الخطوات، المتطلبات، المستندات المطلوبة، الرسوم ومدة التنفيذ — وابدأ المعاملة لمشروعك مباشرة.
          </p>
          <div className="relative max-w-2xl">
            <Search className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              className="h-14 ps-12 text-base rounded-2xl shadow-lg bg-background"
              placeholder="ابحث عن خدمة، جهة أو مستند…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="input-services-search"
            />
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <Stat value={services.length} label="خدمة" />
            <Stat value={authorities.length} label="جهة" />
            <Stat value={services.filter((s) => s.isLicense).length} label="رخصة بتاريخ انتهاء" />
            <div className="w-full sm:w-auto sm:ms-auto flex flex-wrap gap-2">
              <Button variant="outline" asChild><Link href="/permits"><ArrowLeft className="w-4 h-4 me-1" /> معاملاتي</Link></Button>
              {canStart && <Button variant="outline" onClick={() => setStarting(null)}><Plus className="w-4 h-4 me-1" /> معاملة حرة</Button>}
              {canAdd && <Button onClick={() => setEditing("new")}><Plus className="w-4 h-4 me-1" /> خدمة جديدة</Button>}
            </div>
          </div>
        </div>
      </section>

      <div className="px-4 sm:px-8 py-8 max-w-6xl mx-auto space-y-10">
        {isLoading && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>}

        {!isLoading && services.length === 0 && (
          <Card className="p-10 text-center space-y-2">
            <Landmark className="w-10 h-10 mx-auto text-primary" />
            <h2 className="font-bold text-lg">الدليل فارغ</h2>
            <p className="text-sm text-muted-foreground">تُضاف الخدمات النظامية تلقائياً عند تشغيل الخادم بعد ترحيل قاعدة البيانات (<code dir="ltr">npm run db:migrate-permits</code>). حدّث الصفحة بعد إعادة التشغيل.</p>
          </Card>
        )}

        {/* Categories */}
        {services.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold">التصنيفات</h2>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {PERMIT_CATEGORIES.filter((c) => countBy(c) > 0).map((c) => {
                const Icon = CATEGORY_ICON[c];
                const active = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(active ? "all" : c)}
                    className={cn("text-start rounded-2xl border p-4 transition-all hover:shadow-md hover:-translate-y-0.5", active ? "border-primary bg-primary/10" : "bg-card")}
                    data-testid={`category-${c}`}
                  >
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}><Icon className="w-5 h-5" /></div>
                    <div className="font-bold leading-snug">{PERMIT_CATEGORY_LABELS[c]}</div>
                    <div className="text-xs text-muted-foreground mt-1">{countBy(c)} خدمة</div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Authorities */}
        {authorities.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold">الجهات</h2>
            <div className="flex flex-wrap gap-2">
              <Chip active={authority === "all"} onClick={() => setAuthority("all")}>كل الجهات</Chip>
              {authorities.map((a) => (
                <Chip key={a.id} active={authority === a.id} onClick={() => setAuthority(authority === a.id ? "all" : a.id)}>
                  {a.name} <span className="opacity-60 ms-1">{services.filter((s) => s.authorityId === a.id).length}</span>
                </Chip>
              ))}
            </div>
          </section>
        )}

        {/* Services */}
        {services.length > 0 && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold flex-1">{filtering ? `نتائج البحث (${filtered.length})` : "كل الخدمات"}</h2>
              <Chip active={kind === "all"} onClick={() => setKind("all")}>الكل</Chip>
              <Chip active={kind === "license"} onClick={() => setKind("license")}>رخص</Chip>
              <Chip active={kind === "transaction"} onClick={() => setKind("transaction")}>معاملات</Chip>
              {filtering && <Button variant="ghost" size="sm" onClick={() => { setQ(""); setCategory("all"); setAuthority("all"); setKind("all"); }}>مسح الفلاتر</Button>}
            </div>
            {filtered.length === 0 && <Card className="p-10 text-center text-muted-foreground">لا توجد خدمات مطابقة</Card>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((s) => {
                const Icon = CATEGORY_ICON[s.category as PermitCategory] ?? Sparkles;
                return (
                  <Card key={s.id} className={cn("rounded-2xl p-5 flex flex-col gap-3 hover:shadow-xl transition-shadow cursor-pointer", !s.active && "opacity-60")} onClick={() => setOpen(s)} data-testid="card-service">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold leading-snug">{s.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.authorityName ?? "—"}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="border-none">إلكترونية</Badge>
                      {s.isLicense && <Badge variant="secondary" className="border-none bg-teal-500/10 text-teal-700 dark:text-teal-400">رخصة</Badge>}
                      {!s.isSystem && <Badge variant="secondary" className="border-none bg-violet-500/10 text-violet-700 dark:text-violet-400">خدمة خاصة</Badge>}
                    </div>
                    {s.description && <p className="text-sm text-muted-foreground line-clamp-3">{s.description}</p>}
                    <div className="mt-auto grid grid-cols-3 gap-2 text-xs text-muted-foreground border-t pt-3">
                      <span className="flex items-center gap-1"><ListChecks className="w-3.5 h-3.5" /> {s.steps.length} خطوات</span>
                      <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {s.requirements.length} متطلبات</span>
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {s.slaDays ? `${s.slaDays} يوم` : "—"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-1">الرسوم: {feeText(s)}</div>
                  </Card>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              الخدمات النظامية مرجع للخطوات والمستندات الشائعة، وتختلف التفاصيل والرسوم حسب المدينة ونوع المشروع؛ تحقّق منها عبر بوابة الجهة.
            </p>
          </section>
        )}
      </div>

      {open && ctx && (
        <ServiceDetailDialog
          ctx={ctx}
          service={services.find((s) => s.id === open.id) ?? open}
          onClose={() => setOpen(null)}
          onStart={() => { setStarting(open.id); setOpen(null); }}
          onEdit={() => { setEditing(open); setOpen(null); }}
        />
      )}
      {starting !== undefined && ctx && (
        <NewTransactionDialog ctx={ctx} services={services} defaultProjectId="all" serviceId={starting} onClose={() => setStarting(undefined)} />
      )}
      {editing && ctx && (
        <ServiceEditorDialog ctx={ctx} service={editing === "new" ? null : editing} authorities={data?.authorities ?? []} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <span className="text-2xl font-black tabular-nums">{value}</span>
      <span className="text-muted-foreground ms-1.5">{label}</span>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-full border px-3.5 py-1.5 text-sm transition-colors", active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted")}
    >
      {children}
    </button>
  );
}
