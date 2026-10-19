import { useQuery } from "@tanstack/react-query";
import { FileText, TrendingUp, Activity as ActivityIcon, AlertCircle, Package, FolderOpen, ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WaitingActionCard } from "@/components/waiting-action-card";
import { PendingsCard } from "@/components/pendings-card";
import { CompletedCard } from "@/components/completed-card";
import { TotalRequestsCard } from "@/components/total-requests-card";
import type { Project, Task, Request, WorkflowStep, Activity } from "@shared/schema";
import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LabelList, Cell } from "recharts";
import { cn } from "@/lib/utils";

export default function Home() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  useEffect(() => {
    if (projects.length === 1 && selectedProjectId === "all") {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: documents = [] } = useQuery<any[]>({
    queryKey: ["/api/documents"],
  });

  const { data: requests = [] } = useQuery<Request[]>({
    queryKey: ["/api/requests"],
  });

  const { data: workflowSteps = [] } = useQuery<WorkflowStep[]>({
    queryKey: ["/api/workflow-steps"],
  });

  const { data: allActivities = [] } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
  });

  const { data: requestTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/request-types"],
  });

  const selectedProject = selectedProjectId === "all" ? null : projects.find(p => p.id === selectedProjectId);
  const projectTasks = selectedProject ? tasks.filter(t => t.projectId === selectedProjectId) : [];
  const projectDocuments = selectedProject ? documents.filter((d: any) => d.projectId === selectedProjectId) : [];

  const projectRequests = useMemo(() => {
    const filtered = selectedProject
      ? requests.filter(r => r.projectId === selectedProjectId)
      : requests;

    const pending = filtered.filter(r => r.currentStatus !== "Closed");
    const completed = filtered.filter(r => r.currentStatus === "Closed");

    if (pending.length > 0) {
      return pending.slice(0, 5);
    }
    return completed.slice(0, 5);
  }, [requests, selectedProject, selectedProjectId]);

  const chartsData = useMemo(() => {
    const filteredRequests = selectedProjectId === "all"
      ? requests
      : requests.filter(r => r.projectId === selectedProjectId);

    // Group by request type ID
    const requestTypeMap: Record<string, number> = {};
    filteredRequests.forEach(r => {
      const rType = requestTypes.find(t => t.id === r.requestTypeId);
      // Fallback to name_english, code, or "Unknown"
      const typeName = rType ? (rType.code || "Unknown") : "Unknown";
      requestTypeMap[typeName] = (requestTypeMap[typeName] || 0) + 1;
    });

    let totalForms = Object.keys(requestTypeMap).map(key => ({
      name: key,
      value: requestTypeMap[key],
      fill: "#86efac"
    }));

    if (totalForms.length === 0) {
      totalForms = [{ name: "None", value: 0, fill: "#86efac" }];
    }

    const pendingRequests = filteredRequests.filter((r) => r.currentStatus !== "Closed");
    const pendingStepsMap: Record<string, number> = {};

    pendingRequests.forEach(r => {
      const step = workflowSteps.find(s => s.id === (r as any).currentRevision?.currentStepId);
      const stepName = step ? step.stepName : r.currentStatus || "Pending";
      const shortName = stepName?.substring(0, 15) + (stepName?.length > 15 ? '...' : '');
      pendingStepsMap[shortName] = (pendingStepsMap[shortName] || 0) + 1;
    });

    let pendingSteps = Object.keys(pendingStepsMap).map(key => ({
      name: key,
      value: pendingStepsMap[key],
      fill: "#38bdf8"
    }));

    if (pendingSteps.length === 0) {
      pendingSteps = [{ name: "None", value: 0, fill: "#38bdf8" }];
    }

    const resubmittedRejectedDeleted = [
      { name: "Resubmitted", value: filteredRequests.filter((r: any) => r.currentStatus === "Resubmitted" || r.currentRevision?.revisionNo > 0).length, fill: "#f97316" },
      { name: "Rejected", value: filteredRequests.filter((r) => r.currentStatus === "Rejected").length, fill: "#ef4444" },
      { name: "Deleted", value: filteredRequests.filter((r) => r.currentStatus === "Deleted").length, fill: "#6b7280" },
    ];

    return { totalForms, pendingSteps, resubmittedRejectedDeleted };
  }, [requests, workflowSteps, requestTypes, selectedProjectId]);

  return (
    <div className="min-h-screen bg-transparent px-6 lg:px-10 py-8 space-y-10 animate-in fade-in duration-700 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px]" />
      </div>
      
      {/* Top Header & Project Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tighter text-foreground/90 uppercase">Project Pulse</h1>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60">System-wide Logistics & Engineering Overview</p>
        </div>

        {projects.length > 1 && (
          <div className="flex items-center gap-3 bg-white dark:bg-muted/10 p-1.5 rounded-2xl shadow-sm border border-white dark:border-muted/20">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-3">Project Scope:</span>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-[220px] bg-primary text-primary-foreground border-none rounded-xl h-10 font-bold shadow-lg shadow-primary/20" data-testid="select-project-filter">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-none shadow-2xl">
                <SelectItem value="all" className="font-bold">All Active Projects</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id} className="font-medium">
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Stats Overview */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <WaitingActionCard projectId={selectedProjectId} />
        <PendingsCard projectId={selectedProjectId} />
        <CompletedCard projectId={selectedProjectId} />
        <TotalRequestsCard projectId={selectedProjectId} />
      </div>

      {/* Main Content Area */}
      {selectedProject ? (
        <div className="space-y-10">
          
          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Total Requests Chart */}
            <Card className="rounded-[1.5rem] border-none shadow-2xl bg-white dark:bg-muted/5 overflow-hidden group hover:scale-[1.01] transition-all duration-500">
              <div className="p-8 h-full flex flex-col">
                <div className="flex items-center justify-between mb-8">
                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-foreground/80 uppercase tracking-tight">Request Categories</h3>
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Distribution by Type</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                     <TrendingUp className="w-5 h-5 text-emerald-600" />
                  </div>
                </div>
                <div className="h-64 mt-auto">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartsData.totalForms} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#94a3b8' }} height={40} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                      <Bar dataKey="value" barSize={32} radius={[12, 12, 4, 4]}>
                        {chartsData.totalForms.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} className="hover:opacity-80 transition-opacity" />
                        ))}
                        <LabelList dataKey="value" position="top" fill="#64748b" fontSize={11} fontWeight={900} offset={12} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>

            {/* Pending Steps Chart */}
            <Card className="rounded-[1.5rem] border-none shadow-2xl bg-white dark:bg-muted/5 overflow-hidden group hover:scale-[1.01] transition-all duration-500">
              <div className="p-8 h-full flex flex-col">
                <div className="flex items-center justify-between mb-8">
                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-foreground/80 uppercase tracking-tight">Workflow Bottlenecks</h3>
                    <p className="text-[10px] font-bold text-sky-500 uppercase tracking-widest">Active Stages</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                     <ActivityIcon className="w-5 h-5 text-sky-600" />
                  </div>
                </div>
                <div className="h-64 mt-auto">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartsData.pendingSteps} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 800, fill: '#94a3b8' }} height={40} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                      <Bar dataKey="value" barSize={32} radius={[12, 12, 4, 4]}>
                        {chartsData.pendingSteps.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} className="hover:opacity-80 transition-opacity" />
                        ))}
                        <LabelList dataKey="value" position="top" fill="#64748b" fontSize={11} fontWeight={900} offset={12} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>

            {/* Quality Alerts Chart */}
            <Card className="rounded-[1.5rem] border-none shadow-2xl bg-white dark:bg-muted/5 overflow-hidden group hover:scale-[1.01] transition-all duration-500">
              <div className="p-8 h-full flex flex-col">
                <div className="flex items-center justify-between mb-8">
                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-foreground/80 uppercase tracking-tight">Quality Exceptions</h3>
                    <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Rejections & Deletions</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                     <AlertCircle className="w-5 h-5 text-red-600" />
                  </div>
                </div>
                <div className="h-64 mt-auto">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartsData.resubmittedRejectedDeleted} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#94a3b8' }} height={40} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                      <Bar dataKey="value" barSize={40} radius={[12, 12, 4, 4]}>
                        {chartsData.resubmittedRejectedDeleted.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} className="hover:opacity-80 transition-opacity" />
                        ))}
                        <LabelList dataKey="value" position="top" fill="#64748b" fontSize={11} fontWeight={900} offset={12} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          </div>

          {/* Lower Grid: Requests & Files */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Pending Requests Column */}
            <div className="lg:col-span-8 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="w-8 h-1 bg-primary rounded-full" />
                   <h2 className="text-xl font-black tracking-tight text-foreground/80 uppercase">Pending Review</h2>
                </div>
                <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 text-primary">View All Records</Button>
              </div>

              <Card className="rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5 overflow-hidden">
                <CardContent className="p-0">
                  {projectRequests.length === 0 ? (
                    <div className="py-20 text-center flex flex-col items-center gap-3 opacity-30">
                       <ClipboardList className="w-16 h-16" />
                       <p className="text-sm font-black uppercase tracking-widest">No Active Requests</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-muted/10">
                      {projectRequests.map((req: any) => {
                        const currentStep = workflowSteps.find(s => s.id === req.currentRevision?.currentStepId);
                        const activity = allActivities.find(a => a.requestId === req.id);
                        return (
                          <div 
                            key={req.id} 
                            className="group flex items-center gap-6 p-5 hover:bg-primary/5 transition-all cursor-pointer"
                          >
                            <div className="w-12 h-12 rounded-2xl bg-muted/30 flex items-center justify-center group-hover:bg-primary/10 transition-colors shrink-0">
                               <FileText className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm font-black text-foreground tracking-tight">{req.requestNumber}</span>
                                <span className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">{req.referenceCode}</span>
                              </div>
                              <p className="text-xs text-muted-foreground font-medium truncate opacity-70 italic">
                                {activity?.description || "Awaiting further engineering feedback..."}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1.5">
                               <Badge 
                                 variant={req.currentStatus === "Closed" ? "default" : "outline"} 
                                 className={cn(
                                   "text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-lg border-none shadow-sm",
                                   req.currentStatus === "Closed" ? "bg-emerald-500 text-white" : "bg-primary/10 text-primary"
                                 )}
                               >
                                 {currentStep?.stepName || req.currentStatus}
                               </Badge>
                               <span className="text-[8px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                                 {format(new Date(req.createdAt || Date.now()), "MMM dd")}
                               </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Files & Approvals */}
            <div className="lg:col-span-4 space-y-8">
              
              {/* Modernized Files List */}
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                   <div className="w-8 h-1 bg-sky-500 rounded-full" />
                   <h2 className="text-xl font-black tracking-tight text-foreground/80 uppercase">Project Assets</h2>
                </div>
                
                <Card className="rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5 overflow-hidden">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {projectDocuments.slice(0, 5).length === 0 ? (
                        <div className="py-10 text-center opacity-20 flex flex-col items-center gap-2">
                           <FolderOpen className="w-10 h-10" />
                           <p className="text-[10px] font-black uppercase tracking-widest">Vault Empty</p>
                        </div>
                      ) : (
                        projectDocuments.slice(0, 5).map((doc: any) => (
                          <div key={doc.id} className="group flex items-center gap-4 p-2 rounded-2xl hover:bg-muted/30 transition-all cursor-pointer">
                            <div className="w-11 h-11 bg-white dark:bg-background rounded-xl shadow-sm border border-muted/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                              <div className="relative">
                                <FileText className="w-6 h-6 text-sky-600" />
                                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-background" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-black text-foreground/90 truncate tracking-tight">{doc.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase">{doc.size || "1.2 MB"}</span>
                                <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                                <span className="text-[9px] font-bold text-muted-foreground uppercase">{format(new Date(), "MMM d")}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Modernized Approvals */}
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                   <div className="w-8 h-1 bg-amber-500 rounded-full" />
                   <h2 className="text-xl font-black tracking-tight text-foreground/80 uppercase">Gatekeeper</h2>
                </div>
                
                <Card className="rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5 overflow-hidden">
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      {projectTasks.slice(0, 5).length === 0 ? (
                        <div className="py-10 text-center opacity-20">
                           <p className="text-[10px] font-black uppercase tracking-widest">No Tasks Pending</p>
                        </div>
                      ) : (
                        projectTasks.slice(0, 5).map((task) => (
                          <div key={task.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-amber-500/5 transition-colors border border-transparent hover:border-amber-500/10">
                            <div className="flex items-center gap-3">
                               <div className="w-2 h-2 rounded-full bg-amber-500" />
                               <span className="text-xs font-black text-foreground/80 truncate max-w-[150px]">{task.title}</span>
                            </div>
                            <Badge variant="outline" className="text-[8px] font-black bg-amber-500/10 text-amber-600 border-none px-2 rounded-md">Queue</Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

            </div>
          </div>
        </div>
      ) : (
        /* Project-less View or No Selection */
        <div className="flex flex-col items-center justify-center py-40 space-y-6">
           <div className="w-24 h-24 bg-primary/5 rounded-[1.5rem] flex items-center justify-center">
              <Package className="w-12 h-12 text-primary opacity-30" />
           </div>
           <div className="text-center">
              <h2 className="text-2xl font-black tracking-tighter text-foreground/80 uppercase">Portfolio Pulse</h2>
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mt-2 max-w-md mx-auto">Select a project to unlock real-time engineering insights and logistics monitoring</p>
           </div>
        </div>
      )}
    </div>
  );
}
