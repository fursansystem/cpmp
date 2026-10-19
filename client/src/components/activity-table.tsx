import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  MoreHorizontal,
  Filter,
  Eye,
  Edit,
  Trash2,
  List,
  Grid,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Clock,
  ExternalLink,
  ChevronDown,
  Download
} from "lucide-react";
import ExcelJS from "exceljs";

const extractNcrSubject = (metadata: any) => {
  if (!metadata) return "";
  return metadata.ncrSubject || metadata.subject || "";
};

// @ts-ignore
import { saveAs } from "file-saver";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format, formatDistanceToNow } from "date-fns";
import { useLocation, Link } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { parseDbTimestamp } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import type { Activity, Request as BaseRequest, WorkListActivity, Purpose } from "@shared/schema";
import * as XLSX from "xlsx";
import { LoadingIcon } from "@/components/ui/loading-icon";


type Request = BaseRequest & {
  chapterName?: string | null;
  divisionName?: string | null;
  userName?: string | null;
  divisionId?: string | null;
  chapterId?: string | null;
  purposeIds?: string[];
  currentRevision?: {
    description?: string | null;
    buildingNo?: string | null;
    floor?: string | null;
    part?: string | null;
    units?: string | null;
    scheduledDate?: string | null;
    approvedAt?: string | null;
    currentStepId?: number | null;
    approvalStatusCode?: string | null;
    activityName?: string | null;
    chapterName?: string | null;
    divisionName?: string | null;
  } | null;
  purposeNames?: string[];
};

type RequestType = {
  id: string;
  name_english: string;
  name_arabic: string;
  code: string;
};

const approvalStatusConfig = {
  A: { label: "Approved", icon: CheckCircle2, bgColor: "bg-green-500", textColor: "text-green-600 dark:text-green-400" },
  B: { label: "Approved As Noted", icon: AlertCircle, bgColor: "bg-blue-500", textColor: "text-blue-600 dark:text-blue-400" },
  C: { label: "Revise and Resubmit", icon: RotateCcw, bgColor: "bg-yellow-500", textColor: "text-yellow-600 dark:text-yellow-400" },
  D: { label: "Rejected", icon: X, bgColor: "bg-red-500", textColor: "text-red-600 dark:text-red-400" },
  E: { label: "Close automatically", icon: Clock, bgColor: "bg-gray-500", textColor: "text-gray-600 dark:text-gray-400" },
} as const;

function formatLocationList(value: string | null | undefined, maxItems: number = 5): string {
  if (!value) return "";
  const items = value.split(",").map(s => s.trim()).filter(Boolean);
  if (items.length <= maxItems) {
    return items.join(",");
  }
  return items.slice(0, maxItems).join(",") + "...etc";
}

function formatWorkLocationContent(request: Request): React.ReactNode {
  const parts: string[] = [];
  const rev = request?.currentRevision;
  const hasLocation = rev?.buildingNo || rev?.floor || rev?.part;

  if (rev?.buildingNo) {
    parts.push(`BG: ${formatLocationList(rev.buildingNo)}`);
  }
  if (rev?.floor) {
    parts.push(`FL: ${formatLocationList(rev.floor)}`);
  }
  if (rev?.part) {
    parts.push(`PT: ${formatLocationList(rev.part)}`);
  }

  let locationContent = parts.join(" , ");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasLocation && (
        <Badge
          variant="outline"
          className="bg-amber-100/50 text-amber-900 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800 font-medium px-1.5 py-0 h-5"
        >
          {locationContent}
        </Badge>
      )}
      {rev?.description && (
        <span className="text-muted-foreground">
          {hasLocation ? ` ${rev.description}` : rev.description}
        </span>
      )}
    </div>
  );
}

