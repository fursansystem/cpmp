import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportsLibraryTab, isReportId, type ReportId } from "@/components/payments/reports-library-tab";
import { getJson, paymentsQuery, type PaymentsContext, type PaymentsOverview } from "@/components/payments/payments-common";

const param = (key: string) => {
  try {
    return new URLSearchParams(window.location.search).get(key);
  } catch {
    return null;
  }
};

// The reports page (the «Reports» item in the header). The Payments tabs link here with ?report=<id>.
export default function Reports() {
  const [projectId, setProjectId] = useState(param("project") || "all");
  const initialReport: ReportId = isReportId(param("report")) ? (param("report") as ReportId) : "aging";

  const { data: ctx } = useQuery<PaymentsContext>({
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

  const projectName = projectId === "all" ? "كل المشاريع" : ctx?.projects.find((p) => p.id === projectId)?.name ?? "";

  return (
    <div className="min-h-screen px-6 lg:px-10 pt-4 pb-10 space-y-5" data-testid="page-reports">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><BarChart3 className="w-6 h-6" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">التقارير <span className="text-muted-foreground font-medium">Reports</span></h1>
            <p className="text-sm text-muted-foreground">تقارير المدفوعات: الالتزامات، التدفق النقدي، مقاولو الباطن، أوامر الشراء، الرخص، الخصومات والموافقات</p>
          </div>
        </div>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-[260px]" data-testid="select-reports-project"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المشاريع</SelectItem>
            {ctx?.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!ctx || isLoading || !data ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <ReportsLibraryTab ctx={ctx} projectId={projectId} projectName={projectName} data={data} initialReport={initialReport} initialPoId={param("po") ?? undefined} />
      )}
    </div>
  );
}
