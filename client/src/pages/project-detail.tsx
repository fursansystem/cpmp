import { PaymentActionButtons } from "@/components/payments/payment-actions";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ClipboardList,
  ShoppingCart,
  FileText,
  FolderOpen,
  Users,
  TrendingUp,
  Calendar,
  MapPin,
  ArrowLeft,
  ChevronRight,
  Settings,
  DollarSign,
  Warehouse,
  Boxes,
  Grid3X3,
  Receipt,
  Wallet
} from "lucide-react";
import { format, differenceInDays, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import type { Project } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { ProjectPartiesCard } from "@/components/project-parties-card";

const statusConfig = {
  active: { label: "Active", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  pending: { label: "Pending", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  completed: { label: "Completed", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  overdue: { label: "Overdue", className: "bg-destructive/10 text-destructive border-destructive/20" },
  "on-hold": { label: "On Hold", className: "bg-muted text-muted-foreground border-border" },
};

export default function ProjectDetail() {
  const { projectId } = useParams();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) throw new Error("Failed to fetch project");
      return response.json();
    },
  });

  // Light summary of the progress matrix (مصفوفة الإنجاز) for the section card
  const { data: matrixSummary } = useQuery<{ projectProgress: number; nodeCount: number; certificateCount: number }>({
    queryKey: ["/api/projects", projectId, "progress-matrix", "summary"],
    enabled: !!projectId,
  });

  // Live figures for the Payments card: what is open, and what is late
  const { data: paymentsReport } = useQuery<{
    totals: { openBillRequests: number; ordersPendingApproval: number; subCertsPendingCount: number };
    monitoring: {
      delayedDecisions: { total: number };
      paymentsWithoutOriginals: { notRequested: { count: number }; requestedPending: { count: number } };
      unpaidInvoices: { amount: number };
    };
  }>({
    queryKey: ["payments", "project-card", projectId],
    queryFn: async () => (await fetch(`/api/payments/reports?projectId=${projectId}`, { credentials: "include" })).json(),
    enabled: !!projectId,
    meta: { persist: false },
  });

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-12 w-64 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="h-96 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Project not found.
      </div>
    );
  }

  const statusInfo = statusConfig[project.status as keyof typeof statusConfig] || statusConfig.active;

  const cards = [
    {
      title: "Project Requests",
      description: "Manage and track all project requests including WIR, MIR, and MSR approvals.",
      icon: ClipboardList,
      count: (project as any).requestCount || 0,
      link: `/projects/${projectId}/requests`,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-900/10",
      active: true
    },
    {
      title: "Purchase Orders",
      description: "Supply chain management, material lists, and procurement tracking.",
      icon: ShoppingCart,
      count: (project as any).supplierCount || 0,
      link: `/projects/${projectId}/purchase-orders`,
      color: "text-amber-600",
      bg: "bg-amber-50 dark:bg-amber-900/10",
      active: true
    },
    {
      title: "مصفوفة الإنجاز (Progress Matrix)",
      description: "Weighted progress by phase, item and unit, filled automatically from approved WIRs.",
      icon: Grid3X3,
      count: matrixSummary && matrixSummary.nodeCount > 0 ? `${matrixSummary.projectProgress.toFixed(1)}%` : "—",
      link: `/projects/${projectId}/progress-matrix`,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-900/10",
      active: true
    },
    {
      title: "المستخلصات (Payment Certificates)",
      description: "Unit-level payment certificates: earned, pending, paid and remaining amounts.",
      icon: Receipt,
      count: (project as any).paymentCertificateCount || 0,
      link: `/projects/${projectId}/progress-matrix?tab=certificates`,
      color: "text-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-900/10",
      active: true
    },
    {
      title: "المدفوعات (Payments)",
      description: paymentsReport
        ? `${paymentsReport.totals.openBillRequests} أصول مطلوبة · ${paymentsReport.totals.ordersPendingApproval} أوامر بانتظار الاعتماد · ${paymentsReport.monitoring.delayedDecisions.total} قرارات متأخرة`
        : "طلب أصول الفواتير، أوامر الدفع، الرخص والخصومات لهذا المشروع.",
      icon: Wallet,
      // open items that need somebody: requests to answer, orders and certificates to decide, payments missing originals
      count: paymentsReport
        ? paymentsReport.totals.openBillRequests + paymentsReport.totals.ordersPendingApproval + paymentsReport.totals.subCertsPendingCount +
          paymentsReport.monitoring.paymentsWithoutOriginals.notRequested.count + paymentsReport.monitoring.paymentsWithoutOriginals.requestedPending.count
        : "—",
      link: `/payments?project=${projectId}`,
      color: "text-teal-600",
      bg: "bg-teal-50 dark:bg-teal-900/10",
      active: true
    },
    {
      title: "المستودع (Warehouse)",
      description: "أرصدة المخزون، التوريدات، سندات الصرف، التحويلات ودفتر الحركة.",
      icon: Warehouse,
      count: (project as any).deliveryCount || 0,
      link: `/projects/${projectId}/warehouse`,
      color: "text-orange-600",
      bg: "bg-orange-50 dark:bg-orange-900/10",
      active: true
    },
    {
      title: "Project Materials",
      description: "A visual showroom of project materials categorized by sections (Sanitary, Electrical, Construction, etc.).",
      icon: Boxes,
      count: (project as any).materialCount || 0,
      link: `/projects/${projectId}/material-gallery`,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-900/10",
      active: true
    },
    {
      title: "Manage Storage",
      description: "Manage project folders, engineering drawings, and documents with tags and categories.",
      icon: FolderOpen,
      count: (project as any).documentCount || 0,
      link: `/projects/${projectId}/storage`,
      color: "text-purple-600",
      bg: "bg-purple-50 dark:bg-purple-900/10",
      active: true
    },
    {
      title: "Snag List & Punch List",
      description: "Track site defects, inspections, punch lists, before/after photos, and contractor assignments.",
      icon: ClipboardList,
      count: (project as any).snagCount || 0,
      link: `/projects/${projectId}/snag-list`,
      color: "text-rose-600",
      bg: "bg-rose-50 dark:bg-rose-900/10",
      active: true
    }
  ];

  return (
    <div className="min-h-screen bg-transparent px-6 lg:px-10 pt-2 pb-8 space-y-4 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px]" />
      </div>

      {/* Header Section */}
      <div className="flex items-center justify-between relative min-h-[2.5rem] lg:min-h-[3rem]">
        <div className="flex items-center gap-2 flex-1">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 w-8 p-0 md:h-auto md:w-auto md:px-3 md:py-2 text-muted-foreground hover:text-foreground shrink-0 shadow-sm z-10"
            onClick={() => navigate("/projects")}
          >
            <ArrowLeft className="w-5 h-5 md:mr-2" />
            <span className="hidden md:inline font-semibold">Back to Projects</span>
          </Button>
        </div>

        {/* Centered Project Title (All Screens) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-2 lg:gap-3 w-full justify-center px-12 lg:px-0">
          <Badge variant="secondary" className="px-4 py-1.5 lg:px-8 lg:py-2 border-none bg-blue-500/10 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 rounded-full shadow-sm lg:shadow-md">
            <span className="text-sm lg:text-xl font-bold tracking-tight uppercase truncate max-w-[120px] sm:max-w-none">{project.name}</span>
          </Badge>
          
          <Badge
            variant="outline"
            className={cn(
              "px-2 py-1 lg:px-4 lg:py-1.5 border-none shadow-sm rounded-full flex items-center gap-2",
              statusInfo.className
            )}
          >
            <div 
              className={cn(
                "w-2 h-2 rounded-full shrink-0", 
                project.status === 'active' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : 
                project.status === 'pending' ? "bg-amber-500" : 
                "bg-blue-500"
              )} 
            />
            <span className="hidden lg:inline text-sm font-bold">{statusInfo.label}</span>
          </Badge>
        </div>

        <div className="flex items-center gap-3 shrink-0 z-10">
          {/* Right side spacer/buttons */}
        </div>
      </div>

      {/* Project Metadata Bar */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 lg:gap-10 text-[11px] lg:text-sm text-muted-foreground bg-muted/30 p-2 rounded-[1.5rem] border border-border/50 shadow-sm">
        {/* Location - Order 1 */}
        <div className="flex items-center gap-1.5 lg:gap-2.5 order-1">
          <div className="hidden lg:flex p-1.5 bg-background rounded-lg shadow-sm border">
            <MapPin className="w-4 h-4 text-blue-500" />
          </div>
          <MapPin className="w-3.5 h-3.5 text-blue-500 lg:hidden" />
          <span className="font-semibold text-foreground">{project.location}</span>
        </div>
        
        {/* Client - Order 2 on mobile */}
        <div className="flex items-center gap-1.5 lg:gap-2.5 order-2 lg:order-3">
          <div className="hidden lg:flex p-1.5 bg-background rounded-lg shadow-sm border">
            <Users className="w-4 h-4 text-emerald-500" />
          </div>
          <Users className="w-3.5 h-3.5 text-emerald-500 lg:hidden" />
          <span className="font-semibold text-foreground">{(project as any).developerName || "Client"}</span>
        </div>

        {/* Date - Order 3 on mobile (bottom) */}
        <div className="flex items-center gap-1.5 lg:gap-2.5 order-3 lg:order-2 w-full lg:w-auto justify-center lg:justify-start">
          <div className="hidden lg:flex p-1.5 bg-background rounded-lg shadow-sm border">
            <Calendar className="w-4 h-4 text-amber-500" />
          </div>
          <Calendar className="w-3.5 h-3.5 text-amber-500 lg:hidden" />
          <span className="font-semibold text-foreground">
            {format(new Date(project.startDate), "MMM d, yyyy")} - {format(new Date(project.endDate), "MMM d, yyyy")}
          </span>
        </div>
      </div>

      {/* Who is on the project, including roles still waiting on an answer */}
      <ProjectPartiesCard project={project} />

      {/* Main Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Progress Card */}
        <Card className="p-5 rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5 group relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-60">Live Progress</p>
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-foreground/70 uppercase tracking-tight">Overall Progress</h3>
                <p className="text-3xl font-black font-display tracking-tighter text-blue-600">{project.progress}%</p>
              </div>
              <div className="pt-2 flex items-center gap-3">
                <div className="h-1 flex-1 bg-muted/30 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.5)]" style={{ width: `${project.progress}%` }} />
                </div>
              </div>
            </div>
            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center shrink-0">
               <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </Card>

        {/* PO Requests Card */}
        <Card className="p-5 rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5 group relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-60">Supply Chain</p>
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-foreground/70 uppercase tracking-tight">PO Requests</h3>
                <p className="text-3xl font-black font-display tracking-tighter text-amber-600">{(project as any).purchaseOrderCount || 0}</p>
              </div>
              <div className="pt-2 flex items-center gap-3">
                <div className="h-1 flex-1 bg-muted/30 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 w-[65%] rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                </div>
              </div>
            </div>
            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center shrink-0">
               <ShoppingCart className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </Card>

        {/* Open Requests Card */}
        <Card className="p-5 rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5 group relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-60">Active Queue</p>
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-foreground/70 uppercase tracking-tight">Project Requests</h3>
                <p className="text-3xl font-black font-display tracking-tighter text-emerald-600">{(project as any).requestCount || 0}</p>
              </div>
              <div className="pt-2 flex items-center gap-3">
                <div className="h-1 flex-1 bg-muted/30 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 w-[45%] rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                </div>
              </div>
            </div>
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center shrink-0">
               <ClipboardList className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </Card>

        {/* Time Left Card */}
        <Card className="p-5 rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5 group relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-60">Timeline</p>
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-foreground/70 uppercase tracking-tight">Days Remaining</h3>
                <p className="text-3xl font-black font-display tracking-tighter text-rose-600">
                  {Math.max(0, differenceInDays(startOfDay(new Date(project.endDate)), startOfDay(new Date())))}
                </p>
              </div>
              <div className="pt-2 flex items-center gap-3">
                <div className="h-1 flex-1 bg-muted/30 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 w-[80%] rounded-full shadow-[0_0_10px_rgba(225,29,72,0.5)]" />
                </div>
              </div>
            </div>
            <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center shrink-0">
               <Calendar className="w-6 h-6 text-rose-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Navigation Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-1 bg-primary rounded-full" />
          <h2 className="text-xl font-black tracking-tight text-foreground/80 uppercase">Project Sections</h2>
          {/* Payments shortcuts for this project, by role: request the invoices / raise an order, or ask for a transfer */}
          <div className="ms-auto flex flex-wrap gap-2">
            <PaymentActionButtons context={{ projectId: projectId || "", sourceType: "project", sourceId: projectId || undefined }} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card, i) => {
            const colorThemes = {
              "text-blue-600": { iconBg: "bg-blue-500/10 text-blue-600", glow: "bg-blue-500/10" },
              "text-amber-600": { iconBg: "bg-amber-500/10 text-amber-600", glow: "bg-amber-500/10" },
              "text-emerald-600": { iconBg: "bg-emerald-500/10 text-emerald-600", glow: "bg-emerald-500/10" },
              "text-orange-600": { iconBg: "bg-orange-500/10 text-orange-600", glow: "bg-orange-500/10" },
              "text-purple-600": { iconBg: "bg-purple-500/10 text-purple-600", glow: "bg-purple-500/10" },
              "text-rose-600": { iconBg: "bg-rose-500/10 text-rose-600", glow: "bg-rose-500/10" },
            };
            const theme = colorThemes[card.color as keyof typeof colorThemes] || colorThemes["text-blue-600"];

            return (
              <Card
                key={i}
                className={cn(
                  "group relative overflow-hidden cursor-pointer rounded-[1.5rem] border-none bg-white dark:bg-muted/5 shadow-xl",
                  !card.active && "opacity-80 grayscale-[0.5]"
                )}
                onClick={() => card.active && navigate(card.link)}
              >
                <div className={cn(
                  "absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-0",
                  theme.glow
                )} />
                
                <CardContent className="p-5 relative">
                  <div className="flex items-center justify-between mb-6">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center",
                      theme.iconBg
                    )}>
                      <card.icon className="w-6 h-6" />
                    </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black tracking-tighter text-foreground/80">{card.count}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-black tracking-tight text-foreground/90 uppercase text-sm">
                    {card.title}
                  </h3>
                  <p className="text-xs font-medium text-muted-foreground leading-relaxed line-clamp-2 opacity-70">
                    {card.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
        </div>
      </div>
    </div>
  );
}
