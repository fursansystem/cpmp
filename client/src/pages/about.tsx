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
  HardDrive,
  Coins,
  Mail,
  Phone,
  Clock,
  ShieldCheck,
  Building2,
  UserCheck
} from "lucide-react";

export default function AboutPage() {
  const targetAudience = [
    {
      title: "Main Contractors",
      role: "Execute site operations, create Work Inspection Requests (WIRs), track snag lists, and manage deliveries.",
      icon: Building2,
      badge: "Field Operations"
    },
    {
      title: "Consultants & QA/QC Engineers",
      role: "Review and approve/reject inspection requests, issue Non-Conformance Reports (NCRs), and verify completed works.",
      icon: UserCheck,
      badge: "Quality Control"
    },
    {
      title: "Project Managers & Executives",
      role: "Monitor overall project health, track key milestones, review budget utilization, and access audit logs.",
      icon: Target,
      badge: "Management"
    },
    {
      title: "Organization Administrators",
      role: "Manage team memberships, set system permissions, configure project details, and handle system settings.",
      icon: ShieldCheck,
      badge: "Administration"
    }
  ];

  const keyFeatures = [
    {
      title: "Work Inspection Requests (WIR)",
      description: "Digital workflow for submitting, reviewing, and approving on-site inspection requests with multi-step consultant approvals.",
      icon: FileCheck2
    },
    {
      title: "NCR & Site Inspection Tracking",
      description: "Issue Non-Conformance Reports and Site Inspections, track corrective actions, and enforce quality control standards.",
      icon: AlertTriangle
    },
    {
      title: "Snag List Management",
      description: "Catalog defect items, assign responsible parties, track rectification statuses, and export formal PDF snag reports.",
      icon: ClipboardList
    },
    {
      title: "Project Storage & Documents",
      description: "Centralized cloud document storage for construction drawings, specifications, material submittals, and site photos.",
      icon: HardDrive
    },
    {
      title: "Budget & Financial Tracking",
      description: "Monitor purchase orders, track project expenditure, manage budget allocation, and oversee financial commitments.",
      icon: Coins
    },
    {
      title: "Audit Log & Compliance",
      description: "Comprehensive immutable activity logging to maintain full traceability across all project decisions and form approvals.",
      icon: Sparkles
    }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="p-3 bg-primary/10 rounded-2xl text-primary">
          <Info className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white tracking-tight">System Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Understanding ProjectManager Pro: Objectives, target audience, support contacts, and core functionalities.
          </p>
        </div>
      </div>

      {/* What the System is For */}
      <Card className="border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-white/5">
          <CardTitle className="flex items-center gap-2 text-xl font-bold">
            <Target className="w-5 h-5 text-primary" />
            About
          </CardTitle>
          <CardDescription>Primary functions, core objectives, and problems solved</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4 text-slate-700 dark:text-slate-300 leading-relaxed">
          <p>
            <strong className="text-slate-900 dark:text-white font-semibold">ProjectManager Pro</strong> is an enterprise-grade construction management platform built to digitize, streamline, and standardize field operations, quality assurance, and project governance across complex engineering projects.
          </p>
          <div className="grid md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-1">Eliminate Paper Processes</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400">Replaces physical paper inspection forms and manual sign-offs with real-time digital workflows.</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-1">Enhance Transparency</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400">Provides contractors, consultants, and owners real-time visibility into quality statuses and pending actions.</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-1">Ensure Full Auditability</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400">Maintains complete historical logs of every review, revision, and approval for contractual compliance.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Who Uses It */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Users className="w-5 h-5 text-primary" />
            Who Uses It
          </h2>
          <p className="text-sm text-muted-foreground">Intended audiences, departments, and user roles within the project ecosystem</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {targetAudience.map((item, idx) => (
            <Card key={idx} className="border-slate-200 dark:border-white/10 flex flex-col justify-between hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-primary/10 text-primary rounded-xl">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider">{item.badge}</Badge>
                </div>
                <CardTitle className="text-base font-bold">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-normal">{item.role}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Key Features */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Sparkles className="w-5 h-5 text-primary" />
            Key Features & Capabilities
          </h2>
          <p className="text-sm text-muted-foreground">Core functionalities designed to streamline construction workflows</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {keyFeatures.map((feat, idx) => (
            <Card key={idx} className="border-slate-200 dark:border-white/10 hover:border-primary/40 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-primary rounded-xl">
                    <feat.icon className="w-5 h-5" />
                  </div>
                  <CardTitle className="text-sm font-bold">{feat.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-normal">{feat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Ownership & Support */}
      <Card className="border-slate-200 dark:border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl text-white">
            <Headphones className="w-5 h-5 text-primary" />
            Technical Support
          </CardTitle>
          <CardDescription className="text-slate-400">
            Contact information for platform administrators, ownership team, and IT support desk
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2 grid md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider text-[11px]">System Sponsor</h4>
            <div className="flex items-center gap-3">
              <img src="/favicon.png" alt="Fursan Al Nama Logo" className="w-12 h-12 object-contain bg-white/10 rounded-xl p-1.5 border border-white/10 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">Project Manager Pro Contracting System (Semat)</p>
                <p className="text-xs text-slate-400">Fursan Al Nama Company - Makkah, KSA</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider text-[11px]">IT Support Channels</h4>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Mail className="w-4 h-4 text-primary shrink-0" />
              <span>it@fursan.sa</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Phone className="w-4 h-4 text-primary shrink-0" />
              <span>+966 559152522</span>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider text-[11px]">Support Hours & SLA</h4>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Clock className="w-4 h-4 text-primary shrink-0" />
              <span>Sat - Wed: 10:00 AM - 5:00 PM (GMT+3)</span>
            </div>
            <p className="text-xs text-slate-400">
              Critical on-site inspection issues receive priority response within 2 hours.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
