import React, { useEffect, useRef } from "react";
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
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, RequireAuth, useAuth } from "@/lib/auth";
import type { TeamMember, Organization, UserTeamMember } from "@shared/schema";
import Home from "@/pages/home";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import ProjectStorage from "@/pages/ProjectStorage";
import ProjectRequests from "@/pages/project-requests";
import Tasks from "@/pages/tasks";
import Organizations from "@/pages/organizations";
import Team from "@/pages/team";
import Budget from "@/pages/budget";
import Documents from "@/pages/documents";
import AuditLog from "@/pages/audit-log";
import Settings from "@/pages/settings";
import About from "@/pages/about";
import Admin from "@/pages/admin";
import ListLibrary from "@/pages/list-library";
import WorkList from "@/pages/work-list";
import Checklist from "@/pages/checklist";
import ActivityChecklistLink from "@/pages/activity-checklist-link";
import CreateWirRequest from "@/pages/create-wir-request";
import RequestDetail from "@/pages/request-detail";
import Notifications from "@/pages/notifications";
import ProjectDeliveries from "@/pages/ProjectDeliveries";
import ProjectPurchaseOrders from "@/pages/ProjectPurchaseOrders";
import ProjectCreateRfq from "@/pages/ProjectCreateRfq";
import ProjectCreatePo from "@/pages/ProjectCreatePo";
import ProjectPurchaseOrderDetail from "@/pages/ProjectPurchaseOrderDetail";
import ProjectWarehouse from "@/pages/ProjectWarehouse";
import ProjectRfqDetail from "@/pages/ProjectRfqDetail";
import ProjectMaterialGallery from "@/pages/ProjectMaterialGallery";
import ProjectSnagList from "@/pages/ProjectSnagList";
import ProjectProgressMatrix from "@/pages/ProjectProgressMatrix";
import Login from "@/pages/login";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import AcceptInvitation from "@/pages/accept-invitation";
import Invitations from "@/pages/invitations";
import NotFound from "@/pages/not-found";

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
      <Route path="/projects/:projectId/storage" component={ProjectStorage} />
      <Route path="/projects/:projectId/requests" component={ProjectRequests} />
      <Route path="/projects/:projectId" component={ProjectDetail} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/organizations" component={Organizations} />
      <Route path="/invitations" component={Invitations} />
      <Route path="/team" component={Team} />
      <Route path="/budget" component={Budget} />
      <Route path="/documents" component={Documents} />
      <Route path="/audit-log" component={AuditLog} />
      <Route path="/settings" component={Settings} />
      <Route path="/settings/about" component={About} />
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
    "--sidebar-width-icon": "3rem",
  };

  return (
    <RequireAuth>
      <BackgroundDataPreloader />
      <SidebarProvider style={style as React.CSSProperties} defaultOpen={true}>
        <div className="flex h-screen w-full bg-[#F8FAFC] dark:bg-background">
          <AppSidebar />
          <div className="flex flex-col flex-1 overflow-hidden">
            <AppHeader />
            <main ref={mainRef} className="flex-1 overflow-auto">
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
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
            <Router />
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </PersistQueryClientProvider>
  );
}

export default App;

