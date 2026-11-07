import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, BarChart3, Wallet, Hourglass, FileText, Banknote, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/stat-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BillRequestsTab } from "@/components/payments/bill-requests-tab";
import { OrdersTab, type OrderDraft } from "@/components/payments/orders-tab";
import { FinesTab } from "@/components/payments/clearances-fines-tab";
import { OPEN_PERMIT } from "@shared/permits";
import { SubcontractorCertificatesTab } from "@/components/payments/subcontractor-certificates-tab";
import { ReportsTab } from "@/components/payments/reports-tab";
import type { ReportId } from "@/components/payments/reports-library-tab";
import { PaymentActionButtons } from "@/components/payments/payment-actions";
import { getJson, money, paymentsQuery, type PaymentsContext, type PaymentsOverview } from "@/components/payments/payments-common";

const query = (key: string) => {
  try {
    return new URLSearchParams(window.location.search).get(key);
  } catch {
    return null;
  }
};

// The report that belongs to a tab. It sits inside the tab and opens the Reports page on that report,
// for the project currently selected. mousedown is stopped so pressing it doesn't also switch tabs.
function TabReportIcon({ report, projectId, title }: { report: ReportId; projectId: string; title: string }) {
  const [, navigate] = useLocation();
  return (
    <span
      role="link"
      title={title}
      aria-label={title}
      className="ms-2 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/reports?report=${report}${projectId !== "all" ? `&project=${projectId}` : ""}`);
      }}
    >
      <BarChart3 className="w-3.5 h-3.5" />
    </span>
  );
}

function CountBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return <Badge variant="secondary" className="ms-2 h-5 min-w-5 px-1.5 rounded-full bg-primary/15 text-primary">{n}</Badge>;
}

