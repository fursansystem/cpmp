import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  History,
  KeyRound,
  Paperclip,
  Plus,
  Printer,
  ShieldAlert,
  Trash2,
  Upload,
  User,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { enumText } from "@/lib/enums";
import { METER_TRANSFER_STATUSES, SEC_PORTAL_URL } from "@shared/handover";
import type { Client, HandoverActivity, HandoverAttachment, UnitHandover, WorkLocation } from "@shared/schema";

interface HandoverDetailResponse {
  handover: UnitHandover;
  project: { id: string; name: string; location: string; organizationName: string };
  unit: WorkLocation | null;
  unitLabel: string;
  client: Client | null;
  snags: any[];
  snagStats: { total: number; open: number; closed: number };
  completionCheck: {
    ready: boolean;
    openSnagsCount: number;
    meterTransferDone: boolean;
    reasons: string[];
  };
  attachments: (HandoverAttachment & { uploadedByName?: string })[];
  activity: (HandoverActivity & { userName?: string })[];
  completedByName: string | null;
}

const snagStatusBadge: Record<string, { label: string; className: string }> = {
  open: { label: "مفتوحة", className: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
  in_progress: { label: "قيد المعالجة", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  pending_inspection: { label: "بانتظار الفحص", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  closed: { label: "مغلقة", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  rejected: { label: "مرفوضة", className: "bg-red-500/10 text-red-600 border-red-500/20" },
};

const roomPresets = [
  "المجلس / الاستقبال",
  "صالة المعيشة",
  "المطبخ الرئيسي",
  "غرفة النوم الرئيسية",
  "غرفة نوم",
  "دورة المياه",
  "المدخل والممرات",
  "السطح / الحوش",
  "أخرى",
];

async function uploadHandoverFile(file: File, projectId: string) {
  const presign = await fetch("/api/uploads/request-url", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      folder: "handover",
      projectId,
    }),
  });
  if (!presign.ok) throw new Error("فشل تجهيز رابط الرفع");
  const { uploadURL, objectPath } = await presign.json();
  const put = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  if (!put.ok) throw new Error("فشل رفع الملف");
  return {
    fileName: file.name,
    objectPath,
    contentType: file.type || "application/octet-stream",
    size: file.size,
  };
}

export default function UnitHandoverDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation("handover");
  const { toast } = useToast();
  const qc = useQueryClient();

  const [snagDialogOpen, setSnagDialogOpen] = useState(false);
  const [sTitle, setSTitle] = useState("");
  const [sDesc, setSDesc] = useState("");
  const [sCategory, setSCategory] = useState("architectural");
  const [sPriority, setSPriority] = useState("medium");
  const [sRoom, setSRoom] = useState("");
  const [sDetails, setSDetails] = useState("");

  // Editable general info
  const [deedNumber, setDeedNumber] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [inspectionDate, setInspectionDate] = useState("");
  const [handoverDate, setHandoverDate] = useState("");
  const [notes, setNotes] = useState("");

  // Editable meter transfer info
  const [meterNumber, setMeterNumber] = useState("");
  const [electricityAccountNo, setElectricityAccountNo] = useState("");
  const [meterReading, setMeterReading] = useState("");
  const [meterStatus, setMeterStatus] = useState("not_started");
  const [secRequestNo, setSecRequestNo] = useState("");
  const [previousBillsCleared, setPreviousBillsCleared] = useState(false);
  const [meterTransferDate, setMeterTransferDate] = useState("");
  const [meterNotes, setMeterNotes] = useState("");

  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery<HandoverDetailResponse>({
    queryKey: ["/api/handover/units", id],
    queryFn: async () => {
      const res = await fetch(`/api/handover/units/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!data?.handover) return;
    const h = data.handover;
    setDeedNumber(h.deedNumber ?? "");
    setContractNumber(h.contractNumber ?? "");
    setInspectionDate(h.inspectionDate ?? "");
    setHandoverDate(h.handoverDate ?? "");
    setNotes(h.notes ?? "");
    setMeterNumber(h.meterNumber ?? "");
    setElectricityAccountNo(h.electricityAccountNo ?? "");
    setMeterReading(h.meterReadingAtHandover ?? "");
    setMeterStatus(h.meterTransferStatus ?? "not_started");
    setSecRequestNo(h.secRequestNo ?? "");
    setPreviousBillsCleared(!!h.previousBillsCleared);
    setMeterTransferDate(h.meterTransferDate ?? "");
    setMeterNotes(h.meterTransferNotes ?? "");
  }, [data?.handover]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/handover/units", id] });
    qc.invalidateQueries({ queryKey: ["/api/handover/units"] });
  };

  const updateGeneralMutation = useMutation({
    mutationFn: async () =>
      apiRequest("PATCH", `/api/handover/units/${id}`, {
        deedNumber: deedNumber || null,
        contractNumber: contractNumber || null,
        inspectionDate: inspectionDate || null,
        handoverDate: handoverDate || null,
        notes: notes || null,
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: "تم حفظ بيانات التسليم" });
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const saveMeterMutation = useMutation({
    mutationFn: async () =>
      apiRequest("PATCH", `/api/handover/units/${id}/meter-transfer`, {
        meterNumber: meterNumber || null,
        electricityAccountNo: electricityAccountNo || null,
        meterReadingAtHandover: meterReading || null,
        meterTransferStatus: meterStatus,
        secRequestNo: secRequestNo || null,
        previousBillsCleared,
        meterTransferDate: meterTransferDate || null,
        meterTransferNotes: meterNotes || null,
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: "تم تحديث إجراء نقل عداد الكهرباء" });
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const addSnagMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/handover/units/${id}/snags`, {
        title: sTitle,
        description: sDesc || null,
        category: sCategory,
        priority: sPriority,
        locationRoom: sRoom || null,
        locationDetails: sDetails || null,
      }),
    onSuccess: () => {
      invalidate();
      setSnagDialogOpen(false);
      setSTitle("");
      setSDesc("");
      setSRoom("");
      setSDetails("");
      toast({ title: "تمت إضافة الملاحظة إلى قاعدة البيانات" });
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const updateSnagStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) =>
      apiRequest("PATCH", `/api/snag-items/${itemId}`, { status }),
    onSuccess: () => {
      invalidate();
      toast({ title: "تم تحديث حالة الملاحظة" });
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/handover/units/${id}/complete`),
    onSuccess: () => {
      invalidate();
      toast({ title: "تم اعتماد وإنهاء تسليم الوحدة بنجاح" });
    },
    onError: (err: Error) => toast({ title: "تعذر إنهاء التسليم", description: err.message, variant: "destructive" }),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attId: string) => apiRequest("DELETE", `/api/handover/attachments/${attId}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "تم حذف المرفق" });
    },
  });

  const handleUpload = async (file: File | undefined, category: "meter_transfer" | "id_copy" | "protocol" | "other") => {
    if (!file || !data) return;
    setUploading(true);
    try {
      const uploaded = await uploadHandoverFile(file, data.project.id);
      await apiRequest("POST", `/api/handover/units/${id}/attachments`, {
        category,
        ...uploaded,
      });
      invalidate();
      toast({ title: "تم رفع المرفق بنجاح" });
    } catch (err: any) {
      toast({ title: "فشل الرفع", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const { handover, project, unit, unitLabel, client, snags, snagStats, completionCheck, attachments, activity } = data;
  const isCompleted = handover.status === "handed_over";

  return (
    <>
      {/* Interactive Screen Workspace */}
      <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto print:hidden">
        {/* Top Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <Button asChild variant="ghost" size="sm" className="px-0 text-slate-500 hover:text-primary">
              <Link href="/handover">
                <ArrowRight className="w-4 h-4 me-1" />
                {t("actions.back_to_list")}
              </Link>
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {handover.handoverNo} — {unitLabel}
              </h1>
              <Badge variant="outline" className="text-sm">
                {enumText("handover_status", handover.status)}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">{project.name}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="w-4 h-4 me-2" />
              {t("actions.print_protocol")}
            </Button>
            {!isCompleted && (
              <Button
                disabled={!completionCheck.ready || completeMutation.isPending}
                onClick={() => completeMutation.mutate()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="button-complete-handover"
              >
                <CheckCircle2 className="w-4 h-4 me-2" />
                {t("actions.complete_handover")}
              </Button>
            )}
          </div>
        </div>

        {/* Mandatory Gate Checklist */}
        <Card className={completionCheck.ready ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className={completionCheck.ready ? "w-5 h-5 text-emerald-600" : "w-5 h-5 text-amber-600"} />
              {t("gate.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              {snagStats.open === 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>
                {snagStats.open === 0 ? t("gate.snags_ok") : t("gate.snags_blocked", { count: snagStats.open })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {completionCheck.meterTransferDone ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{completionCheck.meterTransferDone ? t("gate.meter_ok") : t("gate.meter_blocked")}</span>
            </div>
          </CardContent>
        </Card>

        {/* Unit & Client + General Handover Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                بيانات العميل والوحدة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">العميل</div>
                <div className="font-semibold">{client?.fullName}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-slate-500">رقم الهوية</div>
                  <div className="font-mono">{client?.nationalId}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">الجوال</div>
                  <div className="font-mono">{client?.phone}</div>
                </div>
              </div>
              {client?.email && (
                <div>
                  <div className="text-xs text-slate-500">البريد الإلكتروني</div>
                  <div>{client.email}</div>
                </div>
              )}
              <hr className="border-slate-200 dark:border-slate-800" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-slate-500">رقم الوحدة</div>
                  <div className="font-medium">{unit?.unitCustomNumber || unit?.flatNo || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">المبنى / الدور</div>
                  <div>{[unit?.buildingNo, unit?.floor].filter(Boolean).join(" / ") || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">المساحة</div>
                  <div>{unit?.areaM2 ? `${unit.areaM2} م²` : "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">النوع</div>
                  <div>{unit?.villaType || "—"}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                بيانات محضر التسليم والوثائق
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("fields.deed_number")}</Label>
                  <Input value={deedNumber} onChange={(e) => setDeedNumber(e.target.value)} disabled={isCompleted} />
                </div>
                <div className="space-y-1">
                  <Label>{t("fields.contract_number")}</Label>
                  <Input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} disabled={isCompleted} />
                </div>
                <div className="space-y-1">
                  <Label>{t("fields.inspection_date")}</Label>
                  <Input type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} disabled={isCompleted} />
                </div>
                <div className="space-y-1">
                  <Label>{t("fields.handover_date")}</Label>
                  <Input type="date" value={handoverDate} onChange={(e) => setHandoverDate(e.target.value)} disabled={isCompleted} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t("fields.notes")}</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isCompleted} />
              </div>
              {!isCompleted && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    disabled={updateGeneralMutation.isPending}
                    onClick={() => updateGeneralMutation.mutate()}
                  >
                    حفظ البيانات
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Snags Section (linked directly to snag_lists & snag_items) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-primary" />
                ملاحظات تسليم الوحدة (Snags) — {snagStats.closed}/{snagStats.total} مغلقة
              </CardTitle>
              <CardDescription>
                تُسجَّل الملاحظات مباشرة في قاعدة بيانات الـ Snags الخاصة بالمشروع وتُغلق قبل اعتماد التسليم.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/projects/${project.id}/snag-list`}>فتح Snag List المشروع</Link>
              </Button>
              {!isCompleted && (
                <Button size="sm" onClick={() => setSnagDialogOpen(true)}>
                  <Plus className="w-4 h-4 me-1" />
                  {t("actions.add_snag")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {snags.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                لا توجد ملاحظات (Snags) مسجلة على هذه الوحدة حتى الآن.
              </div>
            ) : (
              <div className="space-y-2.5">
                {snags.map((row: any) => {
                  const item = row.item ?? row;
                  const st = snagStatusBadge[item.status] ?? { label: item.status, className: "" };
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{item.title}</span>
                          <Badge variant="outline" className={st.className}>
                            {st.label}
                          </Badge>
                          {item.locationRoom && (
                            <Badge variant="secondary" className="text-xs">
                              {item.locationRoom}
                            </Badge>
                          )}
                        </div>
                        {item.description && <p className="text-xs text-slate-500">{item.description}</p>}
                      </div>
                      {!isCompleted && (
                        <Select
                          value={item.status}
                          onValueChange={(val) => updateSnagStatusMutation.mutate({ itemId: item.id, status: val })}
                        >
                          <SelectTrigger className="w-40 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">مفتوحة</SelectItem>
                            <SelectItem value="in_progress">قيد المعالجة</SelectItem>
                            <SelectItem value="pending_inspection">بانتظار الفحص</SelectItem>
                            <SelectItem value="closed">مغلقة (تم الإصلاح)</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Saudi Electricity Company Meter Account Transfer */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                {t("meter_section.title")}
              </CardTitle>
              <CardDescription>{t("meter_section.subtitle")}</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <a href={SEC_PORTAL_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="w-4 h-4 me-2" />
                {t("actions.open_sec_portal")}
              </a>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>{t("fields.meter_number")}</Label>
                <Input value={meterNumber} onChange={(e) => setMeterNumber(e.target.value)} disabled={isCompleted} />
              </div>
              <div className="space-y-1">
                <Label>{t("fields.electricity_account_no")}</Label>
                <Input value={electricityAccountNo} onChange={(e) => setElectricityAccountNo(e.target.value)} disabled={isCompleted} />
              </div>
              <div className="space-y-1">
                <Label>{t("fields.meter_reading")}</Label>
                <Input value={meterReading} onChange={(e) => setMeterReading(e.target.value)} disabled={isCompleted} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>{t("fields.meter_transfer_status")}</Label>
                <Select value={meterStatus} onValueChange={setMeterStatus} disabled={isCompleted}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METER_TRANSFER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {enumText("meter_transfer_status", s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("fields.sec_request_no")}</Label>
                <Input value={secRequestNo} onChange={(e) => setSecRequestNo(e.target.value)} disabled={isCompleted} />
              </div>
              <div className="space-y-1">
                <Label>{t("fields.meter_transfer_date")}</Label>
                <Input type="date" value={meterTransferDate} onChange={(e) => setMeterTransferDate(e.target.value)} disabled={isCompleted} />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="bills-cleared"
                checked={previousBillsCleared}
                onCheckedChange={(v) => setPreviousBillsCleared(!!v)}
                disabled={isCompleted}
              />
              <Label htmlFor="bills-cleared" className="cursor-pointer">
                {t("fields.previous_bills_cleared")}
              </Label>
            </div>

            <div className="space-y-1">
              <Label>ملاحظات نقل العداد</Label>
              <Textarea rows={2} value={meterNotes} onChange={(e) => setMeterNotes(e.target.value)} disabled={isCompleted} />
            </div>

            {!isCompleted && (
              <div className="flex justify-end">
                <Button disabled={saveMeterMutation.isPending} onClick={() => saveMeterMutation.mutate()}>
                  {t("actions.save_meter")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attachments & Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-primary" />
                المرفقات (إشعار الكهرباء / الهوية / المحضر)
              </CardTitle>
              {!isCompleted && (
                <label className="cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => handleUpload(e.target.files?.[0], "meter_transfer")}
                  />
                  <Button asChild size="sm" variant="outline" disabled={uploading}>
                    <span>
                      <Upload className="w-4 h-4 me-1" />
                      {uploading ? "جاري الرفع..." : "إرفاق ملف"}
                    </span>
                  </Button>
                </label>
              )}
            </CardHeader>
            <CardContent>
              {attachments.length === 0 ? (
                <p className="text-sm text-slate-500">لا توجد مرفقات.</p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((att) => (
                    <div key={att.id} className="flex items-center justify-between p-2.5 rounded-lg border text-sm">
                      <a href={att.objectPath} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline truncate">
                        <FileText className="w-4 h-4 shrink-0" />
                        <span className="truncate">{att.fileName}</span>
                      </a>
                      {!isCompleted && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => deleteAttachmentMutation.mutate(att.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                سجل الإجراءات
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-slate-500">لا توجد حركات مسجلة.</p>
              ) : (
                <div className="space-y-2.5 text-sm">
                  {activity.map((act) => (
                    <div key={act.id} className="flex items-start justify-between border-b pb-2 last:border-none">
                      <div>
                        <div className="font-medium">{act.action}</div>
                        {act.note && <div className="text-xs text-slate-500">{act.note}</div>}
                      </div>
                      <div className="text-xs text-slate-400 text-end">
                        <div>{act.userName}</div>
                        <div>{new Date(act.createdAt).toLocaleDateString("en-GB")}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Add Snag Dialog */}
        <Dialog open={snagDialogOpen} onOpenChange={setSnagDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("actions.add_snag")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>عنوان الملاحظة *</Label>
                <Input value={sTitle} onChange={(e) => setSTitle(e.target.value)} placeholder="مثال: خدش في باب المجلس" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>التخصص</Label>
                  <Select value={sCategory} onValueChange={setSCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="architectural">معماري</SelectItem>
                      <SelectItem value="electrical">كهرباء</SelectItem>
                      <SelectItem value="plumbing">سباكة</SelectItem>
                      <SelectItem value="hvac">تكييف</SelectItem>
                      <SelectItem value="civil">مدني</SelectItem>
                      <SelectItem value="other">أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>الأولوية</Label>
                  <Select value={sPriority} onValueChange={setSPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">منخفضة</SelectItem>
                      <SelectItem value="medium">متوسطة</SelectItem>
                      <SelectItem value="high">عالية</SelectItem>
                      <SelectItem value="critical">حرجة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>الغرفة / الموقع</Label>
                <Select value={sRoom} onValueChange={setSRoom}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الغرفة" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomPresets.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>تفاصيل الموقع</Label>
                <Input value={sDetails} onChange={(e) => setSDetails(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>الوصف</Label>
                <Textarea rows={2} value={sDesc} onChange={(e) => setSDesc(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSnagDialogOpen(false)}>
                إلغاء
              </Button>
              <Button disabled={!sTitle.trim() || addSnagMutation.isPending} onClick={() => addSnagMutation.mutate()}>
                إضافة الملاحظة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Printable 6-Section Handover Protocol (excludes keys/warranties as requested) */}
      <div className="hidden print:block p-8 space-y-6 text-black bg-white" dir="rtl">
        <div className="flex justify-between items-start border-b-2 border-black pb-4">
          <div>
            <h1 className="text-xl font-bold">محضر استلام وتسليم وحدة عقارية</h1>
            <p className="text-sm">{project.organizationName}</p>
          </div>
          <div className="text-left text-sm">
            <div>رقم المحضر: {handover.handoverNo}</div>
            <div>التاريخ: {handover.handoverDate || new Date().toISOString().slice(0, 10)}</div>
          </div>
        </div>

        {/* 1. Unit & Document Details */}
        <section className="space-y-2">
          <h2 className="font-bold text-base border-b pb-1">1. البيانات التعريفية للوحدة والوثيقة</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>المشروع: {project.name}</div>
            <div>الوحدة: {unitLabel}</div>
            <div>رقم الصك: {handover.deedNumber || "—"}</div>
            <div>رقم العقد: {handover.contractNumber || "—"}</div>
            <div>المساحة: {unit?.areaM2 ? `${unit.areaM2} م²` : "—"}</div>
            <div>تاريخ المعاينة: {handover.inspectionDate || "—"}</div>
          </div>
        </section>

        {/* 2. Parties */}
        <section className="space-y-2">
          <h2 className="font-bold text-base border-b pb-1">2. بيانات الطرفين</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>الطرف الأول (المطور): {project.organizationName}</div>
            <div>ممثل التسليم: خدمة العملاء {data.completedByName ? `(${data.completedByName})` : ""}</div>
            <div>الطرف الثاني (العميل): {client?.fullName}</div>
            <div>رقم الهوية / الإقامة: {client?.nationalId}</div>
            <div>رقم الجوال: {client?.phone}</div>
            <div>البريد الإلكتروني: {client?.email || "—"}</div>
          </div>
        </section>

        {/* 3. Snags Summary */}
        <section className="space-y-2">
          <h2 className="font-bold text-base border-b pb-1">3. نتيجة الفحص الفني والملاحظات (Snags)</h2>
          <p className="text-sm">
            إجمالي الملاحظات المسجلة: {snagStats.total} | المغلقة: {snagStats.closed} | المتبقية المفتوحة: {snagStats.open}
          </p>
        </section>

        {/* 4. Electricity Meter */}
        <section className="space-y-2">
          <h2 className="font-bold text-base border-b pb-1">4. عداد الكهرباء (الشركة السعودية للكهرباء)</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>رقم العداد: {handover.meterNumber || "—"}</div>
            <div>رقم حساب الاشتراك: {handover.electricityAccountNo || "—"}</div>
            <div>قراءة العداد عند التسليم: {handover.meterReadingAtHandover || "—"}</div>
            <div>رقم طلب النقل: {handover.secRequestNo || "—"}</div>
            <div>حالة نقل الحساب: {enumText("meter_transfer_status", handover.meterTransferStatus)}</div>
            <div>تصفية الفواتير السابقة: {handover.previousBillsCleared ? "نعم، تمت التصفية" : "لا"}</div>
          </div>
        </section>

        {/* 5. Declarations */}
        <section className="space-y-2">
          <h2 className="font-bold text-base border-b pb-1">5. الإقرارات والشروط</h2>
          <p className="text-sm leading-relaxed">
            يقر الطرف الثاني (العميل) بمعاينة الوحدة الموضحة أعلاه معاينة تامة نافية للجهالة واستلامها بحالة سليمة وخالية من الملاحظات، والالتزام بإتمام متابعة حساب عداد الكهرباء باسمه اعتباراً من تاريخ الاستلام.
          </p>
        </section>

        {/* 6. Signatures */}
        <section className="pt-6 grid grid-cols-2 gap-8 text-sm">
          <div className="border-t border-black pt-2">
            <div className="font-bold">توقيع الطرف الأول (خدمة العملاء - المطور)</div>
            <div className="mt-8">الاسم: ....................................</div>
            <div>التاريخ: ....................................</div>
          </div>
          <div className="border-t border-black pt-2">
            <div className="font-bold">توقيع الطرف الثاني (العميل المستلم)</div>
            <div className="mt-8">الاسم: {client?.fullName}</div>
            <div>التاريخ: ....................................</div>
          </div>
        </section>
      </div>
    </>
  );
}
