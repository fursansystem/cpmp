import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Info,
  Target,
  Users,
  Headphones,
  Sparkles,
  FileCheck2,
  AlertTriangle,
  ClipboardList,
  ListChecks,
  HardDrive,
  Coins,
  Mail,
  Phone,
  Clock,
  ShieldCheck,
  Building2,
  UserCheck,
  Calculator,
  PackageSearch,
  FileSearch,
  ShoppingCart,
  Truck,
  Warehouse,
  Images,
  Banknote,
  ReceiptText,
  BadgeMinus,
  BarChart3,
  Grid3x3,
  FileBadge,
  BookOpen,
  Stamp,
  History,
  Bell,
  Languages,
  Webhook,
  UsersRound,
} from "lucide-react";

// Only ids and icons live here. Every word on the page comes from shared/i18n/<lang>/about.json,
// keyed by these ids — adding a card means adding its id here and its text in both files.
const GOALS = ["paperless", "transparency", "auditability", "one_place"] as const;

const AUDIENCE: { id: string; icon: LucideIcon }[] = [
  { id: "contractors", icon: Building2 },
  { id: "consultants", icon: UserCheck },
  { id: "managers", icon: Target },
  { id: "finance", icon: Calculator },
  { id: "supply", icon: PackageSearch },
  { id: "admins", icon: ShieldCheck },
];

type Feature = { id: string; icon: LucideIcon; isNew?: boolean };

const FEATURE_GROUPS: { id: string; items: Feature[] }[] = [
  {
    id: "quality",
    items: [
      { id: "wir", icon: FileCheck2 },
      { id: "ncr_si", icon: AlertTriangle },
      { id: "snag", icon: ClipboardList },
      { id: "checklists", icon: ListChecks },
    ],
  },
  {
    id: "procurement",
    items: [
      { id: "rfq", icon: FileSearch, isNew: true },
      { id: "purchase_orders", icon: ShoppingCart, isNew: true },
      { id: "deliveries", icon: Truck },
      { id: "warehouse", icon: Warehouse, isNew: true },
      { id: "materials", icon: Images },
    ],
  },
  {
    id: "finance",
    items: [
      { id: "payments", icon: Banknote, isNew: true },
      { id: "sub_certificates", icon: ReceiptText, isNew: true },
      { id: "deductions", icon: BadgeMinus, isNew: true },
      { id: "fin_reports", icon: BarChart3, isNew: true },
      { id: "budget", icon: Coins },
    ],
  },
  {
    id: "progress",
    items: [
      { id: "matrix", icon: Grid3x3, isNew: true },
      { id: "progress_certificates", icon: FileBadge, isNew: true },
    ],
  },
  {
    id: "permits",
    items: [
      { id: "permit_catalog", icon: BookOpen, isNew: true },
      { id: "permit_tracking", icon: Stamp, isNew: true },
    ],
  },
  {
    id: "platform",
    items: [
      { id: "storage", icon: HardDrive },
      { id: "audit", icon: History },
      { id: "notifications", icon: Bell, isNew: true },
      { id: "bilingual", icon: Languages, isNew: true },
      { id: "erp", icon: Webhook, isNew: true },
      { id: "access", icon: UsersRound },
    ],
  },
];

// Letter-spacing pulls joined Arabic letters apart, and Arabic has no capitals, so the small-caps
// label treatment is applied in LTR only.
const EYEBROW = "ltr:uppercase ltr:tracking-wider";

export default function AboutPage() {
  const { t } = useTranslation("about");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="p-3 bg-primary/10 rounded-2xl text-primary">
          <Info className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white tracking-tight">{t("header.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("header.subtitle")}</p>
        </div>
      </div>

      {/* What the System is For */}
      <Card className="border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-white/5">
          <CardTitle className="flex items-center gap-2 text-xl font-bold">
            <Target className="w-5 h-5 text-primary" />
            {t("intro.title")}
          </CardTitle>
          <CardDescription>{t("intro.description")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4 text-slate-700 dark:text-slate-300 leading-relaxed">
          <p>
            <strong className="text-slate-900 dark:text-white font-semibold">{t("intro.product")}</strong> {t("intro.body")}
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            {GOALS.map((id) => (
              <div key={id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
                <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-1">{t(`intro.goals.${id}.title`)}</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{t(`intro.goals.${id}.text`)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Who Uses It */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Users className="w-5 h-5 text-primary" />
            {t("audience.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("audience.subtitle")}</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {AUDIENCE.map((item) => (
            <Card key={item.id} className="border-slate-200 dark:border-white/10 flex flex-col hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="p-2 bg-primary/10 text-primary rounded-xl">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <Badge variant="secondary" className={`text-xs font-bold ${EYEBROW}`}>{t(`audience.items.${item.id}.badge`)}</Badge>
                </div>
                <CardTitle className="text-base font-bold">{t(`audience.items.${item.id}.title`)}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{t(`audience.items.${item.id}.role`)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Key Features */}
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Sparkles className="w-5 h-5 text-primary" />
            {t("features.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("features.subtitle")}</p>
        </div>

        {FEATURE_GROUPS.map((group) => (
          <section key={group.id} className="space-y-3" data-testid={`about-group-${group.id}`}>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-2">
              {t(`features.groups.${group.id}`)}
            </h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.items.map((feat) => (
                <Card key={feat.id} className="border-slate-200 dark:border-white/10 hover:border-primary/40 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-primary rounded-xl shrink-0">
                        <feat.icon className="w-5 h-5" />
                      </div>
                      <CardTitle className="text-sm font-bold leading-normal flex-1 min-w-0">{t(`features.items.${feat.id}.title`)}</CardTitle>
                      {feat.isNew && (
                        <Badge className="shrink-0 text-xs font-bold">{t("features.new_badge")}</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{t(`features.items.${feat.id}.description`)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Ownership & Support */}
      <Card className="border-slate-200 dark:border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl text-white">
            <Headphones className="w-5 h-5 text-primary" />
            {t("support.title")}
          </CardTitle>
          <CardDescription className="text-slate-400">{t("support.description")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-2 grid md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <h4 className={`text-xs font-bold text-slate-200 ${EYEBROW}`}>{t("support.sponsor")}</h4>
            <div className="flex items-center gap-3">
              <img src="/favicon.png" alt={t("support.logo_alt")} className="w-12 h-12 object-contain bg-white/10 rounded-xl p-1.5 border border-white/10 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">{t("support.product_name")}</p>
                <p className="text-xs text-slate-400">{t("support.company")}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className={`text-xs font-bold text-slate-200 ${EYEBROW}`}>{t("support.channels")}</h4>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Mail className="w-4 h-4 text-primary shrink-0" />
              <a href="mailto:it@fursan.sa" dir="ltr" className="hover:text-white">it@fursan.sa</a>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Phone className="w-4 h-4 text-primary shrink-0" />
              <a href="tel:+966559152522" dir="ltr" className="hover:text-white">+966 559152522</a>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className={`text-xs font-bold text-slate-200 ${EYEBROW}`}>{t("support.hours_title")}</h4>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Clock className="w-4 h-4 text-primary shrink-0" />
              <span>{t("support.hours")}</span>
            </div>
            <p className="text-xs text-slate-400">{t("support.sla")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
