import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Paperclip, AlertTriangle, Send, CheckCircle2, XCircle, Ban, Banknote, Save, HardHat, Building2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { OPEN_PAYMENT_ORDER, SUB_CERT_LABELS, computeSubCert, SUB_CERT_STATUSES } from "@shared/payments";
import { ChargebacksPanel } from "./chargebacks";
import {
  SubcontractorSelect,
  SubcontractorContractDialog,
  WorkLocationPickerDialog,
  GroupedLocationBadges,
  useSubcontractorContracts,
  type SubcontractorRow,
  type SubcontractorContractRow,
} from "./subcontractor-select";
import {
  LatestActivity,
  PaymentDialog,
  Section,
  Tile,
  TileRow,
  AttachmentsPanel,
  StatusBadge,
  errorMessage,
  fmtDate,
  invalidatePayments,
  money,
  useFocusFromUrl,
  useSystemVatRate,
  type PaymentsContext,
} from "./payments-common";
import { enumOptions } from "@/lib/enums";

interface Props {
  ctx: PaymentsContext;
  projectId: string; // "all" or a project id
  rows: any[];
  chargebacks: any[];
  fines: any[];
  subcontractors?: SubcontractorRow[];
  contracts?: SubcontractorContractRow[];
  orders: any[];
  onRequestOrder: (certId: string) => void;
  hidePanels?: boolean;
}

const num = (v: unknown) => Number(v ?? 0) || 0;
// Saudi VAT, the starting value for a new certificate; it can be changed per certificate
const DEFAULT_VAT = "15";

