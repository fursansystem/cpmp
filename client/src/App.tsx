import React, { Suspense, lazy, useEffect, useRef } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { useQuery, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { LoginSummary } from "@/components/login-summary";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/lib/language-provider";
import { AuthProvider, RequireAuth, useAuth } from "@/lib/auth";
import type { TeamMember, Organization, UserTeamMember } from "@shared/schema";
const Home = lazy(() => import("@/pages/home"));
const Projects = lazy(() => import("@/pages/projects"));
const ProjectDetail = lazy(() => import("@/pages/project-detail"));
const ProjectStorage = lazy(() => import("@/pages/ProjectStorage"));
const ProjectRequests = lazy(() => import("@/pages/project-requests"));
const Tasks = lazy(() => import("@/pages/tasks"));
const Organizations = lazy(() => import("@/pages/organizations"));
const Team = lazy(() => import("@/pages/team"));
const Budget = lazy(() => import("@/pages/budget"));
const Documents = lazy(() => import("@/pages/documents"));
const AuditLog = lazy(() => import("@/pages/audit-log"));
const Settings = lazy(() => import("@/pages/settings"));
const About = lazy(() => import("@/pages/about"));
const Webhooks = lazy(() => import("@/pages/webhooks"));
const Admin = lazy(() => import("@/pages/admin"));
const ListLibrary = lazy(() => import("@/pages/list-library"));
const WorkList = lazy(() => import("@/pages/work-list"));
const Checklist = lazy(() => import("@/pages/checklist"));
const ActivityChecklistLink = lazy(() => import("@/pages/activity-checklist-link"));
const CreateWirRequest = lazy(() => import("@/pages/create-wir-request"));
const RequestDetail = lazy(() => import("@/pages/request-detail"));
const Notifications = lazy(() => import("@/pages/notifications"));
const ProjectDeliveries = lazy(() => import("@/pages/ProjectDeliveries"));
const ProjectPurchaseOrders = lazy(() => import("@/pages/ProjectPurchaseOrders"));
const ProjectCreateRfq = lazy(() => import("@/pages/ProjectCreateRfq"));
const ProjectCreatePo = lazy(() => import("@/pages/ProjectCreatePo"));
const ProjectPurchaseOrderDetail = lazy(() => import("@/pages/ProjectPurchaseOrderDetail"));
const ProjectWarehouse = lazy(() => import("@/pages/ProjectWarehouse"));
const ProjectRfqDetail = lazy(() => import("@/pages/ProjectRfqDetail"));
const ProjectMaterialGallery = lazy(() => import("@/pages/ProjectMaterialGallery"));
const ProjectSnagList = lazy(() => import("@/pages/ProjectSnagList"));
const ProjectProgressMatrix = lazy(() => import("@/pages/ProjectProgressMatrix"));
const ProjectSubcontractors = lazy(() => import("@/pages/ProjectSubcontractors"));
const SubcontractorCertificateDetail = lazy(() => import("@/pages/SubcontractorCertificateDetail"));
const Payments = lazy(() => import("@/pages/Payments"));
const Permits = lazy(() => import("@/pages/Permits"));
const Services = lazy(() => import("@/pages/Services"));
const PermitDetail = lazy(() => import("@/pages/PermitDetail"));
const UnitHandover = lazy(() => import("@/pages/UnitHandover"));
const UnitHandoverDetail = lazy(() => import("@/pages/UnitHandoverDetail"));
const Reports = lazy(() => import("@/pages/Reports"));
const Login = lazy(() => import("@/pages/login"));
const ForgotPassword = lazy(() => import("@/pages/forgot-password"));
const ResetPassword = lazy(() => import("@/pages/reset-password"));
const AcceptInvitation = lazy(() => import("@/pages/accept-invitation"));
const Invitations = lazy(() => import("@/pages/invitations"));
const NotFound = lazy(() => import("@/pages/not-found"));

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] p-8">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

const persister = createSyncStoragePersister({
  storage: window.localStorage,
});

