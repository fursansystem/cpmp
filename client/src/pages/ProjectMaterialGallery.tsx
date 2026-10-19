import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Droplet,
  Zap,
  Hammer,
  Paintbrush,
  Box,
  Boxes,
  Loader2,
  Search,
  LayoutGrid,
  List,
  Download,
  Truck,
  FileText,
  ExternalLink,
  Clock,
  Coins,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  X,
  Mail,
  Phone,
  Info,
  Paperclip,
  Eye,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MaterialFormDialog } from "@/components/material-form-dialog";
import type { Material, Project, Document, MaterialAttachment } from "@shared/schema";
import { formatFileSize } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const approvalStatusConfig = {
  A: { label: "Approved", icon: CheckCircle2, bgColor: "bg-green-500", textColor: "text-green-600 dark:text-green-400" },
  B: { label: "Approved As Noted", icon: AlertCircle, bgColor: "bg-blue-500", textColor: "text-blue-600 dark:text-blue-400" },
  C: { label: "Revise and Resubmit", icon: RotateCcw, bgColor: "bg-yellow-500", textColor: "text-yellow-600 dark:text-yellow-400" },
  D: { label: "Rejected", icon: X, bgColor: "bg-red-500", textColor: "text-red-600 dark:text-red-400" },
  E: { label: "Close automatically", icon: Clock, bgColor: "bg-gray-500", textColor: "text-gray-600 dark:text-gray-400" },
} as const;

// Custom default categories in English and Arabic
const DEFAULT_CATEGORIES = [
  { key: "all", labelAr: "الكل", labelEn: "All" },
  { key: "general", match: ["general", "عام"], labelAr: "عام", labelEn: "General" },
  { key: "sanitary", match: ["sanitary", "صحية", "المواد الصحية", "صحي", "سباكة", "plumbing"], labelAr: "المواد الصحية", labelEn: "Sanitary Materials" },
  { key: "electrical", match: ["electrical", "كهربائية", "المواد الكهربائية", "كهرباء", "electricity"], labelAr: "المواد الكهربائية", labelEn: "Electrical Materials" },
  { key: "structural", match: ["structural", "civil", "إنشائية", "المواد الإنشائية", "بناء", "خرسانة", "construction"], labelAr: "المواد الإنشائية والمدنية", labelEn: "Structural & Civil" },
  { key: "finishing", match: ["finishing", "paint", "تشطيب", "مواد التشطيب", "دهان", "بلاط", "tiles"], labelAr: "مواد التشطيب والدهان", labelEn: "Finishing & Paints" },
  { key: "other", match: ["other", "أخرى", "اخرى"], labelAr: "أخرى", labelEn: "Others" },
];

const MATERIAL_DOCUMENT_CATEGORIES = [
  "Technical DataSheet (TDS)",
  "Material Safety DataSheet (MSDS)",
  "Compliance/Test Report",
  "Quality Certificate (QC)",
  "Catalogue/Brochure",
  "Warranty Certificate",
  "Installation Guide",
  "Other Document",
];