export function SubcontractorCertificatesTab({ ctx, projectId, rows, chargebacks, fines, orders, onRequestOrder, hidePanels = false }: Props) {
  const { t } = useTranslation("payments");
  const [, navigate] = useLocation();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  useFocusFromUrl((id) => rows.some((r) => r.id === id), (id) => navigate(`/payments/certificates/${id}`));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (status === "all" || r.status === status) && (!q || [r.certNo, r.subcontractorName, r.scope, r.projectName].some((s) => String(s ?? "").toLowerCase().includes(q))));
  }, [rows, status, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input className="ps-9" placeholder={t("certificates.search_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all_statuses")}</SelectItem>
            {enumOptions("sub_cert", SUB_CERT_STATUSES).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className="ms-auto" onClick={() => navigate(`/payments/certificates/new${projectId !== "all" ? `?project=${projectId}` : ""}`)}>
          <Plus className="w-4 h-4 me-1" /> {t("certificates.new_btn")}
        </Button>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("certificates.table.number")}</TableHead>
                {projectId === "all" && <TableHead>{t("common.project")}</TableHead>}
                <TableHead>{t("certificates.table.subcontractor")}</TableHead>
                <TableHead>{t("certificates.table.period")}</TableHead>
                <TableHead className="text-end">{t("certificates.table.work_value")}</TableHead>
                <TableHead className="text-end">{t("certificates.table.net_payable")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">{t("certificates.no_items")}</TableCell></TableRow>}
              {filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/payments/certificates/${r.id}`)}>
                  <TableCell className="font-mono text-xs">{r.certNo}</TableCell>
                  {projectId === "all" && <TableCell>{r.projectName}</TableCell>}
                  <TableCell className="font-semibold">{r.subcontractorName}{r.scope && <div className="text-xs font-normal text-muted-foreground truncate max-w-[220px]">{r.scope}</div>}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmtDate(r.periodFrom)} → {fmtDate(r.periodTo)}</TableCell>
                  <TableCell className="text-end tabular-nums">{money(r.grossAmount)}</TableCell>
                  <TableCell className="text-end tabular-nums font-semibold">{money(r.netPayable)}</TableCell>
                  <TableCell><StatusBadge status={r.status} group="sub_cert" /></TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap"><Paperclip className="w-3.5 h-3.5 inline me-1" />{r.attachments.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!hidePanels && (
        <ChargebacksPanel ctx={ctx} projectId={projectId} rows={chargebacks} fines={fines} />
      )}
    </div>
  );
}

const emptyForm = (vat = DEFAULT_VAT) => ({
  subcontractorId: "", contractId: "", workLocationIds: [] as string[], scope: "", contractValue: "", periodFrom: "", periodTo: "",
  grossAmount: "", retentionPercent: "10", advanceRecovery: "", otherDeductions: "", deductionsNote: "", vatPercent: vat, notes: "",
});

export function SubCertDialog({ ctx, defaultProjectId, row, defaultSubcontractorId, chargebacks, fines, allRows, orders, onClose, onRequestOrder }: {
  ctx: PaymentsContext; defaultProjectId: string; row: any | null; defaultSubcontractorId?: string; chargebacks: any[]; fines: any[]; allRows: any[]; orders: any[]; onClose: () => void; onRequestOrder: (id: string) => void;
}) {
  const { t, i18n } = useTranslation("payments");
  const isAr = (i18n.language || "ar").startsWith("ar");
  const systemVatRate = useSystemVatRate(ctx?.vatPercent ?? 15);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = Boolean(row && row.id);
  const [projectId, setProjectId] = useState(isEditing ? row.projectId : (defaultProjectId === "all" ? "" : defaultProjectId));
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addingContract, setAddingContract] = useState(false);
  const [form, setForm] = useState(
    isEditing
      ? {
          subcontractorId: row.subcontractorId ?? "",
          contractId: row.contractId ?? "",
          workLocationIds: (row.workLocationIds ?? []) as string[],
          scope: row.scope ?? "", contractValue: String(num(row.contractValue) || ""),
          periodFrom: row.periodFrom ?? "", periodTo: row.periodTo ?? "", grossAmount: String(num(row.grossAmount) || ""),
          retentionPercent: String(num(row.retentionPercent)), advanceRecovery: String(num(row.advanceRecovery) || ""),
          otherDeductions: String(num(row.otherDeductions) || ""), deductionsNote: row.deductionsNote ?? "",
          vatPercent: String(num(row.vatPercent)), notes: row.notes ?? "",
        }
      : { ...emptyForm(), subcontractorId: defaultSubcontractorId ?? "" },
  );
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: contracts = [] } = useSubcontractorContracts(projectId);
  const { data: workLocations = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "work-locations"],
    enabled: !!projectId,
  });

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

  const selectedContract = useMemo(
    () => subContracts.find((c) => c.id === form.contractId),
    [subContracts, form.contractId]
  );

  const availableLocations = useMemo(() => {
    if (selectedContract?.workLocationIds?.length) {
      const setIds = new Set(selectedContract.workLocationIds);
      return workLocations.filter((l) => setIds.has(l.id));
    }
    return workLocations;
  }, [workLocations, selectedContract]);

  const applyContract = (c: SubcontractorContractRow | undefined) => {
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
  // Approved invoice charge-backs this certificate can deduct: the subcontractor's own, not taken by another certificate
  const available = useMemo(() => chargebacks.filter((c) =>
    (isEditing ? c.projectId === row.projectId : c.projectId === projectId)
    && c.subcontractorId === form.subcontractorId
    && (c.status === "approved" || (isEditing && c.status === "applied" && c.certificateId === row.id))), [chargebacks, isEditing, row, projectId, form.subcontractorId]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(isEditing ? chargebacks.filter((c) => c.status === "applied" && c.certificateId === row.id).map((c) => c.id) : []));
  const pickedTotal = available.filter((c) => picked.has(c.id)).reduce((s, c) => s + num(c.amount), 0);
  // Open deductions on the same subcontractor: taking one here reserves it, and approving the certificate recovers it
  const availableFines = useMemo(() => fines.filter((f) =>
    (isEditing ? f.projectId === row.projectId : f.projectId === projectId) && f.subcontractorId === form.subcontractorId && f.status === "open"
    && (!f.deductedCertificateId || (isEditing && f.deductedCertificateId === row.id))), [fines, isEditing, row, projectId, form.subcontractorId]);
  const [pickedFines, setPickedFines] = useState<Set<string>>(() => new Set(isEditing ? fines.filter((f) => f.deductedCertificateId === row.id && f.status === "open").map((f) => f.id) : []));
  const fineAmount = (f: any) => Math.max(0, num(f.amount) - num(f.paidAmount));
  const pickedFinesTotal = availableFines.filter((f) => pickedFines.has(f.id)).reduce((s, f) => s + fineAmount(f), 0);
  const chargebackTotal = isEditing && !["draft", "rejected"].includes(row.status) ? num(row.chargebackDeductions) : pickedTotal + pickedFinesTotal;

  const isOwner = !isEditing || row.createdBy === user?.id || ctx.perms.isAccounting;
  const editable = isOwner && (!isEditing || ["draft", "rejected"].includes(row.status));

  // A repeat certificate for the same subcontractor starts from its active contract or latest certificate
  const onSubChange = (id: string, sub?: SubcontractorRow) => {
    const subAllCnts = contracts.filter((c) => c.subcontractorId === id);
    const activeCnts = subAllCnts.filter((c) => c.status === "active");
    const sumVal = subAllCnts.reduce((s, c) => s + num(c.contractValue), 0);
    const match = allRows.find((r) => r.projectId === projectId && r.subcontractorId === id);
    setPicked(new Set());
    setPickedFines(new Set());
    if (!isEditing && activeCnts.length === 1) {
      const c = activeCnts[0];
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
    setForm((f) => ({
      ...f,
      subcontractorId: id,
      contractId: "",
      workLocationIds: [],
      contractValue: sumVal > 0 ? String(sumVal) : (match && !row ? String(num(match.contractValue) || "") : ""),
      ...(!row && sub && !match ? { scope: f.scope || (sub.scope ?? "") } : {}),
      ...(match && !row ? { scope: f.scope || (match.scope ?? ""), retentionPercent: String(num(match.retentionPercent)), vatPercent: String(num(match.vatPercent)) } : {}),
    }));
  };

  const figures = computeSubCert({
    grossAmount: num(form.grossAmount),
    retentionPercent: num(form.retentionPercent),
    advanceRecovery: num(form.advanceRecovery),
    otherDeductions: num(form.otherDeductions),
    chargebackDeductions: chargebackTotal,
    vatPercent: num(form.vatPercent),
  });

  // What this subcontractor (and contract, if chosen) has already been certified for, against its contract value
  const previousGross = allRows
    .filter(
      (r) =>
        r.projectId === projectId &&
        r.id !== row?.id &&
        r.subcontractorId === form.subcontractorId &&
        (form.contractId ? r.contractId === form.contractId : true) &&
        ["approved", "paid"].includes(r.status)
    )
    .reduce((s, r) => s + num(r.grossAmount), 0);
  const cumulative = previousGross + num(form.grossAmount);
  const effectiveContractVal = selectedContract
    ? num(form.contractValue) || num(selectedContract.contractValue)
    : sumOfSubContractsValue > 0
      ? sumOfSubContractsValue
      : num(form.contractValue);
  const overContract = effectiveContractVal > 0 && cumulative > effectiveContractVal + 0.005;

  const body = () => ({
    ...form,
    contractId: form.contractId || null,
    workLocationIds: form.workLocationIds ?? [],
    scope: form.scope || null,
    periodFrom: form.periodFrom || null,
    periodTo: form.periodTo || null,
    deductionsNote: form.deductionsNote || null,
    notes: form.notes || null,
    contractValue: form.contractValue || 0,
    grossAmount: form.grossAmount || 0,
    advanceRecovery: form.advanceRecovery || 0,
    otherDeductions: form.otherDeductions || 0,
  });

  // The chosen charge-backs are applied first so the saved net already includes them
  const syncChargebacks = async () => {
    if (row && editable) await apiRequest("POST", `/api/payments/subcontractor-certificates/${row.id}/chargebacks`, { ids: available.filter((c) => picked.has(c.id)).map((c) => c.id), fineIds: availableFines.filter((f) => pickedFines.has(f.id)).map((f) => f.id) });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!isEditing) return apiRequest("POST", "/api/payments/subcontractor-certificates", { projectId, ...body() });
      await syncChargebacks();
      return apiRequest("PATCH", `/api/payments/subcontractor-certificates/${row.id}`, body());
    },
    onSuccess: () => { invalidatePayments(queryClient); toast({ title: isEditing ? t("toasts.saved") : t("toasts.cert_created") }); onClose(); },
    onError: (e) => toast({ title: t("errors.save_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  const act = useMutation({
    mutationFn: async (v: { action: string; note?: string }) => apiRequest("POST", `/api/payments/subcontractor-certificates/${row.id}/transition`, v),
    onSuccess: (_d, v) => {
      invalidatePayments(queryClient);
      const msg: Record<string, string> = { submit: t("toasts.cert_submitted"), approve: t("toasts.cert_approved"), reject: t("toasts.cert_rejected"), cancel: t("toasts.cert_cancelled") };
      toast({ title: msg[v.action] });
      onClose();
    },
    onError: (e) => toast({ title: t("errors.action_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  // Submitting sends what is on screen, so save it first
  const saveAndSubmit = useMutation({
    mutationFn: async () => {
      await syncChargebacks();
      if (!isEditing) {
        const res = await apiRequest("POST", "/api/payments/subcontractor-certificates", { projectId, ...body() });
        const created = await res.json();
        await apiRequest("POST", `/api/payments/subcontractor-certificates/${created.id}/transition`, { action: "submit" });
        return;
      }
      await apiRequest("PATCH", `/api/payments/subcontractor-certificates/${row.id}`, body());
      await apiRequest("POST", `/api/payments/subcontractor-certificates/${row.id}/transition`, { action: "submit" });
    },
    onSuccess: () => { invalidatePayments(queryClient); toast({ title: t("toasts.cert_submitted") }); onClose(); },
    onError: (e) => { invalidatePayments(queryClient); toast({ title: t("errors.send_submit_failed"), description: errorMessage(e), variant: "destructive" }); },
  });

  const hasLiveOrder = isEditing && row ? orders.some((o) => o.subcontractorCertificateId === row.id && ([...OPEN_PAYMENT_ORDER, "paid"] as string[]).includes(o.status)) : false;
  const ownCert = isEditing && row?.createdBy === user?.id && user?.role !== "super_admin";
  const L = (label: string, child: React.ReactNode, cls = "") => <div className={`space-y-1.5 ${cls}`}><Label>{label}</Label>{child}</div>;

  return (
    <PaymentDialog
      onClose={onClose}
      icon={HardHat}
      kind={t("certificates.kind")}
      title={isEditing && row ? <span className="font-mono">{row.certNo}</span> : t("certificates.new_title")}
      badge={isEditing && row ? <StatusBadge status={row.status} group="sub_cert" /> : undefined}
      description={isEditing && row ? row.projectName : t("certificates.new_description")}
      amount={<span className={figures.netPayable < 0 ? "text-destructive" : undefined}>{money(figures.netPayable)}</span>}
      amountLabel={t("certificates.net_payable")}
      panel={rejecting && (
        <Section title={t("certificates.reject_title")} icon={XCircle} tone="danger">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setRejecting(false)}>{t("common.back_btn")}</Button>
            <Button size="sm" variant="destructive" disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ action: "reject", note })}>{t("certificates.reject_btn")}</Button>
          </div>
        </Section>
      )}
      footer={
        <>
          {/* The step this certificate is waiting for comes first */}
          {editable && (
            <Button disabled={save.isPending || !projectId || !form.subcontractorId} onClick={() => save.mutate()}><Save className="w-4 h-4 me-1" /> {t("common.save")}</Button>
          )}
          {row && editable && (
            <Button variant="outline" disabled={act.isPending || save.isPending || saveAndSubmit.isPending} onClick={() => saveAndSubmit.mutate()}><Send className="w-4 h-4 me-1" /> {t("certificates.send_for_approval")}</Button>
          )}
          {row?.status === "submitted" && ctx.perms.canApprove && (
            <>
              <Button disabled={act.isPending || ownCert} title={ownCert ? t("certificates.cannot_approve_own") : undefined} onClick={() => act.mutate({ action: "approve" })}><CheckCircle2 className="w-4 h-4 me-1" /> {t("certificates.approve_cert")}</Button>
              <Button variant="outline" disabled={act.isPending} onClick={() => setRejecting(true)}><XCircle className="w-4 h-4 me-1" /> {t("certificates.reject_cert")}</Button>
            </>
          )}
          {row?.status === "approved" && ctx.perms.isAccounting && !hasLiveOrder && (
            <Button onClick={() => onRequestOrder(row.id)}><Banknote className="w-4 h-4 me-1" /> {t("certificates.issue_order")}</Button>
          )}
          {row && isOwner && ["draft", "submitted", "rejected", "approved"].includes(row.status) && !hasLiveOrder && (
            <Button variant="ghost" className="text-destructive" disabled={act.isPending} onClick={() => act.mutate({ action: "cancel" })}><Ban className="w-4 h-4 me-1" /> {t("certificates.cancel_cert")}</Button>
          )}
        </>
      }
    >
        {row?.rejectReason && row.status === "rejected" && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"><b>{t("certificates.reject_reason_prefix")}</b>{row.rejectReason}</div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          {L(t("common.project"), (
            <Select value={projectId} onValueChange={setProjectId} disabled={!!row}>
              <SelectTrigger><SelectValue placeholder={t("common.select_project")} /></SelectTrigger>
              <SelectContent>{ctx.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          ), "sm:col-span-2")}
          {L(t("certificates.subcontractor"), (
            <>
              <SubcontractorSelect projectId={projectId} value={form.subcontractorId} disabled={!editable} onChange={onSubChange} />
            </>
          ))}
          {L(t("contracts.select_label"), (
            <>
              <Select
                value={form.contractId || "__none__"}
                disabled={!editable || !form.subcontractorId}
                onValueChange={(v) => {
                  if (v === "__new__") setAddingContract(true);
                  else applyContract(subContracts.find((c) => c.id === v));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("contracts.select_placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("contracts.no_contract")}</SelectItem>
                  {subContracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.contractNo} — {c.title}
                    </SelectItem>
                  ))}
                  {editable && projectId && (
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
                  projectId={projectId}
                  onClose={() => setAddingContract(false)}
                  onSaved={(saved) => {
                    setAddingContract(false);
                    applyContract(saved);
                  }}
                />
              )}
            </>
          ))}
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
                  disabled={!projectId}
                >
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  Add Work Locations
                  <Badge variant="secondary" className="text-[10px]">
                    {form.workLocationIds.length} selected
                  </Badge>
                </Button>
              )}
            </div>
            {form.workLocationIds.length > 0 ? (
              <GroupedLocationBadges
                locations={workLocations.filter((l) => form.workLocationIds.includes(l.id))}
                onRemoveOne={(id) => {
                  if (!editable) return;
                  setForm((f) => ({ ...f, workLocationIds: f.workLocationIds.filter((x) => x !== id) }));
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
              title="Add Work Locations"
            />
          </div>
          {L(t("certificates.scope"), <Input value={form.scope} disabled={!editable} onChange={(e) => set("scope")(e.target.value)} placeholder={t("certificates.scope_placeholder")} />)}
          {L(t("certificates.contract_value"), <Input type="number" min="0" step="0.01" value={form.contractValue} disabled={!editable} onChange={(e) => set("contractValue")(e.target.value)} />)}
          {L(t("certificates.work_value"), <Input type="number" min="0" step="0.01" value={form.grossAmount} disabled={!editable} onChange={(e) => set("grossAmount")(e.target.value)} />)}
          {L(t("certificates.period_from"), <Input type="date" value={form.periodFrom} disabled={!editable} onChange={(e) => set("periodFrom")(e.target.value)} />)}
          {L(t("certificates.period_to"), <Input type="date" value={form.periodTo} disabled={!editable} onChange={(e) => set("periodTo")(e.target.value)} />)}
          {L(t("certificates.retention_pct"), <Input type="number" min="0" max="100" step="0.01" value={form.retentionPercent} disabled={!editable} onChange={(e) => set("retentionPercent")(e.target.value)} />)}
          {L(
            t("certificates.vat_pct"),
            <Select
              value={num(form.vatPercent) > 0 ? "applied" : "not_applied"}
              disabled={!editable}
              onValueChange={(v) => set("vatPercent")(v === "applied" ? String(systemVatRate) : "0")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="applied">
                  {isAr
                    ? `مطبقة (${num(form.vatPercent) > 0 ? num(form.vatPercent) : systemVatRate}%)`
                    : `Applied (${num(form.vatPercent) > 0 ? num(form.vatPercent) : systemVatRate}%)`}
                </SelectItem>
                <SelectItem value="not_applied">{isAr ? "غير مطبقة (0%)" : "Not Applied (0%)"}</SelectItem>
              </SelectContent>
            </Select>
          )}
          {L(t("certificates.advance_recovery"), <Input type="number" min="0" step="0.01" value={form.advanceRecovery} disabled={!editable} onChange={(e) => set("advanceRecovery")(e.target.value)} />)}
          {L(t("certificates.other_deductions"), <Input type="number" min="0" step="0.01" value={form.otherDeductions} disabled={!editable} onChange={(e) => set("otherDeductions")(e.target.value)} />)}
          {L(t("certificates.deductions_note"), <Input value={form.deductionsNote} disabled={!editable} onChange={(e) => set("deductionsNote")(e.target.value)} placeholder={t("certificates.deductions_note_placeholder")} />, "sm:col-span-2")}
          {L(t("common.notes"), <Textarea rows={2} value={form.notes} disabled={!editable} onChange={(e) => set("notes")(e.target.value)} />, "sm:col-span-2")}
        </div>

        <Section title={t("certificates.calculation")}>
          <TileRow>
            <Tile label={t("certificates.tile_work_value")}><span className="tabular-nums">{money(num(form.grossAmount))}</span></Tile>
            <Tile label={t("certificates.tile_retention")}><span className="tabular-nums">− {money(figures.retentionAmount)}</span></Tile>
            <Tile label={t("certificates.tile_advance_deductions")}><span className="tabular-nums">− {money(num(form.advanceRecovery) + num(form.otherDeductions) + chargebackTotal)}</span></Tile>
            <Tile label={t("certificates.tile_vat")}><span className="tabular-nums">+ {money(figures.vatAmount)}</span></Tile>
          </TileRow>
          {form.subcontractorId && (
            <div className={`text-xs flex items-center gap-1 ${overContract ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
              {overContract && <AlertTriangle className="w-3.5 h-3.5" />}
              {t("certificates.cumulative_note", { previous: money(previousGross), cumulative: money(cumulative) })}
              {effectiveContractVal > 0 && ` ${t("certificates.contract_note", { value: money(effectiveContractVal) })}`}
              {overContract && ` ${t("certificates.over_contract")}`}
            </div>
          )}
        </Section>

        {!row && (
          <p className="text-xs text-muted-foreground">{t("certificates.hint_save_first")}</p>
        )}
        {row && (available.length > 0 || availableFines.length > 0 || chargebackTotal > 0) && (
          <Section title={t("certificates.charges_title")}>
            <div className="rounded-md border border-muted/50 bg-muted/30 p-3 space-y-2">
            {editable ? (
              <ul className="space-y-1.5">
                {available.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={picked.has(c.id)} onChange={(e) => setPicked((s) => { const next = new Set(s); if (e.target.checked) next.add(c.id); else next.delete(c.id); return next; })} />
                    <span className="font-mono text-xs">{c.chargeNo}</span>
                    <span>{t("certificates.invoice")} <span className="font-mono">{c.invoiceNo}</span> <span className="text-xs text-muted-foreground">({c.payeeName})</span></span>
                    <span className="ms-auto tabular-nums font-semibold">{money(c.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-1.5">
                {chargebacks.filter((c) => c.certificateId === row.id && c.status === "applied").map((c) => (
                  <li key={c.id} className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-xs">{c.chargeNo}</span>
                    <span>{t("certificates.invoice")} <span className="font-mono">{c.invoiceNo}</span></span>
                    <span className="ms-auto tabular-nums font-semibold">{money(c.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            {editable && availableFines.length > 0 && (
              <ul className="space-y-1.5">
                {availableFines.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={pickedFines.has(f.id)} onChange={(e) => setPickedFines((s) => { const next = new Set(s); if (e.target.checked) next.add(f.id); else next.delete(f.id); return next; })} />
                    <span className="text-xs text-muted-foreground">{t("certificates.fine")}</span>
                    <span>{f.title}</span>
                    <span className="ms-auto tabular-nums font-semibold">{money(fineAmount(f))}</span>
                  </li>
                ))}
              </ul>
            )}
            {!editable && fines.filter((f) => f.deductedCertificateId === row.id).length > 0 && (
              <ul className="space-y-1.5">
                {fines.filter((f) => f.deductedCertificateId === row.id).map((f) => (
                  <li key={f.id} className="flex items-center gap-3 text-sm"><span className="text-xs text-muted-foreground">{t("certificates.fine")}</span><span>{f.title}</span><span className="ms-auto tabular-nums font-semibold">{money(fineAmount(f))}</span></li>
                ))}
              </ul>
            )}
            <div className="flex justify-between text-sm border-t border-muted/60 pt-2"><span>{t("certificates.charges_total")}</span><span className="tabular-nums font-bold">{money(chargebackTotal)}</span></div>
            </div>
          </Section>
        )}

        {isEditing && row && (
          <>
            <LatestActivity entityType="subcontractor_certificate" entityId={row.id} group="sub_cert" />
            <div className="rounded-md border border-dashed border-primary/20 bg-primary/5 p-3">
              <AttachmentsPanel
                entityType="subcontractor_certificate"
                entityId={row.id}
                projectId={row.projectId}
                files={row.attachments ?? []}
                editable={!["paid", "cancelled"].includes(row.status)}
                hint={t("certificates.hint_attachments")}
                canRemove={(f) => f.uploadedBy === user?.id || ctx.perms.isAccounting}
              />
            </div>
          </>
        )}
    </PaymentDialog>
  );
}