interface ActivityTableProps {
  projectId?: string;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  "Draft": { label: "Draft", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  "Submitted": { label: "Submitted", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300" },
  "Under Review": { label: "Under Review", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300" },
  "Approved": { label: "Pending Closure", color: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" },
  "Pending Revision": { label: "Pending Revision", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300" },
  "Rejected": { label: "Rejected", color: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300" },
  "Closed": { label: "Closed", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300" },
  "In Process": { label: "In Process", color: "bg-orange-100 text-orange-850 dark:bg-orange-900/50 dark:text-orange-300" },
  "Resolved": { label: "Resolved", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300" },
};

export const resolveDisplayStatus = (request: any) => {
  const code = request.currentRevision?.approvalStatusCode;
  const currentStatus = request.currentStatus || "";
  const isNcrFamily = request.requestNumber?.includes("NCR");
  const isSI = request.requestNumber?.includes("SI");
  
  if (isNcrFamily) {
    if (currentStatus === "Approved") {
      return { 
        label: "Approved", 
        color: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" 
      };
    }
    if (currentStatus === "Resolved") {
      return { 
        label: "Resolved", 
        color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300" 
      };
    }
  } else if (isSI) {
    if (currentStatus === "Approved") {
      return { 
        label: "Issued", 
        color: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" 
      };
    }
  } else {
    if (code === "C" && currentStatus !== "Closed") {
      return statusConfig["Pending Revision"];
    }
    if (code === "D" && currentStatus !== "Closed") {
      return statusConfig["Rejected"];
    }
    if ((code === "A" || code === "B") && currentStatus !== "Closed") {
      return statusConfig["Approved"]; // Maps to "Pending Closure" label
    }
  }
  
  if (statusConfig[currentStatus]) {
    return statusConfig[currentStatus];
  }
  
  return { 
    label: currentStatus || "Draft", 
    color: currentStatus ? "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" 
  };
};

const tabTypes = [
  { id: "wir", label: "WIR" },
  { id: "dsr", label: "DSR" },
  { id: "sd", label: "SD" },
  { id: "asd", label: "ASD" },
  { id: "request", label: "Request" },
  { id: "approvals", label: "Approvals" },
  { id: "all", label: "All" },
];

type WorkflowStep = {
  id: number;
  stepName: string;
  sequenceOrder: number;
  requestTypeId: number;
  roleRequired: number;
};

type Division = {
  id: string;
  code: string;
  name: string;
  nameEnglish?: string;
};

type Chapter = {
  id: string;
  code: string;
  name: string;
  nameEnglish?: string;
  divisionId: string;
};

type TeamMember = {
  id: string;
  name: string;
};

type User = {
  id: string;
  username: string;
  email: string;
  displayName?: string;
};

type Filters = {
  status: string[];
  division: string;
  chapter: string;
  writer: string[];
  building: string[];
  floor: string[];
  part: string[];
  activity: string;
  purpose: string[];
  step: string[];
  approvalStatus: string[];
};

const defaultFilters: Filters = {
  status: [],
  division: "",
  chapter: "",
  writer: [],
  building: [],
  floor: [],
  part: [],
  activity: "",
  purpose: [],
  step: [],
  approvalStatus: [],
};



type ExportField = {
  id: string;
  label: string;
};

type ExportGroup = {
  id: string;
  label: string;
  fields: ExportField[];
};

const exportGroups: ExportGroup[] = [
  {
    id: "main",
    label: "Main Info",
    fields: [
      { id: "index", label: "#" },
      { id: "requestNo", label: "Request No" },
      { id: "type", label: "Type" },
    ]
  },
  {
    id: "details",
    label: "Request Details",
    fields: [
      { id: "division", label: "Division" },
      { id: "chapter", label: "Chapter" },
      { id: "activity", label: "Activity" },
      { id: "buildingNo", label: "Building No." },
      { id: "units", label: "Units" },
      { id: "workLevels", label: "Work Levels" },
    ]
  },
  {
    id: "status",
    label: "Status & Result",
    fields: [
      { id: "resultCode", label: "Code" },
      { id: "step", label: "Step" },
    ]
  },
  {
    id: "dates",
    label: "Dates",
    fields: [
      { id: "transactionDate", label: "Transaction Date" },
      { id: "submitterDate", label: "Submitter Date" },
      { id: "actualDate", label: "Actual Date" },
    ]
  },
  {
    id: "meta",
    label: "Meta Data",
    fields: [
      { id: "personDetails", label: "Person Details" },
      { id: "purpose", label: "Purpose" },
    ]
  }
];

const allExportFieldIds = exportGroups.flatMap(g => g.fields.map(f => f.id));



export function ActivityTable({ projectId, activeTab: externalActiveTab, onTabChange }: ActivityTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm !== searchInput) {
        setSearchTerm(searchInput);
        setCurrentPage(1);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput, searchTerm]);
  const [showWriter, setShowWriter] = useState(false);
  const [internalActiveTab, setInternalActiveTab] = useState("wir");
  const activeTab = externalActiveTab || internalActiveTab;
  const setActiveTab = (tab: string) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalActiveTab(tab);
    }
  };

  const isTabMounted = useRef(false);
  useEffect(() => {
    if (isTabMounted.current) {
      setCurrentPage(1);
    } else {
      isTabMounted.current = true;
    }
  }, [activeTab]);

  const [deletionReason, setDeletionReason] = useState("");
  const [currentPage, setCurrentPage] = useState(() => {
    try {
      const saved = sessionStorage.getItem("activity-table-page");
      return saved ? parseInt(saved, 10) : 1;
    } catch (e) {
      return 1;
    }
  });

  useEffect(() => {
    sessionStorage.setItem("activity-table-page", currentPage.toString());
  }, [currentPage]);

  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = localStorage.getItem("activity-table-pageSize");
      return saved ? parseInt(saved, 10) : 12;
    } catch (e) {
      return 12;
    }
  });

  useEffect(() => {
    localStorage.setItem("activity-table-pageSize", pageSize.toString());
  }, [pageSize]);

  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [filters, setFilters] = useState<Filters>(() => {
    try {
      const saved = localStorage.getItem("activity-table-filters");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error parsing saved filters:", e);
    }
    return defaultFilters;
  });
  const [tempFilters, setTempFilters] = useState<Filters>(() => {
    try {
      const saved = localStorage.getItem("activity-table-filters");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error parsing saved filters:", e);
    }
    return defaultFilters;
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    const saved = localStorage.getItem("activity-table-view-mode");
    return (saved === "grid" || saved === "list") ? saved : "list";
  });

  const handleViewModeChange = (mode: "list" | "grid") => {
    setViewMode(mode);
    localStorage.setItem("activity-table-view-mode", mode);
  };
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: requestResult, isLoading: isLoadingRequests } = useQuery<{ data: Request[], total: number } | Request[]>({
    queryKey: ["/api/requests", { projectId, currentPage, pageSize, activeTab, searchTerm, filters }],
    queryFn: async () => {
      const endpoint = activeTab === "deleted" ? `/api/requests/deleted/${projectId}` : "/api/requests";
      const params = new URLSearchParams();
      if (projectId && activeTab !== "deleted") params.append("projectId", projectId);

      if (activeTab === "deleted") {
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error("Failed to fetch deleted requests");
        return res.json();
      }

      params.append("page", currentPage.toString());
      params.append("limit", pageSize.toString());
      if (activeTab) params.append("activeTab", activeTab);
      if (searchTerm) params.append("searchTerm", searchTerm);
      if (filters.status.length) params.append("status", filters.status.join(","));
      if (filters.division) params.append("division", filters.division);
      if (filters.chapter) params.append("chapter", filters.chapter);
      if (filters.writer.length) params.append("writer", filters.writer.join(","));
      if (filters.building.length) params.append("building", filters.building.join(","));
      if (filters.floor.length) params.append("floor", filters.floor.join(","));
      if (filters.part.length) params.append("part", filters.part.join(","));
      if (filters.activity) params.append("activity", filters.activity);
      if (filters.purpose.length) params.append("purpose", filters.purpose.join(","));
      if (filters.step.length) params.append("step", filters.step.join(","));
      if (filters.approvalStatus.length) params.append("approvalStatus", filters.approvalStatus.join(","));

      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch requests");
      return res.json();
    },
    // refetchOnWindowFocus already covers the common case of returning to the tab; a tight
    // poll on top of it just keeps the serverless database from ever scaling to zero.
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  const requests = useMemo(() => {
    if (!requestResult) return [];
    if (Array.isArray(requestResult)) return requestResult;
    return requestResult.data || [];
  }, [requestResult]);

  const totalFromServer = useMemo(() => {
    if (!requestResult) return 0;
    if (Array.isArray(requestResult)) return requestResult.length;
    return requestResult.total || 0;
  }, [requestResult]);

  const { data: workflowSteps = [] } = useQuery<WorkflowStep[]>({
    queryKey: ["/api/workflow-steps"],
  });

  const { data: requestLocations = { buildings: [], floors: [], parts: [] } } = useQuery<{ buildings: string[], floors: string[], parts: string[] }>({
    queryKey: ["/api/projects", projectId, "request-locations"],
    queryFn: async () => {
      if (!projectId) return { buildings: [], floors: [], parts: [] };
      const res = await fetch(`/api/projects/${projectId}/request-locations`);
      if (!res.ok) throw new Error("Failed to fetch request locations");
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: divisions = [] } = useQuery<Division[]>({
    queryKey: ["/api/work-list-divisions"],
  });

  const { data: chapters = [] } = useQuery<Chapter[]>({
    queryKey: ["/api/work-list-chapters"],
  });

  const { data: activities = [] } = useQuery<WorkListActivity[]>({
    queryKey: ["/api/work-list-activities"],
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: requestTypes = [] } = useQuery<RequestType[]>({
    queryKey: ["/api/request-types"],
  });

  const { data: purposes = [] } = useQuery<Purpose[]>({
    queryKey: ["/api/purposes"],
  });

  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const isDC = user?.positions?.some(p => p.toLowerCase().includes("document controller")) || false;
  const canManageDeletions = isSuperAdmin || isDC;



  const [requestToDelete, setRequestToDelete] = useState<Request | null>(null);
  const [requestToEdit, setRequestToEdit] = useState<Request | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState<Set<string>>(new Set(allExportFieldIds));

  const toggleExportField = (id: string) => {
    setSelectedExportFields(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleExportGroup = (group: ExportGroup) => {
    const allSelected = group.fields.every(f => selectedExportFields.has(f.id));
    setSelectedExportFields(prev => {
      const next = new Set(prev);
      group.fields.forEach(f => {
        if (allSelected) {
          next.delete(f.id);
        } else {
          next.add(f.id);
        }
      });
      return next;
    });
  };

  const toggleSelectOne = (id: string) => {
    setSelectedRequests(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      let deleted = 0;
      const errors: string[] = [];
      for (const id of ids) {
        try {
          await apiRequest("DELETE", `/api/requests/${id}`);
          deleted++;
        } catch (e: any) {
          errors.push(e.message || id);
        }
      }
      return { deleted, errors };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedRequests(new Set());
      setBulkDeleteOpen(false);
      if (data.errors.length > 0) {
        toast({
          title: "Partial Success",
          description: `${data.deleted} deleted, ${data.errors.length} failed`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: `${data.deleted} request(s) deleted successfully`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete requests",
        variant: "destructive",
      });
    },
  });

  const bulkRestoreMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      let restored = 0;
      const errors: string[] = [];
      for (const id of ids) {
        try {
          await apiRequest("POST", `/api/requests/${id}/restore`);
          restored++;
        } catch (e: any) {
          errors.push(e.message || id);
        }
      }
      return { restored, errors };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      setSelectedRequests(new Set());
      if (data.errors.length > 0) {
        toast({
          title: "Partial Success",
          description: `${data.restored} restored, ${data.errors.length} failed`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: `${data.restored} request(s) restored successfully`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to restore requests",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (request: Request) => {
    setRequestToDelete(request);
  };

  const handleEdit = (request: Request) => {
    setEditTitle(request.currentRevision?.activityName || "");
    setEditDescription(request.currentRevision?.description || "");
    setRequestToEdit(request);
  };

  const editMutation = useMutation({
    mutationFn: async ({ requestId, title, description }: { requestId: string; title: string; description: string }) => {
      // API call to update request details
      throw new Error("تعديل الطلب مباشرة غير مدعوم حالياً في هذه الواجهة. يجب تعديله من خلال إنشاء نسخة جديدة.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      toast({
        title: "Success",
        description: "Request updated successfully",
      });
      setRequestToEdit(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update request",
        variant: "destructive",
      });
    },
  });

  const confirmEdit = () => {
    if (!requestToEdit) return;
    editMutation.mutate({
      requestId: requestToEdit.id,
      title: editTitle.trim(),
      description: editDescription.trim(),
    });
  };

  const confirmDelete = async () => {
    if (!requestToDelete) return;

    try {
      await apiRequest("DELETE", `/api/requests/${requestToDelete.id}`, { reason: deletionReason });

      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });

      toast({
        title: "Success",
        description: "Request deleted successfully",
      });
      setDeletionReason("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete request",
        variant: "destructive",
      });
    } finally {
      setRequestToDelete(null);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await apiRequest("POST", `/api/requests/${id}/restore`);
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      toast({
        title: "Success",
        description: "Request restored successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to restore request",
        variant: "destructive",
      });
    }
  };

  const handleBulkOpen = () => {
    let blocked = false;
    let openedCount = 0;

    // Open all selected requests in new tabs
    selectedRequests.forEach((id) => {
      const w = window.open(`/requests/${id}`, "_blank");
      if (!w) {
        blocked = true;
      } else {
        openedCount++;
      }
    });

    if (blocked) {
      toast({
        title: "Popups Blocked / تم حظر النوافذ المنبثقة",
        description: "Please allow popups for this site to open multiple tabs. / يرجى السماح بالنوافذ المنبثقة لفتح عدة صفحات",
        variant: "destructive",
        duration: 5000,
      });
    } else if (openedCount > 0) {
      toast({
        title: "Opening Tabs",
        description: `Opening ${openedCount} tabs...`,
      });
    }
  };

  const handleConfirmExport = async () => {
    if (totalFromServer === 0) {
      toast({
        title: "No Data",
        description: "There are no requests to export.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    try {
      // Fetch all matching requests bypassing pagination limit
      const endpoint = activeTab === "deleted" ? `/api/requests/deleted/${projectId}` : "/api/requests";
      const params = new URLSearchParams();
      if (projectId && activeTab !== "deleted") params.append("projectId", projectId);

      if (activeTab !== "deleted") {
        if (activeTab) params.append("activeTab", activeTab);
        if (searchTerm) params.append("searchTerm", searchTerm);
        if (filters.status.length) params.append("status", filters.status.join(","));
        if (filters.division) params.append("division", filters.division);
        if (filters.chapter) params.append("chapter", filters.chapter);
        if (filters.writer.length) params.append("writer", filters.writer.join(","));
        if (filters.building.length) params.append("building", filters.building.join(","));
        if (filters.floor.length) params.append("floor", filters.floor.join(","));
        if (filters.part.length) params.append("part", filters.part.join(","));
        if (filters.activity) params.append("activity", filters.activity);
        if (filters.purpose.length) params.append("purpose", filters.purpose.join(","));
        if (filters.step.length) params.append("step", filters.step.join(","));
        if (filters.approvalStatus && filters.approvalStatus.length > 0) params.append("approvalStatus", filters.approvalStatus.join(","));
      }

      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch requests for export");

      const resData = await res.json();
      let exportData: Request[] = Array.isArray(resData) ? resData : (resData as any).data || [];

      // Apply date range filter on frontend if exists
      if (dateRange?.from) {
        exportData = exportData.filter((r) => {
          const date = parseDbTimestamp(r.createdAt);
          const start = startOfDay(dateRange.from!);
          const end = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from!);
          return isWithinInterval(date, { start, end });
        });
      }

      if (exportData.length === 0) {
        toast({
          title: "No Data",
          description: "There are no requests matching current filters to export.",
          variant: "destructive",
        });
        setIsExporting(false);
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Requests");

      // Define columns based on selection
      const columns: Partial<ExcelJS.Column>[] = [];
      if (selectedExportFields.has("index")) columns.push({ header: "#", key: "index", width: 5 });
      if (selectedExportFields.has("requestNo")) columns.push({ header: "Request No", key: "requestNo", width: 15 });
      if (selectedExportFields.has("type")) columns.push({ header: "Type", key: "type", width: 25 });
      if (selectedExportFields.has("division")) columns.push({ header: "Division", key: "division", width: 25 });
      if (selectedExportFields.has("chapter")) columns.push({ header: "Chapter", key: "chapter", width: 20 });
      if (selectedExportFields.has("activity")) columns.push({ header: "Activity", key: "activity", width: 40 });
      if (selectedExportFields.has("buildingNo")) columns.push({ header: "Building No.", key: "buildingNo", width: 15 });
      if (selectedExportFields.has("units")) columns.push({ header: "Units", key: "units", width: 15 });
      if (selectedExportFields.has("workLevels")) columns.push({ header: "Work levels", key: "workLevels", width: 15 });
      if (selectedExportFields.has("resultCode")) columns.push({ header: "Code", key: "resultCode", width: 10 });
      if (selectedExportFields.has("step")) columns.push({ header: "step", key: "step", width: 15 });
      if (selectedExportFields.has("transactionDate")) columns.push({ header: "Transaction Date", key: "transactionDate", width: 15 });
      if (selectedExportFields.has("submitterDate")) columns.push({ header: "Submitter Date", key: "submitterDate", width: 15 });
      if (selectedExportFields.has("actualDate")) columns.push({ header: "Actual Date", key: "actualDate", width: 15 });
      if (selectedExportFields.has("personDetails")) columns.push({ header: "Person Details", key: "personDetails", width: 20 });
      if (selectedExportFields.has("purpose")) columns.push({ header: "Purpose", key: "purpose", width: 10 });

      worksheet.columns = columns;

      // Style Header Row
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF4472C4" }, // Blue
        };
        cell.font = {
          color: { argb: "FFFFFFFF" }, // White
          bold: true,
          size: 12, // Increased font size
        };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Add Data Rows
      exportData.forEach((r, index) => {
        const rowData: Record<string, any> = {};

        if (selectedExportFields.has("index")) rowData.index = index + 1;
        if (selectedExportFields.has("requestNo")) rowData.requestNo = r.requestNumber || "-";
        if (selectedExportFields.has("type")) {
          const type = requestTypes.find(t => t.id === r.requestTypeId);
          rowData.type = type ? type.name_english : "Work Inspection request";
        }
        if (selectedExportFields.has("division")) rowData.division = r.divisionName || "-";
        if (selectedExportFields.has("chapter")) rowData.chapter = r.chapterName || "-";
        if (selectedExportFields.has("activity")) rowData.activity = (r.requestNumber?.startsWith("MIR") && (r as any).materialNames) ? (r as any).materialNames : (r.currentRevision?.activityName || "Untitled");
        if (selectedExportFields.has("buildingNo")) rowData.buildingNo = formatLocationList(r.currentRevision?.buildingNo, 1000);
        if (selectedExportFields.has("units")) rowData.units = formatLocationList(r.currentRevision?.units || r.currentRevision?.buildingNo, 1000);
        if (selectedExportFields.has("workLevels")) rowData.workLevels = formatLocationList((r.currentRevision as any)?.workLevels, 1000);
        if (selectedExportFields.has("resultCode")) rowData.resultCode = r.currentRevision?.approvalStatusCode || "-";
        if (selectedExportFields.has("step")) {
          const step = workflowSteps.find(s => s.id === r.currentRevision?.currentStepId);
          rowData.step = step ? step.stepName : (r.currentRevision?.currentStepId || "-");
        }

        const createdDate = parseDbTimestamp(r.createdAt);
        if (selectedExportFields.has("transactionDate")) rowData.transactionDate = format(createdDate, "yyyy/MM/dd");
        if (selectedExportFields.has("submitterDate")) rowData.submitterDate = format(createdDate, "yyyy/MM/dd");
        if (selectedExportFields.has("actualDate")) {
          const date = r.currentRevision?.approvedAt ? parseDbTimestamp(r.currentRevision.approvedAt) : null;
          rowData.actualDate = date ? format(date, "yyyy/MM/dd") : "-";
        }

        if (selectedExportFields.has("personDetails")) rowData.personDetails = r.userName || "-";
        if (selectedExportFields.has("purpose")) rowData.purpose = r.purposeNames?.join(", ") || "-";

        const row = worksheet.addRow(rowData);

        // Apply Row Styling based on Result Code (Approval Status)
        const code = r.currentRevision?.approvalStatusCode;
        let fillColor = "";

        if (code === "A" || code === "B") {
          fillColor = "FFC6EFCE"; // Light Green
        } else if (code === "C") {
          fillColor = "FFFCE4D6"; // Light Orange
        } else if (code === "D") {
          fillColor = "FFFFC7CE"; // Light Red
        }

        // Apply common cell styling (Borders, Alignment, Wrap)
        row.eachCell((cell, colNumber) => {
          // Apply borders to all cells
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };

          // Apply text wrapping for specific long columns
          // Columns: 1=#, 2=ReqNo, 3=Type, 4=Div, 5=Chap, 6=Activity, 7=Units, 8=Levels ...
          // We can check by key instead of index if possible, but cell doesn't expose key easily here in loop unless we map it.
          // Better: Set default alignment
          cell.alignment = { vertical: "middle", wrapText: false };

          // Center align specific columns
          // We need to know which column key corresponds to this cell.
          const colKey = columns[colNumber - 1]?.key;
          if (["index", "resultCode", "step", "transactionDate", "submitterDate", "actualDate", "units", "workLevels", "purpose"].includes(colKey as string)) {
            cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
          }

          // Apply fill color if valid
          if (fillColor) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: fillColor },
            };
          }
        });
      });

      // Auto-fit columns based on content
      worksheet.columns.forEach((column) => {
        let maxLength = 0;
        if (column && column.eachCell) {
          column.eachCell({ includeEmpty: true }, (cell) => {
            const columnLength = cell.value ? cell.value.toString().length : 0;
            if (columnLength > maxLength) {
              maxLength = columnLength;
            }
          });
          // Add padding and set min/max width
          column.width = Math.min(Math.max(maxLength + 2, 10), 100);
        }
      });

      // Generate File
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      saveAs(blob, `Requests_Export_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);

      toast({
        title: "Export Successful",
        description: `Exported ${exportData.length} requests to Excel.`,
      });
      setExportDialogOpen(false);
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export Failed",
        description: "An error occurred while generating the export file.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.status.length > 0) count++;
    if (filters.division) count++;
    if (filters.chapter) count++;
    if (filters.writer.length > 0) count++;
    if (filters.building.length > 0) count++;
    if (filters.floor.length > 0) count++;
    if (filters.part.length > 0) count++;
    if (filters.activity) count++;
    if (filters.purpose.length > 0) count++;
    if (filters.step.length > 0) count++;
    if (filters.approvalStatus && filters.approvalStatus.length > 0) count++;
    return count;
  }, [filters]);

  const handleApplyFilters = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const newFilters = { ...tempFilters };
    setFilters(newFilters);
    localStorage.setItem("activity-table-filters", JSON.stringify(newFilters));
    setFilterOpen(false);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setTempFilters(defaultFilters);
    setFilters(defaultFilters);
    localStorage.removeItem("activity-table-filters");
    setCurrentPage(1);
  };

  const handleOpenFilterPopup = () => {
    setTempFilters(filters);
    setFilterOpen(true);
  };

  const filteredChapters = useMemo(() => {
    if (!tempFilters.division) return chapters;
    return chapters.filter(c => c.divisionId === tempFilters.division);
  }, [chapters, tempFilters.division]);

  const uniqueBuildings = useMemo(() => {
    return requestLocations.buildings;
  }, [requestLocations]);

  const uniqueFloors = useMemo(() => {
    return requestLocations.floors;
  }, [requestLocations]);

  const uniqueParts = useMemo(() => {
    return requestLocations.parts;
  }, [requestLocations]);

  const filteredRequests = useMemo(() => {
    let filtered = requests;

    if (activeTab === "request") {
      const nonApprovalTypeIds = requestTypes
        .filter((t) => {
          if (t.code === "MIR") return true;
          return !t.code.toLowerCase().includes("approval") && !t.name_english.toLowerCase().includes("approval") && t.code?.toUpperCase() !== "SSR" && t.code !== "WIR" && t.code !== "DSR" && t.code !== "SD" && t.code !== "ASD";
        })
        .map((t) => t.id);

      if (requestTypes.length > 0) {
        filtered = filtered.filter((r) => nonApprovalTypeIds.includes(r.requestTypeId));
      }
    } else if (activeTab === "approvals") {
      const approvalTypeIds = requestTypes
        .filter((t) => {
          if (t.code === "MIR") return false;
          return t.code.toLowerCase().includes("approval") || t.name_english.toLowerCase().includes("approval") || t.code?.toUpperCase() === "SSR";
        })
        .map((t) => t.id);

      if (requestTypes.length > 0) {
        filtered = filtered.filter((r) => approvalTypeIds.includes(r.requestTypeId));
      } else {
        filtered = []; // Avoid showing all requests if types aren't loaded yet
      }
    } else if (activeTab === "wir") {
      const wirTypeId = requestTypes.find((t) => t.code === "WIR")?.id;
      if (wirTypeId) {
        filtered = filtered.filter((r) => r.requestTypeId === wirTypeId);
      } else {
        filtered = [];
      }
    } else if (activeTab === "dsr") {
      const dsrTypeId = requestTypes.find((t) => t.code === "DSR")?.id;
      if (dsrTypeId) {
        filtered = filtered.filter((r) => r.requestTypeId === dsrTypeId);
      } else {
        filtered = [];
      }
    } else if (activeTab === "sd") {
      const sdTypeId = requestTypes.find((t) => t.code === "SD")?.id;
      if (sdTypeId) {
        filtered = filtered.filter((r) => r.requestTypeId === sdTypeId);
      } else {
        filtered = [];
      }
    } else if (activeTab === "asd") {
      const asdTypeId = requestTypes.find((t) => t.code === "ASD")?.id;
      if (asdTypeId) {
        filtered = filtered.filter((r) => r.requestTypeId === asdTypeId);
      } else {
        filtered = [];
      }
    } else if (activeTab === "deleted") {
      // No extra filtering needed here for now as the backend already returned deleted requests
    }

    if (searchTerm) {
      filtered = filtered.filter((r) => {
        const locationText = r.currentRevision ?
          `${r.currentRevision.buildingNo} ${r.currentRevision.floor} ${r.currentRevision.part}` : "";
        return (
          r.requestNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.currentRevision?.activityName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.currentRevision?.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          locationText.toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
    }

    if (dateRange?.from) {
      filtered = filtered.filter((r) => {
        const date = parseDbTimestamp(r.createdAt);
        const start = startOfDay(dateRange.from!);
        const end = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from!);
        return isWithinInterval(date, { start, end });
      });
    }

    if (filters.status.length > 0) {
      filtered = filtered.filter((r) => {
        const code = r.currentRevision?.approvalStatusCode;
        const currentStatus = r.currentStatus || "";

        if (filters.status.includes("Pending Revision") && code === "C" && currentStatus !== "Closed") {
          return true;
        }

        if (filters.status.includes("Rejected") && code === "D" && currentStatus !== "Closed") {
          return true;
        }

        if (filters.status.includes("Approved") && (code === "A" || code === "B") && currentStatus !== "Closed") {
          return true;
        }

        if (filters.status.includes(currentStatus) && currentStatus !== "Approved") {
          return true;
        }

        return false;
      });
    }

    if (filters.division) {
      filtered = filtered.filter((r) => r.divisionId === filters.division);
    }

    if (filters.chapter) {
      filtered = filtered.filter((r) => r.chapterId === filters.chapter);
    }

    if (filters.writer && filters.writer.length > 0) {
      filtered = filtered.filter((r) => r.createdBy && filters.writer.includes(r.createdBy));
    }

    if (filters.building && filters.building.length > 0) {
      filtered = filtered.filter((r) => {
        const buildingNo = (r.currentRevision?.buildingNo || "").toLowerCase();
        return filters.building.some(b => buildingNo.includes(b.toLowerCase()));
      });
    }

    if (filters.floor && filters.floor.length > 0) {
      filtered = filtered.filter((r) => {
        const floor = (r.currentRevision?.floor || "").toLowerCase();
        return filters.floor.some(f => floor.includes(f.toLowerCase()));
      });
    }

    if (filters.part && filters.part.length > 0) {
      filtered = filtered.filter((r) => {
        const part = (r.currentRevision?.part || "").toLowerCase();
        return filters.part.some(p => part.includes(p.toLowerCase()));
      });
    }

    if (filters.activity) {
      filtered = filtered.filter((r) => {
        const activity = r.currentRevision?.activityName || "";
        return activity.toLowerCase().includes(filters.activity.toLowerCase());
      });
    }

    if (filters.purpose && filters.purpose.length > 0) {
      filtered = filtered.filter((r) => r.purposeIds?.some(p => filters.purpose.includes(p)));
    }

    if (filters.step && filters.step.length > 0) {
      filtered = filtered.filter((r) => r.currentRevision?.currentStepId && filters.step.includes(r.currentRevision.currentStepId.toString()));
    }

    if (filters.approvalStatus && filters.approvalStatus.length > 0) {
      filtered = filtered.filter((r) => {
        const code = r.currentRevision?.approvalStatusCode;
        return code && filters.approvalStatus.includes(code);
      });
    }

    return filtered.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [requests, requestTypes, searchTerm, activeTab, dateRange, filters]);

  const totalPages = Math.ceil(totalFromServer / pageSize);
  const paginatedRequests = filteredRequests; // Backend already handles slicing

  const allFilteredSelected = filteredRequests.length > 0 && filteredRequests.every(r => selectedRequests.has(r.id));
  const allPageSelected = paginatedRequests.length > 0 && paginatedRequests.every(r => selectedRequests.has(r.id));
  const somePageSelected = paginatedRequests.some(r => selectedRequests.has(r.id));

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedRequests(prev => {
        const next = new Set(prev);
        paginatedRequests.forEach(r => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedRequests(prev => {
        const next = new Set(prev);
        paginatedRequests.forEach(r => next.add(r.id));
        return next;
      });
    }
  };

  const selectAllFiltered = () => {
    setSelectedRequests(new Set(filteredRequests.map(r => r.id)));
  };

  const handleViewRequest = (request: Request) => {
    navigate(`/requests/${request.id}`);
  };



  return (
    <div className="space-y-4">
      {/* Filter Dialog */}
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Filters</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Select
                  value={tempFilters.division}
                  onValueChange={(value) => setTempFilters(prev => ({
                    ...prev,
                    division: value === "all" ? "" : value,
                    chapter: "",
                    activity: ""
                  }))}
                >
                  <SelectTrigger className="h-10 text-sm rounded-[1.5rem]">
                    <SelectValue placeholder="All Divisions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Divisions</SelectItem>
                    {divisions.map((div) => (
                      <SelectItem key={div.id} value={div.id}>
                        {div.code} - {div.nameEnglish || div.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Select
                  value={tempFilters.chapter}
                  onValueChange={(value) => setTempFilters(prev => ({
                    ...prev,
                    chapter: value === "all" ? "" : value,
                    activity: ""
                  }))}
                  disabled={!tempFilters.division}
                >
                  <SelectTrigger className="h-10 text-sm rounded-[1.5rem]">
                    <SelectValue placeholder={tempFilters.division ? "All Chapters" : "Select division first"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Chapters</SelectItem>
                    {chapters.filter(c => c.divisionId === tempFilters.division).map((ch) => (
                      <SelectItem key={ch.id} value={ch.id}>
                        {ch.code} - {ch.nameEnglish || ch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-1 sm:col-span-2 space-y-2">
                <Select
                  value={tempFilters.activity}
                  onValueChange={(value) => setTempFilters(prev => ({ ...prev, activity: value === "all" ? "" : value }))}
                  disabled={!tempFilters.chapter}
                >
                  <SelectTrigger className="h-10 text-sm rounded-[1.5rem]">
                    <SelectValue placeholder={tempFilters.chapter ? "All Activities" : "Select chapter first"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Activities</SelectItem>
                    {activities.filter(a => a.chapterId === tempFilters.chapter).map((act) => (
                      <SelectItem key={act.id} value={act.nameEnglish || act.nameArabic}>
                        {act.nameEnglish || act.nameArabic}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full h-10 text-sm justify-between font-normal truncate rounded-[1.5rem]">
                      <span className="truncate">
                        {tempFilters.status.length > 0 ? (
                          tempFilters.status.length === 1 ? (
                            statusConfig[tempFilters.status[0]]?.label || tempFilters.status[0]
                          ) : (
                            `${statusConfig[tempFilters.status[0]]?.label || tempFilters.status[0]} (+${tempFilters.status.length - 1})`
                          )
                        ) : (
                          "Select statuses"
                        )}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-50 shrink-0 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[--radix-popover-trigger-width] min-w-[200px]" align="start">
                    <DropdownMenuLabel>Status</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {Object.entries(statusConfig).map(([key, config]) => (
                      <DropdownMenuCheckboxItem
                        key={key}
                        checked={tempFilters.status.includes(key)}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setTempFilters(prev => ({
                              ...prev,
                              status: [...prev.status, key]
                            }));
                          } else {
                            setTempFilters(prev => ({
                              ...prev,
                              status: prev.status.filter(s => s !== key)
                            }));
                          }
                        }}
                      >
                        {config.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full h-10 text-sm justify-between font-normal truncate rounded-[1.5rem]">
                      <span className="truncate">
                        {tempFilters.approvalStatus && tempFilters.approvalStatus.length > 0 ? (
                          tempFilters.approvalStatus.length === 1 ? (
                            approvalStatusConfig[tempFilters.approvalStatus[0] as keyof typeof approvalStatusConfig]?.label || tempFilters.approvalStatus[0]
                          ) : (
                            `${approvalStatusConfig[tempFilters.approvalStatus[0] as keyof typeof approvalStatusConfig]?.label || tempFilters.approvalStatus[0]} (+${tempFilters.approvalStatus.length - 1})`
                          )
                        ) : (
                          "Select code"
                        )}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-50 shrink-0 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[--radix-popover-trigger-width] min-w-[200px]" align="start">
                    <DropdownMenuLabel>Code</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {Object.entries(approvalStatusConfig).map(([key, config]) => (
                      <DropdownMenuCheckboxItem
                        key={key}
                        checked={tempFilters.approvalStatus?.includes(key)}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setTempFilters(prev => ({
                              ...prev,
                              approvalStatus: [...(prev.approvalStatus || []), key]
                            }));
                          } else {
                            setTempFilters(prev => ({
                              ...prev,
                              approvalStatus: (prev.approvalStatus || []).filter(s => s !== key)
                            }));
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <config.icon className={`w-4 h-4 ${config.textColor.split(' ')[0]}`} />
                          {config.label}
                        </div>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full h-10 text-sm justify-between font-normal truncate rounded-[1.5rem]">
                      <span className="truncate">
                        {tempFilters.purpose.length > 0 ? (
                          tempFilters.purpose.length === 1 ? (
                            purposes.find((item) => item.id === tempFilters.purpose[0])?.code || "1 Purpose"
                          ) : (
                            `${purposes.find((item) => item.id === tempFilters.purpose[0])?.code || "Purpose"} (+${tempFilters.purpose.length - 1})`
                          )
                        ) : (
                          "All Purposes"
                        )}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-50 shrink-0 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[--radix-popover-trigger-width] min-w-[200px]" align="start">
                    <DropdownMenuLabel>Purpose</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {purposes.map((p) => (
                      <DropdownMenuCheckboxItem
                        key={p.id}
                        checked={tempFilters.purpose.includes(p.id)}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setTempFilters(prev => ({
                              ...prev,
                              purpose: [...prev.purpose, p.id]
                            }));
                          } else {
                            setTempFilters(prev => ({
                              ...prev,
                              purpose: prev.purpose.filter(id => id !== p.id)
                            }));
                          }
                        }}
                      >
                        {p.code} - {p.nameEnglish || p.nameArabic}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full h-10 text-sm justify-between font-normal truncate rounded-[1.5rem]">
                      <span className="truncate">
                        {(() => {
                          const selectedStepNames = Object.entries(
                            workflowSteps
                              .filter(step => step.requestTypeId !== 12)
                              .reduce((acc, step) => {
                                if (!acc[step.stepName]) acc[step.stepName] = [];
                                acc[step.stepName].push(step.id);
                                return acc;
                              }, {} as Record<string, number[]>)
                          )
                            .filter(([name, ids]) => ids.every(id => tempFilters.step.includes(id.toString())))
                            .map(([name]) => name);

                          if (selectedStepNames.length > 0) {
                            return selectedStepNames.length === 1 ? (
                              selectedStepNames[0]
                            ) : (
                              `${selectedStepNames[0]} (+${selectedStepNames.length - 1})`
                            );
                          }
                          return "All Steps";
                        })()}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-50 shrink-0 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[--radix-popover-trigger-width] min-w-[200px]" align="start">
                    <DropdownMenuLabel>Step</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {Object.entries(
                      workflowSteps
                        .filter(step => step.requestTypeId !== 12)
                        .reduce((acc, step) => {
                          if (!acc[step.stepName]) acc[step.stepName] = [];
                          acc[step.stepName].push(step.id);
                          return acc;
                        }, {} as Record<string, number[]>)
                    ).map(([name, ids]) => {
                      const isChecked = ids.every(id => tempFilters.step.includes(id.toString()));
                      return (
                        <DropdownMenuCheckboxItem
                          key={name}
                          checked={isChecked}
                          onSelect={(e) => e.preventDefault()}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setTempFilters(prev => ({
                                ...prev,
                                step: [...prev.step, ...ids.map(id => id.toString())]
                              }));
                            } else {
                              setTempFilters(prev => ({
                                ...prev,
                                step: prev.step.filter(s => !ids.map(id => id.toString()).includes(s))
                              }));
                            }
                          }}
                        >
                          {name}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full h-10 text-sm justify-between font-normal truncate rounded-[1.5rem]">
                      <span className="truncate">
                        {tempFilters.writer.length > 0 ? (
                          (() => {
                            const u = users.find((item) => item.id === tempFilters.writer[0]);
                            const name = u ? (u.displayName || u.username) : tempFilters.writer[0];
                            return tempFilters.writer.length === 1 ? (
                              name
                            ) : (
                              `${name} (+${tempFilters.writer.length - 1})`
                            );
                          })()
                        ) : (
                          "All Writers"
                        )}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-50 shrink-0 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[--radix-popover-trigger-width] min-w-[200px]" align="start">
                    <DropdownMenuLabel>Writer</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {users.map((u) => (
                      <DropdownMenuCheckboxItem
                        key={u.id}
                        checked={tempFilters.writer.includes(u.id)}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setTempFilters(prev => ({
                              ...prev,
                              writer: [...prev.writer, u.id]
                            }));
                          } else {
                            setTempFilters(prev => ({
                              ...prev,
                              writer: prev.writer.filter(id => id !== u.id)
                            }));
                          }
                        }}
                      >
                        {u.displayName || u.username}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full h-10 text-sm justify-between font-normal truncate rounded-[1.5rem]" title="Building Number">
                      <span className="truncate">
                        {tempFilters.building.length > 0 ? (
                          tempFilters.building.length === 1 ? (
                            tempFilters.building[0]
                          ) : (
                            `${tempFilters.building[0]} (+${tempFilters.building.length - 1})`
                          )
                        ) : (
                          "All Buildings"
                        )}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-50 shrink-0 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[--radix-popover-trigger-width] min-w-[200px]" align="start">
                    <DropdownMenuLabel>Building Number</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {uniqueBuildings.map((b) => (
                      <DropdownMenuCheckboxItem
                        key={b}
                        checked={tempFilters.building.includes(b)}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setTempFilters(prev => ({
                              ...prev,
                              building: [...prev.building, b]
                            }));
                          } else {
                            setTempFilters(prev => ({
                              ...prev,
                              building: prev.building.filter(item => item !== b)
                            }));
                          }
                        }}
                      >
                        {b}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full h-10 text-sm justify-between font-normal truncate rounded-[1.5rem]" title="Floor Number">
                      <span className="truncate">
                        {tempFilters.floor.length > 0 ? (
                          tempFilters.floor.length === 1 ? (
                            tempFilters.floor[0]
                          ) : (
                            `${tempFilters.floor[0]} (+${tempFilters.floor.length - 1})`
                          )
                        ) : (
                          "All Floors"
                        )}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-50 shrink-0 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[--radix-popover-trigger-width] min-w-[200px]" align="start">
                    <DropdownMenuLabel>Floor Number</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {uniqueFloors.map((f) => (
                      <DropdownMenuCheckboxItem
                        key={f}
                        checked={tempFilters.floor.includes(f)}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setTempFilters(prev => ({
                              ...prev,
                              floor: [...prev.floor, f]
                            }));
                          } else {
                            setTempFilters(prev => ({
                              ...prev,
                              floor: prev.floor.filter(item => item !== f)
                            }));
                          }
                        }}
                      >
                        {f}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full h-10 text-sm justify-between font-normal truncate rounded-[1.5rem]" title="Part Code">
                      <span className="truncate">
                        {tempFilters.part.length > 0 ? (
                          tempFilters.part.length === 1 ? (
                            tempFilters.part[0]
                          ) : (
                            `${tempFilters.part[0]} (+${tempFilters.part.length - 1})`
                          )
                        ) : (
                          "All Parts"
                        )}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-50 shrink-0 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[--radix-popover-trigger-width] min-w-[200px]" align="start">
                    <DropdownMenuLabel>Part Code</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {uniqueParts.map((p) => (
                      <DropdownMenuCheckboxItem
                        key={p}
                        checked={tempFilters.part.includes(p)}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setTempFilters(prev => ({
                              ...prev,
                              part: [...prev.part, p]
                            }));
                          } else {
                            setTempFilters(prev => ({
                              ...prev,
                              part: prev.part.filter(item => item !== p)
                            }));
                          }
                        }}
                      >
                        {p}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={handleResetFilters} className="rounded-[1.5rem]">Reset</Button>
            <Button size="sm" onClick={handleApplyFilters} className="rounded-[1.5rem]">Apply Filters</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-muted/30 p-2 rounded-[1.5rem] border border-border/50">
          <TabsList className="h-10 w-full lg:w-auto grid grid-cols-7 lg:flex lg:flex-nowrap bg-background shadow-sm border p-1 rounded-[1.5rem]">
            {tabTypes.map((type) => (
              <TabsTrigger
                key={type.id}
                value={type.id}
                data-testid={`tab-${type.id}`}
                className="text-sm px-4 sm:px-8 font-medium h-8 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all duration-200 rounded-[1.5rem]"
              >
                {type.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex flex-wrap items-center gap-2 justify-end w-full lg:w-auto">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                className="h-10 shadow-sm bg-background flex-1 sm:flex-initial rounded-[1.5rem]"
                onClick={() => setExportDialogOpen(true)}
              >
                <Download className="w-4 h-4 mr-2" />
                <span>Export</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-10 relative shadow-sm bg-background flex-1 sm:flex-initial rounded-[1.5rem]",
                  activeFilterCount > 0 && "border-primary text-primary"
                )}
                onClick={handleOpenFilterPopup}
              >
                <Filter className="w-4 h-4 mr-2" />
                <span>Filter</span>
                {activeFilterCount > 0 && (
                  <Badge variant="default" className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>

              <div className="flex items-center bg-background border shadow-sm rounded-[1.5rem] p-1 h-10 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn("h-8 w-8 rounded-[1.5rem]", viewMode === "list" && "bg-muted shadow-sm")}
                  onClick={() => handleViewModeChange("list")}
                >
                  <List className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn("h-8 w-8 rounded-[1.5rem]", viewMode === "grid" && "bg-muted shadow-sm")}
                  onClick={() => handleViewModeChange("grid")}
                >
                  <Grid className="w-4 h-4" />
                </Button>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    className={cn("h-10 w-10 shadow-sm bg-background shrink-0 rounded-[1.5rem]", dateRange?.from && "bg-amber-50 border-amber-200 text-amber-700")}
                  >
                    <CalendarIcon className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={window.innerWidth < 640 ? 1 : 2} />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-[180px] lg:w-[200px] xl:w-[220px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9 h-10 shadow-sm bg-background w-full rounded-[1.5rem]"
                />
              </div>

              <div className="flex items-center gap-2 ml-auto sm:ml-2 bg-background border shadow-sm rounded-[1.5rem] px-3 h-10 shrink-0">
                <Switch id="show-writer" checked={showWriter} onCheckedChange={setShowWriter} className="scale-100" />
                <Label htmlFor="show-writer" className="text-xs cursor-pointer text-muted-foreground whitespace-nowrap font-medium">Writer</Label>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {activeTab === "deleted" && (
            <Badge variant="destructive" className="h-7 gap-1.5 px-3 shadow-sm border-none bg-red-500 text-white animate-pulse">
              <Trash2 className="w-3.5 h-3.5" />
              <span className="text-xs font-bold uppercase tracking-wider">Viewing Deleted Requests (Audit Mode)</span>
            </Badge>
          )}
          {dateRange?.from && (
            <Badge variant="outline" className="bg-amber-50 text-amber-800 h-7 gap-1 px-2">
              <CalendarIcon className="w-3 h-3" />
              <span className="text-xs">
                {format(dateRange.from, "dd/MM/yyyy")}
                {dateRange.to && ` - ${format(dateRange.to, "dd/MM/yyyy")}`}
              </span>
              <button onClick={() => setDateRange(undefined)} className="ml-1 hover:bg-amber-200/50 rounded-full p-0.5">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
        </div>

        <TabsContent value={activeTab} className="mt-6">

          {selectedRequests.size > 0 && (
            <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-[1.5rem] flex-wrap">
              <span className="text-sm font-medium">
                {selectedRequests.size} of {filteredRequests.length} selected
              </span>
              {allPageSelected && !allFilteredSelected && filteredRequests.length > paginatedRequests.length && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-primary underline rounded-[1.5rem]"
                  onClick={selectAllFiltered}
                  data-testid="button-select-all-filtered"
                >
                  Select all {filteredRequests.length} results
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="rounded-[1.5rem]"
                onClick={() => setSelectedRequests(new Set())}
                data-testid="button-deselect-all"
              >
                <X className="w-3 h-3 mr-1" />
                Deselect
              </Button>
              {canManageDeletions && activeTab !== "deleted" && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-[1.5rem]"
                  onClick={() => setBulkDeleteOpen(true)}
                  data-testid="button-bulk-delete"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Delete ({selectedRequests.size})
                </Button>
              )}
              {canManageDeletions && activeTab === "deleted" && (
                <Button
                  variant="default"
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 rounded-[1.5rem]"
                  onClick={() => bulkRestoreMutation.mutate(Array.from(selectedRequests))}
                  disabled={bulkRestoreMutation.isPending}
                  data-testid="button-bulk-restore"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  {bulkRestoreMutation.isPending ? "Restoring..." : `Restore (${selectedRequests.size})`}
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                className="rounded-[1.5rem]"
                onClick={handleBulkOpen}
                data-testid="button-bulk-open"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Open Selected ({selectedRequests.size})
              </Button>
            </div>
          )}

          {viewMode === "list" ? (
            <Card className="rounded-[1.5rem] overflow-hidden border-none shadow-xl bg-white dark:bg-muted/5">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead className="w-[50px] font-semibold">#</TableHead>
                    <TableHead className="w-[100px] font-semibold">No.</TableHead>
                    <TableHead className="font-semibold">Title</TableHead>
                    <TableHead className="w-[100px] font-semibold">Status</TableHead>
                    {showWriter && (
                      <TableHead className="w-[150px] font-semibold pl-[2px] pr-[2px]">Writer</TableHead>
                    )}
                    <TableHead className="w-[120px] font-semibold">Time</TableHead>
                    <TableHead className="w-[70px] text-center font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingRequests ? (
                    <TableRow>
                      <TableCell colSpan={showWriter ? 8 : 7} className="h-64 text-center">
                        <div className="flex flex-col justify-center items-center space-y-4 text-muted-foreground">
                          <LoadingIcon size={48} />
                          <p className="text-sm">Loading requests...</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : paginatedRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={showWriter ? 8 : 7} className="h-24 text-center text-muted-foreground">
                        No requests found
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRequests.map((request, index) => {
                      const status = resolveDisplayStatus(request);
                      const globalIndex = (currentPage - 1) * pageSize + index + 1;

                      return (
                        <TableRow
                          key={request.id}
                          className={cn("cursor-pointer hover-elevate", selectedRequests.has(request.id) && "bg-primary/5")}
                          onClick={() => handleViewRequest(request)}
                          data-testid={`row-request-${request.id}`}
                        >
                          <TableCell
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={selectedRequests.has(request.id)}
                              onCheckedChange={() => toggleSelectOne(request.id)}
                              data-testid={`checkbox-request-${request.id}`}
                            />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {globalIndex}
                          </TableCell>
                          <TableCell className="font-mono text-sm font-medium text-primary">
                            <Link href={`/requests/${request.id}`} className="hover:underline block w-full h-full" onClick={(e) => e.stopPropagation()}>
                              {request.requestNumber || "-"}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="font-medium text-sm">{(request.requestNumber?.startsWith("MIR") && (request as any).materialNames) ? (request as any).materialNames : (request.requestNumber?.includes("NCR") ? (extractNcrSubject((request.currentRevision as any)?.metadata) || "No Subject provided") : (request.currentRevision?.activityName || "Untitled"))}</p>
                              <div className="flex flex-col gap-0.5">
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium flex flex-col gap-1">
                                  <span>{request.currentRevision?.divisionName} / {request.currentRevision?.chapterName}</span>
                                  {request.requestNumber?.startsWith("MIR") && (request as any).deliveryNumbers && (
                                    <div className="flex">
                                      <Badge
                                        variant="outline"
                                        className="bg-amber-100/50 text-amber-900 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800 font-medium px-1 py-0 h-4 text-[9px] normal-case"
                                      >
                                        Delivery NO: {(request as any).deliveryNumbers}
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                                <div className="text-xs line-clamp-1">
                                  {formatWorkLocationContent(request)}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {request.currentRevision?.approvalStatusCode && !request.requestNumber?.includes("NCR") && (
                                (() => {
                                  const code = request.currentRevision.approvalStatusCode as keyof typeof approvalStatusConfig;
                                  const config = approvalStatusConfig[code];
                                  if (!config) return null;
                                  const Icon = config.icon;
                                  return (
                                    <span
                                      className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${config.bgColor} text-white`}
                                      title={`${code}: ${config.label}`}
                                    >
                                      <span className="text-[11px] font-bold uppercase">{code}</span>
                                    </span>
                                  );
                                })()
                              )}

                              <TooltipProvider>
                                <Tooltip delayDuration={0}>
                                  <TooltipTrigger asChild>
                                    <Link href={`/requests/${request.id}`}>
                                      <Badge
                                        variant="secondary"
                                        className={`${status.color} text-xs cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2`}
                                        tabIndex={0}
                                        onClick={(e) => {
                                          // Allow interaction to trigger tooltip and navigation
                                        }}
                                      >
                                        {status.label || request.currentStatus}
                                      </Badge>
                                    </Link>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    {(() => {
                                      if (["Resolved", "Closed", "Approved", "Rejected"].includes(request.currentStatus || "")) {
                                        return `Current Status: ${request.currentStatus}`;
                                      }
                                      const stepId = request.currentRevision?.currentStepId;
                                      const step = workflowSteps.find(s => Number(s.id) === Number(stepId));

                                      if (step) return `Current Step: ${step.stepName}`;

                                      return `Current Status: ${request.currentStatus || "N/A"}`;
                                    })()}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                            </div>
                          </TableCell>
                          {showWriter && (
                            <TableCell className="text-muted-foreground text-sm">
                              {request.userName || "-"}
                            </TableCell>
                          )}
                          {activeTab === "deleted" ? (
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-destructive">
                                  Deleted by: {(request as any).deletedBy_name || "Unknown"}
                                </span>
                                {(request as any).reason && (
                                  <span className="text-[10px] text-muted-foreground italic truncate max-w-[150px]" title={(request as any).reason}>
                                    "{(request as any).reason}"
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          ) : (
                            <TableCell className="text-muted-foreground text-sm">
                              {formatDistanceToNow(parseDbTimestamp(request.createdAt), { addSuffix: true })}
                            </TableCell>
                          )}
                          <TableCell className="text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  data-testid={`button-request-action-${request.id}`}
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewRequest(request);
                                  }}
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  View
                                </DropdownMenuItem>
                                {activeTab !== "deleted" && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEdit(request);
                                    }}
                                  >
                                    <Edit className="w-4 h-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                )}
                                {canManageDeletions && activeTab !== "deleted" && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(request);
                                    }}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                )}
                                {canManageDeletions && activeTab === "deleted" && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRestore(request.id);
                                    }}
                                    className="text-primary focus:text-primary"
                                  >
                                    <RotateCcw className="w-4 h-4 mr-2" />
                                    Restore
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {isLoadingRequests ? (
                <div className="col-span-full h-64 flex flex-col items-center justify-center text-muted-foreground space-y-4">
                  <LoadingIcon size={48} />
                  <p className="text-sm">Loading requests...</p>
                </div>
              ) : paginatedRequests.length === 0 ? (
                <div className="col-span-full h-24 flex items-center justify-center text-muted-foreground">
                  No requests found
                </div>
              ) : (
                paginatedRequests.map((request, index) => {
                  const status = resolveDisplayStatus(request);
                  const globalIndex = (currentPage - 1) * pageSize + index + 1;

                  return (
                    <Card
                      key={request.id}
                      className="cursor-pointer hover-elevate p-4 rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5"
                      onClick={() => handleViewRequest(request)}
                      data-testid={`card-request-${request.id}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">#{globalIndex}</span>
                          <span className="font-mono text-sm font-medium text-primary">
                            {request.requestNumber || "-"}
                          </span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              data-testid={`button-card-action-${request.id}`}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewRequest(request);
                              }}
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              View
                            </DropdownMenuItem>
                            {activeTab !== "deleted" && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(request);
                                }}
                              >
                                <Edit className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {canManageDeletions && activeTab !== "deleted" && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(request);
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            )}
                            {canManageDeletions && activeTab === "deleted" && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRestore(request.id);
                                }}
                                className="text-primary focus:text-primary"
                              >
                                <RotateCcw className="w-4 h-4 mr-2" />
                                Restore
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="space-y-2">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                          {request.currentRevision?.divisionName} / {request.currentRevision?.chapterName}
                        </div>
                        <div className="space-y-1.5">
                          <p className="font-medium text-sm line-clamp-2 leading-snug">{(request.requestNumber?.startsWith("MIR") && (request as any).materialNames) ? (request as any).materialNames : (request.requestNumber?.includes("NCR") ? (extractNcrSubject((request.currentRevision as any)?.metadata) || "No Subject provided") : (request.currentRevision?.activityName || "Untitled"))}</p>
                          {request.requestNumber?.startsWith("MIR") && (request as any).deliveryNumbers && (
                            <div className="flex">
                              <Badge
                                variant="outline"
                                className="bg-amber-100/50 text-amber-900 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800 font-medium px-1.5 py-0 h-5"
                              >
                                Delivery NO: {(request as any).deliveryNumbers}
                              </Badge>
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {formatWorkLocationContent(request)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <div className="flex items-center gap-1.5">
                          <TooltipProvider>
                            <Tooltip delayDuration={0}>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="secondary"
                                  className={`${status.color} text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2`}
                                  tabIndex={0}
                                >
                                  {status.label || request.currentStatus}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {(() => {
                                  if (["Resolved", "Closed", "Approved", "Rejected"].includes(request.currentStatus || "")) {
                                    return `Current Status: ${request.currentStatus}`;
                                  }
                                  const stepId = request.currentRevision?.currentStepId;
                                  const step = workflowSteps.find(s => Number(s.id) === Number(stepId));

                                  if (step) return `Current Step: ${step.stepName}`;

                                  return `Current Status: ${request.currentStatus || "N/A"}`;
                                })()}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {request.currentRevision?.approvalStatusCode && !request.requestNumber?.includes("NCR") && (
                            (() => {
                              const code = request.currentRevision.approvalStatusCode as keyof typeof approvalStatusConfig;
                              const config = approvalStatusConfig[code];
                              if (!config) return null;
                              const Icon = config.icon;
                              return (
                                <span
                                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${config.bgColor} text-white`}
                                  title={`${code}: ${config.label}`}
                                >
                                  <span className="text-[11px] font-bold uppercase">{code}</span>
                                </span>
                              );
                            })()
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(parseDbTimestamp(request.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      {showWriter && (
                        <div className="text-xs text-muted-foreground mt-2">
                          Writer: {request.userName || "-"}
                        </div>
                      )}
                    </Card>
                  );
                })
              )}
            </div>
          )}

          <div className="flex items-center justify-between px-2 py-4 border-t bg-muted/5">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <p>Rows per page</p>
                <Select
                  value={pageSize.toString()}
                  onValueChange={(value) => {
                    setPageSize(Number(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue placeholder={pageSize.toString()} />
                  </SelectTrigger>
                  <SelectContent side="top">
                    {[4, 8, 12, 16, 20].map((size) => (
                      <SelectItem key={size} value={size.toString()}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-center text-sm font-medium whitespace-nowrap">
                Showing {totalFromServer === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalFromServer)} of {totalFromServer} requests
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage((p) => p - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1 mx-2">
                <span className="text-sm font-medium">Page {currentPage} of {totalPages || 1}</span>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={currentPage === totalPages || totalPages === 0}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Deletion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Are you sure you want to delete <strong>{selectedRequests.size}</strong> selected request(s)? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setBulkDeleteOpen(false)}
                data-testid="button-cancel-bulk-delete"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => bulkDeleteMutation.mutate(Array.from(selectedRequests))}
                disabled={bulkDeleteMutation.isPending}
                data-testid="button-confirm-bulk-delete"
              >
                {bulkDeleteMutation.isPending ? "Deleting..." : `Delete ${selectedRequests.size} Request(s)`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!requestToDelete} onOpenChange={(open) => {
        if (!open) {
          setRequestToDelete(null);
          setDeletionReason("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-muted-foreground text-sm">
              Are you sure you want to delete this request? It will be moved to the Deleted tab.
            </p>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Reason for deletion (Optional)</Label>
              <Textarea
                placeholder="Enter reason..."
                value={deletionReason}
                onChange={(e) => setDeletionReason(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRequestToDelete(null);
                  setDeletionReason("");
                }}
                data-testid="button-cancel-delete"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                data-testid="button-confirm-delete"
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!requestToEdit} onOpenChange={() => setRequestToEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Enter title"
                data-testid="input-edit-title"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Enter description"
                rows={3}
                data-testid="textarea-edit-description"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRequestToEdit(null)}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmEdit}
                disabled={editMutation.isPending || !editTitle.trim()}
                data-testid="button-confirm-edit"
              >
                {editMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export Options</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-2">
            <Accordion type="multiple" defaultValue={exportGroups.map(g => g.id)} className="w-full">
              {exportGroups.map((group) => {
                const groupSelected = group.fields.every(f => selectedExportFields.has(f.id));
                const groupIndeterminate = group.fields.some(f => selectedExportFields.has(f.id)) && !groupSelected;

                return (
                  <AccordionItem key={group.id} value={group.id}>
                    <AccordionTrigger className="py-2 hover:no-underline">
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={groupSelected || (groupIndeterminate ? "indeterminate" : false)}
                            onCheckedChange={() => toggleExportGroup(group)}
                          />
                          <span>{group.label}</span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pl-6 pt-2">
                      <div className="grid grid-cols-1 gap-2">
                        {group.fields.map(field => (
                          <div key={field.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`export-${field.id}`}
                              checked={selectedExportFields.has(field.id)}
                              onCheckedChange={() => toggleExportField(field.id)}
                            />
                            <label
                              htmlFor={`export-${field.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {field.label}
                            </label>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)} disabled={isExporting}>Cancel</Button>
            <Button onClick={handleConfirmExport} disabled={isExporting}>
              {isExporting ? "Exporting..." : "Export"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
