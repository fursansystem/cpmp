// The built-in service catalogue of الرخص والمعاملات: the services a construction project usually goes
// through with government authorities and utilities in Saudi Arabia. Each entry points at the authority's
// own portal. Fees, durations and validity differ by city, project type and over time, so they are left for
// the user to fill in from the authority; the steps and documents are the usual ones and can be edited.
// Entries with a `source` were checked against the authority's own service page on that date
// (steps, requirements, fee and duration as published there); the rest are the usual ones.

import { sql } from "drizzle-orm";
import { db } from "./db";

export interface SeedAuthority {
  code: string;
  name: string;
  nameEn: string;
  portalUrl: string | null;
}

export interface SeedService {
  code: string;
  authority: string;
  category: string;
  name: string;
  description: string;
  serviceUrl: string | null;
  channels: string;
  isLicense: boolean;
  feeNote: string;
  /** Service duration published by the authority, in days (permit_services.sla_days) */
  slaDays?: number;
  /** Where the details were taken from, and when they were last checked */
  source?: { url: string; checkedAt: string };
  steps: { title: string; party: "developer" | "contractor" | "consultant" | "any"; isPaymentStep?: boolean; description?: string }[];
  requirements: { kind: "document" | "condition"; title: string; mandatory?: boolean }[];
}

export const SEED_AUTHORITIES: SeedAuthority[] = [
  { code: "balady", name: "وزارة البلديات والإسكان — منصة بلدي", nameEn: "Ministry of Municipalities and Housing (Balady)", portalUrl: "https://balady.gov.sa" },
  { code: "civil_defense", name: "المديرية العامة للدفاع المدني — منصة سلامة", nameEn: "General Directorate of Civil Defense (Salama)", portalUrl: "https://998.gov.sa" },
  { code: "sec", name: "الشركة السعودية للكهرباء", nameEn: "Saudi Electricity Company", portalUrl: "https://www.se.com.sa" },
  { code: "nwc", name: "شركة المياه الوطنية", nameEn: "National Water Company", portalUrl: "https://www.nwc.com.sa" },
  { code: "ncec", name: "المركز الوطني للرقابة على الالتزام البيئي", nameEn: "National Center for Environmental Compliance", portalUrl: "https://ncec.gov.sa" },
  { code: "rega", name: "الهيئة العامة للعقار", nameEn: "Real Estate General Authority", portalUrl: "https://rega.gov.sa" },
  { code: "insurer", name: "شركة التأمين المعتمدة", nameEn: "Licensed insurer", portalUrl: null },
];

const FEE_NOTE = "تُحدَّد الرسوم من الجهة عند تقديم الطلب";
const BALADY = "إلكترونياً عبر منصة بلدي / بلدي أعمال";

