import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Users,
  ShoppingCart,
  Warehouse,
  FileCheck2,
  Save,
  Check,
  X,
  UserCheck,
  Layers,
  Info,
  RotateCcw,
  Copy,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { TeamMember } from "@shared/schema";

interface ProjectWorkflowMatrixDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

interface WorkflowStageDef {
  key: string;
  module: "purchase_orders" | "warehouse" | "requests" | "snag_list";
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  defaultRuleAr: string;
  defaultRuleEn: string;
}

const WORKFLOW_STAGES: WorkflowStageDef[] = [
  // 1. المشتريات
  {
    key: "po_draft",
    module: "purchase_orders",
    titleAr: "إنشاء مسودة أمر الشراء",
    titleEn: "Create Purchase Order Draft",
    descriptionAr: "العضو المصرح له بملء طلبات الشراء، واختيار المواد وتجهيز المسودة للمراجعة.",
    descriptionEn: "Member authorized to prepare purchase order drafts and select materials.",
    defaultRuleAr: "الوضع الافتراضي: متاح لأي مهندس أو عضو مشارك في المشروع.",
    defaultRuleEn: "Default: Any assigned project engineer or member.",
  },
  {
    key: "po_approve",
    module: "purchase_orders",
    titleAr: "اعتماد أمر الشراء النهائي",
    titleEn: "Approve Purchase Order",
    descriptionAr: "العضو المخوّل بالتوقيع واعتماد أمر الشراء رسميًا لتحويله لمرحلة التوريد والاستلام.",
    descriptionEn: "Member authorized to approve purchase orders for dispatch and warehouse receiving.",
    defaultRuleAr: "الوضع الافتراضي: متاح فقط لمديري النظام ومديري المشروع (Admin).",
    defaultRuleEn: "Default: Only Project Managers and Admins.",
  },

  // 2. المستودع والتوريدات
  {
    key: "wh_receive",
    module: "warehouse",
    titleAr: "فحص واستلام التوريدات (Deliveries)",
    titleEn: "Receive & Inspect Deliveries",
    descriptionAr: "المسؤول عن استلام الشاحنات ومطابقة المواد الموردة مع أمر الشراء وإدخالها للمخزن.",
    descriptionEn: "Storekeeper / Engineer authorized to receive physical deliveries and record them.",
    defaultRuleAr: "الوضع الافتراضي: أمين المستودع أو أي عضو مسجل في المشروع.",
    defaultRuleEn: "Default: Storekeeper or any project member.",
  },
  {
    key: "wh_issue_create",
    module: "warehouse",
    titleAr: "إصدار طلب صرف مواد",
    titleEn: "Create Material Issue Voucher",
    descriptionAr: "العضو المخوّل بطلب صرف مواد من المخزن لفرق العمل أو مقاولي الباطن في الموقع.",
    descriptionEn: "Member authorized to create issue requests for site teams and subcontractors.",
    defaultRuleAr: "الوضع الافتراضي: مهندسو الموقع والمشرفون.",
    defaultRuleEn: "Default: Site engineers and supervisors.",
  },
  {
    key: "wh_issue_approve",
    module: "warehouse",
    titleAr: "اعتماد سندات الصرف",
    titleEn: "Approve Material Issue Vouchers",
    descriptionAr: "المسؤول عن الموافقة النهائية على خروج المواد وخصمها من الرصيد المخزني.",
    descriptionEn: "Authorized approver for dispensing inventory and deducting from balance.",
    defaultRuleAr: "الوضع الافتراضي: المناصب المعتمدة للمستودع أو مدير النظام.",
    defaultRuleEn: "Default: Configured warehouse approver positions or Super Admin.",
  },
  {
    key: "wh_adjust",
    module: "warehouse",
    titleAr: "تسجيل التسويات المخزنية (Adjustments)",
    titleEn: "Record Stock Adjustments",
    descriptionAr: "إجراء حساس لتعديل أرصدة المواد في حال وجود عجز أو فائض بعد الجرد.",
    descriptionEn: "Sensitive action for adjusting stock quantities after stock counts.",
    defaultRuleAr: "الوضع الافتراضي: مدير المشروع أو مدير النظام فقط.",
    defaultRuleEn: "Default: Project Manager or Admin only.",
  },

  // 3. الطلبات الهندسية (الخطوات الـ 7 لدورة حياة طلبات الفحص)
  {
    key: "req_contractor_prep",
    module: "requests",
    titleAr: "1. إعداد مسودة الطلب (Draft / Prep)",
    titleEn: "1. Contractor Preparation (Draft)",
    descriptionAr: "مهندس المقاول المكلّف بإعداد بيانات الفحص، ورفع المخططات والمواصفات وبيانات الموقع ومراجعة المرفقات.",
    descriptionEn: "Contractor engineer authorized to prepare inspection draft and upload drawings/specs.",
    defaultRuleAr: "الوضع الافتراضي: مهندسو الموقع ومسؤولو الجودة (QA/QC) التابعون للمقاول.",
    defaultRuleEn: "Default: Contractor QA/QC and site engineers.",
  },
  {
    key: "req_contractor_submit",
    module: "requests",
    titleAr: "2. مراجعة وتقديم الطلب (Contractor Submission)",
    titleEn: "2. Contractor Submission",
    descriptionAr: "المسؤول عن مراجعة اكتمال متطلبات الطلب وإرساله رسمياً إلى فريق الاستشاري المشرف.",
    descriptionEn: "Authorized to verify request completeness and officially submit to consultant.",
    defaultRuleAr: "الوضع الافتراضي: مراقب المستندات (DC) أو مهندس الجودة بالمقاول.",
    defaultRuleEn: "Default: Contractor Document Controller or QA/QC engineer.",
  },
  {
    key: "req_contractor_pm",
    module: "requests",
    titleAr: "3. اعتماد مدير مشروع المقاول (Contractor PM Approval)",
    titleEn: "3. Contractor PM Approval",
    descriptionAr: "مدير مشروع المقاول المخوّل بالموافقة الفنية والإدارية من طرف المقاول وتأكيد جاهزية الموقع للفحص.",
    descriptionEn: "Contractor Project Manager authorized to approve readiness and dispatch to consultant.",
    defaultRuleAr: "الوضع الافتراضي: مدير مشروع المقاول (Contractor PM).",
    defaultRuleEn: "Default: Contractor Project Manager.",
  },
  {
    key: "req_eng_review",
    module: "requests",
    titleAr: "4. مراجعة وتدقيق مهندس الاستشاري (Consultant Engineer Review)",
    titleEn: "4. Consultant Engineer Review",
    descriptionAr: "مهندس الاستشاري المكلّف بمطابقة المستندات والمواصفات الفنية قبل النزول للمعاينة الميدانية.",
    descriptionEn: "Consultant discipline engineer assigned to review specifications before site inspection.",
    defaultRuleAr: "الوضع الافتراضي: مهندسو الاستشاري المشرفون بحسب تخصص الطلب (مدني / معماري / كهروميكانيك).",
    defaultRuleEn: "Default: Consultant discipline engineers matching request discipline.",
  },
  {
    key: "req_site_inspect",
    module: "requests",
    titleAr: "5. المعاينة الميدانية وتعبئة القوائم (Site Inspection & Checklists)",
    titleEn: "5. Site Inspection & Checklist Verification",
    descriptionAr: "مهندس أو مراقب الاستشاري الميداني المسؤول عن النزول للموقع وتعبئة بنود التحقق الفنية وقوائم الفحص (Checklists).",
    descriptionEn: "Consultant inspector assigned to conduct site physical inspection and fill checklists.",
    defaultRuleAr: "الوضع الافتراضي: مراقبو ومهندسو الاستشاري الميدانيون.",
    defaultRuleEn: "Default: Consultant site inspectors and engineers.",
  },
  {
    key: "req_consultant_pm",
    module: "requests",
    titleAr: "6. مراجعة واعتماد مدير مشروع الاستشاري (Consultant PM Approval)",
    titleEn: "6. Consultant PM Review & Approval",
    descriptionAr: "مدير مشروع الاستشاري المخوّل بمراجعة نتائج الفحص الميداني والملاحظات والموافقة على التوصية الفنية.",
    descriptionEn: "Consultant Project Manager authorized to review inspection results and validate recommendations.",
    defaultRuleAr: "الوضع الافتراضي: مدير مشروع الاستشاري (Consultant PM) أو المهندس المقيم.",
    defaultRuleEn: "Default: Consultant Project Manager or Resident Engineer.",
  },
  {
    key: "req_final_approve",
    module: "requests",
    titleAr: "7. الاعتماد الهندسي النهائي وإغلاق الطلب (Final Approval)",
    titleEn: "7. Final Engineering Approval & Closure",
    descriptionAr: "صاحب التوقيع والقرار الهندسي النهائي على نتيجة الطلب (معتمد / مرفوض / معتمد بملاحظات) وإغلاق المعاملة رسمياً.",
    descriptionEn: "Final authority for officially approving or rejecting inspection requests and closing the transaction.",
    defaultRuleAr: "الوضع الافتراضي: مدير الاستشاري أو ممثل المالك (Owner Representative).",
    defaultRuleEn: "Default: Consultant Manager or Owner Representative.",
  },

  // 4. قائمة الملاحظات (الخطوات الـ 4 لدورة حياة الملاحظات)
  {
    key: "snag_create",
    module: "snag_list",
    titleAr: "1. إعداد وتوثيق الملاحظات (Draft & Documentation)",
    titleEn: "1. Raise & Document Snags (Draft)",
    descriptionAr: "العضو المصرح له برصد العيوب بالموقع والتقاط صور ما قبل الإصلاح (Before Photos) وتوصيف الملاحظات.",
    descriptionEn: "Authorized member to inspect site, capture before-fix photos, and log defect descriptions.",
    defaultRuleAr: "الوضع الافتراضي: مهندسو الاستشاري، ومراقبو الجودة (QA/QC)، وفريق المالك.",
    defaultRuleEn: "Default: Consultant discipline engineers, QA/QC inspectors, and Owner team.",
  },
  {
    key: "snag_issue",
    module: "snag_list",
    titleAr: "2. مراجعة وتصدير القائمة للمقاول (Issue to Contractor)",
    titleEn: "2. Issue Snag List to Contractor",
    descriptionAr: "المسؤول عن مراجعة اكتمال بنود القائمة واعتماد تصديرها رسمياً للمقاول الرئيسي لبدء المعالجة الميدانية.",
    descriptionEn: "Authorized member to review list completeness and officially dispatch to contractor.",
    defaultRuleAr: "الوضع الافتراضي: مدير مشروع الاستشاري (Consultant PM) أو مراقب المستندات.",
    defaultRuleEn: "Default: Consultant Project Manager or Document Controller.",
  },
  {
    key: "snag_rectify",
    module: "snag_list",
    titleAr: "3. معالجة العيوب وتقديم صور الإصلاح (Contractor Rectification & Submission)",
    titleEn: "3. Contractor Rectification & Submission",
    descriptionAr: "مهندس المقاول المكلّف بتنفيذ الإصلاحات الميدانية، وتوثيق صور ما بعد الإصلاح وشرح المعالجة وطلب المعاينة.",
    descriptionEn: "Contractor engineer authorized to complete repairs, upload after-fix photos, and submit for inspection.",
    defaultRuleAr: "الوضع الافتراضي: مهندسو الموقع والجودة (QA/QC) التابعون للمقاول الرئيسي.",
    defaultRuleEn: "Default: Contractor QA/QC and site engineers.",
  },
  {
    key: "snag_close",
    module: "snag_list",
    titleAr: "4. المعاينة الميدانية والاعتماد النهائي (Inspection & Sign-off Closure)",
    titleEn: "4. Inspection & Sign-off Closure",
    descriptionAr: "صاحب الصلاحية الحصرية لمعاينة الإصلاح الميداني والمصادقة على إغلاق البند نهائياً أو رفضه وإعادته للمقاول.",
    descriptionEn: "Exclusive authority to verify physical repairs and permanently sign off / close defects or reject.",
    defaultRuleAr: "الوضع الافتراضي: مدير مشروع الاستشاري أو من قام برصد الملاحظة.",
    defaultRuleEn: "Default: Consultant Project Manager or Snag Creator.",
  },
];