export default function Payments() {
  const [, navigate] = useLocation();
  // Licences moved to their own section (الرخص والمعاملات); old links to the tab land there
  useEffect(() => {
    if (query("tab") === "clearances") navigate(`/permits${query("project") ? `?project=${query("project")}` : ""}`, { replace: true });
  }, []);
  const [tab, setTab] = useState(["reports", null, ""].includes(query("tab")) ? "dashboard" : (query("tab") as string)); // reports moved to /reports
  const [projectId, setProjectId] = useState(query("project") || "all");
  const [, navigate] = useLocation();
  // A notification can point at another tab or project while this page is already open
  const search = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(search);
    const wantedTab = params.get("tab");
    const wantedProject = params.get("project");
    if (wantedTab && !("reports" === wantedTab)) setTab(wantedTab);
    if (wantedProject) setProjectId(wantedProject);
  }, [search]);
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  // A bill request to open as soon as the أصول الفواتير tab shows (used when jumping from a payment order)
  const [focusBillId, setFocusBillId] = useState<string | null>(null);

  const { data: ctx, isLoading: ctxLoading } = useQuery<PaymentsContext>({
    queryKey: ["payments", "context"],
    queryFn: () => getJson("/api/payments/context"),
    meta: paymentsQuery,
  });

  const { data, isLoading } = useQuery<PaymentsOverview>({
    queryKey: ["payments", "overview", projectId],
    queryFn: () => getJson(`/api/payments/overview${projectId === "all" ? "" : `?projectId=${projectId}`}`),
    enabled: !!ctx,
    meta: paymentsQuery,
  });

  if (ctxLoading || !ctx) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const overview: PaymentsOverview = data ?? { billRequests: [], orders: [], subcontractorCertificates: [], subcontractors: [], chargebacks: [], permits: [], fines: [], purchaseOrders: [], suppliers: [] };
  const projectName = projectId === "all" ? "كل المشاريع" : ctx.projects.find((p) => p.id === projectId)?.name ?? "";

  // What is waiting on somebody, shown on the tabs
  const actionable = {
    // certificates waiting on this user: approvers decide, accounting pays what is approved
    subCerts: overview.subcontractorCertificates.filter((c) =>
      (ctx.perms.canApprove && c.status === "submitted") || (ctx.perms.isAccounting && c.status === "approved")).length,
    bills: overview.billRequests.filter((b) => ["requested", "returned"].includes(b.status) || (ctx.perms.isAccounting && b.status === "submitted")).length,
    orders: overview.orders.filter((o) =>
      (ctx.perms.canApprove && (o.status === "pending_approval" || o.status === "requested")) ||
      (ctx.perms.isAccounting && (o.status === "approved" || o.status === "request_approved"))).length,
    fines: overview.fines.filter((f) => ["open", "under_appeal"].includes(f.status) || (ctx.perms.canApprove && f.status === "waiver_requested")).length,
  };

  // The summary row above the tabs, for the project selected
  const stats = {
    waiting: actionable.bills + actionable.orders + actionable.subCerts + actionable.fines,
    openOrders: overview.orders.filter((o) => ["requested", "request_approved", "pending_approval", "approved"].includes(o.status)).length,
    paid: overview.orders.filter((o) => o.status === "paid").reduce((sum, o) => sum + Number(o.amount ?? 0), 0),
    attention: actionable.fines,
  };

  // Licence / transaction fees nobody has raised an order for yet
  const unpaidPermitFees = overview.permits.filter((p) =>
    Number(p.feeAmount) > 0 && !p.feePaid && (OPEN_PERMIT as readonly string[]).includes(p.status) &&
    !overview.orders.some((o) => o.permitTransactionId === p.id && !["rejected", "cancelled"].includes(o.status)));

  const startOrder = (d: OrderDraft) => {
    setDraft(d);
    setTab("orders");
  };

  return (
    <div className="p-6 lg:p-8 space-y-6" data-testid="page-payments">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-8 w-8 p-0 md:h-auto md:w-auto md:px-3 md:py-2 text-muted-foreground hover:text-foreground shrink-0 shadow-sm"
        onClick={() => navigate(projectId === "all" ? "/projects" : `/projects/${projectId}`)}
        data-testid="button-back-to-project"
      >
        <ArrowLeft className="w-5 h-5 md:mr-2" />
        <span className="hidden md:inline font-semibold">{projectId === "all" ? "Back to Projects" : "Back to Project"}</span>
      </Button>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display mb-2">المدفوعات</h1>
          <p className="text-muted-foreground">
            {ctx.perms.isAccounting ? "طلب أصول الفواتير، أوامر الدفع، مستخلصات الباطن والخصومات" : "الرد على طلبات المحاسبة، ومتابعة الخصومات"}
          </p>
        </div>
        {ctx.projects.length > 0 && (
          <div className="flex items-center gap-2">
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-[260px]" data-testid="select-payments-project"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المشاريع</SelectItem>
                {ctx.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {ctx.projects.length > 0 && !isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="بانتظار إجراء منك" value={stats.waiting} icon={Hourglass} />
          <StatCard title="أوامر دفع مفتوحة" value={stats.openOrders} icon={FileText} />
          <StatCard title="المصروف" value={money(stats.paid)} icon={Banknote} />
          <StatCard title="خصومات تحتاج انتباه" value={stats.attention} icon={ShieldAlert} />
        </div>
      )}

      {unpaidPermitFees.length > 0 && (
        <Card className="rounded-2xl border-dashed border-primary/30 bg-primary/5">
          <div className="p-4 flex flex-wrap items-center gap-3">
            <Landmark className="w-5 h-5 text-primary" />
            <div className="flex-1 min-w-[220px] text-sm">
              <span className="font-semibold">{unpaidPermitFees.length} رسوم رخص ومعاملات بانتظار السداد</span>
              <span className="text-muted-foreground"> · {money(unpaidPermitFees.reduce((s, p) => s + Number(p.feeAmount), 0))} — {ctx.perms.isAccounting ? "ارفع أمر دفع من أوامر الدفع (مصدر: رسوم رخصة / معاملة)." : "تُطلب من صفحة المعاملة."}</span>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/permits${projectId !== "all" ? `?project=${projectId}` : ""}`}>الرخص والمعاملات <ArrowLeft className="w-4 h-4 ms-1" /></Link>
            </Button>
          </div>
        </Card>
      )}

      {ctx.projects.length === 0 ? (
        <Card>
          <div className="p-12 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Wallet className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold font-display">لا توجد مشاريع متاحة لك</h3>
              <p className="text-sm text-muted-foreground mt-1">تظهر المدفوعات هنا عندما تُضاف إلى مشروع.</p>
            </div>
          </div>
        </Card>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="dashboard">لوحة المتابعة<TabReportIcon report="approvals" projectId={projectId} title="تقرير: أداء الموافقات" /></TabsTrigger>
            <TabsTrigger value="bills">أصول الفواتير<CountBadge n={actionable.bills} /><TabReportIcon report="aging" projectId={projectId} title="تقرير: أعمار الالتزامات" /></TabsTrigger>
            <TabsTrigger value="orders">أوامر الدفع<CountBadge n={actionable.orders} /><TabReportIcon report="cashflow" projectId={projectId} title="تقرير: تدفق نقدي متوقع" /></TabsTrigger>
            <TabsTrigger value="subcontractors">مستخلصات الباطن<CountBadge n={actionable.subCerts} /><TabReportIcon report="sub" projectId={projectId} title="تقرير: كشف مقاول باطن" /></TabsTrigger>
            <TabsTrigger value="fines">الخصومات<CountBadge n={actionable.fines} /><TabReportIcon report="deductions" projectId={projectId} title="تقرير: الخصومات حسب الجهة والمتحمّل" /></TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><ReportsTab projectId={projectId} projectName={projectName} /></TabsContent>

          {isLoading ? (
            <Skeleton className="h-96 rounded-2xl" />
          ) : (
            <>
              <TabsContent value="bills">
                <BillRequestsTab ctx={ctx} projectId={projectId} rows={overview.billRequests} orders={overview.orders} purchaseOrders={overview.purchaseOrders} chargebacks={overview.chargebacks ?? []} focusId={focusBillId} onFocusHandled={() => setFocusBillId(null)} onCreateOrder={(id) => startOrder({ billRequestId: id })} />
              </TabsContent>
              <TabsContent value="orders">
                <OrdersTab ctx={ctx} projectId={projectId} data={overview} draft={draft} onDraftClose={() => setDraft(null)} onStartDraft={() => setDraft({})} onOpenBillRequest={(id) => { setFocusBillId(id); setTab("bills"); }} requesterAction={<PaymentActionButtons context={{ projectId: projectId === "all" ? "" : projectId }} size="default" />} />
              </TabsContent>
              <TabsContent value="subcontractors">
                <SubcontractorCertificatesTab ctx={ctx} projectId={projectId} rows={overview.subcontractorCertificates} chargebacks={overview.chargebacks ?? []} fines={overview.fines} subcontractors={overview.subcontractors ?? []} orders={overview.orders} onRequestOrder={(id) => startOrder({ subcontractorCertificateId: id })} />
              </TabsContent>
              <TabsContent value="fines">
                <FinesTab ctx={ctx} projectId={projectId} rows={overview.fines} orders={overview.orders} onRequestPayment={(id) => startOrder({ fineId: id })} />
              </TabsContent>
            </>
          )}
        </Tabs>
      )}
    </div>
  );
}
