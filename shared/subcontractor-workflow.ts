// Standard Subcontractor Workflow definitions & commercial policy helpers
// Shared between Workflow Control & Delegation Center (UI), server/routes.ts, server/storage.ts, and server/payments-routes.ts.

export const SUBCONTRACTOR_WORKFLOW_STAGE_KEYS = [
  "sub_contract_manage",
  "sub_vo_approve",
  "sub_cert_prepare",
  "sub_cert_approve",
  "sub_cert_payment",
  "sub_settlement_chargeback",
] as const;

export type SubcontractorWorkflowStageKey = (typeof SUBCONTRACTOR_WORKFLOW_STAGE_KEYS)[number];

export const DEFAULT_VO_THRESHOLD_PERCENT = 10;

export interface SubcontractorWorkflowPolicy {
  voApprovalThresholdPercent: number;
}

export interface WorkflowStagePermission {
  allowed: boolean;
  hasConfig: boolean;
  assignedMembers: { id: string; name: string }[];
}

export interface SubcontractorStageMeta {
  key: SubcontractorWorkflowStageKey;
  module: "subcontractors";
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  defaultRuleAr: string;
  defaultRuleEn: string;
}

export const SUBCONTRACTOR_WORKFLOW_STAGES: SubcontractorStageMeta[] = [
  {
    key: "sub_contract_manage",
    module: "subcontractors",
    titleAr: "1. إدارة المقاولين والعقود وجداول الكميات (Direct Active)",
    titleEn: "1. Subcontractors, Contracts & BOQ Setup (Direct Active)",
    descriptionAr:
      "المخوّل بتسجيل مقاولي الباطن وإنشاء العقود النشطة مباشرةً وإعداد جداول الكميات (BOQ) وطرح أوامر التغيير.",
    descriptionEn:
      "Authorized to register subcontractors, create active contracts directly, maintain BOQ items, and submit Variation Orders.",
    defaultRuleAr: "الوضع الافتراضي: مهندسو المشروع، محاسب الكميات (QS)، مدير المكتب الفني، ومدير المشروع.",
    defaultRuleEn: "Default: Project Engineers, Quantity Surveyors (QS), Technical Office Manager, and Project Manager.",
  },
  {
    key: "sub_vo_approve",
    module: "subcontractors",
    titleAr: "2. اعتماد أوامر التغيير الكبرى (Major VO Approval)",
    titleEn: "2. Major Variation Orders (VO) Approval",
    descriptionAr:
      "صاحب صلاحية اعتماد أو رفض أوامر التغيير (VOs) عند تجاوز إجماليها للنسبة المحددة من قيمة العقد الأصلي قبل السماح بصرفها في المستخلصات.",
    descriptionEn:
      "Authority to approve or reject BOQ Variation Orders once cumulative VOs exceed the project's configured percentage threshold.",
    defaultRuleAr: "الوضع الافتراضي: مدير المشروع أو الإدارة العليا (Admin).",
    defaultRuleEn: "Default: Project Manager or Executive / Admin.",
  },
  {
    key: "sub_cert_prepare",
    module: "subcontractors",
    titleAr: "3. إعداد وحصر وتقديم مستخلصات الباطن (IPC Prep)",
    titleEn: "3. Prepare & Submit Subcontractor IPCs",
    descriptionAr:
      "المسؤول عن إعداد مسودة المستخلص، إدخال الكميات ونسب الإنجاز في جدول الكميات، إرفاق مستندات الحصر، ورفع المستخلص للاعتماد.",
    descriptionEn:
      "Authorized to draft IPCs, enter BOQ Current/Cumulative Qty or %, attach measurement sheets, and submit for approval.",
    defaultRuleAr: "الوضع الافتراضي: مهندسو الموقع والمشروع، محاسب الكميات (QS)، مدير التشييد، ومدير المشروع.",
    defaultRuleEn: "Default: Site/Project Engineers, Quantity Surveyors (QS), Construction Manager, and Project Manager.",
  },
  {
    key: "sub_cert_approve",
    module: "subcontractors",
    titleAr: "4. اعتماد ورفض مستخلصات الباطن (IPC Approval)",
    titleEn: "4. Approve / Reject Subcontractor IPCs",
    descriptionAr:
      "صاحب صلاحية المراجعة التجارية واعتماد المستخلص المرفوع (أو رفضه للتعديل) مع تطبيق مبدأ فصل المهام (لا يعتمد المعدّ مستخلصه).",
    descriptionEn:
      "Commercial authority to approve or reject submitted IPCs (separation of duties enforced: preparer cannot approve own IPC).",
    defaultRuleAr: "الوضع الافتراضي: مدير المشروع أو مدير النظام / المنظمة.",
    defaultRuleEn: "Default: Project Manager or Organization / Super Admin.",
  },
  {
    key: "sub_cert_payment",
    module: "subcontractors",
    titleAr: "5. المحاسبة وإصدار أمر الصرف للمستخلص (Finance Payment)",
    titleEn: "5. Issue Payment Order & Disbursement",
    descriptionAr:
      "المخوّل في الإدارة المالية بإصدار أمر الدفع المرتبط بالمستخلص المعتمد ومتابعة التحويل والسداد للمقاول.",
    descriptionEn:
      "Finance/Accounting authority to issue Payment Orders against approved IPCs and record disbursements.",
    defaultRuleAr: "الوضع الافتراضي: المحاسب (Accountant) أو مدير النظام.",
    defaultRuleEn: "Default: Accountant or System Admin.",
  },
  {
    key: "sub_settlement_chargeback",
    module: "subcontractors",
    titleAr: "6. اعتماد الخصومات والمخالصة النهائية وإغلاق العقود",
    titleEn: "6. Chargebacks, Final Settlement & Contract Closure",
    descriptionAr:
      "صلاحية الإجراءات التجارية الحساسة: اعتماد تحميل الفواتير على مقاولي الباطن، المخالصة النهائية للعقد، سحب العمل/الإلغاء، إعادة الفتح، أو الحذف.",
    descriptionEn:
      "Authority for high-risk commercial actions: approving chargebacks, final contract settlement, termination, reopening, or deletion.",
    defaultRuleAr: "الوضع الافتراضي: مدير المشروع أو الإدارة العليا (Admin).",
    defaultRuleEn: "Default: Project Manager or Executive / Admin.",
  },
];