export default function ProjectMaterialGallery() {
  const { projectId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryKey, setSelectedCategoryKey] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [previewMaterial, setPreviewMaterial] = useState<Material | null>(null);
  const [previewFile, setPreviewFile] = useState<{ url: string, name: string, type?: string } | null>(null);

  // Fetch project details
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) throw new Error("Failed to fetch project");
      return response.json();
    },
  });

  // Fetch materials for the project
  const { data: materials = [], isLoading } = useQuery<Material[]>({
    queryKey: ["/api/materials", { projectId }],
    enabled: !!projectId,
  });

  // Fetch linked suppliers for the selected preview material
  const { data: linkedSuppliers = [], isLoading: isLoadingSuppliers } = useQuery<any[]>({
    queryKey: ["/api/materials", previewMaterial?.id, "suppliers"],
    enabled: !!previewMaterial?.id,
  });

  // Fetch linked requests (MARs) for the selected preview material
  const { data: linkedRequests = [], isLoading: isLoadingRequests } = useQuery<any[]>({
    queryKey: ["/api/materials", previewMaterial?.id, "requests"],
    enabled: !!previewMaterial?.id,
  });

  const isApprovedInMAR = linkedRequests.some(
    req => req.approvalStatusCode === 'A' || req.approvalStatusCode === 'B'
  );

  // Fetch attachments for the preview material
  const { data: attachments = [], isLoading: isLoadingAttachments } = useQuery<(MaterialAttachment & { document: Document })[]>({
    queryKey: ["/api/materials", previewMaterial?.id, "attachments"],
    enabled: !!previewMaterial?.id,
  });

  const getFileUrl = (url?: string) => {
    if (!url) return "";
    if (url.startsWith('data:') || url.startsWith('http') || url.startsWith('/')) return url;
    if (url.includes('/') || url.includes('.')) return `/${url}`;
    return url;
  };

  // Delete material mutation
  const deleteMutation = useMutation({
    mutationFn: async (materialId: string) => {
      await apiRequest("DELETE", `/api/materials/${materialId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/materials", { projectId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] }); // Update material count on details page
      toast({
        title: "Deleted successfully",
        description: "The material has been successfully deleted from the gallery.",
      });
    },
    onError: (error: Error) => {
      let errorMessage = error.message;
      if (errorMessage.includes("{")) {
        try {
          const jsonStr = errorMessage.substring(errorMessage.indexOf("{"));
          const errorObj = JSON.parse(jsonStr);
          errorMessage = errorObj.details || errorObj.error || errorMessage;
        } catch (e) {
          // fallback to original message if parsing fails
        }
      }
      toast({
        title: "Error deleting",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Helper to determine category icons
  const getCategoryIcon = (categoryName: string) => {
    const name = categoryName.toLowerCase();
    if (name.includes("صحية") || name.includes("صحي") || name.includes("سباكة") || name.includes("sanitary") || name.includes("plumbing") || name.includes("water") || name.includes("droplet")) {
      return <Droplet className="w-8 h-8 text-blue-500" />;
    }
    if (name.includes("كهربائية") || name.includes("كهرباء") || name.includes("electrical") || name.includes("electricity") || name.includes("zap") || name.includes("cable")) {
      return <Zap className="w-8 h-8 text-amber-500" />;
    }
    if (name.includes("إنشائية") || name.includes("بناء") || name.includes("structural") || name.includes("civil") || name.includes("cement") || name.includes("حديد") || name.includes("concrete") || name.includes("block")) {
      return <Hammer className="w-8 h-8 text-orange-500" />;
    }
    if (name.includes("تشطيب") || name.includes("دهان") || name.includes("finishing") || name.includes("paint") || name.includes("decor") || name.includes("tiles")) {
      return <Paintbrush className="w-8 h-8 text-rose-500" />;
    }
    return <Box className="w-8 h-8 text-purple-500" />;
  };

  // Helper to match material category with standard keys
  const matchCategoryKey = (materialCat: string) => {
    const cat = (materialCat || "").toLowerCase().trim();
    for (const def of DEFAULT_CATEGORIES) {
      if (def.match && def.match.some(keyword => cat.includes(keyword) || keyword.includes(cat))) {
        return def.key;
      }
    }
    return "other";
  };

  // Filter materials based on search query and category tab
  const filteredMaterials = materials.filter((material) => {
    const matchesSearch =
      material.materialName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (material.materialCode || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (material.description || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (material.originCountry || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      material.category.toLowerCase().includes(searchQuery.toLowerCase());

    if (selectedCategoryKey === "all") {
      return matchesSearch;
    }

    const materialKey = matchCategoryKey(material.category);
    return matchesSearch && materialKey === selectedCategoryKey;
  });

  const handleDeleteClick = (id: string) => {
    if (window.confirm("Are you sure you want to delete this material?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleEditClick = (material: Material) => {
    setEditingMaterial(material);
    setIsFormOpen(true);
  };

  const handleAddClick = () => {
    setEditingMaterial(null);
    setIsFormOpen(true);
  };

  const handleExport = () => {
    if (filteredMaterials.length === 0) {
      toast({
        title: "No data to export",
        description: "There are no materials in the current selection to export.",
        variant: "destructive"
      });
      return;
    }

    const headers = ["Material ID", "Material Name", "Category", "Unit", "Country of Origin", "Description"];
    const rows = filteredMaterials.map(m => [
      m.materialCode || "",
      m.materialName,
      m.category,
      m.unit,
      m.originCountry || "",
      m.description || ""
    ]);

    // Use BOM for Excel compatibility with UTF-8
    const csvContent = "\ufeff"
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(","))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `project_materials_${projectId}_${selectedCategoryKey}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-transparent px-6 lg:px-10 pt-2 pb-8 space-y-4 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px]" />
      </div>

      <div className="flex items-center justify-between relative min-h-[2.5rem] lg:min-h-[3rem]">
        <div className="flex items-center gap-2 flex-1">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 w-8 p-0 md:h-auto md:w-auto md:px-3 md:py-2 text-muted-foreground hover:text-foreground shrink-0 shadow-sm z-10"
            onClick={() => navigate(`/projects/${projectId}`)}
          >
            <ArrowLeft className="w-5 h-5 md:mr-2" />
            <span className="hidden md:inline font-semibold">Back to Project</span>
          </Button>
        </div>

        {/* Absolute Centered Title Badge */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-2 lg:gap-3 w-full justify-center px-12 lg:px-0">
          <Badge variant="secondary" className="px-4 py-1.5 lg:px-8 lg:py-2 border-none bg-primary/10 text-primary rounded-full shadow-sm lg:shadow-md">
            <Boxes className="w-4 h-4 lg:w-6 lg:h-6 mr-2 lg:mr-3 text-primary" />
            <span className="text-sm lg:text-xl font-bold tracking-tight uppercase truncate max-w-[200px] sm:max-w-none">Project Materials</span>
          </Badge>
        </div>

        <div className="flex items-center gap-3 shrink-0 z-10">
          <Button
            onClick={handleAddClick}
            className="shadow-lg rounded-full font-bold text-[10px] uppercase tracking-widest px-6 h-9 lg:h-11 bg-primary hover:bg-primary/90 text-primary-foreground transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Material
          </Button>
        </div>
      </div>


      {/* Search and Tabs Controller */}
      <div className="bg-white/40 dark:bg-muted/10 backdrop-blur-md p-4 lg:p-6 rounded-[2rem] flex items-center justify-between gap-4 flex-wrap border border-white/20 shadow-xl mt-4">
        {/* Dynamic Category Filtering Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-none">
          {DEFAULT_CATEGORIES.map((cat) => {
            const isActive = selectedCategoryKey === cat.key;
            return (
              <Badge
                key={cat.key}
                variant={isActive ? "default" : "secondary"}
                onClick={() => setSelectedCategoryKey(cat.key)}
                className={`cursor-pointer px-4 py-2 text-xs font-bold rounded-full transition-all duration-300 whitespace-nowrap active:scale-95 border ${isActive
                  ? "bg-primary border-primary text-primary-foreground shadow-md hover:bg-primary/90"
                  : "bg-background/40 hover:bg-background/80 text-muted-foreground border-border/60 hover:text-foreground"
                  }`}
              >
                {cat.labelEn}
              </Badge>
            );
          })}
        </div>

        {/* Search & Layout Toggle Wrapper */}
        <div className="flex items-center gap-3.5 w-full md:w-auto justify-between md:justify-end">
          {/* Search Input Bar */}
          <div className="relative w-full md:w-64 group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 transition-colors group-focus-within:text-primary" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search material..."
              className="pl-10 h-10 bg-background/50 border-border/60 rounded-xl text-sm transition-all focus:bg-background shadow-sm"
            />
          </div>

          {/* Export Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="rounded-full px-5 h-10 border-border/60 bg-background/50 hover:bg-background text-foreground/80 font-bold gap-2 flex items-center transition-all duration-300 shadow-sm active:scale-95 shrink-0"
          >
            <Download className="w-4 h-4 text-foreground/70" />
            <span className="text-xs uppercase tracking-wider">Export</span>
          </Button>

          {/* View Mode Toggle Switch */}
          <div className="flex items-center bg-muted/40 p-1 rounded-full border border-border/40 shadow-inner shrink-0">
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-full transition-all duration-300 ${viewMode === "list"
                ? "bg-background dark:bg-card text-foreground shadow-sm scale-105"
                : "text-muted-foreground/50 hover:text-foreground"
                }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-full transition-all duration-300 ${viewMode === "grid"
                ? "bg-background dark:bg-card text-foreground shadow-sm scale-105"
                : "text-muted-foreground/50 hover:text-foreground"
                }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid View */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">
            Loading materials...
          </p>
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-card/30 border border-dashed border-border rounded-3xl p-12 max-w-md mx-auto">
          <div className="bg-blue-500/10 p-4 rounded-full mb-4">
            <Boxes className="w-10 h-10 text-blue-500/60" />
          </div>
          <h3 className="text-sm font-bold text-foreground/80 uppercase tracking-widest mb-1">
            No materials added
          </h3>
          <p className="text-[11px] text-muted-foreground uppercase tracking-tight leading-relaxed mb-6">
            No matching materials found in this category. Click the button above to add a new material with an image and description.
          </p>
          <Button
            onClick={handleAddClick}
            variant="outline"
            className="rounded-xl border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-all text-xs"
          >
            Add new material now
          </Button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {filteredMaterials.map((material) => (
            <Card
              key={material.id}
              onClick={() => setPreviewMaterial(material)}
              className="overflow-hidden border border-border/70 bg-card/30 dark:bg-card/20 backdrop-blur-xl rounded-[1.5rem] shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-500 group relative flex flex-col h-[360px] cursor-pointer"
            >
              {/* Card Image Cover */}
              <div className="h-44 w-full relative overflow-hidden bg-muted/40 shrink-0 border-b border-border/40">
                {/* Document Count Badge in Cover Image */}
                {(material as any).attachmentCount > 0 && (
                  <div className="absolute top-3.5 left-3.5 z-10">
                    <div className="bg-white dark:bg-neutral-800 text-primary border-none rounded-full h-7 px-3 gap-1.5 shadow-lg flex items-center group/doc shrink-0">
                      <div className="relative">
                        <FileText className="w-3.5 h-3.5 transition-transform group-hover/doc:rotate-12" />
                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse border border-white" />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-wider">
                        {(material as any).attachmentCount} Docs
                      </span>
                    </div>
                  </div>
                )}
                {material.imageUrl ? (
                  <img
                    src={material.imageUrl}
                    alt={material.materialName}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    onError={(e) => {
                      // Fallback if image fails to load
                      (e.target as any).style.display = "none";
                      (e.target as any).nextSibling.style.display = "flex";
                    }}
                  />
                ) : null}

                {/* Fallback & Loading Placeholder Container */}
                <div
                  className={`absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-background/40 to-muted/20 gap-3 transition-colors duration-500 group-hover:from-muted/40`}
                  style={{ display: material.imageUrl ? "none" : "flex" }}
                >
                  <div className="p-4 bg-background/80 dark:bg-card/85 rounded-2xl shadow-md backdrop-blur-md">
                    {getCategoryIcon(material.category)}
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
                    {material.category}
                  </span>
                </div>

                {/* Edit & Delete Actions (Show on Card Hover) */}
                <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0">
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditClick(material);
                    }}
                    className="w-8 h-8 rounded-lg bg-background/80 dark:bg-card/80 backdrop-blur-md border border-border/40 hover:bg-primary hover:text-primary-foreground shadow-md transition-all active:scale-95"
                    title="Edit material"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  {!((material as any).hasRequests || (material as any).hasSuppliers) && (
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(material.id);
                      }}
                      className="w-8 h-8 rounded-lg bg-destructive/80 text-white backdrop-blur-md hover:bg-destructive shadow-md transition-all active:scale-95"
                      title="Delete material"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <CardContent className="p-5 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <h3 className="text-base font-bold tracking-tight text-foreground/90 leading-tight group-hover:text-primary transition-colors flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{material.materialName}</span>
                    {(material as any).isApproved && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-500/10 shrink-0" />
                    )}
                  </h3>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-bold tracking-wider uppercase bg-primary/5 text-primary border-primary/25 rounded-md px-2 py-0.5"
                    >
                      {material.category}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="text-[11px] font-bold tracking-wide bg-muted/70 text-muted-foreground/90 border-none rounded-md px-2.5 py-0.5"
                    >
                      Unit: {material.unit}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed line-clamp-3 overflow-hidden text-ellipsis h-[54px] pt-1">
                    {material.description || "No technical description available for this material..."}
                  </p>
                </div>

                <div className="pt-3 border-t border-border/60 flex items-center justify-between text-[9px] font-bold uppercase text-muted-foreground/50 tracking-wider shrink-0">
                  <span className="text-foreground/70">ID: {material.materialCode || material.id.substring(0, 8)}</span>
                  {material.originCountry && (
                    <span className="text-amber-700 dark:text-amber-400 opacity-90">Origin: {material.originCountry}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredMaterials.map((material) => (
            <Card
              key={material.id}
              onClick={() => setPreviewMaterial(material)}
              className="overflow-hidden border border-border/70 bg-card/30 dark:bg-card/20 backdrop-blur-xl rounded-[1.5rem] shadow-sm hover:shadow-md transition-all duration-300 group relative flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-4 cursor-pointer"
            >
              <div className="flex items-center gap-4 min-w-0 flex-1 w-full">
                {/* Thumbnail image */}
                <div className="w-16 h-16 rounded-xl bg-muted/40 overflow-hidden shrink-0 border border-border/40 flex items-center justify-center relative">
                  {material.imageUrl ? (
                    <img
                      src={material.imageUrl}
                      alt={material.materialName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as any).style.display = "none";
                        (e.target as any).nextSibling.style.display = "flex";
                      }}
                    />
                  ) : null}
                  <div
                    className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-background/40 to-muted/20"
                    style={{ display: material.imageUrl ? "none" : "flex" }}
                  >
                    {getCategoryIcon(material.category)}
                  </div>
                </div>

                {/* Details */}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <h3 className="text-sm font-bold text-foreground/90 leading-tight flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{material.materialName}</span>
                    {(material as any).isApproved && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500/10 shrink-0" />
                    )}
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-bold tracking-wider uppercase bg-primary/5 text-primary border-primary/25 rounded-md px-1.5 py-0.5"
                    >
                      {material.category}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="text-[11px] font-bold tracking-wide bg-muted/70 text-muted-foreground/90 border-none rounded-md px-2.5 py-0.5"
                    >
                      Unit: {material.unit}
                    </Badge>
                    {(material as any).attachmentCount > 0 && (
                      <div className="bg-white dark:bg-neutral-800 text-primary border border-border/40 rounded-full h-7 px-3 gap-1.5 shadow-sm flex items-center group/doc shrink-0">
                        <div className="relative">
                          <FileText className="w-3.5 h-3.5 transition-transform group-hover/doc:rotate-12" />
                          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse border border-white" />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-wider">
                          {(material as any).attachmentCount} Docs
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed line-clamp-1 truncate max-w-2xl pt-0.5">
                    {material.description || "No description available."}
                  </p>
                </div>
              </div>

              {/* Actions & ID */}
              <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto shrink-0 border-t sm:border-t-0 border-border/40 pt-3 sm:pt-0">
                <div className="flex flex-col sm:items-end gap-0.5">
                  <span className="text-[9px] font-bold uppercase text-muted-foreground/70 tracking-wider">
                    ID: {material.materialCode || material.id.substring(0, 8)}
                  </span>
                  {material.originCountry && (
                    <span className="text-[9px] font-bold uppercase text-amber-700 dark:text-amber-400 opacity-90 tracking-wider">
                      Origin: {material.originCountry}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditClick(material);
                    }}
                    className="w-8 h-8 rounded-lg bg-background/80 dark:bg-card/85 border border-border/40 hover:bg-primary hover:text-primary-foreground shadow-sm transition-all active:scale-95"
                    title="Edit material"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  {!((material as any).hasRequests || (material as any).hasSuppliers) && (
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(material.id);
                      }}
                      className="w-8 h-8 rounded-lg bg-destructive/80 text-white hover:bg-destructive shadow-sm transition-all active:scale-95"
                      title="Delete material"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!previewMaterial} onOpenChange={(open) => !open && setPreviewMaterial(null)}>
        <DialogContent className="max-w-md w-[92vw] h-[80vh] md:h-[700px] overflow-hidden rounded-[1.5rem] border border-primary/45 bg-background/95 backdrop-blur-xl p-0 shadow-2xl flex flex-col">
          {previewMaterial && (
            <>
              {/* Top Panel - Material Visual Representation */}
              <div className="w-full bg-white dark:bg-neutral-950 border-b border-border/40 shrink-0 relative h-[250px] overflow-hidden flex items-center justify-center p-6">
                {previewMaterial.imageUrl ? (
                  <img
                    src={previewMaterial.imageUrl}
                    alt={previewMaterial.materialName}
                    className="w-full h-full object-contain select-none rounded-xl"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <div className="p-6 bg-muted/40 dark:bg-card/85 rounded-3xl shadow-md border border-border/40 text-primary">
                      {getCategoryIcon(previewMaterial.category)}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      {previewMaterial.category}
                    </span>
                  </div>
                )}
              </div>

              {/* Bottom Panel - Info, Description, Suppliers & MAR Requests */}
              <div className="w-full flex-1 px-5 pt-4 pb-5 flex flex-col gap-4 overflow-y-auto text-left bg-muted/15 dark:bg-neutral-900/30">
                <DialogHeader className="p-0 text-left space-y-2">
                  <DialogTitle className="text-lg font-bold tracking-tight text-foreground/90 leading-snug capitalize flex items-center justify-between gap-3 min-w-0 w-full">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{previewMaterial.materialName}</span>
                      {(isApprovedInMAR || (previewMaterial as any).isApproved) && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-500/10 shrink-0" />
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-bold tracking-wider uppercase bg-primary/10 text-primary border-primary/30 rounded-md px-2.5 py-1 shrink-0"
                    >
                      {previewMaterial.category}
                    </Badge>
                  </DialogTitle>
                  <div className="flex flex-col gap-3 mt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {previewMaterial.materialCode && (
                        <Badge
                          variant="secondary"
                          className="text-[11px] font-bold tracking-wide bg-blue-500/10 text-blue-700 dark:text-blue-400 border-none rounded-md px-2.5 py-1"
                        >
                          ID: {previewMaterial.materialCode}
                        </Badge>
                      )}
                      {previewMaterial.originCountry && (
                        <Badge
                          variant="secondary"
                          className="text-[11px] font-bold tracking-wide bg-amber-500/10 text-amber-700 dark:text-amber-400 border-none rounded-md px-2.5 py-1"
                        >
                          Origin: {previewMaterial.originCountry}
                        </Badge>
                      )}
                      <Badge
                        variant="secondary"
                        className="text-[11px] font-bold tracking-wide bg-purple-500/10 text-purple-700 dark:text-purple-400 border-none rounded-md px-2.5 py-1"
                      >
                        Unit: {previewMaterial.unit}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            className="h-7 bg-white dark:bg-neutral-800 text-primary hover:bg-primary/5 border border-primary/20 rounded-full px-3 gap-1.5 shadow-sm transition-all hover:scale-105 active:scale-95 group/doc shrink-0 cursor-pointer"
                          >
                            <div className="relative">
                              <FileText className="w-3.5 h-3.5 transition-transform group-hover/doc:rotate-12" />
                              {attachments.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full animate-pulse border border-white" />
                              )}
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider">{attachments.length} Docs</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-[320px] md:w-[350px] rounded-[1.5rem] p-3 shadow-2xl border border-primary/15 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl z-50">
                          <div className="px-4 py-3 border-b border-muted/50 mb-2 text-left">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Material Files & Certificates</p>
                          </div>
                          {attachments.length === 0 ? (
                            <div className="p-8 text-center">
                              <div className="bg-muted/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FileText className="w-6 h-6 text-muted-foreground/20" />
                              </div>
                              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider opacity-40">No documents / لا توجد مستندات</p>
                            </div>
                          ) : (
                            <div className="space-y-1.5 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                              {attachments.map(att => {
                                const doc = att.document || {};
                                const fileUrl = getFileUrl(doc.fileUrl || doc.fileData || "");
                                return (
                                  <DropdownMenuItem
                                    key={att.id}
                                    className="rounded-2xl p-2.5 cursor-pointer focus:bg-primary/5 group"
                                    asChild
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center group-focus:bg-primary/20 shrink-0">
                                          <FileText className="w-4 h-4 text-primary" />
                                        </div>
                                        <div className="min-w-0 flex-1 text-left">
                                          <p className="truncate text-xs font-bold text-foreground leading-tight tracking-tight">
                                            {doc.fileName || doc.name}
                                          </p>
                                          <div className="flex items-center gap-2 mt-1">
                                            {att.category && (
                                              <Badge
                                                variant="outline"
                                                className="text-[9px] py-0 px-2 h-4 font-bold border-primary/20 text-primary bg-primary/5 uppercase tracking-tight"
                                              >
                                                {att.category.split(' (')[0]}
                                              </Badge>
                                            )}
                                            <span className="text-[9px] text-muted-foreground/50 font-bold tabular-nums uppercase">
                                              {formatFileSize(doc.size || (doc as any).fileSize)}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0 ml-2 text-left" onClick={e => e.stopPropagation()}>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 rounded-xl hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setPreviewFile({
                                              url: fileUrl,
                                              name: doc.fileName || doc.name || "Document",
                                              type: doc.type
                                            });
                                          }}
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                        </Button>
                                        <a
                                          href={fileUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="h-7 w-7 flex items-center justify-center rounded-xl hover:bg-primary/10 hover:text-primary transition-all text-muted-foreground/40 active:scale-90"
                                        >
                                          <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                      </div>
                                    </div>
                                  </DropdownMenuItem>
                                );
                              })}
                            </div>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            className="h-7 bg-white dark:bg-neutral-800 text-primary hover:bg-primary/5 border border-primary/20 rounded-full px-3 gap-1.5 shadow-sm transition-all hover:scale-105 active:scale-95 group/mar shrink-0 cursor-pointer"
                          >
                            <div className="relative">
                              <FileText className="w-3.5 h-3.5 transition-transform group-hover/mar:rotate-12" />
                              {linkedRequests.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-pulse border border-white" />
                              )}
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider">{linkedRequests.length} MAR</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-[320px] md:w-[350px] rounded-[1.5rem] p-3 shadow-2xl border border-primary/15 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl z-50">
                          <div className="px-4 py-3 border-b border-muted/50 mb-2 text-left">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Material Approval Requests</p>
                          </div>
                          {isLoadingRequests ? (
                            <div className="flex justify-center py-6">
                              <Loader2 className="w-6 h-6 animate-spin text-primary" />
                            </div>
                          ) : linkedRequests.length === 0 ? (
                            <div className="p-8 text-center">
                              <div className="bg-muted/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FileText className="w-6 h-6 text-muted-foreground/20" />
                              </div>
                              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider opacity-40">No MAR records</p>
                            </div>
                          ) : (
                            <div className="space-y-1.5 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                              {linkedRequests.map((req) => (
                                <DropdownMenuItem
                                  key={req.requestId}
                                  className="rounded-2xl p-2.5 cursor-pointer focus:bg-primary/5 group"
                                  asChild
                                >
                                  <div
                                    className="flex items-center justify-between w-full"
                                    onClick={() => {
                                      setPreviewMaterial(null);
                                      navigate(`/requests/${req.requestId}`);
                                    }}
                                  >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                      <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center group-focus:bg-primary/20 shrink-0">
                                        <FileText className="w-4 h-4 text-primary" />
                                      </div>
                                      <div className="min-w-0 flex-1 text-left">
                                        <p className="truncate text-xs font-bold text-foreground leading-tight tracking-tight">
                                          {req.requestNumber}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                          <span className="text-[9px] text-muted-foreground/50 font-bold uppercase">View Request</span>
                                          <ExternalLink className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                                        </div>
                                      </div>
                                    </div>
                                    <div className="shrink-0 ml-2">
                                      {(() => {
                                        const code = req.approvalStatusCode;
                                        if (code) {
                                          const config = approvalStatusConfig[code as keyof typeof approvalStatusConfig];
                                          if (config) {
                                            return (
                                              <Badge
                                                variant="outline"
                                                className={`text-[9px] font-bold tracking-wide rounded px-1.5 py-0.5 ${config.textColor} bg-primary/5 border-primary/20`}
                                              >
                                                {config.label}
                                              </Badge>
                                            );
                                          }
                                        }
                                        return (
                                          <Badge variant="secondary" className="text-[9px] font-bold tracking-wide rounded px-1.5 py-0.5">
                                            {req.currentStatus || "Submitted"}
                                          </Badge>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                </DropdownMenuItem>
                              ))}
                            </div>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </DialogHeader>

                {/* Description Box */}
                <div className="text-left bg-muted/30 border border-border/40 p-4 rounded-2xl flex gap-3 shadow-sm">
                  <div className="p-1.5 bg-primary/10 rounded-lg text-primary shrink-0 self-start">
                    <Info className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                      Description
                    </h4>
                    <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap max-h-[85px] overflow-y-auto pr-1">
                      {previewMaterial.description || "No description available for this material."}
                    </p>
                  </div>
                </div>




                {/* Suppliers Section */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 pb-1.5 border-b border-border/40">
                    <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                      <Truck className="w-4 h-4" />
                    </div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-foreground/80">
                      Material supplier
                    </h3>
                  </div>

                  {isLoadingSuppliers ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : linkedSuppliers.length === 0 ? (
                    <div className="p-6 text-center border-2 border-dashed border-border/40 rounded-2xl bg-muted/5 text-muted-foreground">
                      <Truck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-xs font-bold uppercase tracking-wider opacity-60">No suppliers associated</p>
                      <p className="text-[10px] opacity-40 mt-0.5">Link a supplier from the Purchase Orders & Suppliers tab</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5 max-h-[200px] overflow-y-auto overflow-x-hidden pr-1 w-full min-w-0">
                      {linkedSuppliers.map((sm) => (
                        <div
                          key={sm.id}
                          onClick={() => {
                            setPreviewMaterial(null);
                            navigate(`/projects/${projectId}/purchase-orders?supplierId=${sm.supplierId}`);
                          }}
                          className="p-3 bg-card/45 hover:bg-primary/5 hover:border-primary/30 border border-border/30 rounded-xl flex items-center justify-between gap-3 transition-all cursor-pointer group shadow-sm w-full min-w-0 overflow-hidden"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-black shrink-0 border border-primary/20 group-hover:bg-primary/20 transition-colors">
                              {(sm.supplier?.supplierName || "?").substring(0, 2).toUpperCase()}
                            </div>
                            <span className="text-xs font-bold text-foreground/90 block truncate group-hover:text-primary group-hover:underline flex-1 min-w-0">
                              {sm.supplier?.supplierName}
                            </span>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/45 group-hover:text-primary transition-colors shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <MaterialFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        projectId={projectId || ""}
        material={editingMaterial}
      />

      {/* File Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-5xl h-[85vh] p-0 overflow-hidden border-none shadow-2xl rounded-3xl flex flex-col">
          <DialogHeader className="py-2.5 px-4 border-b bg-muted/5 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-1.5 rounded-lg">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left">
                <DialogTitle className="text-sm font-black truncate max-w-md">
                  {previewFile?.name}
                </DialogTitle>
                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Document Preview</p>
              </div>
            </div>
            {previewFile?.url && (
              <Button variant="outline" size="sm" className="rounded-xl font-bold h-8 bg-background/50 border-primary/20 text-primary hover:bg-primary/5 mr-8 cursor-pointer" asChild>
                <a href={previewFile.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Open Original / فتح الأصل
                </a>
              </Button>
            )}
          </DialogHeader>
          <div className="flex-1 bg-muted/20 flex items-center justify-center overflow-hidden">
            {previewFile?.url ? (() => {
              const url = previewFile.url.toLowerCase();
              const name = previewFile.name.toLowerCase();
              const type = (previewFile.type || "").toLowerCase();

              const isPDF = type.includes('pdf') || name.endsWith('.pdf') || url.startsWith('data:application/pdf');
              const isImage = type.includes('image') || url.startsWith('data:image') ||
                ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "jfif", "pjpeg", "pjp"].some(ext =>
                  type === ext || type === `.${ext}` || name.endsWith(`.${ext}`) || url.includes(`.${ext}?`) || url.endsWith(`.${ext}`)
                );
              const isVideo = type.includes('video') || url.startsWith('data:video') ||
                ["mp4", "webm", "ogg"].some(ext =>
                  type === ext || type === `.${ext}` || name.endsWith(`.${ext}`) || url.includes(`.${ext}?`) || url.endsWith(`.${ext}`)
                );

              if (isImage) {
                return (
                  <div className="w-full h-full flex items-center justify-center overflow-auto custom-scrollbar p-2">
                    <img
                      src={previewFile.url}
                      alt={previewFile.name}
                      className="max-w-full max-h-full object-contain shadow-2xl rounded-xl border border-border/50"
                    />
                  </div>
                );
              }

              if (isPDF) {
                return (
                  <iframe
                    src={previewFile.url}
                    className="w-full h-full border-none bg-white block"
                    title={previewFile.name}
                  />
                );
              }

              if (isVideo) {
                return (
                  <video
                    controls
                    className="max-w-full max-h-full rounded-xl shadow-2xl border border-border/50"
                  >
                    <source src={previewFile.url} />
                    Your browser does not support the video tag.
                  </video>
                );
              }

              return (
                <div className="text-center p-12 bg-background/50 backdrop-blur-sm rounded-[1.5rem] border border-dashed border-muted-foreground/20 max-w-md mx-auto">
                  <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-6 ring-8 ring-primary/[0.02]">
                    <FileText className="w-10 h-10 text-primary/40" />
                  </div>
                  <h3 className="text-lg font-black uppercase tracking-tight mb-2">No Preview Available</h3>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-6 leading-relaxed opacity-60">
                    This file type cannot be previewed directly. You can download it to view locally.
                  </p>
                  <Button className="rounded-xl font-bold px-8 shadow-lg shadow-primary/20" asChild>
                    <a href={previewFile.url} download={previewFile.name}>
                      Download File
                    </a>
                  </Button>
                </div>
              );
            })() : (
              <div className="text-center p-12">
                <FileText className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">No file selected</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
