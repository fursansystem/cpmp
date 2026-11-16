import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardList,
  Edit,
  KeyRound,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { StatCard } from "@/components/stat-card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { enumText } from "@/lib/enums";
import type { Client, WorkLocation } from "@shared/schema";

interface HandoverContext {
  projects: { id: string; name: string; location: string; organizationId: string }[];
  organizationId: string | null;
  isSuperAdmin: boolean;
}

interface HandoverRow {
  id: string;
  projectId: string;
  projectName: string;
  workLocationId: string;
  unitLabel: string;
  handoverNo: string;
  status: string;
  meterTransferStatus: string;
  meterNumber: string | null;
  inspectionDate: string | null;
  handoverDate: string | null;
  client: Client;
  snags: { total: number; open: number; closed: number };
  completionCheck: { ready: boolean; openSnagsCount: number; meterTransferDone: boolean };
}

type ClientWithCount = Client & { handoverCount?: number };

const handoverStatusStyle: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  snagging: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  ready_for_handover: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  meter_transfer: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  handed_over: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  cancelled: "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

const meterStatusStyle: Record<string, string> = {
  not_started: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  requested: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  client_confirmed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  transferred: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  skipped: "bg-slate-500/10 text-slate-500 border-slate-400/20",
};

export default function UnitHandover() {
  const { t } = useTranslation("handover");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const [tab, setTab] = useState("units");
  const [projectFilter, setProjectFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [newHandoverOpen, setNewHandoverOpen] = useState(false);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientWithCount | null>(null);

  // Handover form state
  const [hProjectId, setHProjectId] = useState("");
  const [hUnitId, setHUnitId] = useState("");
  const [hClientId, setHClientId] = useState("");
  const [hDeedNo, setHDeedNo] = useState("");
  const [hContractNo, setHContractNo] = useState("");
  const [hInspectionDate, setHInspectionDate] = useState("");
  const [hMeterNo, setHMeterNo] = useState("");
  const [hElecAccount, setHElecAccount] = useState("");
  const [hNotes, setHNotes] = useState("");

  // Client form state
  const [cName, setCName] = useState("");
  const [cNameEn, setCNameEn] = useState("");
  const [cNationalId, setCNationalId] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cSecAccount, setCSecAccount] = useState("");
  const [cNotes, setCNotes] = useState("");

  const { data: ctx, isLoading: ctxLoading } = useQuery<HandoverContext>({
    queryKey: ["/api/handover/context"],
  });

  const { data: handovers = [], isLoading: handoversLoading } = useQuery<HandoverRow[]>({
    queryKey: ["/api/handover/units", projectFilter],
    queryFn: async () => {
      const res = await fetch(
        `/api/handover/units${projectFilter !== "all" ? `?projectId=${projectFilter}` : ""}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!ctx,
  });

  const { data: clients = [], isLoading: clientsLoading } = useQuery<ClientWithCount[]>({
    queryKey: ["/api/handover/clients"],
    enabled: !!ctx,
  });

  const { data: projectUnits = [] } = useQuery<WorkLocation[]>({
    queryKey: ["/api/projects", hProjectId, "work-locations"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${hProjectId}/work-locations`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!hProjectId && newHandoverOpen,
  });

  const openClientModal = (client?: ClientWithCount) => {
    if (client) {
      setEditingClient(client);
      setCName(client.fullName);
      setCNameEn(client.fullNameEn ?? "");
      setCNationalId(client.nationalId);
      setCPhone(client.phone);
      setCEmail(client.email ?? "");
      setCSecAccount(client.secAccountNumber ?? "");
      setCNotes(client.notes ?? "");
    } else {
      setEditingClient(null);
      setCName("");
      setCNameEn("");
      setCNationalId("");
      setCPhone("");
      setCEmail("");
      setCSecAccount("");
      setCNotes("");
    }
    setClientDialogOpen(true);
  };

  const saveClientMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        organizationId: ctx?.projects.find((p) => p.id === hProjectId)?.organizationId || ctx?.organizationId || undefined,
        fullName: cName,
        fullNameEn: cNameEn || null,
        nationalId: cNationalId,
        phone: cPhone,
        email: cEmail || null,
        secAccountNumber: cSecAccount || null,
        notes: cNotes || null,
      };
      if (editingClient) {
        return apiRequest("PATCH", `/api/handover/clients/${editingClient.id}`, payload);
      }
      return apiRequest("POST", "/api/handover/clients", payload);
    },
    onSuccess: async (res) => {
      const saved = await res.json();
      await qc.invalidateQueries({ queryKey: ["/api/handover/clients"] });
      if (newHandoverOpen && saved?.id) setHClientId(saved.id);
      setClientDialogOpen(false);
      toast({ title: editingClient ? "تم تحديث بيانات العميل" : "تمت إضافة العميل بنجاح" });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/handover/clients/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/handover/clients"] });
      toast({ title: "تم حذف العميل" });
    },
    onError: (err: Error) => {
      toast({ title: "تعذر الحذف", description: err.message, variant: "destructive" });
    },
  });

  const createHandoverMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/handover/units", {
        projectId: hProjectId,
        workLocationId: hUnitId,
        clientId: hClientId,
        deedNumber: hDeedNo || null,
        contractNumber: hContractNo || null,
        inspectionDate: hInspectionDate || null,
        meterNumber: hMeterNo || null,
        electricityAccountNo: hElecAccount || null,
        notes: hNotes || null,
      });
      return res.json();
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["/api/handover/units"] });
      qc.invalidateQueries({ queryKey: ["/api/handover/clients"] });
      setNewHandoverOpen(false);
      toast({ title: "تم إنشاء ملف تسليم الوحدة" });
      if (created?.id) navigate(`/handover/${created.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const filteredHandovers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return handovers;
    return handovers.filter(
      (h) =>
        h.handoverNo.toLowerCase().includes(q) ||
        h.unitLabel.toLowerCase().includes(q) ||
        h.projectName.toLowerCase().includes(q) ||
        h.client.fullName.toLowerCase().includes(q) ||
        h.client.nationalId.toLowerCase().includes(q) ||
        h.client.phone.toLowerCase().includes(q),
    );
  }, [handovers, searchQuery]);

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.nationalId.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q),
    );
  }, [clients, searchQuery]);

  const stats = useMemo(
    () => ({
      total: handovers.length,
      snagging: handovers.filter((h) => h.status === "snagging" || h.snags.open > 0).length,
      meterPending: handovers.filter(
        (h) => h.status !== "handed_over" && h.status !== "cancelled" && !h.completionCheck.meterTransferDone,
      ).length,
      handedOver: handovers.filter((h) => h.status === "handed_over").length,
    }),
    [handovers],
  );

  if (ctxLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t("title")}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("subtitle")}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => openClientModal()} data-testid="button-new-client">
            <UserPlus className="w-4 h-4 me-2" />
            {t("actions.new_client")}
          </Button>
          <Button
            onClick={() => {
              const firstProj = projectFilter !== "all" ? projectFilter : ctx?.projects[0]?.id || "";
              setHProjectId(firstProj);
              setHUnitId("");
              setHClientId("");
              setHDeedNo("");
              setHContractNo("");
              setHInspectionDate("");
              setHMeterNo("");
              setHElecAccount("");
              setHNotes("");
              setNewHandoverOpen(true);
            }}
            data-testid="button-new-handover"
          >
            <Plus className="w-4 h-4 me-2" />
            {t("actions.new_handover")}
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("stats.total")} value={stats.total} icon={ClipboardList} />
        <StatCard title={t("stats.snagging")} value={stats.snagging} icon={AlertTriangle} />
        <StatCard title={t("stats.meter_pending")} value={stats.meterPending} icon={Zap} />
        <StatCard title={t("stats.handed_over")} value={stats.handedOver} icon={CheckCircle2} />
      </div>

      {/* Filters & Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="units" className="gap-2">
              <KeyRound className="w-4 h-4" />
              {t("tabs.units")} ({handovers.length})
            </TabsTrigger>
            <TabsTrigger value="clients" className="gap-2">
              <Users className="w-4 h-4" />
              {t("tabs.clients")} ({clients.length})
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            {tab === "units" && (
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-56">
                  <Building2 className="w-4 h-4 me-2 text-slate-400" />
                  <SelectValue placeholder={t("fields.project")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المشاريع</SelectItem>
                  {ctx?.projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالوحدة، العميل، الهوية، الجوال..."
                className="ps-9"
              />
            </div>
          </div>
        </div>

        {/* Units Handover Tab */}
        <TabsContent value="units">
          <Card>
            <CardContent className="p-0">
              {handoversLoading ? (
                <div className="p-6 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : filteredHandovers.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  لا توجد ملفات تسليم وحدات مطابقة حالياً.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("fields.handover_no")}</TableHead>
                      <TableHead>{t("fields.project")}</TableHead>
                      <TableHead>{t("fields.unit")}</TableHead>
                      <TableHead>{t("fields.client")}</TableHead>
                      <TableHead>{t("fields.snags")}</TableHead>
                      <TableHead>{t("fields.meter_transfer_status")}</TableHead>
                      <TableHead>{t("fields.status")}</TableHead>
                      <TableHead className="text-end"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHandovers.map((h) => (
                      <TableRow key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                        <TableCell className="font-mono font-semibold">{h.handoverNo}</TableCell>
                        <TableCell>{h.projectName}</TableCell>
                        <TableCell className="font-medium">{h.unitLabel}</TableCell>
                        <TableCell>
                          <div className="font-medium">{h.client.fullName}</div>
                          <div className="text-xs text-slate-500">{h.client.phone}</div>
                        </TableCell>
                        <TableCell>
                          {h.snags.open > 0 ? (
                            <Badge variant="outline" className="bg-rose-500/10 text-rose-600 border-rose-500/20">
                              {h.snags.open} مفتوحة / {h.snags.total}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                              {h.snags.total === 0 ? "لا توجد" : `${h.snags.closed} مغلقة`}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={meterStatusStyle[h.meterTransferStatus] ?? ""}>
                            {enumText("meter_transfer_status", h.meterTransferStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={handoverStatusStyle[h.status] ?? ""}>
                            {enumText("handover_status", h.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-end">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/handover/${h.id}`}>إدارة التسليم</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Clients Directory Tab */}
        <TabsContent value="clients">
          <Card>
            <CardContent className="p-0">
              {clientsLoading ? (
                <div className="p-6 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  لا يوجد عملاء مسجلون بعد. أضف عميلاً للبدء في تسليم الوحدات.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("fields.client")}</TableHead>
                      <TableHead>{t("fields.national_id")}</TableHead>
                      <TableHead>{t("fields.phone")}</TableHead>
                      <TableHead>{t("fields.email")}</TableHead>
                      <TableHead>{t("fields.sec_account")}</TableHead>
                      <TableHead>الوحدات</TableHead>
                      <TableHead className="text-end"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="font-semibold">{c.fullName}</div>
                          {c.fullNameEn && <div className="text-xs text-slate-500">{c.fullNameEn}</div>}
                        </TableCell>
                        <TableCell className="font-mono">{c.nationalId}</TableCell>
                        <TableCell className="font-mono">{c.phone}</TableCell>
                        <TableCell>{c.email || "—"}</TableCell>
                        <TableCell className="font-mono">{c.secAccountNumber || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{c.handoverCount ?? 0}</Badge>
                        </TableCell>
                        <TableCell className="text-end">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openClientModal(c)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-rose-600"
                              onClick={() => deleteClientMutation.mutate(c.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Unit Handover Dialog */}
      <Dialog open={newHandoverOpen} onOpenChange={setNewHandoverOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("actions.new_handover")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("fields.project")} *</Label>
              <Select
                value={hProjectId}
                onValueChange={(v) => {
                  setHProjectId(v);
                  setHUnitId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر المشروع" />
                </SelectTrigger>
                <SelectContent>
                  {ctx?.projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("fields.unit")} *</Label>
              <Select value={hUnitId} onValueChange={setHUnitId} disabled={!hProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder={hProjectId ? "اختر الوحدة من مواقع المشروع" : "اختر المشروع أولاً"} />
                </SelectTrigger>
                <SelectContent>
                  {projectUnits.map((u) => {
                    const label = [
                      u.unitCustomNumber ? `وحدة ${u.unitCustomNumber}` : null,
                      u.buildingNo ? `مبنى ${u.buildingNo}` : null,
                      u.flatNo ? `شقة ${u.flatNo}` : null,
                      u.unitZone ? `منطقة ${u.unitZone}` : null,
                    ]
                      .filter(Boolean)
                      .join(" — ") || u.unitDescription || u.id;
                    return (
                      <SelectItem key={u.id} value={u.id}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{t("fields.client")} *</Label>
                <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => openClientModal()}>
                  + عميل جديد
                </Button>
              </div>
              <Select value={hClientId} onValueChange={setHClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر العميل" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.fullName} — {c.nationalId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("fields.deed_number")}</Label>
                <Input value={hDeedNo} onChange={(e) => setHDeedNo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("fields.contract_number")}</Label>
                <Input value={hContractNo} onChange={(e) => setHContractNo(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("fields.inspection_date")}</Label>
                <Input type="date" value={hInspectionDate} onChange={(e) => setHInspectionDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("fields.meter_number")}</Label>
                <Input value={hMeterNo} onChange={(e) => setHMeterNo(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("fields.electricity_account_no")}</Label>
              <Input value={hElecAccount} onChange={(e) => setHElecAccount(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>{t("fields.notes")}</Label>
              <Textarea rows={2} value={hNotes} onChange={(e) => setHNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewHandoverOpen(false)}>
              إلغاء
            </Button>
            <Button
              disabled={!hProjectId || !hUnitId || !hClientId || createHandoverMutation.isPending}
              onClick={() => createHandoverMutation.mutate()}
            >
              إنشاء ملف التسليم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Form Dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingClient ? t("actions.edit_client") : t("actions.new_client")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>الاسم الكامل *</Label>
              <Input value={cName} onChange={(e) => setCName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>الاسم بالإنجليزية</Label>
              <Input value={cNameEn} onChange={(e) => setCNameEn(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("fields.national_id")} *</Label>
                <Input value={cNationalId} onChange={(e) => setCNationalId(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("fields.phone")} *</Label>
                <Input value={cPhone} onChange={(e) => setCPhone(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("fields.email")}</Label>
                <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("fields.sec_account")}</Label>
                <Input value={cSecAccount} onChange={(e) => setCSecAccount(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("fields.notes")}</Label>
              <Textarea rows={2} value={cNotes} onChange={(e) => setCNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClientDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              disabled={!cName.trim() || !cNationalId.trim() || !cPhone.trim() || saveClientMutation.isPending}
              onClick={() => saveClientMutation.mutate()}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
