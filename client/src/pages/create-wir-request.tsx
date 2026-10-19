import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProjectStorageModal } from "@/components/ProjectStorageModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Trash2, MapPin, Layers, Target, Paperclip, Check, ChevronsUpDown, FileText, Database, Truck, Building2, Edit2, Users, Hash, Briefcase, Mail, Phone, Eye, ExternalLink, X, Link2, AlertTriangle, Package } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn, formatFileSize } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useUpload } from "@/hooks/use-upload";
import type {
  WorkLocation,
  WorkLevel,
  Purpose,
  Activity,
  RequestType,
  Delivery,
  Project,
  Request,
  RequestRevision,
  DeliveryItem,
  Supplier,
  Material
} from "@shared/schema";
import { LoadingIcon } from "@/components/ui/loading-icon";
import { SupplierFormDialog } from "@/components/supplier-form-dialog";
import { MaterialFormDialog } from "@/components/material-form-dialog";
import { LinkSupplierDialog } from "@/components/link-supplier-dialog";
import { MaterialLinkedSuppliers } from "@/components/material-linked-suppliers";


type EnrichedDelivery = Delivery & {
  items: DeliveryItem[];
  linkedRequestId?: string | null;
  linkedRequestNumber?: string | null;
  linkedRequests?: any[];
};

interface SelectedDelivery {
  id: string;
  shipmentNumber: string;
  deliveryInvoiceNumber?: string | null;
  materialName: string;
  supplier: string;
  arrivalDate?: string | Date | null;
}

interface SelectedSupplier {
  id: string;
  supplierName: string;
  email?: string | null;
  phone?: string | null;
  category?: string | null;
  contactPerson?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  experienceYears?: number | null;
  attachments?: any[];
}

interface SelectedWorkLocation {
  id: string;
  unit: string;
  zone: string;
  block: string;
  building: string;
  floor: string;
  part: string;
}

interface SelectedWorkLevel {
  id: string;
  code: string;
  title: string;
}

interface Attachment {
  id: string;
  title: string;
  documentType?: string;
  documentRef?: string;
  files: {
    file: File | null;
    fileName: string;
    fileUrl?: string;
    objectPath?: string;
    projectDocumentId?: string;
    sourceType?: string;
    fileSize?: string | number;
  }[];
}

interface RequestDocument {
  id: string;
  revisionId: string;
  title: string;
  fileName: string;
  fileUrl: string | null;
  fileSize: number | null;
  mimeType: string | null;
  documentType?: string | null;
  documentRef?: string | null;
}

interface RequestPurpose {
  id: string;
  revisionId: string;
  purposeId: string;
  purposeName: string;
  purposeCategory: string | null;
}

interface RequestWorkLocation {
  id: string;
  revisionId: string;
  workLocationId: string;
  unit: string | null;
  zone: string | null;
  block: string | null;
  building: string | null;
  floor: string | null;
  part: string | null;
}

const DOCUMENT_TYPES = [
  "Plans & Proposals",
  "Method Statement",
  "Work Program",
  "Timeline / Schedule",
  "Calculations",
  "Reports",
  "Payments",
  "Test Results",
  "Certificates",
  "Drawing"
];

