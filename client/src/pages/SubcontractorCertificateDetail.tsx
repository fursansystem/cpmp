import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  HardHat,
  Save,
  Send,
  CheckCircle2,
  XCircle,
  Ban,
  Banknote,
  Building2,
  MapPin,
  Plus,
  AlertTriangle,
  FileText,
  Calendar,
  Layers,
  ShieldCheck,
  Receipt,
  Wallet,
  Clock,
  Pencil,
  Check,
  Percent,
  ClipboardList,
  Download,
  Printer,
  ExternalLink,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { computeSubCert, OPEN_PAYMENT_ORDER } from "@shared/payments";
import {
  computeBoqLine,
  summarizeBoqLines,
  validateCertificateBoqLine,
  type CertificateBoqLineDto,
} from "@shared/subcontractor-boq";
import { CertificateBoqTable } from "@/components/payments/certificate-boq-table";
import { ContractBoqEditor } from "@/components/payments/contract-boq-editor";
import {
  exportCertificateBoqExcel,
  printSubcontractorCertificate,
  type CertExportMeta,
} from "@/components/payments/subcontractor-cert-export";
import {
  SubcontractorSelect,
  SubcontractorContractDialog,
  WorkLocationPickerDialog,
  GroupedLocationBadges,
  useSubcontractorContracts,
  type SubcontractorRow,
  type SubcontractorContractRow,
} from "@/components/payments/subcontractor-select";
import {
  LatestActivity,
  AttachmentsPanel,
  StatusBadge,
  errorMessage,
  fmtDate,
  invalidatePayments,
  money,
  paymentsQuery,
  getJson,
  useSystemVatRate,
  type PaymentsContext,
  type PaymentsOverview,
} from "@/components/payments/payments-common";

const num = (v: unknown) => Number(v ?? 0) || 0;
const DEFAULT_VAT = "15";

const emptyForm = (vat = DEFAULT_VAT) => ({
  subcontractorId: "",
  contractId: "",
  workLocationIds: [] as string[],
  scope: "",
  contractValue: "",
  periodFrom: "",
  periodTo: "",
  grossAmount: "",
  retentionPercent: "10",
  advanceRecovery: "",
  otherDeductions: "",
  deductionsNote: "",
  vatPercent: vat,
  notes: "",
});