// Determines whether Variation Orders (VOs) exceed the project's approval threshold.
// - thresholdPercent <= 0: ANY positive variation requires approval.
// - originalTotal <= 0 && variationsTotal > 0: requires approval (100%+ variation).
// - Otherwise: requires approval when variationsTotal > originalTotal * (thresholdPercent / 100) + 0.005.
export function isVoApprovalRequired(
  originalTotal: number,
  variationsTotal: number,
  thresholdPercent: number = DEFAULT_VO_THRESHOLD_PERCENT,
): boolean {
  const orig = Math.max(0, Number(originalTotal || 0));
  const vo = Math.max(0, Number(variationsTotal || 0));
  if (vo <= 0.005) return false;
  const pct = Math.max(0, Math.min(100, Number.isFinite(thresholdPercent) ? thresholdPercent : DEFAULT_VO_THRESHOLD_PERCENT));
  if (pct <= 0) return true;
  if (orig <= 0.005) return true;
  const limit = (orig * pct) / 100;
  return vo > limit + 0.005;
}

export function normalizeVoThresholdPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VO_THRESHOLD_PERCENT;
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}

export function resolveStageAccess(
  perm: WorkflowStagePermission | undefined,
  fallbackAllowed: boolean,
  isSuperAdmin = false,
): { allowed: boolean; viaDelegation: boolean; assignedNames: string[] } {
  if (isSuperAdmin) {
    return { allowed: true, viaDelegation: Boolean(perm?.hasConfig), assignedNames: perm?.assignedMembers.map((m) => m.name) ?? [] };
  }
  if (perm?.hasConfig) {
    return {
      allowed: Boolean(perm.allowed),
      viaDelegation: true,
      assignedNames: perm.assignedMembers.map((m) => m.name),
    };
  }
  return {
    allowed: Boolean(fallbackAllowed),
    viaDelegation: false,
    assignedNames: [],
  };
}
