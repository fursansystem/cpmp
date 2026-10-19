import { useParams, useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, AlertTriangle, TrendingUp, Wallet, Hourglass, Banknote, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useProgressMatrix, fmtMoney, fmtPct } from "@/components/progress-matrix/use-progress-matrix";
import { MatrixGrid } from "@/components/progress-matrix/matrix-grid";
import { WbsEditor } from "@/components/progress-matrix/wbs-editor";
import { UnitsTable } from "@/components/progress-matrix/units-table";
import { PaymentCertificates } from "@/components/progress-matrix/payment-certificates";

const TABS = ["matrix", "wbs", "units", "certificates"] as const;
type Tab = typeof TABS[number];

// مصفوفة أوزان ونسب الإنجاز + المستخلصات (Progress Matrix & Payment Certificates)
export default function ProjectProgressMatrix() {
  const { projectId = "" } = useParams();
  const [, navigate] = useLocation();
  const search = useSearch();
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin";
  const tabParam = new URLSearchParams(search).get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "matrix";
  const setTab = (t: string) => navigate(`/projects/${projectId}/progress-matrix?tab=${t}`, { replace: true });

  const { model, isLoading, error } = useProgressMatrix(projectId);

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-10 w-72 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>
        <div className="h-96 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }
  if (error || !model) {
    return (
      <div className="p-8 text-center text-muted-foreground space-y-3">
        <p>تعذّر تحميل مصفوفة الإنجاز (Could not load the progress matrix).</p>
        <p className="text-xs">{error instanceof Error ? error.message : ""}</p>
        <Button variant="outline" onClick={() => navigate(`/projects/${projectId}`)}>رجوع (Back)</Button>
      </div>
    );
  }

  const { payload, summary, totals } = model;
  const projectName = payload.project.name;
  const issues = summary.issues;
  const describeIssue = (parentId: string | null) => {
    if (!parentId) return "المراحل (Phases)";
    const p = summary.tree.byId.get(parentId);
    return p ? `${p.code} ${p.nameAr}` : parentId;
  };

  const kpis = [
    { label: "الإنجاز الكلي (Overall progress)", value: fmtPct(summary.projectProgress, 2), icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-500/10",
      sub: payload.settings.driveProjectProgress ? "يحدّث نسبة المشروع (drives project %)" : `نسبة المشروع الحالية (project %): ${payload.project.progress}%` },
    { label: "قيمة الاستحقاق (Earned value)", value: fmtMoney(totals.earned), icon: Wallet, color: "text-emerald-600", bg: "bg-emerald-500/10",
      sub: `من (of) ${fmtMoney(totals.value)}` },
    { label: "المعلّق (Pending)", value: fmtMoney(totals.pending), icon: Hourglass, color: "text-amber-600", bg: "bg-amber-500/10", sub: "مرفوع + معتمد (submitted + approved)" },
    { label: "المدفوع (Paid)", value: fmtMoney(totals.paid), icon: Banknote, color: "text-teal-600", bg: "bg-teal-500/10", sub: "" },
    { label: "المتبقي (Remaining)", value: fmtMoney(totals.remaining), icon: Scale, color: "text-rose-600", bg: "bg-rose-500/10", sub: "القيمة − الاستحقاق (value − earned)" },
  ];

  return (
    <div className="px-4 lg:px-8 pt-2 pb-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => navigate(`/projects/${projectId}`)}>
          <ArrowLeft className="w-5 h-5 md:mr-2" /><span className="hidden md:inline font-semibold">{projectName}</span>
        </Button>
        <h1 className="text-lg lg:text-xl font-black tracking-tight">مصفوفة الإنجاز والمستخلصات (Progress Matrix & Payment Certificates)</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4 rounded-xl border-none shadow-md">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-muted-foreground">{k.label}</div>
                <div className={cn("text-base xl:text-xl 2xl:text-2xl font-black tracking-tight tabular-nums break-all", k.color)}>{k.value}</div>
                {k.sub && <div className="text-[10px] text-muted-foreground truncate">{k.sub}</div>}
              </div>
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", k.bg)}><k.icon className={cn("w-5 h-5", k.color)} /></div>
            </div>
          </Card>
        ))}
      </div>

      {issues.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">مجموع الأوزان لا يساوي 100% في {issues.length} مجموعة (Weights don't add up to 100% in {issues.length} group(s)). </span>
            <span className="text-muted-foreground">
              الحساب يطبّع الأوزان تلقائياً، لكن راجعها في تبويب البنود والأوزان. (They are normalized automatically; review them in the WBS tab.) —{" "}
              {issues.slice(0, 4).map((i) => `${describeIssue(i.parentId)}: ${i.sum.toFixed(2)}%`).join(" · ")}{issues.length > 4 ? " …" : ""}
            </span>
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="matrix">المصفوفة (Matrix)</TabsTrigger>
          <TabsTrigger value="wbs">البنود والأوزان (WBS & Weights)</TabsTrigger>
          <TabsTrigger value="units">الوحدات (Units)</TabsTrigger>
          <TabsTrigger value="certificates">المستخلصات (Certificates)</TabsTrigger>
        </TabsList>
        <TabsContent value="matrix" className="mt-3">
          <MatrixGrid projectId={projectId} projectName={projectName} model={model} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="wbs" className="mt-3">
          <WbsEditor projectId={projectId} projectName={projectName} model={model} />
        </TabsContent>
        <TabsContent value="units" className="mt-3">
          <UnitsTable projectId={projectId} projectName={projectName} model={model} />
        </TabsContent>
        <TabsContent value="certificates" className="mt-3">
          <PaymentCertificates projectId={projectId} projectName={projectName} model={model} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
