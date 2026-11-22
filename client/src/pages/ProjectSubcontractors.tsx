import { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileSignature,
  FileText,
  HandCoins,
  HardHat,
  PackageOpen,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  User,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  getJson,
  money,
  fmtDate,
  errorMessage,
  invalidatePayments,
  paymentsQuery,
  StatusBadge,
  type PaymentsContext,
  type PaymentsOverview,
} from "@/components/payments/payments-common";
import {
  SubcontractorDialog,
  SubcontractorContractDialog,
  GroupedLocationBadges,
  type SubcontractorContractRow,
  type SubcontractorRow,
} from "@/components/payments/subcontractor-select";
import { SubcontractorCertificatesTab, SubCertDialog } from "@/components/payments/subcontractor-certificates-tab";
import { ChargebacksPanel } from "@/components/payments/chargebacks";
import { MaterialIssueDialog } from "@/components/warehouse/material-issue-dialog";
import type { Project } from "@shared/schema";

const num = (v: unknown) => Number(v ?? 0) || 0;

export default function ProjectSubcontractors() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const [, navigate] = useLocation();
  const { t, i18n } = useTranslation(["payments", "warehouse", "projects"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAr = i18n.language?.startsWith("ar");

  // Main navigation tab
  const [tab, setTab] = useState(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return t && ["directory", "contracts", "certificates", "issues", "deductions"].includes(t) ? t : "directory";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSubId, setFilterSubId] = useState("all");
  const [filterContractId, setFilterContractId] = useState("all");

  // Dialog states
  const [addingSub, setAddingSub] = useState(false);
  const [editingSub, setEditingSub] = useState<SubcontractorRow | null>(null);
  const [addingContract, setAddingContract] = useState(false);
  const [targetSubIdForContract, setTargetSubIdForContract] = useState<string | undefined>(undefined);
  const [editingContract, setEditingContract] = useState<SubcontractorContractRow | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [addingCert, setAddingCert] = useState(false);
  const [targetSubIdForCert, setTargetSubIdForCert] = useState<string | undefined>(undefined);

  // Selected Subcontractor Profile Drawer / Modal
  const [selectedProfileSub, setSelectedProfileSub] = useState<SubcontractorRow | null>(null);
  const [selectedContract, setSelectedContract] = useState<SubcontractorContractRow | null>(null);

  const removeContract = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/payments/subcontractor-contracts/${id}`),
    onSuccess: () => {
      invalidatePayments(queryClient);
      toast({ title: isAr ? "تم حذف العقد بنجاح" : "Contract deleted successfully" });
    },
    onError: (e) =>
      toast({
        title: isAr ? "تعذر حذف العقد" : "Failed to delete contract",
        description: errorMessage(e),
        variant: "destructive",
      }),
  });

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: ctx } = useQuery<PaymentsContext>({
    queryKey: ["payments", "context"],
    queryFn: () => getJson("/api/payments/context"),
    meta: paymentsQuery,
  });

  const canManageContract = Boolean(ctx?.perms?.isAccounting || ctx?.perms?.canApprove);

  const { data: overview, isLoading } = useQuery<PaymentsOverview>({
    queryKey: ["payments", "overview", projectId],
    queryFn: () => getJson(`/api/payments/overview?projectId=${projectId}`),
    enabled: !!projectId,
    meta: paymentsQuery,
  });

  const { data: issuesData } = useQuery<any>({
    queryKey: ["/api/projects", projectId, "material-issues"],
    enabled: !!projectId,
  });

  const materialIssues: any[] = useMemo(
    () => (Array.isArray(issuesData) ? issuesData : Array.isArray(issuesData?.issues) ? issuesData.issues : []),
    [issuesData]
  );

  const { data: warehouses = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "warehouses"],
    enabled: !!projectId,
  });

  const { data: workLocations = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "work-locations"],
    enabled: !!projectId,
  });

  const subcontractors = overview?.subcontractors ?? [];
  const allContracts: SubcontractorContractRow[] = overview?.subcontractorContracts ?? [];
  const allCertificates = overview?.subcontractorCertificates ?? [];
  const allOrders = overview?.orders ?? [];
  const allChargebacks = overview?.chargebacks ?? [];
  const allFines = useMemo(
    () => (overview?.fines ?? []).filter((f: any) => f.liableParty === "subcontractor" || f.subcontractorId),
    [overview?.fines]
  );

  // Delete Subcontractor Mutation
  const deleteSub = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/payments/subcontractors/${id}`),
    onSuccess: () => {
      invalidatePayments(queryClient);
      toast({ title: isAr ? "تم حذف المقاول بنجاح" : "Subcontractor deleted" });
      if (selectedProfileSub) setSelectedProfileSub(null);
    },
    onError: (e) => toast({ title: t("payments:errors.delete_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  // Filter contracts, certificates, issues, chargebacks by selected subcontractor / contract
  const filteredContracts = useMemo(() => {
    return allContracts.filter((c) => {
      if (filterSubId !== "all" && c.subcontractorId !== filterSubId) return false;
      if (filterContractId !== "all" && c.id !== filterContractId) return false;
      return true;
    });
  }, [allContracts, filterSubId, filterContractId]);

  const filteredCertificates = useMemo(() => {
    return allCertificates.filter((c: any) => {
      if (filterSubId !== "all" && c.subcontractorId !== filterSubId) return false;
      if (filterContractId !== "all" && c.contractId !== filterContractId) return false;
      return true;
    });
  }, [allCertificates, filterSubId, filterContractId]);

  const subMaterialIssues = useMemo(() => {
    return materialIssues.filter((m: any) => {
      if (m.recipientType && m.recipientType !== "subcontractor") return false;
      if (filterSubId !== "all" && m.subcontractorId !== filterSubId) return false;
      if (filterContractId !== "all" && m.contractId !== filterContractId) return false;
      return true;
    });
  }, [materialIssues, filterSubId, filterContractId]);

  const filteredChargebacks = useMemo(() => {
    return allChargebacks.filter((c: any) => {
      if (filterSubId !== "all" && c.subcontractorId !== filterSubId) return false;
      return true;
    });
  }, [allChargebacks, filterSubId]);

  const filteredFines = useMemo(() => {
    return allFines.filter((f: any) => {
      if (filterSubId !== "all" && f.subcontractorId !== filterSubId) return false;
      return true;
    });
  }, [allFines, filterSubId]);

  const subPaymentOrders = useMemo(() => {
    const filteredCertIds = new Set(filteredCertificates.map((c: any) => c.id));
    return allOrders.filter((o: any) => {
      if (filterContractId !== "all") {
        if (o.subcontractorContractId === filterContractId) return true;
        if (o.subcontractorCertificateId && filteredCertIds.has(o.subcontractorCertificateId)) return true;
        return false;
      }
      if (filterSubId !== "all") {
        if (o.subcontractorId === filterSubId) return true;
        if (o.subcontractorCertificateId && filteredCertIds.has(o.subcontractorCertificateId)) return true;
        if (o.sourceType === "subcontractor" && o.sourceId === filterSubId) return true;
        const sub = subcontractors.find((s) => s.id === filterSubId);
        if (o.purpose === "subcontractor" && sub && o.payeeName === sub.name) return true;
        return false;
      }
      return (
        o.subcontractorId ||
        o.subcontractorCertificateId ||
        o.sourceType === "subcontractor" ||
        o.purpose === "subcontractor" ||
        subcontractors.some((s) => s.name === o.payeeName)
      );
    });
  }, [allOrders, filterSubId, filterContractId, filteredCertificates, subcontractors]);

  // Overall KPIs
  const stats = useMemo(() => {
    const totalContractValue = filteredContracts.reduce((s, c) => s + num(c.contractValue), 0);
    const activeCount = filteredContracts.filter((c) => c.status === "active").length;
    const settledCount = filteredContracts.filter((c) => c.status === "settled").length;
    const certifiedTotal = filteredCertificates
      .filter((c: any) => ["approved", "paid"].includes(c.status))
      .reduce((s: number, c: any) => s + num(c.grossAmount), 0);
    const netPayableTotal = filteredCertificates
      .filter((c: any) => ["approved", "paid"].includes(c.status))
      .reduce((s: number, c: any) => s + num(c.netPayable), 0);

    // Direct orders (advances, direct payments) that do NOT have a linked certificate
    const directOrdersPaidTotal = subPaymentOrders
      .filter((o: any) => o.status === "paid" && !o.subcontractorCertificateId)
      .reduce((s: number, o: any) => s + num(o.amount), 0);

    const ordersPaidTotal = subPaymentOrders
      .filter((o: any) => o.status === "paid")
      .reduce((s: number, o: any) => s + num(o.amount), 0);

    const ordersApprovedTotal = subPaymentOrders
      .filter((o: any) => ["request_approved", "approved", "pending_approval"].includes(o.status))
      .reduce((s: number, o: any) => s + num(o.amount), 0);

    // Paid certs with no linked order in subPaymentOrders (to avoid double-counting)
    const unlinkedPaidCertsTotal = filteredCertificates
      .filter((c: any) => c.status === "paid" && !subPaymentOrders.some((o: any) => o.subcontractorCertificateId === c.id && o.status === "paid"))
      .reduce((s: number, c: any) => s + num(c.netPayable), 0);

    const netDisbursedTotal = ordersPaidTotal + unlinkedPaidCertsTotal;
    const totalDisbursedAndCertified = certifiedTotal + directOrdersPaidTotal;
    const remainingContract = Math.max(0, totalContractValue - totalDisbursedAndCertified);

    const openDeductionsTotal =
      filteredChargebacks
        .filter((c: any) => ["proposed", "approved"].includes(c.status))
        .reduce((s: number, c: any) => s + num(c.amount), 0) +
      filteredFines
        .filter((f: any) => f.status === "open")
        .reduce((s: number, f: any) => s + Math.max(0, num(f.amount) - num(f.paidAmount)), 0);

    return {
      totalContractValue,
      activeCount,
      settledCount,
      certifiedTotal,
      netPayableTotal,
      directOrdersPaidTotal,
      ordersPaidTotal,
      ordersApprovedTotal,
      netDisbursedTotal,
      totalDisbursedAndCertified,
      remainingContract,
      issuesCount: subMaterialIssues.filter((m: any) => m.status !== "cancelled" && m.status !== "rejected").length,
      openDeductionsTotal,
    };
  }, [filteredContracts, filteredCertificates, subPaymentOrders, subMaterialIssues, filteredChargebacks, filteredFines]);

  // Subcontractor Metrics Helper
  const getSubMetrics = (subId: string) => {
    const sub = subcontractors.find((s) => s.id === subId);
    const subName = sub?.name ?? "";
    const subContracts = allContracts.filter((c) => c.subcontractorId === subId);
    const activeContracts = subContracts.filter((c) => c.status === "active");
    const settledContracts = subContracts.filter((c) => c.status === "settled");
    const totalVal = subContracts.reduce((sum, c) => sum + num(c.contractValue), 0);

    const subCerts = allCertificates.filter((c: any) => c.subcontractorId === subId && c.status !== "cancelled");
    const approvedVal = subCerts
      .filter((c: any) => ["approved", "paid"].includes(c.status))
      .reduce((sum: number, c: any) => sum + num(c.grossAmount), 0);

    const subOrders = allOrders.filter(
      (o: any) =>
        o.subcontractorId === subId ||
        (o.sourceType === "subcontractor" && o.sourceId === subId) ||
        (o.purpose === "subcontractor" && (o.subcontractorId === subId || (subName && o.payeeName === subName)))
    );

    // 1) All actual cash paid to this subcontractor via orders:
    const ordersPaidVal = subOrders
      .filter((o: any) => o.status === "paid")
      .reduce((sum: number, o: any) => sum + num(o.amount), 0);

    // 2) Any paid certificate without a linked paid order in subOrders (to prevent double-counting):
    const unlinkedCertPaidVal = subCerts
      .filter((c: any) => c.status === "paid" && !subOrders.some((o: any) => o.subcontractorCertificateId === c.id && o.status === "paid"))
      .reduce((sum: number, c: any) => sum + num(c.netPayable), 0);

    // Actual net cash disbursed to subcontractor:
    const netPaidVal = ordersPaidVal + unlinkedCertPaidVal;

    // Direct orders (advances / direct payments) that are NOT linked to any certificate:
    const directOrdersPaidVal = subOrders
      .filter((o: any) => o.status === "paid" && !o.subcontractorCertificateId)
      .reduce((sum: number, o: any) => sum + num(o.amount), 0);

    const ordersApprovedVal = subOrders
      .filter((o: any) => ["request_approved", "approved", "pending_approval"].includes(o.status))
      .reduce((sum: number, o: any) => sum + num(o.amount), 0);

    // Total recognized/committed on contracts = approved certificate works (gross) + direct un-certified advances:
    const totalRecognizedVal = approvedVal + directOrdersPaidVal;
    const remainingVal = Math.max(0, totalVal - totalRecognizedVal);
    const progressPct = totalVal > 0 ? Math.min(100, (totalRecognizedVal / totalVal) * 100) : 0;

    const issues = materialIssues.filter(
      (m: any) => m.subcontractorId === subId && m.status !== "cancelled" && m.status !== "rejected"
    );

    const chargebacks = allChargebacks.filter((cb: any) => cb.subcontractorId === subId && cb.status !== "rejected");
    const fines = allFines.filter((f: any) => f.subcontractorId === subId);
    const openDeductions =
      chargebacks
        .filter((cb: any) => ["proposed", "approved"].includes(cb.status))
        .reduce((s: number, cb: any) => s + num(cb.amount), 0) +
      fines
        .filter((f: any) => f.status === "open")
        .reduce((s: number, f: any) => s + Math.max(0, num(f.amount) - num(f.paidAmount)), 0);

    return {
      subContracts,
      activeContracts,
      settledContracts,
      totalVal,
      approvedVal,
      ordersApprovedVal,
      certPaidVal: unlinkedCertPaidVal,
      ordersPaidVal,
      netPaidVal,
      remainingVal,
      progressPct,
      subCerts,
      subOrders,
      issues,
      chargebacks,
      fines,
      openDeductions,
    };
  };

  // Filtered subcontractors for Search bar
  const searchedSubcontractors = useMemo(() => {
    if (!searchQuery.trim()) return subcontractors;
    const q = searchQuery.toLowerCase();
    return subcontractors.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.scope && s.scope.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q)) ||
        (s.contactPerson && s.contactPerson.toLowerCase().includes(q))
    );
  }, [subcontractors, searchQuery]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/projects/${projectId}`)}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
            {isAr ? "العودة للمشروع" : "Back to Project"}
          </Button>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
              <HardHat className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">
                {isAr ? "مقاولو الباطن والعقود" : "Subcontractors & Contracts"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {project?.name || ""} —{" "}
                {isAr
                  ? "إدارة بطاقات المقاولين، العقود، المباني المسندة، المستخلصات والمخالصات"
                  : "Manage subcontractor cards, contracts, assigned buildings, certificates & clearances"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIssueOpen(true)}>
            <PackageOpen className="w-4 h-4 me-1 text-primary" />
            {isAr ? "سند صرف مواد" : "Issue Materials"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTargetSubIdForContract(undefined);
              setAddingContract(true);
            }}
          >
            <FileSignature className="w-4 h-4 me-1" />
            {isAr ? "عقد جديد" : "New Contract"}
          </Button>
          <Button size="sm" onClick={() => setAddingSub(true)}>
            <Plus className="w-4 h-4 me-1" />
            {isAr ? "مقاول باطن جديد" : "New Subcontractor"}
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-none shadow-md">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-semibold">
                {isAr ? "مقاولو الباطن والعقود" : "Subcontractors & Contracts"}
              </p>
              <div className="text-2xl font-black tabular-nums">{subcontractors.length}</div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="text-emerald-600 font-semibold">
                  {stats.activeCount} {isAr ? "عقد نشط" : "Active"}
                </span>
                <span>·</span>
                <span>
                  {stats.settledCount} {isAr ? "مُخالص" : "Settled"}
                </span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <HardHat className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none shadow-md">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-semibold">
                {isAr ? "إجمالي قيمة العقود" : "Total Contracts Value"}
              </p>
              <div className="text-2xl font-black tabular-nums text-primary">{money(stats.totalContractValue)}</div>
              <p className="text-[11px] text-muted-foreground">
                {isAr ? "المتبقي من العقود:" : "Remaining:"}{" "}
                <b className="text-foreground tabular-nums">{money(stats.remainingContract)}</b>
              </p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none shadow-md">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-semibold">
                {isAr ? "المستخلصات والدفعات المعتمدة" : "Approved Certs & Payments"}
              </p>
              <div className="text-2xl font-black tabular-nums text-emerald-600">
                {money(stats.totalDisbursedAndCertified)}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {stats.directOrdersPaidTotal > 0 && stats.certifiedTotal > 0 ? (
                  <span>
                    {isAr ? "مستخلصات:" : "Certs:"} {money(stats.certifiedTotal)} · {isAr ? "دفعات مقدمة:" : "Advances:"}{" "}
                    <b className="text-foreground tabular-nums">{money(stats.directOrdersPaidTotal)}</b>
                  </span>
                ) : stats.directOrdersPaidTotal > 0 ? (
                  <span>
                    {isAr ? "دفعات مقدمة:" : "Advances:"}{" "}
                    <b className="text-foreground tabular-nums">{money(stats.directOrdersPaidTotal)}</b>
                  </span>
                ) : (
                  <span>
                    {isAr ? "الصافي المستحق:" : "Net Payable:"}{" "}
                    <b className="text-foreground tabular-nums">{money(stats.netPayableTotal)}</b>
                  </span>
                )}
              </p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none shadow-md">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-semibold">
                {isAr ? "صرف المواد والخصومات" : "Material Issues & Deductions"}
              </p>
              <div className="text-2xl font-black tabular-nums text-amber-600">
                {stats.issuesCount} <span className="text-xs font-normal">{isAr ? "سند صرف" : "vouchers"}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isAr ? "خصومات مفتوحة:" : "Open Deductions:"}{" "}
                <b className="text-destructive tabular-nums">{money(stats.openDeductionsTotal)}</b>
              </p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <PackageOpen className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading || !ctx ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          {/* Main Top Navigation Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
            <TabsList className="h-auto flex-wrap justify-start gap-1 p-1 bg-muted/60 rounded-2xl">
              <TabsTrigger value="directory" className="gap-1.5 rounded-xl px-3 py-1.5 font-bold">
                <HardHat className="w-4 h-4 text-primary" />
                {isAr ? "بطاقات مقاولي الباطن" : "Subcontractors Directory"}
                <Badge variant="secondary" className="ms-1 text-[10px] px-1.5 py-0 h-4">
                  {subcontractors.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="contracts" className="gap-1.5 rounded-xl px-3 py-1.5 font-bold">
                <FileSignature className="w-4 h-4" />
                {isAr ? "سجل العقود والمباني" : "Contracts & Buildings"}
                <Badge variant="secondary" className="ms-1 text-[10px] px-1.5 py-0 h-4">
                  {allContracts.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="certificates" className="gap-1.5 rounded-xl px-3 py-1.5 font-bold">
                <Receipt className="w-4 h-4" />
                {isAr ? "المستخلصات والدفعات" : "Certificates & Payments"}
                <Badge variant="secondary" className="ms-1 text-[10px] px-1.5 py-0 h-4">
                  {filteredCertificates.length + subPaymentOrders.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="issues" className="gap-1.5 rounded-xl px-3 py-1.5 font-bold">
                <PackageOpen className="w-4 h-4" />
                {isAr ? "سندات صرف المواد" : "Material Issues"}
                <Badge variant="secondary" className="ms-1 text-[10px] px-1.5 py-0 h-4">
                  {subMaterialIssues.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="deductions" className="gap-1.5 rounded-xl px-3 py-1.5 font-bold">
                <ShieldAlert className="w-4 h-4" />
                {isAr ? "الخصومات وتحميل الفواتير" : "Deductions & Chargebacks"}
                <Badge variant="secondary" className="ms-1 text-[10px] px-1.5 py-0 h-4">
                  {allChargebacks.length + allFines.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            {/* Quick Search */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder={isAr ? "بحث بالاسم، التخصص، الهاتف..." : "Search sub, trade, phone..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 ps-9 pe-3 rounded-xl border border-border/80 bg-background text-xs shadow-xs focus:outline-hidden focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* ======================================================== */}
          {/* TAB 1: Subcontractors Cards Grid (Main Hero View)        */}
          {/* ======================================================== */}
          <TabsContent value="directory" className="space-y-6">
            {searchedSubcontractors.length === 0 ? (
              <Card className="rounded-2xl p-12 text-center border-dashed">
                <div className="max-w-md mx-auto space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto">
                    <HardHat className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-base">
                    {searchQuery
                      ? isAr
                        ? "لم يتم العثور على مقاول يطابق بحثك"
                        : "No subcontractors matched your search"
                      : isAr
                        ? "لا يوجد مقاولو باطن مسجلون في هذا المشروع بعد"
                        : "No subcontractors added to this project yet"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "أضف مقاول باطن جديد لبدء تسجيل العقود، صرف المواد، وإصدار المستخلصات."
                      : "Add a subcontractor to start assigning contracts, issuing materials, and certificates."}
                  </p>
                  <Button size="sm" onClick={() => setAddingSub(true)} className="rounded-xl mt-2">
                    <Plus className="w-4 h-4 me-1" />
                    {isAr ? "إضافة مقاول باطن" : "Add Subcontractor"}
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {searchedSubcontractors.map((sub) => {
                  const m = getSubMetrics(sub.id);
                  return (
                    <Card
                      key={sub.id}
                      className="group rounded-3xl border border-border/80 bg-card hover:border-primary/40 hover:shadow-xl transition-all duration-300 flex flex-col justify-between overflow-hidden"
                    >
                      <CardContent className="p-5 space-y-4">
                        {/* Subcontractor Card Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 font-black text-base shadow-inner group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                              {sub.name.slice(0, 2)}
                            </div>
                            <div className="min-w-0 space-y-1">
                              <h3 className="font-black text-base truncate group-hover:text-primary transition-colors">
                                {sub.name}
                              </h3>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {sub.scope ? (
                                  <Badge variant="secondary" className="text-[11px] font-semibold bg-primary/5 text-primary">
                                    {sub.scope}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                    {isAr ? "بدون تخصص" : "No trade"}
                                  </Badge>
                                )}
                                {sub.taxNumber && (
                                  <span className="text-[10px] font-mono text-muted-foreground">
                                    ضريبي: {sub.taxNumber}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Quick Actions Menu */}
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
                              onClick={() => setEditingSub(sub)}
                              title={isAr ? "تعديل بيانات المقاول" : "Edit Subcontractor"}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            {ctx.perms.canApprove && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 rounded-xl text-muted-foreground hover:text-destructive"
                                disabled={deleteSub.isPending}
                                onClick={() => {
                                  if (confirm(isAr ? "هل أنت متأكد من حذف هذا المقاول؟" : "Delete this subcontractor?")) {
                                    deleteSub.mutate(sub.id);
                                  }
                                }}
                                title={isAr ? "حذف" : "Delete"}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Contact details */}
                        {(sub.contactPerson || sub.phone) && (
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1 border-t border-border/40">
                            {sub.contactPerson && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3 text-primary/70" />
                                {sub.contactPerson}
                              </span>
                            )}
                            {sub.phone && (
                              <span className="flex items-center gap-1 font-mono">
                                <Phone className="w-3 h-3 text-primary/70" />
                                {sub.phone}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Financial Metrics Strip inside Card */}
                        <div className="rounded-2xl bg-muted/40 p-3 space-y-2.5 border border-border/50">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground block text-[11px]">
                                {isAr ? "العقود المسندة" : "Contracts"}
                              </span>
                              <b className="tabular-nums font-bold">
                                {m.subContracts.length}{" "}
                                <span className="font-normal text-muted-foreground text-[10px]">
                                  ({m.activeContracts.length} {isAr ? "نشط" : "active"} / {m.settledContracts.length} {isAr ? "مُخالص" : "settled"})
                                </span>
                              </b>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[11px]">
                                {isAr ? "إجمالي العقود" : "Total Contracts"}
                              </span>
                              <b className="tabular-nums font-bold text-primary">{money(m.totalVal)}</b>
                            </div>
                          </div>

                          {/* Progress Bar: Certified / Paid vs Contract Value */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-muted-foreground">
                                {m.ordersPaidVal > 0 && m.approvedVal > 0
                                  ? (isAr ? "المنصرف والمعتمد:" : "Paid & Certified:")
                                  : m.ordersPaidVal > 0
                                  ? (isAr ? "الصافي المصروف (دفعات):" : "Net Paid (Orders):")
                                  : (isAr ? "المعتمد بالمستخلصات:" : "Certified:")}{" "}
                                <b className="text-emerald-600 tabular-nums">{money(m.netPaidVal || m.approvedVal)}</b>
                              </span>
                              <span className="font-bold tabular-nums text-foreground">
                                {m.progressPct.toFixed(0)}%
                              </span>
                            </div>
                            <Progress value={m.progressPct} className="h-1.5" />
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40 text-[11px]">
                            <div>
                              <span className="text-muted-foreground block">
                                {isAr ? "سندات المستودع" : "Warehouse Issues"}
                              </span>
                              <span className="font-semibold tabular-nums text-amber-600">
                                {m.issues.length} {isAr ? "سند صرف" : "issues"}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block">
                                {isAr ? "خصومات معلقة" : "Open Deductions"}
                              </span>
                              <span
                                className={`font-semibold tabular-nums ${
                                  m.openDeductions > 0 ? "text-destructive" : "text-muted-foreground"
                                }`}
                              >
                                {money(m.openDeductions)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>

                      {/* Card Footer Actions */}
                      <div className="p-4 pt-0 flex items-center justify-between gap-2 border-t border-border/40 bg-muted/10">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-8 text-primary hover:text-primary hover:bg-primary/10 gap-1 rounded-xl"
                          onClick={() => {
                            setTargetSubIdForContract(sub.id);
                            setAddingContract(true);
                          }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {isAr ? "عقد جديد" : "New Contract"}
                        </Button>

                        <Button
                          size="sm"
                          className="text-xs h-8 gap-1.5 rounded-xl font-bold shadow-xs"
                          onClick={() => setSelectedProfileSub(sub)}
                        >
                          {isAr ? "ملف المقاول الشامل" : "View 360° Profile"}
                          <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ======================================================== */}
          {/* TAB 2: Contracts & Buildings                             */}
          {/* ======================================================== */}
          <TabsContent value="contracts" className="space-y-4">
            {filteredContracts.length === 0 ? (
              <Card className="rounded-2xl border-dashed">
                <CardContent className="p-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto">
                    <FileSignature className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-sm">
                      {isAr ? "لم تُسجَّل عقود لمقاولي الباطن بعد" : "No subcontractor contracts recorded yet"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "أنشئ عقداً لربط المقاول بالمباني والوحدات وتتبع مستخلصاته وسندات الصرف."
                        : "Create a contract to link the contractor to buildings and units."}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="rounded-xl gap-1.5 mt-2"
                    onClick={() => {
                      setTargetSubIdForContract(filterSubId !== "all" ? filterSubId : undefined);
                      setAddingContract(true);
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    <span>{isAr ? "عقد جديد" : "New Contract"}</span>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                {filteredContracts.map((c) => {
                  const contractCerts = allCertificates.filter(
                    (cert: any) => cert.contractId === c.id && cert.status !== "cancelled"
                  );
                  const approvedVal = contractCerts
                    .filter((cert: any) => ["approved", "paid"].includes(cert.status))
                    .reduce((s: number, cert: any) => s + num(cert.grossAmount), 0);

                  const contractOrders = subPaymentOrders.filter(
                    (o: any) =>
                      o.subcontractorContractId === c.id ||
                      (o.subcontractorCertificateId && contractCerts.some((cert: any) => cert.id === o.subcontractorCertificateId))
                  );

                  const directOrdersPaidVal = contractOrders
                    .filter((o: any) => o.status === "paid" && !o.subcontractorCertificateId)
                    .reduce((s: number, o: any) => s + num(o.amount), 0);

                  const totalContractDisbursed = approvedVal + directOrdersPaidVal;
                  const contractIssues = materialIssues.filter(
                    (m: any) => m.contractId === c.id && m.status !== "cancelled" && m.status !== "rejected"
                  );
                  const locSet = new Set(c.workLocationIds ?? []);
                  const pickedLocations = workLocations.filter((l: any) => locSet.has(l.id));
                  const val = num(c.contractValue);
                  const pct = val > 0 ? Math.min(100, (totalContractDisbursed / val) * 100) : 0;
                  const remaining = Math.max(0, val - totalContractDisbursed);

                  // Group buildings for compact summary
                  const buildingGroupMap = new Map<string, number>();
                  for (const loc of pickedLocations) {
                    const b = String(loc.buildingNo || loc.building || "No Bldg").trim();
                    buildingGroupMap.set(b, (buildingGroupMap.get(b) ?? 0) + 1);
                  }
                  const bGroups = Array.from(buildingGroupMap.entries());
                  const isSettled = c.status === "settled";
                  const isTerminated = c.status === "terminated";

                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedContract(c)}
                      className={cn(
                        "group cursor-pointer rounded-2xl border p-5 flex flex-col justify-between gap-3.5 transition-all duration-200 select-none relative overflow-hidden",
                        isSettled &&
                          "border-emerald-300 dark:border-emerald-800 bg-gradient-to-br from-emerald-500/10 via-card to-emerald-500/5 hover:border-emerald-500 hover:shadow-md ring-1 ring-emerald-400/30",
                        isTerminated &&
                          "border-rose-300 dark:border-rose-800 bg-gradient-to-br from-rose-500/10 via-card to-rose-500/5 hover:border-rose-500 hover:shadow-md ring-1 ring-rose-400/30 opacity-95",
                        !isSettled &&
                          !isTerminated &&
                          "bg-card border-border/80 hover:border-primary/50 hover:shadow-md"
                      )}
                    >
                      {/* Top Distinct Status Banner for Settled / Terminated */}
                      {isSettled && (
                        <div className="flex items-center justify-between bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800/60 rounded-xl px-3 py-1.5 text-xs font-bold shadow-2xs">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>{isAr ? "مخالصة نهائية مكتملة" : "Final Clearance Completed"}</span>
                          </span>
                          {c.settlementDate && (
                            <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300">
                              {fmtDate(c.settlementDate)}
                            </span>
                          )}
                        </div>
                      )}

                      {isTerminated && (
                        <div className="flex items-center justify-between bg-rose-500/15 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800/60 rounded-xl px-3 py-1.5 text-xs font-bold shadow-2xs">
                          <span className="flex items-center gap-1.5">
                            <XCircle className="w-4 h-4 text-rose-600" />
                            <span>{isAr ? "تم سحب العمل / العقد ملغي" : "Work Terminated / Cancelled"}</span>
                          </span>
                          {c.settlementDate && (
                            <span className="text-[11px] font-mono text-rose-700 dark:text-rose-300">
                              {fmtDate(c.settlementDate)}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Card Top: Badges, Title, Subcontractor */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-mono text-xs font-bold px-2.5 py-0.5 rounded-md",
                              isSettled && "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40",
                              isTerminated && "border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950/40",
                              !isSettled && !isTerminated && "border-primary/30 bg-primary/5 text-primary"
                            )}
                          >
                            {c.contractNo}
                          </Badge>

                          <Badge
                            variant={
                              isSettled
                                ? "secondary"
                                : isTerminated
                                  ? "destructive"
                                  : "default"
                            }
                            className={cn(
                              "text-xs px-2 py-0.5 h-6 font-semibold",
                              !isSettled && !isTerminated && "bg-amber-500 hover:bg-amber-600 text-white",
                              isSettled && "bg-emerald-600 hover:bg-emerald-700 text-white",
                              isTerminated && "bg-rose-600 hover:bg-rose-700 text-white"
                            )}
                          >
                            {c.status === "active"
                              ? t("payments:contracts.status_active")
                              : isSettled
                                ? t("payments:contracts.status_settled")
                                : t("payments:contracts.status_terminated")}
                          </Badge>

                          {c.scope && (
                            <Badge variant="secondary" className="text-xs px-2 py-0.5 h-6 font-medium">
                              {c.scope}
                            </Badge>
                          )}
                        </div>

                        <h4 className="font-bold text-base truncate text-foreground group-hover:text-primary transition-colors mt-1.5">
                          {c.title}
                        </h4>
                        <p className="text-sm text-muted-foreground truncate font-medium">
                          {c.subcontractorName}
                        </p>
                      </div>

                      {/* Financial Box */}
                      <div
                        className={cn(
                          "rounded-xl border p-3 text-xs space-y-2.5",
                          isSettled && "bg-emerald-500/5 border-emerald-200 dark:border-emerald-900/50",
                          isTerminated && "bg-rose-500/5 border-rose-200 dark:border-rose-900/50",
                          !isSettled && !isTerminated && "bg-muted/30 border-border/50"
                        )}
                      >
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <span className="text-xs text-muted-foreground font-medium block mb-0.5">
                              {isAr ? "قيمة العقد" : "Value"}
                            </span>
                            <b className="text-base font-black tabular-nums">{money(val)}</b>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground font-medium block mb-0.5">
                              {isAr ? "المنصرف" : "Disbursed"}
                            </span>
                            <b className="text-base font-black text-emerald-600 tabular-nums">
                              {money(totalContractDisbursed)}
                            </b>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground font-medium block mb-0.5">
                              {isAr ? "المتبقي" : "Remaining"}
                            </span>
                            <b
                              className={cn(
                                "text-base font-black tabular-nums",
                                isSettled ? "text-emerald-600" : "text-primary"
                              )}
                            >
                              {money(remaining)}
                            </b>
                          </div>
                        </div>

                        <div className="space-y-1 pt-0.5">
                          <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                            <span>{isAr ? "نسبة الصرف" : "Disbursed"}</span>
                            <span className="tabular-nums font-bold text-foreground">{pct.toFixed(0)}%</span>
                          </div>
                          <Progress
                            value={pct}
                            className={cn(
                              "h-2 rounded-full",
                              isSettled && "[&>div]:bg-emerald-600",
                              isTerminated && "[&>div]:bg-rose-500"
                            )}
                          />
                        </div>
                      </div>

                      {/* Operations Stats */}
                      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground px-0.5">
                        <span className="flex items-center gap-1.5">
                          <Receipt className="w-4 h-4 text-muted-foreground" />
                          <span>{contractCerts.length} {isAr ? "مستخلص" : "certs"}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <PackageOpen className="w-4 h-4 text-muted-foreground" />
                          <span>{contractIssues.length} {isAr ? "سند صرف" : "issues"}</span>
                        </span>
                      </div>

                      {/* Buildings & Units Coverage (Compact Summary Only) */}
                      <div className="space-y-2 pt-1.5 border-t border-border/40">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                            <Building2 className="w-4 h-4 text-primary" />
                            {isAr ? "المباني:" : "Buildings:"}
                          </span>

                          {pickedLocations.length === 0 ? (
                            <Badge variant="outline" className="text-xs text-muted-foreground font-normal py-1 px-2.5 rounded-md bg-muted/20">
                              {isAr ? "كل المباني والوحدات مسموحة (عقد شامل)" : "All buildings allowed"}
                            </Badge>
                          ) : (
                            bGroups.map(([bNo, count]) => (
                              <Badge key={bNo} variant="outline" className="text-xs gap-1.5 py-1 px-2 rounded-md bg-muted/30 font-medium">
                                <span>{isAr ? `مبنى ${bNo}` : `Bldg ${bNo}`}</span>
                                <span className="text-muted-foreground font-mono font-bold">({count} {isAr ? "وحدة" : "units"})</span>
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ======================================================== */}
          {/* TAB 3: Certificates & Payments                           */}
          {/* ======================================================== */}
          <TabsContent value="certificates" className="space-y-6">
            <SubcontractorCertificatesTab
              ctx={ctx}
              projectId={projectId}
              rows={filteredCertificates}
              chargebacks={allChargebacks}
              fines={allFines}
              subcontractors={subcontractors}
              contracts={allContracts}
              orders={overview?.orders ?? []}
              onRequestOrder={(certId) => navigate(`/payments?tab=orders&project=${projectId}&focus=${certId}`)}
              hidePanels={true}
            />

            {/* Subcontractor Payment Orders & Transfers Section */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-primary" />
                    {isAr ? "الدفعات وطلبات التحويل المالي الصادرة لمقاولي الباطن" : "Payment Orders & Transfers to Subcontractors"}
                    <Badge variant="secondary" className="text-xs px-2 h-5">
                      {subPaymentOrders.length}
                    </Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "جميع أوامر الصرف المالي، الدفعات المقدمة، وطلبات التحويل المعتمدة والمسددة لمقاولي الباطن"
                      : "All payment orders, advances, and transfers approved and paid to subcontractors"}
                  </p>
                </div>
              </div>

              <Card className="rounded-2xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-start">{isAr ? "رقم الطلب / الأمر" : "Order No"}</TableHead>
                      <TableHead className="text-start">{isAr ? "المقاول" : "Subcontractor"}</TableHead>
                      <TableHead className="text-start">{isAr ? "التاريخ" : "Date"}</TableHead>
                      <TableHead className="text-start">{isAr ? "البيان / سبب التحويل" : "Reason / Purpose"}</TableHead>
                      <TableHead className="text-start">{isAr ? "المستخلص المرتبط" : "Linked Cert"}</TableHead>
                      <TableHead className="text-start">{isAr ? "المبلغ" : "Amount"}</TableHead>
                      <TableHead className="text-start">{isAr ? "طريقة السداد" : "Method"}</TableHead>
                      <TableHead className="text-start">{isAr ? "الحالة" : "Status"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subPaymentOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8 text-xs">
                          {isAr ? "لا توجد طلبات تحويل أو أوامر دفع مسجلة لمقاولي الباطن" : "No payment orders found for subcontractors"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      subPaymentOrders.map((order: any) => {
                        const linkedCert = allCertificates.find((c: any) => c.id === order.subcontractorCertificateId);
                        const sub = subcontractors.find((s: any) => s.id === order.subcontractorId);
                        const subDisplayName = sub?.name || order.payeeName || "—";
                        return (
                          <TableRow key={order.id}>
                            <TableCell className="font-mono text-xs font-bold text-primary">{order.orderNo}</TableCell>
                            <TableCell className="text-xs font-semibold">{subDisplayName}</TableCell>
                            <TableCell className="text-xs">{fmtDate(order.createdAt)}</TableCell>
                            <TableCell className="text-xs max-w-xs truncate" title={order.reason || order.purpose}>
                              {order.reason || (order.purpose === "advance" ? (isAr ? "دفعة مقدمة" : "Advance") : (isAr ? "تحويل مالي" : "Transfer"))}
                            </TableCell>
                            <TableCell className="text-xs">
                              {linkedCert ? (
                                <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50/50 text-[11px] font-mono">
                                  {linkedCert.certNo || linkedCert.certificateNo || (isAr ? "مستخلص" : "Cert")}
                                </Badge>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">{isAr ? "تحويل مباشر / مقدمة" : "Direct / Advance"}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums font-bold text-foreground">
                              {money(order.amount)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {order.paymentMethod ? (
                                <span className="flex items-center gap-1 font-mono text-[11px]">
                                  {order.paymentMethod}
                                  {order.paymentReference ? ` (${order.paymentReference})` : ""}
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell>
                              {order.status === "paid" ? (
                                <Badge variant="default" className="bg-emerald-600 text-[10px]">
                                  {isAr ? "مدفوع" : "Paid"}
                                </Badge>
                              ) : order.status === "request_approved" ? (
                                <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 text-[10px]">
                                  {isAr ? "طلب معتمد من المدير" : "Request Approved"}
                                </Badge>
                              ) : order.status === "requested" ? (
                                <Badge variant="outline" className="border-amber-500 text-amber-700 text-[10px]">
                                  {isAr ? "طلب تحويل قيد الاعتماد" : "Requested"}
                                </Badge>
                              ) : order.status === "approved" ? (
                                <Badge variant="default" className="text-[10px]">
                                  {isAr ? "معتمد للصرف" : "Approved"}
                                </Badge>
                              ) : order.status === "rejected" ? (
                                <Badge variant="destructive" className="text-[10px]">
                                  {isAr ? "مرفوض" : "Rejected"}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">
                                  {order.status}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </Card>
            </div>
          </TabsContent>

          {/* ======================================================== */}
          {/* TAB 4: Warehouse Material Issues to Subcontractors       */}
          {/* ======================================================== */}
          <TabsContent value="issues" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">
                  {isAr ? "سندات صرف المواد لمقاولي الباطن" : "Material Issue Vouchers to Subcontractors"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? "جميع المواد المصروفة من مستودعات المشروع لمقاولي الباطن حسب العقد والمبنى"
                    : "All materials issued from project warehouses to subcontractors by contract and building"}
                </p>
              </div>
              <Button size="sm" onClick={() => setIssueOpen(true)}>
                <Plus className="w-4 h-4 me-1" />
                {isAr ? "سند صرف مواد جديد" : "New Material Issue"}
              </Button>
            </div>

            <Card className="rounded-2xl">
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-start">{isAr ? "رقم السند" : "Issue No"}</TableHead>
                      <TableHead className="text-start">{isAr ? "التاريخ" : "Date"}</TableHead>
                      <TableHead className="text-start">{isAr ? "مقاول الباطن" : "Subcontractor"}</TableHead>
                      <TableHead className="text-start">{isAr ? "العقد" : "Contract"}</TableHead>
                      <TableHead className="text-start">{isAr ? "المبنى / الموقع" : "Building / Location"}</TableHead>
                      <TableHead className="text-start">{isAr ? "المستودع" : "Warehouse"}</TableHead>
                      <TableHead className="text-start">{isAr ? "المواد المصروفة" : "Materials Issued"}</TableHead>
                      <TableHead className="text-start">{isAr ? "الحالة" : "Status"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subMaterialIssues.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                          {isAr ? "لا توجد سندات صرف مواد مسجلة" : "No material issue vouchers found"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      subMaterialIssues.map((issue: any) => (
                        <TableRow key={issue.id}>
                          <TableCell className="font-mono text-xs font-bold">{issue.issueNumber}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{fmtDate(issue.issueDate)}</TableCell>
                          <TableCell className="font-semibold text-sm">{issue.issuedTo}</TableCell>
                          <TableCell className="text-xs">
                            {issue.contractNo ? (
                              <Badge variant="outline" className="font-mono text-[11px]">
                                {issue.contractNo}
                                {issue.contractTitle ? ` — ${issue.contractTitle}` : ""}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {issue.workLocationName ? (
                              <Badge variant="secondary" className="gap-1 text-[11px]">
                                <Building2 className="w-3 h-3 text-primary" />
                                {issue.workLocationName}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{issue.warehouseName || "—"}</TableCell>
                          <TableCell className="text-xs">
                            <div className="flex flex-wrap gap-1 max-w-md">
                              {(issue.items ?? []).map((it: any) => (
                                <Badge key={it.id} variant="outline" className="text-[11px] font-normal">
                                  {it.materialName}: <b className="ms-1 tabular-nums">{it.quantity}</b> {it.unit}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                issue.status === "issued"
                                  ? "default"
                                  : issue.status === "pending_approval"
                                    ? "secondary"
                                    : "destructive"
                              }
                              className="text-[11px]"
                            >
                              {issue.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ======================================================== */}
          {/* TAB 5: Deductions & Chargebacks                          */}
          {/* ======================================================== */}
          <TabsContent value="deductions">
            <ChargebacksPanel
              ctx={ctx}
              projectId={projectId}
              rows={filteredChargebacks}
              fines={filteredFines}
              billRequests={overview?.billRequests ?? []}
              orders={overview?.orders ?? []}
              purchaseOrders={overview?.purchaseOrders ?? []}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* ===================================================================== */}
      {/* CONTRACT DETAILS MODAL (تفاصيل العقد الشاملة والمخالصة)              */}
      {/* ===================================================================== */}
      {selectedContract && (() => {
        const c = selectedContract;
        const sub = subcontractors.find((s) => s.id === c.subcontractorId);
        const contractCerts = allCertificates.filter(
          (cert: any) => cert.contractId === c.id && cert.status !== "cancelled"
        );
        const approvedVal = contractCerts
          .filter((cert: any) => ["approved", "paid"].includes(cert.status))
          .reduce((s: number, cert: any) => s + num(cert.grossAmount), 0);

        const contractOrders = subPaymentOrders.filter(
          (o: any) =>
            o.subcontractorContractId === c.id ||
            (o.subcontractorCertificateId && contractCerts.some((cert: any) => cert.id === o.subcontractorCertificateId))
        );

        const directOrdersPaidVal = contractOrders
          .filter((o: any) => o.status === "paid" && !o.subcontractorCertificateId)
          .reduce((s: number, o: any) => s + num(o.amount), 0);

        const totalContractDisbursed = approvedVal + directOrdersPaidVal;
        const contractIssues = materialIssues.filter(
          (m: any) => m.contractId === c.id && m.status !== "cancelled" && m.status !== "rejected"
        );
        const locSet = new Set(c.workLocationIds ?? []);
        const pickedLocations = workLocations.filter((l: any) => locSet.has(l.id));
        const val = num(c.contractValue);
        const pct = val > 0 ? Math.min(100, (totalContractDisbursed / val) * 100) : 0;
        const remaining = Math.max(0, val - totalContractDisbursed);

        return (
          <Dialog open={!!selectedContract} onOpenChange={(open) => !open && setSelectedContract(null)}>
            <DialogContent className="max-w-4xl w-full max-h-[92vh] overflow-y-auto rounded-3xl p-6">
              <DialogHeader className="space-y-3 pb-4 border-b border-border/60">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black text-lg">
                      <FileSignature className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="font-mono text-xs font-bold border-primary/30 bg-primary/5 text-primary">
                          {c.contractNo}
                        </Badge>
                        <Badge
                          variant={c.status === "active" ? "default" : c.status === "settled" ? "secondary" : "destructive"}
                          className={`text-xs ${c.status === "active" ? "bg-amber-500 text-white" : ""}`}
                        >
                          {c.status === "active"
                            ? t("payments:contracts.status_active")
                            : c.status === "settled"
                              ? t("payments:contracts.status_settled")
                              : t("payments:contracts.status_terminated")}
                        </Badge>
                        {c.scope && <Badge variant="secondary" className="text-xs">{c.scope}</Badge>}
                      </div>
                      <DialogTitle className="text-xl font-black mt-1">{c.title}</DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground">
                        {c.subcontractorName} {sub?.phone ? `· ${sub.phone}` : ""}
                      </DialogDescription>
                    </div>
                  </div>

                  {/* Top Action Buttons in Dialog */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl gap-1.5 text-xs font-bold"
                      onClick={() => {
                        const target = selectedContract;
                        setSelectedContract(null);
                        setEditingContract(target);
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>{c.status === "active" ? (isAr ? "مخالصة / تعديل العقد" : "Clearance / Edit") : (isAr ? "تعديل العقد" : "Edit Contract")}</span>
                    </Button>

                    <Button
                      size="sm"
                      className="rounded-xl gap-1.5 text-xs font-bold"
                      onClick={() => {
                        navigate(`/payments/certificates/new?project=${projectId}&subcontractor=${c.subcontractorId}&contract=${c.id}`);
                        setSelectedContract(null);
                      }}
                    >
                      <Receipt className="w-4 h-4" />
                      <span>{isAr ? "مستخلص جديد" : "New Certificate"}</span>
                    </Button>

                    {canManageContract && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-xl text-destructive hover:bg-destructive/10"
                        disabled={removeContract.isPending}
                        onClick={() => {
                          removeContract.mutate(c.id);
                          setSelectedContract(null);
                        }}
                        title={isAr ? "حذف العقد" : "Delete Contract"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Financial Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/40 rounded-2xl text-xs border border-border/50">
                  <div>
                    <span className="text-muted-foreground block text-[11px] mb-0.5">
                      {isAr ? "قيمة العقد" : "Contract Value"}
                    </span>
                    <b className="text-base tabular-nums font-black text-primary">{money(val)}</b>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px] mb-0.5">
                      {isAr ? "المعتمد والمنصرف" : "Disbursed"}
                    </span>
                    <b className="text-base tabular-nums font-black text-emerald-600">{money(totalContractDisbursed)}</b>
                    <span className="text-[10px] text-muted-foreground block">{pct.toFixed(0)}% {isAr ? "إنجاز مالي" : "progress"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px] mb-0.5">
                      {isAr ? "المتبقي من العقد" : "Remaining"}
                    </span>
                    <b className="text-base tabular-nums font-black">{money(remaining)}</b>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px] mb-0.5">
                      {isAr ? "المستخلصات وسندات الصرف" : "Certs & Issues"}
                    </span>
                    <b className="text-base tabular-nums font-black text-amber-600">
                      {contractCerts.length} <span className="text-xs font-normal">{isAr ? "مستخلص" : "certs"}</span> · {contractIssues.length}{" "}
                      <span className="text-xs font-normal">{isAr ? "سند" : "issues"}</span>
                    </b>
                  </div>
                </div>
              </DialogHeader>

              {/* Detail Tabs inside Dialog */}
              <Tabs defaultValue="locations" className="space-y-4 pt-2">
                <TabsList className="bg-muted/50 rounded-xl p-1">
                  <TabsTrigger value="locations" className="text-xs rounded-lg gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    {isAr ? "المباني والوحدات المشمولة" : "Assigned Buildings & Units"}
                    <Badge variant="secondary" className="ms-1 text-[10px] px-1 h-4">
                      {pickedLocations.length > 0 ? pickedLocations.length : (isAr ? "الكل" : "All")}
                    </Badge>
                  </TabsTrigger>

                  <TabsTrigger value="certs" className="text-xs rounded-lg gap-1.5">
                    <Receipt className="w-3.5 h-3.5" />
                    {isAr ? "المستخلصات والدفعات" : "Certificates & Payments"}
                    <Badge variant="secondary" className="ms-1 text-[10px] px-1 h-4">
                      {contractCerts.length}
                    </Badge>
                  </TabsTrigger>

                  <TabsTrigger value="issues" className="text-xs rounded-lg gap-1.5">
                    <PackageOpen className="w-3.5 h-3.5" />
                    {isAr ? "سندات صرف المواد" : "Warehouse Issues"}
                    <Badge variant="secondary" className="ms-1 text-[10px] px-1 h-4">
                      {contractIssues.length}
                    </Badge>
                  </TabsTrigger>

                  {sub && (
                    <TabsTrigger value="contractor" className="text-xs rounded-lg gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      {isAr ? "معلومات المقاول" : "Subcontractor"}
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* Sub-tab 1: Locations & Units */}
                <TabsContent value="locations" className="space-y-3">
                  {pickedLocations.length === 0 ? (
                    <div className="p-8 text-center border rounded-2xl bg-muted/20">
                      <Building2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-bold text-foreground">
                        {isAr ? "عقد شامل لجميع المباني والوحدات" : "Comprehensive Contract - All Buildings Allowed"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {isAr
                          ? "هذا العقد غير مقيّد بمبانٍ أو وحدات محددة، ويسمح بالعمل في كافة مواقع المشروع."
                          : "This contract is not restricted to specific buildings or units."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{isAr ? `إجمالي الوحدات المسندة: ${pickedLocations.length} وحدة` : `Total assigned units: ${pickedLocations.length}`}</span>
                      </div>
                      <div className="p-3 bg-muted/20 border rounded-2xl">
                        <GroupedLocationBadges locations={pickedLocations} />
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Sub-tab 2: Certificates & Orders */}
                <TabsContent value="certs" className="space-y-3">
                  <div className="rounded-2xl border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-start">{isAr ? "رقم المستخلص" : "Cert No"}</TableHead>
                          <TableHead className="text-start">{isAr ? "التاريخ" : "Date"}</TableHead>
                          <TableHead className="text-start">{isAr ? "قيمة الأعمال" : "Gross"}</TableHead>
                          <TableHead className="text-start">{isAr ? "الصافي المستحق" : "Net Payable"}</TableHead>
                          <TableHead className="text-start">{isAr ? "أمر الدفع" : "Payment Order"}</TableHead>
                          <TableHead className="text-start">{isAr ? "الحالة" : "Status"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contractCerts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                              {isAr ? "لا توجد مستخلصات مسجلة لهذا العقد بعد" : "No certificates registered for this contract"}
                            </TableCell>
                          </TableRow>
                        ) : (
                          contractCerts.map((cert: any) => {
                            const linkedOrder = subPaymentOrders.find(
                              (o: any) => o.subcontractorCertificateId === cert.id
                            );
                            const certDisplayNo = cert.certNo || cert.certificateNo || (cert.id ? cert.id.slice(0, 8) : "—");
                            const certDate = cert.periodTo || cert.createdAt || cert.certificateDate;
                            return (
                              <TableRow
                                key={cert.id}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => {
                                  setSelectedContract(null);
                                  navigate(`/payments/certificates/${cert.id}`);
                                }}
                              >
                                <TableCell className="font-mono text-xs font-bold text-primary">{certDisplayNo}</TableCell>
                                <TableCell className="text-xs">{fmtDate(certDate)}</TableCell>
                                <TableCell className="text-xs tabular-nums font-bold">{money(cert.grossAmount)}</TableCell>
                                <TableCell className="text-xs tabular-nums font-bold text-emerald-600">{money(cert.netPayable)}</TableCell>
                                <TableCell className="text-xs">
                                  {linkedOrder ? (
                                    <Badge variant="outline" className="font-mono text-[11px] border-emerald-300 text-emerald-700 bg-emerald-50/50">
                                      {linkedOrder.orderNo}
                                    </Badge>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground">{isAr ? "لم يصدر أمر دفع" : "No order"}</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={cert.status === "paid" ? "default" : cert.status === "approved" ? "secondary" : "outline"}
                                    className={`text-[11px] ${cert.status === "paid" ? "bg-emerald-600" : ""}`}
                                  >
                                    {cert.status === "paid" ? (isAr ? "مدفوع" : "Paid") : cert.status === "approved" ? (isAr ? "معتمد" : "Approved") : cert.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* Sub-tab 3: Warehouse Material Issues */}
                <TabsContent value="issues" className="space-y-3">
                  <div className="rounded-2xl border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-start">{isAr ? "رقم السند" : "Issue No"}</TableHead>
                          <TableHead className="text-start">{isAr ? "التاريخ" : "Date"}</TableHead>
                          <TableHead className="text-start">{isAr ? "الموقع" : "Location"}</TableHead>
                          <TableHead className="text-start">{isAr ? "المواد المصروفة" : "Items"}</TableHead>
                          <TableHead className="text-start">{isAr ? "الحالة" : "Status"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contractIssues.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              {isAr ? "لا توجد سندات صرف مواد لهذا العقد" : "No material issues found"}
                            </TableCell>
                          </TableRow>
                        ) : (
                          contractIssues.map((issue: any) => (
                            <TableRow key={issue.id}>
                              <TableCell className="font-mono text-xs font-bold">{issue.issueNumber}</TableCell>
                              <TableCell className="text-xs">{fmtDate(issue.issueDate)}</TableCell>
                              <TableCell className="text-xs">{issue.workLocationName || "—"}</TableCell>
                              <TableCell className="text-xs">
                                <div className="flex flex-wrap gap-1">
                                  {(issue.items ?? []).map((it: any) => (
                                    <Badge key={it.id} variant="outline" className="text-[10px]">
                                      {it.materialName}: {it.quantity} {it.unit}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px]">{issue.status}</Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* Sub-tab 4: Subcontractor Info */}
                {sub && (
                  <TabsContent value="contractor" className="space-y-3">
                    <div className="p-4 rounded-2xl border bg-muted/20 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-black text-lg">
                          {sub.name.slice(0, 2)}
                        </div>
                        <div>
                          <h4 className="font-bold text-base">{sub.name}</h4>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            {sub.scope && <Badge variant="secondary">{sub.scope}</Badge>}
                            {sub.taxNumber && <span>ضريبي: {sub.taxNumber}</span>}
                            {sub.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {sub.phone}</span>}
                          </div>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl text-xs gap-1.5"
                        onClick={() => {
                          setSelectedContract(null);
                          setSelectedProfileSub(sub);
                        }}
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>{isAr ? "عرض ملف المقاول الشامل 360°" : "View Full Profile"}</span>
                        <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                      </Button>
                    </div>
                  </TabsContent>
                )}
              </Tabs>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ===================================================================== */}
      {/* 360° SUBCONTRACTOR PROFILE MODAL (ملف المقاول الشامل)                  */}
      {/* ===================================================================== */}
      {selectedProfileSub && (
        <Dialog open={!!selectedProfileSub} onOpenChange={(open) => !open && setSelectedProfileSub(null)}>
          <DialogContent className="max-w-6xl w-full max-h-[92vh] overflow-y-auto rounded-3xl p-6">
            <DialogHeader className="space-y-3 pb-4 border-b border-border/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-black text-lg shadow-md">
                    {selectedProfileSub.name.slice(0, 2)}
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-black">{selectedProfileSub.name}</DialogTitle>
                    <DialogDescription asChild>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {selectedProfileSub.scope && (
                          <Badge variant="secondary" className="text-xs">
                            {selectedProfileSub.scope}
                          </Badge>
                        )}
                        {selectedProfileSub.taxNumber && (
                          <span className="text-xs font-mono text-muted-foreground">
                            ضريبي: {selectedProfileSub.taxNumber}
                          </span>
                        )}
                        {selectedProfileSub.phone && (
                          <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {selectedProfileSub.phone}
                          </span>
                        )}
                      </div>
                    </DialogDescription>
                  </div>
                </div>

                {/* Profile Quick Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs gap-1"
                    onClick={() => {
                      setTargetSubIdForContract(selectedProfileSub.id);
                      setAddingContract(true);
                    }}
                  >
                    <Plus className="w-3.5 h-3.5 text-primary" />
                    {isAr ? "عقد جديد" : "New Contract"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs gap-1"
                    onClick={() => {
                      navigate(`/payments/certificates/new?project=${projectId}&subcontractor=${selectedProfileSub.id}`);
                    }}
                  >
                    <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                    {isAr ? "مستخلص جديد" : "New Certificate"}
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-xl text-xs gap-1"
                    onClick={() => setIssueOpen(true)}
                  >
                    <PackageOpen className="w-3.5 h-3.5" />
                    {isAr ? "صرف مواد" : "Issue Materials"}
                  </Button>
                </div>
              </div>

              {/* Subcontractor Financial Summary Strip */}
              {(() => {
                const subM = getSubMetrics(selectedProfileSub.id);
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/40 rounded-2xl text-xs border border-border/50">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">
                        {isAr ? "إجمالي العقود" : "Total Contracts"}
                      </span>
                      <b className="text-base tabular-nums font-black text-primary">{money(subM.totalVal)}</b>
                      <span className="text-[10px] text-muted-foreground block">
                        {subM.subContracts.length} {isAr ? "عقد" : "contracts"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">
                        {isAr ? "المعتمد بالمستخلصات" : "Certified"}
                      </span>
                      <b className="text-base tabular-nums font-black text-emerald-600">{money(subM.approvedVal)}</b>
                      <span className="text-[10px] text-muted-foreground block">
                        {subM.totalVal > 0 ? ((subM.approvedVal / subM.totalVal) * 100).toFixed(0) : 0}% {isAr ? "إنجاز مستخلصات" : "certified"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">
                        {isAr ? "الصافي المصروف" : "Net Paid"}
                      </span>
                      <b className="text-base tabular-nums font-black">{money(subM.netPaidVal)}</b>
                      <span className="text-[10px] text-muted-foreground block">
                        {subM.progressPct.toFixed(0)}% {isAr ? "إنجاز مالي" : "progress"} · {isAr ? "المتبقي:" : "Rem:"} {money(subM.remainingVal)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">
                        {isAr ? "المستودع والخصومات" : "Issues & Deductions"}
                      </span>
                      <b className="text-base tabular-nums font-black text-amber-600">
                        {subM.issues.length} <span className="text-xs font-normal">{isAr ? "سند" : "issues"}</span>
                      </b>
                      <span className="text-[10px] text-destructive block font-semibold">
                        {subM.openDeductions > 0
                          ? `${isAr ? "خصومات:" : "Deductions:"} ${money(subM.openDeductions)}`
                          : isAr
                            ? "لا توجد خصومات معلقة"
                            : "No open deductions"}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </DialogHeader>

            {/* Profile Sub-tabs */}
            {(() => {
              const subM = getSubMetrics(selectedProfileSub.id);
              return (
                <Tabs defaultValue="contracts" className="space-y-4 pt-2">
                  <TabsList className="bg-muted/50 rounded-xl p-1">
                    <TabsTrigger value="contracts" className="text-xs rounded-lg gap-1.5">
                      <FileSignature className="w-3.5 h-3.5" />
                      {isAr ? "العقود والمباني" : "Contracts & Buildings"}
                      <Badge variant="secondary" className="ms-1 text-[10px] px-1 h-4">
                        {subM.subContracts.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="certs" className="text-xs rounded-lg gap-1.5">
                      <Receipt className="w-3.5 h-3.5" />
                      {isAr ? "المستخلصات والدفعات" : "Certificates & Payments"}
                      <Badge variant="secondary" className="ms-1 text-[10px] px-1 h-4">
                        {subM.subCerts.length + subM.subOrders.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="issues" className="text-xs rounded-lg gap-1.5">
                      <PackageOpen className="w-3.5 h-3.5" />
                      {isAr ? "المواد المصروفة" : "Warehouse Issues"}
                      <Badge variant="secondary" className="ms-1 text-[10px] px-1 h-4">
                        {subM.issues.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="deductions" className="text-xs rounded-lg gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      {isAr ? "الخصومات والغرامات" : "Deductions"}
                      <Badge variant="secondary" className="ms-1 text-[10px] px-1 h-4">
                        {subM.chargebacks.length + subM.fines.length}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>

                  {/* Sub-Tab 1: Contracts & Assigned Buildings */}
                  <TabsContent value="contracts" className="space-y-3">
                    {subM.subContracts.length === 0 ? (
                      <div className="p-8 text-center border rounded-2xl bg-muted/20">
                        <FileSignature className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm font-semibold">{isAr ? "لا توجد عقود مسجلة لهذا المقاول" : "No contracts registered yet"}</p>
                        <Button
                          size="sm"
                          className="mt-3 rounded-xl text-xs"
                          onClick={() => {
                            setTargetSubIdForContract(selectedProfileSub.id);
                            setAddingContract(true);
                          }}
                        >
                          <Plus className="w-3.5 h-3.5 me-1" />
                          {isAr ? "إنشاء عقد وربط المباني" : "Create Contract & Assign Buildings"}
                        </Button>
                      </div>
                    ) : (
                      subM.subContracts.map((c) => {
                        const locSet = new Set(c.workLocationIds ?? []);
                        const pickedLocations = workLocations.filter((l: any) => locSet.has(l.id));
                        const contractCerts = subM.subCerts.filter((cert: any) => cert.contractId === c.id);
                        const approvedVal = contractCerts
                          .filter((cert: any) => ["approved", "paid"].includes(cert.status))
                          .reduce((s: number, cert: any) => s + num(cert.grossAmount), 0);

                        // Direct orders / payments linked to this contract
                        const contractOrders = subM.subOrders.filter(
                          (o: any) =>
                            o.subcontractorContractId === c.id ||
                            (o.subcontractorCertificateId && contractCerts.some((cert: any) => cert.id === o.subcontractorCertificateId))
                        );

                        const directOrdersPaidVal = contractOrders
                          .filter((o: any) => o.status === "paid" && !o.subcontractorCertificateId)
                          .reduce((s: number, o: any) => s + num(o.amount), 0);

                        const totalContractDisbursed = approvedVal + directOrdersPaidVal;
                        const val = num(c.contractValue);
                        const pct = val > 0 ? Math.min(100, (totalContractDisbursed / val) * 100) : 0;
                        const remaining = Math.max(0, val - totalContractDisbursed);

                        return (
                          <Card key={c.id} className="rounded-2xl border shadow-xs overflow-hidden">
                            <CardContent className="p-4 space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="font-mono text-xs">
                                    {c.contractNo}
                                  </Badge>
                                  <span className="font-bold text-sm">{c.title}</span>
                                  {c.scope && <Badge variant="secondary" className="text-xs">{c.scope}</Badge>}
                                  <Badge
                                    variant={
                                      c.status === "active"
                                        ? "default"
                                        : c.status === "settled"
                                          ? "secondary"
                                          : "destructive"
                                    }
                                    className="text-[11px]"
                                  >
                                    {c.status === "active"
                                      ? t("payments:contracts.status_active")
                                      : c.status === "settled"
                                        ? t("payments:contracts.status_settled")
                                        : t("payments:contracts.status_terminated")}
                                  </Badge>
                                </div>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs rounded-xl"
                                  onClick={() => setEditingContract(c)}
                                >
                                  {c.status === "active" ? (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5 me-1 text-emerald-600" />
                                      {isAr ? "مخالصة / تعديل العقد" : "Clearance / Edit"}
                                    </>
                                  ) : (
                                    isAr ? "تفاصيل المخالصة" : "Clearance Details"
                                  )}
                                </Button>
                              </div>

                              <div className="grid grid-cols-3 gap-2 p-2.5 bg-muted/30 rounded-xl text-xs">
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">
                                    {isAr ? "قيمة العقد:" : "Value:"}
                                  </span>
                                  <b className="tabular-nums">{money(val)}</b>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">
                                    {directOrdersPaidVal > 0 && approvedVal > 0
                                      ? (isAr ? "المنصرف والمعتمد:" : "Paid & Certified:")
                                      : directOrdersPaidVal > 0
                                      ? (isAr ? "المنصرف (دفعات):" : "Paid (Orders):")
                                      : (isAr ? "المعتمد:" : "Certified:")}
                                  </span>
                                  <b className="tabular-nums text-emerald-600">{money(totalContractDisbursed)} ({pct.toFixed(0)}%)</b>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">
                                    {isAr ? "المتبقي:" : "Remaining:"}
                                  </span>
                                  <b className="tabular-nums">{money(remaining)}</b>
                                </div>
                              </div>

                              {/* Assigned Buildings with Large Building Badges -> Unit Badges inside */}
                              {pickedLocations.length > 0 && (
                                <div className="space-y-1.5 pt-1">
                                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                                    <Building2 className="w-3.5 h-3.5 text-primary" />
                                    {isAr ? "المباني والوحدات المسندة لهذا العقد:" : "Assigned Buildings & Units:"}
                                  </span>
                                  <GroupedLocationBadges
                                    locations={pickedLocations}
                                  />
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })
                    )}
                  </TabsContent>

                  {/* Sub-Tab 2: Certificates & Payment Orders */}
                  <TabsContent value="certs" className="space-y-4">
                    {/* Direct Payment Orders & Transfer Requests Section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                          <HandCoins className="w-3.5 h-3.5 text-primary" />
                          {isAr ? "الدفعات وطلبات التحويل المالي الصادرة للمقاول" : "Transfer Requests & Payment Orders"}
                          <Badge variant="secondary" className="text-[10px] px-1 h-4">
                            {subM.subOrders.length}
                          </Badge>
                        </h4>
                      </div>

                      <Card className="rounded-2xl overflow-hidden border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-start">{isAr ? "رقم الطلب / الأمر" : "Order No"}</TableHead>
                              <TableHead className="text-start">{isAr ? "التاريخ" : "Date"}</TableHead>
                              <TableHead className="text-start">{isAr ? "البيان / سبب التحويل" : "Reason / Purpose"}</TableHead>
                              <TableHead className="text-start">{isAr ? "المستخلص المرتبط" : "Linked Cert"}</TableHead>
                              <TableHead className="text-start">{isAr ? "المبلغ" : "Amount"}</TableHead>
                              <TableHead className="text-start">{isAr ? "طريقة السداد" : "Method"}</TableHead>
                              <TableHead className="text-start">{isAr ? "الحالة" : "Status"}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {subM.subOrders.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground py-6 text-xs">
                                  {isAr ? "لا توجد طلبات تحويل أو أوامر دفع مسجلة لهذا المقاول" : "No payment orders or transfers found"}
                                </TableCell>
                              </TableRow>
                            ) : (
                              subM.subOrders.map((order: any) => {
                                const linkedCert = allCertificates.find((c: any) => c.id === order.subcontractorCertificateId);
                                return (
                                <TableRow key={order.id}>
                                  <TableCell className="font-mono text-xs font-bold text-primary">{order.orderNo}</TableCell>
                                  <TableCell className="text-xs">{fmtDate(order.createdAt)}</TableCell>
                                  <TableCell className="text-xs max-w-xs truncate" title={order.reason || order.purpose}>
                                    {order.reason || (order.purpose === "advance" ? (isAr ? "دفعة مقدمة" : "Advance") : (isAr ? "تحويل مالي" : "Transfer"))}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {linkedCert ? (
                                      <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50/50 text-[11px] font-mono">
                                        {linkedCert.certNo || linkedCert.certificateNo || (isAr ? "مستخلص" : "Cert")}
                                      </Badge>
                                    ) : (
                                      <span className="text-[11px] text-muted-foreground">{isAr ? "تحويل مباشر / مقدمة" : "Direct / Advance"}</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs tabular-nums font-bold text-foreground">
                                    {money(order.amount)}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {order.paymentMethod ? (
                                      <span className="flex items-center gap-1 font-mono text-[11px]">
                                        {order.paymentMethod}
                                        {order.paymentReference ? ` (${order.paymentReference})` : ""}
                                      </span>
                                    ) : (
                                      "—"
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {order.status === "paid" ? (
                                      <Badge variant="default" className="bg-emerald-600 text-[10px]">
                                        {isAr ? "مدفوع" : "Paid"}
                                      </Badge>
                                    ) : order.status === "request_approved" ? (
                                      <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 text-[10px]">
                                        {isAr ? "طلب معتمد من المدير" : "Request Approved"}
                                      </Badge>
                                    ) : order.status === "requested" ? (
                                      <Badge variant="outline" className="border-amber-500 text-amber-700 text-[10px]">
                                        {isAr ? "طلب تحويل قيد الاعتماد" : "Requested"}
                                      </Badge>
                                    ) : order.status === "approved" ? (
                                      <Badge variant="default" className="text-[10px]">
                                        {isAr ? "معتمد للصرف" : "Approved"}
                                      </Badge>
                                    ) : order.status === "rejected" ? (
                                      <Badge variant="destructive" className="text-[10px]">
                                        {isAr ? "مرفوض" : "Rejected"}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px]">
                                        {order.status}
                                      </Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                            )}
                          </TableBody>
                        </Table>
                      </Card>
                    </div>

                    {/* Payment Certificates Section */}
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                          <Receipt className="w-3.5 h-3.5 text-primary" />
                          {isAr ? "المستخلصات المسجلة للمقاول" : "Payment Certificates"}
                          <Badge variant="secondary" className="text-[10px] px-1 h-4">
                            {subM.subCerts.length}
                          </Badge>
                        </h4>
                      </div>

                      <Card className="rounded-2xl overflow-hidden border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-start">{isAr ? "رقم المستخلص" : "Cert No"}</TableHead>
                              <TableHead className="text-start">{isAr ? "العقد" : "Contract"}</TableHead>
                              <TableHead className="text-start">{isAr ? "التاريخ" : "Date"}</TableHead>
                              <TableHead className="text-start">{isAr ? "القيمة الإجمالية" : "Gross"}</TableHead>
                              <TableHead className="text-start">{isAr ? "الصافي المستحق" : "Net Payable"}</TableHead>
                              <TableHead className="text-start">{isAr ? "أمر الدفع المرتبط" : "Linked Payment"}</TableHead>
                              <TableHead className="text-start">{isAr ? "الحالة" : "Status"}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {subM.subCerts.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground py-6 text-xs">
                                  {isAr ? "لا توجد مستخلصات مسجلة لهذا المقاول" : "No certificates found"}
                                </TableCell>
                              </TableRow>
                            ) : (
                              subM.subCerts.map((cert: any) => {
                                const linkedOrder = allOrders.find((o: any) => o.subcontractorCertificateId === cert.id);
                                const linkedContract = allContracts.find((c: any) => c.id === cert.contractId);
                                const certDisplayNo = cert.certNo || cert.certificateNo || (cert.id ? cert.id.slice(0, 8) : "—");
                                const certDate = cert.periodTo || cert.createdAt || cert.certificateDate;
                                return (
                                <TableRow
                                  key={cert.id}
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => navigate(`/payments/certificates/${cert.id}`)}
                                >
                                  <TableCell className="font-mono text-xs font-bold text-primary">{certDisplayNo}</TableCell>
                                  <TableCell className="text-xs font-mono">
                                    {linkedContract ? (
                                      <span title={linkedContract.title || ""}>
                                        {linkedContract.contractNo}
                                        {linkedContract.title ? (
                                          <span className="text-muted-foreground text-[10px] font-sans block truncate max-w-[130px]">
                                            ({linkedContract.title})
                                          </span>
                                        ) : null}
                                      </span>
                                    ) : (
                                      cert.contractNo || "—"
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs">{fmtDate(certDate)}</TableCell>
                                  <TableCell className="text-xs tabular-nums font-bold">{money(cert.grossAmount)}</TableCell>
                                  <TableCell className="text-xs tabular-nums font-bold text-emerald-600">{money(cert.netPayable)}</TableCell>
                                  <TableCell className="text-xs">
                                    {linkedOrder ? (
                                      <span className="flex items-center gap-1">
                                        <Badge variant="outline" className="font-mono text-[11px] border-emerald-300 text-emerald-700 bg-emerald-50/50">
                                          {linkedOrder.orderNo}
                                        </Badge>
                                        <span className="text-[10px] text-muted-foreground">
                                          ({linkedOrder.status === "paid" ? (isAr ? "مدفوع" : "Paid") : (isAr ? "قيد الدفع" : "Pending")})
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-muted-foreground">{isAr ? "لم يصدر أمر دفع" : "No order"}</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        cert.status === "paid"
                                          ? "default"
                                          : cert.status === "approved"
                                            ? "secondary"
                                            : cert.status === "draft"
                                              ? "outline"
                                              : "destructive"
                                      }
                                      className={`text-[11px] ${cert.status === "paid" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
                                    >
                                      {cert.status === "paid"
                                        ? (isAr ? "مدفوع" : "Paid")
                                        : cert.status === "approved"
                                          ? (isAr ? "معتمد" : "Approved")
                                          : cert.status === "submitted"
                                            ? (isAr ? "قيد المراجعة" : "Submitted")
                                            : cert.status === "draft"
                                              ? (isAr ? "مسودة" : "Draft")
                                              : cert.status}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                            )}
                          </TableBody>
                        </Table>
                      </Card>
                    </div>
                  </TabsContent>

                  {/* Sub-Tab 3: Warehouse Material Issues */}
                  <TabsContent value="issues">
                    <Card className="rounded-2xl overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-start">{isAr ? "رقم السند" : "Issue No"}</TableHead>
                            <TableHead className="text-start">{isAr ? "التاريخ" : "Date"}</TableHead>
                            <TableHead className="text-start">{isAr ? "العقد" : "Contract"}</TableHead>
                            <TableHead className="text-start">{isAr ? "الموقع" : "Location"}</TableHead>
                            <TableHead className="text-start">{isAr ? "المواد المصروفة" : "Items"}</TableHead>
                            <TableHead className="text-start">{isAr ? "الحالة" : "Status"}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {subM.issues.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                {isAr ? "لا توجد سندات صرف مواد لهذا المقاول" : "No warehouse issues found"}
                              </TableCell>
                            </TableRow>
                          ) : (
                            subM.issues.map((issue: any) => (
                              <TableRow key={issue.id}>
                                <TableCell className="font-mono text-xs font-bold">{issue.issueNumber}</TableCell>
                                <TableCell className="text-xs">{fmtDate(issue.issueDate)}</TableCell>
                                <TableCell className="text-xs font-mono">{issue.contractNo || "—"}</TableCell>
                                <TableCell className="text-xs">{issue.workLocationName || "—"}</TableCell>
                                <TableCell className="text-xs">
                                  <div className="flex flex-wrap gap-1">
                                    {(issue.items ?? []).map((it: any) => (
                                      <Badge key={it.id} variant="outline" className="text-[10px]">
                                        {it.materialName}: {it.quantity} {it.unit}
                                      </Badge>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-[10px]">
                                    {issue.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </Card>
                  </TabsContent>

                  {/* Sub-Tab 4: Deductions & Chargebacks */}
                  <TabsContent value="deductions">
                    <Card className="rounded-2xl overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-start">{isAr ? "النوع" : "Type"}</TableHead>
                            <TableHead className="text-start">{isAr ? "البيان / السبب" : "Description"}</TableHead>
                            <TableHead className="text-start">{isAr ? "المبلغ" : "Amount"}</TableHead>
                            <TableHead className="text-start">{isAr ? "الحالة" : "Status"}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {subM.chargebacks.length === 0 && subM.fines.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                {isAr ? "لا توجد خصومات أو فواتير محملة على المقاول" : "No deductions recorded"}
                              </TableCell>
                            </TableRow>
                          ) : (
                            <>
                              {subM.chargebacks.map((cb: any) => (
                                <TableRow key={cb.id}>
                                  <TableCell className="text-xs font-semibold">
                                    <Badge variant="secondary" className="text-[10px]">
                                      {isAr ? "فاتورة مورد محملة" : "Chargeback"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs">{cb.description || cb.reason || "—"}</TableCell>
                                  <TableCell className="text-xs tabular-nums font-bold text-destructive">
                                    {money(cb.amount)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-[10px]">
                                      {cb.status}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                              {subM.fines.map((f: any) => (
                                <TableRow key={f.id}>
                                  <TableCell className="text-xs font-semibold">
                                    <Badge variant="destructive" className="text-[10px]">
                                      {isAr ? "غرامة جزائية" : "Fine"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs">{f.reason || "—"}</TableCell>
                                  <TableCell className="text-xs tabular-nums font-bold text-destructive">
                                    {money(f.amount)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-[10px]">
                                      {f.status}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </>
                          )}
                        </TableBody>
                      </Table>
                    </Card>
                  </TabsContent>
                </Tabs>
              );
            })()}
          </DialogContent>
        </Dialog>
      )}

      {/* Dialogs */}
      {(addingSub || editingSub) && (
        <SubcontractorDialog
          projectId={projectId}
          row={editingSub}
          onClose={() => {
            setAddingSub(false);
            setEditingSub(null);
          }}
        />
      )}

      {(addingContract || editingContract) && (
        <SubcontractorContractDialog
          projectId={projectId}
          row={editingContract}
          defaultSubcontractorId={targetSubIdForContract}
          onClose={() => {
            setAddingContract(false);
            setEditingContract(null);
            setTargetSubIdForContract(undefined);
          }}
        />
      )}

      {addingCert && ctx && (
        <SubCertDialog
          ctx={ctx}
          defaultProjectId={projectId}
          row={null}
          defaultSubcontractorId={targetSubIdForCert}
          chargebacks={allChargebacks}
          fines={allFines}
          allRows={allCertificates}
          orders={overview?.orders ?? []}
          onRequestOrder={(certId) => navigate(`/payments?tab=orders&project=${projectId}&focus=${certId}`)}
          onClose={() => {
            setAddingCert(false);
            setTargetSubIdForCert(undefined);
          }}
        />
      )}

      <MaterialIssueDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        projectId={projectId}
        warehouses={warehouses}
      />
    </div>
  );
}