export function SupplierAttachmentsMenu({ supplierId }: { supplierId: string }) {
  const { data: attachments = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/suppliers", supplierId, "attachments"],
    enabled: !!supplierId,
  });

  const [previewDoc, setPreviewDoc] = useState<any | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <LoadingIcon size={14} className="text-muted-foreground opacity-50" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Loading...</span>
      </div>
    );
  }

  if (!attachments || attachments.length === 0) {
    return (
      <span className="text-[10px] text-muted-foreground opacity-50 uppercase tracking-widest">No Documents</span>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 w-full">
        {attachments.map(att => {
          const fileName = att.document?.fileName || att.document?.name || "Document";
          const fileSize = att.document?.fileSize ? formatFileSize(att.document.fileSize) : "";

          return (
            <button
              key={att.id}
              onClick={() => setPreviewDoc(att)}
              className="flex items-center gap-3 p-1.5 pr-4 bg-white dark:bg-background hover:bg-slate-50 dark:hover:bg-muted/50 rounded-full transition-all group max-w-[320px] w-fit text-left border border-slate-200 dark:border-muted shadow-sm"
              title={fileName}
            >
              <div className="flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform pl-1">
                <FileText className="w-5 h-5 text-[#C19B44] dark:text-primary" />
              </div>
              <div className="flex flex-col flex-1 min-w-0 justify-center">
                <span className="text-[13px] font-bold text-[#C19B44] dark:text-primary truncate leading-tight w-full">
                  {fileName}
                </span>
                <div className="flex items-center gap-2 mt-0.5 w-full">
                  {fileSize && (
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                      {fileSize}
                    </span>
                  )}
                  {att.category && (
                    <Badge variant="secondary" className="h-5 px-2 text-[10px] bg-slate-100/80 text-slate-700 dark:bg-muted dark:text-muted-foreground border-none font-medium uppercase truncate max-w-full">
                      {att.category}
                    </Badge>
                  )}
                </div>
              </div>
              <Eye className="w-4 h-4 text-[#C19B44]/60 dark:text-primary/60 group-hover:text-[#C19B44] dark:group-hover:text-primary transition-colors shrink-0 ml-1" />
            </button>
          );
        })}
      </div>
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-6xl h-[95vh] rounded-[1.5rem] p-0 overflow-hidden border-none shadow-2xl flex flex-col bg-white dark:bg-background [&>button]:hidden">
          {/* Streamlined Premium Header */}
          <div className="flex items-center justify-between p-3 px-6 bg-card/50 backdrop-blur-md relative z-20 shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-sm font-black tracking-tight truncate max-w-[300px] md:max-w-[500px]">
                  {previewDoc?.document?.fileName || previewDoc?.document?.name || "Document Preview"}
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    DOCUMENT PREVIEW
                  </span>
                  {previewDoc?.category && (
                    <>
                      <span className="text-muted-foreground/30">•</span>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/50 px-2 py-0.5 rounded-full">
                        {previewDoc.category}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {previewDoc && (previewDoc.document?.fileUrl || previewDoc.document?.fileData) && (
                <Button variant="outline" size="sm" className="rounded-full font-bold h-10 px-5 bg-card/80 border border-muted text-primary hover:bg-primary/5 hidden sm:flex shadow-sm" asChild>
                  <a href={previewDoc.document.fileUrl || previewDoc.document.fileData} target="_blank" rel="noopener noreferrer">
                    <Link2 className="w-4 h-4 mr-2" />
                    Open Original
                  </a>
                </Button>
              )}
              <Button
                variant="secondary"
                size="icon"
                className="h-10 w-10 rounded-full hover:bg-muted/80 bg-muted/50 border-none shadow-none text-foreground"
                onClick={() => setPreviewDoc(null)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden relative bg-muted/30">
            {previewDoc ? (
              (() => {
                const url = previewDoc.document?.fileUrl || previewDoc.document?.fileData || "";
                const type = previewDoc.document?.mimeType?.toLowerCase() || previewDoc.document?.type?.toLowerCase() || "";
                const name = (previewDoc.document?.fileName || previewDoc.document?.name || "").toLowerCase();
                const isImage = type.includes('image') || name.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)$/);
                const isPDF = type.includes('pdf') || name.endsWith('.pdf');

                if (isPDF) {
                  return (
                    <iframe
                      src={url}
                      className="w-full h-full bg-white"
                      title={previewDoc.document?.fileName || "Preview"}
                    />
                  );
                }

                if (isImage) {
                  return (
                    <div className="w-full h-full flex items-center justify-center p-4">
                      <img
                        src={url}
                        alt={previewDoc.document?.fileName || "Preview"}
                        className="max-w-full max-h-full object-contain rounded-xl shadow-sm border border-muted/50 bg-white"
                      />
                    </div>
                  );
                }

                return (
                  <div className="w-full h-full flex items-center justify-center p-4">
                    <div className="text-center space-y-4 max-w-md w-full bg-white p-8 rounded-[1.5rem] border border-muted/50 shadow-sm">
                      <div className="w-20 h-20 bg-primary/5 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
                        <FileText className="w-10 h-10" />
                      </div>
                      <h3 className="text-lg font-black uppercase tracking-tight mb-2">Preview not available</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        We can't preview this file type directly in the browser. You can still open it in a new tab.
                      </p>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <Button variant="default" className="w-full mt-4 h-12 rounded-xl text-xs font-bold uppercase tracking-widest group shadow-md transition-all">
                          <ExternalLink className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
                          Open in new tab
                        </Button>
                      </a>
                    </div>
                  </div>
                );
              })()
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MaterialAttachmentsMenu({ materialId }: { materialId: string }) {
  const { data: attachments = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/materials", materialId, "attachments"],
    enabled: !!materialId,
  });

  const [previewDoc, setPreviewDoc] = useState<any | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <LoadingIcon size={14} className="text-muted-foreground opacity-50" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Loading...</span>
      </div>
    );
  }

  if (!attachments || attachments.length === 0) {
    return (
      <span className="text-[10px] text-muted-foreground opacity-50 uppercase tracking-widest">No Documents</span>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 w-full">
        {attachments.map(att => {
          const fileName = att.document?.fileName || att.document?.name || "Document";
          const fileSize = att.document?.fileSize ? formatFileSize(att.document.fileSize) : "";

          return (
            <button
              key={att.id}
              onClick={() => setPreviewDoc(att)}
              className="flex items-center gap-3 p-1.5 pr-4 bg-white dark:bg-background hover:bg-slate-50 dark:hover:bg-muted/50 rounded-full transition-all group max-w-[320px] w-fit text-left border border-slate-200 dark:border-muted shadow-sm"
              title={fileName}
            >
              <div className="flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform pl-1">
                <FileText className="w-5 h-5 text-[#C19B44] dark:text-primary" />
              </div>
              <div className="flex flex-col flex-1 min-w-0 justify-center">
                <span className="text-[13px] font-bold text-[#C19B44] dark:text-primary truncate leading-tight w-full">
                  {fileName}
                </span>
                <div className="flex items-center gap-2 mt-0.5 w-full">
                  {fileSize && (
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                      {fileSize}
                    </span>
                  )}
                  {att.category && (
                    <Badge variant="secondary" className="h-5 px-2 text-[10px] bg-slate-100/80 text-slate-700 dark:bg-muted dark:text-muted-foreground border-none font-medium uppercase truncate max-w-full">
                      {att.category}
                    </Badge>
                  )}
                </div>
              </div>
              <Eye className="w-4 h-4 text-[#C19B44]/60 dark:text-primary/60 group-hover:text-[#C19B44] dark:group-hover:text-primary transition-colors shrink-0 ml-1" />
            </button>
          );
        })}
      </div>

      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-6xl h-[95vh] rounded-[1.5rem] p-0 overflow-hidden border-none shadow-2xl flex flex-col bg-white dark:bg-background [&>button]:hidden">
          {/* Streamlined Premium Header */}
          <div className="flex items-center justify-between p-3 px-6 bg-card/50 backdrop-blur-md relative z-20 shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-sm font-black tracking-tight truncate max-w-[300px] md:max-w-[500px]">
                  {previewDoc?.document?.fileName || previewDoc?.document?.name || "Document Preview"}
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    DOCUMENT PREVIEW
                  </span>
                  {previewDoc?.category && (
                    <>
                      <span className="text-muted-foreground/30">•</span>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/50 px-2 py-0.5 rounded-full">
                        {previewDoc.category}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {previewDoc && (previewDoc.document?.fileUrl || previewDoc.document?.fileData) && (
                <Button variant="outline" size="sm" className="rounded-full font-bold h-10 px-5 bg-card/80 border border-muted text-primary hover:bg-primary/5 hidden sm:flex shadow-sm" asChild>
                  <a href={previewDoc.document.fileUrl || previewDoc.document.fileData} target="_blank" rel="noopener noreferrer">
                    <Link2 className="w-4 h-4 mr-2" />
                    Open Original
                  </a>
                </Button>
              )}
              <Button
                variant="secondary"
                size="icon"
                className="h-10 w-10 rounded-full hover:bg-muted/80 bg-muted/50 border-none shadow-none text-foreground"
                onClick={() => setPreviewDoc(null)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden relative bg-muted/30">
            {previewDoc ? (
              (() => {
                const url = previewDoc.document?.fileUrl || previewDoc.document?.fileData || "";
                const type = previewDoc.document?.mimeType?.toLowerCase() || previewDoc.document?.type?.toLowerCase() || "";
                const name = (previewDoc.document?.fileName || previewDoc.document?.name || "").toLowerCase();
                const isImage = type.includes('image') || name.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)$/);
                const isPDF = type.includes('pdf') || name.endsWith('.pdf');

                if (isPDF) {
                  return (
                    <iframe
                      src={url}
                      className="w-full h-full bg-white"
                      title={previewDoc.document?.fileName || "Preview"}
                    />
                  );
                }

                if (isImage) {
                  return (
                    <div className="w-full h-full flex items-center justify-center p-4">
                      <img
                        src={url}
                        alt={previewDoc.document?.fileName || "Preview"}
                        className="max-w-full max-h-full object-contain rounded-xl shadow-sm border border-muted/50 bg-white"
                      />
                    </div>
                  );
                }

                return (
                  <div className="w-full h-full flex items-center justify-center p-4">
                    <div className="text-center space-y-4 max-w-md w-full bg-white p-8 rounded-[1.5rem] border border-muted/50 shadow-sm">
                      <div className="w-20 h-20 bg-primary/5 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
                        <FileText className="w-10 h-10" />
                      </div>
                      <h3 className="text-lg font-black uppercase tracking-tight mb-2">Preview not available</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        We can't preview this file type directly in the browser. You can still open it in a new tab.
                      </p>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <Button variant="default" className="w-full mt-4 h-12 rounded-xl text-xs font-bold uppercase tracking-widest group shadow-md transition-all">
                          <ExternalLink className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
                          Open in new tab
                        </Button>
                      </a>
                    </div>
                  </div>
                );
              })()
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CreateWirRequest() {
  const { activityId } = useParams();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { uploadFile, isUploading } = useUpload();

  // Parse query parameters
  const searchParams = new URLSearchParams(window.location.search);
  const typeIdParam = searchParams.get("typeId");
  const linkedNcrIdParam = searchParams.get("linkedNcrId");

  // State for selections
  const [selectedLocations, setSelectedLocations] = useState<SelectedWorkLocation[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<SelectedWorkLevel[]>([]);
  const [levelSearchOpen, setLevelSearchOpen] = useState(false);
  const [selectedPurposeId, setSelectedPurposeId] = useState<string>("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDeliveries, setSelectedDeliveries] = useState<SelectedDelivery[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<SelectedSupplier[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<Material[]>([]);
  const [ncrType, setNcrType] = useState<string>("Minor");
  const [ncrSource, setNcrSource] = useState<string>("Inspection");
  const [ncrSubject, setNcrSubject] = useState<string>("");
  const [ncrDescription, setNcrDescription] = useState<string>("");
  const [selectedLinkedNcrId, setSelectedLinkedNcrId] = useState<string>(linkedNcrIdParam || "");
  // Validation dialog
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [validating, setValidating] = useState(false);

  // Dialog states
  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [addDeliveryOpen, setAddDeliveryOpen] = useState(false);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [createSupplierOpen, setCreateSupplierOpen] = useState(false);
  const [supplierToEdit, setSupplierToEdit] = useState<Supplier | null>(null);
  const [addMaterialOpen, setAddMaterialOpen] = useState(false);
  const [createMaterialOpen, setCreateMaterialOpen] = useState(false);
  const [materialToEdit, setMaterialToEdit] = useState<Material | null>(null);
  const [isProjectStorageOpen, setIsProjectStorageOpen] = useState(false);
  const [linkSupplierOpen, setLinkSupplierOpen] = useState(false);
  const [materialToLinkSupplier, setMaterialToLinkSupplier] = useState<Material | null>(null);

  // Fetch linked suppliers for the currently linking material
  const { data: linkedSuppliersForMaterial = [] } = useQuery<any[]>({
    queryKey: ["/api/materials", materialToLinkSupplier?.id, "suppliers"],
    enabled: !!materialToLinkSupplier?.id && linkSupplierOpen,
  });

  // Filter states
  const [buildingFilter, setBuildingFilter] = useState("all-buildings");
  const [floorFilter, setFloorFilter] = useState("all-floors");
  const [partFilter, setPartFilter] = useState("all-parts");

  // Fetch activity details
  const { data: activity, isLoading: activityLoading } = useQuery<Activity & {
    requestId?: string;
    divisionCode?: string | null;
    chapterCode?: string | null;
    divisionName?: string | null;
    chapterName?: string | null;
  }>({
    queryKey: ["/api/activities", activityId],
    enabled: !!activityId,
  });

  // Fetch work locations for the project
  const { data: workLocations = [] } = useQuery<WorkLocation[]>({
    queryKey: ["/api/projects", activity?.projectId, "work-locations"],
    enabled: !!activity?.projectId,
  });

  const [locationSearch, setLocationSearch] = useState("");

  const filteredWorkLocations = useMemo(() => {
    return workLocations.filter((loc: WorkLocation) => {
      const matchesBuilding = !buildingFilter || buildingFilter === "all-buildings" || loc.buildingNo === buildingFilter;
      const matchesFloor = !floorFilter || floorFilter === "all-floors" || loc.floor === floorFilter;
      const matchesPart = !partFilter || partFilter === "all-parts" || loc.part === partFilter;
      const notSelected = !selectedLocations.find(s => s.id === loc.id);

      if (!matchesBuilding || !matchesFloor || !matchesPart || !notSelected) return false;

      if (!locationSearch) return true;

      const search = locationSearch.toLowerCase();
      return (
        (loc.unitCustomNumber?.toLowerCase().includes(search)) ||
        (loc.unitZone?.toLowerCase().includes(search)) ||
        (loc.unitBlock?.toLowerCase().includes(search)) ||
        (loc.buildingNo?.toLowerCase().includes(search)) ||
        (loc.floor?.toLowerCase().includes(search)) ||
        (loc.part?.toLowerCase().includes(search))
      );
    });
  }, [workLocations, buildingFilter, floorFilter, partFilter, selectedLocations, locationSearch]);

  const buildings = useMemo(() => Array.from(new Set(workLocations.map((l: WorkLocation) => l.buildingNo).filter(Boolean))), [workLocations]);
  const floors = useMemo(() => Array.from(new Set(workLocations.map((l: WorkLocation) => l.floor).filter(Boolean))), [workLocations]);
  const parts = useMemo(() => Array.from(new Set(workLocations.map((l: WorkLocation) => l.part).filter(Boolean))), [workLocations]);

  // Fetch work levels for the project
  const { data: workLevels = [] } = useQuery<WorkLevel[]>({
    queryKey: ["/api/projects", activity?.projectId, "work-levels"],
    enabled: !!activity?.projectId,
  });

  // Fetch purposes
  const { data: purposes = [] } = useQuery<Purpose[]>({
    queryKey: ["/api/purposes"],
  });

  // Fetch positions to map user position to purpose
  const { data: positions = [] } = useQuery<any[]>({
    queryKey: ["/api/positions"],
  });

  // Filter purposes based on user positions
  const filteredPurposes = useMemo(() => {
    if (!user?.positions || user.positions.length === 0 || positions.length === 0) {
      return purposes; // If user has no positions mapped, show all
    }
    const userPurposeIds = positions
      .filter(p => user.positions?.includes(p.titleEnglish) && p.purposeId)
      .map(p => p.purposeId);

    if (userPurposeIds.length > 0) {
      return purposes.filter(p => userPurposeIds.includes(p.id));
    }

    return purposes;
  }, [purposes, user?.positions, positions]);

  // Fetch request details to get more robust data
  const { data: request } = useQuery<Request>({
    queryKey: ["/api/requests", activity?.requestId],
    enabled: !!activity?.requestId,
  });

  // Fetch request type for the activity
  const { data: requestType } = useQuery<RequestType>({
    queryKey: ["/api/request-types", typeIdParam || activity?.requestTypeId || request?.requestTypeId],
    enabled: !!(typeIdParam || activity?.requestTypeId || request?.requestTypeId),
  });

  const isMAR = requestType?.code?.toUpperCase() === "MAR";
  const isMIR = (requestType?.code?.toUpperCase() === "MIR" || requestType?.name_english?.toUpperCase().includes("MATERIAL")) && !isMAR;
  const isSSR = requestType?.code?.toUpperCase() === "SSR" || requestType?.name_english?.toUpperCase().includes("SUPPLIER");
  const isDSR = requestType?.code?.toUpperCase() === "DSR" || requestType?.name_english?.toUpperCase().includes("DOCUMENT SUBMITTAL");
  const isSD = requestType?.code?.toUpperCase() === "SD" || requestType?.code?.toUpperCase() === "ASD" || requestType?.name_english?.toUpperCase().includes("SHOP DRAWING") || requestType?.name_english?.toUpperCase().includes("DRAWING");
  const isRNCR = requestType?.code?.toUpperCase() === "RNCR";
  const isNCR = requestType?.code?.toUpperCase() === "NCR" || isRNCR;
  const isSI = requestType?.code?.toUpperCase() === "SI";

  const { data: allRequestTypes = [] } = useQuery<RequestType[]>({
    queryKey: ["/api/request-types"],
    enabled: isRNCR,
  });

  const { data: projectRequests = [] } = useQuery<Request[]>({
    queryKey: ["/api/requests", { projectId: activity?.projectId }],
    enabled: !!activity?.projectId && isRNCR,
  });

  const ncrRequests = useMemo(() => {
    const ncrType = allRequestTypes.find(rt => rt.code?.toUpperCase() === "NCR");
    const rncrType = allRequestTypes.find(rt => rt.code?.toUpperCase() === "RNCR");
    if (!ncrType || !rncrType) return [];

    // Find all linked NCR IDs from other active RNCRs
    const linkedNcrIds = new Set(
      projectRequests
        .filter((r: any) => r.requestTypeId === rncrType.id && !r.is_deleted && r.currentStatus !== "Rejected" && r.currentStatus !== "Closed")
        .map((r: any) => r.currentRevision?.metadata?.linkedNcrId || r.metadata?.linkedNcrId)
        .filter(Boolean)
    );

    return projectRequests.filter((r: any) =>
      r.requestTypeId === ncrType.id &&
      !r.is_deleted && r.currentStatus !== "Rejected" && r.currentStatus !== "Closed" &&
      (!linkedNcrIds.has(r.id) || r.id === selectedLinkedNcrId || r.id === linkedNcrIdParam)
    );
  }, [allRequestTypes, projectRequests, selectedLinkedNcrId, linkedNcrIdParam]);

  // Fetch materials for the project
  const { data: projectMaterials = [] } = useQuery<Material[]>({
    queryKey: ["/api/materials", { projectId: activity?.projectId }],
    enabled: !!activity?.projectId && isMAR,
  });

  const { data: assignedMaterialIds = [] } = useQuery<string[]>({
    queryKey: [
      "/api/projects",
      activity?.projectId,
      "assigned-materials",
      ...(activity?.requestId ? [{ excludeRequestId: activity.requestId }] : [])
    ],
    enabled: !!activity?.projectId && isMAR,
  });

  // Fetch deliveries for the project
  const { data: projectDeliveries = [] } = useQuery<EnrichedDelivery[]>({
    queryKey: ["/api/projects", activity?.projectId, "deliveries"],
    enabled: !!activity?.projectId && isMIR,
  });

  // Fetch suppliers for the project
  const { data: projectSuppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers", { projectId: activity?.projectId }],
    enabled: !!activity?.projectId && (isSSR || isMAR),
  });

  // Fetch globally assigned supplier IDs for the project, excluding the current request's suppliers
  const { data: assignedSupplierIds = [] } = useQuery<string[]>({
    queryKey: [
      "/api/projects",
      activity?.projectId,
      "assigned-suppliers",
      ...(activity?.requestId ? [{ excludeRequestId: activity.requestId }] : [])
    ],
    enabled: !!activity?.projectId && isSSR,
  });

  // Fetch existing documents if request exists
  const { data: existingDocuments } = useQuery<RequestDocument[]>({
    queryKey: ["/api/requests", activity?.requestId, "latest-revision", "documents"],
    enabled: !!activity?.requestId,
  });

  // Fetch existing purposes if request exists
  const { data: existingPurposes } = useQuery<RequestPurpose[]>({
    queryKey: ["/api/requests", activity?.requestId, "latest-revision", "purposes"],
    enabled: !!activity?.requestId,
  });

  // Fetch existing work locations if request exists
  const { data: existingWLocs } = useQuery<RequestWorkLocation[]>({
    queryKey: ["/api/requests", activity?.requestId, "latest-revision", "work-locations"],
    enabled: !!activity?.requestId,
  });

  // Fetch existing work levels if request exists
  const { data: existingWLevels } = useQuery<{ id: string; workLevelId: string }[]>({
    queryKey: ["/api/revisions", (activity as any)?.latestRevisionId, "work-levels"],
    enabled: !!(activity as any)?.latestRevisionId,
  });

  // Fetch existing deliveries if request exists
  const { data: existingDeliveries = [] } = useQuery<{ id: string; deliveryId: string; delivery: EnrichedDelivery }[]>({
    queryKey: ["/api/revisions", (activity as any)?.latestRevisionId, "deliveries"],
    enabled: !!(activity as any)?.latestRevisionId && isMIR,
  });

  // Fetch existing suppliers if request exists
  const { data: existingSuppliers = [] } = useQuery<{ id: string; supplierId: string; supplier: Supplier }[]>({
    queryKey: ["/api/revisions", (activity as any)?.latestRevisionId, "suppliers"],
    enabled: !!(activity as any)?.latestRevisionId && isSSR,
  });

  // Fetch existing materials if request exists
  const { data: existingMaterials = [] } = useQuery<{ id: string; materialId: string; material: Material }[]>({
    queryKey: ["/api/revisions", (activity as any)?.latestRevisionId, "materials"],
    enabled: !!(activity as any)?.latestRevisionId && isMAR,
  });

  const handleSelectFromStorage = (selections: { document: any, title: string }[]) => {
    const newAttachments = selections.map(selection => {
      const doc = selection.document;
      const title = selection.title;
      return {
        id: `storage-${doc.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: title || "",
        documentType: doc.documentType || (isSD ? "Drawing" : ""),
        documentRef: doc.documentRef || "",
        files: [{
          file: null,
          fileName: doc.fileName || doc.name,
          fileUrl: doc.fileData || doc.fileUrl,
          projectDocumentId: doc.sourceType === 'project' ? doc.id : null,
          sourceType: "project",
          fileSize: doc.size || doc.fileSize
        }]
      };
    });
    setAttachments([...attachments, ...newAttachments]);
    setIsProjectStorageOpen(false);
    toast({ title: "Success", description: `${selections.length} documents added from storage` });
  };

  // Populate state from existing data
  useEffect(() => {
    if (existingDocuments && attachments.length === 0) {
      const mappedAttachments: Attachment[] = [];
      existingDocuments.forEach(doc => {
        mappedAttachments.push({
          id: doc.id,
          title: doc.title,
          documentType: doc.documentType || "",
          documentRef: doc.documentRef || "",
          files: [{
            file: null,
            fileName: doc.fileName,
            fileUrl: doc.fileUrl || undefined,
          }]
        });
      });
      setAttachments(mappedAttachments);
    }
  }, [existingDocuments, attachments.length]);

  useEffect(() => {
    if (existingPurposes && existingPurposes.length > 0 && !selectedPurposeId) {
      setSelectedPurposeId(existingPurposes[0].purposeId);
    }
  }, [existingPurposes, selectedPurposeId]);

  useEffect(() => {
    // Auto-select purpose based on user's position if not already selected and not editing
    if (!selectedPurposeId && purposes.length > 0 && user?.positions && user.positions.length > 0 && positions.length > 0) {
      const userPosition = positions.find(p => user.positions?.includes(p.titleEnglish));
      if (userPosition && userPosition.purposeId) {
        setSelectedPurposeId(userPosition.purposeId);
      }
    }
  }, [purposes, user?.positions, positions, selectedPurposeId]);

  useEffect(() => {
    if (existingWLocs && existingWLocs.length > 0 && selectedLocations.length === 0 && workLocations.length > 0) {
      const mapped = existingWLocs.map(wl => {
        const fullLoc = workLocations.find(l => l.id === wl.workLocationId);
        return {
          id: wl.workLocationId,
          unit: wl.unit || fullLoc?.unitCustomNumber || "",
          zone: wl.zone || fullLoc?.unitZone || "",
          block: wl.block || fullLoc?.unitBlock || "",
          building: wl.building || fullLoc?.buildingNo || "",
          floor: wl.floor || fullLoc?.floor || "",
          part: wl.part || fullLoc?.part || "",
        };
      });
      setSelectedLocations(mapped);
    }
  }, [existingWLocs, workLocations, selectedLocations.length]);

  useEffect(() => {
    if (existingWLevels && existingWLevels.length > 0 && selectedLevels.length === 0 && workLevels.length > 0) {
      const mapped = existingWLevels.map(wl => {
        const fullLevel = workLevels.find(l => l.id === wl.workLevelId);
        if (!fullLevel) return null;
        return {
          id: fullLevel.id,
          code: fullLevel.code,
          title: fullLevel.nameEnglish,
        };
      }).filter(Boolean) as SelectedWorkLevel[];
      setSelectedLevels(mapped);
    }
  }, [existingWLevels, workLevels, selectedLevels.length]);

  useEffect(() => {
    if (existingDeliveries && existingDeliveries.length > 0 && selectedDeliveries.length === 0 && projectDeliveries.length > 0) {
      const mapped = existingDeliveries.map(ed => ({
        id: ed.deliveryId,
        shipmentNumber: ed.delivery?.shipmentNumber || "Unknown",
        deliveryInvoiceNumber: ed.delivery?.deliveryInvoiceNumber || null,
        materialName: ed.delivery?.items?.map(i => i.materialName).join(", ") || "Unknown",
        supplier: ed.delivery?.supplier || "Unknown",
        arrivalDate: ed.delivery?.arrivalDate || null
      }));
      setSelectedDeliveries(mapped);
    }
  }, [existingDeliveries, projectDeliveries, selectedDeliveries.length]);

  useEffect(() => {
    if (existingSuppliers && existingSuppliers.length > 0 && selectedSuppliers.length === 0 && projectSuppliers.length > 0) {
      const mapped = existingSuppliers.map(es => ({
        id: es.supplierId,
        supplierName: es.supplier?.supplierName || "Unknown",
        email: es.supplier?.email || null,
        phone: es.supplier?.phone || null,
        category: es.supplier?.category || null,
        contactPerson: es.supplier?.contactPerson || null,
        experienceYears: es.supplier?.experienceYears || null,
      }));
      setSelectedSuppliers(mapped);
    }
  }, [existingSuppliers, projectSuppliers, selectedSuppliers.length]);

  useEffect(() => {
    if (existingMaterials && existingMaterials.length > 0 && selectedMaterials.length === 0 && projectMaterials.length > 0) {
      const mapped = existingMaterials.map(em => em.material);
      setSelectedMaterials(mapped);
    }
  }, [existingMaterials, projectMaterials, selectedMaterials.length]);

  useEffect(() => {
    if (activity?.description && !ncrDescription) {
      // Ignore auto-generated default descriptions
      const isAutoGenerated =
        (activity.description.startsWith("Request ") && activity.description.endsWith(" created")) ||
        activity.description === "New request created";

      if (!isAutoGenerated) {
        setNcrDescription(activity.description);
      }
    }
  }, [activity?.description]);

  useEffect(() => {
    if (activity && !ncrSubject) {
      if (isSI || isNCR) {
        const metaSubject = (activity as any)?.metadata?.subject || (activity as any)?.metadata?.ncrSubject;
        if (metaSubject) {
          setNcrSubject(metaSubject);
        } else if (activity.title && !activity.title.endsWith("Request") && !activity.title.includes("New request")) {
          setNcrSubject(activity.title);
        }
      }
    }
  }, [activity, isSI, isNCR, ncrSubject]);

  // Mutations and Handlers
  const submitMutation = useMutation({
    mutationFn: async (isDraft: boolean = false) => {
      const requestId = activity?.requestId;
      const purpose = purposes.find(p => p.id === selectedPurposeId);

      if (requestId) {
        // Fetch the latest revision
        const revisionRes = await apiRequest("GET", `/api/requests/${requestId}/latest-revision`);
        const latestRevision = await revisionRes.json();

        if (latestRevision?.id) {
          // Update purpose
          if (purpose) {
            await apiRequest("DELETE", `/api/revisions/${latestRevision.id}/purposes`);
            await apiRequest("POST", `/api/revisions/${latestRevision.id}/purposes`, {
              purposeId: purpose.id,
              purposeName: `${purpose.code} - ${purpose.nameEnglish}`,
              purposeCategory: (purpose as any).category || null,
            });

            if ((isMIR || isSD) && request?.requestNumber) {
              const parts = request.requestNumber.split('-');
              const prefix = parts[0];
              const counter = parts[parts.length - 1];
              const newRequestNumber = `${prefix}-${purpose.code}-${counter}`;

              if (request.requestNumber !== newRequestNumber) {
                await apiRequest("PATCH", `/api/requests/${requestId}`, {
                  requestNumber: newRequestNumber
                });
              }
            }
          }

          // Update documents
          if (attachments.length > 0) {
            await apiRequest("DELETE", `/api/revisions/${latestRevision.id}/documents`);
            for (const attachment of attachments) {
              for (const fileItem of attachment.files) {
                let fileUrl = fileItem.fileUrl;
                // Handle direct file upload if a file object exists and no URL yet
                if (fileItem.file && !fileUrl) {
                  const uploadResult = await uploadFile(fileItem.file);
                  if (uploadResult) {
                    fileUrl = uploadResult.objectPath;
                  }
                }

                await apiRequest("POST", `/api/revisions/${latestRevision.id}/documents`, {
                  title: attachment.title,
                  fileName: fileItem.fileName,
                  fileSize: fileItem.file?.size || null,
                  mimeType: fileItem.file?.type || null,
                  fileUrl: fileUrl || null,
                  projectDocumentId: fileItem.projectDocumentId || null,
                  sourceType: fileItem.sourceType || "upload",
                  documentType: attachment.documentType || null,
                  documentRef: attachment.documentRef || null,
                });
              }
            }
          }

          // Update locations
          if (!isMIR && !isSSR && !isMAR && !isDSR && selectedLocations.length > 0) {
            await apiRequest("DELETE", `/api/revisions/${latestRevision.id}/work-locations`);
            for (const location of selectedLocations) {
              await apiRequest("POST", `/api/revisions/${latestRevision.id}/work-locations`, {
                workLocationId: location.id,
                unit: location.unit || null,
                zone: location.zone || null,
                block: location.block || null,
                building: location.building || null,
                floor: location.floor || null,
                part: location.part || null,
              });
            }
          }

          // Update work levels
          if (!isMIR && !isSSR && !isMAR && !isDSR && !isNCR && selectedLevels.length > 0) {
            await apiRequest("DELETE", `/api/revisions/${latestRevision.id}/work-levels`);
            for (const level of selectedLevels) {
              await apiRequest("POST", `/api/revisions/${latestRevision.id}/work-levels`, {
                workLevelId: level.id,
              });
            }

            await apiRequest("PATCH", `/api/revisions/${latestRevision.id}`, {
              workLevelId: selectedLevels[0].id,
            });
          }

          // Update deliveries
          if (isMIR && selectedDeliveries.length > 0) {
            await apiRequest("DELETE", `/api/revisions/${latestRevision.id}/deliveries`);
            for (const delivery of selectedDeliveries) {
              await apiRequest("POST", `/api/revisions/${latestRevision.id}/deliveries`, {
                deliveryId: delivery.id,
              });
            }
          }

          // Update suppliers
          if (isSSR && selectedSuppliers.length > 0) {
            await apiRequest("DELETE", `/api/revisions/${latestRevision.id}/suppliers`);
            for (const supplier of selectedSuppliers) {
              await apiRequest("POST", `/api/revisions/${latestRevision.id}/suppliers`, {
                supplierId: supplier.id,
              });
            }
          }

          // Update materials
          if (isMAR && selectedMaterials.length > 0) {
            await apiRequest("DELETE", `/api/revisions/${latestRevision.id}/materials`);
            for (const material of selectedMaterials) {
              await apiRequest("POST", `/api/revisions/${latestRevision.id}/materials`, {
                materialId: material.id,
              });
            }
          }
          // Update metadata and description for NCR or SI
          if (isNCR || isSI) {
            let ncrMetadata: any = { ncrType, ncrSource, ncrSubject };
            if (isRNCR) {
              const selectedNcr = ncrRequests.find(r => r.id === selectedLinkedNcrId);
              ncrMetadata = {
                ncrSubject: selectedNcr ? `Re: ${selectedNcr.requestNumber}` : "Re: NCR",
                linkedNcrId: selectedLinkedNcrId
              };
            } else if (isSI) {
              ncrMetadata = {
                subject: ncrSubject,
                purpose: selectedPurposeId ? purposes.find(p => p.id === selectedPurposeId)?.nameEnglish : "",
                description: ncrDescription
              };
            }
            await apiRequest("PATCH", `/api/revisions/${latestRevision.id}`, {
              metadata: ncrMetadata,
              description: ncrDescription,
              title: ncrSubject || "Site Instruction"
            });
          }
        }
      }

      const locationSummary = (!isMIR && !isSSR && !isMAR && !isDSR) ? selectedLocations.map(l =>
        `${l.unit || l.building || "Location"} - ${l.zone || ""} ${l.floor || ""}`
      ).join(", ") : "";
      const levelSummary = (!isMIR && !isSSR && !isMAR && !isDSR && !isNCR) ? selectedLevels.map(l => l.code).join(", ") : "";
      const deliverySummary = isMIR ? selectedDeliveries.map(d => d.shipmentNumber).join(", ") : "";
      const supplierSummary = isSSR ? selectedSuppliers.map(s => s.supplierName).join(", ") : "";
      const materialSummary = isMAR ? selectedMaterials.map(m => m.materialName).join(", ") : "";

      const updatedDescription = [
        (isNCR || isSI) ? ncrDescription : (activity?.description || ""),
        (!isMIR && !isSSR && !isMAR && !isDSR) && locationSummary ? `Locations: ${locationSummary}` : "",
        (!isMIR && !isSSR && !isMAR && !isDSR && !isNCR) && levelSummary ? `Levels: ${levelSummary}` : "",
        isMIR && deliverySummary ? `Deliveries: ${deliverySummary}` : "",
        isSSR && supplierSummary ? `Suppliers: ${supplierSummary}` : "",
        isMAR && materialSummary ? `Materials: ${materialSummary}` : "",
        purpose ? `Purpose: ${purpose.code} - ${purpose.nameEnglish}` : "",
        attachments.length > 0 ? `Attachments: ${attachments.length} files` : "",
      ].filter(Boolean).join(" | ");

      return await apiRequest("PATCH", `/api/activities/${activityId}`, {
        description: updatedDescription,
      });
    },
    onSuccess: async (data, isDraft) => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/revisions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", activity?.projectId, "form-settings"] });

      try {
        const freshActivity = await fetch(`/api/activities/${activityId}`, { credentials: 'include' }).then(r => r.json());
        if (freshActivity?.requestId) {
          const responseData = await fetch(`/api/requests/${freshActivity.requestId}/transitions`, { credentials: 'include' }).then(r => r.json());
          const transitions = responseData.transitions || [];

          const submissionTransition = transitions.find((t: any) =>
            t.allowedStatus === "Submitted" || t.allowedStatus === "Under Review"
          );

          if (submissionTransition && !isDraft) {
            const res = await apiRequest("POST", `/api/requests/${freshActivity.requestId}/move`, {
              toStepId: submissionTransition.toStepId,
              newStatus: submissionTransition.allowedStatus
            });
            if (res.ok) {
              toast({ title: "Success", description: "Request submitted and moved to next step" });
              navigate(`/projects/${activity?.projectId}/requests`);
            } else {
              const errData = await res.json();
              throw new Error(errData.error || "Transition failed");
            }
          } else {
            toast({ title: "Success", description: isDraft ? "Request saved as draft (تم الحفظ كمسودة)" : "Activity updated successfully" });
            navigate(`/projects/${activity?.projectId}/requests`);
          }
        } else {
          toast({ title: "Success", description: isDraft ? "Request saved as draft (تم الحفظ كمسودة)" : "Activity updated successfully" });
          navigate(`/projects/${activity?.projectId}/requests`);
        }
      } catch (err: any) {
        toast({ title: "Warning", description: `Updated but workflow transition failed: ${err.message}`, variant: "destructive" });
        navigate(`/projects/${activity?.projectId}/requests`);
      }
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const handleSubmit = async () => {
    setValidating(true);
    const missing: string[] = [];

    if (!selectedPurposeId) {
      missing.push("Purpose (الغرض)");
    }

    const checkSupplierCompleteness = async (sup: any, contextLabel: string) => {
      // 1. Check basic fields
      const missingFields = [];
      if (!sup.category) missingFields.push("Category");
      if (!sup.taxNumber) missingFields.push("Tax Number");
      if (sup.experienceYears === null || sup.experienceYears === undefined) missingFields.push("Experience Years");
      if (!sup.email) missingFields.push("Email");
      if (!sup.contactPerson) missingFields.push("Contact Person");
      if (!sup.phone) missingFields.push("Phone");
      if (!sup.address) missingFields.push("Address");

      if (missingFields.length > 0) {
        missing.push(`${contextLabel} '${sup.supplierName}': missing profile fields (${missingFields.join(", ")})`);
      }

      // 2. Check attachments
      try {
        const res = await fetch(`/api/suppliers/${sup.id}/attachments`);
        if (res.ok) {
          const atts = await res.json();
          const categories = atts.map((a: any) => a.category);
          const required = [
            "Government (حكومي)",
            "Company Profile (ملف الشركة)",
            "License (رخصة)",
            "Commercial Register (السجل التجاري)"
          ];
          const missingForSup = required.filter((req: string) => !categories.includes(req));
          if (missingForSup.length > 0) {
            missing.push(`${contextLabel} '${sup.supplierName}': missing documents (${missingForSup.join(", ")})`);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    if (isSSR) {
      if (selectedSuppliers.length === 0) {
        missing.push("Select one Supplier (اختيار مورد واحد)");
      } else {
        // Fetch attachments and validate selected suppliers
        for (const sup of selectedSuppliers) {
          await checkSupplierCompleteness(sup, "Supplier");
        }
      }
    }

    if (isMAR) {
      if (selectedMaterials.length === 0) {
        missing.push("Select at least one Material (اختيار مادة واحدة على الأقل)");
      } else {
        // Fetch attachments for selected materials
        for (const mat of selectedMaterials) {
          try {
            const res = await fetch(`/api/materials/${mat.id}/attachments`);
            if (res.ok) {
              const atts = await res.json();
              const categories = atts.map((a: any) => a.category?.toLowerCase() || "");
              const required = [
                { keywords: ["tds", "datasheet", "technical"], label: "Technical DataSheet (TDS)" },
                { keywords: ["quality", "certificate"], label: "Quality Certificate (QC)" }
              ];
              const missingForMat = required.filter(req => !categories.some((c: string) => req.keywords.some(k => c.includes(k)))).map(r => r.label);
              if (missingForMat.length > 0) {
                missing.push(`Material '${mat.materialName}': missing ${missingForMat.join(", ")}`);
              }
            }
          } catch (err) {
            console.error(err);
          }

          // Fetch and validate linked suppliers
          try {
            const resSup = await fetch(`/api/materials/${mat.id}/suppliers`);
            if (resSup.ok) {
              const linkedSups = await resSup.json();
              for (const link of linkedSups) {
                if (link.supplier) {
                  await checkSupplierCompleteness(link.supplier, `Supplier linked to '${mat.materialName}'`);
                }
              }
            }
          } catch (err) {
            console.error(err);
          }
        }
      }
    }

    setValidating(false);

    if (missing.length > 0) {
      setMissingFields(missing);
      setShowValidationDialog(true);
      return;
    }

    submitMutation.mutate(false);
  };

  const handleRemoveLocation = (id: string) => {
    setSelectedLocations(selectedLocations.filter((l) => l.id !== id));
  };

  const handleAddLocationById = (id: string) => {
    const loc = workLocations.find(l => l.id === id);
    if (loc && !selectedLocations.find(s => s.id === id)) {
      setSelectedLocations([...selectedLocations, {
        id: loc.id,
        unit: loc.unitCustomNumber || "",
        zone: loc.unitZone || "",
        block: loc.unitBlock || "",
        building: loc.buildingNo || "",
        floor: loc.floor || "",
        part: loc.part || "",
      }]);
    }
  };

  const handleSelectAllFiltered = () => {
    const newLocations = filteredWorkLocations.filter(loc => !selectedLocations.some(s => s.id === loc.id));
    const mappedNew = newLocations.map(loc => ({
      id: loc.id,
      unit: loc.unitCustomNumber || "",
      zone: loc.unitZone || "",
      block: loc.unitBlock || "",
      building: loc.buildingNo || "",
      floor: loc.floor || "",
      part: loc.part || "",
    }));
    setSelectedLocations([...selectedLocations, ...mappedNew]);
  };

  const handleDeselectAll = () => {
    setSelectedLocations([]);
  };

  const handleSelectLevel = (levelId: string) => {
    const level = workLevels.find(l => l.id === levelId);
    if (!level) return;

    if (selectedLevels.some(sl => sl.id === levelId)) {
      setSelectedLevels(selectedLevels.filter(sl => sl.id !== levelId));
    } else {
      setSelectedLevels([...selectedLevels, {
        id: level.id,
        code: level.code,
        title: level.nameEnglish,
      }]);
    }
  };

  const handleRemoveLevel = (levelId: string) => {
    setSelectedLevels(selectedLevels.filter(sl => sl.id !== levelId));
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(attachments.filter((a) => a.id !== id));
  };

  const handleRemoveDelivery = (id: string) => {
    setSelectedDeliveries(selectedDeliveries.filter((d) => d.id !== id));
  };

  const handleAddDeliveryById = (id: string) => {
    const delivery = projectDeliveries.find(d => d.id === id);
    if (delivery && !selectedDeliveries.find(s => s.id === id)) {
      setSelectedDeliveries([...selectedDeliveries, {
        id: delivery.id,
        shipmentNumber: delivery.shipmentNumber,
        deliveryInvoiceNumber: delivery.deliveryInvoiceNumber,
        materialName: (delivery.items || []).map(i => i.materialName).join(", "),
        supplier: delivery.supplier,
        arrivalDate: delivery.arrivalDate,
      }]);
    }
  };

  const handleRemoveSupplier = (id: string) => {
    setSelectedSuppliers(selectedSuppliers.filter((s) => s.id !== id));
  };

  const handleAddSupplierById = (id: string) => {
    const supplier = projectSuppliers.find(s => s.id === id);
    if (!supplier) return;

    if (selectedSuppliers.some(s => s.id === id)) {
      setSelectedSuppliers(selectedSuppliers.filter(s => s.id !== id));
    } else {
      setSelectedSuppliers([...selectedSuppliers, {
        id: supplier.id,
        supplierName: supplier.supplierName,
        email: supplier.email,
        phone: supplier.phone,
        category: supplier.category,
        contactPerson: supplier.contactPerson,
        address: supplier.address,
        taxNumber: supplier.taxNumber,
        experienceYears: supplier.experienceYears,
        attachments: (supplier as any).attachments || [],
      }]);
    }
  };

  const handleRemoveMaterial = (id: string) => {
    setSelectedMaterials(selectedMaterials.filter((m) => m.id !== id));
  };

  const handleAddMaterialById = (id: string) => {
    const material = projectMaterials.find(m => m.id === id);
    if (!material) return;

    if (selectedMaterials.some(m => m.id === id)) {
      setSelectedMaterials(selectedMaterials.filter(m => m.id !== id));
    } else {
      setSelectedMaterials([...selectedMaterials, material]);
    }
  };

  if (activityLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingIcon size={80} />
      </div>
    );
  }

  const assembledCode = activity ? `${(activity as any).divisionCode || ""}${(activity as any).chapterCode || ""}${(activity as any).activityCode || ""}` : "";
  const activityCode = assembledCode || requestType?.code || "REQUEST";

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-background pb-20">
      <div className="container mx-auto py-8 max-w-7xl px-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Header section with back button and meta info */}
        <div className="flex items-center gap-4 mb-8 bg-white/70 dark:bg-card/70 backdrop-blur-xl p-5 rounded-3xl shadow-xl shadow-primary/5 border border-primary/10 sticky top-4 z-20 transition-all duration-300 hover:shadow-primary/10">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/projects/${activity?.projectId}/requests`)}
            className="rounded-2xl hover:bg-primary/10 hover:text-primary transition-all duration-300 active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex flex-col">
            <h1 className="text-2xl font-display font-bold tracking-tight text-foreground/90">Create Request</h1>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{activityCode}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-muted/30 p-1.5 rounded-2xl border border-border/40 min-w-[320px] ml-auto">
            <div className="bg-primary/10 p-2 rounded-xl">
              <Target className="w-4 h-4 text-primary" />
            </div>
            <Select value={selectedPurposeId} onValueChange={setSelectedPurposeId}>
              <SelectTrigger data-testid="select-purpose" className="border-none bg-transparent shadow-none focus:ring-0 min-w-[200px] h-9">
                <SelectValue placeholder="Select purpose" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-primary/10 shadow-xl">
                {filteredPurposes.map((purpose) => (
                  <SelectItem key={purpose.id} value={purpose.id} className="rounded-lg m-1">
                    {purpose.code} - {purpose.nameEnglish}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending || isUploading || validating}
              data-testid="button-submit-wir"
              className="rounded-xl bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 transition-all duration-300 active:scale-95 px-6"
            >
              {(submitMutation.isPending || validating) ? (
                <div className="flex items-center gap-2">
                  <LoadingIcon size={20} />
                  <span>{validating ? "Validating" : "Submitting"}</span>
                </div>
              ) : (
                "Submit"
              )}
            </Button>
          </div>
        </div>

        {/* Main Content - Stacked Vertically */}
        <div className="flex flex-col gap-8">
          {/* Left Column - Work Location or Deliveries */}
          {isMIR ? (
            <Card className="shadow-xl shadow-black/[0.03] border-none bg-white dark:bg-card overflow-hidden rounded-3xl transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 group">
              <CardContent className="p-0">
                <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between bg-primary/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary transition-transform duration-500 group-hover:rotate-12">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg tracking-tight">Deliveries</h3>
                      <p className="text-xs text-muted-foreground">Manage associated material shipments</p>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    className="rounded-2xl h-10 w-10 bg-primary shadow-lg shadow-primary/20 hover:scale-105 transition-all duration-300"
                    onClick={() => setAddDeliveryOpen(true)}
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
                <div className="p-4">
                  <div className="border border-border/40 rounded-2xl overflow-hidden bg-muted/5">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 border-none hover:bg-muted/30">
                          <TableHead className="w-10 text-center font-bold">#</TableHead>
                          <TableHead className="font-bold">Delivery No</TableHead>
                          <TableHead className="font-bold">Invoice No</TableHead>
                          <TableHead className="font-bold">Material</TableHead>
                          <TableHead className="font-bold">Supplier</TableHead>
                          <TableHead className="font-bold">Arrival Date</TableHead>
                          <TableHead className="w-16 text-right font-bold pr-6">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedDeliveries.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-20 bg-transparent">
                              <div className="flex flex-col items-center gap-4 max-w-[280px] mx-auto">
                                <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mb-2">
                                  <Building2 className="w-10 h-10 text-muted-foreground/30" />
                                </div>
                                <h4 className="font-semibold text-foreground/80">No Deliveries Associated</h4>
                                <p className="text-sm text-muted-foreground text-center">There are no deliveries linked to this request yet. Click the plus button above to add one.</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          selectedDeliveries.map((delivery, index) => (
                            <TableRow key={delivery.id} className="hover:bg-muted/30 transition-colors">
                              <TableCell>{index + 1}</TableCell>
                              <TableCell className="font-medium">{delivery.shipmentNumber}</TableCell>
                              <TableCell>{delivery.deliveryInvoiceNumber || "---"}</TableCell>
                              <TableCell>{delivery.materialName}</TableCell>
                              <TableCell>{delivery.supplier}</TableCell>
                              <TableCell>
                                {delivery.arrivalDate ? format(new Date(delivery.arrivalDate), "dd/MM/yyyy") : "---"}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                  onClick={() => handleRemoveDelivery(delivery.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (isNCR || isSI) ? (
            <Card className="shadow-xl shadow-black/[0.03] border-none bg-white dark:bg-card overflow-hidden rounded-3xl transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 group">
              <CardContent className="p-0">
                <div className="px-6 py-4 border-b border-border/40 flex flex-wrap gap-4 items-center justify-between bg-primary/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary transition-transform duration-500 group-hover:rotate-12">
                      <Target className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg tracking-tight">
                        {isSI ? "Site Instruction Details" : (isRNCR ? "RNCR Details" : "NCR Details")}
                      </h3>
                      {!isRNCR && !isSI && <p className="text-xs text-muted-foreground">Select NCR type and source</p>}
                      {isRNCR && <p className="text-xs text-muted-foreground">Select the NCR to reply to</p>}
                      {isSI && <p className="text-xs text-muted-foreground">Enter Site Instruction subject and details</p>}
                    </div>
                  </div>
                  {isRNCR && (
                    <div className="flex items-center gap-3 bg-white dark:bg-background p-2 px-4 rounded-3xl border border-border/50 shadow-sm">
                      <div className="flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-blue-500" />
                        <Label className="text-sm font-bold text-foreground/80 whitespace-nowrap">Reference NCR</Label>
                      </div>
                      <div className="flex-1 max-w-[300px]">
                        <div className="w-fit min-w-[150px] h-9 bg-muted/40 border border-border/50 px-4 rounded-2xl text-xs font-semibold text-foreground flex items-center justify-center gap-2">
                          {ncrRequests.find((req: any) => String(req.id) === String(selectedLinkedNcrId))?.requestNumber || selectedLinkedNcrId || "—"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {!isRNCR && !isSI && (
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/10">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white dark:bg-background p-4 rounded-3xl border border-border/50 shadow-sm">
                      <div className="flex items-center gap-2 min-w-[170px]">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <Label className="text-sm font-bold text-foreground/80 whitespace-nowrap">NCR Type</Label>
                      </div>
                      <Select value={ncrType} onValueChange={setNcrType}>
                        <SelectTrigger className="w-full bg-muted/30 border-muted focus:ring-primary/20 transition-all rounded-2xl">
                          <SelectValue placeholder="Select NCR Type" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                          <SelectItem value="Major" className="rounded-xl">
                            <span className="font-semibold text-destructive">Major</span>
                          </SelectItem>
                          <SelectItem value="Minor" className="rounded-xl">
                            <span className="font-medium text-amber-600">Minor</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white dark:bg-background p-4 rounded-3xl border border-border/50 shadow-sm">
                      <div className="flex items-center gap-2 min-w-[210px]">
                        <Eye className="w-4 h-4 text-blue-500" />
                        <Label className="text-sm font-bold text-foreground/80 whitespace-nowrap">Source of Non-Conformance</Label>
                      </div>
                      <Select value={ncrSource} onValueChange={setNcrSource}>
                        <SelectTrigger className="w-full bg-muted/30 border-muted focus:ring-primary/20 transition-all rounded-2xl">
                          <SelectValue placeholder="Select Source" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                          <SelectItem value="Inspection" className="rounded-xl">Inspection</SelectItem>
                          <SelectItem value="Audit" className="rounded-xl">Audit</SelectItem>
                          <SelectItem value="Other" className="rounded-xl">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="p-6 pt-6 bg-muted/10">
                  {!isRNCR && (
                    <div className="flex flex-col gap-3 bg-white dark:bg-background p-4 rounded-3xl border border-border/50 shadow-sm mb-6">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-bold text-foreground/80">Subject / الموضوع</Label>
                      </div>
                      <Input
                        value={ncrSubject}
                        onChange={(e: any) => setNcrSubject(e.target.value)}
                        placeholder={isSI ? "Enter subject for this Site Instruction..." : "Enter subject for this NCR..."}
                        className="rounded-2xl border-muted bg-muted/30 focus:bg-transparent text-lg font-semibold"
                        dir="auto"
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-3 bg-white dark:bg-background p-4 rounded-3xl border border-border/50 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-bold text-foreground/80">Description / الوصف التفصيلي</Label>
                    </div>
                    <Textarea
                      value={ncrDescription}
                      onChange={(e: any) => setNcrDescription(e.target.value)}
                      placeholder={isSI ? "Enter detailed instruction for this Site Instruction..." : "Enter detailed description for this NCR..."}
                      className="min-h-[250px] rounded-2xl border-muted bg-muted/30 focus:bg-transparent resize-y text-lg leading-relaxed"
                      dir="auto"
                    />
                  </div>
                </div>

              </CardContent>
            </Card>
          ) : isMAR ? (
            <Card className="shadow-xl shadow-black/[0.03] border-none bg-white dark:bg-card overflow-hidden rounded-3xl transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 group">
              <CardContent className="p-0">
                <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between bg-primary/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary transition-transform duration-500 group-hover:rotate-12">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg tracking-tight">Materials</h3>
                      <p className="text-xs text-muted-foreground">Select materials for approval</p>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    className="rounded-2xl h-10 w-10 bg-primary shadow-lg shadow-primary/20 hover:scale-105 transition-all duration-300"
                    onClick={() => setAddMaterialOpen(true)}
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
                <div className="p-6">
                  <div className="w-full">
                    {selectedMaterials.length === 0 ? (
                      <div className="flex flex-col items-center gap-4 max-w-[280px] mx-auto py-16">
                        <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mb-2">
                          <Package className="w-10 h-10 text-muted-foreground/30" />
                        </div>
                        <h4 className="font-semibold text-foreground/80">No Materials Selected</h4>
                        <p className="text-sm text-muted-foreground text-center">Please select the materials to be approved in this request.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {selectedMaterials.map((material, index) => (
                          <div key={material.id} className="bg-white dark:bg-card border border-border/40 rounded-[1.25rem] p-4 shadow-sm relative group transition-all duration-300 hover:shadow-md hover:border-primary/20 flex flex-col gap-4">

                            {/* Header Row: Thumbnail + Info + Actions */}
                            <div className="flex items-start justify-between w-full">
                              <div className="flex gap-4 flex-1 min-w-0">
                                {/* Thumbnail */}
                                <div className="w-14 h-14 rounded-[1rem] bg-muted/20 overflow-hidden shrink-0 border border-border/50 flex items-center justify-center relative shadow-sm group-hover:shadow-md transition-all group-hover:border-primary/20">
                                  {material.imageUrl ? (
                                    <img
                                      src={material.imageUrl}
                                      alt={material.materialName}
                                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                      onError={(e) => {
                                        (e.target as any).style.display = "none";
                                        (e.target as any).nextSibling.style.display = "flex";
                                      }}
                                    />
                                  ) : null}
                                  <div
                                    className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 text-primary/70 transition-colors group-hover:text-primary"
                                    style={{ display: material.imageUrl ? "none" : "flex" }}
                                  >
                                    <Package className="w-6 h-6" />
                                  </div>
                                </div>

                                {/* Info */}
                                <div className="flex flex-col gap-1.5 flex-1 min-w-0 justify-center">
                                  <h4 className="font-bold text-base text-foreground/90 truncate pr-2 group-hover:text-primary transition-colors">{material.materialName}</h4>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {material.materialCode && (
                                      <Badge variant="outline" className="bg-primary/5 text-primary/90 font-mono text-[10px] h-5 border-primary/20 px-1.5">
                                        ID: {material.materialCode}
                                      </Badge>
                                    )}
                                    <Badge variant="outline" className="bg-primary/5 text-primary/90 text-[10px] h-5 border-primary/20 px-1.5">
                                      {material.category || "General"}
                                    </Badge>
                                    {material.originCountry && (
                                      <Badge variant="secondary" className="bg-muted/50 text-muted-foreground text-[10px] h-5 border-none px-1.5" title="Country of Origin">
                                        Origin: {material.originCountry}
                                      </Badge>
                                    )}
                                    {material.unit && (
                                      <Badge variant="secondary" className="bg-muted/50 text-muted-foreground text-[10px] h-5 border-none px-1.5" title="Unit">
                                        Unit: {material.unit}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1 shrink-0 ml-2">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-colors"
                                  onClick={() => {
                                    setMaterialToLinkSupplier(material as Material);
                                    setLinkSupplierOpen(true);
                                  }}
                                  title="Link Supplier"
                                >
                                  <Link2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-colors"
                                  onClick={() => {
                                    setMaterialToEdit(material as Material);
                                    setCreateMaterialOpen(true);
                                  }}
                                  title="Edit Material"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
                                  onClick={() => handleRemoveMaterial(material.id)}
                                  title="Remove from request"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>


                            {/* Description (subtle) */}
                            {material.description && (
                              <div className="pl-[72px] -mt-2">
                                <p className="text-xs text-muted-foreground/70 leading-relaxed line-clamp-2">
                                  {material.description}
                                </p>
                              </div>
                            )}

                            {/* Action Bar for Attachments */}
                            <div className="flex items-center justify-start border-t border-border/40 pt-3 w-full bg-muted/5 -mx-4 px-4 -mb-4 pb-4 rounded-b-[1.25rem]">
                              <MaterialAttachmentsMenu materialId={material.id} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : isSSR ? (
            <Card className="shadow-xl shadow-black/[0.03] border-none bg-white dark:bg-card overflow-hidden rounded-3xl transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 group">
              <CardContent className="p-0">
                <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between bg-primary/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary transition-transform duration-500 group-hover:rotate-12">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg tracking-tight">Suppliers</h3>
                      <p className="text-xs text-muted-foreground">Select suppliers for approval</p>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    className="rounded-2xl h-10 w-10 bg-primary shadow-lg shadow-primary/20 hover:scale-105 transition-all duration-300"
                    onClick={() => setAddSupplierOpen(true)}
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
                <div className="p-4">
                  <div className="border border-border/40 rounded-2xl overflow-hidden bg-muted/5 p-4">
                    {selectedSuppliers.length === 0 ? (
                      <div className="flex flex-col items-center gap-4 max-w-[280px] mx-auto py-16">
                        <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mb-2">
                          <Building2 className="w-10 h-10 text-muted-foreground/30" />
                        </div>
                        <h4 className="font-semibold text-foreground/80">No Suppliers Selected</h4>
                        <p className="text-sm text-muted-foreground text-center">Please select the suppliers to be approved in this request.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {selectedSuppliers.map((supplier, index) => (
                          <div key={supplier.id} className="bg-white border border-border/40 rounded-2xl p-5 shadow-sm relative group transition-all duration-300 hover:shadow-md">
                            {/* Top Row: Name, Category, Actions */}
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex gap-4 items-center">

                                <div>
                                  <h4 className="font-bold text-lg">{supplier.supplierName}</h4>
                                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                                      {supplier.category || "General"}
                                    </Badge>
                                    {supplier.taxNumber && (
                                      <Badge variant="outline" className="bg-muted/30 text-muted-foreground border-border/50 text-xs font-medium py-0.5 px-2.5" title="VAT Number">
                                        <Hash className="w-3.5 h-3.5 mr-1.5 opacity-60" /> {supplier.taxNumber}
                                      </Badge>
                                    )}
                                    {supplier.experienceYears && (
                                      <Badge variant="outline" className="bg-muted/30 text-muted-foreground border-border/50 text-xs font-medium py-0.5 px-2.5" title="Experience Years">
                                        <Briefcase className="w-3.5 h-3.5 mr-1.5 opacity-60" /> {supplier.experienceYears}+ XP
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-primary hover:bg-primary/10 rounded-xl"
                                  onClick={() => {
                                    setSupplierToEdit(supplier as Supplier);
                                    setCreateSupplierOpen(true);
                                  }}
                                  title="Edit Supplier"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-xl"
                                  onClick={() => handleRemoveSupplier(supplier.id)}
                                  title="Remove from request"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/30 p-4 rounded-xl border border-border/40">
                              <div className="flex flex-col gap-1.5 text-center">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1.5"><Users className="w-3.5 h-3.5" /> Contact Person</span>
                                <p className="text-sm font-bold text-foreground truncate" title={supplier.contactPerson || "N/A"}>{supplier.contactPerson || "N/A"}</p>
                              </div>
                              <div className="flex flex-col gap-1.5 text-center">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Address</span>
                                <p className="text-sm font-bold text-foreground line-clamp-1" title={supplier.address || "N/A"}>{supplier.address || "N/A"}</p>
                              </div>
                              <div className="flex flex-col gap-1.5 text-center">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</span>
                                <p className="text-sm font-bold text-foreground truncate" title={supplier.email || "N/A"}>{supplier.email || "N/A"}</p>
                              </div>
                              <div className="flex flex-col gap-1.5 text-center">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone</span>
                                <p className="text-sm font-bold text-foreground truncate" title={supplier.phone || "N/A"}>{supplier.phone || "N/A"}</p>
                              </div>
                            </div>

                            {/* Action Bar */}
                            <div className="flex items-center justify-start mt-2 border-t pt-2 w-full">
                              <SupplierAttachmentsMenu supplierId={supplier.id} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (!isDSR) ? (
            <Card className="shadow-xl shadow-black/[0.03] border-none bg-white dark:bg-card overflow-hidden rounded-3xl transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 group">
              <CardContent className="p-0">
                <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between bg-primary/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary transition-transform duration-500 group-hover:rotate-12">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg tracking-tight">Work Location</h3>
                      <p className="text-xs text-muted-foreground">Specify the project site area</p>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    className="rounded-2xl h-10 w-10 bg-primary shadow-lg shadow-primary/20 hover:scale-105 transition-all duration-300"
                    onClick={() => setAddLocationOpen(true)}
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
                <div className="p-4">
                  <div className="border border-border/40 rounded-2xl overflow-hidden bg-muted/5">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 border-none hover:bg-muted/30">
                          <TableHead className="w-10 text-center font-bold">#</TableHead>
                          <TableHead className="font-bold">Unit</TableHead>
                          <TableHead className="font-bold">Zone</TableHead>
                          <TableHead className="font-bold">Block</TableHead>
                          <TableHead className="font-bold">Building</TableHead>
                          <TableHead className="font-bold">Floor</TableHead>
                          <TableHead className="font-bold">Part</TableHead>
                          <TableHead className="w-16 text-right font-bold pr-6">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedLocations.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-20 bg-transparent">
                              <div className="flex flex-col items-center gap-4 max-w-[280px] mx-auto">
                                <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mb-2">
                                  <MapPin className="w-10 h-10 text-muted-foreground/30" />
                                </div>
                                <h4 className="font-semibold text-foreground/80">No Locations Selected</h4>
                                <p className="text-sm text-muted-foreground text-center">Please add at least one work location for this request.</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          selectedLocations.map((loc, index) => (
                            <TableRow key={loc.id} className="hover:bg-muted/30 transition-colors group">
                              <TableCell className="text-center text-muted-foreground font-medium">{index + 1}</TableCell>
                              <TableCell className="font-medium text-foreground/80">{loc.unit}</TableCell>
                              <TableCell>{loc.zone}</TableCell>
                              <TableCell>{loc.block}</TableCell>
                              <TableCell>{loc.building}</TableCell>
                              <TableCell>{loc.floor}</TableCell>
                              <TableCell>{loc.part}</TableCell>
                              <TableCell className="text-right pr-6">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 rounded-xl text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                                  onClick={() => handleRemoveLocation(loc.id)}
                                  data-testid={`button-remove-location-${index}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Right Column - Work Level, Purpose, Attachments */}
          <div className="space-y-6">
            {/* Work Level Section - Only for non-MIR/non-SSR */}
            {!isMIR && !isSSR && !isMAR && !isDSR && !isNCR && (
              <Card className="shadow-xl shadow-black/[0.03] border-none bg-white dark:bg-card overflow-hidden rounded-3xl transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 group">
                <CardContent className="p-0">
                  <div className="px-6 py-4 border-b border-border/40 flex items-center gap-3 bg-primary/[0.02]">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary transition-transform duration-500 group-hover:rotate-12">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg tracking-tight">Work Levels</h3>
                      <p className="text-xs text-muted-foreground">Select progress milestones</p>
                    </div>
                  </div>

                  <div className="p-6">
                    <Popover open={levelSearchOpen} onOpenChange={setLevelSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={levelSearchOpen}
                          className="w-full justify-between mb-4 shadow-sm border-border/60 hover:border-primary/50 transition-colors rounded-xl h-12 px-4"
                          data-testid="select-work-level"
                        >
                          <span className="text-muted-foreground">Select work levels...</span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0 rounded-2xl border-primary/10 shadow-2xl overflow-hidden">
                        <Command className="rounded-2xl">
                          <CommandInput placeholder="Search work levels..." className="h-12" />
                          <CommandList className="max-h-[300px]">
                            <CommandEmpty>No work level found.</CommandEmpty>
                            <CommandGroup>
                              {workLevels.map((level) => (
                                <CommandItem
                                  key={level.id}
                                  value={`${level.code} ${level.nameEnglish}`}
                                  onSelect={() => {
                                    handleSelectLevel(level.id);
                                  }}
                                  className="flex items-center gap-2 p-3 m-1 rounded-xl cursor-pointer"
                                >
                                  <div className="flex-1">
                                    <p className="font-bold text-sm">{level.code}</p>
                                    <p className="text-xs text-muted-foreground">{level.nameEnglish}</p>
                                  </div>
                                  {selectedLevels.some(sl => sl.id === level.id) && (
                                    <div className="bg-primary/20 p-1 rounded-lg">
                                      <Check className="h-4 w-4 text-primary" />
                                    </div>
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>

                    <div className="flex flex-wrap gap-2">
                      {selectedLevels.map((level) => (
                        <Badge
                          key={level.id}
                          variant="secondary"
                          className="pl-3 pr-1 py-1 gap-1 group/badge bg-primary/10 hover:bg-primary/20 text-primary border-none rounded-xl transition-all duration-300"
                        >
                          <span className="font-bold text-xs uppercase tracking-tight">{level.code}</span>
                          <span className="max-w-[150px] truncate">{level.title}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-lg opacity-0 group-hover/badge:opacity-100 hover:bg-primary/20 transition-all"
                            onClick={() => handleRemoveLevel(level.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Attachments Section */}
            {!isMAR && !isSSR && (
              <Card className="shadow-xl shadow-black/[0.03] border-none bg-white dark:bg-card overflow-hidden rounded-3xl transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 group">
                <CardContent className="p-0">
                  <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between bg-primary/[0.02]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary transition-transform duration-500 group-hover:rotate-12">
                        <Paperclip className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg tracking-tight">{(isNCR || isSI) ? "Attachments" : "Documents"}</h3>
                        <p className="text-xs text-muted-foreground">Attach drawings, photos, or logs</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isNCR && !isSI && (
                        <Button
                          size="icon"
                          className="rounded-2xl h-10 w-10 bg-primary shadow-lg shadow-primary/20 hover:scale-105 transition-all duration-300"
                          onClick={() => setIsProjectStorageOpen(true)}
                          title="Add from storage"
                        >
                          <Database className="w-5 h-5 text-white" />
                        </Button>
                      )}
                      {(isNCR || isSI) && (
                        <>
                          <input
                            type="file"
                            multiple
                            className="hidden"
                            ref={fileInputRef}
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                const newAtts = Array.from(e.target.files).map(file => ({
                                  id: crypto.randomUUID(),
                                  title: "",
                                  documentType: "",
                                  files: [{
                                    file,
                                    fileName: file.name,
                                    fileSize: file.size
                                  }]
                                }));
                                setAttachments([...attachments, ...newAtts]);
                              }
                              // reset the input
                              if (fileInputRef.current) fileInputRef.current.value = "";
                            }}
                          />
                          <Button
                            size="icon"
                            className="rounded-2xl h-10 w-10 bg-primary shadow-lg shadow-primary/20 hover:scale-105 transition-all duration-300"
                            onClick={() => fileInputRef.current?.click()}
                            title="+ Add"
                          >
                            <Plus className="w-5 h-5 text-white" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="border border-border/40 rounded-2xl overflow-hidden bg-muted/5">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30 border-none hover:bg-muted/30">
                            <TableHead className="w-10 text-center font-bold">#</TableHead>
                            {isSD && <TableHead className="font-bold">Doc ID</TableHead>}
                            <TableHead className="font-bold">Title</TableHead>
                            {(isDSR || isSD) && <TableHead className="font-bold">Doc Type</TableHead>}
                            <TableHead className="font-bold">File</TableHead>
                            <TableHead className="w-16 text-right font-bold pr-6">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {attachments.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={isSD ? 6 : isDSR ? 5 : 4} className="text-center py-20 bg-transparent">
                                <div className="flex flex-col items-center gap-4 max-w-[280px] mx-auto">
                                  <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mb-2">
                                    <FileText className="w-10 h-10 text-muted-foreground/30" />
                                  </div>
                                  <h4 className="font-semibold text-foreground/80">{isNCR ? "No Attachments Added" : "No Documents Added"}</h4>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            attachments.map((attachment, index) => (
                              <TableRow key={attachment.id} className="hover:bg-muted/30 transition-colors group border-b border-border/20 last:border-0">
                                <TableCell className="text-center text-muted-foreground font-medium">{index + 1}</TableCell>
                                {isSD && (
                                  <TableCell>
                                    <Input
                                      placeholder="Enter document ID"
                                      value={attachment.documentRef || ""}
                                      onChange={(e) => {
                                        const newAttachments = [...attachments];
                                        newAttachments[index].documentRef = e.target.value;
                                        setAttachments(newAttachments);
                                      }}
                                      className="bg-transparent border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary/30 h-8 font-medium"
                                    />
                                  </TableCell>
                                )}
                                <TableCell>
                                  <Input
                                    placeholder="Enter document title"
                                    value={attachment.title}
                                    onChange={(e) => {
                                      const newAttachments = [...attachments];
                                      newAttachments[index].title = e.target.value;
                                      setAttachments(newAttachments);
                                    }}
                                    className="bg-transparent border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary/30 h-8 font-medium"
                                  />
                                </TableCell>
                                {(isDSR || isSD) && (
                                  <TableCell>
                                    {isSD ? (
                                      <span className="text-sm font-medium text-muted-foreground px-3">{attachment.documentType || "Drawing"}</span>
                                    ) : (
                                      <Select
                                        value={attachment.documentType || ""}
                                        onValueChange={(value) => {
                                          const newAttachments = [...attachments];
                                          newAttachments[index].documentType = value;
                                          setAttachments(newAttachments);
                                        }}
                                      >
                                        <SelectTrigger className="bg-transparent border-none shadow-none focus:ring-0 focus-visible:ring-1 focus-visible:ring-primary/30 h-8 font-medium">
                                          <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-xl border-primary/10 shadow-xl">
                                          {(isDSR ? DOCUMENT_TYPES.filter(type => type !== "Drawing") : DOCUMENT_TYPES).map((type) => (
                                            <SelectItem key={type} value={type} className="rounded-lg m-1">
                                              {type}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    )}
                                  </TableCell>
                                )}
                                <TableCell>
                                  {attachment.files && attachment.files.length > 0 ? (
                                    <div className="flex items-center gap-2 bg-background/50 p-1.5 pr-3 rounded-xl border border-border/50 max-w-[200px]">
                                      <div className="w-8 h-8 rounded-lg flex items-center justify-center">
                                        <FileText className="w-4 h-4 text-primary" />
                                      </div>
                                      <div className="flex flex-col min-w-0">
                                        <span className="text-xs font-bold truncate text-foreground/80" title={attachment.files[0].fileName}>
                                          {attachment.files[0].fileName}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground font-medium">
                                          {formatFileSize(attachment.files[0].fileSize)}
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="file"
                                        id={`file-upload-${attachment.id}`}
                                        className="hidden"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            const newAttachments = [...attachments];
                                            newAttachments[index].files = [{
                                              file,
                                              fileName: file.name,
                                              fileSize: file.size
                                            }];
                                            setAttachments(newAttachments);
                                          }
                                        }}
                                      />
                                      <Label
                                        htmlFor={`file-upload-${attachment.id}`}
                                        className="cursor-pointer flex items-center gap-2 text-xs font-bold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-xl border border-primary/20 transition-all active:scale-95"
                                      >
                                        <Paperclip className="w-4 h-4" />
                                        Upload File
                                      </Label>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-right pr-6">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                                    onClick={() => handleRemoveAttachment(attachment.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Linked Suppliers for MAR */}
            {isMAR && selectedMaterials.length > 0 && (
              <Card className="shadow-xl shadow-black/[0.03] border-none bg-white dark:bg-card overflow-hidden rounded-3xl transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 group hidden has-[.supplier-item]:block">
                <CardContent className="p-0">
                  <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between bg-primary/[0.02]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary transition-transform duration-500 group-hover:rotate-12">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg tracking-tight">Supplier for Material</h3>
                        <p className="text-xs text-muted-foreground">Suppliers connected to selected materials</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex flex-col gap-6">
                      {selectedMaterials.map((material) => (
                        <MaterialLinkedSuppliers
                          key={material.id}
                          materialId={material.id}
                          materialName={material.materialName}
                          onEditSupplier={(supplier) => {
                            setSupplierToEdit(supplier);
                            setCreateSupplierOpen(true);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Dialogs */}
          {/* Add Location Dialog */}
          <Dialog open={addLocationOpen} onOpenChange={setAddLocationOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Work Locations</DialogTitle>
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
                    <Label>Search & Select Locations</Label>
                    <div className="flex gap-1">
                      {filteredWorkLocations.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={handleSelectAllFiltered}
                        >
                          Select All ({filteredWorkLocations.length})
                        </Button>
                      )}
                      {selectedLocations.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={handleDeselectAll}
                        >
                          Deselect All
                        </Button>
                      )}
                    </div>
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
                        {filteredWorkLocations.map((location: WorkLocation) => (
                          <CommandItem
                            key={location.id}
                            value={`${location.unitCustomNumber} ${location.unitZone} ${location.unitBlock} ${location.buildingNo} ${location.floor} ${location.part}`}
                            onSelect={() => handleAddLocationById(location.id)}
                            className="cursor-pointer"
                          >
                            <div className="flex items-center justify-between w-full">
                              <span>
                                {location.unitCustomNumber || "N/A"} - {location.unitZone || ""} {location.floor || ""}
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({location.buildingNo || "No Bldg"}, {location.part || "No Part"})
                                </span>
                              </span>
                              <Plus className="h-4 w-4 opacity-50" />
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </div>

                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedLocations.map((loc) => (
                    <Badge key={loc.id} variant="secondary" className="gap-1 pr-1 shadow-sm">
                      {loc.unit || loc.building}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 rounded-full p-0 hover:bg-muted"
                        onClick={() => handleRemoveLocation(loc.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>
              <DialogFooter className="pt-4 mt-2">
                <Button variant="default" onClick={() => setAddLocationOpen(false)} className="w-full shadow-md">
                  Done ({selectedLocations.length} selected)
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add Delivery Dialog */}
          <Dialog open={addDeliveryOpen} onOpenChange={setAddDeliveryOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-primary" />
                  Select Material Deliveries
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Command className="border rounded-md shadow-sm">
                  <CommandInput placeholder="Search delivery, material, or supplier..." />
                  <CommandList className="max-h-[300px]">
                    <CommandEmpty>No deliveries found.</CommandEmpty>
                    <CommandGroup>
                      {projectDeliveries.filter(pd => {
                        const notSelectedLocally = !selectedDeliveries.some(sd => sd.id === pd.id);
                        // In "Create New" mode, only show deliveries with NO existing links
                        const isNotLinkedToAnything = !pd.linkedRequests || pd.linkedRequests.length === 0;
                        return notSelectedLocally && isNotLinkedToAnything;
                      }).map((delivery: any) => {
                        return (
                          <CommandItem
                            key={delivery.id}
                            value={`${delivery.shipmentNumber} ${(delivery.items || []).map((i: any) => i.materialName).join(" ")} ${delivery.supplier}`}
                            onSelect={() => handleAddDeliveryById(delivery.id)}
                            className="cursor-pointer"
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{delivery.shipmentNumber}</span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {(delivery.items || []).map((i: any) => i.materialName).join(", ")} • {delivery.supplier}
                                </span>
                              </div>
                              <Plus className="h-4 w-4 opacity-50" />
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>

                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedDeliveries.map((delivery) => (
                    <Badge key={delivery.id} variant="secondary" className="gap-1 pr-1 bg-primary/10 text-primary hover:bg-primary/20 transition-colors shadow-sm">
                      {delivery.shipmentNumber}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 rounded-full p-0 hover:bg-primary/30"
                        onClick={() => handleRemoveDelivery(delivery.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>
              <DialogFooter className="pt-4 mt-2">
                <Button variant="default" onClick={() => setAddDeliveryOpen(false)} className="w-full shadow-md">
                  Done ({selectedDeliveries.length} selected)
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add Material Dialog */}
          <Dialog open={addMaterialOpen} onOpenChange={setAddMaterialOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <div className="flex items-center justify-between w-full pr-6">
                  <DialogTitle className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-primary" />
                    Select Materials
                  </DialogTitle>
                  <Button
                    onClick={() => {
                      setAddMaterialOpen(false);
                      setTimeout(() => setCreateMaterialOpen(true), 150);
                    }}
                    size="sm"
                    variant="outline"
                    className="rounded-xl shadow-sm bg-primary/5 text-primary hover:bg-primary/10 border-primary/20 transition-all"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Create New
                  </Button>
                </div>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Command className="border rounded-md shadow-sm">
                  <CommandInput placeholder="Search material name or category..." />
                  <CommandList className="max-h-[400px]">
                    <CommandEmpty>No materials found.</CommandEmpty>
                    <CommandGroup>
                      {projectMaterials.map((material) => {
                        const isAssigned = assignedMaterialIds.includes(material.id);
                        return (
                          <CommandItem
                            key={material.id}
                            value={`${material.materialName} ${material.category}`}
                            onSelect={() => {
                              if (!isAssigned) {
                                handleAddMaterialById(material.id);
                              }
                            }}
                            disabled={isAssigned}
                            className={`p-3 m-1 rounded-xl ${isAssigned ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="flex flex-col">
                                <span className="font-bold flex items-center gap-2">
                                  {material.materialName}
                                  {isAssigned && (
                                    <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-md uppercase tracking-wider">
                                      Linked
                                    </span>
                                  )}
                                </span>
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  {material.materialCode && (
                                    <Badge variant="outline" className="text-[10px] h-4 font-mono">
                                      ID: {material.materialCode}
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="text-[10px] h-4">
                                    {material.category}
                                  </Badge>
                                  {material.originCountry && (
                                    <span className="text-[10px] text-muted-foreground">Origin: {material.originCountry}</span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">Unit: {material.unit}</span>
                                </div>
                              </div>
                              {!isAssigned && (
                                selectedMaterials.some(m => m.id === material.id) ? (
                                  <div className="bg-primary/20 p-1 rounded-lg">
                                    <Check className="h-4 w-4 text-primary" />
                                  </div>
                                ) : (
                                  <Plus className="h-4 w-4 opacity-50" />
                                )
                              )}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>

                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedMaterials.map((mat) => (
                    <Badge key={mat.id} variant="secondary" className="gap-1 pr-1 shadow-sm bg-primary/5 text-primary border-primary/10">
                      {mat.materialName}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 rounded-full p-0 hover:bg-primary/10"
                        onClick={() => handleRemoveMaterial(mat.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>
              <DialogFooter className="pt-4 mt-2">
                <Button variant="default" onClick={() => setAddMaterialOpen(false)} className="w-full shadow-md">
                  Done ({selectedMaterials.length} selected)
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add Supplier Dialog */}
          <Dialog open={addSupplierOpen} onOpenChange={setAddSupplierOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <div className="flex items-center justify-between w-full pr-6">
                  <DialogTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-primary" />
                    Select Suppliers
                  </DialogTitle>
                  <Button
                    onClick={() => {
                      setAddSupplierOpen(false);
                      setTimeout(() => setCreateSupplierOpen(true), 150);
                    }}
                    size="sm"
                    variant="outline"
                    className="rounded-xl shadow-sm bg-primary/5 text-primary hover:bg-primary/10 border-primary/20 transition-all"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Create New
                  </Button>
                </div>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Command className="border rounded-md shadow-sm">
                  <CommandInput placeholder="Search supplier name or category..." />
                  <CommandList className="max-h-[400px]">
                    <CommandEmpty>No suppliers found.</CommandEmpty>
                    <CommandGroup>
                      {projectSuppliers.map((supplier) => {
                        const isAssigned = assignedSupplierIds.includes(supplier.id);
                        return (
                          <CommandItem
                            key={supplier.id}
                            value={`${supplier.supplierName} ${supplier.category}`}
                            onSelect={() => {
                              if (!isAssigned) {
                                handleAddSupplierById(supplier.id);
                              }
                            }}
                            disabled={isAssigned}
                            className={`p-3 m-1 rounded-xl ${isAssigned ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="flex flex-col">
                                <span className="font-bold flex items-center gap-2">
                                  {supplier.supplierName}
                                  {isAssigned && (
                                    <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-md uppercase tracking-wider">
                                      Linked
                                    </span>
                                  )}
                                </span>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-[10px] h-4">
                                    {supplier.category || "General"}
                                  </Badge>
                                  {supplier.email && <span className="text-[10px] text-muted-foreground">{supplier.email}</span>}
                                </div>
                              </div>
                              {!isAssigned && (
                                selectedSuppliers.some(s => s.id === supplier.id) ? (
                                  <div className="bg-primary/20 p-1 rounded-lg">
                                    <Check className="h-4 w-4 text-primary" />
                                  </div>
                                ) : (
                                  <Plus className="h-4 w-4 opacity-50" />
                                )
                              )}
                            </div>
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>

                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedSuppliers.map((sup) => (
                    <Badge key={sup.id} variant="secondary" className="gap-1 pr-1 shadow-sm bg-primary/5 text-primary border-primary/10">
                      {sup.supplierName}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 rounded-full p-0 hover:bg-primary/10"
                        onClick={() => handleRemoveSupplier(sup.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>
              <DialogFooter className="pt-4 mt-2">
                <Button variant="default" onClick={() => setAddSupplierOpen(false)} className="w-full shadow-md">
                  Done ({selectedSuppliers.length} selected)
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {activity?.projectId && (
            <ProjectStorageModal
              isOpen={isProjectStorageOpen}
              onClose={() => setIsProjectStorageOpen(false)}
              onSelect={handleSelectFromStorage}
              projectId={activity?.projectId}
            />
          )}
          {activity?.projectId && (
            <SupplierFormDialog
              isOpen={createSupplierOpen}
              onOpenChange={(open) => {
                setCreateSupplierOpen(open);
                if (!open) setSupplierToEdit(null);
              }}
              projectId={activity.projectId}
              supplier={supplierToEdit}
              onSuccess={(updatedSupplier) => {
                if (!supplierToEdit) {
                  if (materialToLinkSupplier) {
                    setLinkSupplierOpen(true);
                  } else {
                    setAddSupplierOpen(true);
                  }
                }
                setSelectedSuppliers(prev => prev.map(s =>
                  s.id === updatedSupplier.id
                    ? {
                      ...s,
                      name: updatedSupplier.supplierName,
                      supplierName: updatedSupplier.supplierName,
                      category: updatedSupplier.category,
                      email: updatedSupplier.email,
                      phone: updatedSupplier.phone,
                      contactPerson: updatedSupplier.contactPerson,
                      experienceYears: updatedSupplier.experienceYears,
                      address: updatedSupplier.address,
                      taxNumber: updatedSupplier.taxNumber,
                      logoUrl: updatedSupplier.logoUrl
                    }
                    : s
                ));
              }}
            />
          )}
          {activity?.projectId && (
            <MaterialFormDialog
              isOpen={createMaterialOpen}
              onOpenChange={(open) => {
                setCreateMaterialOpen(open);
                if (!open) setMaterialToEdit(null);
              }}
              projectId={activity.projectId}
              material={materialToEdit}
              onSuccess={(updatedMaterial) => {
                if (!materialToEdit) {
                  setAddMaterialOpen(true);
                }
                setSelectedMaterials(prev => prev.map(m =>
                  m.id === updatedMaterial.id
                    ? {
                      ...m,
                      materialName: updatedMaterial.materialName,
                      category: updatedMaterial.category,
                      unit: updatedMaterial.unit,
                      materialCode: updatedMaterial.materialCode,
                      originCountry: updatedMaterial.originCountry,
                      imageUrl: updatedMaterial.imageUrl || null
                    }
                    : m
                ));
              }}
            />
          )}
          {submitMutation.isPending && (
            <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
              <LoadingIcon size={120} />
              <p className="mt-4 text-xl font-bold text-primary animate-pulse uppercase tracking-widest">Submitting Request...</p>
            </div>
          )}

          <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
            <DialogContent className="max-w-md rounded-[1.5rem] border-none shadow-2xl p-6 bg-white dark:bg-background">
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-6 h-6 text-destructive" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-destructive">Missing Mandatory Fields</h2>
                    <p className="text-sm font-semibold text-muted-foreground mt-1">حقول إلزامية مفقودة</p>
                  </div>
                </div>

                <div className="bg-muted/30 p-4 rounded-xl border border-muted/50">
                  <p className="text-sm text-foreground font-medium mb-3">
                    You cannot submit this request because the following mandatory fields or documents are missing:
                  </p>
                  <ul className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {missingFields.map((f, i) => (
                      <li key={i} className="text-sm text-destructive font-semibold flex items-start gap-2 bg-destructive/5 p-2 rounded-lg">
                        <span className="shrink-0 mt-0.5">•</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="text-xs text-muted-foreground text-center font-medium">
                  You can save the current data as a draft, or cancel to complete the missing fields.
                  <br />
                  <span className="opacity-70 mt-1 block">يمكنك حفظ البيانات كمسودة، أو الإلغاء لإكمال الحقول المفقودة.</span>
                </p>

                <div className="flex flex-col gap-2 mt-2">
                  <Button
                    variant="outline"
                    className="h-12 rounded-xl font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border-slate-200"
                    onClick={() => setShowValidationDialog(false)}
                  >
                    Cancel and Complete (إلغاء وإكمال الحقل)
                  </Button>
                  <Button
                    variant="default"
                    className="h-12 rounded-xl font-bold"
                    onClick={() => {
                      setShowValidationDialog(false);
                      submitMutation.mutate(true);
                    }}
                  >
                    Save as Draft (حفظ كمسودة)
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {materialToLinkSupplier && activity?.projectId && (
            <LinkSupplierDialog
              isOpen={linkSupplierOpen}
              onOpenChange={setLinkSupplierOpen}
              projectId={activity.projectId}
              materialId={materialToLinkSupplier.id}
              availableSuppliers={projectSuppliers}
              alreadyLinkedIds={linkedSuppliersForMaterial.map((l: any) => l.supplierId)}
              onCreateNew={() => {
                setLinkSupplierOpen(false);
                setTimeout(() => setCreateSupplierOpen(true), 150);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