export default function SubcontractorCertificateDetail() {
  const { t, i18n } = useTranslation("payments");
  const isAr = (i18n.language || "ar").startsWith("ar");
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const searchParams = new URLSearchParams(window.location.search);
  const initialProjectId = searchParams.get("project") || "";
  const initialSubId = searchParams.get("subcontractor") || "";
  const initialContractId = searchParams.get("contract") || "";

  // 1. Payments context & permissions
  const { data: ctx, isLoading: ctxLoading } = useQuery<PaymentsContext>({
    queryKey: ["payments", "context"],
    queryFn: () => getJson("/api/payments/context"),
    meta: paymentsQuery,
  });
  const systemVatRate = useSystemVatRate(ctx?.vatPercent ?? 15);

  // 2. Certificate data if editing
  const { data: certData, isLoading: certLoading } = useQuery<any>({
    queryKey: ["payments", "subcontractor-certificate", id],
    queryFn: () => getJson(`/api/payments/subcontractor-certificates/${id}`),
    enabled: !isNew && !!id,
    meta: paymentsQuery,
  });

  const [projectId, setProjectId] = useState<string>(initialProjectId);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addingContract, setAddingContract] = useState(false);
  const [viewContractId, setViewContractId] = useState<string>("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickedFines, setPickedFines] = useState<Set<string>>(new Set());
  const [boqLines, setBoqLines] = useState<CertificateBoqLineDto[]>([]);
  const [managingContractBoq, setManagingContractBoq] = useState(false);
  const loadedBoqKeyRef = useRef<string>("");

  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    if (certData && !isNew) {
      setProjectId(certData.projectId || "");
      setViewContractId(certData.contractId ?? "");
      setForm({
        subcontractorId: certData.subcontractorId ?? "",
        contractId: certData.contractId ?? "",
        workLocationIds: (certData.workLocationIds ?? []) as string[],
        scope: certData.scope ?? "",
        contractValue: String(num(certData.contractValue) || ""),
        periodFrom: certData.periodFrom ?? "",
        periodTo: certData.periodTo ?? "",
        grossAmount: String(num(certData.grossAmount) || ""),
        retentionPercent: String(num(certData.retentionPercent)),
        advanceRecovery: String(num(certData.advanceRecovery) || ""),
        otherDeductions: String(num(certData.otherDeductions) || ""),
        deductionsNote: certData.deductionsNote ?? "",
        vatPercent: String(num(certData.vatPercent)),
        notes: certData.notes ?? "",
      });
      if (Array.isArray(certData.boqLines)) {
        setBoqLines(certData.boqLines);
        loadedBoqKeyRef.current = `${id}:${certData.contractId ?? ""}`;
      }
    } else if (isNew) {
      if (initialProjectId) setProjectId(initialProjectId);
      if (initialSubId) setForm((f) => ({ ...f, subcontractorId: initialSubId }));
      if (initialContractId) {
        setForm((f) => ({ ...f, contractId: initialContractId }));
        setViewContractId(initialContractId);
      }
      setForm((f) => ({ ...f, vatPercent: String(systemVatRate) }));
    }
  }, [certData, isNew, id, initialProjectId, initialSubId, initialContractId, systemVatRate]);

  const setField = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // 3. Project Overview for financial history & linked entities
  const effectiveProjectId = projectId || (certData?.projectId ?? "");
  const { data: overview, isLoading: overviewLoading } = useQuery<PaymentsOverview>({
    queryKey: ["payments", "overview", effectiveProjectId],
    queryFn: () => getJson(`/api/payments/overview?projectId=${effectiveProjectId}`),
    enabled: !!effectiveProjectId,
    meta: paymentsQuery,
  });

  // 4. Contracts & Work locations for the selected project
  const { data: contracts = [] } = useSubcontractorContracts(effectiveProjectId);
  const { data: workLocations = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", effectiveProjectId, "work-locations"],
    enabled: !!effectiveProjectId,
  });

  const isOwner = isNew || certData?.createdBy === user?.id || ctx?.perms?.isAccounting;
  const editable = isOwner && (isNew || ["draft", "rejected"].includes(certData?.status));

  // 5. Contract BOQ Preview & Strict Sequential Check
  const {
    data: boqPreview,
    refetch: refetchBoqPreview,
    isFetching: boqPreviewFetching,
  } = useQuery<{
    contractId: string;
    contractNo: string;
    defaultBillingMode: string;
    hasBoq: boolean;
    lines: CertificateBoqLineDto[];
    openCertificate: { id: string; certNo: string; status: string } | null;
  }>({
    queryKey: ["payments", "contract-boq-preview", form.contractId, isNew ? "new" : id],
    queryFn: () =>
      getJson(
        `/api/payments/subcontractor-contracts/${form.contractId}/boq-preview${!isNew && id ? `?excludeCertId=${id}` : ""}`,
      ),
    enabled: Boolean(form.contractId && editable),
    meta: paymentsQuery,
  });

  // Load contract BOQ into certificate automatically when selecting a contract on a new/draft certificate
  useEffect(() => {
    if (!editable) return;
    if (!form.contractId) {
      if (boqLines.length > 0) setBoqLines([]);
      loadedBoqKeyRef.current = "";
      return;
    }
    if (!boqPreview || boqPreview.contractId !== form.contractId) return;
    const key = `${isNew ? "new" : id}:${form.contractId}`;
    const alreadyLoadedSavedLines =
      !isNew && certData?.contractId === form.contractId && Array.isArray(certData?.boqLines) && certData.boqLines.length > 0;

    if (loadedBoqKeyRef.current !== key) {
      loadedBoqKeyRef.current = key;
      if (!alreadyLoadedSavedLines) {
        setBoqLines(boqPreview.hasBoq ? boqPreview.lines : []);
      }
    } else if (!alreadyLoadedSavedLines && boqLines.length === 0 && boqPreview.hasBoq && boqPreview.lines.length > 0) {
      setBoqLines(boqPreview.lines);
    }
  }, [editable, form.contractId, boqPreview, isNew, id, certData, boqLines.length]);

  // Merge fresh contract BOQ (e.g. newly added VOs or updated Previous) while preserving user's current period inputs
  const syncBoqFromContract = async () => {
    if (!form.contractId) return;
    const res = await refetchBoqPreview();
    const fresh = res.data;
    if (!fresh) return;
    if (!fresh.hasBoq) {
      setBoqLines([]);
      return;
    }
    const existingByItemId = new Map(
      boqLines.filter((l) => l.contractBoqItemId).map((l) => [l.contractBoqItemId as string, l]),
    );
    const merged: CertificateBoqLineDto[] = fresh.lines.map((fl) => {
      const ex = fl.contractBoqItemId ? existingByItemId.get(fl.contractBoqItemId) : undefined;
      if (!ex) return fl;
      const computed = computeBoqLine({
        billingMode: fl.billingMode,
        contractQty: fl.contractQty,
        unitRate: fl.unitRate,
        contractAmount: fl.contractAmount,
        previousQty: fl.previousQty,
        previousPercent: fl.previousPercent,
        previousAmount: fl.previousAmount,
        source: "current",
        currentQty: ex.currentQty,
        currentPercent: ex.currentPercent,
      });
      return {
        ...fl,
        previousQty: computed.previousQty,
        currentQty: computed.currentQty,
        cumulativeQty: computed.cumulativeQty,
        previousPercent: computed.previousPercent,
        currentPercent: computed.currentPercent,
        cumulativePercent: computed.cumulativePercent,
        previousAmount: computed.previousAmount,
        currentAmount: computed.currentAmount,
        cumulativeAmount: computed.cumulativeAmount,
        notes: ex.notes ?? fl.notes,
      };
    });
    setBoqLines(merged);
    toast({
      title: isAr ? "تمت مزامنة جدول الكميات مع العقد" : "Synced BOQ lines with Contract",
    });
  };

  const hasBoq = boqLines.length > 0;
  const boqSummary = useMemo(() => (hasBoq ? summarizeBoqLines(boqLines) : null), [hasBoq, boqLines]);
  const hasBoqValidationErrors = useMemo(
    () =>
      hasBoq &&
      boqLines.some(
        (l) =>
          validateCertificateBoqLine({
            billingMode: l.billingMode,
            cumulativeQty: l.cumulativeQty,
            cumulativePercent: l.cumulativePercent,
          }).length > 0,
      ),
    [hasBoq, boqLines],
  );
  const openCertBlocker = editable && boqPreview?.openCertificate ? boqPreview.openCertificate : null;

  const subContracts = useMemo(
    () =>
      form.subcontractorId
        ? contracts.filter(
            (c) =>
              c.subcontractorId === form.subcontractorId &&
              (c.status === "active" || c.id === form.contractId)
          )
        : [],
    [contracts, form.subcontractorId, form.contractId]
  );

  const allSubContracts = useMemo(
    () => (form.subcontractorId ? contracts.filter((c) => c.subcontractorId === form.subcontractorId) : []),
    [contracts, form.subcontractorId]
  );

  const sumOfSubContractsValue = useMemo(
    () => allSubContracts.reduce((s, c) => s + num(c.contractValue), 0),
    [allSubContracts]
  );

  const activeContractId = editable ? form.contractId : viewContractId;

  const selectedContract = useMemo(
    () => subContracts.find((c) => c.id === activeContractId),
    [subContracts, activeContractId]
  );

  // Auto-apply initial contract or default sum of contracts for a new certificate once contracts load
  useEffect(() => {
    if (!isNew || !form.subcontractorId || contracts.length === 0) return;
    if (form.contractId) {
      const c = contracts.find((x) => x.id === form.contractId);
      if (c && !form.contractValue) {
        setForm((f) => ({
          ...f,
          scope: c.scope || f.scope,
          contractValue: String(num(c.contractValue) || ""),
          retentionPercent: String(num(c.retentionPercent)),
          vatPercent: String(num(c.vatPercent)),
          workLocationIds: f.workLocationIds.length ? f.workLocationIds : (c.workLocationIds?.length ? [...c.workLocationIds] : []),
        }));
      }
    } else if (!form.contractValue && sumOfSubContractsValue > 0) {
      setForm((f) => ({
        ...f,
        contractValue: String(sumOfSubContractsValue),
      }));
    }
  }, [isNew, form.subcontractorId, form.contractId, form.contractValue, contracts, sumOfSubContractsValue]);

  const availableLocations = useMemo(() => {
    if (selectedContract?.workLocationIds?.length) {
      const setIds = new Set(selectedContract.workLocationIds);
      return workLocations.filter((l) => setIds.has(l.id));
    }
    return workLocations;
  }, [workLocations, selectedContract]);

  const applyContract = (c: SubcontractorContractRow | undefined) => {
    setViewContractId(c?.id ?? "");
    if (!editable) return;
    if (!c) {
      setForm((f) => ({
        ...f,
        contractId: "",
        workLocationIds: [],
        contractValue: sumOfSubContractsValue > 0 ? String(sumOfSubContractsValue) : "",
      }));
      return;
    }
    setForm((f) => ({
      ...f,
      contractId: c.id,
      scope: c.scope || f.scope,
      contractValue: String(num(c.contractValue) || ""),
      retentionPercent: String(num(c.retentionPercent)),
      vatPercent: String(num(c.vatPercent)),
      workLocationIds: c.workLocationIds?.length ? [...c.workLocationIds] : [],
    }));
  };

  const onSubChange = (id: string, sub?: SubcontractorRow) => {
    const subAllCnts = contracts.filter((c) => c.subcontractorId === id);
    const activeCnts = subAllCnts.filter((c) => c.status === "active");
    const sumVal = subAllCnts.reduce((s, c) => s + num(c.contractValue), 0);
    const match = overview?.subcontractorCertificates?.find(
      (r) => r.projectId === effectiveProjectId && r.subcontractorId === id
    );
    setPicked(new Set());
    setPickedFines(new Set());
    if (isNew && activeCnts.length === 1) {
      const c = activeCnts[0];
      setViewContractId(c.id);
      setForm((f) => ({
        ...f,
        subcontractorId: id,
        contractId: c.id,
        scope: c.scope || sub?.scope || f.scope,
        contractValue: String(num(c.contractValue) || ""),
        retentionPercent: String(num(c.retentionPercent)),
        vatPercent: String(num(c.vatPercent)),
        workLocationIds: c.workLocationIds?.length ? [...c.workLocationIds] : [],
      }));
      return;
    }
    setViewContractId("");
    setForm((f) => ({
      ...f,
      subcontractorId: id,
      contractId: "",
      workLocationIds: [],
      contractValue: sumVal > 0 ? String(sumVal) : (match && isNew ? String(num(match.contractValue) || "") : ""),
      ...(isNew && sub && !match ? { scope: f.scope || (sub.scope ?? "") } : {}),
      ...(match && isNew
        ? {
            scope: f.scope || (match.scope ?? ""),
            retentionPercent: String(num(match.retentionPercent)),
            vatPercent: String(num(match.vatPercent)),
          }
        : {}),
    }));
  };

  // Chargebacks & Fines
  const chargebacks = overview?.chargebacks ?? [];
  const fines = overview?.fines ?? [];

  const availableChargebacks = useMemo(
    () =>
      chargebacks.filter(
        (c) =>
          c.projectId === effectiveProjectId &&
          c.subcontractorId === form.subcontractorId &&
          (c.status === "approved" || (!isNew && c.status === "applied" && c.certificateId === id))
      ),
    [chargebacks, isNew, id, effectiveProjectId, form.subcontractorId]
  );

  useEffect(() => {
    if (certData && !isNew) {
      const initialPicked = new Set(
        chargebacks.filter((c) => c.status === "applied" && c.certificateId === id).map((c) => c.id)
      );
      setPicked(initialPicked);

      const initialFines = new Set(
        fines.filter((f) => f.deductedCertificateId === id && f.status === "open").map((f) => f.id)
      );
      setPickedFines(initialFines);
    }
  }, [certData, chargebacks, fines, id, isNew]);

  const pickedTotal = availableChargebacks
    .filter((c) => picked.has(c.id))
    .reduce((s, c) => s + num(c.amount), 0);

  const availableFines = useMemo(
    () =>
      fines.filter(
        (f) =>
          f.projectId === effectiveProjectId &&
          f.subcontractorId === form.subcontractorId &&
          f.status === "open" &&
          (!f.deductedCertificateId || (!isNew && f.deductedCertificateId === id))
      ),
    [fines, isNew, id, effectiveProjectId, form.subcontractorId]
  );

  const fineAmount = (f: any) => Math.max(0, num(f.amount) - num(f.paidAmount));
  const pickedFinesTotal = availableFines
    .filter((f) => pickedFines.has(f.id))
    .reduce((s, f) => s + fineAmount(f), 0);

  const chargebackTotal =
    !isNew && certData && !["draft", "rejected"].includes(certData.status)
      ? num(certData.chargebackDeductions)
      : pickedTotal + pickedFinesTotal;

  // Certificate computations (BOQ Current Total drives Work Value automatically when BOQ is present)
  const effectiveGrossAmount = hasBoq && boqSummary ? boqSummary.currentTotal : num(form.grossAmount);
  const figures = computeSubCert({
    grossAmount: effectiveGrossAmount,
    retentionPercent: num(form.retentionPercent),
    advanceRecovery: num(form.advanceRecovery),
    otherDeductions: num(form.otherDeductions),
    chargebackDeductions: chargebackTotal,
    vatPercent: num(form.vatPercent),
  });

  // Cumulative computations
  const allSubCerts = useMemo(() => {
    if (!overview?.subcontractorCertificates || !form.subcontractorId) return [];
    return overview.subcontractorCertificates.filter(
      (c) =>
        c.projectId === effectiveProjectId &&
        c.subcontractorId === form.subcontractorId &&
        (activeContractId ? c.contractId === activeContractId : true)
    );
  }, [overview?.subcontractorCertificates, form.subcontractorId, activeContractId, effectiveProjectId]);

  const previousCerts = useMemo(
    () => allSubCerts.filter((c) => c.id !== id),
    [allSubCerts, id]
  );

  const previousGross = useMemo(
    () =>
      previousCerts
        .filter((c) => ["approved", "paid"].includes(c.status))
        .reduce((s, c) => s + num(c.grossAmount), 0),
    [previousCerts]
  );

  const currentGrossForScope =
    !activeContractId || !form.contractId || activeContractId === form.contractId ? effectiveGrossAmount : 0;
  const cumulativeGross = hasBoq && boqSummary ? boqSummary.cumulativeTotal : previousGross + currentGrossForScope;
  const contractVal =
    hasBoq && boqSummary
      ? boqSummary.revisedContractTotal
      : selectedContract
        ? editable
          ? num(form.contractValue) || num(selectedContract.contractValue)
          : num(selectedContract.contractValue) || num(form.contractValue)
        : sumOfSubContractsValue > 0
          ? sumOfSubContractsValue
          : num(form.contractValue);
  const overContract = contractVal > 0 && cumulativeGross > contractVal + 0.005;
  const remainingContractVal = contractVal > 0 ? Math.max(0, contractVal - cumulativeGross) : 0;
  const progressPercent = contractVal > 0 ? Math.min(100, Math.round((cumulativeGross / contractVal) * 100)) : 0;

  // Payments / Orders history for this subcontractor (scoped to selected contract when a contract is selected)
  const subOrders = useMemo(() => {
    if (!overview?.orders || !form.subcontractorId) return [];
    const certIds = new Set(allSubCerts.map((c) => c.id));
    const subNameForMatch =
      overview?.subcontractors?.find((s) => s.id === form.subcontractorId)?.name ||
      certData?.subcontractorName ||
      "";
    return overview.orders.filter((o) => {
      if (o.projectId !== effectiveProjectId) return false;
      if (activeContractId) {
        return (
          o.subcontractorContractId === activeContractId ||
          (o.subcontractorCertificateId && certIds.has(o.subcontractorCertificateId))
        );
      }
      return (
        o.subcontractorId === form.subcontractorId ||
        (o.subcontractorCertificateId && certIds.has(o.subcontractorCertificateId)) ||
        (o.sourceType === "subcontractor" && o.sourceId === form.subcontractorId) ||
        (o.purpose === "subcontractor" && subNameForMatch && o.payeeName === subNameForMatch)
      );
    });
  }, [overview?.orders, overview?.subcontractors, certData?.subcontractorName, form.subcontractorId, activeContractId, allSubCerts, effectiveProjectId]);

  const totalPaidToDate = useMemo(() => {
    const ordersPaid = subOrders.filter((o) => o.status === "paid").reduce((s, o) => s + num(o.amount), 0);
    const unlinkedCertsPaid = allSubCerts
      .filter(
        (c) =>
          c.status === "paid" &&
          !subOrders.some((o) => o.subcontractorCertificateId === c.id && o.status === "paid")
      )
      .reduce((s, c) => s + num(c.netPayable), 0);
    return ordersPaid + unlinkedCertsPaid;
  }, [subOrders, allSubCerts]);

  const totalPendingOrders = useMemo(
    () =>
      subOrders
        .filter((o) => ["requested", "request_approved", "pending_approval", "approved"].includes(o.status))
        .reduce((s, o) => s + num(o.amount), 0),
    [subOrders]
  );

  // Cumulative retention to date (previous approved/paid certs + current cert if in scope)
  const currentInScope = !activeContractId || !form.contractId || activeContractId === form.contractId;
  const totalRetentionToDate = useMemo(() => {
    const prev = previousCerts
      .filter((c) => ["approved", "paid"].includes(c.status))
      .reduce((s, c) => s + num(c.retentionAmount), 0);
    return prev + (currentInScope ? figures.retentionAmount : 0);
  }, [previousCerts, currentInScope, figures.retentionAmount]);

  // Approved certs total net (including current cert figures if in scope) vs paid
  const totalApprovedNet = useMemo(() => {
    const prevNet = previousCerts
      .filter((c) => ["approved", "paid"].includes(c.status))
      .reduce((s, c) => s + num(c.netPayable), 0);
    const currentNet = !currentInScope || (!isNew && certData?.status === "cancelled") ? 0 : figures.netPayable;
    return prevNet + currentNet;
  }, [previousCerts, currentInScope, isNew, certData?.status, figures.netPayable]);

  const outstandingPayable = Math.max(0, totalApprovedNet - totalPaidToDate);

  // Form payload
  const body = () => ({
    ...form,
    contractId: form.contractId || null,
    workLocationIds: form.workLocationIds ?? [],
    scope: form.scope || null,
    periodFrom: form.periodFrom || null,
    periodTo: form.periodTo || null,
    deductionsNote: form.deductionsNote || null,
    notes: form.notes || null,
    contractValue: hasBoq && boqSummary ? boqSummary.revisedContractTotal : form.contractValue || 0,
    grossAmount: hasBoq && boqSummary ? boqSummary.currentTotal : form.grossAmount || 0,
    advanceRecovery: form.advanceRecovery || 0,
    otherDeductions: form.otherDeductions || 0,
    ...(hasBoq
      ? {
          boqLines: boqLines
            .filter((l) => Boolean(l.contractBoqItemId))
            .map((l) => ({
              contractBoqItemId: l.contractBoqItemId as string,
              source: "current" as const,
              currentQty: l.currentQty,
              currentPercent: l.currentPercent,
              notes: l.notes ?? null,
            })),
        }
      : {}),
  });

  const syncChargebacks = async (targetId: string) => {
    if (editable) {
      await apiRequest("POST", `/api/payments/subcontractor-certificates/${targetId}/chargebacks`, {
        ids: availableChargebacks.filter((c) => picked.has(c.id)).map((c) => c.id),
        fineIds: availableFines.filter((f) => pickedFines.has(f.id)).map((f) => f.id),
      });
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isNew) {
        const res = await apiRequest("POST", "/api/payments/subcontractor-certificates", {
          projectId: effectiveProjectId,
          ...body(),
        });
        const created = await res.json();
        await syncChargebacks(created.id);
        return created;
      } else {
        await syncChargebacks(id);
        await apiRequest("PATCH", `/api/payments/subcontractor-certificates/${id}`, body());
        return certData;
      }
    },
    onSuccess: (data) => {
      invalidatePayments(queryClient);
      toast({ title: isNew ? t("toasts.cert_created") : t("toasts.saved") });
      if (isNew && data?.id) {
        navigate(`/payments/certificates/${data.id}`, { replace: true });
      }
    },
    onError: (e) => toast({ title: t("errors.save_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  const actMutation = useMutation({
    mutationFn: async (v: { action: string; note?: string }) =>
      apiRequest("POST", `/api/payments/subcontractor-certificates/${id}/transition`, v),
    onSuccess: (_d, v) => {
      invalidatePayments(queryClient);
      const msg: Record<string, string> = {
        submit: t("toasts.cert_submitted"),
        approve: t("toasts.cert_approved"),
        reject: t("toasts.cert_rejected"),
        cancel: t("toasts.cert_cancelled"),
      };
      toast({ title: msg[v.action] });
      setRejecting(false);
    },
    onError: (e) => toast({ title: t("errors.action_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  const saveAndSubmitMutation = useMutation({
    mutationFn: async () => {
      if (isNew) {
        const res = await apiRequest("POST", "/api/payments/subcontractor-certificates", {
          projectId: effectiveProjectId,
          ...body(),
        });
        const created = await res.json();
        await syncChargebacks(created.id);
        await apiRequest("POST", `/api/payments/subcontractor-certificates/${created.id}/transition`, {
          action: "submit",
        });
        return created;
      } else {
        await syncChargebacks(id);
        await apiRequest("PATCH", `/api/payments/subcontractor-certificates/${id}`, body());
        await apiRequest("POST", `/api/payments/subcontractor-certificates/${id}/transition`, { action: "submit" });
        return certData;
      }
    },
    onSuccess: (data) => {
      invalidatePayments(queryClient);
      toast({ title: t("toasts.cert_submitted") });
      if (isNew && data?.id) {
        navigate(`/payments/certificates/${data.id}`, { replace: true });
      }
    },
    onError: (e) => toast({ title: t("errors.send_submit_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  const hasLiveOrder =
    !isNew && certData
      ? overview?.orders?.some(
          (o) =>
            o.subcontractorCertificateId === id &&
            ([...OPEN_PAYMENT_ORDER, "paid"] as string[]).includes(o.status)
        )
      : false;

  const ownCert = !isNew && certData?.createdBy === user?.id && user?.role !== "super_admin";

  if (ctxLoading || (!isNew && certLoading)) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const projectName =
    ctx?.projects?.find((p) => p.id === effectiveProjectId)?.name || certData?.projectName || "—";
  const subName =
    overview?.subcontractors?.find((s) => s.id === form.subcontractorId)?.name ||
    certData?.subcontractorName ||
    "";

  const exportMeta: CertExportMeta = {
    certNo: isNew ? (isAr ? "مسودة" : "DRAFT") : certData?.certNo || id || "",
    projectName,
    subcontractorName: subName || "—",
    contractNo: selectedContract?.contractNo ?? null,
    contractTitle: selectedContract?.title ?? null,
    scope: form.scope || null,
    periodFrom: form.periodFrom || null,
    periodTo: form.periodTo || null,
    status: isNew ? "draft" : certData?.status || "draft",
    contractValue: contractVal,
    grossAmount: effectiveGrossAmount,
    retentionPercent: num(form.retentionPercent),
    retentionAmount: figures.retentionAmount,
    advanceRecovery: num(form.advanceRecovery),
    otherDeductions: num(form.otherDeductions),
    chargebackDeductions: chargebackTotal,
    vatPercent: num(form.vatPercent),
    vatAmount: figures.vatAmount,
    netPayable: figures.netPayable,
    previousGross,
    cumulativeGross,
    createdByName: certData?.createdByName ?? user?.username ?? null,
    approvedByName: certData?.approvedByName ?? null,
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto" data-testid="page-subcontractor-certificate-detail">
      {/* 1. Header & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl h-9 px-3 gap-1.5"
            onClick={() => {
              if (effectiveProjectId) {
                navigate(`/projects/${effectiveProjectId}/subcontractors?tab=certificates`);
              } else {
                navigate(`/payments?tab=subcontractors`);
              }
            }}
          >
            {isAr ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
            <span>{isAr ? "العودة للمستخلصات" : "Back to Certificates"}</span>
          </Button>

          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <HardHat className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black font-display tracking-tight">
                {isNew ? (
                  <span>{isAr ? "مستخلص مقاول باطن جديد" : "New Subcontractor Certificate"}</span>
                ) : (
                  <span className="font-mono">{certData?.certNo || id}</span>
                )}
              </h1>
              {!isNew && certData?.status && <StatusBadge status={certData.status} group="sub_cert" />}
              {isNew && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                  {isAr ? "مسودة جديدة" : "New Draft"}
                </Badge>
              )}
              {hasBoq && (
                <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary gap-1 text-[11px]">
                  <ClipboardList className="w-3 h-3" />
                  {isAr ? `مرتبط بجدول الكميات (${boqLines.length})` : `BOQ-Driven (${boqLines.length})`}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {projectName} {subName ? ` · ${subName}` : ""}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {(hasBoq || !isNew) && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-xl"
                onClick={() => exportCertificateBoqExcel(exportMeta, boqLines, boqSummary, isAr)}
              >
                <Download className="w-4 h-4" />
                <span>{t("boq.export_excel", { defaultValue: isAr ? "تصدير إكسل" : "Export Excel" })}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-xl"
                onClick={() => printSubcontractorCertificate(exportMeta, boqLines, boqSummary, isAr)}
              >
                <Printer className="w-4 h-4" />
                <span>{t("boq.print_ipc", { defaultValue: isAr ? "طباعة المستخلص" : "Print IPC" })}</span>
              </Button>
            </>
          )}

          {editable && (
            <Button
              className="gap-1.5 rounded-xl shadow-sm"
              disabled={
                saveMutation.isPending ||
                !effectiveProjectId ||
                !form.subcontractorId ||
                Boolean(openCertBlocker) ||
                hasBoqValidationErrors
              }
              onClick={() => saveMutation.mutate()}
            >
              <Save className="w-4 h-4" />
              <span>{t("common.save")}</span>
            </Button>
          )}

          {editable && (
            <Button
              variant="outline"
              className="gap-1.5 rounded-xl"
              disabled={
                saveAndSubmitMutation.isPending ||
                saveMutation.isPending ||
                actMutation.isPending ||
                !effectiveProjectId ||
                !form.subcontractorId ||
                Boolean(openCertBlocker) ||
                hasBoqValidationErrors
              }
              onClick={() => saveAndSubmitMutation.mutate()}
            >
              <Send className="w-4 h-4" />
              <span>{t("certificates.send_for_approval")}</span>
            </Button>
          )}

          {!isNew && certData?.status === "submitted" && ctx?.perms?.canApprove && (
            <>
              <Button
                className="gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={actMutation.isPending || ownCert}
                title={ownCert ? t("certificates.cannot_approve_own") : undefined}
                onClick={() => actMutation.mutate({ action: "approve" })}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t("certificates.approve_cert")}</span>
              </Button>
              <Button
                variant="destructive"
                className="gap-1.5 rounded-xl"
                disabled={actMutation.isPending}
                onClick={() => setRejecting(true)}
              >
                <XCircle className="w-4 h-4" />
                <span>{t("certificates.reject_cert")}</span>
              </Button>
            </>
          )}

          {!isNew && certData?.status === "approved" && ctx?.perms?.isAccounting && !hasLiveOrder && (
            <Button
              className="gap-1.5 rounded-xl bg-primary text-primary-foreground"
              onClick={() => navigate(`/payments?tab=orders&project=${effectiveProjectId}&focus=${id}`)}
            >
              <Banknote className="w-4 h-4" />
              <span>{t("certificates.issue_order")}</span>
            </Button>
          )}

          {!isNew &&
            certData &&
            isOwner &&
            ["draft", "submitted", "rejected", "approved"].includes(certData.status) &&
            !hasLiveOrder && (
              <Button
                variant="ghost"
                className="gap-1.5 rounded-xl text-destructive hover:bg-destructive/10"
                disabled={actMutation.isPending}
                onClick={() => actMutation.mutate({ action: "cancel" })}
              >
                <Ban className="w-4 h-4" />
                <span>{t("certificates.cancel_cert")}</span>
              </Button>
            )}
        </div>
      </div>

      {/* Rejection Panel */}
      {rejecting && (
        <Card className="border-destructive/40 bg-destructive/5 rounded-2xl p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-destructive font-bold text-sm">
              <XCircle className="w-4 h-4" />
              <span>{t("certificates.reject_title")}</span>
            </div>
            <Textarea
              rows={2}
              placeholder={isAr ? "اكتب سبب رفض المستخلص بالتفصيل..." : "Enter reason for rejection..."}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setRejecting(false)}>
                {t("common.back_btn")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!rejectNote.trim() || actMutation.isPending}
                onClick={() => actMutation.mutate({ action: "reject", note: rejectNote })}
              >
                {t("certificates.reject_btn")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Reject Reason Notice */}
      {!isNew && certData?.rejectReason && certData?.status === "rejected" && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">{t("certificates.reject_reason_prefix")}</div>
            <div className="mt-1">{certData.rejectReason}</div>
          </div>
        </div>
      )}

      {/* Strict Sequential Lock Banner */}
      {openCertBlocker && (
        <div
          className="rounded-2xl border-2 border-amber-500/50 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3"
          data-testid="strict-sequential-banner"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-sm">
              <div className="font-bold text-amber-900 dark:text-amber-200">
                {isAr
                  ? `لا يمكن إنشاء مستخلص جديد: يوجد مستخلص مفتوح (${openCertBlocker.certNo}) على هذا العقد`
                  : `Strict Sequential Lock: Open Certificate (${openCertBlocker.certNo}) already exists on this contract`}
              </div>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "لضمان دقة الحصر التراكمي وعدم تكرار الصرف، يجب اعتماد المستخلص المفتوح أو إلغاؤه قبل فتح مستخلص جديد."
                  : "To guarantee accurate Previous vs Current BOQ carry-over and prevent double-billing, approve or cancel the open certificate first."}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="default"
            className="rounded-xl gap-1.5 shrink-0"
            onClick={() => navigate(`/payments/certificates/${openCertBlocker.id}`)}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{isAr ? `فتح ${openCertBlocker.certNo}` : `Open ${openCertBlocker.certNo}`}</span>
          </Button>
        </div>
      )}

      {/* 2. Top KPI Cards: Comprehensive Contract & Financial Overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Card 1: Contract Value */}
        <Card className="rounded-2xl border bg-card/50">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
              <span>{isAr ? "قيمة العقد" : "Contract Value"}</span>
              <FileText className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="text-lg font-black tabular-nums">{money(contractVal)}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {selectedContract
                ? selectedContract.contractNo
                : allSubContracts.length > 0
                  ? isAr
                    ? `مجموع العقود (${allSubContracts.length})`
                    : `Sum of ${allSubContracts.length} contracts`
                  : isAr
                    ? "عقد أساسي / تقديري"
                    : "Base / Estimate"}
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Cumulative Certified */}
        <Card className="rounded-2xl border bg-card/50">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
              <span>{isAr ? "المعتمد تراكمياً" : "Cumulative Certified"}</span>
              <Layers className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="text-lg font-black tabular-nums text-blue-600 dark:text-blue-400">
              {money(cumulativeGross)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {contractVal > 0 ? `${progressPercent}% ${isAr ? "من قيمة العقد" : "of contract"}` : "—"}
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Remaining Contract Value */}
        <Card className={`rounded-2xl border ${overContract ? "border-destructive/50 bg-destructive/5" : "bg-card/50"}`}>
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
              <span className={overContract ? "text-destructive font-bold" : ""}>
                {isAr ? "المتبقي من العقد" : "Remaining Contract"}
              </span>
              <Clock className={`w-3.5 h-3.5 ${overContract ? "text-destructive" : "text-amber-500"}`} />
            </div>
            <div className={`text-lg font-black tabular-nums ${overContract ? "text-destructive" : ""}`}>
              {money(remainingContractVal)}
            </div>
            <div className={`text-[11px] ${overContract ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
              {overContract ? (isAr ? "⚠️ تجاوز قيمة العقد!" : "⚠️ Over Contract!") : isAr ? "متاح للإنجاز" : "Available"}
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Current Net Payable */}
        <Card className="rounded-2xl border bg-primary/5 border-primary/30">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-primary text-xs font-bold">
              <span>{isAr ? "الصافي المستحق للمستخلص" : "Current Net Payable"}</span>
              <Receipt className="w-3.5 h-3.5 text-primary" />
            </div>
            <div
              className={`text-lg font-black tabular-nums ${
                figures.netPayable < 0 ? "text-destructive" : "text-primary"
              }`}
            >
              {money(figures.netPayable)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {isAr ? "الصافي بعد الاستقطاع والضريبة" : "Net after deductions & VAT"}
            </div>
          </CardContent>
        </Card>

        {/* Card 5: Total Paid to Date */}
        <Card className="rounded-2xl border bg-card/50">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
              <span>{isAr ? "المصروف فعلياً" : "Total Paid"}</span>
              <Banknote className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="text-lg font-black tabular-nums text-emerald-600 dark:text-emerald-400">
              {money(totalPaidToDate)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {subOrders.filter((o) => o.status === "paid").length} {isAr ? "أوامر دفع مسددة" : "paid orders"}
            </div>
          </CardContent>
        </Card>

        {/* Card 6: Total Retention */}
        <Card className="rounded-2xl border bg-card/50">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
              <span>{isAr ? "الضمان المحتجز (حسن التنفيذ)" : "Retention Balance"}</span>
              <ShieldCheck className="w-3.5 h-3.5 text-violet-500" />
            </div>
            <div className="text-lg font-black tabular-nums text-violet-600 dark:text-violet-400">
              {money(totalRetentionToDate)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {isAr ? "محتجز للإفراج النهائي" : "Held until final handover"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2.5 Full-Width BOQ Valuation Section (Drives Work Value automatically when Contract has a BOQ) */}
      {hasBoq ? (
        <CertificateBoqTable
          lines={boqLines}
          editable={Boolean(editable && !openCertBlocker)}
          onChangeLines={setBoqLines}
          onSyncFromContract={editable && form.contractId ? syncBoqFromContract : undefined}
          syncing={boqPreviewFetching}
          onManageContractBoq={form.contractId ? () => setManagingContractBoq(true) : undefined}
          contractNo={selectedContract?.contractNo ?? null}
        />
      ) : editable && form.contractId && !openCertBlocker ? (
        <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/[0.03] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-foreground">
                {isAr ? "لا يوجد جدول كميات (BOQ) مرتبط بهذا العقد بعد" : "No BOQ defined for this contract yet"}
              </div>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "يمكنك إدخال قيمة الأعمال يدوياً أدناه، أو إنشاء جدول كميات (كميات أو نسب إنجاز) ليحتسب المستخلصات تلقائياً."
                  : "You can enter Work Value manually below, or set up a Contract BOQ (Qty / Progress %) to auto-calculate Work Value across certificates."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-xl gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => setManagingContractBoq(true)}
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? "إعداد جدول كميات العقد (BOQ)" : "Setup Contract BOQ"}</span>
          </Button>
        </div>
      ) : null}

      {/* 3. Main Grid: Left Column (Certificate Form & Calculations) / Right Column (Financial History & Context) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* ======================================================== */}
        {/* LEFT COLUMN: The Certificate Details & Form (7 Columns)  */}
        {/* ======================================================== */}
        <div className="xl:col-span-7 space-y-6">
          {/* Card: Contractual Information */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                <span>{isAr ? "البيانات التعاقدية ونطاق العمل" : "Contractual & Scope Details"}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Project */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t("common.project")}</Label>
                  <Select
                    value={effectiveProjectId}
                    onValueChange={(val) => {
                      setProjectId(val);
                      setForm((f) => ({ ...f, contractId: "", workLocationIds: [] }));
                    }}
                    disabled={!isNew}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder={t("common.select_project")} />
                    </SelectTrigger>
                    <SelectContent>
                      {ctx?.projects?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Subcontractor */}
                <div className="space-y-1.5 sm:col-span-1">
                  <Label>{t("certificates.subcontractor")}</Label>
                  <SubcontractorSelect
                    projectId={effectiveProjectId}
                    value={form.subcontractorId}
                    disabled={!editable}
                    onChange={onSubChange}
                  />
                </div>

                {/* Contract Selection */}
                <div className="space-y-1.5 sm:col-span-1">
                  <Label>{t("contracts.select_label")}</Label>
                  <Select
                    value={activeContractId || "__none__"}
                    disabled={!form.subcontractorId}
                    onValueChange={(v) => {
                      if (v === "__new__") setAddingContract(true);
                      else applyContract(subContracts.find((c) => c.id === v));
                    }}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder={t("contracts.select_placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("contracts.no_contract")}</SelectItem>
                      {subContracts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.contractNo} — {c.title}
                        </SelectItem>
                      ))}
                      {editable && effectiveProjectId && (
                        <SelectItem value="__new__">
                          <span className="flex items-center gap-1 font-semibold text-primary">
                            <Plus className="w-3.5 h-3.5" /> {t("contracts.new_inline")}
                          </span>
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>

                  {addingContract && (
                    <SubcontractorContractDialog
                      projectId={effectiveProjectId}
                      onClose={() => setAddingContract(false)}
                      onSaved={(saved) => {
                        setAddingContract(false);
                        applyContract(saved);
                      }}
                    />
                  )}
                </div>

                {/* Work Locations / Buildings */}
                <div className="space-y-2 sm:col-span-2 rounded-xl border border-border/60 p-3 bg-muted/10">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="flex items-center gap-1.5 font-bold text-xs">
                      <Building2 className="w-4 h-4 text-primary" />
                      {t("contracts.assigned_buildings")}
                    </Label>
                    {editable && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5 rounded-xl"
                        onClick={() => setPickerOpen(true)}
                        disabled={!effectiveProjectId}
                      >
                        <MapPin className="w-3.5 h-3.5 text-primary" />
                        <span>{isAr ? "تحديد مواقع العمل" : "Add Work Locations"}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {form.workLocationIds.length} {isAr ? "محدد" : "selected"}
                        </Badge>
                      </Button>
                    )}
                  </div>
                  {form.workLocationIds.length > 0 ? (
                    <GroupedLocationBadges
                      locations={workLocations.filter((l) => form.workLocationIds.includes(l.id))}
                      onRemoveOne={(locId) => {
                        if (!editable) return;
                        setForm((f) => ({ ...f, workLocationIds: f.workLocationIds.filter((x) => x !== locId) }));
                      }}
                      onRemoveMany={
                        editable
                          ? (ids) => {
                              const removeSet = new Set(ids);
                              setForm((f) => ({
                                ...f,
                                workLocationIds: f.workLocationIds.filter((x) => !removeSet.has(x)),
                              }));
                            }
                          : undefined
                      }
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("subcontractors.all_locations_allowed")}</p>
                  )}
                  <WorkLocationPickerDialog
                    open={pickerOpen}
                    onOpenChange={setPickerOpen}
                    locations={availableLocations}
                    selectedIds={form.workLocationIds}
                    onChangeSelectedIds={(ids) => setForm((f) => ({ ...f, workLocationIds: ids }))}
                    multiple={true}
                    title={isAr ? "إضافة مواقع العمل والمباني" : "Add Work Locations"}
                  />
                </div>

                {/* Scope of Work */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t("certificates.scope")}</Label>
                  <Input
                    className="rounded-xl"
                    value={form.scope}
                    disabled={!editable}
                    onChange={(e) => setField("scope")(e.target.value)}
                    placeholder={t("certificates.scope_placeholder")}
                  />
                </div>

                {/* Period From & To */}
                <div className="space-y-1.5 sm:col-span-1">
                  <Label>{t("certificates.period_from")}</Label>
                  <Input
                    type="date"
                    className="rounded-xl"
                    value={form.periodFrom}
                    disabled={!editable}
                    onChange={(e) => setField("periodFrom")(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-1">
                  <Label>{t("certificates.period_to")}</Label>
                  <Input
                    type="date"
                    className="rounded-xl"
                    value={form.periodTo}
                    disabled={!editable}
                    onChange={(e) => setField("periodTo")(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Financial Values, Deductions & Calculation */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Receipt className="w-4 h-4 text-primary" />
                <span>{isAr ? "الحسابات المالية للمستخلص الحالي" : "Current Certificate Financials"}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Contract Value */}
                <div className="space-y-1.5 sm:col-span-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label>{t("certificates.contract_value")}</Label>
                    {hasBoq && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
                        <Lock className="w-3 h-3" />
                        {t("boq.derived_from_boq", { defaultValue: isAr ? "من جدول الكميات" : "From BOQ" })}
                      </span>
                    )}
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="rounded-xl"
                    value={hasBoq && boqSummary ? String(boqSummary.revisedContractTotal) : form.contractValue}
                    disabled={!editable || hasBoq}
                    onChange={(e) => setField("contractValue")(e.target.value)}
                  />
                </div>

                {/* Gross Amount (Work Value in this certificate) */}
                <div className="space-y-1.5 sm:col-span-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="font-bold text-primary">{t("certificates.work_value")}</Label>
                    {hasBoq && (
                      <Badge variant="secondary" className="text-[10px] h-5 bg-primary/10 text-primary gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        {t("boq.derived_from_boq", { defaultValue: isAr ? "محسوبة من BOQ" : "Calculated from BOQ" })}
                      </Badge>
                    )}
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="rounded-xl font-bold border-primary/40 focus:border-primary"
                    value={hasBoq && boqSummary ? String(boqSummary.currentTotal) : form.grossAmount}
                    disabled={!editable || hasBoq}
                    onChange={(e) => setField("grossAmount")(e.target.value)}
                  />
                </div>

                {/* Retention % */}
                <div className="space-y-1.5 sm:col-span-1">
                  <Label>{t("certificates.retention_pct")}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      className="rounded-xl flex-1"
                      value={form.retentionPercent}
                      disabled={!editable}
                      onChange={(e) => setField("retentionPercent")(e.target.value)}
                    />
                    <span className="shrink-0 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground font-semibold tabular-nums">
                      = {money(figures.retentionAmount)}
                    </span>
                  </div>
                </div>

                {/* VAT Applied / Not Applied */}
                <div className="space-y-1.5 sm:col-span-1">
                  <Label>{t("certificates.vat_pct")}</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={num(form.vatPercent) > 0 ? "applied" : "not_applied"}
                      disabled={!editable}
                      onValueChange={(v) =>
                        setField("vatPercent")(v === "applied" ? String(systemVatRate) : "0")
                      }
                    >
                      <SelectTrigger className="rounded-xl flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="applied">
                          {isAr
                            ? `مطبقة (${num(form.vatPercent) > 0 ? num(form.vatPercent) : systemVatRate}%)`
                            : `Applied (${num(form.vatPercent) > 0 ? num(form.vatPercent) : systemVatRate}%)`}
                        </SelectItem>
                        <SelectItem value="not_applied">
                          {isAr ? "غير مطبقة (0%)" : "Not Applied (0%)"}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="shrink-0 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground font-semibold tabular-nums">
                      = {money(figures.vatAmount)}
                    </span>
                  </div>
                </div>

                {/* Advance Recovery */}
                <div className="space-y-1.5 sm:col-span-1">
                  <Label>{t("certificates.advance_recovery")}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="rounded-xl"
                    value={form.advanceRecovery}
                    disabled={!editable}
                    onChange={(e) => setField("advanceRecovery")(e.target.value)}
                  />
                </div>

                {/* Other Deductions */}
                <div className="space-y-1.5 sm:col-span-1">
                  <Label>{t("certificates.other_deductions")}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="rounded-xl"
                    value={form.otherDeductions}
                    disabled={!editable}
                    onChange={(e) => setField("otherDeductions")(e.target.value)}
                  />
                </div>

                {/* Deductions Note */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t("certificates.deductions_note")}</Label>
                  <Input
                    className="rounded-xl"
                    value={form.deductionsNote}
                    disabled={!editable}
                    onChange={(e) => setField("deductionsNote")(e.target.value)}
                    placeholder={t("certificates.deductions_note_placeholder")}
                  />
                </div>

                {/* General Notes */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t("common.notes")}</Label>
                  <Textarea
                    rows={2}
                    className="rounded-xl"
                    value={form.notes}
                    disabled={!editable}
                    onChange={(e) => setField("notes")(e.target.value)}
                  />
                </div>
              </div>

              {/* Deductions & Chargebacks Panel */}
              {(availableChargebacks.length > 0 || availableFines.length > 0 || chargebackTotal > 0) && (
                <div className="mt-4 rounded-xl border border-muted/70 bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center justify-between font-bold text-sm">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      {t("certificates.charges_title")}
                    </span>
                    <span className="tabular-nums text-primary">{money(chargebackTotal)}</span>
                  </div>

                  {editable ? (
                    <div className="space-y-2">
                      {availableChargebacks.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-3 text-sm p-2 rounded-lg bg-card/60 hover:bg-card border border-border/40 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded accent-primary"
                            checked={picked.has(c.id)}
                            onChange={(e) => {
                              const next = new Set(picked);
                              if (e.target.checked) next.add(c.id);
                              else next.delete(c.id);
                              setPicked(next);
                            }}
                          />
                          <span className="font-mono text-xs">{c.chargeNo}</span>
                          <span className="text-xs">
                            {t("certificates.invoice")} <span className="font-mono">{c.invoiceNo}</span> (
                            {c.payeeName})
                          </span>
                          <span className="ms-auto tabular-nums font-semibold">{money(c.amount)}</span>
                        </label>
                      ))}

                      {availableFines.map((f) => (
                        <label
                          key={f.id}
                          className="flex items-center gap-3 text-sm p-2 rounded-lg bg-card/60 hover:bg-card border border-border/40 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded accent-primary"
                            checked={pickedFines.has(f.id)}
                            onChange={(e) => {
                              const next = new Set(pickedFines);
                              if (e.target.checked) next.add(f.id);
                              else next.delete(f.id);
                              setPickedFines(next);
                            }}
                          />
                          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                            {t("certificates.fine")}
                          </span>
                          <span className="text-xs">{f.title}</span>
                          <span className="ms-auto tabular-nums font-semibold">{money(fineAmount(f))}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1.5 text-xs">
                      {chargebacks
                        .filter((c) => c.certificateId === id && c.status === "applied")
                        .map((c) => (
                          <div key={c.id} className="flex justify-between py-1 border-b border-border/30">
                            <span>
                              {c.chargeNo} · {t("certificates.invoice")} {c.invoiceNo}
                            </span>
                            <span className="font-semibold tabular-nums">{money(c.amount)}</span>
                          </div>
                        ))}
                      {fines
                        .filter((f) => f.deductedCertificateId === id)
                        .map((f) => (
                          <div key={f.id} className="flex justify-between py-1 border-b border-border/30">
                            <span>
                              {t("certificates.fine")}: {f.title}
                            </span>
                            <span className="font-semibold tabular-nums">{money(fineAmount(f))}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* Equation Calculation Banner */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2 mt-4">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {isAr ? "معادلة احتساب صافي المستحق للمستخلص" : "Net Calculation Breakdown"}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                  <div className="p-2 rounded-lg bg-card/80 border">
                    <div className="text-[10px] text-muted-foreground">{t("certificates.tile_work_value")}</div>
                    <div className="text-sm font-black tabular-nums">{money(effectiveGrossAmount)}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-card/80 border text-destructive">
                    <div className="text-[10px] text-muted-foreground">{t("certificates.tile_retention")}</div>
                    <div className="text-sm font-black tabular-nums">− {money(figures.retentionAmount)}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-card/80 border text-destructive">
                    <div className="text-[10px] text-muted-foreground">
                      {isAr ? "المقدمة والخصومات" : "Advance & Deductions"}
                    </div>
                    <div className="text-sm font-black tabular-nums">
                      − {money(num(form.advanceRecovery) + num(form.otherDeductions) + chargebackTotal)}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-card/80 border text-emerald-600 dark:text-emerald-400">
                    <div className="text-[10px] text-muted-foreground">{t("certificates.tile_vat")}</div>
                    <div className="text-sm font-black tabular-nums">+ {money(figures.vatAmount)}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-primary/20 pt-3 mt-2">
                  <span className="font-black text-sm">{t("certificates.net_payable")}:</span>
                  <span
                    className={`text-xl font-black tabular-nums ${
                      figures.netPayable < 0 ? "text-destructive" : "text-primary"
                    }`}
                  >
                    {money(figures.netPayable)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Attachments & Audit Activity */}
          {!isNew && certData && (
            <>
              <Card className="rounded-2xl shadow-sm">
                <CardHeader className="pb-3 border-b border-border/40">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span>{isAr ? "المرفقات والمستندات الداعمة" : "Attachments & Documents"}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5">
                  <AttachmentsPanel
                    entityType="subcontractor_certificate"
                    entityId={id}
                    projectId={certData.projectId}
                    files={certData.attachments ?? []}
                    editable={!["paid", "cancelled"].includes(certData.status)}
                    hint={t("certificates.hint_attachments")}
                    canRemove={(f) => Boolean(f.uploadedBy === user?.id || ctx?.perms?.isAccounting)}
                  />
                </CardContent>
              </Card>

              <LatestActivity entityType="subcontractor_certificate" entityId={id} group="sub_cert" />
            </>
          )}
        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: Financial History & Context (5 Columns)    */}
        {/* ======================================================== */}
        <div className="xl:col-span-5 space-y-6">
          {/* Card: Contractor Financial Balance Breakdown */}
          <Card className="rounded-2xl shadow-sm border-2 border-primary/20 bg-card">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base font-bold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-primary" />
                  <span>{isAr ? "كشف الرصيد المتبقي للمقاول" : "Contractor Balance Summary"}</span>
                </span>
                {subName && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {subName}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between items-center py-1 border-b border-border/30">
                  <span className="text-muted-foreground">{isAr ? "قيمة العقد الإجمالية" : "Total Contract Value"}</span>
                  <span className="font-bold tabular-nums">{money(contractVal)}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border/30 text-blue-600 dark:text-blue-400">
                  <span>{isAr ? "(−) الأعمال المعتمدة تراكمياً" : "(−) Cumulative Certified"}</span>
                  <span className="font-bold tabular-nums">− {money(cumulativeGross)}</span>
                </div>
                <div
                  className={`flex justify-between items-center py-2 px-3 rounded-xl font-bold ${
                    overContract ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                  }`}
                >
                  <span>{isAr ? "(=) المتبقي من قيمة العقد للتنفيذ" : "(=) Remaining Contract Value"}</span>
                  <span className="text-base tabular-nums">{money(remainingContractVal)}</span>
                </div>

                <div className="pt-2" />

                <div className="flex justify-between items-center py-1 border-b border-border/30">
                  <span className="text-muted-foreground">
                    {isAr ? "إجمالي المستخلصات المعتمدة (صافي)" : "Total Certified Net"}
                  </span>
                  <span className="font-bold tabular-nums">{money(totalApprovedNet)}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border/30 text-emerald-600 dark:text-emerald-400">
                  <span>{isAr ? "(−) المبالغ المصروفة فعلياً للمقاول" : "(−) Total Disbursed"}</span>
                  <span className="font-bold tabular-nums">− {money(totalPaidToDate)}</span>
                </div>
                <div className="flex justify-between items-center py-2 px-3 rounded-xl bg-muted/60 font-bold">
                  <span>{isAr ? "(=) صافي المستحق المعتمد غير المصروف" : "(=) Outstanding Certified Balance"}</span>
                  <span className="text-base tabular-nums text-foreground">{money(outstandingPayable)}</span>
                </div>

                <div className="flex justify-between items-center py-1 border-t border-border/40 text-violet-600 dark:text-violet-400">
                  <span>{isAr ? "ضمانات حسن التنفيذ المحتجزة" : "Held Retentions"}</span>
                  <span className="font-bold tabular-nums">{money(totalRetentionToDate)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs: Previous Certificates & Payment Orders History */}
          <Card className="rounded-2xl shadow-sm">
            <Tabs defaultValue="certs" className="w-full">
              <CardHeader className="pb-0 border-b border-border/40">
                <TabsList className="w-full justify-start rounded-xl h-10 p-1 bg-muted/50">
                  <TabsTrigger value="certs" className="gap-1.5 rounded-lg text-xs font-bold">
                    <Layers className="w-3.5 h-3.5" />
                    <span>{isAr ? "المستخلصات السابقة" : "Previous Certs"}</span>
                    <Badge variant="secondary" className="ms-1 h-4 px-1 rounded-full text-[10px]">
                      {previousCerts.length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="orders" className="gap-1.5 rounded-lg text-xs font-bold">
                    <Banknote className="w-3.5 h-3.5" />
                    <span>{isAr ? "سندات وأوامر الصرف" : "Payment Orders"}</span>
                    <Badge variant="secondary" className="ms-1 h-4 px-1 rounded-full text-[10px]">
                      {subOrders.length}
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </CardHeader>

              <CardContent className="p-4">
                {/* Tab 1: Previous Certificates */}
                <TabsContent value="certs" className="space-y-3 mt-0">
                  {previousCerts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      {isAr ? "لا توجد مستخلصات مسجلة سابقة لهذا المقاول." : "No previous certificates found for this subcontractor."}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="text-xs">
                            <TableHead>{isAr ? "المستخلص" : "Cert #"}</TableHead>
                            <TableHead>{isAr ? "الفترة" : "Period"}</TableHead>
                            <TableHead className="text-end">{isAr ? "الأعمال" : "Gross"}</TableHead>
                            <TableHead className="text-end">{isAr ? "الصافي" : "Net"}</TableHead>
                            <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previousCerts.map((c) => (
                            <TableRow
                              key={c.id}
                              className="cursor-pointer hover:bg-muted/40 text-xs"
                              onClick={() => navigate(`/payments/certificates/${c.id}`)}
                            >
                              <TableCell className="font-mono font-semibold">{c.certNo}</TableCell>
                              <TableCell className="text-muted-foreground whitespace-nowrap">
                                {fmtDate(c.periodFrom)} → {fmtDate(c.periodTo)}
                              </TableCell>
                              <TableCell className="text-end tabular-nums">{money(c.grossAmount)}</TableCell>
                              <TableCell className="text-end tabular-nums font-bold text-primary">
                                {money(c.netPayable)}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={c.status} group="sub_cert" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* Tab 2: Payment Orders History */}
                <TabsContent value="orders" className="space-y-3 mt-0">
                  {subOrders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      {isAr ? "لا توجد أوامر دفع صادرة لهذا المقاول بعد." : "No payment orders issued for this subcontractor yet."}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="text-xs">
                            <TableHead>{isAr ? "رقم الأمر" : "Order #"}</TableHead>
                            <TableHead>{isAr ? "البيان / النوع" : "Purpose"}</TableHead>
                            <TableHead className="text-end">{isAr ? "المبلغ" : "Amount"}</TableHead>
                            <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                            <TableHead>{isAr ? "تاريخ الصرف" : "Paid Date"}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {subOrders.map((o) => (
                            <TableRow key={o.id} className="text-xs">
                              <TableCell className="font-mono font-semibold">{o.orderNo}</TableCell>
                              <TableCell className="max-w-[140px] truncate text-muted-foreground">
                                {o.purpose || o.kind || "—"}
                              </TableCell>
                              <TableCell className="text-end tabular-nums font-bold">{money(o.amount)}</TableCell>
                              <TableCell>
                                <StatusBadge status={o.status} group="payment_order" />
                              </TableCell>
                              <TableCell className="text-muted-foreground whitespace-nowrap">
                                {fmtDate(o.paidDate || o.createdAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </div>
      </div>
      {/* Manage Contract BOQ Modal (inline access from Certificate Detail) */}
      {managingContractBoq && form.contractId && (
        <Dialog open={managingContractBoq} onOpenChange={setManagingContractBoq}>
          <DialogContent className="flex flex-col max-w-[95vw] w-[1400px] max-h-[92vh] overflow-y-auto overflow-x-hidden rounded-3xl p-6">
            <DialogHeader className="pb-3 border-b border-border/50">
              <DialogTitle className="flex items-center gap-2 text-lg font-black">
                <ClipboardList className="w-5 h-5 text-primary" />
                <span>
                  {isAr ? "جدول كميات العقد" : "Contract BOQ"}
                  {selectedContract ? ` — ${selectedContract.contractNo} (${selectedContract.title})` : ""}
                </span>
              </DialogTitle>
            </DialogHeader>
            <ContractBoqEditor
              contractId={form.contractId}
              readOnly={!editable}
              onSaved={() => {
                void syncBoqFromContract();
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