export function ProjectWorkflowMatrixDialog({
  open,
  onOpenChange,
  projectId,
}: ProjectWorkflowMatrixDialogProps) {
  const { i18n } = useTranslation(["common", "warehouse"]);
  const isArabic = i18n.language === "ar";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Selected assignments map: stageKey -> teamMemberIds[]
  const [stageAssignments, setStageAssignments] = useState<Record<string, string[]>>({});
  const [activeTab, setActiveTab] = useState<string>("purchase_orders");

  // Query assignments and candidate members
  const { data, isLoading } = useQuery<{
    assignments: any[];
    candidates: (TeamMember & { orgType?: string; orgName?: string })[];
    defaultMembers?: Record<
      string,
      { id: string; name: string; position: string | null; orgType: string }[]
    >;
    canManage: boolean;
  }>({
    queryKey: ["/api/projects", projectId, "workflow-assignments"],
    enabled: open && !!projectId,
  });

  // Populate state on data load
  useEffect(() => {
    if (open && data?.assignments) {
      const map: Record<string, string[]> = {};
      data.assignments.forEach((a) => {
        if (!map[a.stage]) map[a.stage] = [];
        if (a.teamMemberId && !map[a.stage].includes(a.teamMemberId)) {
          map[a.stage].push(a.teamMemberId);
        }
      });

      // Legacy backward compatibility for requests
      if (map["req_submit"]) {
        if (!map["req_contractor_prep"]) map["req_contractor_prep"] = [...map["req_submit"]];
        if (!map["req_contractor_submit"]) map["req_contractor_submit"] = [...map["req_submit"]];
        if (!map["req_contractor_pm"]) map["req_contractor_pm"] = [...map["req_submit"]];
      }
      if (map["req_inspect"]) {
        if (!map["req_eng_review"]) map["req_eng_review"] = [...map["req_inspect"]];
        if (!map["req_site_inspect"]) map["req_site_inspect"] = [...map["req_inspect"]];
      }
      if (map["req_approve"]) {
        if (!map["req_consultant_pm"]) map["req_consultant_pm"] = [...map["req_approve"]];
        if (!map["req_final_approve"]) map["req_final_approve"] = [...map["req_approve"]];
      }

      setStageAssignments(map);
    }
  }, [open, data]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: { module: string; stage: string; teamMemberIds: string[] }[] = [];
      WORKFLOW_STAGES.forEach((stage) => {
        const assignedIds = stageAssignments[stage.key] || [];
        payload.push({
          module: stage.module,
          stage: stage.key,
          teamMemberIds: assignedIds,
        });
      });

      return await apiRequest("PUT", `/api/projects/${projectId}/workflow-assignments`, {
        assignments: payload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "workflow-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "workflow-permissions"] });
      toast({
        title: isArabic ? "تم حفظ إعدادات سير العمل بنجاح" : "Workflow assignments saved successfully",
        description: isArabic
          ? "تم تطبيق تفويض الصلاحيات فوراً على جميع أعضاء المشروع."
          : "Delegation rules applied immediately to project members.",
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: isArabic ? "فشل الحفظ" : "Save failed",
        description: err?.message || (isArabic ? "حدث خطأ غير متوقع" : "Unexpected error"),
        variant: "destructive",
      });
    },
  });

  const candidates = data?.candidates || [];
  const canManage = data?.canManage !== false;

  const toggleMember = (stageKey: string, memberId: string) => {
    setStageAssignments((prev) => {
      const current = prev[stageKey] || [];
      if (current.includes(memberId)) {
        return { ...prev, [stageKey]: current.filter((id) => id !== memberId) };
      } else {
        return { ...prev, [stageKey]: [...current, memberId] };
      }
    });
  };

  const removeMember = (stageKey: string, memberId: string) => {
    setStageAssignments((prev) => ({
      ...prev,
      [stageKey]: (prev[stageKey] || []).filter((id) => id !== memberId),
    }));
  };

  const loadDefaultsAsCustom = (stageKey: string, excludeMemberId?: string) => {
    const stageDefaultMembers = data?.defaultMembers?.[stageKey] || [];
    const ids = stageDefaultMembers
      .map((m) => m.id)
      .filter((id) => id !== excludeMemberId);
    setStageAssignments((prev) => ({
      ...prev,
      [stageKey]: ids,
    }));
    toast({
      title: isArabic ? "تم تحويل المرحلة للتخصيص" : "Stage converted to custom",
      description: excludeMemberId
        ? (isArabic ? "تم استبعاد العضو واعتماد باقي الأعضاء للتعديل المباشر." : "Member excluded and remaining members loaded for editing.")
        : (isArabic ? "تم نسخ الأعضاء الافتراضيين، يمكنك الآن الإضافة أو الحذف بحرية." : "Default members loaded, you can now add or remove freely."),
    });
  };

  const resetToDefault = (stageKey: string) => {
    setStageAssignments((prev) => ({
      ...prev,
      [stageKey]: [],
    }));
    toast({
      title: isArabic ? "تمت العودة للوضع الافتراضي" : "Reverted to Default Mode",
      description: isArabic
        ? "ستطبق القاعدة الديناميكية التلقائية للنظام على هذه المرحلة."
        : "Dynamic system rules will apply to this stage.",
    });
  };

  const getMemberById = (id: string) => candidates.find((c) => c.id === id);

  const modulesTabs = [
    { key: "purchase_orders", labelAr: "المشتريات", labelEn: "Purchase Orders", icon: ShoppingCart },
    { key: "warehouse", labelAr: "المستودع والتوريدات", labelEn: "Warehouse", icon: Warehouse },
    { key: "requests", labelAr: "طلبات الفحص الهندسية", labelEn: "Inspection Requests", icon: FileCheck2 },
    { key: "snag_list", labelAr: "قائمة الملاحظات", labelEn: "Snag List", icon: Layers },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-border text-start">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                {isArabic ? "مركز تحكم مسارات العمل والتفويض" : "Workflow Control & Delegation Center"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {isArabic
                  ? "حدد الأعضاء المسؤولين عن كل مرحلة في هذا المشروع بالاسم. المراحل الخالية ستعمل بالصلاحيات الافتراضية تلقائياً دون أي تعطيل."
                  : "Assign specific project members to each workflow stage. Unassigned stages will use default system permissions."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body with Tabs */}
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="px-6 pt-3 border-b border-border bg-muted/20">
              <TabsList className="grid grid-cols-4 w-full h-11 bg-muted/60 p-1 rounded-xl">
                {modulesTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger
                      key={tab.key}
                      value={tab.key}
                      className="text-xs font-semibold gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      <Icon className="w-4 h-4 text-primary" />
                      <span>{isArabic ? tab.labelAr : tab.labelEn}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {modulesTabs.map((tab) => {
                const stages = WORKFLOW_STAGES.filter((s) => s.module === tab.key);

                return (
                  <TabsContent key={tab.key} value={tab.key} className="m-0 space-y-4">
                    {stages.map((stage) => {
                      const assignedMemberIds = stageAssignments[stage.key] || [];
                      const hasAssigned = assignedMemberIds.length > 0;
                      const stageDefaultMembers = data?.defaultMembers?.[stage.key] || [];

                      return (
                        <div
                          key={stage.key}
                          className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all shadow-xs space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-sm text-foreground">
                                  {isArabic ? stage.titleAr : stage.titleEn}
                                </h4>
                                {hasAssigned ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-none text-[11px] font-semibold gap-1">
                                    <UserCheck className="w-3 h-3" />
                                    {assignedMemberIds.length} {isArabic ? "مكلف يدوياً" : "Manually Assigned"}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground text-[10px] font-normal border-primary/20 bg-primary/5 text-primary">
                                    {isArabic ? "الوضع الافتراضي" : "Default Mode"}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {isArabic ? stage.descriptionAr : stage.descriptionEn}
                              </p>
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 mt-1">
                                <Info className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                                <span>{isArabic ? stage.defaultRuleAr : stage.defaultRuleEn}</span>
                              </div>
                            </div>

                            {/* Member Selector & Quick Actions */}
                            {canManage && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                {hasAssigned ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => resetToDefault(stage.key)}
                                    className="h-8 text-xs font-semibold gap-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg px-2"
                                    title={isArabic ? "إلغاء التخصيص والعودة للوضع الافتراضي التلقائي" : "Reset to dynamic default mode"}
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">{isArabic ? "إعادة للافتراضي" : "Reset to Default"}</span>
                                  </Button>
                                ) : (
                                  stageDefaultMembers.length > 0 && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => loadDefaultsAsCustom(stage.key)}
                                      className="h-8 text-xs font-semibold gap-1.5 text-primary border-primary/30 hover:bg-primary/5 rounded-lg px-2.5"
                                      title={isArabic ? "تحرير وتعديل الأعضاء بالزيادة أو النقصان" : "Edit members by adding or removing"}
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                      <span>{isArabic ? "تحرير" : "Edit"}</span>
                                    </Button>
                                  )
                                )}

                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 text-xs font-semibold gap-1.5 rounded-lg shrink-0 border-dashed"
                                    >
                                      <Users className="w-3.5 h-3.5 text-primary" />
                                      {isArabic ? "تخصيص أعضاء محددين" : "Assign Members"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-80 p-0 rounded-xl shadow-lg" align="end">
                                    <div className="p-2 px-3 border-b bg-muted/40 flex items-center justify-between text-xs">
                                      {hasAssigned ? (
                                        <>
                                          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                            <UserCheck className="w-3.5 h-3.5" />
                                            {isArabic ? `${assignedMemberIds.length} عضو مخصص` : `${assignedMemberIds.length} assigned`}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => resetToDefault(stage.key)}
                                            className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1 font-medium transition-colors"
                                          >
                                            <RotateCcw className="w-3 h-3" />
                                            {isArabic ? "إعادة للافتراضي" : "Reset"}
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-[11px] text-muted-foreground font-medium">
                                            {isArabic ? "الوضع الحالي: افتراضي" : "Mode: Default"}
                                          </span>
                                          {stageDefaultMembers.length > 0 && (
                                            <button
                                              type="button"
                                              onClick={() => loadDefaultsAsCustom(stage.key)}
                                              className="text-[11px] text-primary hover:underline flex items-center gap-1 font-semibold"
                                            >
                                              <Copy className="w-3 h-3" />
                                              {isArabic ? `تحديد الافتراضيين (${stageDefaultMembers.length})` : `Select defaults (${stageDefaultMembers.length})`}
                                            </button>
                                          )}
                                        </>
                                      )}
                                    </div>
                                    <Command>
                                      <CommandInput
                                        placeholder={isArabic ? "ابحث عن عضو..." : "Search member..."}
                                        className="h-9 text-xs"
                                      />
                                      <CommandList className="max-h-60">
                                        <CommandEmpty className="p-3 text-xs text-center text-muted-foreground">
                                          {isArabic ? "لا يوجد أعضاء مطابقون" : "No members found"}
                                        </CommandEmpty>
                                        <CommandGroup>
                                          {candidates.map((member) => {
                                            const isSelected = assignedMemberIds.includes(member.id);
                                            const orgLabel =
                                              member.orgType === "contractor"
                                                ? isArabic ? "المقاول" : "Contractor"
                                                : member.orgType === "consultant"
                                                ? isArabic ? "الاستشاري" : "Consultant"
                                                : member.orgType === "developer"
                                                ? isArabic ? "المالك" : "Owner"
                                                : "";

                                            return (
                                              <CommandItem
                                                key={member.id}
                                                value={`${member.name} ${member.position || ""} ${orgLabel}`}
                                                onSelect={() => toggleMember(stage.key, member.id)}
                                                className="flex items-center justify-between text-xs py-2 cursor-pointer"
                                              >
                                                <div className="flex items-center gap-2">
                                                  <Avatar className="w-6 h-6 rounded-full">
                                                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                                      {member.name.slice(0, 2).toUpperCase()}
                                                    </AvatarFallback>
                                                  </Avatar>
                                                  <div>
                                                    <div className="flex items-center gap-1.5">
                                                      <p className="font-medium text-foreground">{member.name}</p>
                                                      {orgLabel && (
                                                        <span className="text-[9px] px-1 py-0.2 bg-muted rounded text-muted-foreground font-medium">
                                                          {orgLabel}
                                                        </span>
                                                      )}
                                                    </div>
                                                    {member.position && (
                                                      <p className="text-[10px] text-muted-foreground">
                                                        {member.position}
                                                      </p>
                                                    )}
                                                  </div>
                                                </div>
                                                {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                                              </CommandItem>
                                            );
                                          })}
                                        </CommandGroup>
                                      </CommandList>
                                    </Command>
                                  </PopoverContent>
                                </Popover>
                              </div>
                            )}
                          </div>

                          {/* 1. Manually Assigned Members Badges */}
                          {hasAssigned ? (
                            <div className="pt-2 border-t border-border/50 flex flex-wrap gap-2 items-center">
                              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <UserCheck className="w-3.5 h-3.5" />
                                {isArabic ? "الأعضاء المكلّفون بالاسم:" : "Assigned Members:"}
                              </span>
                              {assignedMemberIds.map((mId) => {
                                const m = getMemberById(mId);
                                if (!m) return null;
                                return (
                                  <Badge
                                    key={mId}
                                    variant="secondary"
                                    className="pl-2 pr-1 py-0.5 text-xs font-medium rounded-md gap-1.5 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border border-emerald-500/20"
                                  >
                                    <Avatar className="w-4 h-4 rounded-full">
                                      <AvatarFallback className="text-[8px] bg-emerald-500/20 text-emerald-700">
                                        {m.name.slice(0, 1)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span>{m.name}</span>
                                    {m.position && (
                                      <span className="text-[10px] opacity-75">({m.position})</span>
                                    )}
                                    {canManage && (
                                      <button
                                        type="button"
                                        onClick={() => removeMember(stage.key, mId)}
                                        className="text-muted-foreground hover:text-destructive p-0.5 rounded-full ml-1"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                  </Badge>
                                );
                              })}
                            </div>
                          ) : (
                            /* 2. Default Qualified Members */
                            <div className="pt-2 border-t border-border/50 space-y-1.5">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                                <Users className="w-3.5 h-3.5 text-primary/70" />
                                <span>
                                  {isArabic
                                    ? "الأعضاء المؤهلون تلقائياً في المشروع (الوضع الافتراضي):"
                                    : "Default Qualified Members in Project:"}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5 items-center">
                                {stageDefaultMembers.length > 0 ? (
                                  stageDefaultMembers.map((m) => (
                                    <Badge
                                      key={m.id}
                                      variant="outline"
                                      className="pl-2 pr-1.5 py-0.5 text-xs font-normal rounded-md gap-1.5 bg-muted/40 border-muted-foreground/20 text-foreground group hover:border-primary/40 transition-colors"
                                    >
                                      <Avatar className="w-4 h-4 rounded-full">
                                        <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                                          {m.name.slice(0, 1)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <span className="font-medium">{m.name}</span>
                                      {m.position && (
                                        <span className="text-[10px] text-muted-foreground">({m.position})</span>
                                      )}
                                      {m.orgType && (
                                        <span className="text-[9px] px-1 py-0.2 bg-background/80 rounded text-muted-foreground font-medium border border-border/60">
                                          {m.orgType}
                                        </span>
                                      )}
                                      {canManage && (
                                        <button
                                          type="button"
                                          onClick={() => loadDefaultsAsCustom(stage.key, m.id)}
                                          className="text-muted-foreground/60 hover:text-destructive p-0.5 rounded-full ml-0.5 transition-colors"
                                          title={isArabic ? `استبعاد ${m.name} وتعديل القائمة (نقصان)` : `Exclude ${m.name} and edit`}
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      )}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-[11px] text-muted-foreground/80 italic">
                                    {isArabic
                                      ? "لا يوجد أعضاء مطابقون مسجلون في المشروع حالياً (يحتفظ مدير النظام الأعلى بالصلاحية)."
                                      : "No matching members registered in project (Super Admin retains access)."}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </TabsContent>
                );
              })}
            </div>
          </Tabs>
        )}

        {/* Footer */}
        <DialogFooter className="p-4 px-6 border-t border-border bg-muted/10 flex items-center justify-between sm:justify-between">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            <span>
              {isArabic
                ? "يحتفظ مدير النظام الأعلى (Super Admin) بصلاحية الطوارئ دائماً."
                : "Super Admin retains emergency override for all stages."}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs rounded-xl"
            >
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            {canManage && (
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="text-xs font-semibold rounded-xl gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {saveMutation.isPending
                  ? isArabic
                    ? "جارٍ الحفظ..."
                    : "Saving..."
                  : isArabic
                  ? "حفظ إعدادات سير العمل"
                  : "Save Assignments"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
