import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  ArrowRight,
  Warehouse as WarehouseIcon,
  Boxes,
  Truck,
  Send,
  ArrowLeftRight,
  BookOpen,
  AlertTriangle,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Search,
  CheckCircle2,
  XCircle,
  Ban,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MaterialIssueDialog } from "@/components/warehouse/material-issue-dialog";
import { StockAdjustmentDialog } from "@/components/warehouse/stock-adjustment-dialog";
import { StockTransferDialog } from "@/components/warehouse/stock-transfer-dialog";
import { DeliveriesList } from "@/components/warehouse/deliveries-list";
import { ApproverSettingsDialog } from "@/components/warehouse/approver-settings-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useTranslation, Trans } from "react-i18next";
import { enumText } from "@/lib/enums";
import { exportStockBalances } from "@/components/warehouse/warehouse-export";
import type { StockBalance, EnrichedStockMovement } from "@shared/schema";

const num = (v: unknown) =>
  Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ISSUE_STATUS_CLS: Record<string, string> = {
  pending_approval: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  issued: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

function movementLabel(type: string, t: (k: string) => string): string {
  if (["in", "out", "transfer_in", "transfer_out"].includes(type)) {
    return t(`ledger.movements.${type}`);
  }
  return enumText("manual_movement", type);
}

export default function ProjectWarehouse() {
  const { t } = useTranslation("warehouse");
  const { projectId } = useParams<{ projectId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("tab") || "overview";
    } catch {
      return "overview";
    }
  });
  const [balanceSearch, setBalanceSearch] = useState("");
  const [balanceWarehouse, setBalanceWarehouse] = useState("all");
  const [ledgerMaterial, setLedgerMaterial] = useState("all");
  const [issueOpen, setIssueOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [rejecting, setRejecting] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelling, setCancelling] = useState<any>(null);
  const [approversOpen, setApproversOpen] = useState(false);

  const { data: permissions } = useQuery<any>({
    queryKey: ["/api/projects", projectId, "inventory-permissions"],
    enabled: !!projectId,
  });
  const { data: warehouses = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "warehouses"],
    enabled: !!projectId,
  });
  const { data: balances = [], isLoading } = useQuery<StockBalance[]>({
    queryKey: ["/api/projects", projectId, "stock-balances"],
    enabled: !!projectId,
  });
  const { data: issuesData } = useQuery<any>({
    queryKey: ["/api/projects", projectId, "material-issues"],
    enabled: !!projectId,
  });
  const { data: movements = [] } = useQuery<EnrichedStockMovement[]>({
    queryKey: ["/api/projects", projectId, "stock-movements"],
    enabled: !!projectId,
  });
  const { data: transfers = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "stock-transfers"],
    enabled: !!projectId,
  });

  const issues: any[] = issuesData?.issues ?? [];
  const lowStock = balances.filter((b) => b.isLowStock);
  const conflicts = balances.filter((b) => b.hasUnitConflict);
  const pendingIssues = issues.filter((i) => i.status === "pending_approval");

  const filteredBalances = useMemo(() => {
    const q = balanceSearch.trim().toLowerCase();
    return balances.filter((b) => !q || b.materialName.toLowerCase().includes(q));
  }, [balances, balanceSearch]);

  const { data: scopedBalances } = useQuery<StockBalance[]>({
    queryKey: ["/api/projects", projectId, "stock-balances", balanceWarehouse],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/stock-balances?warehouseId=${balanceWarehouse}`);
      return await res.json();
    },
    enabled: !!projectId && balanceWarehouse !== "all",
  });

  const shownBalances = balanceWarehouse === "all" ? filteredBalances : (scopedBalances ?? []).filter((b) => {
    const q = balanceSearch.trim().toLowerCase();
    return !q || b.materialName.toLowerCase().includes(q);
  });

  const filteredMovements = useMemo(
    () => (ledgerMaterial === "all" ? movements : movements.filter((m) => m.materialId === ledgerMaterial)),
    [movements, ledgerMaterial]
  );

  const refreshAll = () =>
    ["stock-balances", "stock-movements", "material-issues", "low-stock", "stock-transfers"].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, k] })
    );

  const issueAction = useMutation({
    mutationFn: async ({ id, action, body }: { id: string; action: string; body?: any }) => {
      const res = await apiRequest("POST", `/api/material-issues/${id}/${action}`, body);
      return await res.json();
    },
    onSuccess: (_d, v) => {
      refreshAll();
      setRejecting(null);
      setCancelling(null);
      setRejectReason("");
      const labels: Record<string, string> = {
        approve: t("issues.toasts.approved"),
        reject: t("issues.toasts.rejected"),
        cancel: t("issues.toasts.cancelled"),
      };
      toast({ title: labels[v.action] });
    },
    onError: (e: any) => toast({ title: t("issues.toasts.action_failed"), description: e?.message || t("issues.toasts.action_failed"), variant: "destructive" }),
  });

  const exportBalances = () => {
    exportStockBalances(shownBalances);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen px-6 lg:px-10 pt-4 pb-10 space-y-4">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const Kpi = ({ icon: Icon, label, value, tone }: any) => (
    <Card className="rounded-2xl border-border/60">
      <CardContent className="py-4 flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", tone)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground font-bold truncate">{label}</p>
          <p className="text-xl font-black">{value}</p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen px-4 lg:px-10 pt-4 pb-12 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}`)} className="rounded-xl gap-1.5 shrink-0">
            <ArrowRight className="w-4 h-4 ltr:rotate-180" />
            {t("back")}
          </Button>
          <h1 className="text-xl lg:text-2xl font-black flex items-center gap-2">
            <WarehouseIcon className="w-6 h-6 text-primary" />
            {t("title")}
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {permissions?.canIssue && (
            <Button onClick={() => setIssueOpen(true)} className="rounded-xl gap-1.5 font-bold">
              <Send className="w-4 h-4" />
              {t("actions.issue_materials")}
            </Button>
          )}
          {permissions?.canTransfer && warehouses.length > 1 && (
            <Button variant="outline" onClick={() => setTransferOpen(true)} className="rounded-xl gap-1.5 font-bold">
              <ArrowLeftRight className="w-4 h-4" />
              {t("actions.transfer")}
            </Button>
          )}
          {permissions?.canAdjust && (
            <Button variant="outline" onClick={() => setAdjustOpen(true)} className="rounded-xl gap-1.5 font-bold">
              <SlidersHorizontal className="w-4 h-4" />
              {t("actions.manual_movement")}
            </Button>
          )}
          {permissions?.canManageApprovers && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setApproversOpen(true)}
              title={t("actions.approvers_settings")}
              className="rounded-xl h-10 w-10"
            >
              <ShieldCheck className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-xl flex-wrap h-auto">
          <TabsTrigger value="overview" className="rounded-lg text-xs font-bold">{t("tabs.overview")}</TabsTrigger>
          <TabsTrigger value="balances" className="rounded-lg text-xs font-bold">{t("tabs.balances")}</TabsTrigger>
          <TabsTrigger value="deliveries" className="rounded-lg text-xs font-bold">{t("tabs.deliveries")}</TabsTrigger>
          <TabsTrigger value="issues" className="rounded-lg text-xs font-bold gap-1.5">
            {t("tabs.issues")}
            {pendingIssues.length > 0 && (
              <Badge className="rounded-full border-none bg-amber-500 text-white text-[9px] px-1.5 h-4">
                {pendingIssues.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="transfers" className="rounded-lg text-xs font-bold">{t("tabs.transfers")}</TabsTrigger>
          <TabsTrigger value="warehouses" className="rounded-lg text-xs font-bold">{t("tabs.warehouses")}</TabsTrigger>
          <TabsTrigger value="ledger" className="rounded-lg text-xs font-bold">{t("tabs.ledger")}</TabsTrigger>
        </TabsList>

        {/* ---------- Overview ---------- */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={Boxes} label={t("kpis.stocked_materials")} value={balances.length} tone="bg-primary/10 text-primary" />
            <Kpi icon={AlertTriangle} label={t("kpis.low_stock")} value={lowStock.length} tone="bg-amber-100 text-amber-700 dark:bg-amber-900/30" />
            <Kpi icon={ShieldCheck} label={t("kpis.pending_issues")} value={pendingIssues.length} tone="bg-blue-100 text-blue-700 dark:bg-blue-900/30" />
            <Kpi icon={WarehouseIcon} label={t("kpis.warehouses")} value={warehouses.length} tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30" />
          </div>

          {conflicts.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                <Trans
                  i18nKey="conflicts_alert"
                  t={t}
                  values={{ count: conflicts.length, items: conflicts.map((c) => c.materialName).join(", ") }}
                  components={[<span key="0" className="font-black" />]}
                />
              </p>
            </div>
          )}

          {lowStock.length > 0 && (
            <Card className="rounded-2xl border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-black flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  {t("low_stock_title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {lowStock.map((b) => (
                  <div key={b.materialId} className="flex items-center justify-between gap-3 rounded-xl border border-border/50 p-2.5">
                    <span className="text-xs font-bold truncate">{b.materialName}</span>
                    <span className="text-xs whitespace-nowrap">
                      <span className="font-black text-destructive">{num(b.balance)}</span>
                      <span className="text-muted-foreground"> / {b.minStockLevel} {b.unit}</span>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---------- Balances ---------- */}
        <TabsContent value="balances" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={balanceSearch}
                onChange={(e) => setBalanceSearch(e.target.value)}
                placeholder={t("balances.search_placeholder")}
                className="h-10 rounded-xl pe-9"
              />
            </div>
            <Select value={balanceWarehouse} onValueChange={setBalanceWarehouse}>
              <SelectTrigger className="h-10 rounded-xl w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("balances.all_warehouses")}</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportBalances} className="rounded-xl gap-1.5 font-bold text-xs h-10">
              <Download className="w-4 h-4" />
              {t("actions.export_excel")}
            </Button>
          </div>

          <Card className="rounded-2xl border-border/60 overflow-hidden">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-end text-[11px] font-black">{t("balances.table.material")}</TableHead>
                    <TableHead className="text-end text-[11px] font-black">{t("balances.table.unit")}</TableHead>
                    <TableHead className="text-end text-[11px] font-black">{t("balances.table.in")}</TableHead>
                    <TableHead className="text-end text-[11px] font-black">{t("balances.table.out")}</TableHead>
                    <TableHead className="text-end text-[11px] font-black">{t("balances.table.balance")}</TableHead>
                    <TableHead className="text-end text-[11px] font-black">{t("balances.table.min_stock")}</TableHead>
                    <TableHead className="text-end text-[11px] font-black">{t("balances.table.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shownBalances.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-xs text-muted-foreground">
                        {t("balances.empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    shownBalances.map((b) => (
                      <TableRow
                        key={`${b.materialId}-${b.warehouseId ?? "all"}`}
                        className="hover:bg-muted/20 cursor-pointer"
                        onClick={() => {
                          setLedgerMaterial(b.materialId);
                          setTab("ledger");
                        }}
                      >
                        <TableCell className="min-w-[200px]">
                          <div className="flex flex-col">
                            <span className="font-bold text-xs">{b.materialName}</span>
                            {b.hasUnitConflict && (
                              <span className="text-[10px] font-bold text-amber-600">{t("balances.unit_conflict")}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{b.unit}</TableCell>
                        <TableCell className="text-xs text-emerald-600 font-bold">{num(b.totalIn)}</TableCell>
                        <TableCell className="text-xs text-destructive font-bold">{num(b.totalOut)}</TableCell>
                        <TableCell className="text-sm font-black">{num(b.balance)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {b.minStockLevel > 0 ? b.minStockLevel : "—"}
                        </TableCell>
                        <TableCell>
                          {b.isLowStock ? (
                            <Badge className="rounded-full border-none bg-destructive/10 text-destructive text-[10px] font-bold">
                              {t("balances.low_stock")}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="rounded-full text-[10px] font-bold">{t("balances.normal")}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <p className="text-[11px] text-muted-foreground">{t("balances.ledger_hint")}</p>
        </TabsContent>

        {/* ---------- Deliveries ---------- */}
        <TabsContent value="deliveries" className="mt-4">
          <DeliveriesList projectId={projectId || ""} />
        </TabsContent>

        {/* ---------- Issues ---------- */}
        <TabsContent value="issues" className="mt-4 space-y-3">
          {/* Without this, vouchers would sit pending forever with no visible reason why. */}
          {pendingIssues.length > 0 && !permissions?.canApproveIssue && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300 flex-1">
                <Trans
                  i18nKey="issues.pending_notice"
                  t={t}
                  values={{ count: pendingIssues.length }}
                  components={[<span key="0" className="font-black" />]}
                />
                {permissions?.canManageApprovers && t("issues.pending_notice_manage")}
              </p>
              {permissions?.canManageApprovers && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setApproversOpen(true)}
                  className="rounded-lg h-8 text-xs font-bold shrink-0"
                >
                  {t("issues.configure_approvers")}
                </Button>
              )}
            </div>
          )}

          {issues.length === 0 ? (
            <Card className="rounded-2xl border-dashed">
              <CardContent className="py-12 flex flex-col items-center gap-2">
                <Send className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground font-bold">{t("issues.empty")}</p>
              </CardContent>
            </Card>
          ) : (
            issues.map((issue) => {
              const stCls = ISSUE_STATUS_CLS[issue.status] ?? "bg-muted";
              const stLabel = t("issues.status." + issue.status);
              return (
                <Card key={issue.id} className="rounded-2xl border-border/60">
                  <CardContent className="py-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="rounded-full border-none bg-primary/10 text-primary text-[11px] font-black">
                          {issue.issueNumber}
                        </Badge>
                        <Badge className={cn("rounded-full border-none text-[10px] font-bold", stCls)}>{stLabel}</Badge>
                        <span className="text-xs text-muted-foreground">{issue.issueDate}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {issue.status === "pending_approval" && permissions?.canApproveIssue && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => issueAction.mutate({ id: issue.id, action: "approve" })}
                              disabled={issueAction.isPending}
                              className="rounded-lg h-8 text-xs font-bold gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {t("issues.approve")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setRejecting(issue)}
                              className="rounded-lg h-8 text-xs font-bold gap-1 text-destructive"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              {t("issues.reject")}
                            </Button>
                          </>
                        )}
                        {["issued", "pending_approval"].includes(issue.status) && permissions?.canCancelIssue && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCancelling(issue)}
                            className="rounded-lg h-8 text-xs font-bold gap-1 text-muted-foreground"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            {t("issues.cancel")}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                      <span>{t("issues.recipient")} <span className="font-bold text-foreground">{issue.issuedTo}</span></span>
                      {issue.warehouseName && <span>{t("issues.warehouse")} {issue.warehouseName}</span>}
                      {issue.purpose && <span>{t("issues.purpose")} {issue.purpose}</span>}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {(issue.items ?? []).map((it: any) => (
                        <span key={it.id} className="text-[11px] bg-muted/50 rounded-lg px-2 py-1 font-medium">
                          {it.materialName}: <span className="font-black">{num(it.quantity)}</span> {it.unit}
                        </span>
                      ))}
                    </div>

                    {issue.status === "rejected" && issue.rejectionReason && (
                      <p className="text-[11px] text-destructive">{t("issues.rejection_reason", { reason: issue.rejectionReason })}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ---------- Transfers ---------- */}
        <TabsContent value="transfers" className="mt-4 space-y-3">
          {transfers.length === 0 ? (
            <Card className="rounded-2xl border-dashed">
              <CardContent className="py-12 flex flex-col items-center gap-2">
                <ArrowLeftRight className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground font-bold">{t("transfers.empty")}</p>
              </CardContent>
            </Card>
          ) : (
            transfers.map((tr) => (
              <Card key={tr.id} className="rounded-2xl border-border/60">
                <CardContent className="py-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge className="rounded-full border-none bg-primary/10 text-primary text-[11px] font-black">
                        {tr.transferNumber}
                      </Badge>
                      <span className="text-xs font-bold">
                        {tr.fromWarehouseName} <ArrowLeftRight className="w-3 h-3 inline mx-1" /> {tr.toWarehouseName}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{tr.transferDate}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(tr.items ?? []).map((it: any) => (
                      <span key={it.id} className="text-[11px] bg-muted/50 rounded-lg px-2 py-1 font-medium">
                        {it.materialName}: <span className="font-black">{num(it.quantity)}</span> {it.unit}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ---------- Warehouses ---------- */}
        <TabsContent value="warehouses" className="mt-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {warehouses.map((w) => (
              <Card key={w.id} className="rounded-2xl border-border/60">
                <CardContent className="py-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-sm truncate">{w.name}</span>
                    {w.isDefault && (
                      <Badge className="rounded-full border-none bg-primary/10 text-primary text-[10px] font-bold">
                        {t("warehouses_tab.default")}
                      </Badge>
                    )}
                  </div>
                  {w.code && <p className="text-[11px] text-muted-foreground">{w.code}</p>}
                  {w.location && <p className="text-[11px] text-muted-foreground">{w.location}</p>}
                  {w.keeperName && <p className="text-[11px] text-muted-foreground">{t("warehouses_tab.keeper", { name: w.keeperName })}</p>}
                  <div className="flex gap-3 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                    <span>{t("warehouses_tab.material_count", { count: w.materialCount })}</span>
                    <span>{t("warehouses_tab.movement_count", { count: w.movementCount })}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ---------- Ledger ---------- */}
        <TabsContent value="ledger" className="mt-4 space-y-3">
          <Select value={ledgerMaterial} onValueChange={setLedgerMaterial}>
            <SelectTrigger className="h-10 rounded-xl w-full md:w-[320px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("ledger.all_materials")}</SelectItem>
              {balances.map((b) => (
                <SelectItem key={b.materialId} value={b.materialId}>{b.materialName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Card className="rounded-2xl border-border/60 overflow-hidden">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-end text-[11px] font-black">{t("ledger.table.date")}</TableHead>
                    <TableHead className="text-end text-[11px] font-black">{t("ledger.table.material")}</TableHead>
                    <TableHead className="text-end text-[11px] font-black">{t("ledger.table.type")}</TableHead>
                    <TableHead className="text-end text-[11px] font-black">{t("ledger.table.quantity")}</TableHead>
                    <TableHead className="text-end text-[11px] font-black">{t("ledger.table.warehouse")}</TableHead>
                    <TableHead className="text-end text-[11px] font-black">{t("ledger.table.performed_by")}</TableHead>
                    <TableHead className="text-end text-[11px] font-black">{t("ledger.table.notes")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-xs text-muted-foreground">
                        {t("ledger.empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMovements.map((m) => (
                      <TableRow key={m.id} className="hover:bg-muted/20">
                        <TableCell className="text-xs whitespace-nowrap">{m.movementDate}</TableCell>
                        <TableCell className="text-xs font-bold min-w-[160px]">{m.materialName}</TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              "rounded-full border-none text-[10px] font-bold",
                              m.direction === "in"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                : "bg-destructive/10 text-destructive"
                            )}
                          >
                            {movementLabel(m.movementType, t)}
                          </Badge>
                        </TableCell>
                        <TableCell className={cn("text-xs font-black whitespace-nowrap", m.direction === "in" ? "text-emerald-600" : "text-destructive")}>
                          {m.direction === "in" ? "+" : "−"}{num(m.quantity)} {m.unit}
                        </TableCell>
                        <TableCell className="text-xs">{m.warehouseName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.performedByName ?? "—"}</TableCell>
                        <TableCell className="text-[11px] text-muted-foreground max-w-[220px] truncate">{m.notes ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ApproverSettingsDialog open={approversOpen} onOpenChange={setApproversOpen} projectId={projectId || ""} />
      <MaterialIssueDialog open={issueOpen} onOpenChange={setIssueOpen} projectId={projectId || ""} warehouses={warehouses} />
      <StockAdjustmentDialog open={adjustOpen} onOpenChange={setAdjustOpen} projectId={projectId || ""} warehouses={warehouses} />
      <StockTransferDialog open={transferOpen} onOpenChange={setTransferOpen} projectId={projectId || ""} warehouses={warehouses} />

      <AlertDialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("issues.reject_dialog.title", { number: rejecting?.issueNumber })}</AlertDialogTitle>
            <AlertDialogDescription>{t("issues.reject_dialog.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t("issues.reject_dialog.placeholder")}
            className="rounded-xl"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("issues.reject_dialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!rejectReason.trim()}
              onClick={(e) => {
                e.preventDefault();
                issueAction.mutate({ id: rejecting.id, action: "reject", body: { rejectionReason: rejectReason.trim() } });
              }}
            >
              {t("issues.reject_dialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("issues.cancel_dialog.title", { number: cancelling?.issueNumber })}</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelling?.status === "issued"
                ? t("issues.cancel_dialog.issued_description")
                : t("issues.cancel_dialog.pending_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("issues.cancel_dialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                issueAction.mutate({ id: cancelling.id, action: "cancel" });
              }}
            >
              {t("issues.cancel_dialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
