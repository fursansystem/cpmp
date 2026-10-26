import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BillRequestsTab } from "@/components/payments/bill-requests-tab";
import { OrdersTab, type OrderDraft } from "@/components/payments/orders-tab";
import { ClearancesTab, FinesTab, clearanceAttention } from "@/components/payments/clearances-fines-tab";
import { ReportsTab } from "@/components/payments/reports-tab";
import { getJson, paymentsQuery, type PaymentsContext, type PaymentsOverview } from "@/components/payments/payments-common";

const query = (key: string) => {
  try {
    return new URLSearchParams(window.location.search).get(key);
  } catch {
    return null;
  }
};

function CountBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return <Badge variant="secondary" className="ms-2 h-5 min-w-5 px-1.5 rounded-full bg-primary/15 text-primary">{n}</Badge>;
}

export default function Payments() {
  const [tab, setTab] = useState(query("tab") || "reports");
  const [projectId, setProjectId] = useState(query("project") || "all");
  const [draft, setDraft] = useState<OrderDraft | null>(null);

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
      <div className="px-6 lg:px-10 pt-4 pb-10 space-y-4">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const overview: PaymentsOverview = data ?? { billRequests: [], orders: [], clearances: [], fines: [] };
  const projectName = projectId === "all" ? "كل المشاريع" : ctx.projects.find((p) => p.id === projectId)?.name ?? "";

  // What is waiting on somebody, shown on the tabs
  const actionable = {
    bills: overview.billRequests.filter((b) => ["requested", "returned"].includes(b.status) || (ctx.perms.isAccounting && b.status === "submitted")).length,
    orders: overview.orders.filter((o) =>
      (ctx.perms.canApprove && o.status === "pending_approval") || (ctx.perms.isAccounting && o.status === "approved")).length,
    clearances: overview.clearances.filter((c) => clearanceAttention(c)).length,
    fines: overview.fines.filter((f) => ["open", "under_appeal"].includes(f.status) || (ctx.perms.canApprove && f.status === "waiver_requested")).length,
  };

  const startOrder = (d: OrderDraft) => {
    setDraft(d);
    setTab("orders");
  };

  return (
    <div className="min-h-screen px-6 lg:px-10 pt-4 pb-10 space-y-5" data-testid="page-payments">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Wallet className="w-6 h-6" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">المدفوعات <span className="text-muted-foreground font-medium">Payments</span></h1>
            <p className="text-sm text-muted-foreground">
              {ctx.perms.isAccounting ? "طلب أصول الفواتير، أوامر الدفع، المخالصات والغرامات" : "الرد على طلبات المحاسبة، ومتابعة المخالصات والغرامات"}
            </p>
          </div>
        </div>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-[260px]" data-testid="select-payments-project"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المشاريع</SelectItem>
            {ctx.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {ctx.projects.length === 0 ? (
        <p className="text-center text-muted-foreground py-20">لا توجد مشاريع متاحة لك.</p>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="reports">التقارير</TabsTrigger>
            <TabsTrigger value="bills">أصول الفواتير<CountBadge n={actionable.bills} /></TabsTrigger>
            <TabsTrigger value="orders">أوامر الدفع<CountBadge n={actionable.orders} /></TabsTrigger>
            <TabsTrigger value="clearances">المخالصات<CountBadge n={actionable.clearances} /></TabsTrigger>
            <TabsTrigger value="fines">الغرامات<CountBadge n={actionable.fines} /></TabsTrigger>
          </TabsList>

          <TabsContent value="reports"><ReportsTab projectId={projectId} projectName={projectName} /></TabsContent>

          {isLoading ? (
            <Skeleton className="h-96 rounded-2xl" />
          ) : (
            <>
              <TabsContent value="bills">
                <BillRequestsTab ctx={ctx} projectId={projectId} rows={overview.billRequests} orders={overview.orders} onCreateOrder={(id) => startOrder({ billRequestId: id })} />
              </TabsContent>
              <TabsContent value="orders">
                <OrdersTab ctx={ctx} projectId={projectId} data={overview} draft={draft} onDraftClose={() => setDraft(null)} onStartDraft={() => setDraft({})} />
              </TabsContent>
              <TabsContent value="clearances">
                <ClearancesTab ctx={ctx} projectId={projectId} rows={overview.clearances} orders={overview.orders} onRequestPayment={(id) => startOrder({ clearanceId: id })} />
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