// Background data preloader - loads team members and organizations data immediately after login
function BackgroundDataPreloader() {
  const { user } = useAuth();
  
  // Check if user is an admin who needs team member links
  const isAdmin = user?.role === "super_admin" || user?.role === "org_admin" || user?.role === "developer_admin";
  
  // Preload team members data in background
  useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  // Preload organizations data in background
  useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  // Preload user-team-members associations for admins
  useQuery<UserTeamMember[]>({
    queryKey: ["/api/user-team-members"],
    enabled: !!user && isAdmin,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  return null;
}

function ProtectedRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Home} />
      <Route path="/projects" component={Projects} />
      <Route path="/projects/:projectId/warehouse" component={ProjectWarehouse} />
      <Route path="/projects/:projectId/deliveries">{() => <ProjectDeliveries />}</Route>
      <Route path="/projects/:projectId/purchase-orders/new" component={ProjectCreatePo} />
      <Route path="/projects/:projectId/purchase-orders/:poId" component={ProjectPurchaseOrderDetail} />
      <Route path="/projects/:projectId/purchase-orders" component={ProjectPurchaseOrders} />
      <Route path="/projects/:projectId/rfqs/new" component={ProjectCreateRfq} />
      <Route path="/projects/:projectId/rfqs/:rfqId" component={ProjectRfqDetail} />
      <Route path="/projects/:projectId/material-gallery" component={ProjectMaterialGallery} />
      <Route path="/projects/:projectId/snag-list" component={ProjectSnagList} />
      <Route path="/projects/:projectId/progress-matrix" component={ProjectProgressMatrix} />
      <Route path="/projects/:projectId/subcontractors" component={ProjectSubcontractors} />
      <Route path="/projects/:projectId/storage" component={ProjectStorage} />
      <Route path="/projects/:projectId/requests" component={ProjectRequests} />
      <Route path="/projects/:projectId" component={ProjectDetail} />
      <Route path="/payments/certificates/:id" component={SubcontractorCertificateDetail} />
      <Route path="/payments" component={Payments} />
      <Route path="/permits/:id" component={PermitDetail} />
      <Route path="/permits" component={Permits} />
      <Route path="/handover/:id" component={UnitHandoverDetail} />
      <Route path="/handover" component={UnitHandover} />
      <Route path="/services" component={Services} />
      <Route path="/reports" component={Reports} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/organizations" component={Organizations} />
      <Route path="/invitations" component={Invitations} />
      <Route path="/team" component={Team} />
      <Route path="/budget" component={Budget} />
      <Route path="/documents" component={Documents} />
      <Route path="/audit-log" component={AuditLog} />
      <Route path="/settings" component={Settings} />
      <Route path="/settings/about" component={About} />
      <Route path="/settings/webhooks" component={Webhooks} />
      <Route path="/admin" component={Admin} />
      <Route path="/list-library" component={ListLibrary} />
      <Route path="/work-list" component={WorkList} />
      <Route path="/checklist" component={Checklist} />
      <Route path="/activity-checklist-link" component={ActivityChecklistLink} />
      <Route path="/create-wir/:activityId" component={CreateWirRequest} />
      <Route path="/requests/:requestId" component={RequestDetail} />
      <Route path="/notifications" component={Notifications} />
      <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AppLayout() {
  const [location] = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo(0, 0);
    }
  }, [location]);

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4.5rem",
  };

  return (
    <RequireAuth>
      <BackgroundDataPreloader />
      <LoginSummary />
      <SidebarProvider style={style as React.CSSProperties} defaultOpen={false}>
        <div className="flex h-full w-full overflow-hidden bg-[#F8FAFC] dark:bg-background">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <AppHeader />
            <main ref={mainRef} className="flex-1 w-full overflow-auto">
              <ProtectedRoutes />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </RequireAuth>
  );
}

function Router() {
  const [location] = useLocation();
  
  if (location === "/login") {
    return <Login />;
  }
  
  if (location === "/forgot-password") {
    return <ForgotPassword />;
  }
  
  if (location.startsWith("/reset-password")) {
    return <ResetPassword />;
  }

  // Public: an invited organization registers itself from the emailed link
  if (location.startsWith("/accept-invitation")) {
    return <AcceptInvitation />;
  }
  
  return <AppLayout />;
}

function App() {
  return (
    <PersistQueryClientProvider 
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours caching
        dehydrateOptions: {
          // large queries (e.g. the progress matrix) opt out of localStorage with meta.persist = false
          shouldDehydrateQuery: (query) => query.meta?.persist !== false && defaultShouldDehydrateQuery(query),
        },
      }}
    >
      <LanguageProvider>
        <TooltipProvider>
          <ThemeProvider>
            <AuthProvider>
              <Suspense fallback={<PageFallback />}>
                <Router />
              </Suspense>
              <Toaster />
            </AuthProvider>
          </ThemeProvider>
        </TooltipProvider>
      </LanguageProvider>
    </PersistQueryClientProvider>
  );
}

export default App;

