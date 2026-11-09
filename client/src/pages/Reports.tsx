import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BackButton } from "@/components/back-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportsLibraryTab, isReportId, type ReportId } from "@/components/payments/reports-library-tab";
import { getJson, paymentsQuery, type PaymentsContext, type PaymentsOverview } from "@/components/payments/payments-common";
import { useTranslation } from "react-i18next";

const param = (key: string) => {
  try {
    return new URLSearchParams(window.location.search).get(key);
  } catch {
    return null;
  }
};

// The reports page (the «Reports» item in the header). The Payments tabs link here with ?report=<id>.
export default function Reports() {
  const { t } = useTranslation("payments");
  const [projectId, setProjectId] = useState(param("project") || "all");
  // No ?report means the library itself: the reports are a browsable shelf, not a dropdown
  const initialReport: ReportId | null = isReportId(param("report")) ? (param("report") as ReportId) : null;

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

  const projectName = projectId === "all" ? t("common.all_projects") : ctx?.projects.find((p) => p.id === projectId)?.name ?? "";

  return (
    <div className="p-6 lg:p-8 space-y-6" data-testid="page-reports">
      <BackButton label={t("reports_page.back")} to={projectId === "all" ? "/payments" : `/payments?project=${projectId}`} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display mb-2">{t("reports_page.title")}</h1>
          <p className="text-muted-foreground">{t("reports_page.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-[260px]" data-testid="select-reports-project"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all_projects")}</SelectItem>
              {ctx?.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!ctx || isLoading || !data ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <ReportsLibraryTab ctx={ctx} projectId={projectId} projectName={projectName} data={data} initialReport={initialReport} initialPoId={param("po") ?? undefined} />
      )}
    </div>
  );
}
