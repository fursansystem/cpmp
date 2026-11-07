// الرخص والمعاملات (Permits & transactions): the licences and government transactions of every project the
// user can see. Developers run them; people assigned a transaction or a step see theirs under "مهامي".
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { AlertTriangle, CalendarClock, CheckCircle2, Hourglass, Landmark, Plus, RefreshCw, Search, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/stat-card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  OPEN_PERMIT,
  PERMIT_CATEGORIES,
  PERMIT_CATEGORY_LABELS,
  PERMIT_STATUS_LABELS,
  daysUntil,
  type PermitsContext,
} from "@shared/permits";
import {
  AttentionBadge,
  PermitStatusBadge,
  StepsProgress,
  errorMessage,
  fmtDate,
  getJson,
  invalidatePermits,
  money,
  permitsQuery,
  usePermitsContext,
  type PermitRow,
} from "@/components/permits/permits-common";
import { NewTransactionDialog, ServiceCatalogTab, useCatalog } from "@/components/permits/service-catalog";

const query = (key: string) => {
  try {
    return new URLSearchParams(window.location.search).get(key);
  } catch {
    return null;
  }
};

const isOpen = (s: string) => (OPEN_PERMIT as readonly string[]).includes(s);

export default function Permits() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const [tab, setTab] = useState(query("tab") || "transactions");
  const [projectId, setProjectId] = useState(query("project") || "all");
  const { data: ctx, isLoading: ctxLoading } = usePermitsContext();

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("tab")) setTab(params.get("tab")!);
    if (params.get("project")) setProjectId(params.get("project")!);
    // Activity links to a step: open the transaction it belongs to
    const step = params.get("step");
    if (step) {
      getJson<{ transactionId: string }>(`/api/permits/steps/${step}`)
        .then((r) => navigate(`/permits/${r.transactionId}`, { replace: true }))
        .catch(() => navigate("/permits?tab=mine", { replace: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { data, isLoading } = useQuery<{ transactions: PermitRow[] }>({
    queryKey: ["permits", "overview", projectId],
    queryFn: () => getJson(`/api/permits/overview${projectId === "all" ? "" : `?projectId=${projectId}`}`),
    enabled: !!ctx,
    meta: permitsQuery,
  });

  if (ctxLoading || !ctx) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const rows = data?.transactions ?? [];
  const stats = {
    open: rows.filter((r) => isOpen(r.status)).length,
    awaitingPayment: rows.filter((r) => isOpen(r.status) && Number(r.feeAmount) > 0 && !r.feePaid).length,
    expiring: rows.filter((r) => r.attention === "expiring").length,
    expired: rows.filter((r) => r.attention === "expired").length,
  };
  const isDeveloperSomewhere = ctx.projects.some((p) => p.isDeveloper);

  return (
    <div className="p-6 lg:p-8 space-y-6" dir="rtl" data-testid="page-permits">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display mb-2">الرخص والمعاملات</h1>
          <p className="text-muted-foreground">
            {isDeveloperSomewhere
              ? "متابعة إجراءات المشاريع لدى الجهات الحكومية وغيرها: الخطوات والمتطلبات والمستندات والرسوم وتواريخ الانتهاء"
              : "المعاملات والخطوات المُسندة إليك في مشاريعك"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" asChild><Link href="/services"><Landmark className="w-4 h-4 me-1" /> دليل الخدمات</Link></Button>
        {ctx.projects.length > 0 && (
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-[260px]" data-testid="select-permits-project"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المشاريع</SelectItem>
              {ctx.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        </div>
      </div>

      {ctx.projects.length === 0 ? (
        <Card>
          <div className="p-12 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center"><Landmark className="w-7 h-7 text-primary" /></div>
            <h3 className="font-semibold font-display">لا توجد مشاريع متاحة لك</h3>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="معاملات مفتوحة" value={stats.open} icon={Hourglass} />
            <StatCard title="رسوم بانتظار السداد" value={stats.awaitingPayment} icon={Wallet} />
            <StatCard title="رخص تنتهي قريباً" value={stats.expiring} icon={CalendarClock} />
            <StatCard title="رخص منتهية" value={stats.expired} icon={AlertTriangle} />
          </div>

          <Tabs value={tab} onValueChange={setTab} className="space-y-4">
            <TabsList className="h-auto flex-wrap justify-start">
              <TabsTrigger value="transactions">المعاملات</TabsTrigger>
              <TabsTrigger value="mine">مهامي</TabsTrigger>
              <TabsTrigger value="licences">الرخص وتواريخ الانتهاء{stats.expiring + stats.expired > 0 && <Badge variant="secondary" className="ms-2 h-5 px-1.5 rounded-full bg-destructive/15 text-destructive">{stats.expiring + stats.expired}</Badge>}</TabsTrigger>
              <TabsTrigger value="catalog">دليل الخدمات</TabsTrigger>
            </TabsList>
            <TabsContent value="transactions">
              {isLoading ? <Skeleton className="h-96 rounded-2xl" /> : <TransactionsTab ctx={ctx} projectId={projectId} rows={rows} />}
            </TabsContent>
            <TabsContent value="mine"><MyTasksTab /></TabsContent>
            <TabsContent value="licences">
              {isLoading ? <Skeleton className="h-96 rounded-2xl" /> : <LicencesTab projectId={projectId} rows={rows} />}
            </TabsContent>
            <TabsContent value="catalog"><ServiceCatalogTab ctx={ctx} projectId={projectId} /></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ transactions

function TransactionsTab({ ctx, projectId, rows }: { ctx: PermitsContext; projectId: string; rows: PermitRow[] }) {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState("open");
  const [category, setCategory] = useState("all");
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const { data: catalog } = useCatalog();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      (status === "all" || (status === "open" ? isOpen(r.status) : status === "attention" ? !!r.attention : r.status === status)) &&
      (category === "all" || r.category === category) &&
      (!mine || r.assigneeUserId === ctx.userId || r.nextStep?.assigneeUserId === ctx.userId) &&
      (!s || [r.transactionNo, r.title, r.authorityName, r.referenceNo, r.licenseNo, r.projectName, r.assigneeName].some((v) => String(v ?? "").toLowerCase().includes(s))));
  }, [rows, status, category, mine, q, ctx.userId]);

  const canCreate = ctx.projects.some((p) => p.isDeveloper);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input className="ps-9" placeholder="بحث بالرقم، العنوان، الجهة، رقم الطلب…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">المفتوحة</SelectItem>
            <SelectItem value="attention">تحتاج انتباه</SelectItem>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(PERMIT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل التصنيفات</SelectItem>
            {PERMIT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{PERMIT_CATEGORY_LABELS[c]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={mine ? "default" : "outline"} size="sm" onClick={() => setMine((v) => !v)}>المُسندة لي</Button>
        {canCreate && <Button className="ms-auto" onClick={() => setCreating(true)} data-testid="button-new-transaction"><Plus className="w-4 h-4 me-1" /> معاملة جديدة</Button>}
      </div>
      <Card className="rounded-2xl">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المعاملة</TableHead>
                {projectId === "all" && <TableHead>المشروع</TableHead>}
                <TableHead>الجهة</TableHead>
                <TableHead>المسؤول</TableHead>
                <TableHead>الخطوات</TableHead>
                <TableHead>الخطوة الحالية</TableHead>
                <TableHead>الاستحقاق / الانتهاء</TableHead>
                <TableHead className="text-end">الرسوم</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">لا توجد معاملات</TableCell></TableRow>}
              {filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/permits/${r.id}`)} data-testid="row-transaction">
                  <TableCell className="font-semibold">
                    {r.title}
                    <div className="text-xs font-normal text-muted-foreground">{r.transactionNo}{r.referenceNo ? ` · ${r.referenceNo}` : ""}{r.kind === "license" ? " · رخصة" : ""}</div>
                  </TableCell>
                  {projectId === "all" && <TableCell>{r.projectName}</TableCell>}
                  <TableCell className="max-w-[200px] truncate">{r.authorityName ?? "—"}</TableCell>
                  <TableCell>{r.assigneeName ?? "—"}</TableCell>
                  <TableCell><StepsProgress done={r.stepsDone} total={r.stepsTotal} /></TableCell>
                  <TableCell className="text-sm">{r.nextStep ? <>{r.nextStep.title}{r.nextStep.dueDate && <div className="text-xs text-muted-foreground">{fmtDate(r.nextStep.dueDate)}</div>}</> : "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{isOpen(r.status) ? fmtDate(r.dueDate) : fmtDate(r.expiryDate)}</TableCell>
                  <TableCell className="text-end tabular-nums whitespace-nowrap">
                    {Number(r.feeAmount) > 0 ? money(r.feeAmount) : "—"}
                    {Number(r.feeAmount) > 0 && <div className="text-xs text-muted-foreground">{r.feePaid ? "مسددة" : r.order ? `أمر ${r.order.orderNo}` : "غير مسددة"}</div>}
                  </TableCell>
                  <TableCell className="space-y-1">
                    <PermitStatusBadge status={r.status} />
                    <div><AttentionBadge kind={r.attention} /></div>
                    {r.requirementsMissing > 0 && isOpen(r.status) && <div className="text-[11px] text-amber-700 dark:text-amber-400">{r.requirementsMissing} متطلبات ناقصة</div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {creating && <NewTransactionDialog ctx={ctx} services={catalog?.services ?? []} defaultProjectId={projectId} serviceId={null} onClose={() => setCreating(false)} />}
    </div>
  );
}

// ------------------------------------------------------------------ my tasks

interface MyStep {
  id: string;
  transactionId: string;
  title: string;
  status: string;
  dueDate: string | null;
  transactionNo: string;
  transactionTitle: string;
  authorityName: string | null;
  projectName: string;
  isPaymentBlocked: boolean;
}

function MyTasksTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<{ steps: MyStep[]; transactions: (PermitRow & { attention: string | null })[] }>({
    queryKey: ["permits", "my-tasks"],
    queryFn: () => getJson("/api/permits/my-tasks"),
    meta: permitsQuery,
  });
  const complete = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/permits/steps/${id}/status`, { status: "done" }),
    onSuccess: () => { invalidatePermits(queryClient); toast({ title: "أُنجزت الخطوة" }); },
    onError: (e) => toast({ title: "تعذّر التحديث", description: errorMessage(e), variant: "destructive" }),
  });
  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  const today = new Date().toISOString().slice(0, 10);
  const steps = data?.steps ?? [];
  const txs = data?.transactions ?? [];

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl">
        <CardContent className="p-0 overflow-x-auto">
          <div className="px-5 pt-4 pb-2 font-bold">خطوات مُسندة إليك ({steps.length})</div>
          <Table>
            <TableHeader><TableRow><TableHead>الخطوة</TableHead><TableHead>المعاملة</TableHead><TableHead>المشروع</TableHead><TableHead>الاستحقاق</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {steps.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">لا توجد خطوات بانتظارك</TableCell></TableRow>}
              {steps.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-semibold">{s.title}</TableCell>
                  <TableCell><Link href={`/permits/${s.transactionId}`} className="hover:underline">{s.transactionNo} · {s.transactionTitle}</Link><div className="text-xs text-muted-foreground">{s.authorityName ?? ""}</div></TableCell>
                  <TableCell>{s.projectName}</TableCell>
                  <TableCell className={cn(s.dueDate && s.dueDate < today && "text-destructive font-semibold")}>{fmtDate(s.dueDate)}</TableCell>
                  <TableCell className="text-end">
                    {s.isPaymentBlocked
                      ? <Button size="sm" variant="outline" onClick={() => navigate(`/permits/${s.transactionId}`)}><Wallet className="w-4 h-4 me-1" /> السداد</Button>
                      : <Button size="sm" variant="outline" disabled={complete.isPending} onClick={() => complete.mutate(s.id)}><CheckCircle2 className="w-4 h-4 me-1" /> تم</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="rounded-2xl">
        <CardContent className="p-0 overflow-x-auto">
          <div className="px-5 pt-4 pb-2 font-bold">معاملات تتابعها ({txs.length})</div>
          <Table>
            <TableHeader><TableRow><TableHead>المعاملة</TableHead><TableHead>المشروع</TableHead><TableHead>الاستحقاق / الانتهاء</TableHead><TableHead>الحالة</TableHead></TableRow></TableHeader>
            <TableBody>
              {txs.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">لا توجد معاملات مُسندة إليك</TableCell></TableRow>}
              {txs.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`/permits/${t.id}`)}>
                  <TableCell className="font-semibold">{t.title}<div className="text-xs font-normal text-muted-foreground">{t.transactionNo}</div></TableCell>
                  <TableCell>{t.projectName}</TableCell>
                  <TableCell>{t.status === "completed" ? fmtDate(t.expiryDate) : fmtDate(t.dueDate)}</TableCell>
                  <TableCell className="space-y-1"><PermitStatusBadge status={t.status} /><div><AttentionBadge kind={t.attention as any} /></div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ licences and expiry

function LicencesTab({ projectId, rows }: { projectId: string; rows: PermitRow[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const renew = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/permits/transactions/${id}/renew`)).json(),
    onSuccess: (row: { id: string }) => { invalidatePermits(queryClient); toast({ title: "فُتحت معاملة التجديد" }); navigate(`/permits/${row.id}`); },
    onError: (e) => toast({ title: "تعذّر التجديد", description: errorMessage(e), variant: "destructive" }),
  });

  const licences = rows
    .filter((r) => r.kind === "license" && (r.status === "completed" || r.status === "expired") && r.expiryDate)
    .map((r) => ({ ...r, left: daysUntil(r.expiryDate!) }))
    .sort((a, b) => a.left - b.left);
  const groups: { key: string; label: string; tone?: string; items: typeof licences }[] = [
    { key: "expired", label: "منتهية", tone: "text-destructive", items: licences.filter((l) => l.left < 0) },
    { key: "30", label: "تنتهي خلال 30 يوماً", tone: "text-amber-600", items: licences.filter((l) => l.left >= 0 && l.left <= 30) },
    { key: "90", label: "تنتهي خلال 90 يوماً", items: licences.filter((l) => l.left > 30 && l.left <= 90) },
    { key: "later", label: "سارية", items: licences.filter((l) => l.left > 90) },
  ];

  if (licences.length === 0) {
    return <Card className="p-10 text-center text-muted-foreground">لا توجد رخص صادرة بتاريخ انتهاء. تظهر الرخص هنا عند إكمال معاملة من نوع "رخصة".</Card>;
  }

  return (
    <div className="space-y-6">
      {groups.filter((g) => g.items.length).map((g) => (
        <Card key={g.key} className="rounded-2xl">
          <CardContent className="p-0 overflow-x-auto">
            <div className={cn("px-5 pt-4 pb-2 font-bold", g.tone)}>{g.label} ({g.items.length})</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الرخصة</TableHead>
                  {projectId === "all" && <TableHead>المشروع</TableHead>}
                  <TableHead>الجهة</TableHead>
                  <TableHead>رقم الرخصة</TableHead>
                  <TableHead>الإصدار</TableHead>
                  <TableHead>الانتهاء</TableHead>
                  <TableHead>المتبقي</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.items.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-semibold"><Link href={`/permits/${l.id}`} className="hover:underline">{l.title}</Link><div className="text-xs font-normal text-muted-foreground">{l.transactionNo}</div></TableCell>
                    {projectId === "all" && <TableCell>{l.projectName}</TableCell>}
                    <TableCell className="max-w-[200px] truncate">{l.authorityName ?? "—"}</TableCell>
                    <TableCell>{l.licenseNo ?? "—"}</TableCell>
                    <TableCell>{fmtDate(l.issueDate)}</TableCell>
                    <TableCell>{fmtDate(l.expiryDate)}</TableCell>
                    <TableCell className={cn("tabular-nums", l.left < 0 ? "text-destructive font-semibold" : l.left <= 30 && "text-amber-600 font-semibold")}>{l.left < 0 ? `منذ ${-l.left} يوم` : `${l.left} يوم`}</TableCell>
                    <TableCell className="text-end">
                      {l.renewedBy
                        ? <span className="text-xs text-muted-foreground">جارٍ التجديد: {l.renewedBy}</span>
                        : l.isDeveloper && <Button size="sm" variant="outline" disabled={renew.isPending} onClick={() => renew.mutate(l.id)}><RefreshCw className="w-4 h-4 me-1" /> تجديد</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