export const SEED_SERVICES: SeedService[] = [
  {
    code: "survey_decision",
    authority: "balady",
    category: "municipal",
    name: "إصدار قرار مساحي",
    description: "تحديد حدود قطعة الأرض وأطوالها ومساحتها على الطبيعة، ويُطلب قبل إصدار رخصة البناء.",
    serviceUrl: "https://balady.gov.sa",
    channels: BALADY,
    isLicense: false,
    feeNote: FEE_NOTE,
    steps: [
      { title: "تفويض مكتب هندسي معتمد للرفع المساحي", party: "developer" },
      { title: "تنفيذ الرفع المساحي ورفعه على المنصة", party: "consultant" },
      { title: "مراجعة الأمانة / البلدية للطلب", party: "any" },
      { title: "سداد الرسوم", party: "developer", isPaymentStep: true },
      { title: "استلام القرار المساحي وحفظه في المشروع", party: "developer" },
    ],
    requirements: [
      { kind: "document", title: "صك الملكية" },
      { kind: "document", title: "هوية المالك أو السجل التجاري للمطوّر" },
      { kind: "document", title: "تفويض المكتب الهندسي" },
    ],
  },
  {
    code: "building_permit",
    authority: "balady",
    category: "municipal",
    name: "إصدار رخصة بناء",
    description: "خدمة إلكترونية في منصة بلدي تمكّن المستفيد من البدء في أعمال البناء بشكل نظامي، بعد استيفاء واعتماد المخططات الهندسية والوثائق المطلوبة من المكاتب الهندسية المعتمدة والجهات ذات العلاقة، دون الحاجة لمراجعة الجهة.",
    serviceUrl: "https://balady.gov.sa/ar/services/%D8%A5%D8%B5%D8%AF%D8%A7%D8%B1-%D8%B1%D8%AE%D8%B5%D8%A9-%D8%A8%D9%86%D8%A7%D8%A1",
    channels: "إلكترونياً فقط عبر لوحة التحكم في بوابة بلدي وتطبيق الجوال",
    isLicense: true,
    feeNote: "تُحسب من حاسبة الرسوم في منصة بلدي، إضافة إلى قسط وثيقة التأمين ضد العيوب الخفية. طرق الدفع: سداد، فيزا، ماستر كارد، مدى، Apple Pay",
    slaDays: 10,
    source: { url: "https://balady.gov.sa/ar/services/%D8%A5%D8%B5%D8%AF%D8%A7%D8%B1-%D8%B1%D8%AE%D8%B5%D8%A9-%D8%A8%D9%86%D8%A7%D8%A1", checkedAt: "2026-11-07" },
    steps: [
      { title: "تفويض مكتب هندسي مصمم لإصدار رخصة البناء", party: "developer", description: "يدخل المالك أو من يمثله لوحة التحكم ويختار صفة المستخدم ثم يفوّض المكتب المصمم." },
      { title: "قبول التفويض واختيار التقرير المساحي للأرض", party: "consultant", description: "عبر منصة بلدي أعمال." },
      { title: "إعداد التصاميم المعمارية والإنشائية وإرفاق الملفات والموافقة على التعهدات البلدية", party: "consultant" },
      { title: "تدقيق شركة الفحص الفني للتصاميم وفق كود البناء السعودي", party: "any", description: "تُسند شركة التأمين الطلب آلياً لشركة الفحص الفني؛ الملاحظات تُعاد للمكتب المصمم لمعالجتها." },
      { title: "مراجعة الأمانة / البلدية وإصدار شهادة اعتماد التصاميم", party: "any" },
      { title: "تحديد المكتب المشرف وموافقته على إسناد الرخصة", party: "consultant" },
      { title: "تحديد مقاول البناء وموافقته وإرفاق بياناته ومرفقاته", party: "contractor" },
      { title: "سداد وثيقة التأمين ضد العيوب الخفية", party: "developer", isPaymentStep: true, description: "يرسل نظام بلدي طلب الوثيقة آلياً لشركة التأمين ويصل رابط السداد للمقاول والمستفيد." },
      { title: "اعتماد الرسوم البلدية وإصدار الفاتورة", party: "consultant" },
      { title: "سداد رسوم الرخصة", party: "developer", isPaymentStep: true, description: "لا تُعد الرخصة سارية إلا بعد سداد رسوم الرخصة ووثيقة التأمين." },
      { title: "إصدار الرخصة وإشعار الجهات المرتبطة (الكهرباء، المياه، الدفاع المدني، السجل العيني…)", party: "any" },
    ],
    requirements: [
      { kind: "document", title: "صك إلكتروني محدّث من وزارة العدل أو عقد إسكان أو عقد استثماري" },
      { kind: "document", title: "قرار مساحي (بغرض البناء)" },
      { kind: "condition", title: "التعاقد مع مكتب هندسي مصمم لتصميم المخططات الهندسية" },
      { kind: "condition", title: "التعاقد مع مكتب هندسي مشرف ومقاول بناء" },
      { kind: "document", title: "وثيقة التأمين ضد العيوب الخفية للمبنى" },
      { kind: "document", title: "تقرير دراسة التربة" },
      { kind: "document", title: "الدراسة المرورية للمشروع (إذا تطلّب النشاط ذلك)", mandatory: false },
      { kind: "condition", title: "الإقرارات والتعهدات البلدية" },
      { kind: "condition", title: "سداد رسوم الخدمة" },
    ],
  },
  {
    code: "building_permit_renewal",
    authority: "balady",
    category: "municipal",
    name: "تجديد رخصة بناء",
    description: "تجديد رخصة البناء قبل انتهائها إذا لم تكتمل الأعمال.",
    serviceUrl: "https://balady.gov.sa/ar/services/renewal-building-permit",
    channels: BALADY,
    isLicense: true,
    feeNote: FEE_NOTE,
    steps: [
      { title: "تقديم طلب التجديد", party: "developer" },
      { title: "مراجعة الطلب من الأمانة / البلدية", party: "any" },
      { title: "سداد الرسوم", party: "developer", isPaymentStep: true },
      { title: "طباعة الرخصة المجدّدة", party: "developer" },
    ],
    requirements: [
      { kind: "document", title: "رخصة البناء الحالية" },
      { kind: "document", title: "تقرير المكتب المشرف عن نسبة الإنجاز" },
    ],
  },
  {
    code: "site_preparation",
    authority: "balady",
    category: "municipal",
    name: "رخصة تهيئة الموقع والتسوير",
    description: "الترخيص بأعمال تهيئة الموقع (التسوير، الحفر، الردم) قبل البدء في البناء.",
    serviceUrl: "https://balady.gov.sa/ar/services/issuing-site-preparation-license",
    channels: BALADY,
    isLicense: true,
    feeNote: FEE_NOTE,
    steps: [
      { title: "تقديم الطلب ورفع المخططات", party: "consultant" },
      { title: "مراجعة الأمانة / البلدية", party: "any" },
      { title: "سداد الرسوم", party: "developer", isPaymentStep: true },
      { title: "إصدار الرخصة", party: "developer" },
    ],
    requirements: [
      { kind: "document", title: "صك الملكية" },
      { kind: "document", title: "القرار المساحي" },
      { kind: "document", title: "مخطط تهيئة الموقع" },
    ],
  },
  {
    code: "excavation_permit",
    authority: "balady",
    category: "municipal",
    name: "تصريح أعمال الحفريات",
    description: "تصريح الحفر في الطرق والممرات العامة لتمديد الخدمات إلى المشروع.",
    serviceUrl: "https://balady.gov.sa",
    channels: BALADY,
    isLicense: true,
    feeNote: FEE_NOTE,
    steps: [
      { title: "تقديم طلب التصريح ومخطط مسار الحفر", party: "contractor" },
      { title: "موافقة الجهات المعنية بالخدمات", party: "any" },
      { title: "سداد الرسوم والضمان", party: "developer", isPaymentStep: true },
      { title: "إعادة الوضع إلى ما كان عليه وإغلاق التصريح", party: "contractor" },
    ],
    requirements: [
      { kind: "document", title: "مخطط مسار الحفر" },
      { kind: "document", title: "خطة السلامة المرورية" },
    ],
  },
  {
    code: "building_modification",
    authority: "balady",
    category: "municipal",
    name: "إضافة وتعديل مكونات البناء",
    description: "تعديل رخصة بناء قائمة بإضافة أو تعديل مكونات المبنى.",
    serviceUrl: "https://momah.gov.sa/en/e-services/add-and-modify-building",
    channels: BALADY,
    isLicense: false,
    feeNote: FEE_NOTE,
    steps: [
      { title: "إعداد المخططات المعدّلة", party: "consultant" },
      { title: "تقديم الطلب عبر المنصة", party: "developer" },
      { title: "تدقيق الأمانة / البلدية", party: "any" },
      { title: "سداد الرسوم", party: "developer", isPaymentStep: true },
    ],
    requirements: [
      { kind: "document", title: "رخصة البناء الحالية" },
      { kind: "document", title: "المخططات المعدّلة" },
    ],
  },
  {
    code: "building_compliance",
    authority: "balady",
    category: "municipal",
    name: "شهادة مطابقة / إتمام البناء",
    description: "شهادة تثبت أن المبنى نُفّذ وفق الرخصة والمخططات المعتمدة، وتُطلب لإيصال الخدمات والإشغال.",
    serviceUrl: "https://balady.gov.sa/ar/services/issuing-building-compliance-certificate",
    channels: BALADY,
    isLicense: false,
    feeNote: FEE_NOTE,
    steps: [
      { title: "تقرير المكتب المشرف بإتمام الأعمال", party: "consultant" },
      { title: "تقديم الطلب", party: "developer" },
      { title: "الكشف الميداني من الأمانة / البلدية", party: "any" },
      { title: "سداد الرسوم", party: "developer", isPaymentStep: true },
      { title: "استلام الشهادة", party: "developer" },
    ],
    requirements: [
      { kind: "document", title: "رخصة البناء" },
      { kind: "document", title: "تقرير الإشراف النهائي" },
      { kind: "document", title: "شهادة الدفاع المدني" },
      { kind: "condition", title: "إزالة المخالفات وإعادة الأرصفة" },
    ],
  },
  {
    code: "cd_plans_approval",
    authority: "civil_defense",
    category: "civil_defense",
    name: "اعتماد مخططات أنظمة السلامة",
    description: "اعتماد مخططات أنظمة الإنذار والإطفاء ومخارج الطوارئ قبل التنفيذ.",
    serviceUrl: "https://998.gov.sa",
    channels: "إلكترونياً عبر منصة سلامة",
    isLicense: false,
    feeNote: FEE_NOTE,
    steps: [
      { title: "إعداد مخططات أنظمة السلامة من مكتب معتمد", party: "consultant" },
      { title: "رفع الطلب على منصة سلامة", party: "developer" },
      { title: "مراجعة الدفاع المدني", party: "any" },
      { title: "سداد الرسوم", party: "developer", isPaymentStep: true },
      { title: "استلام الاعتماد", party: "developer" },
    ],
    requirements: [
      { kind: "document", title: "رخصة البناء" },
      { kind: "document", title: "مخططات أنظمة الإنذار والإطفاء" },
      { kind: "document", title: "مخطط مخارج الطوارئ" },
    ],
  },
  {
    code: "cd_safety_license",
    authority: "civil_defense",
    category: "civil_defense",
    name: "إصدار رخصة سلامة (بوابة سلامة)",
    description: "خدمة إلكترونية تتيح للمنشآت التي تمتلك سجلات تجارية سارية المفعول إصدار رخصة سلامة من الدفاع المدني.",
    serviceUrl: "https://998.gov.sa/ar/Page/Services/1/",
    channels: "إلكترونياً عبر بوابة سلامة (موقع الويب)",
    isLicense: true,
    feeNote: "صفحة الخدمة تذكر التكلفة 0، لكن خطوات الخدمة تتضمن سداد فاتورة عبر سداد — تُحدَّد عند تقديم الطلب",
    slaDays: 1,
    source: { url: "https://998.gov.sa/ar/Page/Services/1/", checkedAt: "2026-11-07" },
    steps: [
      { title: "التسجيل في خدمة سلامة كطالب ترخيص", party: "developer" },
      { title: "تعبئة الحقول المطلوبة بعد تحديد نوع النشاط", party: "developer" },
      { title: "إرفاق المستندات المطلوبة حسب نوع النشاط", party: "developer" },
      { title: "سداد فاتورة سداد", party: "developer", isPaymentStep: true },
      { title: "انتظار موافقة المختص على الطلب", party: "any" },
      { title: "طباعة الترخيص", party: "developer" },
    ],
    requirements: [
      { kind: "document", title: "الهوية الوطنية" },
      { kind: "document", title: "صورة من السجل التجاري أو الصناعي" },
      { kind: "document", title: "خطاب رسمي من الجهة الحكومية المختصة", mandatory: false },
      { kind: "document", title: "صورة من رخصة البناء" },
      { kind: "document", title: "رسم كروكي للموقع" },
      { kind: "document", title: "صورة من عقد الإيجار أو إثبات الملكية" },
      { kind: "document", title: "عقد صيانة لأنظمة السلامة ساري المفعول" },
      { kind: "document", title: "عقد صيانة المصاعد (إن وجد)", mandatory: false },
      { kind: "document", title: "وثيقة التأمين على المنشأة" },
      { kind: "document", title: "تصريح الدفاع المدني السابق (إن وجد)", mandatory: false },
      { kind: "condition", title: "سجل تجاري ساري المفعول" },
    ],
  },
  {
    code: "sec_temporary_meter",
    authority: "sec",
    category: "electricity",
    name: "عداد كهرباء مؤقت للموقع",
    description: "توصيل كهرباء مؤقتة لموقع الإنشاء خلال فترة التنفيذ.",
    serviceUrl: "https://www.se.com.sa",
    channels: "إلكترونياً عبر موقع وتطبيق الشركة السعودية للكهرباء",
    isLicense: false,
    feeNote: FEE_NOTE,
    steps: [
      { title: "تقديم الطلب", party: "contractor" },
      { title: "معاينة الموقع وتحديد التكلفة", party: "any" },
      { title: "سداد تكلفة التوصيل", party: "developer", isPaymentStep: true },
      { title: "تركيب العداد", party: "any" },
    ],
    requirements: [
      { kind: "document", title: "رخصة البناء" },
      { kind: "document", title: "الأحمال الكهربائية المطلوبة" },
    ],
  },
  {
    code: "sec_permanent_connection",
    authority: "sec",
    category: "electricity",
    name: "إيصال التيار الكهربائي الدائم",
    description: "إيصال الكهرباء الدائمة للمبنى بعد إتمامه.",
    serviceUrl: "https://www.se.com.sa",
    channels: "إلكترونياً عبر موقع وتطبيق الشركة السعودية للكهرباء",
    isLicense: false,
    feeNote: FEE_NOTE,
    steps: [
      { title: "تقديم طلب الإيصال", party: "developer" },
      { title: "اعتماد مخططات الأحمال من مكتب هندسي", party: "consultant" },
      { title: "سداد تكلفة التوصيل", party: "developer", isPaymentStep: true },
      { title: "تنفيذ التوصيل وتركيب العدادات", party: "any" },
    ],
    requirements: [
      { kind: "document", title: "رخصة البناء" },
      { kind: "document", title: "شهادة إتمام البناء" },
      { kind: "document", title: "جدول الأحمال الكهربائية" },
    ],
  },
  {
    code: "nwc_connection",
    authority: "nwc",
    category: "water",
    name: "إيصال خدمة المياه والصرف الصحي",
    description: "توصيل المبنى بشبكتي المياه والصرف الصحي.",
    serviceUrl: "https://www.nwc.com.sa",
    channels: "إلكترونياً عبر موقع وتطبيق شركة المياه الوطنية",
    isLicense: false,
    feeNote: FEE_NOTE,
    steps: [
      { title: "تقديم طلب الإيصال", party: "developer" },
      { title: "معاينة الموقع", party: "any" },
      { title: "سداد رسوم الإيصال", party: "developer", isPaymentStep: true },
      { title: "تنفيذ التوصيل وتركيب العداد", party: "any" },
    ],
    requirements: [
      { kind: "document", title: "رخصة البناء" },
      { kind: "document", title: "صك الملكية" },
    ],
  },
  {
    code: "environmental_permit",
    authority: "ncec",
    category: "environment",
    name: "التصريح البيئي لأعمال الإنشاء",
    description: "تصريح بيئي للمشاريع التي تتطلب تقييم الأثر البيئي أثناء الإنشاء.",
    serviceUrl: "https://ncec.gov.sa",
    channels: "إلكترونياً عبر بوابة المركز",
    isLicense: true,
    feeNote: FEE_NOTE,
    steps: [
      { title: "إعداد دراسة الأثر البيئي من مكتب معتمد", party: "consultant" },
      { title: "تقديم الطلب", party: "developer" },
      { title: "مراجعة المركز", party: "any" },
      { title: "سداد الرسوم", party: "developer", isPaymentStep: true },
      { title: "إصدار التصريح", party: "developer" },
    ],
    requirements: [
      { kind: "document", title: "دراسة تقييم الأثر البيئي" },
      { kind: "document", title: "خطة إدارة المخلفات الإنشائية" },
    ],
  },
  {
    code: "offplan_sales_license",
    authority: "rega",
    category: "real_estate",
    name: "ترخيص البيع على الخارطة (وافي)",
    description: "ترخيص بيع وحدات المشروع قبل اكتمال إنشائها، ويتطلب حساب ضمان ومحاسباً قانونياً واستشارياً.",
    serviceUrl: "https://rega.gov.sa",
    channels: "إلكترونياً عبر بوابة الهيئة العامة للعقار",
    isLicense: true,
    feeNote: FEE_NOTE,
    steps: [
      { title: "تقديم طلب الترخيص", party: "developer" },
      { title: "فتح حساب الضمان لدى بنك معتمد", party: "developer" },
      { title: "تعيين المحاسب القانوني والاستشاري المعتمدين", party: "developer" },
      { title: "مراجعة الهيئة للطلب", party: "any" },
      { title: "سداد الرسوم", party: "developer", isPaymentStep: true },
      { title: "إصدار الترخيص", party: "developer" },
    ],
    requirements: [
      { kind: "document", title: "رخصة البناء" },
      { kind: "document", title: "صك الملكية" },
      { kind: "document", title: "السجل التجاري للمطوّر" },
      { kind: "document", title: "خطاب فتح حساب الضمان" },
      { kind: "document", title: "عقد المحاسب القانوني" },
      { kind: "document", title: "عقد الاستشاري" },
    ],
  },
  {
    code: "latent_defects_insurance",
    authority: "insurer",
    category: "insurance",
    name: "وثيقة التأمين على العيوب الخفية",
    description: "تأمين يغطي العيوب الإنشائية الخفية بعد إتمام المبنى، ويُطلب ضمن رحلة رخصة البناء للمباني المشمولة.",
    serviceUrl: null,
    channels: "عبر شركة تأمين معتمدة، ومن خلال رحلة المستفيد في منصة بلدي",
    isLicense: true,
    feeNote: "قسط التأمين حسب عرض شركة التأمين",
    steps: [
      { title: "طلب عروض من شركات التأمين المعتمدة", party: "developer" },
      { title: "تعيين جهة الفحص الفني المعتمدة", party: "developer" },
      { title: "سداد قسط التأمين", party: "developer", isPaymentStep: true },
      { title: "إصدار الوثيقة وربطها برخصة البناء", party: "developer" },
    ],
    requirements: [
      { kind: "document", title: "المخططات المعتمدة" },
      { kind: "document", title: "تقرير فحص التربة" },
      { kind: "document", title: "عقد جهة الفحص الفني" },
    ],
  },
];

