import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Building2, MapPin, Calendar, ArrowLeft, Paperclip, FileText, Image as ImageIcon, File, ClipboardList, Trash2, FileDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ActivityTable } from "@/components/activity-table";
import { ActivityFormDialog } from "@/components/activity-form-dialog";
import { RequestFormsExportDialog } from "@/components/request-forms-export-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { LoadingIcon } from "@/components/ui/loading-icon";

import { useAuth } from "@/lib/auth";
import type { Project, Document, InsertProject } from "@shared/schema";

const statusConfig = {
  active: { label: "Active", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  pending: { label: "Pending", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  completed: { label: "Completed", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  overdue: { label: "Overdue", className: "bg-destructive/10 text-destructive border-destructive/20" },
  "on-hold": { label: "On Hold", className: "bg-muted text-muted-foreground border-border" },
};

export default function ProjectRequests() {
  const { user } = useAuth();
  const { projectId } = useParams();
  const [, navigate] = useLocation();
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  // "deleted" is a view, not one of the tab bar's tabs, so <Tabs> cannot highlight it.
  // Persisting it meant returning to the page left you inside the recycle bin with no
  // visual sign — and with no way out at all for users who cannot see the bin button.
  const [activeTab, setActiveTab] = useState(() => {
    const stored = sessionStorage.getItem("project-requests-active-tab");
    if (stored === "deleted") {
      // Clear a value stored by the previous build, which would otherwise keep
      // restoring the recycle bin on every visit.
      sessionStorage.removeItem("project-requests-active-tab");
      return "wir";
    }
    return stored || "wir";
  });

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === "deleted") {
      sessionStorage.removeItem("project-requests-active-tab");
    } else {
      sessionStorage.setItem("project-requests-active-tab", tab);
    }
  };

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) throw new Error("Failed to fetch project");
      return response.json();
    },
  });

  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/documents", projectId],
    enabled: !!projectId && documentsOpen,
    queryFn: async () => {
      const response = await fetch(`/api/documents/project/${projectId}`);
      if (!response.ok) throw new Error("Failed to fetch documents");
      return await response.json();
    },
  });

  if (projectLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <LoadingIcon size={64} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    );
  }

  const statusInfo = statusConfig[project.status as keyof typeof statusConfig];
  const isSuperAdmin = user?.role === "super_admin";
  const isDC = user?.positions?.some(p => p.toLowerCase().includes("document controller")) || false;
  const canViewDeleted = isSuperAdmin || isDC;

  // The bin is only reachable through a button that this user may not have. Without this
  // guard, anyone who loses the permission while the view is open stays stuck in it.
  useEffect(() => {
    if (activeTab === "deleted" && !canViewDeleted) {
      handleTabChange("wir");
    }
  }, [activeTab, canViewDeleted]);

  return (
    <div className="px-6 lg:px-8 pt-1 lg:pt-2 pb-6 space-y-2 w-full animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center gap-4 relative min-h-[3rem] pb-2">
        <div className="flex items-center gap-3 md:gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/projects/${projectId}`)}
            data-testid="button-back"
            className="h-9 w-9 md:h-10 md:w-10 shrink-0 rounded-[1.5rem]"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <h1 className="text-lg md:text-2xl font-display font-bold tracking-tight truncate max-w-[150px] sm:max-w-[200px] md:max-w-md">{project?.name}</h1>
            {statusInfo && (
              <Badge variant="outline" className={cn("px-2 md:px-3 py-0 md:py-0.5 text-[10px] md:text-xs font-bold shrink-0 border-none shadow-sm rounded-[1.5rem]", statusInfo.className)}>
                {statusInfo.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Absolute Centered Title Badge - Hidden on small tablets and below */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none hidden xl:flex">
          <Badge variant="secondary" className="px-6 py-2 flex items-center gap-2.5 border-none bg-blue-500/10 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 rounded-full shadow-sm">
            <ClipboardList className="w-5 h-5" />
            <span className="text-base font-bold tracking-tight uppercase">Project Requests</span>
          </Badge>
        </div>

        <div className="flex items-center gap-2 md:gap-3 ml-auto">
          <Popover onOpenChange={setDocumentsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 md:h-10 md:w-10 shadow-sm shrink-0 rounded-[1.5rem]"
                data-testid="button-view-project-files"
              >
                <Paperclip className="w-5 h-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <div className="p-4 border-b">
                <h3 className="font-semibold text-sm">Project Documents</h3>
              </div>
              <div className="max-h-[300px] overflow-y-auto p-2">
                {documents.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No documents
                  </div>
                ) : (
                  <div className="space-y-1">
                    {documents.map((doc: any) => {
                      const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(doc.type?.toLowerCase());
                      const isPdf = doc.type?.toLowerCase() === "pdf";
                      return (
                        <div key={doc.id} className="flex items-center gap-3 p-2 hover:bg-muted rounded-md cursor-pointer transition-colors">
                          <div className="shrink-0">
                            {isImage ? (
                              <ImageIcon className="w-4 h-4 text-blue-500" />
                            ) : isPdf ? (
                              <FileText className="w-4 h-4 text-red-500" />
                            ) : (
                              <File className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate" title={doc.name}>{doc.name}</p>
                            <p className="text-[10px] text-muted-foreground uppercase">{doc.type}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="p-2 border-t bg-muted/50">
                <p className="text-[10px] text-center text-muted-foreground px-2">
                  {documents.length} document{documents.length !== 1 ? 's' : ''} attached to this project
                </p>
              </div>
            </PopoverContent>
          </Popover>
          <div className="flex items-center gap-1.5 md:gap-2">
            {canViewDeleted && (
              <Button
                variant={activeTab === "deleted" ? "default" : "outline"}
                size="icon"
                className={cn(
                  "h-9 w-9 md:h-10 md:w-10 shadow-sm shrink-0 transition-all duration-200 rounded-[1.5rem]",
                  activeTab === "deleted" && "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-destructive"
                )}
                onClick={() => handleTabChange(activeTab === "deleted" ? "request" : "deleted")}
                title={activeTab === "deleted" ? "Show Active Requests" : "Show Deleted Requests"}
              >
                <Trash2 className="w-5 h-5" />
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setExportOpen(true)}
              title="تصدير نماذج الطلبات كملفات PDF"
              className="h-9 w-9 md:h-10 md:w-10 shadow-sm shrink-0 rounded-[1.5rem]"
            >
              <FileDown className="w-5 h-5" />
            </Button>
            <Button
              onClick={() => setActivityDialogOpen(true)}
              data-testid="button-add-activity"
              className="shadow-sm font-semibold h-9 px-4 md:h-10 md:px-6 text-sm rounded-[1.5rem]"
            >
              <span className="hidden sm:inline">+ Add Request</span>
              <span className="sm:hidden">+ Add</span>
            </Button>
          </div>
        </div>
      </div>

      {/* The tab bar has no "deleted" tab to highlight, so the bin needs its own banner —
          otherwise deleted requests look like an ordinary list. */}
      {activeTab === "deleted" && (
        <div className="flex items-center gap-2 rounded-[1.5rem] border border-destructive/40 bg-destructive/5 px-4 py-3">
          <Trash2 className="w-4 h-4 text-destructive shrink-0" />
          <span className="text-sm font-bold text-destructive">
            سلة المحذوفات — اضغط زر سلة المهملات أعلى الصفحة للعودة للطلبات
          </span>
        </div>
      )}

      <ActivityTable
        projectId={projectId}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />
      {projectId && (
        <ActivityFormDialog
          projectId={projectId}
          open={activityDialogOpen}
          onOpenChange={setActivityDialogOpen}
        />
      )}
      {projectId && (
        <RequestFormsExportDialog
          projectId={projectId}
          open={exportOpen}
          onOpenChange={setExportOpen}
        />
      )}
    </div>
  );
}
