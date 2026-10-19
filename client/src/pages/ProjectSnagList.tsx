import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ClipboardCheck, Plus, ArrowLeft, Filter, AlertTriangle, CheckCircle2,
  Clock, CheckSquare, Image as ImageIcon, MapPin, Layers, User as UserIcon,
  Trash2, Edit, Pencil, AlertCircle, Eye, MoreVertical, LayoutGrid, List, Search,
  FileText, Building2, Target, RotateCcw, Calendar, Printer, FileDown, Upload, Loader2, Database, X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import imageCompression from 'browser-image-compression';
import SnagItemReportDialog from "@/components/snag-item-report-dialog";
import SnagListReportDialog from "@/components/snag-list-report-dialog";
import { ProjectStorageModal } from "@/components/ProjectStorageModal";
import type {
  Project, SnagList, SnagItem, WorkLocation, WorkLevel, Purpose, WorkListDivision
} from "@shared/schema";



const statusConfig: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
  in_progress: { label: "In Progress", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  pending_inspection: { label: "Pending Inspection", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  closed: { label: "Closed & Verified", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  rejected: { label: "Rejected", className: "bg-red-500/10 text-red-600 border-red-500/20" },
};

const formatListNumber = (serialNumber: number | null | undefined) => {
  if (!serialNumber) return "";
  return `SL-${String(serialNumber).padStart(2, "0")}`;
};

const formatItemNumber = (
  item: any,
  allLists: SnagList[],
  allItems: any[]
) => {
  const parentList = allLists.find((l) => l.id === item.snagListId);
  if (!parentList || !parentList.serialNumber) return "";
  
  const listNumStr = `SL-${String(parentList.serialNumber).padStart(2, "0")}`;
  
  // Sort by createdAt ascending to get a stable index
  const listItemsSorted = [...allItems]
    .filter((i) => i.snagListId === item.snagListId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  
  const index = listItemsSorted.findIndex((i) => i.id === item.id);
  if (index === -1) return `${listNumStr}.1`;
  return `${listNumStr}.${index + 1}`;
};

const getItemIndex = (item: any, allItems: any[]) => {
  const listItemsSorted = [...allItems]
    .filter((i) => i.snagListId === item.snagListId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  
  return listItemsSorted.findIndex((i) => i.id === item.id) + 1;
};

const getDaysAgo = (dateStr: string) => {
  const diffTime = Math.abs(new Date().getTime() - new Date(dateStr).getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
};

const locationRoomPresets = [
  "المجلس / الاستقبال",
  "صالة المعيشة",
  "المطبخ الرئيسي",
  "غرفة النوم الرئيسية",
  "غرفة نوم 1",
  "غرفة نوم 2",
  "دورة مياه الرئيسية",
  "دورة مياه الضيوف",
  "ممرات داخلية",
  "الممر الخارجي / المدخل",
  "السلالم / بيت الدرج",
  "السطح / التراس",
  "مواقف السيارات / الحوش",
  "أخرى"
];

const disciplineElements: Record<string, string[]> = {
  Architectural: [
    "الأبواب والتركيبات الخشبية (Doors & Joinery)",
    "النوافذ والواجهات الزجاجية (Windows & Glazing)",
    "الأرضيات والسيراميك/الرخام (Flooring & Tiles)",
    "الأسقف المستعارة والمستويات (False Ceiling)",
    "دهانات الجدران والقصارة (Paint & Plaster)",
    "العزل المائي والحراري (Waterproofing)",
    "الدرابزين والمقابض (Handrails & Balustrades)",
    "الواجهات الخارجية والتلبيس (External Cladding)",
    "عنصر آخر (Other Architectural Element)"
  ],
  "Civil/Structural": [
    "الخرسانات والأعمدة (Concrete & Columns)",
    "المباني والدمك (Masonry & Walls)",
    "الأساسات والأرضيات الخرسانية (Slabs & Foundations)",
    "الشروخ والتماسك (Cracks & Structural Integrity)",
    "عنصر آخر (Other Civil Element)"
  ],
  "MEP - Electrical": [
    "مفاتيح وقوابض الكهرباء (Switches & Sockets)",
    "وحدات الإضاءة (Lighting Fixtures)",
    "لوحات التوزيع الكهربائية (DB Panels)",
    "أنظمة الإنذار والكاميرات (CCTV & Alarm Systems)",
    "التأريض والتوصيلات (Earthing & Wiring)",
    "عنصر آخر (Other Electrical Element)"
  ],
  "MEP - Plumbing": [
    "الأدوات الصحية والمغاسل (Sanitaryware & Basins)",
    "الخلاطات والمحابس (Faucets & Valves)",
    "شبكة التغذية بالماء (Water Supply Piping)",
    "شبكة الصرف الصحي والصفايات (Drainage & Gullies)",
    "سخانات المياه (Water Heaters)",
    "عنصر آخر (Other Plumbing Element)"
  ],
  "MEP - HVAC": [
    "وحدات التكييف والداكت (AC Units & Ductwork)",
    "جريلات وتفتيش التكييف (Grilles & Diffusers)",
    "أنظمة التهوية والشفاطات (Exhaust & Ventilation)",
    "أنظمة التحكم بالحرارة (Thermostats)",
    "عنصر آخر (Other HVAC Element)"
  ]
};

export default function ProjectSnagList() {
  const { projectId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isConsultant = user?.organizationSectorType === "Consultant" || user?.role === "super_admin" || user?.role === "developer_admin";
  const isContractor = user?.organizationSectorType === "Contractor";

  const [selectedListId, setSelectedListId] = useState<string | "all">("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState<string>("");
  useEffect(() => {
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "instant" });
    setSearchQuery("");
  }, [selectedListId]);

  const [createListDialogOpen, setCreateListDialogOpen] = useState(false);
  const [submitListDialogOpen, setSubmitListDialogOpen] = useState(false);
  const [closeListDialogOpen, setCloseListDialogOpen] = useState(false);
  const [createItemDialogOpen, setCreateItemDialogOpen] = useState(false);
  const [editItemDialogOpen, setEditItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [listReportDialogOpen, setListReportDialogOpen] = useState(false);
  const [listReportList, setListReportList] = useState<any | null>(null);
  const [listReportItems, setListReportItems] = useState<any[]>([]);

  const [isProjectStorageOpen, setIsProjectStorageOpen] = useState(false);
  const [storageMode, setStorageMode] = useState<"before" | "after" | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      let fileToUpload = file;
      if (file.type.startsWith("image/") && file.size > 500 * 1024) {
        try {
          fileToUpload = await imageCompression(file, {
            maxSizeMB: 0.5,
            maxWidthOrHeight: 1920,
            useWebWorker: false,
            initialQuality: 0.7
          });
        } catch (error) {
          console.error("Image compression error:", error);
        }
      }

      const uploadResponse = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: fileToUpload.size,
          contentType: fileToUpload.type,
          folder: "images",
          projectId: projectId,
        }),
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(errorText || "Failed to get upload URL");
      }

      const { uploadURL, objectPath } = await uploadResponse.json();

      const putResponse = await fetch(uploadURL, {
        method: "PUT",
        body: fileToUpload,
        headers: { "Content-Type": fileToUpload.type },
      });

      if (!putResponse.ok) {
        throw new Error("Failed to upload image to storage");
      }

      // Register the file in project storage metadata
      try {
        await fetch("/api/save-metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objectKey: objectPath,
            projectId: projectId,
            category: "snag list",
            size: fileToUpload.size,
          }),
        });
      } catch (err) {
        console.error("Failed to save metadata to project storage:", err);
      }

      return objectPath;
    },
    onSuccess: (objectPath) => {
      if (storageMode === "before") {
        setItemBeforeImages(prev => [...prev, objectPath]);
      } else if (storageMode === "after") {
        const updated = [...newAfterImages, objectPath];
        setNewAfterImages(updated);
        if (viewItem) {
          updateStatusMutation.mutate({
            itemId: viewItem.id,
            newStatus: viewItem.status === "open" ? "in_progress" : viewItem.status,
            afterImages: updated,
            resolutionDescription: contractorNotes,
          });
        }
      }
      toast({ title: "Uploaded", description: "Image uploaded successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to upload image", variant: "destructive" });
    },
    onSettled: () => {
      setStorageMode(null);
    }
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, mode: "before" | "after") => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({ title: "Error", description: "Please select an image file", variant: "destructive" });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: "Error", description: "Image must be less than 10MB", variant: "destructive" });
        return;
      }
      setStorageMode(mode);
      uploadImageMutation.mutate(file);
    }
    e.target.value = "";
  };

  // Form states for creating a Snag List
  const [listTitle, setListTitle] = useState("");
  const [listDescription, setListDescription] = useState("");
  const [listLocation, setListLocation] = useState("");
  const [listPurposeId, setListPurposeId] = useState("");
  const [listDate, setListDate] = useState(new Date().toISOString().split("T")[0]);

  // Form states for editing a Snag List
  const [editListDialogOpen, setEditListDialogOpen] = useState(false);
  const [editListId, setEditListId] = useState<string | null>(null);
  const [editListTitle, setEditListTitle] = useState("");
  const [editListDescription, setEditListDescription] = useState("");
  const [editListLocation, setEditListLocation] = useState("");
  const [editListPurposeId, setEditListPurposeId] = useState("");
  const [editListDate, setEditListDate] = useState("");

  // Form states for creating a Snag Item
  const [itemSnagListId, setItemSnagListId] = useState("");
  const [itemTitle, setItemTitle] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemWorkLocationId, setItemWorkLocationId] = useState("");
  const [itemWorkLevelId, setItemWorkLevelId] = useState("");
  const [itemLocationDetails, setItemLocationDetails] = useState("");
  const [itemPurposeId, setItemPurposeId] = useState("");
  const [itemDivisionId, setItemDivisionId] = useState("");
  const [itemBeforeImages, setItemBeforeImages] = useState<string[]>([]);
  const [tempImageUrl, setTempImageUrl] = useState("");

  // Location Picker States
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [buildingFilter, setBuildingFilter] = useState("all-buildings");
  const [floorFilter, setFloorFilter] = useState("all-floors");
  const [partFilter, setPartFilter] = useState("all-parts");
  const [locationSearch, setLocationSearch] = useState("");

  // View Details & Sign-Off State
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    new URLSearchParams(window.location.search).get("itemId")
  );
  const [afterImageUrlInput, setAfterImageUrlInput] = useState("");
  const [newAfterImages, setNewAfterImages] = useState<string[]>([]);
  const [contractorNotes, setContractorNotes] = useState("");
  const lastInitializedItemId = useRef<string | null>(null);

  // Bulk Selection for Consultant Approval
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [batchCloseDialogOpen, setBatchCloseDialogOpen] = useState(false);

  // Queries
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: purposes = [] } = useQuery<Purpose[]>({
    queryKey: ["/api/purposes"],
  });

  const { data: positions = [] } = useQuery<any[]>({
    queryKey: ["/api/positions"],
  });

  const { data: teamMembers = [] } = useQuery<any[]>({
    queryKey: ["/api/team"],
  });

  const { data: userTeamMembers = [] } = useQuery<any[]>({
    queryKey: ["/api/user-team-members"],
  });

  // Filter purposes for user creation/editing modal: PMs/Admins get all purposes, specialized engineers get only their matched purpose + General
  const availablePurposes = useMemo(() => {
    if (!user) return purposes;
    const isManagerOrAdmin = user.role === "super_admin" || user.role === "org_admin" || user.role === "developer_admin";
    if (isManagerOrAdmin) return purposes;

    // Check if user has explicit positions in profile or team members
    const userPosTitles = user.positions || [];
    const managerTitles = ["project manager", "مدير مشروع"];
    const isPM = userPosTitles.some(p => managerTitles.some(title => p.toLowerCase().includes(title)));

    if (isPM) return purposes;

    if (userPosTitles.length > 0 && positions.length > 0) {
      const matchedPurposeIds = positions
        .filter((p: any) => userPosTitles.includes(p.titleEnglish) && p.purposeId)
        .map((p: any) => p.purposeId);

      if (matchedPurposeIds.length > 0) {
        return purposes.filter((p: Purpose) => matchedPurposeIds.includes(p.id));
      }
    }

    // Fallback using team members positions if user.positions is empty
    const myUtms = userTeamMembers.filter((utm: any) => utm.userId === user.id);
    const myTmIds = new Set(myUtms.map((utm: any) => utm.teamMemberId));
    const myTms = teamMembers.filter((tm: any) => myTmIds.has(tm.id));

    const isTmPM = myTms.some((tm: any) => {
      const pos = (tm.position || "").toLowerCase();
      return managerTitles.some(title => pos.includes(title));
    });

    if (isTmPM) return purposes;

    const myPosTitles = new Set(myTms.map((tm: any) => tm.position).filter(Boolean));
    if (myPosTitles.size > 0 && positions.length > 0) {
      const matchedPurposeIds = positions
        .filter((pos: any) => myPosTitles.has(pos.titleEnglish) && pos.purposeId)
        .map((pos: any) => pos.purposeId);

      if (matchedPurposeIds.length > 0) {
        return purposes.filter((p: Purpose) => matchedPurposeIds.includes(p.id));
      }
    }

    return purposes;
  }, [user, purposes, positions, teamMembers, userTeamMembers]);

  const { data: divisions = [] } = useQuery<WorkListDivision[]>({
    queryKey: ["/api/work-list-divisions"],
  });

  const { data: snagLists = [], isLoading: listsLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "snag-lists"],
    enabled: !!projectId,
    select: (lists) => isContractor ? lists.filter((l) => l.status !== "draft") : lists,
  });

  const selectedList = useMemo(() => {
    if (selectedListId === "all") return null;
    return snagLists.find((l) => l.id === selectedListId) || null;
  }, [snagLists, selectedListId]);

  const { data: allSnagItems = [], isLoading: itemsLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "snag-items"],
    enabled: !!projectId,
    select: (items) => isContractor ? items.filter((i) => i.listStatus !== "draft") : items,
  });

  const { data: workLocations = [] } = useQuery<WorkLocation[]>({
    queryKey: ["/api/projects", projectId, "work-locations"],
    enabled: !!projectId,
  });

  const buildings = useMemo(() => Array.from(new Set(workLocations.map((l: WorkLocation) => l.buildingNo).filter(Boolean))), [workLocations]);
  const floors = useMemo(() => Array.from(new Set(workLocations.map((l: WorkLocation) => l.floor).filter(Boolean))), [workLocations]);
  const parts = useMemo(() => Array.from(new Set(workLocations.map((l: WorkLocation) => l.part).filter(Boolean))), [workLocations]);

  const filteredWorkLocations = useMemo(() => {
    return workLocations.filter((loc: WorkLocation) => {
      const matchesBuilding = !buildingFilter || buildingFilter === "all-buildings" || loc.buildingNo === buildingFilter;
      const matchesFloor = !floorFilter || floorFilter === "all-floors" || loc.floor === floorFilter;
      const matchesPart = !partFilter || partFilter === "all-parts" || loc.part === partFilter;

      if (!matchesBuilding || !matchesFloor || !matchesPart) return false;

      if (!locationSearch) return true;

      const search = locationSearch.toLowerCase();
      return (
        (loc.unitCustomNumber?.toLowerCase().includes(search)) ||
        (loc.unitZone?.toLowerCase().includes(search)) ||
        (loc.unitBlock?.toLowerCase().includes(search)) ||
        (loc.buildingNo?.toLowerCase().includes(search)) ||
        (loc.floor?.toLowerCase().includes(search)) ||
        (loc.part?.toLowerCase().includes(search)) ||
        (loc.unitDescription?.toLowerCase().includes(search))
      );
    });
  }, [workLocations, buildingFilter, floorFilter, partFilter, locationSearch]);

  const { data: workLevels = [] } = useQuery<WorkLevel[]>({
    queryKey: ["/api/projects", projectId, "work-levels"],
    enabled: !!projectId,
  });

  const viewItem = allSnagItems.find((item) => item.id === selectedItemId);
  const itemParentList = viewItem ? snagLists.find((l) => l.id === viewItem.snagListId) : null;

  // Sync state with back/forward browser navigation
  useEffect(() => {
    const handlePopState = () => {
      setSelectedItemId(new URLSearchParams(window.location.search).get("itemId"));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (selectedItemId !== lastInitializedItemId.current) {
      if (viewItem) {
        setNewAfterImages(viewItem.afterImages || []);
        setContractorNotes(viewItem.resolutionDescription || "");
        lastInitializedItemId.current = selectedItemId;
      } else {
        setNewAfterImages([]);
        setContractorNotes("");
        if (selectedItemId === null) {
          lastInitializedItemId.current = null;
        }
      }
      setAfterImageUrlInput("");
    }
  }, [selectedItemId, viewItem]);

  const handleNavigateToItem = (itemId: string | null) => {
    setSelectedItemId(itemId);
    const params = new URLSearchParams(window.location.search);
    if (itemId) {
      params.set("itemId", itemId);
    } else {
      params.delete("itemId");
    }
    const newSearch = params.toString();
    const newPath = window.location.pathname + (newSearch ? `?${newSearch}` : "");
    window.history.pushState({}, "", newPath);
  };

  // Create Snag List Mutation
  const createListMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/snag-lists`, {
        title: listTitle,
        description: listDescription,
        location: listLocation,
        purposeId: (!listPurposeId || listPurposeId === "none") ? null : listPurposeId,
        listDate: listDate || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "snag-lists"] });
      setCreateListDialogOpen(false);
      setListTitle("");
      setListDescription("");
      setListLocation("");
      setListPurposeId("");
      setListDate(new Date().toISOString().split("T")[0]);
      toast({ title: "Created", description: "Snag list group created successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create list group", variant: "destructive" });
    },
  });

  // Update Snag List Mutation
  const updateListMutation = useMutation({
    mutationFn: async () => {
      if (!editListId) return;
      const res = await apiRequest("PATCH", `/api/snag-lists/${editListId}`, {
        title: editListTitle,
        description: editListDescription,
        location: editListLocation,
        purposeId: editListPurposeId || undefined,
        listDate: editListDate || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "snag-lists"] });
      setEditListDialogOpen(false);
      setEditListId(null);
      setEditListTitle("");
      setEditListLocation("");
      setEditListDescription("");
      setEditListPurposeId("");
      setEditListDate("");
      toast({ title: "Updated", description: "Snag list group updated successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update list group", variant: "destructive" });
    },
  });

  // Delete Snag List Mutation
  const deleteListMutation = useMutation({
    mutationFn: async (listId: string) => {
      await apiRequest("DELETE", `/api/snag-lists/${listId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "snag-lists"] });
      setSelectedListId("all");
      toast({ title: "Deleted", description: "Snag list group deleted successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to delete list group", variant: "destructive" });
    },
  });

  // Submit Snag List Mutation
  const submitListMutation = useMutation({
    mutationFn: async (listId: string) => {
      const res = await apiRequest("PATCH", `/api/snag-lists/${listId}`, {
        status: "in_progress",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "snag-lists"] });
      toast({ title: "Submitted", description: "Snag list submitted and locked successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to submit list", variant: "destructive" });
    },
  });

  // Close Snag List Mutation
  const closeListMutation = useMutation({
    mutationFn: async (listId: string) => {
      const res = await apiRequest("PATCH", `/api/snag-lists/${listId}`, {
        status: "completed",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "snag-lists"] });
      toast({ title: "Closed", description: "Snag list closed successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to close list", variant: "destructive" });
    },
  });

  // Create Snag Item Mutation
  const createItemMutation = useMutation({
    mutationFn: async () => {
      const targetListId = itemSnagListId || (selectedListId !== "all" ? selectedListId : snagLists[0]?.id ?? "");
      if (!targetListId) throw new Error("Please select or create a snag list first");

      const parentList = snagLists.find(l => l.id === targetListId);
      const effectivePurposeId = itemPurposeId || parentList?.purposeId || parentList?.purpose?.id || undefined;

      const res = await apiRequest("POST", `/api/snag-lists/${targetListId}/items`, {
        title: itemTitle,
        description: itemDescription,
        category: "architectural",
        priority: "medium",
        workLocationId: itemWorkLocationId || undefined,
        workLevelId: itemWorkLevelId || undefined,
        locationDetails: itemLocationDetails || undefined,
        purposeId: effectivePurposeId,
        divisionId: itemDivisionId || undefined,
        beforeImages: itemBeforeImages,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "snag-items"] });
      setCreateItemDialogOpen(false);
      setItemTitle("");
      setItemDescription("");
      setItemLocationDetails("");
      setItemPurposeId("");
      setItemDivisionId("");
      setItemBeforeImages([]);
      setTempImageUrl("");
      toast({ title: "Added", description: "Snag item recorded successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to add snag item", variant: "destructive" });
    },
  });

  // Update Status & Sign-off Mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ itemId, newStatus, afterImages, resolutionDescription }: { itemId: string; newStatus: string; afterImages?: string[]; resolutionDescription?: string }) => {
      const payload: any = { status: newStatus };
      if (afterImages) payload.afterImages = afterImages;
      if (resolutionDescription !== undefined) payload.resolutionDescription = resolutionDescription;
      const res = await apiRequest("PATCH", `/api/snag-items/${itemId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "snag-items"] });
      toast({ title: "Updated", description: "Snag item status updated successfully" });
    },
  });

  // Update Snag Item Details Mutation
  const updateItemDetailsMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      title: string;
      description?: string;
      workLocationId?: string;
      workLevelId?: string;
      locationDetails?: string;
      purposeId?: string;
      divisionId?: string;
      beforeImages?: string[];
    }) => {
      const res = await apiRequest("PATCH", `/api/snag-items/${payload.id}`, {
        title: payload.title,
        description: payload.description || null,
        workLocationId: payload.workLocationId || null,
        workLevelId: payload.workLevelId || null,
        locationDetails: payload.locationDetails || null,
        purposeId: payload.purposeId || null,
        divisionId: payload.divisionId || null,
        beforeImages: payload.beforeImages,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "snag-items"] });
      setEditItemDialogOpen(false);
      setEditingItem(null);
      toast({ title: "Updated", description: "Snag item details updated successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update snag item", variant: "destructive" });
    },
  });

  // Batch Close Mutation for Consultants
  const batchCloseMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      try {
        const res = await fetch("/api/snag-items/batch-close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemIds,
            comment: "Bulk sign-off and closed by consultant",
          }),
          credentials: "include",
        });

        const contentType = res.headers.get("content-type") || "";
        if (res.ok && contentType.includes("application/json")) {
          return await res.json();
        }
      } catch (err) {
        console.warn("Batch endpoint unavailable, falling back to individual updates:", err);
      }

      // Resilient fallback: update each item individually
      const results = await Promise.all(
        itemIds.map(async (id) => {
          const itemRes = await apiRequest("PATCH", `/api/snag-items/${id}`, {
            status: "closed",
          });
          return itemRes.json();
        })
      );
      return { success: true, count: results.length, items: results };
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "snag-items"] });
      setSelectedItemIds([]);
      setBatchCloseDialogOpen(false);
      toast({
        title: "Bulk Sign-off Successful",
        description: `Successfully approved and closed ${data?.count ?? selectedItemIds.length} defect(s)`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message || "Failed to close selected defects",
        variant: "destructive",
      });
    },
  });

  const userPurposeIds = useMemo(() => new Set(availablePurposes.map((p) => p.id)), [availablePurposes]);
  const isSpecializedUser = useMemo(() => {
    return isConsultant && availablePurposes.length > 0 && availablePurposes.length < purposes.length;
  }, [isConsultant, availablePurposes, purposes]);

  const filteredItems = allSnagItems.filter((item) => {
    if (selectedListId !== "all" && item.snagListId !== selectedListId) return false;
    if (filterStatus !== "all" && item.status !== filterStatus) return false;

    // Filter items in General lists for specialized engineers
    if (isSpecializedUser) {
      const parentList = snagLists.find((l) => l.id === item.snagListId);
      const isParentGeneral = !parentList?.purposeId || parentList?.purposeId === "none";
      if (isParentGeneral) {
        const itemPurposeId = item.purposeId || item.purpose?.id;
        if (itemPurposeId && itemPurposeId !== "none" && !userPurposeIds.has(itemPurposeId)) {
          return false;
        }
      }
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const titleMatch = item.title?.toLowerCase().includes(query);
      const descMatch = item.description?.toLowerCase().includes(query);
      const locationMatch = item.locationDetails?.toLowerCase().includes(query) || 
                            item.workLocation?.unitDescription?.toLowerCase().includes(query);
      if (!titleMatch && !descMatch && !locationMatch) return false;
    }
    return true;
  });

  // Pending Inspection items available for batch sign-off
  const pendingInspectionItems = useMemo(() => {
    return filteredItems.filter((i) => i.status === "pending_inspection");
  }, [filteredItems]);

  const allPendingSelected = useMemo(() => {
    return pendingInspectionItems.length > 0 && pendingInspectionItems.every((i) => selectedItemIds.includes(i.id));
  }, [pendingInspectionItems, selectedItemIds]);

  const somePendingSelected = useMemo(() => {
    return pendingInspectionItems.some((i) => selectedItemIds.includes(i.id)) && !allPendingSelected;
  }, [pendingInspectionItems, selectedItemIds, allPendingSelected]);

  // Stats calculation
  const listItemsForStats = selectedListId === "all" 
    ? allSnagItems 
    : allSnagItems.filter((i) => i.snagListId === selectedListId);

  const totalItems = listItemsForStats.length;
  const openItems = listItemsForStats.filter((i) => i.status === "open").length;
  const pendingItems = listItemsForStats.filter((i) => i.status === "pending_inspection" || i.status === "in_progress").length;
  const closedItems = listItemsForStats.filter((i) => i.status === "closed").length;
  const unclosedItemsCount = listItemsForStats.filter((i) => i.status !== "closed" && i.status !== "rejected").length;

  if (viewItem) {
    const statusInfo = statusConfig[viewItem.status] || statusConfig.open;
    const projectTitle = project?.name || "Project";

    return (
      <div className="flex flex-col bg-slate-50/30 dark:bg-transparent min-h-screen">
        {/* Sticky Header */}
        <div className="flex flex-col border-b bg-background sticky top-0 z-20">
          <div className="flex items-center justify-between p-3 md:p-4 min-h-[4rem] gap-2">
            <div className="flex items-center gap-1 md:gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 md:h-10 px-2 md:px-3 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => handleNavigateToItem(null)}
              >
                <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 md:mr-2" />
                <span className="text-xs md:text-sm font-bold hidden xs:inline">Back</span>
              </Button>
              <div className="flex items-center gap-2 md:gap-3 ml-1 md:ml-2">
                <span className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-black rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/50 uppercase tracking-wide shrink-0">
                  {formatItemNumber(viewItem, snagLists, allSnagItems)}
                </span>
                <span className="font-black text-sm md:text-lg tracking-tight truncate max-w-[200px] md:max-w-none">
                  {viewItem.title}
                </span>
              </div>
            </div>

            {/* Centered Project Name */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none hidden xl:flex">
              <Badge
                variant="secondary"
                className="px-6 py-2.5 flex items-center gap-3 border-none bg-muted/50 text-foreground rounded-full shadow-md"
              >
                <Building2 className="w-5 h-5 text-muted-foreground" />
                <span className="text-base font-bold tracking-tight uppercase truncate max-w-[300px]">
                  {projectTitle}
                </span>
              </Badge>
            </div>

            <div className="flex items-center gap-2 md:gap-4 ml-auto">
              <Badge variant="outline" className={`px-2.5 py-0.5 md:py-1 text-[10px] md:text-xs font-black shadow-sm ${statusInfo.className}`}>
                {statusInfo.label}
              </Badge>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 md:h-10 md:w-10"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "snag-items"] });
                  toast({ title: "Refreshed", description: "Snag item details updated." });
                }}
              >
                <RotateCcw className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </Button>
            </div>
          </div>

          {/* Mobile Project Bar */}
          <div className="xl:hidden px-4 pb-3 flex items-center">
            <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-lg w-full">
              <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-black uppercase tracking-tight truncate text-foreground/70">
                {projectTitle}
              </span>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
              {/* 1. Snag Details / Info Card */}
              <Card className="rounded-[1.5rem] border border-border/40 shadow-sm overflow-hidden bg-white dark:bg-card/50">
                <CardHeader className="p-6 pb-4 border-b">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                      <CardTitle className="text-base font-bold">Snag Details</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      {viewItem.purpose && (
                        <Badge variant="secondary" className="text-xs font-bold gap-1 py-1 px-3 bg-muted/60 text-muted-foreground border">
                          @ {viewItem.purpose.code || "PURP"} - {viewItem.purpose.nameEnglish || viewItem.purpose.nameArabic}
                        </Badge>
                      )}
                      {isConsultant && (!itemParentList || itemParentList.status === "draft") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted"
                          onClick={() => {
                            setEditingItem(viewItem);
                            setItemTitle(viewItem.title);
                            setItemDescription(viewItem.description || "");
                            setItemWorkLocationId(viewItem.workLocationId || "");
                            setItemWorkLevelId(viewItem.workLevelId || "");
                            setItemLocationDetails(viewItem.locationDetails || "");
                            setItemPurposeId(viewItem.purposeId || "");
                            setItemDivisionId(viewItem.divisionId || "");
                            setItemBeforeImages(viewItem.beforeImages || []);
                            setEditItemDialogOpen(true);
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {/* Detailed Snag Box */}
                  <div className="relative overflow-hidden bg-rose-500/5 border border-rose-500/10 rounded-[1.5rem] p-5 shadow-sm">
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-700">
                          DETAILED SNAG
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-rose-700 tracking-tight">
                        {viewItem.title}
                      </h3>
                    </div>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-6 bg-muted/20 p-5 rounded-[1.5rem] border border-muted-foreground/10">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 p-2 bg-background rounded-full border shadow-sm flex items-center justify-center shrink-0">
                        <Layers className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">DIVISION</p>
                        <p className="text-sm font-semibold leading-tight mt-0.5">
                          {viewItem.division?.nameEnglish || viewItem.division?.nameArabic || "—"}
                        </p>
                      </div>
                    </div>



                    <div className="flex items-start gap-3">
                      <div className="mt-1 p-2 bg-background rounded-full border shadow-sm flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">CREATED DATE</p>
                        <p className="text-sm font-semibold leading-tight mt-0.5">
                          {format(new Date(viewItem.createdAt), "dd MMM yyyy")}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="mt-1 p-2 bg-background rounded-full border shadow-sm flex items-center justify-center shrink-0">
                        <Layers className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">WORK LEVELS</p>
                        <div className="mt-1">
                          {viewItem.workLevel ? (
                            <span className="inline-block bg-muted/65 border border-muted-foreground/20 px-2 py-0.5 rounded text-xs font-semibold">
                              {viewItem.workLevel.nameEnglish || viewItem.workLevel.nameArabic}
                            </span>
                          ) : (
                            <span className="text-sm font-semibold leading-tight mt-0.5">—</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="mt-1 p-2 bg-background rounded-full border shadow-sm flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">BUILDING NO.</p>
                        <p className="text-sm font-semibold leading-tight mt-0.5">
                          {viewItem.workLocation?.buildingNo || "—"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="mt-1 p-2 bg-background rounded-full border shadow-sm flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">UNITS</p>
                        <p className="text-sm font-semibold leading-tight mt-0.5">
                          {viewItem.workLocation?.unitCustomNumber ? `Unit ${viewItem.workLocation.unitCustomNumber}` : "—"}
                        </p>
                      </div>
                    </div>

                    {viewItem.locationDetails && (
                      <div className="flex items-start gap-3 col-span-full">
                        <div className="mt-1 p-2 bg-background rounded-full border shadow-sm flex items-center justify-center shrink-0">
                          <AlertCircle className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">EXACT LOCATION DETAILS</p>
                          <p className="text-sm font-semibold leading-tight mt-0.5 italic text-muted-foreground">
                            {viewItem.locationDetails}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>


            </div>

            <div className="lg:col-span-1 space-y-4">
              {/* Status & Actions */}
              <Card className="rounded-[1.2rem] border border-border/40 shadow-sm overflow-hidden bg-white dark:bg-card/50">
                <CardHeader className="p-4 pb-3 border-b">
                  <div className="flex items-start gap-3">
                    <CheckSquare className="w-5 h-5 text-muted-foreground mt-0.5" />
                    <div>
                      <CardTitle className="text-base font-bold">Actions & Status</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4 py-1 border-b pb-3">
                    <Label className="text-xs text-muted-foreground font-semibold shrink-0">Current Status</Label>
                    <Badge variant="outline" className={`${statusConfig[viewItem.status]?.className || statusConfig.open.className} text-xs px-2.5 py-0.5 font-bold rounded-full border`}>
                      {statusConfig[viewItem.status]?.label || viewItem.status}
                    </Badge>
                  </div>

                  {isConsultant && viewItem.status === "pending_inspection" && (
                    <div className="pt-2 space-y-3">
                      <p className="text-xs text-muted-foreground leading-normal">
                        Contractor has submitted repair photos. Verify resolution or request revision if defect fix is incomplete.
                      </p>
                      <div className="flex flex-col gap-2">
                        <Button
                          size="lg"
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 shadow-md rounded-[1rem] transition-all"
                          onClick={() => {
                            updateStatusMutation.mutate({
                              itemId: viewItem.id,
                              newStatus: "closed",
                              afterImages: newAfterImages,
                              resolutionDescription: contractorNotes,
                            });
                          }}
                        >
                          <CheckCircle2 className="w-5 h-5" />
                          Sign-off & Close Defect
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full border-rose-200 hover:bg-rose-50 text-rose-700 font-semibold gap-2 rounded-[1rem]"
                          onClick={() => {
                            updateStatusMutation.mutate({
                              itemId: viewItem.id,
                              newStatus: "open",
                              afterImages: newAfterImages,
                              resolutionDescription: contractorNotes,
                            });
                          }}
                        >
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                          Reject Fix & Request Revision
                        </Button>
                      </div>
                    </div>
                  )}

                  {isConsultant && (viewItem.status === "open" || viewItem.status === "in_progress") && (
                    <div className="pt-2">
                      <div className="flex items-center gap-2 p-3 bg-amber-500/5 rounded-xl border border-amber-500/10 text-xs text-amber-700 font-medium leading-relaxed">
                        <Clock className="w-4 h-4 shrink-0 text-amber-600" />
                        Defect issued to Contractor. Waiting for Contractor repair and photo submission.
                      </div>
                    </div>
                  )}

                  {isContractor && viewItem.status !== "closed" && viewItem.status !== "pending_inspection" && (
                    <div className="pt-2 space-y-3">
                      {(!contractorNotes.trim() || newAfterImages.length === 0) ? (
                        <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-xs text-amber-700 font-medium leading-relaxed">
                          Please enter an action description and upload at least one repair photo above. The submit button will appear once both are provided.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Repair description and photos added successfully. Ready for submission:
                          </p>
                          <Button
                            size="lg"
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2 shadow-md rounded-[1rem] transition-all"
                            disabled={updateStatusMutation.isPending}
                            onClick={() => {
                              updateStatusMutation.mutate({
                                itemId: viewItem.id,
                                newStatus: "pending_inspection",
                                afterImages: newAfterImages,
                                resolutionDescription: contractorNotes,
                              });
                            }}
                          >
                            <CheckCircle2 className="w-5 h-5" />
                            {updateStatusMutation.isPending ? "Submitting..." : "Submit for Inspection"}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {viewItem.status === "pending_inspection" && !isConsultant && (
                    <div className="pt-2">
                      <div className="flex items-center gap-2 p-3 bg-blue-500/5 rounded-xl border border-blue-500/10 text-xs text-blue-700 font-medium">
                        <Clock className="w-4 h-4 shrink-0 text-blue-600" />
                        Submitted. Waiting for Consultant verification.
                      </div>
                    </div>
                  )}

                  {viewItem.status === "closed" && (
                    <div className="pt-2">
                      <div className="flex items-center gap-2 p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10 text-xs text-emerald-700 font-medium">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                        Verified and signed off.
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Audit Card */}
              <Card className="rounded-[1.2rem] border border-border/40 shadow-sm overflow-hidden bg-white dark:bg-card/50">
                <CardHeader className="p-4 pb-3 border-b">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-muted-foreground mt-0.5" />
                    <div>
                      <CardTitle className="text-base font-bold">Audit Records</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-3 text-xs">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-muted-foreground font-semibold">Date Created</span>
                      <span className="font-bold text-foreground">
                        {format(new Date(viewItem.createdAt), "yyyy-MM-dd HH:mm")}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-muted-foreground font-semibold">Last Updated</span>
                      <span className="font-bold text-foreground">
                        {format(new Date(viewItem.updatedAt || viewItem.createdAt), "yyyy-MM-dd HH:mm")}
                      </span>
                    </div>

                    {viewItem.closedAt && (
                      <div className="flex justify-between items-center py-2 border-b text-emerald-600 dark:text-emerald-500">
                        <span className="font-semibold">Closed At</span>
                        <span className="font-bold">
                          {format(new Date(viewItem.closedAt), "yyyy-MM-dd HH:mm")}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                {/* 2. Before Fix (Consultant) */}
              <Card className="rounded-[1.5rem] border border-border/40 shadow-sm overflow-hidden bg-white dark:bg-card/50">
                <CardHeader className="p-6 pb-4 border-b bg-rose-500/5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5" />
                    <div>
                      <CardTitle className="text-base font-bold">Before Fix (Consultant)</CardTitle>
                      <CardDescription className="text-xs">Defect description and photos captured during inspection</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {/* Defect Description */}
                  {viewItem.description && (
                    <div className="relative overflow-hidden bg-rose-500/5 border border-rose-500/10 rounded-[1.5rem] p-5 shadow-sm">
                      <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-700">
                            DETAILED DESCRIPTION
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-rose-700/80 leading-relaxed whitespace-pre-wrap">
                          {viewItem.description}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Before Images */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-rose-700 flex items-center gap-1.5 uppercase tracking-wider">
                      <ImageIcon className="w-4 h-4" />
                      Inspection Photos
                    </h4>
                    {viewItem.beforeImages && viewItem.beforeImages.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {viewItem.beforeImages.map((img: string, idx: number) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setPreviewImageUrl(img)}
                            className="block group relative w-full h-32 rounded-[1rem] overflow-hidden border bg-muted shadow-sm hover:shadow transition-shadow focus:outline-none"
                          >
                            <img
                              src={img}
                              alt={`Before Fix ${idx + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300">
                              <Eye className="w-6 h-6 text-white" />
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 border border-dashed rounded-[1rem]">
                        <ImageIcon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">No photos before fix</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 3. After Fix (Contractor) */}
              <Card className="rounded-[1.5rem] border border-border/40 shadow-sm overflow-hidden bg-white dark:bg-card/50">
                <CardHeader className="p-6 pb-4 border-b bg-emerald-500/5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                    <div>
                      <CardTitle className="text-base font-bold">After Fix (Contractor)</CardTitle>
                      <CardDescription className="text-xs">Contractor's resolution description and photos of the fix</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {/* Contractor Notes / Resolution Description */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-emerald-700 flex items-center gap-1.5 uppercase tracking-wider">
                      <FileText className="w-4 h-4" />
                      Resolution Description
                    </h4>
                    {isContractor && viewItem.status !== "closed" ? (
                      <div className="space-y-3">
                        <Label className="text-xs text-muted-foreground font-semibold">Describe the repair / fix details *</Label>
                        <Textarea
                          placeholder="Enter details about how the defect was resolved..."
                          className="min-h-[100px] rounded-xl"
                          value={contractorNotes}
                          onChange={(e) => setContractorNotes(e.target.value)}
                          onBlur={(e) => {
                            if (e.target.value !== (viewItem.resolutionDescription || "")) {
                              updateStatusMutation.mutate({
                                itemId: viewItem.id,
                                newStatus: viewItem.status === "open" ? "in_progress" : viewItem.status,
                                afterImages: newAfterImages,
                                resolutionDescription: e.target.value,
                              });
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div className="bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/10 text-sm font-medium whitespace-pre-wrap leading-relaxed">
                        {viewItem.resolutionDescription || "No resolution details provided yet."}
                      </div>
                    )}
                  </div>

                  {/* After Images */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-emerald-700 flex items-center gap-1.5 uppercase tracking-wider">
                      <ImageIcon className="w-4 h-4" />
                      Resolution Photos
                    </h4>
                    {isContractor && viewItem.status !== "closed" && (
                      <div className="flex gap-2 mb-3">
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleImageUpload(e, "after")}
                            disabled={uploadImageMutation.isPending && storageMode === "after"}
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="h-9 text-xs px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            asChild
                            disabled={uploadImageMutation.isPending && storageMode === "after"}
                          >
                            <span>
                              {uploadImageMutation.isPending && storageMode === "after" ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Upload className="w-4 h-4 mr-2" />
                              )}
                              Add Photo
                            </span>
                          </Button>
                        </label>
                      </div>
                    )}

                    {newAfterImages.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {newAfterImages.map((img: string, idx: number) => (
                          <div
                            key={idx}
                            className="relative group w-full h-32 rounded-[1rem] overflow-hidden border bg-muted shadow-sm"
                          >
                            <img src={img} alt={`After Fix ${idx + 1}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-all">
                              <button
                                type="button"
                                onClick={() => setPreviewImageUrl(img)}
                                className="bg-white/90 text-slate-800 rounded-full p-1.5 hover:bg-white transition-colors focus:outline-none"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {isContractor && viewItem.status !== "closed" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = newAfterImages.filter((_, i) => i !== idx);
                                    setNewAfterImages(updated);
                                    updateStatusMutation.mutate({
                                      itemId: viewItem.id,
                                      newStatus: viewItem.status === "open" ? "in_progress" : viewItem.status,
                                      afterImages: updated,
                                      resolutionDescription: contractorNotes,
                                    });
                                  }}
                                  className="bg-red-600 text-white rounded-full p-1.5 hover:bg-red-700 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 border border-dashed rounded-[1rem]">
                        <CheckCircle2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">No resolution photos attached yet</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              </div>
        </div>
        {/* Edit Snag Item Dialog */}
        <Dialog open={editItemDialogOpen} onOpenChange={setEditItemDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-rose-600" />
                Edit Snag Item
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
              <div className="space-y-1 md:col-span-2">
                <Label>Defect Title *</Label>
                <Input
                  placeholder="e.g., Scratch on right side wall paint or water leak..."
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1 flex flex-col justify-end">
                <Label className="mb-1">Work Location</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                  onClick={() => setLocationPickerOpen(true)}
                >
                  <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                  {itemWorkLocationId ? (
                    (() => {
                      const loc = workLocations.find(l => l.id === itemWorkLocationId);
                      if (!loc) return "Select location";
                      const labelParts = [
                        loc.unitCustomNumber ? `Unit ${loc.unitCustomNumber}` : null,
                        loc.buildingNo ? `Bldg ${loc.buildingNo}` : null,
                        loc.unitZone ? `Zone ${loc.unitZone}` : null,
                        loc.unitCluster ? `Cluster ${loc.unitCluster}` : null,
                        loc.unitBlock ? `Block ${loc.unitBlock}` : null,
                        loc.flatNo ? `Flat ${loc.flatNo}` : null,
                        loc.unitDescription,
                      ].filter(Boolean);
                      return labelParts.length > 0 ? labelParts.join(" - ") : `Location ${loc.unitCustomNumber || ''}`;
                    })()
                  ) : (
                    "Select location"
                  )}
                </Button>
              </div>

              <div className="space-y-1">
                <Label>Work Level</Label>
                <Select value={itemWorkLevelId} onValueChange={setItemWorkLevelId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select level/floor" />
                  </SelectTrigger>
                  <SelectContent>
                    {workLevels.map((lvl) => (
                      <SelectItem key={lvl.id} value={lvl.id}>
                        {lvl.nameEnglish || lvl.nameArabic || lvl.code || lvl.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 md:col-span-2">
                <Label>Exact Location Details (Room / Wall / Corner)</Label>
                <Input
                  placeholder="e.g., Room 302 - East wall behind the door"
                  value={itemLocationDetails}
                  onChange={(e) => setItemLocationDetails(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>Purpose (Optional)</Label>
                <Select value={itemPurposeId} onValueChange={setItemPurposeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    {purposes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nameEnglish || p.nameArabic || p.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Division</Label>
                <Select value={itemDivisionId} onValueChange={setItemDivisionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select division" />
                  </SelectTrigger>
                  <SelectContent>
                    {divisions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.nameEnglish || d.nameArabic || d.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 md:col-span-2">
                <Label>Defect Description & Details</Label>
                <Textarea
                  placeholder="Write a detailed description of the defect to be repaired..."
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2 border-t pt-3 mt-2">
                <Label className="flex items-center gap-1.5 font-bold text-foreground">
                  <ImageIcon className="w-4 h-4 text-rose-600" />
                  Inspection Photos (Before Fix)
                </Label>
                <div className="flex gap-2">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageUpload(e, "before")}
                      disabled={uploadImageMutation.isPending && storageMode === "before"}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      asChild
                      disabled={uploadImageMutation.isPending && storageMode === "before"}
                    >
                      <span>
                        {uploadImageMutation.isPending && storageMode === "before" ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        Add Photo
                      </span>
                    </Button>
                  </label>
                </div>

                {itemBeforeImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {itemBeforeImages.map((imgUrl, idx) => (
                      <div key={idx} className="relative group w-20 h-20 rounded-lg overflow-hidden border">
                        <img src={imgUrl} alt="Before Fix" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setItemBeforeImages(itemBeforeImages.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                className="bg-rose-600 hover:bg-rose-700 text-white"
                onClick={() => {
                  if (editingItem) {
                    updateItemDetailsMutation.mutate({
                      id: editingItem.id,
                      title: itemTitle,
                      description: itemDescription,
                      workLocationId: itemWorkLocationId,
                      workLevelId: itemWorkLevelId,
                      locationDetails: itemLocationDetails,
                      purposeId: itemPurposeId,
                      divisionId: itemDivisionId,
                      beforeImages: itemBeforeImages,
                    });
                  }
                }}
                disabled={!itemTitle.trim() || updateItemDetailsMutation.isPending}
              >
                {updateItemDetailsMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ProjectStorageModal
          projectId={projectId!}
          isOpen={isProjectStorageOpen}
          onClose={() => setIsProjectStorageOpen(false)}
          onSelect={(selections) => {
            if (selections.length > 0) {
              const urls = selections.map(s => s.document.fileUrl || s.document.fileData);
              if (storageMode === 'before') {
                setItemBeforeImages(prev => [...prev, ...urls]);
              } else if (storageMode === 'after') {
                const updated = [...newAfterImages, ...urls];
                setNewAfterImages(updated);
                if (viewItem) {
                  updateStatusMutation.mutate({
                    itemId: viewItem.id,
                    newStatus: viewItem.status === "open" ? "in_progress" : viewItem.status,
                    afterImages: updated,
                    resolutionDescription: contractorNotes,
                  });
                }
              }
            }
            setIsProjectStorageOpen(false);
          }}
          multiSelect={true}
          skipLabels={true}
        />

        <Dialog open={!!previewImageUrl} onOpenChange={(open) => !open && setPreviewImageUrl(null)}>
          <DialogContent className="max-w-fit p-0 overflow-visible bg-transparent border-none shadow-none [&>button]:hidden">
            <div className="relative max-w-full max-h-[85vh] flex items-center justify-center">
              {previewImageUrl && (
                <>
                  <img
                    src={previewImageUrl}
                    alt="Preview"
                    className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                  />
                  <button
                    type="button"
                    onClick={() => setPreviewImageUrl(null)}
                    className="fixed top-4 right-4 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors shadow-lg border border-white/20 z-50 focus:outline-none"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent px-6 lg:px-10 pt-4 pb-8 space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="relative flex flex-wrap items-center justify-between gap-4 min-h-[44px]">
        <div className="flex items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (selectedListId !== "all") {
                setSelectedListId("all");
              } else {
                navigate(`/projects/${projectId}`);
              }
            }}
            className="rounded-full gap-2 text-xs h-9 px-4 font-bold border-muted-foreground/20 hover:bg-muted/50 bg-white dark:bg-muted/10 shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-semibold">
              {selectedListId !== "all" ? "Back to Lists" : "Back to Project"}
            </span>
          </Button>
        </div>

        <div className="md:absolute md:left-1/2 md:-translate-x-1/2 flex items-center gap-2 justify-center w-full md:w-auto mt-2 md:mt-0">
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            <ClipboardCheck className="w-7 h-7 text-rose-600" />
            Snag List
          </h1>
        </div>

        <div className="flex items-center gap-2 ml-auto md:ml-0">
          {/* New Snag List Dialog */}
          {isConsultant && selectedListId === "all" && (
            <Dialog open={createListDialogOpen} onOpenChange={setCreateListDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create New List
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Create Snag List Group</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1">
                    <Label>List Title *</Label>
                    <Input
                      placeholder="e.g., Initial Handover Inspection - Building A"
                      value={listTitle}
                      onChange={(e) => setListTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Description</Label>
                    <Textarea
                      placeholder="General notes about the inspection..."
                      value={listDescription}
                      onChange={(e) => setListDescription(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Specialty / Purpose</Label>
                    <Select value={listPurposeId} onValueChange={setListPurposeId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select list purpose / specialty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">General</SelectItem>
                        {availablePurposes.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nameEnglish || p.nameArabic || p.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>List Date</Label>
                    <Input
                      type="date"
                      value={listDate}
                      onChange={(e) => setListDate(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => createListMutation.mutate()}
                    disabled={!listTitle.trim() || createListMutation.isPending}
                  >
                    {createListMutation.isPending ? "Creating..." : "Save List"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {isConsultant && selectedListId !== "all" && selectedList?.status === "draft" && (
            <Dialog open={createItemDialogOpen} onOpenChange={(open) => {
              setCreateItemDialogOpen(open);
              if (open) {
                setItemSnagListId(selectedListId);
                // Pre-fill item purpose from parent list if available
                const targetList = snagLists.find((l) => l.id === selectedListId);
                if (targetList?.purposeId || targetList?.purpose?.id) {
                  setItemPurposeId(targetList.purposeId || targetList.purpose.id);
                }
              }
            }}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-rose-600 hover:bg-rose-700 text-white">
                  <Plus className="w-4 h-4" />
                  Add Snag Item
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                    Report Field Defect / Snag Item
                  </DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">


                  <div className="space-y-1 md:col-span-2">
                    <Label>Defect Title *</Label>
                    <Input
                      placeholder="e.g., Scratch on right side wall paint or water leak..."
                      value={itemTitle}
                      onChange={(e) => setItemTitle(e.target.value)}
                    />
                  </div>

                  {/* Work Location dropdown from system */}
                   <div className="space-y-1 flex flex-col justify-end">
                     <Label className="mb-1">Work Location</Label>
                     <Button
                       type="button"
                       variant="outline"
                       className="w-full justify-start text-left font-normal"
                       onClick={() => setLocationPickerOpen(true)}
                     >
                       <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                       {itemWorkLocationId ? (
                         (() => {
                           const loc = workLocations.find(l => l.id === itemWorkLocationId);
                           if (!loc) return "Select location";
                           const labelParts = [
                             loc.unitCustomNumber ? `Unit ${loc.unitCustomNumber}` : null,
                             loc.buildingNo ? `Bldg ${loc.buildingNo}` : null,
                             loc.unitZone ? `Zone ${loc.unitZone}` : null,
                             loc.unitCluster ? `Cluster ${loc.unitCluster}` : null,
                             loc.unitBlock ? `Block ${loc.unitBlock}` : null,
                             loc.flatNo ? `Flat ${loc.flatNo}` : null,
                             loc.unitDescription,
                           ].filter(Boolean);
                           return labelParts.length > 0 ? labelParts.join(" - ") : `Location ${loc.unitCustomNumber || ''}`;
                         })()
                       ) : (
                         "Select location"
                       )}
                     </Button>
                   </div>

                  {/* Work Level dropdown from system */}
                  <div className="space-y-1">
                    <Label>Work Level</Label>
                    <Select value={itemWorkLevelId} onValueChange={setItemWorkLevelId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select level/floor" />
                      </SelectTrigger>
                      <SelectContent>
                        {workLevels.map((lvl) => (
                          <SelectItem key={lvl.id} value={lvl.id}>
                            {lvl.nameEnglish || lvl.nameArabic || lvl.code || lvl.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <Label>Exact Location Details (Room / Wall / Corner)</Label>
                    <Input
                      placeholder="e.g., Room 302 - East wall behind the door"
                      value={itemLocationDetails}
                      onChange={(e) => setItemLocationDetails(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>Specialty / Purpose</Label>
                    {(() => {
                      const currentList = snagLists.find((l) => l.id === selectedListId);
                      const hasParentPurpose = Boolean(currentList?.purposeId || currentList?.purpose?.id);
                      return (
                        <Select 
                          value={itemPurposeId} 
                          onValueChange={setItemPurposeId}
                          disabled={hasParentPurpose}
                        >
                          <SelectTrigger className={hasParentPurpose ? "bg-muted cursor-not-allowed opacity-90 font-semibold" : ""}>
                            <SelectValue placeholder="Select purpose" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">General</SelectItem>
                            {availablePurposes.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.nameEnglish || p.nameArabic || p.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                  </div>

                  <div className="space-y-1">
                    <Label>Division</Label>
                    <Select value={itemDivisionId} onValueChange={setItemDivisionId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select division" />
                      </SelectTrigger>
                      <SelectContent>
                        {divisions.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.nameEnglish || d.nameArabic || d.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <Label>Defect Description & Details</Label>
                    <Textarea
                      placeholder="Write a detailed description of the defect to be repaired..."
                      value={itemDescription}
                      onChange={(e) => setItemDescription(e.target.value)}
                    />
                  </div>

                  {/* Before Images Section */}
                  <div className="space-y-2 md:col-span-2 border-t pt-3 mt-2">
                    <Label className="flex items-center gap-1.5 font-bold text-foreground">
                      <ImageIcon className="w-4 h-4 text-rose-600" />
                      Inspection Photos (Before Fix)
                    </Label>
                    <div className="flex gap-2">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageUpload(e, "before")}
                          disabled={uploadImageMutation.isPending && storageMode === "before"}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          asChild
                          disabled={uploadImageMutation.isPending && storageMode === "before"}
                        >
                          <span>
                            {uploadImageMutation.isPending && storageMode === "before" ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Upload className="w-4 h-4 mr-2" />
                            )}
                            Add Photo
                          </span>
                        </Button>
                      </label>
                    </div>

                    {itemBeforeImages.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {itemBeforeImages.map((imgUrl, idx) => (
                          <div key={idx} className="relative group w-20 h-20 rounded-lg overflow-hidden border">
                            <img src={imgUrl} alt="Before Fix" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setItemBeforeImages(itemBeforeImages.filter((_, i) => i !== idx))}
                              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                    onClick={() => createItemMutation.mutate()}
                    disabled={!itemTitle.trim() || createItemMutation.isPending}
                  >
                    {createItemMutation.isPending ? "Saving..." : "Save Defect"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Selected List Detail Banner */}
      {selectedList && (
        <Card className="border-r-4 border-r-rose-600 bg-white dark:bg-muted/10 shadow-sm border-none">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1.5 flex-grow">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2 flex-wrap">
                  {selectedList.serialNumber && (
                    <span className="inline-flex items-center justify-center px-2.5 py-0.5 text-xs font-extrabold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/50 uppercase tracking-wide shrink-0">
                      {formatListNumber(selectedList.serialNumber)}
                    </span>
                  )}
                  <span>{selectedList.title}</span>
                  <Badge variant="outline" className={`text-xs px-2.5 py-0.5 font-bold rounded-full border shrink-0 ${
                    selectedList.status === "draft" 
                      ? "bg-slate-500/10 text-slate-600 border-slate-500/20" 
                      : selectedList.status === "in_progress"
                        ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                        : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                  }`}>
                    {selectedList.status === "draft" ? "Draft" : selectedList.status === "in_progress" ? "Submitted" : "Closed"}
                  </Badge>
                </h2>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  {selectedList.purpose && (
                    <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 hover:bg-purple-500/10 border-purple-500/20 text-[10px] font-bold">
                      <Target className="w-3 h-3 mr-1" />
                      {selectedList.purpose.nameEnglish || selectedList.purpose.nameArabic || selectedList.purpose.code}
                    </Badge>
                  )}
                  <span className="flex items-center gap-1 text-xs text-muted-foreground font-semibold">
                    <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    {format(new Date(selectedList.listDate || selectedList.createdAt), "yyyy-MM-dd")}
                  </span>
                </div>
                {selectedList.description && (
                  <p className="text-base text-muted-foreground whitespace-pre-wrap mt-1 leading-relaxed max-w-3xl">
                    {selectedList.description}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-1 shrink-0">

                {isConsultant && selectedList.status === "draft" && listItemsForStats.length > 0 && (
                  <Button
                    variant="default"
                    size="sm"
                    className="h-9 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm bg-blue-600 hover:bg-blue-700 text-white border-none"
                    onClick={() => setSubmitListDialogOpen(true)}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Submit List</span>
                  </Button>
                )}

                {isConsultant && selectedList.status === "in_progress" && (
                  <Button
                    variant="default"
                    size="sm"
                    className="h-9 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white border-none disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={unclosedItemsCount > 0}
                    title={unclosedItemsCount > 0 ? `يوجد ${unclosedItemsCount} ملاحظة لم يتم إغلاقها بعد` : undefined}
                    onClick={() => {
                      if (unclosedItemsCount > 0) {
                        toast({
                          title: "لا يمكن إغلاق القائمة",
                          description: `يوجد ${unclosedItemsCount} ملاحظة لم يتم إغلاقها بعد. يرجى إغلاق جميع الملاحظات أولاً.`,
                          variant: "destructive",
                        });
                        return;
                      }
                      setCloseListDialogOpen(true);
                    }}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Close List</span>
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm border-slate-200 text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setListReportList(selectedList);
                    setListReportItems(listItemsForStats);
                    setListReportDialogOpen(true);
                  }}
                >
                  <Printer className="w-4 h-4" />
                  <span>Print List Report</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 rounded-xl border-none shadow-sm bg-white dark:bg-muted/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-semibold">Total Defects</p>
              <p className="text-2xl font-black mt-1 text-foreground">{totalItems}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-gray-500/10 flex items-center justify-center text-gray-600">
              <CheckSquare className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 rounded-xl border-none shadow-sm bg-white dark:bg-muted/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-rose-600 font-semibold">Open Defects</p>
              <p className="text-2xl font-black mt-1 text-rose-600">{openItems}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-600">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 rounded-xl border-none shadow-sm bg-white dark:bg-muted/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-amber-600 font-semibold">In Progress / Review</p>
              <p className="text-2xl font-black mt-1 text-amber-600">{pendingItems}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 rounded-xl border-none shadow-sm bg-white dark:bg-muted/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-emerald-600 font-semibold">Closed & Verified</p>
              <p className="text-2xl font-black mt-1 text-emerald-600">{closedItems}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {selectedListId === "all" ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Layers className="w-5 h-5 text-rose-600" />
              Available Inspection & Snag Lists
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-semibold">Total Lists: {snagLists.length}</span>
              <div className="flex items-center bg-muted/60 p-1 rounded-full border shadow-sm shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 w-7 p-0 rounded-full transition-all ${viewMode === "list" ? "bg-white dark:bg-muted shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setViewMode("list")}
                >
                  <List className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 w-7 p-0 rounded-full transition-all ${viewMode === "grid" ? "bg-white dark:bg-muted shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {listsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse h-48 bg-white dark:bg-muted/10" />
              ))}
            </div>
          ) : snagLists.length === 0 ? (
            <Card className="p-12 text-center border-2 border-dashed bg-white dark:bg-muted/10">
              <div className="max-w-md mx-auto space-y-4">
                <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-600 mx-auto">
                  <ClipboardCheck className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-foreground">No Snag Lists yet</h3>
                <p className="text-sm text-muted-foreground">
                  Start by creating a new snag list group to start reporting defects and notes for this project.
                </p>
                <Button onClick={() => setCreateListDialogOpen(true)} className="gap-2 bg-rose-600 hover:bg-rose-700 text-white mx-auto">
                  <Plus className="w-4 h-4" />
                  Create New List
                </Button>
              </div>
            </Card>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {snagLists.map((list) => {
                const listItems = allSnagItems.filter((item) => item.snagListId === list.id);
                const openCount = listItems.filter((i) => i.status === "open").length;
                const inProgressCount = listItems.filter((i) => i.status === "in_progress" || i.status === "pending_inspection").length;
                const closedCount = listItems.filter((i) => i.status === "closed").length;
                const isListClosed = list.status === "closed" || list.status === "completed";

                return (
                  <Card
                    key={list.id}
                    onClick={() => setSelectedListId(list.id)}
                    className={`hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[14rem] shadow-sm ${
                      list.status === "draft"
                        ? "bg-slate-50/60 dark:bg-slate-900/30 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-400"
                        : isListClosed
                          ? "bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50 hover:border-emerald-300"
                          : "bg-white dark:bg-muted/10 border border-slate-200/80 dark:border-slate-800 hover:border-rose-500/20"
                    }`}
                  >
                    <CardHeader className="pb-3 space-y-3">
                      {/* Top Row: Serial Badge (Left), Purpose Badge (Center), Status & Action Menu (Right) */}
                      <div className="flex items-center justify-between gap-2 w-full">
                        <div className="flex items-center shrink-0">
                          {list.serialNumber && (
                            <span className="inline-flex items-center justify-center h-6 px-2.5 text-xs font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/50 uppercase tracking-wide shrink-0">
                              {formatListNumber(list.serialNumber)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-center flex-1 min-w-0">
                          {list.purpose ? (
                            <span className="inline-flex items-center gap-1.5 h-6 px-2.5 text-xs font-bold rounded-full bg-amber-100/90 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 border border-amber-300/80 dark:border-amber-700/60 truncate shadow-xs">
                              <Target className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                              <span className="truncate">
                                {list.purpose.code || list.purpose.nameEnglish || list.purpose.nameArabic}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 h-6 px-2.5 text-xs font-bold rounded-full bg-slate-200/80 dark:bg-slate-700/80 text-slate-800 dark:text-slate-100 border border-slate-300/60 dark:border-slate-600 truncate">
                              <Target className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300 shrink-0" />
                              <span className="truncate">General</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`inline-flex items-center justify-center h-6 px-2.5 text-xs font-bold rounded-full border ${
                            list.status === "draft" 
                              ? "bg-slate-500/10 text-slate-600 border-slate-500/20" 
                              : list.status === "in_progress"
                                ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          }`}>
                            {list.status === "draft" ? "Draft" : list.status === "in_progress" ? "Submitted" : "Closed"}
                          </span>
                          {isConsultant && list.status === "draft" && (
                            <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 hover:bg-muted rounded-full"
                                  >
                                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-32">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditListId(list.id);
                                      setEditListTitle(list.title);
                                      setEditListLocation(list.location || "");
                                      setEditListPurposeId(list.purposeId || list.purpose?.id || "");
                                      setEditListDescription(list.description || "");
                                      setEditListDate(list.listDate ? new Date(list.listDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);
                                      setEditListDialogOpen(true);
                                    }}
                                    className="gap-2 cursor-pointer text-blue-600 focus:text-blue-600 focus:bg-blue-50/50"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                    <span>Edit</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      if (confirm("Are you sure you want to delete this snag list? All associated defects will be permanently deleted.")) {
                                        deleteListMutation.mutate(list.id);
                                      }
                                    }}
                                    className="gap-2 cursor-pointer text-rose-600 focus:text-rose-600 focus:bg-rose-50/50"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Second Row: List Title */}
                      <CardTitle className="text-base font-bold text-foreground leading-snug break-words line-clamp-2">
                        {list.title}
                      </CardTitle>

                      {/* Third Row: Location (if available) */}
                      {list.location && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-semibold">
                          <MapPin className="w-3 h-3 text-rose-600 shrink-0" />
                          {list.location}
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="pb-4 flex-grow">
                      <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed break-words">
                        {list.description || "No description provided."}
                      </p>
                    </CardContent>
                    <div className="border-t px-6 py-3 bg-muted/20 flex items-center justify-between text-xs rounded-b-xl">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 font-bold text-rose-600">
                          <span className="w-2 h-2 rounded-full bg-rose-600" />
                          {openCount} Open
                        </span>
                        <span className="flex items-center gap-1 font-bold text-amber-600">
                          <span className="w-2 h-2 rounded-full bg-amber-600" />
                          {inProgressCount} In Progress
                        </span>
                        <span className="flex items-center gap-1 font-bold text-emerald-600">
                          <span className="w-2 h-2 rounded-full bg-emerald-600" />
                          {closedCount} Closed
                        </span>
                      </div>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-semibold shrink-0">
                        <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        {format(new Date(list.listDate || list.createdAt), "yyyy-MM-dd")}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {snagLists.map((list) => {
                const listItems = allSnagItems.filter((item) => item.snagListId === list.id);
                const openCount = listItems.filter((i) => i.status === "open").length;
                const inProgressCount = listItems.filter((i) => i.status === "in_progress" || i.status === "pending_inspection").length;
                const closedCount = listItems.filter((i) => i.status === "closed").length;

                return (
                  <Card
                    key={list.id}
                    onClick={() => setSelectedListId(list.id)}
                    className="hover:shadow-sm hover:border-rose-500/20 transition-all duration-200 cursor-pointer flex flex-col md:flex-row md:items-center justify-between p-4 bg-white dark:bg-muted/10 border-none shadow-sm gap-4"
                  >
                    <div className="flex items-start gap-3 flex-grow min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-600 shrink-0 mt-0.5">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div className="space-y-1 min-w-0 flex-grow">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-foreground flex items-center gap-2 flex-wrap min-w-0">
                            {list.serialNumber && (
                              <span className="inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/50 uppercase tracking-wide shrink-0">
                                {formatListNumber(list.serialNumber)}
                              </span>
                            )}
                            <span className="truncate">{list.title}</span>
                            {list.purpose ? (
                              <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 hover:bg-purple-500/10 border-purple-500/20 text-[9px] font-bold px-1.5 py-0 shrink-0">
                                {list.purpose.nameEnglish || list.purpose.nameArabic || list.purpose.code}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-slate-500/10 text-slate-600 dark:text-slate-300 hover:bg-slate-500/10 border-slate-500/20 text-[9px] font-bold px-1.5 py-0 shrink-0">
                                General
                              </Badge>
                            )}
                          </h3>
                          <Badge variant="outline" className={`text-xs px-2.5 py-0.5 font-bold rounded-full border shrink-0 ${
                            list.status === "draft" 
                              ? "bg-slate-500/10 text-slate-600 border-slate-500/20" 
                              : list.status === "in_progress"
                                ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          }`}>
                            {list.status === "draft" ? "Draft" : list.status === "in_progress" ? "Submitted" : "Closed"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {list.location && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-semibold">
                              <MapPin className="w-3 h-3 text-rose-600 shrink-0" />
                              {list.location}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-semibold">
                            <Clock className="w-3 h-3 text-rose-600 shrink-0" />
                            {format(new Date(list.listDate || list.createdAt), "yyyy-MM-dd")}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1 leading-relaxed">
                          {list.description || "No description provided."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-6 shrink-0 border-t md:border-t-0 pt-3 md:pt-0">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 font-bold text-rose-600 bg-rose-500/5 px-2 py-0.5 rounded-full">
                          {openCount} Open
                        </span>
                        <span className="flex items-center gap-1 font-bold text-amber-600 bg-amber-500/5 px-2 py-0.5 rounded-full">
                          {inProgressCount} In Progress
                        </span>
                        <span className="flex items-center gap-1 font-bold text-emerald-600 bg-emerald-500/5 px-2 py-0.5 rounded-full">
                          {closedCount} Closed
                        </span>
                      </div>

                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-muted rounded-full text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          title="Print List Report"
                          onClick={() => {
                            setListReportList(list);
                            setListReportItems(listItems);
                            setListReportDialogOpen(true);
                          }}
                        >
                          <Printer className="w-4 h-4" />
                        </Button>

                        {isConsultant && list.status === "draft" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 hover:bg-muted rounded-full"
                              >
                                <MoreVertical className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-32">
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditListId(list.id);
                                  setEditListTitle(list.title);
                                  setEditListLocation(list.location || "");
                                  setEditListDescription(list.description || "");
                                  setEditListDate(list.listDate ? new Date(list.listDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);
                                  setEditListDialogOpen(true);
                                }}
                                className="gap-2 cursor-pointer text-blue-600 focus:text-blue-600 focus:bg-blue-50/50"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  if (confirm("Are you sure you want to delete this snag list? All associated defects will be permanently deleted.")) {
                                    deleteListMutation.mutate(list.id);
                                  }
                                }}
                                className="gap-2 cursor-pointer text-rose-600 focus:text-rose-600 focus:bg-rose-50/50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Filters Bar */}
          <Card className="p-4 rounded-xl border-none shadow-sm bg-white dark:bg-muted/10">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 h-8 w-[180px] text-xs rounded-full bg-white dark:bg-muted/10 border-muted-foreground/20 focus-visible:ring-rose-500"
                  />
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full gap-1.5 text-xs h-8 px-4 font-bold border-muted-foreground/20 hover:bg-muted/50 bg-white dark:bg-muted/10 shadow-sm"
                    >
                      <Filter className="w-3.5 h-3.5" />
                      Filter
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuRadioGroup value={filterStatus} onValueChange={setFilterStatus}>
                      <DropdownMenuRadioItem value="all" className="text-xs cursor-pointer">
                        All Statuses
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="open" className="text-xs cursor-pointer">
                        Open
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="in_progress" className="text-xs cursor-pointer">
                        In Progress
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="pending_inspection" className="text-xs cursor-pointer">
                        Pending Inspection
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="closed" className="text-xs cursor-pointer">
                        Closed & Verified
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="rejected" className="text-xs cursor-pointer">
                        Rejected
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                {(filteredItems.length !== (allSnagItems.filter(i => i.snagListId === selectedListId).length) || searchQuery.trim() !== "") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterStatus("all");
                      setSearchQuery("");
                    }}
                    className="text-xs h-8 rounded-full"
                  >
                    Reset Filters
                  </Button>
                )}

                {isConsultant && pendingInspectionItems.length > 0 && (
                  <Button
                    variant={allPendingSelected ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (allPendingSelected) {
                        setSelectedItemIds((prev) => prev.filter((id) => !pendingInspectionItems.some((i) => i.id === id)));
                      } else {
                        const newIds = pendingInspectionItems.map((i) => i.id);
                        setSelectedItemIds((prev) => Array.from(new Set([...prev, ...newIds])));
                      }
                    }}
                    className={`text-xs h-8 rounded-full font-semibold gap-1.5 transition-all shadow-sm ${
                      allPendingSelected
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "border-blue-300 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    {allPendingSelected ? "Deselect Pending" : `Select Pending Inspection (${pendingInspectionItems.length})`}
                  </Button>
                )}
              </div>

              <div className="flex items-center bg-muted/60 p-1 rounded-full border shadow-sm shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 w-7 p-0 rounded-full transition-all ${viewMode === "list" ? "bg-white dark:bg-muted shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setViewMode("list")}
                >
                  <List className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 w-7 p-0 rounded-full transition-all ${viewMode === "grid" ? "bg-white dark:bg-muted shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>

          {/* Main Table or Grid */}
          {viewMode === "list" ? (
            <Card className="rounded-xl border-none shadow-sm overflow-hidden bg-white dark:bg-muted/10">
              <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  {isConsultant && (
                    <TableHead className="w-[45px] px-3">
                      <Checkbox
                        checked={allPendingSelected ? true : somePendingSelected ? "indeterminate" : false}
                        disabled={pendingInspectionItems.length === 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            const newIds = pendingInspectionItems.map((i) => i.id);
                            setSelectedItemIds((prev) => Array.from(new Set([...prev, ...newIds])));
                          } else {
                            setSelectedItemIds((prev) => prev.filter((id) => !pendingInspectionItems.some((i) => i.id === id)));
                          }
                        }}
                        aria-label="Select all pending inspection defects"
                      />
                    </TableHead>
                  )}
                  <TableHead className="w-[250px]">Defect / Note</TableHead>
                  <TableHead>Location & Level</TableHead>
                  <TableHead>Work Purpose</TableHead>
                  <TableHead>Division</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-left">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isConsultant ? 7 : 6} className="text-center py-10 text-muted-foreground">
                      No defects match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => {
                    const statusInfo = statusConfig[item.status] || statusConfig.open;
                    const isItemSelected = selectedItemIds.includes(item.id);

                    return (
                      <TableRow key={item.id} className={cn("hover:bg-muted/20 transition-colors", isItemSelected && "bg-blue-50/40 dark:bg-blue-950/20")}>
                        {isConsultant && (
                          <TableCell className="px-3" onClick={(e) => e.stopPropagation()}>
                            {item.status === "pending_inspection" ? (
                              <Checkbox
                                checked={isItemSelected}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedItemIds((prev) => [...prev, item.id]);
                                  } else {
                                    setSelectedItemIds((prev) => prev.filter((id) => id !== item.id));
                                  }
                                }}
                                aria-label={`Select defect ${item.title}`}
                              />
                            ) : (
                              <span className="w-4 h-4 block" />
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/50 uppercase tracking-wide shrink-0">
                              {formatItemNumber(item, snagLists, allSnagItems)}
                            </span>
                            <span className="font-bold text-foreground">{item.title}</span>
                          </div>
                          {item.description && (
                            <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {item.description}
                            </div>
                          )}
                          {((item.beforeImages && item.beforeImages.length > 0) || (item.afterImages && item.afterImages.length > 0)) && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              {item.beforeImages && item.beforeImages.length > 0 && (
                                <Badge variant="secondary" className="text-[10px] gap-1 px-1.5 py-0 bg-rose-500/10 text-rose-600">
                                  <ImageIcon className="w-3 h-3" />
                                  Before: {item.beforeImages.length} photos
                                </Badge>
                              )}
                              {item.afterImages && item.afterImages.length > 0 && (
                                <Badge variant="secondary" className="text-[10px] gap-1 px-1.5 py-0 bg-emerald-500/10 text-emerald-600">
                                  <ImageIcon className="w-3 h-3" />
                                  After: {item.afterImages.length} photos
                                </Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs space-y-0.5">
                            {item.workLocation && (
                              <div className="flex items-center gap-1 text-foreground">
                                <MapPin className="w-3 h-3 text-blue-500" />
                                {[
                                  item.workLocation.unitCustomNumber ? `Unit ${item.workLocation.unitCustomNumber}` : null,
                                  item.workLocation.buildingNo ? `Bldg ${item.workLocation.buildingNo}` : null,
                                  item.workLocation.unitZone ? `Zone ${item.workLocation.unitZone}` : null,
                                  item.workLocation.unitDescription,
                                ].filter(Boolean).join(" - ")}
                              </div>
                            )}
                            {item.workLevel && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Layers className="w-3 h-3 text-purple-500" />
                                {item.workLevel.nameEnglish || item.workLevel.nameArabic || item.workLevel.code}
                              </div>
                            )}
                            {item.locationDetails && (
                              <div className="text-[11px] text-muted-foreground italic">
                                {item.locationDetails}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.purpose ? (
                            <Badge variant="secondary" className="text-[11px] bg-blue-500/10 text-blue-600 font-semibold block w-fit">
                              {item.purpose.nameEnglish || item.purpose.nameArabic || item.purpose.code}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">General</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.division ? (
                            <Badge variant="secondary" className="text-[11px] bg-purple-500/10 text-purple-600 font-semibold block w-fit">
                              {item.division.nameEnglish || item.division.nameArabic || item.division.code}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusInfo.className}>
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-left">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              title="View Details & Compare"
                              onClick={() => {
                                handleNavigateToItem(item.id);
                              }}
                            >
                              <Eye className="w-4 h-4 text-blue-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
          ) : (
            filteredItems.length === 0 ? (
              <Card className="p-12 text-center border-2 border-dashed bg-white dark:bg-muted/10">
                <div className="max-w-md mx-auto space-y-4">
                  <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-600 mx-auto">
                    <ClipboardCheck className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">No defects match the current filters</h3>
                  <p className="text-sm text-muted-foreground">
                    Try resetting your status filter to show all snag items.
                  </p>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredItems.map((item) => {
                  const statusInfo = statusConfig[item.status] || statusConfig.open;
                  const hasImages = (item.beforeImages && item.beforeImages.length > 0) || (item.afterImages && item.afterImages.length > 0);
                  const coverImage = item.beforeImages?.[0] || item.afterImages?.[0];
                  const isItemSelected = selectedItemIds.includes(item.id);

                  return (
                    <Card
                      key={item.id}
                      onClick={() => handleNavigateToItem(item.id)}
                      className={cn(
                        "relative hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden bg-white dark:bg-muted/10 border-none shadow-sm h-full cursor-pointer group",
                        isItemSelected && "ring-2 ring-emerald-500 dark:ring-emerald-400"
                      )}
                    >
                      {isConsultant && item.status === "pending_inspection" && (
                        <div 
                          className="absolute top-3 left-3 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-lg p-1.5 shadow-md border border-slate-200 dark:border-slate-700 flex items-center justify-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isItemSelected}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedItemIds((prev) => [...prev, item.id]);
                              } else {
                                setSelectedItemIds((prev) => prev.filter((id) => id !== item.id));
                              }
                            }}
                            aria-label={`Select defect ${item.title}`}
                          />
                        </div>
                      )}

                      <div className="flex-grow flex flex-col">
                        {coverImage && (
                          <div className="w-full h-40 overflow-hidden relative bg-muted flex items-center justify-center shrink-0">
                            <img
                              src={coverImage}
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"
                            />
                          </div>
                        )}

                        <div className="p-5 flex flex-col justify-between flex-grow">
                          <div>
                            {/* Top Row: #Index Code */}
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                                <span>#{getItemIndex(item, allSnagItems)}</span>
                                <span className="text-amber-600 dark:text-amber-500 font-mono">{formatItemNumber(item, snagLists, allSnagItems)}</span>
                              </span>
                            </div>

                            {/* Sub-header: Division / Purpose */}
                            <div className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground/80 mb-2 truncate">
                              {item.division?.nameEnglish || item.division?.nameArabic || "GENERAL"} / {item.purpose?.nameEnglish || item.purpose?.nameArabic || "INSPECTION"}
                            </div>

                            {/* Title */}
                            <h3 className="text-sm font-bold text-foreground leading-snug line-clamp-2 mb-2">
                              {item.title}
                            </h3>

                            {/* Description */}
                            {item.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-3">
                                {item.description}
                              </p>
                            )}

                            {/* Location Info */}
                            {item.workLocation && (
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-semibold mb-1">
                                <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span className="truncate">
                                  {[
                                    item.workLocation.unitCustomNumber ? `Unit ${item.workLocation.unitCustomNumber}` : null,
                                    item.workLocation.buildingNo ? `Bldg ${item.workLocation.buildingNo}` : null,
                                    item.workLocation.unitZone ? `Zone ${item.workLocation.unitZone}` : null,
                                  ].filter(Boolean).join(" - ")}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="mt-auto">
                            <hr className="border-t border-border/40 my-3" />

                            {/* Bottom Row: Status Badge & Days Ago */}
                            <div className="flex items-center justify-between text-xs pt-1">
                              <Badge variant="outline" className={`${statusInfo.className} text-[10px] px-2.5 py-0.5 rounded-full font-bold`}>
                                {statusInfo.label}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground font-semibold">
                                {getDaysAgo(item.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}



      {/* Edit Snag List Dialog */}
      <Dialog open={editListDialogOpen} onOpenChange={setEditListDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Snag List Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>List Title *</Label>
              <Input
                placeholder="e.g., Initial Handover Inspection - Building A"
                value={editListTitle}
                onChange={(e) => setEditListTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                placeholder="General notes about the inspection..."
                value={editListDescription}
                onChange={(e) => setEditListDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Specialty / Purpose</Label>
              <Select value={editListPurposeId} onValueChange={setEditListPurposeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select list purpose / specialty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General</SelectItem>
                  {availablePurposes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nameEnglish || p.nameArabic || p.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>List Date</Label>
              <Input
                type="date"
                value={editListDate}
                onChange={(e) => setEditListDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => updateListMutation.mutate()}
              disabled={!editListTitle.trim() || updateListMutation.isPending}
            >
              {updateListMutation.isPending ? "Updating..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewItem && (
        <SnagItemReportDialog
          open={reportDialogOpen}
          onOpenChange={setReportDialogOpen}
          item={viewItem}
          project={project}
          listNumber={selectedList ? formatListNumber(selectedList.serialNumber) : ""}
          itemNumber={formatItemNumber(viewItem, snagLists, allSnagItems)}
        />
      )}

      {listReportList && (
        <SnagListReportDialog
          open={listReportDialogOpen}
          onOpenChange={setListReportDialogOpen}
          list={listReportList}
          items={listReportItems}
          project={project}
        />
      )}

      <ProjectStorageModal
        projectId={projectId!}
        isOpen={isProjectStorageOpen}
        onClose={() => setIsProjectStorageOpen(false)}
        onSelect={(selections) => {
          if (selections.length > 0) {
            const urls = selections.map(s => s.document.fileUrl || s.document.fileData);
            if (storageMode === 'before') {
              setItemBeforeImages(prev => [...prev, ...urls]);
            } else if (storageMode === 'after') {
              const updated = [...newAfterImages, ...urls];
              setNewAfterImages(updated);
              if (viewItem) {
                updateStatusMutation.mutate({
                  itemId: viewItem.id,
                  newStatus: viewItem.status === "open" ? "in_progress" : viewItem.status,
                  afterImages: updated,
                  resolutionDescription: contractorNotes,
                });
              }
            }
          }
          setIsProjectStorageOpen(false);
        }}
        multiSelect={true}
        skipLabels={true}
      />

      <Dialog open={!!previewImageUrl} onOpenChange={(open) => !open && setPreviewImageUrl(null)}>
        <DialogContent className="max-w-fit p-0 overflow-visible bg-transparent border-none shadow-none [&>button]:hidden">
          <div className="relative max-w-full max-h-[85vh] flex items-center justify-center">
            {previewImageUrl && (
              <>
                <img
                  src={previewImageUrl}
                  alt="Preview"
                  className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                />
                <button
                  type="button"
                  onClick={() => setPreviewImageUrl(null)}
                  className="fixed top-4 right-4 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors shadow-lg border border-white/20 z-50 focus:outline-none"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {selectedList && (
        <Dialog open={submitListDialogOpen} onOpenChange={setSubmitListDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-600">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                Submit Snag List
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to submit this list? You will not be able to add or edit items in it once submitted.
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setSubmitListDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                onClick={() => {
                  submitListMutation.mutate(selectedList.id, {
                    onSuccess: () => {
                      setSubmitListDialogOpen(false);
                    }
                  });
                }}
                disabled={submitListMutation.isPending}
              >
                {submitListMutation.isPending ? "Submitting..." : "Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {selectedList && (
        <Dialog open={closeListDialogOpen} onOpenChange={setCloseListDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600">
                <AlertTriangle className="w-5 h-5 text-emerald-600" />
                Close Snag List
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to close this snag list? No further updates can be made to this list or its defects.
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setCloseListDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                onClick={() => {
                  if (unclosedItemsCount > 0) {
                    toast({
                      title: "لا يمكن إغلاق القائمة",
                      description: `يوجد ${unclosedItemsCount} ملاحظة لم يتم إغلاقها بعد. يرجى إغلاق جميع الملاحظات أولاً.`,
                      variant: "destructive",
                    });
                    setCloseListDialogOpen(false);
                    return;
                  }
                  closeListMutation.mutate(selectedList.id, {
                    onSuccess: () => {
                      setCloseListDialogOpen(false);
                    }
                  });
                }}
                disabled={closeListMutation.isPending || unclosedItemsCount > 0}
              >
                {closeListMutation.isPending ? "Closing..." : "Close List"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Floating Bulk Actions Bar for Consultants */}
      {isConsultant && selectedItemIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white backdrop-blur-md px-5 py-3 rounded-2xl shadow-2xl border border-slate-700/60 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 min-w-[1.5rem] px-1.5 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white shadow-sm">
              {selectedItemIds.length}
            </span>
            <span className="text-sm font-semibold whitespace-nowrap">
              Defects selected for sign-off
            </span>
          </div>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl"
              onClick={() => setSelectedItemIds([])}
            >
              Clear Selection
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 rounded-xl shadow-md transition-all"
              onClick={() => setBatchCloseDialogOpen(true)}
            >
              <CheckCircle2 className="w-4 h-4" />
              Sign-off & Close Selected ({selectedItemIds.length})
            </Button>
          </div>
        </div>
      )}

      {/* Batch Sign-off & Close Dialog */}
      <Dialog open={batchCloseDialogOpen} onOpenChange={setBatchCloseDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600 font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Batch Sign-off & Close Defects
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3 text-sm text-muted-foreground leading-relaxed">
            <p>
              You are about to sign off and close <strong className="text-foreground font-bold">{selectedItemIds.length}</strong> repaired defect(s) in Pending Inspection.
            </p>
            <div className="p-3.5 bg-emerald-500/10 dark:bg-emerald-950/30 rounded-xl border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed font-medium">
              ✓ All selected defects will be immediately marked as <strong>Closed & Verified</strong> with your consultant sign-off details, timestamp, and audit trail recorded.
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setBatchCloseDialogOpen(false)}
              disabled={batchCloseMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 shadow-sm"
              disabled={batchCloseMutation.isPending}
              onClick={() => batchCloseMutation.mutate(selectedItemIds)}
            >
              {batchCloseMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm Sign-off & Close ({selectedItemIds.length})
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Select Location Dialog */}
      <Dialog open={locationPickerOpen} onOpenChange={setLocationPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select Work Location</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Building</Label>
                <Select value={buildingFilter} onValueChange={setBuildingFilter}>
                  <SelectTrigger className="h-8 shadow-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-buildings">All Buildings</SelectItem>
                    {buildings.map(b => <SelectItem key={b} value={b || ""}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Floor</Label>
                <Select value={floorFilter} onValueChange={setFloorFilter}>
                  <SelectTrigger className="h-8 shadow-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-floors">All Floors</SelectItem>
                    {floors.map(f => <SelectItem key={f} value={f || ""}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Part</Label>
                <Select value={partFilter} onValueChange={setPartFilter}>
                  <SelectTrigger className="h-8 shadow-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-parts">All Parts</SelectItem>
                    {parts.map(p => <SelectItem key={p} value={p || ""}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Search & Select Location</Label>
                {itemWorkLocationId && (
                  <Button
                    variant="ghost"
                    type="button"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => setItemWorkLocationId("")}
                  >
                    Deselect Location
                  </Button>
                )}
              </div>
              <Command className="border rounded-md shadow-sm" shouldFilter={false}>
                <CommandInput
                  placeholder="Search unit, zone, block..."
                  value={locationSearch}
                  onValueChange={setLocationSearch}
                />
                <CommandList className="max-h-[300px]">
                  <CommandEmpty>No locations found.</CommandEmpty>
                  <CommandGroup>
                    {filteredWorkLocations.map((location: WorkLocation) => {
                      const isSelected = itemWorkLocationId === location.id;
                      return (
                        <CommandItem
                          key={location.id}
                          value={`${location.unitCustomNumber} ${location.unitZone} ${location.unitBlock} ${location.buildingNo} ${location.floor} ${location.part}`}
                          onSelect={() => {
                            setItemWorkLocationId(location.id);
                          }}
                          className={cn(
                            "cursor-pointer transition-colors",
                            isSelected ? "bg-primary/10 font-medium text-primary" : ""
                          )}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span>
                              {location.unitCustomNumber || "N/A"} - {location.unitZone || ""} {location.floor || ""}
                              <span className="text-xs text-muted-foreground ml-2">
                                ({location.buildingNo || "No Bldg"}, {location.part || "No Part"})
                              </span>
                            </span>
                            <Plus className={cn("h-4 w-4 opacity-50", isSelected ? "text-primary opacity-100" : "")} />
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
              {itemWorkLocationId && (() => {
                const loc = workLocations.find(l => l.id === itemWorkLocationId);
                if (!loc) return null;
                const labelParts = [
                  loc.unitCustomNumber ? `Unit ${loc.unitCustomNumber}` : null,
                  loc.buildingNo ? `Bldg ${loc.buildingNo}` : null,
                  loc.unitZone ? `Zone ${loc.unitZone}` : null,
                  loc.floor ? `Floor ${loc.floor}` : null,
                ].filter(Boolean);
                return (
                  <Badge variant="secondary" className="gap-1 pr-1 shadow-sm">
                    {labelParts.join(" - ") || "Location"}
                    <Button
                      variant="ghost"
                      type="button"
                      size="icon"
                      className="h-4 w-4 rounded-full p-0 hover:bg-muted"
                      onClick={() => setItemWorkLocationId("")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </Badge>
                );
              })()}
            </div>
          </div>
          <DialogFooter className="pt-4 mt-2">
            <Button variant="default" type="button" onClick={() => setLocationPickerOpen(false)} className="w-full shadow-md">
              Done {itemWorkLocationId ? "(1 selected)" : "(0 selected)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