// Adds the built-in authorities and services the database does not have yet. Safe to run any number of times:
// services already there (and an administrator's edits to them) are left alone. Returns how many were added.
// Run by migrate_permits_tables.ts and again when the server starts, so the catalogue is never left empty.
export async function seedPermitCatalogue(): Promise<number> {
  for (const a of SEED_AUTHORITIES) {
    await db.execute(sql`
      INSERT INTO permit_authorities (code, name, name_en, portal_url)
      VALUES (${a.code}, ${a.name}, ${a.nameEn}, ${a.portalUrl})
      ON CONFLICT (code) WHERE organization_id IS NULL DO NOTHING
    `);
  }
  let added = 0;
  for (const s of SEED_SERVICES) {
    const inserted = await db.execute(sql`
      INSERT INTO permit_services (code, authority_id, name, category, description, service_url, channels, is_license, fee_note, sla_days)
      SELECT ${s.code}, a.id, ${s.name}, ${s.category}, ${s.description}, ${s.serviceUrl}, ${s.channels}, ${s.isLicense}, ${s.feeNote}, ${s.slaDays ?? null}
      FROM permit_authorities a WHERE a.code = ${s.authority} AND a.organization_id IS NULL
      ON CONFLICT (code) WHERE organization_id IS NULL DO NOTHING
      RETURNING id
    `);
    const id = (inserted.rows[0] as { id?: string } | undefined)?.id;
    if (!id) continue;
    added += 1;
    for (let i = 0; i < s.steps.length; i++) {
      const step = s.steps[i];
      await db.execute(sql`
        INSERT INTO permit_service_steps (service_id, seq, title, description, party, is_payment_step)
        VALUES (${id}, ${i + 1}, ${step.title}, ${step.description ?? null}, ${step.party}, ${!!step.isPaymentStep})
      `);
    }
    for (let i = 0; i < s.requirements.length; i++) {
      const r = s.requirements[i];
      await db.execute(sql`
        INSERT INTO permit_service_requirements (service_id, seq, kind, title, mandatory)
        VALUES (${id}, ${i + 1}, ${r.kind}, ${r.title}, ${r.mandatory ?? true})
      `);
    }
  }
  return added;
}
