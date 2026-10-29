import { DeductionButton } from "@/components/payments/payment-actions";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import imageCompression from "browser-image-compression";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRequestUpdates, useNotifications } from "@/hooks/use-notifications";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  ArrowLeft,
  Save,
  Bell,
  RotateCcw,
  Plus,
  Paperclip,
  Check,
  X,
  FileText,
  Clock,
  User,
  Building2,
  MapPin,
  Layers,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Eye,
  ClipboardList,
  Trash2,
  Target,
  Pencil,
  ChevronsUpDown,
  Database,
  Link2,
  Calendar,
  Truck,
  FileSpreadsheet,
  File,
  MoreVertical,
  Loader2,
  Tag,
  Bookmark,
  Users,
  Briefcase,
  Hash,
  Mail,
  Phone,
  UploadCloud,
} from "lucide-react";
import { ProjectStorageModal } from "@/components/ProjectStorageModal";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { format, parseISO, isValid, addHours } from "date-fns";
import { WirFormDialog, InlinePdfViewer } from "@/components/wir-form-dialog";
import { NcrFormDialog } from "@/components/ncr-form-dialog";
import { SiFormDialog } from "@/components/si-form-dialog";
import { DeliveryOverviewDialog } from "@/components/delivery-overview-dialog";
import { SupplierFormDialog } from "@/components/supplier-form-dialog";
import { parseDbTimestamp } from "@/lib/date-utils";
import type {
  ChecklistItem,
  WorkListActivity,
  WorkListChapter,
  WorkListDivision,
  Project,
  Organization,
  User as UserType,
  RequestAttachment,
  WorkLocation,
  WorkLevel,
  Purpose,
  Document as ProjectDocument,
  Delivery,
  DeliveryItem,
  Supplier,
  Material,
} from "@shared/schema";
import { ImagePlus, Download, ExternalLink, Send, ArrowRight, Undo2, Edit2, Package, AlertTriangle } from "lucide-react";
import { LoadingIcon } from "@/components/ui/loading-icon";
import { MaterialAttachmentsMenu, SupplierAttachmentsMenu } from "@/pages/create-wir-request";
import { MaterialLinkedSuppliers } from "@/components/material-linked-suppliers";
import { MaterialFormDialog } from "@/components/material-form-dialog";
import { LinkSupplierDialog } from "@/components/link-supplier-dialog";

import { formatGMT3, safeFormat, formatFileSize } from "@/lib/utils";

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

interface RequestData {
  id: string;
  requestNumber: string;
  referenceCode: string;
  requestTypeId: string;
  projectId: string;
  projectName?: string | null;
  contractorId: string | null;
  contractorName?: string | null;
  consultantId: string | null;
  consultantName?: string | null;
  currentStatus: string;
  currentRevisionId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface RevisionData {
  id: string;
  requestId: string;
  revisionNo: number;
  currentStepId: number | null;
  title: string;
  description: string | null;
  workListActivityId: string | null;
  activityCode?: string | null;
  activityName?: string | null;
  chapterName?: string | null;
  divisionName?: string | null;
  workLocationId: string | null;
  workLevelId: string | null;
  workLevelName?: string | null;
  scheduledDate: string | null;
  remarks: string | null;
  createdBy: string;
  createdAt: string;
  approvalStatusCode: string | null;
  approvalComments: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  metadata?: Record<string, any> | null;
}

interface WorkflowStep {
  id: number;
  requestTypeId: number;
  stepName: string;
  roleRequired: number;
  sequenceOrder: number;
}

interface AuthorizedTeamMember {
  id: string;
  nameEnglish: string;
  nameArabic: string | null;
  position: string | null;
  organizationId: string | null;
  organizationName: string | null;
  users?: {
    id: string;
    username: string;
    fullName: string;
    avatar?: string | null;
    isActive: boolean;
  }[];
}

interface WorkflowTransition {
  transitionId: number;
  requestTypeId: number;
  fromStepId: number;
  toStepId: number;
  allowedStatus: string;
  toStepName?: string;
}

interface StatusHistoryItem {
  id: string;
  revisionId: string;
  oldStatus: string;
  newStatus: string;
  changedBy: string;
  remarks: string | null;
  changedAt: string;
  userName?: string;
}

interface RequestDocument {
  id: string;
  revisionId: string;
  documentType: string | null;
  documentRef: string | null;
  description: string | null;
  title: string | null;
  fileName: string | null;
  fileUrl: string | null;
  fileSize: number | null;
  mimeType: string | null;
  uploadedBy: string | null;
  uploadedAt: string | null;
  remarks: string | null;
  sourceType?: "upload" | "project" | null;
  projectDocumentId?: string | null;
}

interface RequestPurpose {
  id: string;
  revisionId: string;
  purposeId: string;
  purposeName: string;
  purposeCategory: string | null;
  remarks: string | null;
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

interface TransitionsResponse {
  currentStep?: WorkflowStep;
  transitions: WorkflowTransition[];
  message?: string;
}

interface RequestInquiry {
  id: string;
  revisionId: string;
  question: string;
  answer: string | null;
  isRequired: boolean;
  askedBy: string;
  answeredBy: string | null;
  askedAt: string;
  answeredAt: string | null;
}

interface MessageAttachment {
  id: string;
  messageId: string;
  title: string | null;
  fileName: string;
  fileType: string | null;
  fileUrl: string | null;
  fileSize: number | null;
  uploadedAt: string;
}

interface RequestMessage {
  id: string;
  revisionId: string;
  message: string | null;
  senderId: string;
  sentAt: string;
  attachments: MessageAttachment[];
}

interface ConsultantReview {
  id: string;
  revisionId: string;
  residentEngineerUserId: string | null;
  comments: string | null;
  statusCode: string | null;
  receivedAt: string | null;
  reviewedAt: string | null;
}

interface RevisionChecklistResponse {
  id: string;
  revisionId: string;
  checklistItemId: string;
  response: "yes" | "no" | "na";
  respondedBy: string | null;
  respondedAt: string | null;
  remarks: string | null;
}

interface ActivityChecklistItemResult {
  id: string;
  activityId: string;
  checklistItemId: string;
  addedBy: string | null;
  addedAt: string | null;
  checklistItem: ChecklistItem;
}


interface SelectedWorkLocation {
  id: string;
  unit?: string | null;
  zone?: string | null;
  block?: string | null;
  building?: string | null;
  floor?: string | null;
  part?: string | null;
}

interface SelectedWorkLevel {
  id: string;
  code: string;
  title: string;
}

function SupplierCardWithAttachments({ rs, onPreviewDoc, index, onRemove, onEdit }: { rs: any; onPreviewDoc?: (doc: any) => void; index?: number; onRemove?: () => void; onEdit?: () => void }) {
  const supplierObj = rs.supplier || rs;
  const supplierId = rs.supplierId || supplierObj?.id;
  const [logoError, setLogoError] = useState(false);
  const { data: attachments = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/suppliers", supplierId, "attachments"],
    enabled: !!supplierId,
  });

  const logoUrl = supplierObj?.logoUrl ? (supplierObj.logoUrl.startsWith('http') || supplierObj.logoUrl.startsWith('/') ? supplierObj.logoUrl : `/${supplierObj.logoUrl}`) : null;

  return (
    <div className="bg-white border border-border/40 rounded-2xl p-5 shadow-sm relative group transition-all duration-300 hover:shadow-md">
      {/* Top Row: Name, Category, Badges */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex gap-4 items-center">

          {logoUrl && !logoError && (
            <div className="h-16 w-16 p-1.5 rounded-2xl flex items-center justify-center border border-primary/10 shadow-inner shrink-0 overflow-hidden bg-white">
              <img
                src={logoUrl}
                alt={supplierObj?.supplierName || supplierObj?.name || "Logo"}
                className="max-h-full max-w-full object-contain"
                onError={() => setLogoError(true)}
              />
            </div>
          )}
          <div>
            <h4 className="font-bold text-lg">{supplierObj?.supplierName || supplierObj?.name || "Unknown Supplier"}</h4>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                {supplierObj?.category || "General"}
              </Badge>
              {supplierObj?.taxNumber && (
                <Badge variant="outline" className="bg-muted/30 text-muted-foreground border-border/50 text-xs font-medium py-0.5 px-2.5" title="VAT Number">
                  <Hash className="w-3.5 h-3.5 mr-1.5 opacity-60" /> {supplierObj.taxNumber}
                </Badge>
              )}
              {supplierObj?.experienceYears && (
                <Badge variant="outline" className="bg-muted/30 text-muted-foreground border-border/50 text-xs font-medium py-0.5 px-2.5" title="Experience Years">
                  <Briefcase className="w-3.5 h-3.5 mr-1.5 opacity-60" /> {supplierObj.experienceYears}+ XP
                </Badge>
              )}
            </div>
          </div>
        </div>
        {(onRemove || onEdit) && (
          <div className="flex items-center gap-2">
            {onEdit && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-primary hover:bg-primary/10 rounded-xl"
                onClick={onEdit}
                title="Edit Supplier"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
            {onRemove && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-xl"
                onClick={onRemove}
                title="Remove Supplier"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/30 p-4 rounded-xl border border-border/40 mb-3">
        <div className="flex flex-col gap-1.5 text-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1.5"><Users className="w-3.5 h-3.5" /> Contact Person</span>
          <p className="text-sm font-bold text-foreground truncate" title={supplierObj?.contactPerson || "N/A"}>{supplierObj?.contactPerson || "N/A"}</p>
        </div>
        <div className="flex flex-col gap-1.5 text-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Address</span>
          <p className="text-sm font-bold text-foreground line-clamp-1" title={supplierObj?.address || "N/A"}>{supplierObj?.address || "N/A"}</p>
        </div>
        <div className="flex flex-col gap-1.5 text-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</span>
          <p className="text-sm font-bold text-foreground truncate" title={supplierObj?.email || "N/A"}>{supplierObj?.email || "N/A"}</p>
        </div>
        <div className="flex flex-col gap-1.5 text-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone</span>
          <p className="text-sm font-bold text-foreground truncate" title={supplierObj?.phone || "N/A"}>{supplierObj?.phone || "N/A"}</p>
        </div>
      </div>

      {/* Remarks if present */}
      {rs.remarks && (
        <div className="text-xs bg-muted/20 p-2.5 rounded-xl border border-muted/30 text-muted-foreground italic mb-3">
          <span className="font-semibold not-italic text-foreground/80">Remarks: </span>
          {rs.remarks}
        </div>
      )}

      {/* Bottom: Attached Documents / Certificates */}
      {(isLoading || attachments.length > 0) && (
        <div className="pt-3 border-t border-muted/40 mt-1">
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary/60" /> Loading supplier documents...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {attachments.map((att, attIdx) => {
                const doc = att.document || {};
                const fileUrl = doc.fileUrl ? (doc.fileUrl.startsWith('http') || doc.fileUrl.startsWith('/') ? doc.fileUrl : `/${doc.fileUrl}`) : '#';
                const previewPayload = {
                  ...doc,
                  id: doc.id || att.documentId || att.id,
                  title: att.category || doc.title || doc.name || doc.fileName || "Supplier Attachment",
                  fileName: doc.fileName || doc.name || att.category || "attachment",
                  fileUrl: doc.fileUrl || doc.fileData,
                  fileSize: doc.size || doc.fileSize,
                  type: doc.type || doc.mimeType || doc.fileType || "Document"
                };

                return (
                  <a
                    key={attIdx}
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (onPreviewDoc) {
                        e.preventDefault();
                        onPreviewDoc(previewPayload);
                      }
                    }}
                    className="flex items-center justify-between p-2.5 rounded-[1.5rem] bg-primary/5 hover:bg-primary/10 dark:bg-primary/10 dark:hover:bg-primary/20 border border-primary/10 dark:border-primary/20 transition-all duration-300 group/doc cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="p-1.5 rounded-[1.5rem] bg-primary/10 text-primary shrink-0 group-hover/doc:scale-105 transition-transform">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-foreground truncate group-hover/doc:text-primary transition-colors">
                          {att.category || doc.name || doc.fileName || "Document"}
                        </p>
                        {doc.size && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{doc.size}</p>}
                      </div>
                    </div>
                    <Eye className="w-3.5 h-3.5 text-muted-foreground group-hover/doc:text-primary shrink-0 ml-2" />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MaterialCardWithAttachments({ rm, onPreviewDoc }: { rm: any; onPreviewDoc?: (doc: any) => void }) {
  const material = rm.material || {};
  const { data: attachments = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/materials", material.id, "attachments"],
    enabled: !!material.id,
  });

  return (
    <div className="group relative bg-card border border-muted/60 rounded-[1.5rem] p-4 overflow-hidden shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300">
      {/* Left Accent Bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary/40 group-hover:bg-primary transition-colors" />

      <div className="flex flex-col gap-3 w-full pl-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-[1.5rem] bg-primary/5 overflow-hidden flex items-center justify-center border border-primary/10 flex-shrink-0">
            {material.imageUrl ? (
              <img
                src={material.imageUrl}
                alt={material.materialName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.style.display = "none";
                  const parent = e.currentTarget.parentNode as HTMLElement;
                  if (parent) {
                    const fallback = document.createElement("div");
                    fallback.className = "flex items-center justify-center w-full h-full text-primary";
                    fallback.innerHTML = `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>`;
                    parent.appendChild(fallback);
                  }
                }}
              />
            ) : (
              <Layers className="w-5 h-5 text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors duration-300">{material.materialName || "Unknown Material"}</h4>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
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

        {/* Attached Documents / Certificates */}
        {(isLoading || attachments.length > 0) && (
          <div className="pt-3 border-t border-muted/40 mt-1">
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse py-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary/60" /> Loading material documents...
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {attachments.map((att, attIdx) => {
                  const doc = att.document || {};
                  const fileUrl = doc.fileUrl ? (doc.fileUrl.startsWith('http') || doc.fileUrl.startsWith('/') ? doc.fileUrl : `/${doc.fileUrl}`) : (doc.fileData || '#');
                  const previewPayload = {
                    ...doc,
                    id: doc.id || att.documentId || att.id,
                    title: att.category || doc.title || doc.name || doc.fileName || "Material Attachment",
                    fileName: doc.fileName || doc.name || att.category || "attachment",
                    fileUrl: doc.fileUrl || doc.fileData,
                    fileSize: doc.size || doc.fileSize,
                    type: doc.type || doc.mimeType || doc.fileType || "Document"
                  };

                  return (
                    <a
                      key={attIdx}
                      href={fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (onPreviewDoc) {
                          e.preventDefault();
                          onPreviewDoc(previewPayload);
                        }
                      }}
                      className="flex items-center justify-between p-2.5 rounded-[1.5rem] bg-primary/5 hover:bg-primary/10 dark:bg-primary/10 dark:hover:bg-primary/20 border border-primary/10 dark:border-primary/20 transition-all duration-300 group/doc cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="p-1.5 rounded-[1.5rem] bg-primary/10 text-primary shrink-0 group-hover/doc:scale-105 transition-transform">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-foreground truncate group-hover/doc:text-primary transition-colors">
                            {att.category || doc.name || doc.fileName || "Document"}
                          </p>
                          {(doc.size || doc.fileSize) && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{doc.size || doc.fileSize}</p>}
                        </div>
                      </div>
                      <Eye className="w-3.5 h-3.5 text-muted-foreground group-hover/doc:text-primary shrink-0 ml-2" />
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RequestDetail() {
  const { requestId } = useParams();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { notifications, markAsRead } = useNotifications();

  const getFileUrl = (url?: string) => {
    if (!url) return "";
    if (url.startsWith('http') || url.startsWith('/')) return url;
    if (url.includes('/') || url.includes('.')) return `/${url}`;
    return url;
  };

  // Automatically mark notifications for this request as read when viewing it
  useEffect(() => {
    if (requestId && notifications.length > 0) {
      const unreadForThisRequest = notifications.filter(
        (n) => n.requestId === requestId && !n.isRead
      );
      unreadForThisRequest.forEach((n) => {
        markAsRead(n.id);
      });
    }
  }, [requestId, notifications, markAsRead]);

  const [selectedRevision, setSelectedRevision] = useState<string>("");
  const [showLocationsDialog, setShowLocationsDialog] = useState(false);
  const [addInquiryOpen, setAddInquiryOpen] = useState(false);
  const [newInquiryQuestion, setNewInquiryQuestion] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [chatFiles, setChatFiles] = useState<File[]>([]);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const [checklistTab, setChecklistTab] = useState("main");
  const [transitionRemarks, setTransitionRemarks] = useState("");
  const [showTransitionDialog, setShowTransitionDialog] = useState(false);
  const [selectedTransition, setSelectedTransition] = useState<WorkflowTransition | null>(null);
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);
  const { data: previewDocDetail } = useQuery<any>({
    // Use projectDocumentId for project source documents to fetch full details
    queryKey: ["/api/documents", previewDoc?.projectDocumentId || previewDoc?.id],
    // Only fetch if it's a project document or we lack basic file info
    enabled: !!previewDoc && !previewDoc.fileUrl && !previewDoc.fileData,
  });

  // يتم دمج البيانات: إما أن الرابط موجود مسبقاً أو تم جلبه للتو من السيرفر
  const doc = previewDocDetail || previewDoc;

  const previewInfo = useMemo(() => {
    if (!doc) return null;
    // Standardize field names across different document types
    const type = (doc.mimeType || doc.type || doc.fileType || "").toLowerCase();
    const name = (doc.title || doc.fileName || doc.name || "").toLowerCase();
    const url = (doc.fileUrl || doc.fileData || "").toLowerCase();

    const isPDF = type.includes('pdf') || name.endsWith('.pdf');
    const isImage = type.includes('image') ||
      ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "jfif", "pjpeg", "pjp"].some(ext =>
        type === ext || type === `.${ext}` || name.endsWith(`.${ext}`) || url.includes(`.${ext}?`) || url.endsWith(`.${ext}`)
      );
    const isVideo = type.includes('video') ||
      ["mp4", "webm", "ogg"].some(ext =>
        type === ext || type === `.${ext}` || name.endsWith(`.${ext}`) || url.includes(`.${ext}?`) || url.endsWith(`.${ext}`)
      );

    return { isPDF, isImage, isVideo, doc };
  }, [doc]);

  const [approvingStep, setApprovingStep] = useState<string | null>(null);
  const [pendingAutoTransition, setPendingAutoTransition] = useState<number | null>(null);
  const pendingAutoTransitionRef = useRef<number | null>(null);
  const approvingStepRef = useRef<string | null>(null);
  const [selectedApprovalStatusCode, setSelectedApprovalStatusCode] = useState<string>("A");
  const [approvalComments, setApprovalComments] = useState<string>("");
  const [showWirForm, setShowWirForm] = useState(false);
  const [showSiForm, setShowSiForm] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState("");
  const [showAddRecommendationDialog, setShowAddRecommendationDialog] = useState(false);
  const [recommendationSearch, setRecommendationSearch] = useState("");
  const [customRecommendationText, setCustomRecommendationText] = useState("");
  const [selectedChecklistItemId, setSelectedChecklistItemId] = useState<string | null>(null);
  const [showAttachmentUpload, setShowAttachmentUpload] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [deletingRecommendationId, setDeletingRecommendationId] = useState<string | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ reviewId: string; statusCode: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [localApprovalStatus, setLocalApprovalStatus] = useState<{ reviewId: string; statusCode: string } | null>(null);
  const [isSavingApproval, setIsSavingApproval] = useState(false);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [selectedDeliveryDetail, setSelectedDeliveryDetail] = useState<any | null>(null);
  const [previewDeliveryAttachment, setPreviewDeliveryAttachment] = useState<ProjectDocument | null>(null);
  const [showEditRequestDetails, setShowEditRequestDetails] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [editSelectedDivisionId, setEditSelectedDivisionId] = useState<string>("");
  const [editSelectedChapterId, setEditSelectedChapterId] = useState<string>("");
  const [editSelectedActivityId, setEditSelectedActivityId] = useState<string>("");
  const [editNcrType, setEditNcrType] = useState<string>("NCR");
  const [editNcrSource, setEditNcrSource] = useState<string>("Inspection");
  const [editNcrSubject, setEditNcrSubject] = useState<string>("");
  const [editSelectedLinkedNcrId, setEditSelectedLinkedNcrId] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [editSelectedWorkLevels, setEditSelectedWorkLevels] = useState<SelectedWorkLevel[]>([]);
  const [editSelectedPurposeId, setEditSelectedPurposeId] = useState<string>("");
  const [editSelectedLocations, setEditSelectedLocations] = useState<SelectedWorkLocation[]>([]);
  const [editAddLocationOpen, setEditAddLocationOpen] = useState(false);
  const [editLocationSearch, setEditLocationSearch] = useState("");
  const [editBuildingFilter, setEditBuildingFilter] = useState("all-buildings");
  const [editFloorFilter, setEditFloorFilter] = useState("all-floors");
  const [editPartFilter, setEditPartFilter] = useState("all-parts");
  const [editSelectedDeliveries, setEditSelectedDeliveries] = useState<{
    id: string;
    shipmentNumber: string;
    deliveryInvoiceNumber?: string | null;
    materialName: string;
    supplier: string;
    arrivalDate?: string | Date | null;
  }[]>([]);
  const [editAddDeliveryOpen, setEditAddDeliveryOpen] = useState(false);
  const [editDeliverySearch, setEditDeliverySearch] = useState("");
  const [editScheduledDate, setEditScheduledDate] = useState<string>("");
  const [editSelectedSuppliers, setEditSelectedSuppliers] = useState<{
    id: string;
    name: string;
    supplierName: string;
    category?: string | null;
    email?: string | null;
    phone?: string | null;
    contactPerson?: string | null;
    experienceYears?: number | null;
    address?: string | null;
    taxNumber?: string | null;
    logoUrl?: string | null;
  }[]>([]);
  const [editAddSupplierOpen, setEditAddSupplierOpen] = useState(false);
  const [editSupplierSearch, setEditSupplierSearch] = useState("");
  const [createSupplierOpen, setCreateSupplierOpen] = useState(false);
  const [supplierToEdit, setSupplierToEdit] = useState<Supplier | null>(null);
  const [createMaterialOpen, setCreateMaterialOpen] = useState(false);
  const [materialToEdit, setMaterialToEdit] = useState<Material | null>(null);
  const [linkSupplierOpen, setLinkSupplierOpen] = useState(false);
  const [materialToLinkSupplier, setMaterialToLinkSupplier] = useState<Material | null>(null);
  const [editSelectedMaterials, setEditSelectedMaterials] = useState<any[]>([]);
  const [editAddMaterialOpen, setEditAddMaterialOpen] = useState(false);
  const [editMaterialSearch, setEditMaterialSearch] = useState("");
  const [editSelectedDocuments, setEditSelectedDocuments] = useState<any[]>([]);
  const [isEditStorageModalOpen, setIsEditStorageModalOpen] = useState(false);
  const [hasNewData, setHasNewData] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showFullStatusHistory, setShowFullStatusHistory] = useState(false);

  const { data: request, isLoading: requestLoading } = useQuery<RequestData>({
    queryKey: ["/api/requests", requestId],
    enabled: !!requestId,
  });

  const { data: revisions = [], isLoading: revisionsLoading } = useQuery<RevisionData[]>({
    queryKey: ["/api/requests", requestId, "revisions"],
    enabled: !!requestId,
  });

  const currentRevision = revisions.find(r =>
    selectedRevision ? r.id === selectedRevision : r.id === request?.currentRevisionId
  ) || revisions[0];

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId] });
    queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId, "revisions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId, "transitions"] });
    if (currentRevision?.id) {
      queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision.id] });
    }
    setHasNewData(false);
    setShowUpdateDialog(false);
    toast({ title: "Refreshed", description: "Request content has been updated." });
  }, [requestId, currentRevision?.id]);

  const { data: transitionsData } = useQuery<TransitionsResponse>({
    queryKey: ["/api/requests", requestId, "transitions"],
    enabled: !!requestId,
  });

  // Fetch the workflow step for the current revision's currentStepId
  const { data: revisionStep } = useQuery<WorkflowStep>({
    queryKey: ["/api/workflow-steps", currentRevision?.currentStepId],
    enabled: !!currentRevision?.currentStepId,
  });

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", request?.projectId],
    enabled: !!request?.projectId,
  });

  const { data: contractor } = useQuery<Organization>({
    queryKey: ["/api/organizations", request?.contractorId],
    enabled: !!request?.contractorId,
  });

  const { data: consultant } = useQuery<Organization>({
    queryKey: ["/api/organizations", request?.consultantId],
    enabled: !!request?.consultantId,
  });

  const { data: developer } = useQuery<Organization>({
    queryKey: ["/api/organizations", project?.organizationId],
    enabled: !!project?.organizationId,
  });

  const { data: requestType } = useQuery<{ id: string; code: string; id_number: number; name_english?: string }>({
    queryKey: ["/api/request-types", request?.requestTypeId],
    enabled: !!request?.requestTypeId,
  });

  const { data: requestTypes = [] } = useQuery<{ id: string; code: string; id_number: number; name_english?: string }[]>({
    queryKey: ["/api/request-types"],
  });
  const rncrType = requestTypes.find((rt) => rt.code?.toUpperCase() === "RNCR");

  // Fetch all steps for the current request's requestTypeId to calculate progress dynamically
  const { data: allWorkflowSteps = [] } = useQuery<WorkflowStep[]>({
    queryKey: ["/api/workflow-steps", requestType?.id_number],
    queryFn: async () => {
      const res = await fetch(`/api/workflow-steps?requestTypeId=${requestType?.id_number}`);
      if (!res.ok) throw new Error("Failed to fetch workflow steps");
      return res.json();
    },
    enabled: !!requestType?.id_number,
  });

  // Handle incoming WebSocket updates for this request
  const handleRequestUpdate = useCallback((data: { requestId: string; updateType: string }) => {
    setHasNewData(true);
    setShowUpdateDialog(true);
  }, []);

  // Subscribe to WebSocket updates for this request
  useRequestUpdates(requestId, handleRequestUpdate);

  const { data: statusHistory = [] } = useQuery<StatusHistoryItem[]>({
    queryKey: ["/api/revisions", currentRevision?.id, "history"],
    enabled: !!currentRevision?.id && !requestLoading && !revisionsLoading,
    select: (data) => [...data]
      .filter(h => !h.remarks?.includes("Auto-advanced"))
      .sort((a, b) => parseDbTimestamp(b.changedAt).getTime() - parseDbTimestamp(a.changedAt).getTime()),
  });

  const { data: approvalStatus } = useQuery<{
    statusCode: string;
    statusLabel: string;
    comments?: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
  } | null>({
    queryKey: ["/api/revisions", currentRevision?.id, "approval-status"],
    enabled: !!currentRevision?.id && !requestLoading && !revisionsLoading,
  });

  const { data: approvalStatusCodes = [] } = useQuery<{
    code: string;
    label: string;
    description: string | null;
    sortOrder: number;
  }[]>({
    queryKey: ["/api/approval-status-codes"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: inquiries = [] } = useQuery<RequestInquiry[]>({
    queryKey: ["/api/revisions", currentRevision?.id, "inquiries"],
    enabled: !!currentRevision?.id && !requestLoading && !revisionsLoading,
  });

  const { data: chatMessages = [] } = useQuery<RequestMessage[]>({
    queryKey: ["/api/requests", requestId, "all-messages"],
    enabled: !!requestId && !requestLoading && !revisionsLoading,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [chatMessages]);

  const { data: revisionDocuments = [] } = useQuery<RequestDocument[]>({
    queryKey: ["/api/revisions", currentRevision?.id, "documents"],
    enabled: !!currentRevision?.id && !requestLoading && !revisionsLoading,
    select: (data) => [...data].sort((a, b) => {
      const dateA = a.uploadedAt ? parseDbTimestamp(a.uploadedAt).getTime() : 0;
      const dateB = b.uploadedAt ? parseDbTimestamp(b.uploadedAt).getTime() : 0;
      return dateB - dateA;
    }),
  });

  const { data: revisionPurposes = [] } = useQuery<RequestPurpose[]>({
    queryKey: ["/api/revisions", currentRevision?.id, "purposes"],
    enabled: !!currentRevision?.id && !requestLoading && !revisionsLoading,
  });

  const { data: allPurposes = [] } = useQuery<Purpose[]>({
    queryKey: ["/api/purposes"],
    enabled: showEditRequestDetails,
  });

  const { data: positions = [] } = useQuery<any[]>({
    queryKey: ["/api/positions"],
    enabled: showEditRequestDetails,
  });

  const filteredPurposes = useMemo(() => {
    if (!user?.positions || user.positions.length === 0 || positions.length === 0) {
      return allPurposes;
    }
    const userPurposeIds = positions
      .filter(p => user.positions?.includes(p.titleEnglish) && p.purposeId)
      .map(p => p.purposeId);

    if (userPurposeIds.length > 0) {
      return allPurposes.filter(p => userPurposeIds.includes(p.id));
    }

    return allPurposes;
  }, [allPurposes, user?.positions, positions]);

  const { data: revisionLocations = [] } = useQuery<RequestWorkLocation[]>({
    queryKey: ["/api/revisions", currentRevision?.id, "work-locations"],
    enabled: !!currentRevision?.id && !requestLoading && !revisionsLoading,
  });

  const { data: revisionWorkLevels = [] } = useQuery<{ id: string; workLevelId: string }[]>({
    queryKey: ["/api/revisions", currentRevision?.id, "work-levels"],
    enabled: !!currentRevision?.id && !requestLoading && !revisionsLoading,
  });

  const isMAR = requestType?.code?.toUpperCase() === "MAR";
  const isMIR = (requestType?.code?.toUpperCase() === "MIR" || (requestType?.name_english?.toUpperCase().includes("MATERIAL") && requestType?.code?.toUpperCase() !== "MAR")) && requestType?.code?.toUpperCase() !== "SSR";
  const isSSR = requestType?.code?.toUpperCase() === "SSR" || requestType?.name_english?.toUpperCase().includes("SUPPLIER SUBMITTAL");
  const isDSR = requestType?.code?.toUpperCase() === "DSR" || requestType?.name_english?.toUpperCase().includes("DOCUMENT SUBMITTAL");
  const isSD = requestType?.code?.toUpperCase() === "SD" || requestType?.code?.toUpperCase() === "ASD" || requestType?.name_english?.toUpperCase().includes("SHOP DRAWING") || requestType?.name_english?.toUpperCase().includes("DRAWING");
  const isNCR = requestType?.code?.toUpperCase() === "NCR";
  const isRNCR = requestType?.code?.toUpperCase() === "RNCR";
  const isSI = requestType?.code?.toUpperCase() === "SI";
  const isNcrFamily = isNCR || isRNCR || isSI;

  const linkedNcrId = useMemo(() => (currentRevision?.metadata as any)?.linkedNcrId, [currentRevision]);

  const { data: linkedNcrRequest } = useQuery<any>({
    queryKey: ["/api/requests", linkedNcrId],
    enabled: !!linkedNcrId,
  });

  const { data: linkedNcrRevisions = [] } = useQuery<any[]>({
    queryKey: ["/api/requests", linkedNcrId, "revisions"],
    enabled: !!linkedNcrId,
  });

  const linkedNcrCurrentRevision = useMemo(() => {
    if (!linkedNcrRequest || linkedNcrRevisions.length === 0) return null;
    return linkedNcrRevisions.find((r: any) => r.id === linkedNcrRequest.currentRevisionId) || linkedNcrRevisions[0];
  }, [linkedNcrRequest, linkedNcrRevisions]);

  const { data: projectRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/requests", { projectId: request?.projectId }],
    enabled: !!request?.projectId && (isNCR || (isRNCR && showEditRequestDetails)),
  });

  const existingRncr = projectRequests.find((r: any) => 
    r.requestTypeId === rncrType?.id && 
    (r.metadata as any)?.linkedNcrId === request?.id
  );

  const ncrRequests = useMemo(() => {
    const ncrTypeLocal = requestTypes.find(rt => rt.code?.toUpperCase() === "NCR");
    const rncrTypeLocal = requestTypes.find(rt => rt.code?.toUpperCase() === "RNCR");
    if (!ncrTypeLocal || !rncrTypeLocal) return [];
    
    // Find all linked NCR IDs from other RNCRs (excluding the current request)
    const linkedNcrIds = new Set(
      projectRequests
        .filter((r: any) => r.requestTypeId === rncrTypeLocal.id && r.id !== request?.id && !r.is_deleted)
        .map((r: any) => r.metadata?.linkedNcrId)
        .filter(Boolean)
    );

    return projectRequests.filter((r: any) => 
      r.requestTypeId === ncrTypeLocal.id && 
      !r.is_deleted && 
      !linkedNcrIds.has(r.id)
    );
  }, [requestTypes, projectRequests, request?.id]);

  const { data: revisionSuppliers = [], isLoading: suppliersLoading } = useQuery<{ id: string; supplierId: string; supplier: any }[]>({
    queryKey: ["/api/revisions", currentRevision?.id, "suppliers"],
    enabled: !!currentRevision?.id && !requestLoading && !revisionsLoading && !!isSSR,
  });

  const { data: revisionMaterials = [], isLoading: materialsLoading } = useQuery<{ id: string; materialId: string; material: any }[]>({
    queryKey: ["/api/revisions", currentRevision?.id, "materials"],
    enabled: !!currentRevision?.id && !requestLoading && !revisionsLoading && !!isMAR,
  });

  const { data: revisionDeliveries = [], isLoading: deliveriesLoading } = useQuery<{ id: string; deliveryId: string; delivery: Delivery & { items: DeliveryItem[], attachment?: ProjectDocument | null, supplierLogo?: string | null } }[]>({
    queryKey: ["/api/revisions", currentRevision?.id, "deliveries"],
    enabled: !!currentRevision?.id && !requestLoading && !revisionsLoading && !!isMIR,
  });

  const { data: workListActivity } = useQuery<WorkListActivity>({
    queryKey: ["/api/work-list-activities", currentRevision?.workListActivityId],
    enabled: !!currentRevision?.workListActivityId && !requestLoading && !revisionsLoading,
  });

  const { data: chapter, isLoading: chapterLoading } = useQuery<WorkListChapter>({
    queryKey: ["/api/work-list-chapters", workListActivity?.chapterId],
    enabled: !!workListActivity?.chapterId && !requestLoading && !revisionsLoading,
  });

  const { data: division } = useQuery<WorkListDivision>({
    queryKey: ["/api/work-list-divisions", chapter?.divisionId],
    enabled: !!chapter?.divisionId && !chapterLoading && !requestLoading && !revisionsLoading,
  });

  const { data: allWorkLevels = [] } = useQuery<WorkLevel[]>({
    queryKey: ["/api/projects", request?.projectId, "work-levels"],
    enabled: !!request?.projectId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: dbWorkLevel } = useQuery<WorkLevel>({
    queryKey: ["/api/work-levels", currentRevision?.workLevelId],
    enabled: !!currentRevision?.workLevelId && !requestLoading && !revisionsLoading,
  });

  const displayWorkLevels = useMemo(() => {
    if (revisionWorkLevels.length > 0) {
      return revisionWorkLevels.map(rwl => {
        const fullLevel = allWorkLevels.find(l => l.id === rwl.workLevelId);
        return {
          id: rwl.workLevelId,
          nameEnglish: fullLevel?.nameEnglish || "Unknown Level",
          code: fullLevel?.code || null
        };
      });
    }

    // Fallback to legacy single workLevelId
    if (dbWorkLevel) {
      return [dbWorkLevel];
    }

    if (currentRevision?.workLevelName) {
      return [{
        id: currentRevision?.workLevelId || 'legacy',
        nameEnglish: currentRevision.workLevelName,
        code: null
      }];
    }

    const levelFromAll = allWorkLevels.find(wl => wl.id === currentRevision?.workLevelId);
    return levelFromAll ? [levelFromAll] : [];
  }, [revisionWorkLevels, allWorkLevels, dbWorkLevel, currentRevision]);

  const { data: divisions = [] } = useQuery<WorkListDivision[]>({
    queryKey: ["/api/work-list-divisions"],
    enabled: showEditRequestDetails,
    staleTime: 5 * 60 * 1000,
  });

  const { data: allChapters = [] } = useQuery<WorkListChapter[]>({
    queryKey: ["/api/work-list-chapters"],
    enabled: showEditRequestDetails,
    staleTime: 5 * 60 * 1000,
  });

  const { data: allActivities = [] } = useQuery<WorkListActivity[]>({
    queryKey: ["/api/work-list-activities"],
    enabled: showEditRequestDetails,
    staleTime: 5 * 60 * 1000,
  });

  const { data: projectWorkLocations = [] } = useQuery<WorkLocation[]>({
    queryKey: ["/api/projects", request?.projectId, "work-locations"],
    enabled: !!request?.projectId && showEditRequestDetails,
  });

  // Removed duplicate isMIR definition as it's moved above queries

  useEffect(() => {
    if (isMIR && checklistTab === "main") {
      setChecklistTab("mir");
    } else if (isSSR && checklistTab === "main") {
      setChecklistTab("ssr");
    } else if (isMAR && checklistTab === "main") {
      setChecklistTab("mar");
    }
  }, [isMIR, isSSR, isMAR, checklistTab]);

  const { data: projectDeliveries = [] } = useQuery<Delivery[]>({
    queryKey: ["/api/projects", request?.projectId, "deliveries"],
    enabled: !!request?.projectId && showEditRequestDetails && isMIR,
  });

  const { data: projectSuppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers", { projectId: request?.projectId }],
    enabled: !!request?.projectId && showEditRequestDetails && (isSSR || isMAR),
  });

  const { data: linkedSuppliersForMaterial = [] } = useQuery<any[]>({
    queryKey: ["/api/materials", materialToLinkSupplier?.id, "suppliers"],
    enabled: !!materialToLinkSupplier?.id && linkSupplierOpen,
  });

  const { data: projectMaterials = [] } = useQuery<any[]>({
    queryKey: ["/api/materials", { projectId: request?.projectId }],
    enabled: !!request?.projectId && showEditRequestDetails && isMAR,
  });

  const { data: assignedMaterialIds = [] } = useQuery<string[]>({
    queryKey: ["/api/projects", request?.projectId, "assigned-materials", { excludeRequestId: requestId }],
    enabled: !!request?.projectId && showEditRequestDetails && isMAR && !!requestId,
  });

  const { data: assignedSupplierIds = [] } = useQuery<string[]>({
    queryKey: ["/api/projects", request?.projectId, "assigned-suppliers", { excludeRequestId: requestId }],
    enabled: !!request?.projectId && showEditRequestDetails && isSSR && !!requestId,
  });

  // Fetch team members authorized to perform the current workflow step
  const { data: authorizedMembers = [] } = useQuery<AuthorizedTeamMember[]>({
    queryKey: ["/api/requests", requestId, "step-authorized-members"],
    enabled: !!requestId && !!currentRevision?.currentStepId && !requestLoading && !revisionsLoading,
  });

  const editFilteredChapters = useMemo(() => {
    if (!editSelectedDivisionId) return [];
    return allChapters.filter(c => c.divisionId === editSelectedDivisionId);
  }, [allChapters, editSelectedDivisionId]);

  const editFilteredActivities = useMemo(() => {
    if (!editSelectedChapterId) return [];
    return allActivities.filter(a => a.chapterId === editSelectedChapterId);
  }, [allActivities, editSelectedChapterId]);

  const editBuildings = useMemo(() => Array.from(new Set(projectWorkLocations.map((l: WorkLocation) => l.buildingNo).filter(Boolean))), [projectWorkLocations]);
  const editFloors = useMemo(() => Array.from(new Set(projectWorkLocations.map((l: WorkLocation) => l.floor).filter(Boolean))), [projectWorkLocations]);
  const editParts = useMemo(() => Array.from(new Set(projectWorkLocations.map((l: WorkLocation) => l.part).filter(Boolean))), [projectWorkLocations]);

  const editFilteredWorkLocations = useMemo(() => {
    const filtered = projectWorkLocations.filter((loc: WorkLocation) => {
      const matchesBuilding = !editBuildingFilter || editBuildingFilter === "all-buildings" || loc.buildingNo === editBuildingFilter;
      const matchesFloor = !editFloorFilter || editFloorFilter === "all-floors" || loc.floor === editFloorFilter;
      const matchesPart = !editPartFilter || editPartFilter === "all-parts" || loc.part === editPartFilter;
      const notSelected = !editSelectedLocations.find(s => s.id === loc.id);

      if (!matchesBuilding || !matchesFloor || !matchesPart || !notSelected) return false;

      if (!editLocationSearch) return true;

      const search = editLocationSearch.toLowerCase();
      // Check if search matches any part of the location
      const unit = (loc.unitCustomNumber || "").toLowerCase();
      const zone = (loc.unitZone || "").toLowerCase();
      const block = (loc.unitBlock || "").toLowerCase();
      const building = (loc.buildingNo || "").toLowerCase();
      const floor = (loc.floor || "").toLowerCase();
      const part = (loc.part || "").toLowerCase();

      return (
        unit.includes(search) ||
        zone.includes(search) ||
        block.includes(search) ||
        building.includes(search) ||
        floor.includes(search) ||
        part.includes(search)
      );
    });

    // Sort locations: Unit Number -> Building -> Floor -> Part
    return filtered.sort((a, b) => {
      // Compare Unit Custom Number FIRST
      const unitA = a.unitCustomNumber || "";
      const unitB = b.unitCustomNumber || "";
      const unitDiff = unitA.localeCompare(unitB, undefined, { numeric: true, sensitivity: 'base' });
      if (unitDiff !== 0) return unitDiff;

      // Compare Building
      const buildingA = a.buildingNo || "";
      const buildingB = b.buildingNo || "";
      const buildingDiff = buildingA.localeCompare(buildingB, undefined, { numeric: true, sensitivity: 'base' });
      if (buildingDiff !== 0) return buildingDiff;

      // Compare Floor
      const floorA = a.floor || "";
      const floorB = b.floor || "";
      const floorDiff = floorA.localeCompare(floorB, undefined, { numeric: true, sensitivity: 'base' });
      if (floorDiff !== 0) return floorDiff;

      // Compare Part
      const partA = a.part || "";
      const partB = b.part || "";
      return partA.localeCompare(partB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [projectWorkLocations, editBuildingFilter, editFloorFilter, editPartFilter, editSelectedLocations, editLocationSearch]);

  const { data: activityChecklistData = [] } = useQuery<ActivityChecklistItemResult[]>({
    queryKey: ["/api/work-list-activities", currentRevision?.workListActivityId, "checklist-items"],
    enabled: !!currentRevision?.workListActivityId && !requestLoading && !revisionsLoading,
  });

  const activityChecklistItems = activityChecklistData.map(item => item.checklistItem);

  const { data: allChecklistItems = [] } = useQuery<ChecklistItem[]>({
    queryKey: ["/api/checklist-items"],
    enabled: isMIR || isSSR || isMAR, // Enabled for MIR, SSR, and MAR requests to load global checklist items
  });

  const { data: checklistResponses = [] } = useQuery<RevisionChecklistResponse[]>({
    queryKey: ["/api/revisions", currentRevision?.id, "checklist-responses"],
    enabled: !!currentRevision?.id && !requestLoading && !revisionsLoading,
  });

  const { data: consultantReviews = [] } = useQuery<ConsultantReview[]>({
    queryKey: ["/api/revisions", currentRevision?.id, "consultant-reviews"],
    enabled: !!currentRevision?.id && !requestLoading && !revisionsLoading,
  });

  const { data: consultantAttachments = [] } = useQuery<any[]>({
    queryKey: ["/api/revisions", currentRevision?.id, "attachments"],
    enabled: !!currentRevision?.id && !requestLoading && !revisionsLoading,
  });

  // Check if current user is from the consultant organization
  const isUserFromConsultantOrg = user?.organizationId && request?.consultantId && user.organizationId === request.consultantId;

  // Check if current user is from the contractor organization
  const isUserFromContractorOrg = user?.organizationId && request?.contractorId && user.organizationId === request.contractorId;

  // Check if RNCR has been received by consultant
  const isReceivedByConsultant = isRNCR && consultantReviews.some(r => r.receivedAt);

  // Check if current user has Project Manager position
  const isProjectManager = user?.positions?.some(position =>
    position.toLowerCase().includes("project manager")
  ) || false;

  // Check if current user is a Document Controller
  const isDocumentController = user?.positions?.some(position =>
    position.toLowerCase().includes("document controller")
  ) || false;

  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users?skipFiltering=true"],
    staleTime: 5 * 60 * 1000,
  });

  const getUserName = (userId: string) => {
    if (!users || !Array.isArray(users)) return "Loading...";
    const foundUser = users.find(u => u.id === userId);
    return foundUser?.fullName || foundUser?.username || "Unknown User";
  };

  const getUserSignature = (userId: string) => {
    if (!users || !Array.isArray(users)) return "";
    const foundUser = users.find(u => u.id === userId);
    return foundUser?.signature || "";
  };

  const getUserPosition = (userId: string): string => {
    if (!users || !Array.isArray(users)) return "";
    const foundUser = users.find(u => u.id === userId) as (UserType & { position?: string | null }) | undefined;
    return foundUser?.position || "";
  };

  const approveMutation = useMutation({
    mutationFn: async ({ stepName, approvalStatusCode, approvalComments, autoAdvanceToStep }: {
      stepName: string;
      approvalStatusCode?: string;
      approvalComments?: string;
      autoAdvanceToStep?: number;
    }) => {
      return await apiRequest("POST", `/api/revisions/${currentRevision?.id}/approve`, {
        stepName,
        approvalStatusCode,
        approvalComments,
        autoAdvanceToStep,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "consultant-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "approval-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId, "revisions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId, "transitions"] });
      toast({ title: "Approved", description: "Your approval has been recorded." });
      setPendingAutoTransition(null);
      pendingAutoTransitionRef.current = null;
      setApprovingStep(null);
      approvingStepRef.current = null;
      setSelectedApprovalStatusCode("A");
      setApprovalComments("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to record approval", variant: "destructive" });
    },
  });

  // Find available transition for a specific target step by ID
  const getTransitionForStep = (targetStepId: number): WorkflowTransition | undefined => {
    return transitionsData?.transitions?.find(t =>
      t.toStepId === targetStepId ||
      (t.toStepId && (t.toStepId % 100) === (targetStepId % 100))
    );
  };

  // Find available transition for a specific step by name
  const getTransitionForStepName = (targetStepName: string): WorkflowTransition | undefined => {
    return transitionsData?.transitions?.find(t =>
      t.toStepName?.toLowerCase().includes(targetStepName.toLowerCase())
    );
  };

  // Check if we're currently at a specific step
  const isAtStep = (stepId: number): boolean => {
    const currentId = transitionsData?.currentStep?.id;
    if (currentId === stepId) return true;

    // Support comparing any equivalents across 1xx, 2xx, 3xx, and 4xx series (e.g., 101 == 201 == 301 == 401)
    if (currentId && stepId) {
      return (currentId % 100) === (stepId % 100);
    }

    return false;
  };

  // Check if we're at a step by name
  const isAtStepName = (stepName: string): boolean => {
    return transitionsData?.currentStep?.stepName?.toLowerCase().includes(stepName.toLowerCase()) || false;
  };

  const getStepApproval = (stepName: string) => {
    return statusHistory.find(h => h.newStatus.includes(stepName));
  };

  const isManagerApproved = isRNCR && !!getStepApproval("Consultant Manager Approval");

  const isNcrOrSiManagerApproved = isSI
    ? !!getStepApproval("Consultant PM Approval")
    : (isNCR ? !!getStepApproval("Consultant Manager Approval") : false);

  const moveMutation = useMutation({
    mutationFn: async (data: { toStepId: number; newStatus: string; remarks?: string }) => {
      return await apiRequest("POST", `/api/requests/${requestId}/move`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId, "transitions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "history"] });
      toast({ title: "Request updated", description: "Workflow step has been changed" });
      setShowTransitionDialog(false);
      setTransitionRemarks("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update request", variant: "destructive" });
    },
  });

  const createRncrMutation = useMutation({
    mutationFn: async () => {
      const requestPayload = {
        projectId: request?.projectId,
        requestTypeId: rncrType?.id,
        referenceCode: `RNCR-000`,
        title: `Reply to ${request?.requestNumber}`,
        workListActivityId: currentRevision?.workListActivityId || null,
        scheduledDate: currentRevision?.scheduledDate || null,
        divisionName: currentRevision?.divisionName || null,
        chapterName: currentRevision?.chapterName || null,
        activityName: currentRevision?.activityName || null,
        activityCode: currentRevision?.activityCode || null,
        description: "",
        metadata: {
          linkedNcrId: request?.id,
          ncrSubject: `Re: ${request?.requestNumber}`
        }
      };

      const response = await fetch("/api/requests/create-with-revision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create RNCR");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      if (data?.activity?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
        queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
        navigate(`/create-wir/${data.activity.id}?typeId=${rncrType?.id}&linkedNcrId=${request?.id}`);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleApprovalClick = (stepName: string, autoTransitionStepId?: number, initialStatusCode?: string) => {
    setApprovingStep(stepName);
    approvingStepRef.current = stepName;

    // Store the auto-transition step if provided - dynamically map to the correct request series prefix
    let finalAutoStep = autoTransitionStepId;
    if (finalAutoStep) {
      const currentId = transitionsData?.currentStep?.id;
      if (currentId) {
        const series = Math.floor(currentId / 100);
        finalAutoStep = (series * 100) + (finalAutoStep % 100);
      } else if (requestType?.id_number) {
        finalAutoStep = (requestType.id_number * 100) + (finalAutoStep % 100);
      }
    }

    if (finalAutoStep) {
      setPendingAutoTransition(finalAutoStep);
      pendingAutoTransitionRef.current = finalAutoStep;
    } else {
      setPendingAutoTransition(null);
      pendingAutoTransitionRef.current = null;
    }
    // Set initial approval status code if provided (e.g., from consultant team's selection)
    if (initialStatusCode) {
      setSelectedApprovalStatusCode(initialStatusCode);
    } else {
      setSelectedApprovalStatusCode("A"); // Default to A if not provided
    }
  };

  const confirmApproval = () => {
    if (approvingStep) {
      const statusCode = selectedApprovalStatusCode;
      // Auto-advance for all outcomes to ensure the workflow completes and triggers terminal actions (Close/Resubmit)
      const shouldAutoAdvance = ["A", "B", "C", "D", "E"].includes(statusCode);
      const autoAdvanceToStep = shouldAutoAdvance ? (pendingAutoTransitionRef.current || undefined) : undefined;

      if (approvingStep === "Consultant Manager Approval") {
        approveMutation.mutate({
          stepName: approvingStep,
          approvalStatusCode: statusCode,
          approvalComments: approvalComments || undefined,
          autoAdvanceToStep,
        });
      } else {
        approveMutation.mutate({ stepName: approvingStep, autoAdvanceToStep });
      }
    }
  };

  const closeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/requests/${requestId}/close`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "history"] });
      toast({ title: "Request Closed", description: "The request has been closed successfully." });
    },
    onError: (error: any) => {
      let description = "Failed to close request";
      try {
        const errorText = error.message?.replace(/^\d+:\s*/, "") || "";
        const parsed = JSON.parse(errorText);
        if (parsed.missingApprovals && parsed.missingApprovals.length > 0) {
          description = `Missing approvals: ${parsed.missingApprovals.join(", ")}`;
        } else if (parsed.error) {
          description = parsed.error;
        }
      } catch {
        description = error.message || "Failed to close request";
      }
      toast({ title: "Cannot Close Request", description, variant: "destructive" });
    },
  });

  const createRevisionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/requests/${requestId}/revisions`, {});
    },
    onSuccess: (newRevision: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId, "revisions"] });
      // Invalidate project deliveries to update the xN revision count on cards
      if (request?.projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", request.projectId, "deliveries"] });
      }
      toast({ title: "Revision Created", description: `Revision ${newRevision.revisionNo} created successfully.` });
      setSelectedRevision(newRevision.id);
    },
    onError: (error: any) => {
      toast({ title: "Cannot Create Revision", description: error.message || "Failed to create revision", variant: "destructive" });
    },
  });

  const addInquiryMutation = useMutation({
    mutationFn: async (data: { question: string; isRequired?: boolean }) => {
      return await apiRequest("POST", `/api/revisions/${currentRevision?.id}/inquiries`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "inquiries"] });
      toast({ title: "Inquiry added" });
      setAddInquiryOpen(false);
      setNewInquiryQuestion("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add inquiry", variant: "destructive" });
    },
  });

  const answerInquiryMutation = useMutation({
    mutationFn: async (data: { id: string; answer: string }) => {
      return await apiRequest("PATCH", `/api/inquiries/${data.id}`, { answer: data.answer });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "inquiries"] });
      toast({ title: "Answer saved" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save answer", variant: "destructive" });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { message?: string; files?: File[] }) => {
      const attachments: Array<{ title?: string; fileName: string; fileType?: string; fileUrl?: string; fileSize?: number }> = [];

      if (data.files && data.files.length > 0) {
        const uploadPromises = data.files.map(async (file) => {
          let fileToUpload = file;
          // Only compress if the file is an image and larger than 500KB
          if (file.type.startsWith("image/") && file.size > 500 * 1024) {
            try {
              fileToUpload = await imageCompression(file, {
                maxSizeMB: 0.5,
                maxWidthOrHeight: 1920,
                useWebWorker: false,
                initialQuality: 0.7
              });
            } catch (error) {
              console.error("Compression failed:", error);
              // Fallback to original file
            }
          }

          const uploadResponse = await fetch("/api/uploads/request-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: file.name, // Keep original name
              size: fileToUpload.size, // Use compressed size
              contentType: fileToUpload.type,
              projectId: request?.projectId,
            }),
          });
          const uploadData = await uploadResponse.json();
          const { uploadURL, objectPath } = uploadData;

          await fetch(uploadURL, {
            method: "PUT",
            body: fileToUpload,
            headers: { "Content-Type": fileToUpload.type },
          });

          return {
            title: file.name,
            fileName: file.name,
            fileType: file.type,
            fileUrl: objectPath,
            fileSize: file.size,
          };
        });

        const uploadedAttachments = await Promise.all(uploadPromises);
        attachments.push(...uploadedAttachments);
      }

      return await apiRequest("POST", `/api/revisions/${currentRevision?.id}/messages`, {
        message: data.message,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
    },
    onSuccess: async (res) => {
      const newMessage = await res.json();
      queryClient.setQueryData(["/api/requests", requestId, "all-messages"], (old: any) => {
        const currentMessages = old || [];
        // Avoid duplicate entry if the message was already added via the WebSocket event
        if (currentMessages.some((m: any) => m.id === newMessage.id)) {
          return currentMessages;
        }
        return [...currentMessages, newMessage];
      });
      queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId, "all-messages"] });
      setChatMessage("");
      setChatFiles([]);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to send message", variant: "destructive" });
    },
  });

  const checklistResponseMutation = useMutation({
    mutationFn: async (data: { revisionId: string; checklistItemId: string; response: "yes" | "no" | "na"; remarks?: string }) => {
      return await apiRequest("POST", `/api/revisions/${data.revisionId}/checklist-responses`, {
        checklistItemId: data.checklistItemId,
        response: data.response,
        remarks: data.remarks,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "checklist-responses"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save response", variant: "destructive" });
    },
  });

  // Search checklist items for recommendations - using full URL as queryKey for default queryFn
  const searchUrl = recommendationSearch.length >= 2
    ? `/api/checklist-items/search?q=${encodeURIComponent(recommendationSearch)}&category=recommendations`
    : "";
  const { data: searchedChecklistItems = [] } = useQuery<ChecklistItem[]>({
    queryKey: [searchUrl],
    enabled: recommendationSearch.length >= 2,
  });

  // Add recommendation mutation
  const addRecommendationMutation = useMutation({
    mutationFn: async (data: { checklistItemId?: string; customText?: string }) => {
      return await apiRequest("POST", `/api/revisions/${currentRevision?.id}/recommendations`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-list-activities", currentRevision?.workListActivityId, "checklist-items"] });
      setShowAddRecommendationDialog(false);
      setRecommendationSearch("");
      setCustomRecommendationText("");
      setSelectedChecklistItemId(null);
      toast({ title: "Success", description: "Recommendation added successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add recommendation", variant: "destructive" });
    },
  });

  // Delete recommendation mutation
  const deleteRecommendationMutation = useMutation({
    mutationFn: async (checklistItemId: string) => {
      return await apiRequest("DELETE", `/api/revisions/${currentRevision?.id}/recommendations/${checklistItemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-list-activities", currentRevision?.workListActivityId, "checklist-items"] });
      toast({ title: "Deleted", description: "Recommendation removed successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete recommendation", variant: "destructive" });
    },
  });

  const updateConsultantReviewMutation = useMutation({
    mutationFn: async (data: { id: string; comments?: string; statusCode?: string; receivedAt?: string; reviewedAt?: string }) => {
      return await apiRequest("PATCH", `/api/consultant-reviews/${data.id}`, {
        comments: data.comments,
        statusCode: data.statusCode,
        receivedAt: data.receivedAt,
        reviewedAt: data.reviewedAt,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "consultant-reviews"] });
      toast({ title: "Updated", description: "Review updated successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update review", variant: "destructive" });
    },
  });

  const createApprovalStatusMutation = useMutation({
    mutationFn: async (data: { revisionId: string; statusCode: string; comments?: string }) => {
      return await apiRequest("POST", `/api/revisions/${data.revisionId}/approval-status`, {
        statusCode: data.statusCode,
        comments: data.comments,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "approval-status"] });
    },
    onError: (error: any) => {
      console.error("Failed to create approval status record:", error);
    },
  });

  const updateDescriptionMutation = useMutation({
    mutationFn: async (data: { revisionId: string; description: string }) => {
      return await apiRequest("PATCH", `/api/revisions/${data.revisionId}`, {
        description: data.description,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId, "revisions"] });
      setIsEditingDescription(false);
      toast({ title: "Updated", description: "Description updated successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update description", variant: "destructive" });
    },
  });

  const [uploadAttachmentTitle, setUploadAttachmentTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [showDocumentUpload, setShowDocumentUpload] = useState(false);
  const [uploadDocumentTitle, setUploadDocumentTitle] = useState("");
  const [selectedDocumentFile, setSelectedDocumentFile] = useState<File | null>(null);
  const documentFileInputRef = useRef<HTMLInputElement>(null);

  const uploadAttachmentMutation = useMutation({
    mutationFn: async (data: { file: File; title: string }) => {
      let fileToUpload = data.file;

      // Compress if it is an image and > 500 KB
      if (data.file.type.startsWith("image/") && data.file.size > 500 * 1024) {
        try {
          fileToUpload = await imageCompression(data.file, {
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
          name: data.file.name, // keep original filename
          size: fileToUpload.size,
          contentType: fileToUpload.type,
          folder: "images",
          projectId: request?.projectId,
        }),
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(errorText || "Failed to get upload URL");
      }

      const uploadData = await uploadResponse.json();
      const { uploadURL, objectPath } = uploadData;

      const putResponse = await fetch(uploadURL, {
        method: "PUT",
        body: fileToUpload,
        headers: { "Content-Type": fileToUpload.type },
      });

      if (!putResponse.ok) {
        throw new Error("Failed to upload file to storage");
      }

      await apiRequest("POST", `/api/revisions/${currentRevision?.id}/attachments`, {
        fileName: data.file.name,
        fileType: fileToUpload.type,
        fileUrl: objectPath,
        fileSize: fileToUpload.size,
        title: data.title,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "attachments"] });
      setShowAttachmentUpload(false);
      setUploadAttachmentTitle("");
      setSelectedFile(null);
      toast({ title: "Uploaded", description: "Attachment uploaded successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to upload attachment", variant: "destructive" });
    },
  });
  const uploadDocumentMutation = useMutation({
    mutationFn: async (data: { file: File; title: string }) => {
      const uploadResponse = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.file.name,
          size: data.file.size,
          contentType: data.file.type,
          projectId: request?.projectId,
        }),
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const uploadData = await uploadResponse.json();
      const { uploadURL, objectPath } = uploadData;

      const putResponse = await fetch(uploadURL, {
        method: "PUT",
        body: data.file,
        headers: { "Content-Type": data.file.type },
      });

      if (!putResponse.ok) {
        throw new Error("Failed to upload file to storage");
      }

      await apiRequest("POST", `/api/revisions/${currentRevision?.id}/documents`, {
        sourceType: "upload",
        projectDocumentId: null,
        title: data.title || data.file.name,
        fileName: data.file.name,
        fileUrl: objectPath,
        fileSize: data.file.size,
        mimeType: data.file.type,
        documentType: "", // NCR default
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "documents"] });
      setShowDocumentUpload(false);
      setUploadDocumentTitle("");
      setSelectedDocumentFile(null);
      toast({ title: "Uploaded", description: "Document uploaded successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to upload document", variant: "destructive" });
    },
  });


  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return await apiRequest("DELETE", `/api/attachments/${attachmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "attachments"] });
      toast({ title: "Deleted", description: "Attachment deleted successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete attachment", variant: "destructive" });
    },
  });


  const linkProjectDocumentsMutation = useMutation({
    mutationFn: async (selections: { document: any, title: string }[]) => {
      for (const selection of selections) {
        const doc = selection.document;
        const customTitle = selection.title;

        // Only link to the project_documents table if it's a real PROJECT asset
        // (to avoid foreign key constraint violations if the document is actually a request attachment)
        const isProjectAsset = (doc as any).sourceType === 'project';

        await apiRequest("POST", `/api/revisions/${currentRevision?.id}/documents`, {
          sourceType: "project",
          projectDocumentId: isProjectAsset ? doc.id : null,
          title: customTitle || "",
          fileName: doc.fileName || doc.name,
          fileUrl: (doc as any).fileUrl || doc.fileData,
          fileSize: 0,
          mimeType: doc.type,
          documentType: "contractor",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "documents"] });
      setIsStorageModalOpen(false);
      toast({ title: "Linked", description: "Project documents linked successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to link documents", variant: "destructive" });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      return await apiRequest("DELETE", `/api/request-documents/${documentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "documents"] });
      setDeletingDocumentId(null);
      toast({ title: "Deleted", description: "Document deleted successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete document", variant: "destructive" });
    },
  });

  const updateRevisionDetailsMutation = useMutation({
    mutationFn: async (data: {
      workListActivityId: string | null;
      workLevelId: string | null;
      scheduledDate?: string;
      divisionName?: string | null;
      chapterName?: string | null;
      activityName?: string | null;
      activityCode?: string | null;
      description?: string | null;
      metadata?: any;
    }) => {
      return await apiRequest("PATCH", `/api/revisions/${currentRevision?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId, "revisions"] });
      if (editSelectedActivityId) {
        queryClient.invalidateQueries({ queryKey: ["/api/work-list-activities", editSelectedActivityId] });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update revision", variant: "destructive" });
    },
  });

  const addRevisionLocationMutation = useMutation({
    mutationFn: async (data: { workLocationId: string; unit?: string; zone?: string; block?: string; building?: string; floor?: string; part?: string }) => {
      return await apiRequest("POST", `/api/revisions/${currentRevision?.id}/work-locations`, data);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add location", variant: "destructive" });
    },
  });

  const deleteRevisionLocationMutation = useMutation({
    mutationFn: async (locationId: string) => {
      return await apiRequest("DELETE", `/api/revisions/${currentRevision?.id}/work-locations/${locationId}`);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to remove location", variant: "destructive" });
    },
  });

  const handleOpenEditRequestDetails = () => {
    if (workListActivity && chapter) {
      setEditSelectedDivisionId(chapter.divisionId);
      setEditSelectedChapterId(workListActivity.chapterId);
      setEditSelectedActivityId(workListActivity.id);
    } else if (currentRevision) {
      // For MIR or cases where activity link is missing, match by name
      const foundDivision = divisions.find(d =>
        d.nameEnglish === currentRevision.divisionName || d.nameArabic === currentRevision.divisionName
      );
      if (foundDivision) {
        setEditSelectedDivisionId(foundDivision.id);
        const foundChapter = allChapters.find(c =>
          c.divisionId === foundDivision.id &&
          (c.nameEnglish === currentRevision.chapterName || c.nameArabic === currentRevision.chapterName)
        );
        if (foundChapter) {
          setEditSelectedChapterId(foundChapter.id);
          const foundActivity = allActivities.find(a =>
            a.chapterId === foundChapter.id &&
            (a.nameEnglish === currentRevision.activityName || a.nameArabic === currentRevision.activityName || a.code === currentRevision.activityCode)
          );
          if (foundActivity) {
            setEditSelectedActivityId(foundActivity.id);
          }
        }
      }
    }

    // Initialize multiple work levels for editing
    const existingWorkLevels: SelectedWorkLevel[] = revisionWorkLevels.map(rwl => {
      const level = allWorkLevels.find(l => l.id === rwl.workLevelId);
      return {
        id: rwl.workLevelId,
        code: level?.code || "",
        title: level?.nameEnglish || "",
      };
    });

    // Fallback to legacy single workLevelId if no revisionWorkLevels records exist
    if (existingWorkLevels.length === 0 && currentRevision?.workLevelId) {
      const level = allWorkLevels.find(l => l.id === currentRevision.workLevelId);
      if (level) {
        existingWorkLevels.push({
          id: level.id,
          code: level.code,
          title: level.nameEnglish,
        });
      }
    }

    setEditSelectedWorkLevels(existingWorkLevels);

    if (revisionPurposes.length > 0) {
      setEditSelectedPurposeId(revisionPurposes[0].purposeId || "");
    }
    const existingLocations: SelectedWorkLocation[] = revisionLocations.map(loc => ({
      id: loc.workLocationId,
      unit: loc.unit || "",
      zone: loc.zone || "",
      block: loc.block || "",
      building: loc.building || "",
      floor: loc.floor || "",
      part: loc.part || "",
    }));
    if (currentRevision?.scheduledDate) {
      setEditScheduledDate(currentRevision.scheduledDate.split('T')[0]);
    } else {
      setEditScheduledDate("");
    }
    setEditSelectedLocations(existingLocations);

    if (isNCR) {
      setEditSelectedActivityId(currentRevision?.workListActivityId || "");
      setEditNcrType((currentRevision?.metadata as any)?.ncrType || "NCR");
      setEditNcrSource((currentRevision?.metadata as any)?.ncrSource || "Inspection");
      setEditNcrSubject((currentRevision?.metadata as any)?.ncrSubject || "");
      setEditDescription(currentRevision?.description || "");
    }
    
    if (isSI) {
      setEditNcrSubject((currentRevision?.metadata as any)?.subject || (currentRevision?.metadata as any)?.ncrSubject || "");
      setEditDescription(currentRevision?.description || "");
    }
    
    if (isRNCR) {
      setEditSelectedLinkedNcrId((currentRevision?.metadata as any)?.linkedNcrId || "");
      setEditNcrSubject((currentRevision?.metadata as any)?.ncrSubject || "");
    }

    if (isMIR && revisionDeliveries.length > 0) {
      setEditSelectedDeliveries(revisionDeliveries.map(rd => ({
        id: rd.deliveryId,
        shipmentNumber: rd.delivery?.shipmentNumber || "Unknown",
        deliveryInvoiceNumber: rd.delivery?.deliveryInvoiceNumber || null,
        materialName: rd.delivery?.items?.map(i => i.materialName).join(", ") || "Unknown",
        supplier: rd.delivery?.supplier || "Unknown",
        arrivalDate: rd.delivery?.arrivalDate || null
      })));
    } else {
      setEditSelectedDeliveries([]);
    }

    if (isSSR && revisionSuppliers.length > 0) {
      setEditSelectedSuppliers(revisionSuppliers.map(rs => ({
        id: rs.supplierId,
        name: rs.supplier?.supplierName || "Unknown",
        supplierName: rs.supplier?.supplierName || "Unknown",
        category: rs.supplier?.category || "General",
        email: rs.supplier?.email || null,
        phone: rs.supplier?.phone || null,
        contactPerson: rs.supplier?.contactPerson || null,
        experienceYears: rs.supplier?.experienceYears || null,
        address: rs.supplier?.address || null,
        taxNumber: rs.supplier?.taxNumber || null,
        logoUrl: rs.supplier?.logoUrl || null
      })));
    } else {
      setEditSelectedSuppliers([]);
    }

    if (isMAR && revisionMaterials.length > 0) {
      setEditSelectedMaterials(revisionMaterials.map(rm => ({
        id: rm.materialId,
        materialName: rm.material?.materialName || "Unknown",
        category: rm.material?.category || "General",
        unit: rm.material?.unit || "",
        materialCode: rm.material?.materialCode || null,
        originCountry: rm.material?.originCountry || null,
        imageUrl: rm.material?.imageUrl || null
      })));
    } else {
      setEditSelectedMaterials([]);
    }

    if ((isDSR || isSD) && revisionDocuments.length > 0) {
      setEditSelectedDocuments(revisionDocuments.map(doc => ({
        id: doc.id,
        title: doc.title || "",
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        sourceType: doc.sourceType || "upload",
        projectDocumentId: doc.projectDocumentId,
        documentType: doc.documentType || "",
        documentRef: doc.documentRef || "",
        isNew: false
      })));
    } else {
      setEditSelectedDocuments([]);
    }

    setShowEditRequestDetails(true);
  };

  const handleEditDivisionChange = (divisionId: string) => {
    setEditSelectedDivisionId(divisionId);
    setEditSelectedChapterId("");
    setEditSelectedActivityId("");
  };

  const handleEditChapterChange = (chapterId: string) => {
    setEditSelectedChapterId(chapterId);
    setEditSelectedActivityId("");
  };

  const handleEditAddLocationById = (locationId: string) => {
    const location = projectWorkLocations.find(l => l.id === locationId);
    if (location && !editSelectedLocations.find(s => s.id === locationId)) {
      setEditSelectedLocations([...editSelectedLocations, {
        id: location.id,
        unit: location.unitCustomNumber || "",
        zone: location.unitZone || "",
        block: location.unitBlock || "",
        building: location.buildingNo || "",
        floor: location.floor || "",
        part: location.part || "",
      }]);
    }
  };

  const handleEditRemoveLocation = (locationId: string) => {
    setEditSelectedLocations(editSelectedLocations.filter(l => l.id !== locationId));
  };

  const handleEditSelectAllFiltered = () => {
    const newLocations = editFilteredWorkLocations.map((loc: WorkLocation) => ({
      id: loc.id,
      unit: loc.unitCustomNumber || "",
      zone: loc.unitZone || "",
      block: loc.unitBlock || "",
      building: loc.buildingNo || "",
      floor: loc.floor || "",
      part: loc.part || "",
    }));
    setEditSelectedLocations([...editSelectedLocations, ...newLocations]);
  };

  const handleEditDeselectAll = () => {
    setEditSelectedLocations([]);
  };

  const handleEditRemoveDelivery = (deliveryId: string) => {
    setEditSelectedDeliveries(editSelectedDeliveries.filter(d => d.id !== deliveryId));
  };

  const handleEditAddDeliveryById = (deliveryId: string) => {
    const delivery = projectDeliveries.find(d => d.id === deliveryId) as any;
    if (delivery && !editSelectedDeliveries.some(s => s.id === deliveryId)) {
      setEditSelectedDeliveries([...editSelectedDeliveries, {
        id: delivery.id,
        shipmentNumber: delivery.shipmentNumber,
        deliveryInvoiceNumber: delivery.deliveryInvoiceNumber,
        materialName: (delivery.items || []).map((i: any) => i.materialName).join(", "),
        supplier: delivery.supplier,
        arrivalDate: delivery.arrivalDate,
      }]);
    }
  };

  const handleSaveRequestDetails = async () => {
    setIsSavingDetails(true);
    const missing: string[] = [];

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
        missing.push(`${contextLabel} '${sup.supplierName || sup.name}': missing profile fields (${missingFields.join(", ")})`);
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
            missing.push(`${contextLabel} '${sup.supplierName || sup.name}': missing documents (${missingForSup.join(", ")})`);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    if (!editSelectedPurposeId) {
      missing.push("Purpose (الغرض)");
    }

    if (isSSR) {
      if (editSelectedSuppliers.length === 0) {
        missing.push("Select at least one Supplier (اختيار مورد واحد على الأقل)");
      } else {
        // Fetch attachments and validate selected suppliers
        for (const sup of editSelectedSuppliers) {
          await checkSupplierCompleteness(sup, "Supplier");
        }
      }
    }

    if (isMAR) {
      if (editSelectedMaterials.length === 0) {
        missing.push("Select at least one Material (اختيار مادة واحدة على الأقل)");
      } else {
        // Fetch attachments for selected materials
        for (const mat of editSelectedMaterials) {
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

    if (missing.length > 0) {
      setMissingFields(missing);
      setShowValidationDialog(true);
      setIsSavingDetails(false);
      return;
    }

    const selectedDivision = divisions.find(d => d.id === editSelectedDivisionId);
    const selectedChapter = allChapters.find(c => c.id === editSelectedChapterId);
    const selectedActivity = allActivities.find(a => a.id === editSelectedActivityId);

    const parseNumericFileSize = (val: any): number | null => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const parsed = Number(val);
        if (!isNaN(parsed)) return parsed;
        const match = val.match(/^([\d.]+)\s*(KB|MB|GB|B)?$/i);
        if (match) {
          const num = parseFloat(match[1]);
          const unit = (match[2] || '').toUpperCase();
          if (unit === 'KB') return Math.round(num * 1024);
          if (unit === 'MB') return Math.round(num * 1024 * 1024);
          if (unit === 'GB') return Math.round(num * 1024 * 1024 * 1024);
          return Math.round(num);
        }
      }
      return null;
    };

    try {
      setIsSavingDetails(true);

      // Collect all promises to run in parallel
      const promises: Promise<any>[] = [];

      // 1. Update Revision Details
      promises.push(updateRevisionDetailsMutation.mutateAsync({
        workListActivityId: editSelectedActivityId || null,
        workLevelId: editSelectedWorkLevels[0]?.id || null,
        scheduledDate: editScheduledDate,
        divisionName: selectedDivision?.nameEnglish || null,
        chapterName: selectedChapter?.nameEnglish || null,
        activityName: selectedActivity?.nameEnglish || selectedChapter?.nameEnglish || null,
        activityCode: selectedActivity?.code || null,
        description: isNcrFamily ? editDescription : undefined,
        metadata: {
          ...(currentRevision?.metadata as any || {}),
          ...(isNcrFamily ? { 
            ...(isNCR ? { ncrType: editNcrType, ncrSource: editNcrSource, ncrSubject: editNcrSubject } : {}),
            ...(isSI ? { subject: editNcrSubject, ncrSubject: editNcrSubject } : {}),
            ...(isRNCR ? { linkedNcrId: editSelectedLinkedNcrId, ncrSubject: `Re: ${projectRequests.find(r => r.id === editSelectedLinkedNcrId)?.requestNumber || "NCR"}` } : {}),
          } : {})
        }
      }));

      // 2. Handle Work Locations
      if (!isMIR && !isSSR && !isMAR && !isDSR) {
        const existingLocationIds = new Set(revisionLocations.map(l => l.workLocationId));
        const newLocationIds = new Set(editSelectedLocations.map(l => l.id));

        for (const loc of revisionLocations) {
          if (!newLocationIds.has(loc.workLocationId)) {
            promises.push(deleteRevisionLocationMutation.mutateAsync(loc.id));
          }
        }

        for (const loc of editSelectedLocations) {
          if (!existingLocationIds.has(loc.id)) {
            promises.push(addRevisionLocationMutation.mutateAsync({
              workLocationId: loc.id,
              unit: loc.unit || undefined,
              zone: loc.zone || undefined,
              block: loc.block || undefined,
              building: loc.building || undefined,
              floor: loc.floor || undefined,
              part: loc.part || undefined,
            }));
          }
        }
      }

      // 3. Handle multiple work levels
      if (!isMIR && !isSSR && !isMAR && !isDSR) {
        const existingWorkLevelIds = new Set(revisionWorkLevels.map(l => l.workLevelId));
        const newWorkLevelIds = new Set(editSelectedWorkLevels.map(l => l.id));

        if (existingWorkLevelIds.size > 0 || newWorkLevelIds.size > 0) {
          // Delete levels that are no longer selected
          for (const level of revisionWorkLevels) {
            if (!newWorkLevelIds.has(level.workLevelId)) {
              promises.push(apiRequest("DELETE", `/api/revisions/${currentRevision?.id}/work-levels/${level.id}`));
            }
          }

          // Add new levels
          for (const level of editSelectedWorkLevels) {
            if (!existingWorkLevelIds.has(level.id)) {
              promises.push(apiRequest("POST", `/api/revisions/${currentRevision?.id}/work-levels`, {
                workLevelId: level.id,
              }));
            }
          }

          // For backward compatibility, also update the first level on the revision
          if (editSelectedWorkLevels.length > 0) {
            promises.push(apiRequest("PATCH", `/api/revisions/${currentRevision?.id}`, {
              workLevelId: editSelectedWorkLevels[0].id,
            }));
          }
        }
      }

      // 4. Handle Purpose
      const currentPurposeId = revisionPurposes.length > 0 ? revisionPurposes[0].purposeId : null;
      if (editSelectedPurposeId !== currentPurposeId) {
        if (revisionPurposes.length > 0) {
          promises.push(apiRequest("DELETE", `/api/revisions/${currentRevision?.id}/purposes`));
        }
        if (editSelectedPurposeId) {
          const selectedPurpose = allPurposes.find(p => p.id === editSelectedPurposeId);
          if (selectedPurpose) {
            promises.push(apiRequest("POST", `/api/revisions/${currentRevision?.id}/purposes`, {
              purposeId: selectedPurpose.id,
              purposeName: selectedPurpose.nameEnglish || selectedPurpose.code,
              purposeCategory: selectedPurpose.code,
            }));

            if ((isMIR || isSD) && request?.requestNumber) {
              const parts = request.requestNumber.split('-');
              const prefix = parts[0];
              const counter = parts[parts.length - 1];
              const newRequestNumber = `${prefix}-${selectedPurpose.code}-${counter}`;

              if (request.requestNumber !== newRequestNumber) {
                promises.push(apiRequest("PATCH", `/api/requests/${request.id}`, {
                  requestNumber: newRequestNumber
                }));
              }
            }
          }
        }
      }

      // 5. Handle Deliveries (for MIR)
      if (isMIR) {
        // We delete all and re-add for simplicity in this case
        promises.push(apiRequest("DELETE", `/api/revisions/${currentRevision?.id}/deliveries`).then(async () => {
          const deliveryPromises = editSelectedDeliveries.map(delivery =>
            apiRequest("POST", `/api/revisions/${currentRevision?.id}/deliveries`, {
              deliveryId: delivery.id,
            })
          );
          return Promise.all(deliveryPromises);
        }));
      }

      // 6. Handle Suppliers (for SSR)
      if (isSSR) {
        promises.push(apiRequest("DELETE", `/api/revisions/${currentRevision?.id}/suppliers`).then(async () => {
          const supplierPromises = editSelectedSuppliers.map(supplier =>
            apiRequest("POST", `/api/revisions/${currentRevision?.id}/suppliers`, {
              supplierId: supplier.id,
            })
          );
          return Promise.all(supplierPromises);
        }));
      }

      // 7. Handle Materials (for MAR)
      if (isMAR) {
        promises.push(apiRequest("DELETE", `/api/revisions/${currentRevision?.id}/materials`).then(async () => {
          const materialPromises = editSelectedMaterials.map(material =>
            apiRequest("POST", `/api/revisions/${currentRevision?.id}/materials`, {
              materialId: material.id,
            })
          );
          return Promise.all(materialPromises);
        }));
      }

      // 8. Handle DSR documents
      if (isDSR || isSD) {
        const existingDocIds = new Set(revisionDocuments.map(d => d.id));
        const newDocIds = new Set(editSelectedDocuments.map(d => d.id));

        // Delete documents that are no longer selected
        for (const doc of revisionDocuments) {
          if (!newDocIds.has(doc.id)) {
            promises.push(apiRequest("DELETE", `/api/request-documents/${doc.id}`));
          }
        }

        // Add or Update documents
        for (const doc of editSelectedDocuments) {
          if (doc.isNew) {
            promises.push(apiRequest("POST", `/api/revisions/${currentRevision?.id}/documents`, {
              sourceType: doc.sourceType || "project",
              projectDocumentId: doc.projectDocumentId || null,
              title: doc.title || "",
              fileName: doc.fileName,
              fileUrl: doc.fileUrl,
              fileSize: parseNumericFileSize(doc.fileSize),
              mimeType: doc.mimeType || null,
              documentType: doc.documentType || "",
              documentRef: doc.documentRef || ""
            }));
          } else {
            const original = revisionDocuments.find(d => d.id === doc.id);
            if (original && (original.title !== doc.title || original.documentType !== doc.documentType || original.documentRef !== doc.documentRef)) {
              promises.push(apiRequest("PATCH", `/api/request-documents/${doc.id}`, {
                title: doc.title || "",
                documentType: doc.documentType || "",
                documentRef: doc.documentRef || ""
              }));
            }
          }
        }
      }

      // Execute all operations in parallel
      await Promise.all(promises);

      // Invalidate queries after all parallel operations complete
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "work-locations"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "purposes"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "work-levels"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/requests", request?.id] }),
        queryClient.invalidateQueries({ queryKey: ["/api/requests"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/projects", request?.projectId, "deliveries"] }),
      ]);

      if (isMIR) {
        await queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "deliveries"] });
      }

      if (isSSR) {
        await queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "suppliers"] });
      }

      if (isMAR) {
        await queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "materials"] });
      }

      if (isDSR || isSD) {
        await queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "documents"] });
      }

      setShowEditRequestDetails(false);

      // Auto-advance from step 101 to 102 (or 103 for NCR) after saving
      if (isAtStep(101)) {
        const targetStep = isNCR ? 102 : 102;
        const transition = getTransitionForStep(targetStep) || getTransitionForStep(102);
        if (transition) {
          moveMutation.mutate({
            toStepId: transition.toStepId,
            newStatus: transition.allowedStatus,
            remarks: "Auto-advanced after saving request details",
          });
          toast({ title: "Success", description: `Request details updated and submitted for ${isNCR ? 'manager' : 'team'} approval.` });
        } else {
          toast({ title: "Success", description: "Request details updated successfully." });
        }
      } else {
        toast({ title: "Success", description: "Request details updated successfully." });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save changes", variant: "destructive" });
    } finally {
      setIsSavingDetails(false);
    }
  };


  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setSelectedFile(file);
      setShowAttachmentUpload(true);
    }
    e.target.value = "";
  };

  const handleUploadWithTitle = () => {
    if (!selectedFile) return;
    const title = uploadAttachmentTitle.trim() || "";
    uploadAttachmentMutation.mutate({ file: selectedFile, title });
  };

  const handleDocumentUploadWithTitle = () => {
    if (!selectedDocumentFile) return;
    const title = uploadDocumentTitle.trim() || "";
    uploadDocumentMutation.mutate({ file: selectedDocumentFile, title });
  };

  const isRevisionCreator = user?.id === currentRevision?.createdBy;
  const isRevisionCreatorTeamMember = user?.organizationId && request?.contractorId && user.organizationId === request.contractorId;

  // Track which reviews have already been auto-updated to prevent repeated updates (keyed by revision ID)
  const autoUpdatedReviewsRef = useRef<{ revisionId: string | null; reviewIds: Set<string> }>({ revisionId: null, reviewIds: new Set() });

  // Reset tracking when revision changes
  useEffect(() => {
    if (currentRevision?.id && autoUpdatedReviewsRef.current.revisionId !== currentRevision.id) {
      autoUpdatedReviewsRef.current = { revisionId: currentRevision.id, reviewIds: new Set() };
    }
  }, [currentRevision?.id]);

  // Auto-populate receivedAt when consultant organization user views the page (runs once per review per revision)
  useEffect(() => {
    // Only run when all required data is fully loaded
    if (!isUserFromConsultantOrg || !currentRevision?.id || !request?.consultantId || consultantReviews.length === 0) {
      return;
    }

    // Ensure we're tracking the correct revision
    if (autoUpdatedReviewsRef.current.revisionId !== currentRevision.id) {
      return;
    }

    const timestamp = new Date().toISOString();

    consultantReviews.forEach((review) => {
      // Skip if already updated or if receivedAt already has a value
      if (review.receivedAt || autoUpdatedReviewsRef.current.reviewIds.has(review.id)) {
        return;
      }

      // Mark as being updated to prevent duplicate updates
      autoUpdatedReviewsRef.current.reviewIds.add(review.id);

      updateConsultantReviewMutation.mutate({
        id: review.id,
        receivedAt: timestamp,
      });
    });
  }, [isUserFromConsultantOrg, currentRevision?.id, request?.consultantId, consultantReviews]);

  const handleEditDescription = () => {
    setEditedDescription(currentRevision?.description || "");
    setIsEditingDescription(true);
  };

  const handleSaveDescription = () => {
    if (!currentRevision?.id) return;
    updateDescriptionMutation.mutate({ revisionId: currentRevision.id, description: editedDescription });
  };

  const handleCancelEditDescription = () => {
    setIsEditingDescription(false);
    setEditedDescription("");
  };

  const getChecklistResponse = (checklistItemId: string): "yes" | "no" | "na" | null => {
    const found = checklistResponses.find(r => r.checklistItemId === checklistItemId);
    return found?.response || null;
  };

  const handleChecklistResponse = (checklistItemId: string, response: "yes" | "no" | "na") => {
    if (!currentRevision?.id) {
      toast({ title: "Error", description: "No revision selected", variant: "destructive" });
      return;
    }
    checklistResponseMutation.mutate({ revisionId: currentRevision.id, checklistItemId, response });
  };

  const handleTransition = (transition: WorkflowTransition) => {
    setSelectedTransition(transition);
    setShowTransitionDialog(true);
  };

  const confirmTransition = () => {
    if (!selectedTransition) return;
    moveMutation.mutate({
      toStepId: selectedTransition.toStepId,
      newStatus: selectedTransition.allowedStatus,
      remarks: transitionRemarks,
    });
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case "approved":
      case "completed":
      case "resolved":
        return "default";
      case "rejected":
        return "destructive";
      case "pending":
      case "in progress":
      case "in process":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getProgressPercentage = () => {
    if (!revisionStep || !request || allWorkflowSteps.length === 0) return 0;

    // Filter workflow steps for the current request's requestTypeId (using the integer id_number)
    const relevantSteps = allWorkflowSteps.filter(s => Number(s.requestTypeId) === Number(requestType?.id_number));

    if (relevantSteps.length === 0) return 0;

    // Calculate progress based on the maximum sequence order of available steps
    const currentSeq = revisionStep.sequenceOrder;
    const maxSeq = Math.max(...relevantSteps.map(s => s.sequenceOrder));

    // Safety check to avoid division by zero
    if (maxSeq === 0) return 0;

    let percentage = (currentSeq / maxSeq) * 100;

    // Prevent showing 100% if the final step hasn't been actually approved/finalized
    const isFinalized = currentRevision?.approvalStatusCode || request?.currentStatus === "Approved" || request?.currentStatus === "Rejected";
    if (currentSeq === maxSeq && !isFinalized) {
      // Subtract half a step's worth of progress to show it's pending final action
      percentage = ((currentSeq - 0.5) / maxSeq) * 100;
    }

    return Math.round(percentage);
  };

  const mainChecklistItems = activityChecklistItems.filter(item => item.category === "main");
  const sbcChecklistItems = activityChecklistItems.filter(item => item.category === "sbc");
  const recommendationsChecklistItems = activityChecklistItems.filter(item => item.category === "recommendations");
  const mirChecklistItems = allChecklistItems.filter(item => item.category === "mir");
  const ssrChecklistItems = allChecklistItems.filter(item => item.category === "ssr" || item.category === "mir");
  const marChecklistItems = allChecklistItems.filter(item => item.category === "mar" || item.category === "mir" || item.category === "ssr");

  const formatUnits = () => {
    if (revisionLocations.length === 0) return "—";
    return [...revisionLocations]
      .sort((a, b) => {
        const uA = (a.unit || "").toString();
        const uB = (b.unit || "").toString();
        return uA.localeCompare(uB, undefined, { numeric: true, sensitivity: 'base' });
      })
      .map(loc => loc.unit)
      .filter(Boolean)
      .join(", ");
  };

  const formatBuildings = () => {
    if (revisionLocations.length === 0) return "—";
    const buildings = Array.from(new Set(revisionLocations.map(loc => {
      if (!loc.building) return null;
      // Remove leading zeros (e.g., 0205 -> 205), but keep "0" if it's the only character
      return loc.building.toString().replace(/^0+(?!$)/, '');
    }).filter(Boolean)))
      .sort((a, b) => a!.localeCompare(b!, undefined, { numeric: true, sensitivity: 'base' }));
    return buildings.join(", ") || "—";
  };

  if (requestLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Request not found</h2>
        <p className="text-muted-foreground mt-2">The request you're looking for doesn't exist.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/projects")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col border-b bg-background sticky top-0 z-10 relative">
        <div className="flex items-center justify-between p-3 md:p-4 min-h-[4rem] gap-2">
          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            <Button variant="ghost" size="sm" className="h-9 md:h-10 px-2 md:px-3 text-muted-foreground hover:text-foreground shrink-0" onClick={() => window.history.back()} data-testid="button-back">
              <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 md:mr-2" />
              <span className="text-xs md:text-sm font-bold hidden xs:inline">Back</span>
            </Button>
            <div className="flex items-center gap-2 md:gap-3 ml-1 md:ml-2">
              <span className="font-bold text-base md:text-xl tracking-tight" data-testid="text-request-number">
                {request.requestNumber}
              </span>
              {revisions.length > 1 && (
                <Select
                  value={selectedRevision || currentRevision?.id || ""}
                  onValueChange={setSelectedRevision}
                >
                  <SelectTrigger className="h-8 md:h-9 w-[70px] md:w-[80px] text-[10px] md:text-xs font-bold" data-testid="select-revision">
                    <SelectValue placeholder="Rev" />
                  </SelectTrigger>
                  <SelectContent>
                    {revisions.map((rev) => (
                      <SelectItem key={rev.id} value={rev.id} className="text-[10px] md:text-xs">
                        Rev {rev.revisionNo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Absolute Centered Project Name */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none hidden xl:flex">
            <Badge variant="secondary" className="px-6 py-2.5 flex items-center gap-3 border-none bg-muted/50 text-foreground rounded-full shadow-md">
              <Building2 className="w-5 h-5 text-muted-foreground" />
              <span className="text-xl font-bold tracking-tight uppercase truncate max-w-[400px]">
                {request?.projectName || project?.name || "Loading..."}
              </span>
            </Badge>
          </div>

          <div className="flex items-center gap-2 md:gap-4 ml-auto">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="hidden md:flex flex-col items-end text-[10px] leading-tight">
                <span className="text-muted-foreground font-semibold uppercase tracking-wider">Current Stage</span>
                <span className="font-bold text-foreground truncate max-w-[120px]">
                  {["Approved", "Rejected", "Resolved", "Closed"].includes(request?.currentStatus || "") 
                    ? request?.currentStatus 
                    : (revisionStep?.stepName || "Initial")}
                </span>
              </div>
              <div className="relative h-9 w-9 md:h-11 md:w-11 flex items-center justify-center transform hover:scale-105 transition-transform duration-200">
                <svg className="h-full w-full -rotate-90 drop-shadow-sm">
                  <circle
                    cx="50%"
                    cy="50%"
                    r="42%"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    className="text-muted/15"
                  />
                  <circle
                    cx="50%"
                    cy="50%"
                    r="42%"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeDasharray="100 100"
                    strokeDashoffset={100 - getProgressPercentage()}
                    pathLength="100"
                    className="text-primary transition-all duration-1000 ease-in-out"
                    strokeLinecap="round"
                    style={{
                      filter: "drop-shadow(0 0 4px hsl(var(--primary) / 0.4))"
                    }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[8px] md:text-[10px] font-black tracking-tighter">
                    {getProgressPercentage()}%
                  </span>
                </div>
              </div>
            </div>
            <Badge variant={getStatusBadgeVariant(request.currentStatus)} className="px-2 md:px-3 py-0.5 md:py-1 text-[10px] md:text-xs font-black shadow-sm" data-testid="badge-status">
              {request.currentStatus}
            </Badge>
            <div className="flex items-center gap-1 md:gap-2">
              <Button
                variant="ghost"
                size="icon"
                data-testid="button-reset"
                className="h-8 w-8 md:h-10 md:w-10"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId] });
                  queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId, "revisions"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId, "transitions"] });
                  if (currentRevision?.id) {
                    queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision.id] });
                  }
                  setHasNewData(false);
                  toast({ title: "Refreshed", description: "Request content has been updated." });
                }}
              >
                <RotateCcw className="w-3.5 h-3.5 md:w-4 md:h-4" />
                {hasNewData && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 md:w-2.5 h-2 md:h-2.5 bg-red-500 rounded-full border-2 border-background animate-pulse" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                data-testid="button-clipboard"
                className="h-8 w-8 md:h-10 md:w-10"
                onClick={() => isSI ? setShowSiForm(true) : setShowWirForm(true)}
              >
                <ClipboardList className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </Button>
              {(() => {
                const currentApprovalStatusCode = approvalStatus?.statusCode || currentRevision?.approvalStatusCode;
                const isViewingLatestRevision = currentRevision?.id === request?.currentRevisionId;
                const canCreateRevision = isRevisionCreatorTeamMember &&
                  request?.currentStatus !== "Closed" &&
                  isViewingLatestRevision &&
                  ['C', 'E'].includes(currentApprovalStatusCode || '');
                const canClose = isRevisionCreatorTeamMember &&
                  request?.currentStatus !== "Closed" &&
                  isViewingLatestRevision &&
                  isAtStep(107) &&
                  ['A', 'B', 'D'].includes(currentApprovalStatusCode || '');

                return (
                  <>
                    {canCreateRevision && (
                      <Button
                        data-testid="button-create-revision"
                        variant="outline"
                        className="gap-2 h-8 md:h-10 px-2 md:px-3 text-xs md:text-sm"
                        onClick={() => createRevisionMutation.mutate()}
                        disabled={createRevisionMutation.isPending}
                      >
                        <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span className="hidden sm:inline">{createRevisionMutation.isPending ? "Creating..." : "New Revision"}</span>
                        <span className="xs:inline sm:hidden">{createRevisionMutation.isPending ? "..." : "Rev"}</span>
                      </Button>
                    )}
                    {canClose && (
                      <Button
                        data-testid="button-close"
                        className="gap-2 h-8 md:h-10 px-2 md:px-3 text-xs md:text-sm"
                        onClick={() => closeMutation.mutate()}
                        disabled={closeMutation.isPending}
                      >
                        <Save className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span>{closeMutation.isPending ? "..." : "Close"}</span>
                      </Button>
                    )}
                    {/* A non-conformance can lead to a deduction against the contractor */}
                    {(isNCR || isRNCR) && request?.projectId && (
                      <DeductionButton
                        projectId={request.projectId}
                        prefill={{
                          title: `خصم على ${request.requestNumber}`,
                          reason: ((request as any).title || (request as any).description || request.requestNumber || "").toString(),
                          liableParty: "subcontractor",
                          sourceType: "ncr",
                          sourceId: request.id,
                        }}
                      />
                    )}
                    {isNCR && getProgressPercentage() === 100 && rncrType && !existingRncr && (!request?.contractorId || user?.organizationId === request?.contractorId) && (
                      <Button
                        className="gap-2 h-8 md:h-10 px-2 md:px-3 text-xs md:text-sm bg-orange-500 hover:bg-orange-600 text-white"
                        onClick={() => createRncrMutation.mutate()}
                        disabled={createRncrMutation.isPending}
                      >
                        {createRncrMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        )}
                        <span className="hidden md:inline">{createRncrMutation.isPending ? "Creating..." : "Create RNCR"}</span>
                        <span className="inline md:hidden">RNCR</span>
                      </Button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
        {/* Mobile-only Project Name Bar */}
        <div className="xl:hidden px-4 pb-3 flex items-center">
          <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-lg w-full">
            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-black uppercase tracking-tight truncate text-foreground/70">
              {request?.projectName || project?.name || "Loading..."}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <CardTitle className="text-base">Request Details</CardTitle>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {revisionPurposes.map((purpose) => (
                      <Badge key={purpose.id} variant="secondary" className="text-xs gap-1">
                        <Target className="w-3 h-3" />
                        {purpose.purposeName}
                      </Badge>
                    ))}
                    {isRevisionCreator && (!getStepApproval("Consultant Team Approval") && !isNcrOrSiManagerApproved) && !isReceivedByConsultant && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleOpenEditRequestDetails}
                        data-testid="button-edit-request-details"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Activity - Main Focus */}
                  {(!isSSR && !isMAR && !isDSR && !isSD && !isNcrFamily) && (
                    <div className="relative overflow-hidden bg-primary/5 border border-primary/10 rounded-[1.5rem] p-5 shadow-sm">
                      <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary">
                            Detailed Activity
                          </span>
                        </div>
                        <h3 className="text-xl font-bold text-primary tracking-tight">
                          {currentRevision?.activityCode ? `${currentRevision.activityCode} - ` : ""}
                          {currentRevision?.activityName || workListActivity?.nameEnglish || "—"}
                        </h3>
                      </div>
                    </div>
                  )}

                  {/* Info Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-6 bg-muted/20 p-5 rounded-[1.5rem] border border-muted-foreground/10">
                    {isNcrFamily && (
                      <>
                        <div className="flex items-start gap-3 col-span-full">
                          <div className="mt-1 p-2 bg-background rounded-[1.5rem] border shadow-sm flex items-center justify-center">
                            <Layers className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Subject</p>
                            <p className="text-sm font-semibold leading-tight">{(currentRevision?.metadata as any)?.subject || (currentRevision?.metadata as any)?.ncrSubject || "—"}</p>
                          </div>
                        </div>
                        {(currentRevision?.metadata as any)?.linkedNcrId && (
                          <div className="flex items-start gap-3 col-span-full">
                            <div className="mt-1 p-2 bg-background rounded-[1.5rem] border shadow-sm flex items-center justify-center">
                              <Link2 className="w-4 h-4 text-blue-500" />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Reference NCR</p>
                              <a 
                                href={`/requests/${(currentRevision?.metadata as any)?.linkedNcrId}`} 
                                onClick={(e) => {
                                  e.preventDefault();
                                  navigate(`/requests/${(currentRevision?.metadata as any)?.linkedNcrId}`);
                                }}
                                className="text-sm font-semibold leading-tight text-primary hover:underline flex items-center gap-1"
                              >
                                {linkedNcrRequest?.requestNumber || projectRequests.find(r => r.id === (currentRevision?.metadata as any)?.linkedNcrId)?.requestNumber || "View Original NCR"}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    <div className="flex items-start gap-3">
                      <div className="mt-1 p-2 bg-background rounded-[1.5rem] border shadow-sm flex items-center justify-center">
                        <Target className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Division</p>
                        <p className="text-sm font-semibold leading-tight">{currentRevision?.divisionName || division?.nameEnglish || "—"}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="mt-1 p-2 bg-background rounded-[1.5rem] border shadow-sm flex items-center justify-center">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Chapter</p>
                        <p className="text-sm font-semibold leading-tight">{currentRevision?.chapterName || chapter?.nameEnglish || "—"}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="mt-1 p-2 bg-primary/10 rounded-[1.5rem] border border-primary/20 shadow-sm flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Actual Date</p>
                        <p className="text-sm font-bold text-primary leading-tight" data-testid="text-actual-date">
                          {currentRevision?.scheduledDate ? format(parseISO(currentRevision.scheduledDate), "dd MMM yyyy") : "—"}
                        </p>
                      </div>
                    </div>

                    {(isNCR || (isRNCR && linkedNcrCurrentRevision)) && (
                      <>
                        <div className="flex items-start gap-3">
                          <div className="mt-1 p-2 bg-background rounded-[1.5rem] border shadow-sm flex items-center justify-center">
                            <Target className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">NCR Type</p>
                            <p className="text-sm font-semibold leading-tight">
                              {isNCR 
                                ? ((currentRevision?.metadata as any)?.ncrType || "—")
                                : ((linkedNcrCurrentRevision?.metadata as any)?.ncrType || "—")
                              }
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-3">
                          <div className="mt-1 p-2 bg-background rounded-[1.5rem] border shadow-sm flex items-center justify-center">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Source of Non-Conformance</p>
                            <p className="text-sm font-semibold leading-tight">
                              {isNCR 
                                ? ((currentRevision?.metadata as any)?.ncrSource || "—")
                                : ((linkedNcrCurrentRevision?.metadata as any)?.ncrSource || "—")
                              }
                            </p>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Row 2 */}
                    {((!isMIR && !isSSR && !isMAR && !isDSR && !isNcrFamily) || ((isSSR || isMIR || isMAR || isDSR || isSD || isNcrFamily) && displayWorkLevels.length > 0)) && (
                      <div className="flex items-start gap-3">
                        <div className="mt-1 p-2 bg-background rounded-[1.5rem] border shadow-sm flex items-center justify-center">
                          <Layers className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Work Levels</p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {displayWorkLevels.length > 0 ? (
                              displayWorkLevels.map((wl: any, idx) => (
                                <span key={idx} className="text-sm font-semibold leading-tight bg-muted px-1.5 py-0.5 rounded border border-muted-foreground/10">
                                  {wl.nameEnglish}
                                </span>
                              ))
                            ) : "—"}
                          </div>
                        </div>
                      </div>
                    )}

                    {((!isMIR && !isSSR && !isMAR && !isDSR && !isNcrFamily) || ((isSSR || isMIR || isMAR || isDSR || isSD || isNcrFamily) && revisionLocations.length > 0)) && (
                      <div className="flex items-start gap-3">
                        <div className="mt-1 p-2 bg-background rounded-[1.5rem] border shadow-sm flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Building No.</p>
                          <p className="text-sm font-semibold leading-tight" data-testid="text-building">{formatBuildings()}</p>
                        </div>
                      </div>
                    )}

                    {((!isMIR && !isSSR && !isMAR && !isDSR && !isNcrFamily) || ((isSSR || isMIR || isMAR || isDSR || isSD || isNcrFamily) && revisionLocations.length > 0)) && (
                      <div className="flex items-start gap-3">
                        <div className="mt-1 p-2 bg-background rounded-[1.5rem] border shadow-sm flex items-center justify-center">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Units</p>
                          <button
                            className="text-sm font-bold text-primary hover:underline underline-offset-4 decoration-2 text-left"
                            onClick={() => setShowLocationsDialog(true)}
                            data-testid="button-view-units"
                          >
                            {formatUnits()}
                          </button>
                        </div>
                      </div>
                    )}

                    {isMIR && (
                      <div className="flex items-start gap-3 md:col-span-3 border-t pt-4">
                        <div className="mt-1 p-2 bg-primary/10 rounded-[1.5rem] border border-primary/20 shadow-sm flex items-center justify-center">
                          <Database className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Associated Deliveries</p>
                          <div className="grid grid-cols-1 gap-3 mt-3">
                            {deliveriesLoading ? (
                              <div className="w-full py-12 flex flex-col items-center justify-center gap-4 border-2 border-dashed border-muted/20 rounded-[1.5rem] bg-muted/5">
                                <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                                <span className="text-sm text-muted-foreground animate-pulse font-bold italic">Loading materials...</span>
                              </div>
                            ) : revisionDeliveries.length > 0 ? (
                              revisionDeliveries.map((rd, idx) => (
                                <div
                                  key={idx}
                                  className="group relative bg-card border border-muted/60 rounded-[1.5rem] p-3 pl-4 overflow-hidden shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300 cursor-pointer"
                                  onClick={() => setSelectedDeliveryDetail(rd.delivery)}
                                >
                                  {/* Left Accent Bar */}
                                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/40 group-hover:bg-primary transition-colors" />

                                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between w-full gap-3 md:gap-0 min-h-[3.5rem] py-2">
                                    {/* Left: Supplier */}
                                    <div className="flex items-center gap-3 w-full md:min-w-[180px] md:w-auto">
                                      <div className={cn(
                                        "h-10 md:h-12 min-w-[2.5rem] w-auto max-w-[120px] px-2 rounded-[1.5rem] flex items-center justify-center border border-primary/10 shadow-inner shrink-0 overflow-hidden transition-all",
                                        rd.delivery?.supplierLogo ? "bg-white dark:bg-black/20" : "bg-gradient-to-br from-primary/20 to-primary/5 w-10 md:w-12 px-0"
                                      )}>
                                        {rd.delivery?.supplierLogo ? (
                                          <img
                                            src={rd.delivery.supplierLogo}
                                            alt={rd.delivery.supplier || "Supplier"}
                                            className="max-h-full max-w-full object-contain p-1"
                                            onError={(e) => {
                                              (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23caa15b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>';
                                            }}
                                          />
                                        ) : (
                                          <Building2 className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                                        )}
                                      </div>
                                      <div className="flex flex-col truncate">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/40 mb-0.5">Supplier</span>
                                        <span className="text-xs md:text-sm font-black text-foreground group-hover:text-primary transition-colors duration-300 truncate max-w-[200px] md:max-w-[140px]">
                                          {rd.delivery?.supplier}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Middle Left: Shipment */}
                                    <div className="flex items-center gap-3 w-full md:min-w-[140px] md:w-auto px-1 md:px-0">
                                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-[1.5rem] bg-muted/20 flex items-center justify-center shrink-0">
                                        <Truck className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary/60" />
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/40 mb-0.5">Delivery NO</span>
                                        <span className="text-[10px] md:text-[11px] font-black text-foreground font-mono">{rd.delivery?.shipmentNumber}</span>
                                      </div>
                                    </div>

                                    {/* Middle Right: Arrival */}
                                    <div className="flex items-center gap-3 w-full md:min-w-[140px] md:w-auto px-1 md:px-0">
                                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-[1.5rem] bg-muted/20 flex items-center justify-center shrink-0">
                                        <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground/60" />
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/40 mb-0.5">Arrival</span>
                                        <span className="text-[10px] md:text-[11px] font-black text-foreground opacity-80">
                                          {rd.delivery?.arrivalDate ? formatGMT3(rd.delivery.arrivalDate, "MMM d, yyyy") : "—"}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Right: Eye Icon */}
                                    <div className="hidden md:flex w-10 h-10 bg-muted/30 group-hover:bg-primary group-hover:text-white rounded-[1.5rem] flex items-center justify-center transition-colors duration-200 shadow-sm shrink-0">
                                      <Eye className="w-5 h-5" />
                                    </div>

                                    {/* Mobile Eye Overlay/Indicator */}
                                    <div className="md:hidden absolute top-3 right-3 opacity-30">
                                      <Eye className="w-4 h-4 text-primary" />
                                    </div>
                                  </div>

                                </div>
                              ))
                            ) : (
                              <div className="w-full py-6 border-2 border-dashed border-muted/50 rounded-[1.5rem] flex flex-col items-center justify-center bg-muted/5 gap-2 group hover:bg-muted/10 transition-colors">
                                <div className="p-3 bg-muted/50 rounded-full group-hover:scale-110 transition-transform">
                                  <Truck className="w-6 h-6 text-muted-foreground/40" />
                                </div>
                                <span className="text-sm text-muted-foreground font-bold italic opacity-60">No materials associated</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {isMAR && (
                      <>
                        <div className="flex items-start gap-3 md:col-span-3 border-t pt-4">
                          <div className="mt-1 p-2 bg-primary/10 rounded-[1.5rem] border border-primary/20 shadow-sm flex items-center justify-center">
                            <Layers className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Selected Materials</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                              {materialsLoading ? (
                                <div className="w-full py-12 flex flex-col items-center justify-center gap-4 border-2 border-dashed border-muted/20 rounded-[1.5rem] bg-muted/5">
                                  <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                                  <span className="text-sm text-muted-foreground animate-pulse font-bold italic">Loading materials...</span>
                                </div>
                              ) : revisionMaterials.length > 0 ? (
                                revisionMaterials.map((rm, index) => (
                                  <MaterialCardWithAttachments key={rm.id || index} rm={rm} onPreviewDoc={(doc) => setPreviewDoc(doc)} />
                                ))
                              ) : (
                                <div className="w-full py-6 border-2 border-dashed border-muted/50 rounded-[1.5rem] flex flex-col items-center justify-center bg-muted/5 gap-2 group hover:bg-muted/10 transition-colors">
                                  <div className="p-3 bg-muted/50 rounded-full group-hover:scale-110 transition-transform">
                                    <Layers className="w-6 h-6 text-muted-foreground/40" />
                                  </div>
                                  <span className="text-sm text-muted-foreground font-bold italic opacity-60">No materials selected</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {revisionMaterials.length > 0 && (
                          <div className="items-start gap-3 md:col-span-3 border-t pt-4 mt-4 hidden has-[.supplier-item]:flex">
                            <div className="mt-1 p-2 bg-primary/10 rounded-[1.5rem] border border-primary/20 shadow-sm flex items-center justify-center">
                              <Building2 className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70 mb-3">Supplier for Material</p>
                              <div className="flex flex-col gap-4">
                                {revisionMaterials.map((rm) => {
                                  const material = rm.material || {};
                                  if (!material.id) return null;
                                  return (
                                    <MaterialLinkedSuppliers
                                      key={material.id}
                                      materialId={material.id}
                                      materialName={material.materialName}
                                      readOnly
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {isSSR && (
                      <div className="flex items-start gap-3 md:col-span-3 border-t pt-4">
                        <div className="mt-1 p-2 bg-primary/10 rounded-[1.5rem] border border-primary/20 shadow-sm flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Selected Suppliers</p>
                          <div className="grid grid-cols-1 gap-3 mt-3">
                            {suppliersLoading ? (
                              <div className="w-full py-12 flex flex-col items-center justify-center gap-4 border-2 border-dashed border-muted/20 rounded-[1.5rem] bg-muted/5">
                                <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                                <span className="text-sm text-muted-foreground animate-pulse font-bold italic">Loading suppliers...</span>
                              </div>
                            ) : revisionSuppliers.length > 0 ? (
                              revisionSuppliers.map((rs, idx) => (
                                <SupplierCardWithAttachments key={idx} index={idx} rs={rs} onPreviewDoc={(doc) => setPreviewDoc(doc)} />
                              ))
                            ) : (
                              <div className="w-full py-6 border-2 border-dashed border-muted/50 rounded-[1.5rem] flex flex-col items-center justify-center bg-muted/5 gap-2 group hover:bg-muted/10 transition-colors">
                                <div className="p-3 bg-muted/50 rounded-full group-hover:scale-110 transition-transform">
                                  <Building2 className="w-6 h-6 text-muted-foreground/40" />
                                </div>
                                <span className="text-sm text-muted-foreground font-bold italic opacity-60">No suppliers selected</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="text-base">{(isNCR || isSI) ? "By Consultant" : "By Contractor"}</CardTitle>
                  <Badge variant="outline" className="flex items-center gap-2 px-3 py-1 bg-muted/50 border-muted rounded-[1.5rem]">
                    <div className="p-1 rounded-[1.5rem] bg-background border shadow-sm">
                      <Building2 className="w-3.5 h-3.5 text-foreground" />
                    </div>
                    <span className="font-semibold text-foreground tracking-tight">
                      {(isNCR || isSI) ? (request?.consultantName || consultant?.name || "CONSULTANT") : (request?.contractorName || contractor?.name || "CONTRACTOR")}
                    </span>
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border rounded-[1.5rem] p-4 space-y-3">
                  <div className="font-medium">Description</div>
                  <div className="text-lg leading-relaxed border rounded-[1.5rem] p-3 bg-muted/20">
                    {isEditingDescription ? (
                      <div className="space-y-3">
                        <Textarea
                          value={editedDescription}
                          onChange={(e) => setEditedDescription(e.target.value)}
                          placeholder="Enter description..."
                          className="min-h-[250px] resize-y text-lg leading-relaxed"
                          dir="auto"
                          data-testid="textarea-edit-description"
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCancelEditDescription}
                            data-testid="button-cancel-description"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveDescription}
                            disabled={updateDescriptionMutation.isPending}
                            data-testid="button-save-description"
                          >
                            {updateDescriptionMutation.isPending ? "Saving..." : "Save"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2 min-h-[250px]">
                        <p className="flex-1 whitespace-pre-wrap" dir="auto">
                          {currentRevision?.description || "No description provided"}
                        </p>
                        {isRevisionCreator && (!getStepApproval("Consultant Team Approval") && !isNcrOrSiManagerApproved) && !isReceivedByConsultant && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleEditDescription}
                            className="h-8 w-8"
                            data-testid="button-edit-description"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {!isSSR && (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm text-muted-foreground">{(isNCR || isSI) ? "Attachments" : "Documents"}</p>
                          {((isNCR || isSI) ? isUserFromConsultantOrg : isUserFromContractorOrg) && (!getStepApproval("Consultant Team Approval") && !isNcrOrSiManagerApproved) && !isDSR && !isSD && !isReceivedByConsultant && (
                            <div className="flex gap-2">
                              {(isNCR || isSI) ? (
                                <>
                                  <input
                                    type="file"
                                    className="hidden"
                                    ref={documentFileInputRef}
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files.length > 0) {
                                        const file = e.target.files[0];
                                        setSelectedDocumentFile(file);
                                        setUploadDocumentTitle("");
                                        setShowDocumentUpload(true);
                                        if (documentFileInputRef.current) {
                                          documentFileInputRef.current.value = "";
                                        }
                                      }
                                    }}
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1 shadow-sm hover:bg-muted font-bold text-primary border-primary/20"
                                    onClick={() => documentFileInputRef.current?.click()}
                                    disabled={uploadDocumentMutation.isPending}
                                  >
                                    {uploadDocumentMutation.isPending && (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    )}
                                    {uploadDocumentMutation.isPending ? "Uploading..." : "+ Add"}
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1 shadow-sm hover:bg-muted font-bold text-primary border-primary/20"
                                  onClick={() => setIsStorageModalOpen(true)}
                                  data-testid="button-add-project-storage"
                                >
                                  <Database className="w-4 h-4" />
                                  Project Storage
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                        {revisionDocuments.filter(d => isDSR || isSD || d.documentType === "contractor" || d.documentType === "Attachment" || !d.documentType).length > 0 ? (
                          <div className="space-y-2">
                            {revisionDocuments.filter(d => isDSR || isSD || d.documentType === "contractor" || d.documentType === "Attachment" || !d.documentType).map((doc) => (
                              <div key={doc.id} className="flex items-center justify-between p-3.5 border rounded-[1.5rem] bg-card hover:bg-accent/40 hover:shadow-sm transition-all duration-300 group">
                                <div className="flex items-center gap-4 overflow-hidden flex-1 min-w-0">
                                  <div className="w-11 h-11 rounded-[1.2rem] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                    <FileText className="w-5 h-5 text-primary" />
                                  </div>
                                  {isDSR || isSD ? (
                                    <div className="flex flex-col justify-center flex-1 min-w-0">
                                      <button
                                        className="text-sm font-bold hover:underline text-left truncate text-foreground/90 hover:text-primary transition-colors pr-2 w-fit"
                                        onClick={() => setPreviewDoc(doc)}
                                        title={doc.title || doc.fileName || "Untitled"}
                                      >
                                        {doc.title || doc.fileName || "Untitled"}
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col justify-center flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                          className="text-sm font-bold hover:underline text-left truncate max-w-[250px]"
                                          onClick={() => setPreviewDoc(doc)}
                                          title={doc.title || doc.fileName || "Untitled"}
                                        >
                                          {doc.title || doc.fileName || "Untitled"}
                                        </button>
                                        {doc.sourceType === "project" ? (
                                          <Badge variant="outline" className="w-fit text-[9px] py-0 px-1 bg-blue-50 text-blue-600 border-blue-200 gap-1 font-medium">
                                            <Link2 className="w-2.5 h-2.5" />
                                            Project Storage
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline" className="w-fit text-[9px] py-0 px-1 bg-emerald-50 text-emerald-600 border-emerald-200 gap-1 font-medium">
                                            Uploaded
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-4">
                                  {isSD && doc.documentRef && (
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100/60 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50 shadow-sm shrink-0">
                                      <span className="text-[10px] uppercase tracking-wider text-blue-500 font-bold shrink-0">ID:</span>
                                      <span className="text-xs">{doc.documentRef}</span>
                                    </div>
                                  )}
                                  {(isDSR || isSD) && doc.documentType && (
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100/60 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50 shadow-sm shrink-0">
                                      <span className="text-[10px] uppercase tracking-wider text-amber-500 font-bold shrink-0">Type:</span>
                                      <span className="text-xs">{doc.documentType}</span>
                                    </div>
                                  )}
                                  {(doc.fileUrl || doc.projectDocumentId) && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-9 w-9 rounded-full hover:bg-primary/10 hover:text-primary transition-all duration-300 shrink-0"
                                      onClick={() => setPreviewDoc(doc)}
                                      title="Preview"
                                      data-testid={`btn-preview-doc-${doc.id}`}
                                    >
                                      <Eye className="w-5 h-5" />
                                    </Button>
                                  )}
                                  {((((isNCR || isSI) ? isUserFromConsultantOrg : isUserFromContractorOrg) && (!getStepApproval("Consultant Team Approval") && !isNcrOrSiManagerApproved)) ||
                                    user?.role === "admin") && !isAtStep(107) && !isDSR && !isSD && !isReceivedByConsultant && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                                        onClick={() => setDeletingDocumentId(doc.id)}
                                        disabled={deleteDocumentMutation.isPending}
                                        data-testid={`btn-delete-doc-${doc.id}`}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">{(isNCR || isSI) ? "No attachments uploaded" : "No documents uploaded"}</p>
                        )}
                      </div>
                      <Separator />
                    </>
                  )}
                  {!isNcrFamily && (
                    <>
                      <div className="flex items-center justify-between min-h-10">
                        <span>Team Approval</span>
                        <div className="flex items-center gap-2">
                          {getStepApproval("Contractor Team Approval") ? (
                            <div className="px-3 py-1.5 rounded-[1.5rem] bg-green-500/15 border border-green-500/20 flex items-center justify-center min-w-[120px]">
                              <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                                {getUserName(getStepApproval("Contractor Team Approval")!.changedBy) || "User"}
                              </span>
                            </div>
                          ) : (isUserFromContractorOrg && !isDocumentController && isAtStep(102)) ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid="button-contractor-team-approval"
                              onClick={() => handleApprovalClick("Contractor Team Approval", isAtStep(102) ? 103 : undefined)}
                              title={isAtStep(102) ? "Approve & advance to PM Approval" : "Record team approval"}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          ) : null}
                          {/* Arrow button hidden - combined into Plus button above */}
                          {false && getTransitionForStep(103) && isAtStep(102) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleTransition(getTransitionForStep(103)!)}
                              data-testid="button-step-102-to-103"
                              title="Submit for PM Approval"
                            >
                              <ArrowRight className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <Separator />
                    </>
                  )}
                  <div className="flex items-center justify-between min-h-10">
                    <span>Manager Approval</span>
                    <div className="flex items-center gap-2">
                      {getStepApproval(isSI ? "Consultant PM Approval" : (isNCR ? "Consultant Manager Approval" : (isRNCR ? "Contractor PM Approval" : "Contractor Manager Approval"))) ? (
                        <div className="px-3 py-1.5 rounded-[1.5rem] bg-green-500/15 border border-green-500/20 flex items-center justify-center min-w-[120px]">
                          <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                            {getUserName(getStepApproval(isSI ? "Consultant PM Approval" : (isNCR ? "Consultant Manager Approval" : (isRNCR ? "Contractor PM Approval" : "Contractor Manager Approval")))!.changedBy) || "User"}
                          </span>
                        </div>
                      ) : (isSI ? (isUserFromConsultantOrg && isProjectManager && isAtStep(1102)) : ((isNCR ? isUserFromConsultantOrg : isUserFromContractorOrg) && isProjectManager && isAtStep(isNCR ? 902 : (isRNCR ? 1002 : 103)))) ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid="button-contractor-manager-approval"
                          onClick={() => handleApprovalClick(isSI ? "Consultant PM Approval" : (isNCR ? "Consultant Manager Approval" : (isRNCR ? "Contractor PM Approval" : "Contractor Manager Approval")), isAtStep(isSI ? 1102 : (isNCR ? 902 : (isRNCR ? 1002 : 103))) ? (isSI ? 1103 : (isNCR ? 903 : (isRNCR ? 1003 : 104))) : undefined)}
                          title={isAtStep(isSI ? 1102 : (isNCR ? 902 : (isRNCR ? 1002 : 103))) ? (isSI ? "Approve & Issue to Contractor" : isNCR ? "Record manager approval" : "Approve & advance to Engineer Review") : "Record manager approval"}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      ) : null}
                      {/* Arrow button hidden - combined into Plus button above */}
                      {false && getTransitionForStep(104) && isAtStep(103) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleTransition(getTransitionForStep(104)!)}
                          data-testid="button-step-103-to-104"
                          title="Submit for Engineer Review"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {!isNCR && !isSI && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-4">
                    <CardTitle className="text-base">By Consultant</CardTitle>
                    <Badge variant="outline" className="flex items-center gap-2 px-3 py-1 bg-muted/50 border-muted rounded-[1.5rem]">
                      <div className="p-1 rounded-[1.5rem] bg-background border shadow-sm">
                        <Building2 className="w-3.5 h-3.5 text-foreground" />
                      </div>
                      <span className="font-semibold text-foreground tracking-tight">
                        {request?.consultantName || consultant?.name || "Consultant"}
                      </span>
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border rounded-[1.5rem] p-4 space-y-3">
                    <div className="flex items-center gap-4 mr-2">
                      <label className="font-medium">Team Approvals</label>
                      {consultantReviews.every(r => !r.receivedAt) && (
                        <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                          Pending...
                        </Badge>
                      )}
                    </div>

                    <div className="border rounded-[1.5rem] p-3 bg-muted/20">
                      <div className="grid grid-cols-3 items-center min-h-10">
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-medium">Receive Status</span>
                        </div>
                        <div className="flex flex-col items-center">
                          {consultantReviews.map((review) => (
                            review.receivedAt && (
                              <Badge
                                key={review.id}
                                variant="secondary"
                                className="inline-flex items-center rounded-[1.5rem] border transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 hover-elevate border-green-500/20 py-0 px-2 font-normal whitespace-nowrap text-[13px] text-[#16a362] bg-[#bfbfc400]"
                              >
                                Viewed at: {safeFormat(review.receivedAt, "MMM d, HH:mm", "-")}
                              </Badge>
                            )
                          ))}
                        </div>
                        <div className="flex flex-col items-end">
                          {getStepApproval(isRNCR ? "Consultant Review" : "Consultant Team Approval") ? (
                            <div className="px-3 py-1.5 rounded-[1.5rem] bg-green-500/15 border border-green-500/20 flex items-center justify-center min-w-[120px]">
                              <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                                {getUserName(getStepApproval(isRNCR ? "Consultant Review" : "Consultant Team Approval")!.changedBy) || "User"}
                              </span>
                            </div>
                          ) : isUserFromConsultantOrg && isAtStep(isRNCR ? 1003 : 104) ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid="button-consultant-team-approval"
                              onClick={() => handleApprovalClick(isRNCR ? "Consultant Review" : "Consultant Team Approval")}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {true && (
                      <>
                        <Separator />
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm text-muted-foreground">Image Attachments</p>
                            {(isUserFromConsultantOrg || user?.role === "admin") && !isAtStep(107) && !isManagerApproved && (
                              <label className="cursor-pointer">
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={handleImageUpload}
                                  disabled={uploadAttachmentMutation.isPending || isAtStep(107) || isManagerApproved}
                                  data-testid="input-upload-image"
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1"
                                  asChild
                                  disabled={uploadAttachmentMutation.isPending || isAtStep(107) || isManagerApproved}
                                >
                                  <span>
                                    <ImagePlus className="w-4 h-4" />
                                    {uploadAttachmentMutation.isPending ? "Uploading..." : "Add Image"}
                                  </span>
                                </Button>
                              </label>
                            )}
                          </div>
                          {consultantAttachments.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2">
                              {consultantAttachments.map((attachment) => (
                                <div key={attachment.id} className="relative group border rounded-[1.5rem] overflow-hidden">
                                  <img
                                    src={attachment.fileUrl || attachment.fileData || ""}
                                    alt={attachment.title || attachment.fileName || ""}
                                    className="w-full h-24 object-cover cursor-pointer"
                                    loading="lazy"
                                    onClick={() => setPreviewDoc(attachment)}
                                    data-testid={`img-attachment-${attachment.id}`}
                                  />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-white h-8 w-8"
                                      onClick={() => setPreviewDoc(attachment)}
                                      title="View"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-white h-8 w-8"
                                      onClick={() => {
                                        const url = attachment.fileUrl || attachment.fileData;
                                        if (url) {
                                          const link = document.createElement('a');
                                          link.href = url;
                                          link.download = attachment.fileName || 'attachment';
                                          document.body.appendChild(link);
                                          link.click();
                                          document.body.removeChild(link);
                                        }
                                      }}
                                      title="Download"
                                    >
                                      <Download className="w-4 h-4" />
                                    </Button>
                                    {(isUserFromConsultantOrg || user?.role === "admin") && !isAtStep(107) && !isManagerApproved && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-white h-8 w-8"
                                        onClick={() => setDeletingAttachmentId(attachment.id)}
                                        disabled={deleteAttachmentMutation.isPending || isAtStep(107) || isManagerApproved}
                                        title="Delete"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-2 py-1 truncate">
                                    {attachment.title || attachment.fileName}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No image attachments</p>
                          )}
                        </div>
                      </>
                    )}
                    {!isDSR && !isSD && !isNcrFamily && (
                      <>
                        <Separator />
                        <div className="pt-2">
                          <Tabs value={checklistTab} onValueChange={setChecklistTab} className="w-full">
                            <div className="relative">
                              <TabsList className="w-full justify-start mb-4 overflow-x-auto overflow-y-hidden flex-nowrap scrollbar-hide pb-0 h-auto gap-1 bg-transparent border-b rounded-none p-0">
                                {!isMIR && !isSSR && !isMAR && (
                                  <>
                                    <TabsTrigger
                                      value="main"
                                      data-testid="tab-checklist"
                                      className="gap-2 px-4 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none"
                                    >
                                      <span className="text-xs font-bold uppercase tracking-tight">Checklist</span>
                                      {mainChecklistItems.length > 0 && (
                                        <Badge variant="secondary" className="h-5 min-w-[20px] px-1 justify-center rounded-full text-[10px]">
                                          {mainChecklistItems.length}
                                        </Badge>
                                      )}
                                    </TabsTrigger>
                                    <TabsTrigger
                                      value="sbc"
                                      data-testid="tab-sbc"
                                      className="gap-2 px-4 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none"
                                    >
                                      <span className="text-xs font-bold uppercase tracking-tight">SBC</span>
                                      {sbcChecklistItems.length > 0 && (
                                        <Badge variant="secondary" className="h-5 min-w-[20px] px-1 justify-center rounded-full text-[10px]">
                                          {sbcChecklistItems.length}
                                        </Badge>
                                      )}
                                    </TabsTrigger>
                                    <TabsTrigger
                                      value="recommendations"
                                      data-testid="tab-recommendations"
                                      className="gap-2 px-4 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none whitespace-nowrap"
                                    >
                                      <span className="text-xs font-bold uppercase tracking-tight">Recommendations</span>
                                      {recommendationsChecklistItems.length > 0 && (
                                        <Badge variant="secondary" className="h-5 min-w-[20px] px-1 justify-center rounded-full text-[10px]">
                                          {recommendationsChecklistItems.length}
                                        </Badge>
                                      )}
                                    </TabsTrigger>
                                  </>
                                )}
                                {(isMIR || isSSR || isMAR) && (
                                  <TabsTrigger
                                    value={isMAR ? "mar" : isSSR ? "ssr" : "mir"}
                                    data-testid={isMAR ? "tab-mar" : isSSR ? "tab-ssr" : "tab-mir"}
                                    className="gap-2 px-4 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none"
                                  >
                                    <span className="text-xs font-bold uppercase tracking-tight">{isMAR ? "MAR" : isSSR ? "SSR" : "MIR"} Checklist</span>
                                    {(isMAR ? marChecklistItems : isSSR ? ssrChecklistItems : mirChecklistItems).length > 0 && (
                                      <Badge variant="secondary" className="h-5 min-w-[20px] px-1 justify-center rounded-full text-[10px]">
                                        {(isMAR ? marChecklistItems : isSSR ? ssrChecklistItems : mirChecklistItems).length}
                                      </Badge>
                                    )}
                                  </TabsTrigger>
                                )}
                              </TabsList>
                            </div>

                            <TabsContent value="main" className="space-y-2">
                              {mainChecklistItems.length === 0 ? (
                                <p className="text-muted-foreground text-sm py-4">No checklist items linked to this activity</p>
                              ) : (
                                mainChecklistItems.map((item, idx) => {
                                  const currentResponse = getChecklistResponse(item.id);
                                  return (
                                    <div key={item.id} className="flex flex-col xs:flex-row xs:items-center justify-between gap-3 py-3 border-b last:border-0 px-1">
                                      <span className="text-sm font-medium leading-tight">
                                        {idx + 1}. {item.nameEnglish}
                                      </span>
                                      {isUserFromConsultantOrg ? (
                                        <div className="flex items-center gap-1 self-end xs:self-center">
                                          <Button
                                            size="sm"
                                            variant={currentResponse === "yes" ? "default" : "outline"}
                                            className={cn(
                                              "h-8 text-[10px] px-2",
                                              currentResponse === "yes" ? "bg-green-600 hover:bg-green-700 text-white" : ""
                                            )}
                                            onClick={() => !isAtStep(107) && handleChecklistResponse(item.id, "yes")}
                                            disabled={checklistResponseMutation.isPending || isAtStep(107)}
                                            data-testid={`btn-yes-${item.id}`}
                                          >
                                            <Check className="w-3 h-3 mr-1" />
                                            Yes
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant={currentResponse === "no" ? "default" : "outline"}
                                            className={cn(
                                              "h-8 text-[10px] px-2",
                                              currentResponse === "no" ? "bg-red-600 hover:bg-red-700 text-white" : ""
                                            )}
                                            onClick={() => !isAtStep(107) && handleChecklistResponse(item.id, "no")}
                                            disabled={checklistResponseMutation.isPending || isAtStep(107)}
                                            data-testid={`btn-no-${item.id}`}
                                          >
                                            <X className="w-3 h-3 mr-1" />
                                            No
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant={currentResponse === "na" ? "default" : "outline"}
                                            className={cn(
                                              "h-8 text-[10px] px-2",
                                              currentResponse === "na" ? "bg-gray-500 hover:bg-gray-600 text-white" : ""
                                            )}
                                            onClick={() => !isAtStep(107) && handleChecklistResponse(item.id, "na")}
                                            disabled={checklistResponseMutation.isPending || isAtStep(107)}
                                            data-testid={`btn-na-${item.id}`}
                                          >
                                            N/A
                                          </Button>
                                        </div>
                                      ) : (
                                        <Badge variant="secondary" className={cn(
                                          "w-fit self-end xs:self-center",
                                          currentResponse === "yes" ? "bg-green-600 text-white" :
                                            currentResponse === "no" ? "bg-red-600 text-white" :
                                              currentResponse === "na" ? "bg-gray-500 text-white" :
                                                "bg-muted text-muted-foreground"
                                        )}>
                                          {currentResponse === "yes" ? "Yes" : currentResponse === "no" ? "No" : currentResponse === "na" ? "N/A" : "Pending"}
                                        </Badge>
                                      )}
                                    </div>

                                  );
                                })
                              )}
                            </TabsContent>

                            <TabsContent value="sbc" className="space-y-2">
                              {sbcChecklistItems.length === 0 ? (
                                <p className="text-muted-foreground text-sm py-4">No Saudi Building Codes linked</p>
                              ) : (
                                sbcChecklistItems.map((item, idx) => {
                                  const currentResponse = getChecklistResponse(item.id);
                                  return (
                                    <div key={item.id} className="flex flex-col xs:flex-row xs:items-center justify-between gap-3 py-3 border-b last:border-0 px-1">
                                      <span className="text-sm font-medium leading-tight">
                                        {idx + 1}. {item.nameEnglish}
                                      </span>
                                      {isUserFromConsultantOrg ? (
                                        <div className="flex items-center gap-1 self-end xs:self-center">
                                          <Button
                                            size="sm"
                                            variant={currentResponse === "yes" ? "default" : "outline"}
                                            className={cn(
                                              "h-8 text-[10px] px-2",
                                              currentResponse === "yes" ? "bg-green-600 hover:bg-green-700 text-white" : ""
                                            )}
                                            onClick={() => !isAtStep(107) && handleChecklistResponse(item.id, "yes")}
                                            disabled={checklistResponseMutation.isPending || isAtStep(107)}
                                            data-testid={`btn-sbc-yes-${item.id}`}
                                          >
                                            <Check className="w-3 h-3 mr-1" />
                                            Yes
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant={currentResponse === "no" ? "default" : "outline"}
                                            className={cn(
                                              "h-8 text-[10px] px-2",
                                              currentResponse === "no" ? "bg-red-600 hover:bg-red-700 text-white" : ""
                                            )}
                                            onClick={() => !isAtStep(107) && handleChecklistResponse(item.id, "no")}
                                            disabled={checklistResponseMutation.isPending || isAtStep(107)}
                                            data-testid={`btn-sbc-no-${item.id}`}
                                          >
                                            <X className="w-3 h-3 mr-1" />
                                            No
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant={currentResponse === "na" ? "default" : "outline"}
                                            className={cn(
                                              "h-8 text-[10px] px-2",
                                              currentResponse === "na" ? "bg-gray-500 hover:bg-gray-600 text-white" : ""
                                            )}
                                            onClick={() => !isAtStep(107) && handleChecklistResponse(item.id, "na")}
                                            disabled={checklistResponseMutation.isPending || isAtStep(107)}
                                            data-testid={`btn-sbc-na-${item.id}`}
                                          >
                                            N/A
                                          </Button>
                                        </div>
                                      ) : (
                                        <Badge variant="secondary" className={cn(
                                          "w-fit self-end xs:self-center",
                                          currentResponse === "yes" ? "bg-green-600 text-white" :
                                            currentResponse === "no" ? "bg-red-600 text-white" :
                                              currentResponse === "na" ? "bg-gray-500 text-white" :
                                                "bg-muted text-muted-foreground"
                                        )}>
                                          {currentResponse === "yes" ? "Yes" : currentResponse === "no" ? "No" : currentResponse === "na" ? "N/A" : "Pending"}
                                        </Badge>
                                      )}
                                    </div>

                                  );
                                })
                              )}
                            </TabsContent>

                            <TabsContent value={isMAR ? "mar" : isSSR ? "ssr" : "mir"} className="space-y-2">
                              {(isMAR ? marChecklistItems : isSSR ? ssrChecklistItems : mirChecklistItems).length === 0 ? (
                                <p className="text-muted-foreground text-sm py-4">No mandatory items found</p>
                              ) : (
                                (isMAR ? marChecklistItems : isSSR ? ssrChecklistItems : mirChecklistItems).map((item, idx) => {
                                  const currentResponse = getChecklistResponse(item.id);
                                  return (
                                    <div key={item.id} className="flex flex-col gap-3 py-4 border-b last:border-0 hover:bg-muted/5 transition-colors px-3 rounded-[1.5rem]">
                                      <div className="flex flex-row items-start justify-between gap-4">
                                        <div className="flex-1 space-y-2">
                                          <p className="text-sm font-bold leading-tight">
                                            {idx + 1}. {item.nameEnglish}
                                          </p>
                                        </div>
                                        {isUserFromConsultantOrg ? (
                                          <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                              size="sm"
                                              variant={currentResponse === "yes" ? "default" : "outline"}
                                              className={cn(
                                                "h-9 text-[11px] font-black uppercase tracking-tight",
                                                currentResponse === "yes" ? "bg-green-600 hover:bg-green-700 text-white shadow-md border-green-700" : "hover:bg-green-50"
                                              )}
                                              onClick={() => !isAtStep(107) && handleChecklistResponse(item.id, "yes")}
                                              disabled={checklistResponseMutation.isPending || isAtStep(107)}
                                              data-testid={isMAR ? `btn-mar-yes-${item.id}` : isSSR ? `btn-ssr-yes-${item.id}` : `btn-mir-yes-${item.id}`}
                                            >
                                              <Check className="w-4 h-4 mr-1.5" />
                                              Approved
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant={currentResponse === "no" ? "default" : "outline"}
                                              className={cn(
                                                "h-9 text-[11px] font-black uppercase tracking-tight",
                                                currentResponse === "no" ? "bg-red-600 hover:bg-red-700 text-white shadow-md border-red-700" : "hover:bg-red-50"
                                              )}
                                              onClick={() => !isAtStep(107) && handleChecklistResponse(item.id, "no")}
                                              disabled={checklistResponseMutation.isPending || isAtStep(107)}
                                              data-testid={isMAR ? `btn-mar-no-${item.id}` : isSSR ? `btn-ssr-no-${item.id}` : `btn-mir-no-${item.id}`}
                                            >
                                              <X className="w-4 h-4 mr-1.5" />
                                              Rejected
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant={currentResponse === "na" ? "default" : "outline"}
                                              className={cn(
                                                "h-9 text-[11px] font-black uppercase tracking-tight",
                                                currentResponse === "na" ? "bg-gray-500 hover:bg-gray-600 text-white shadow-md border-gray-700" : "hover:bg-gray-50"
                                              )}
                                              onClick={() => !isAtStep(107) && handleChecklistResponse(item.id, "na")}
                                              disabled={checklistResponseMutation.isPending || isAtStep(107)}
                                              data-testid={isMAR ? `btn-mar-na-${item.id}` : isSSR ? `btn-ssr-na-${item.id}` : `btn-mir-na-${item.id}`}
                                            >
                                              N/A
                                            </Button>
                                          </div>
                                        ) : (
                                          <Badge variant="secondary" className={cn(
                                            currentResponse === "no" ? "bg-red-100 text-red-700 border-red-200" :
                                              "bg-muted text-muted-foreground"
                                          )}>
                                            {currentResponse === "yes" ? "Approved" : currentResponse === "no" ? "Rejected" : "Pending"}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>

                                  );
                                })
                              )}
                            </TabsContent>

                            <TabsContent value="recommendations" className="space-y-2">
                              {isUserFromConsultantOrg && !isAtStep(107) && !isManagerApproved && (
                                <div className="flex justify-end mb-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setShowAddRecommendationDialog(true)}
                                    data-testid="btn-add-recommendation"
                                    disabled={isAtStep(107) || isManagerApproved}
                                  >
                                    <Plus className="w-4 h-4 mr-1" />
                                    Add Recommendation
                                  </Button>
                                </div>
                              )}
                              {recommendationsChecklistItems.length === 0 ? (
                                <p className="text-muted-foreground text-sm py-4">No recommendations linked</p>
                              ) : (
                                recommendationsChecklistItems.map((item, idx) => (
                                  <div key={item.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                                    <span className="text-sm flex-1">
                                      {idx + 1}. {item.nameEnglish}
                                    </span>
                                    {isUserFromConsultantOrg && !isAtStep(107) && !isManagerApproved && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => setDeletingRecommendationId(item.id)}
                                        disabled={deleteRecommendationMutation.isPending || isAtStep(107) || isManagerApproved}
                                        data-testid={`btn-rec-delete-${item.id}`}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                ))
                              )}
                            </TabsContent>
                          </Tabs>
                        </div>
                      </>
                    )}

                    <div className="border rounded-[1.5rem] p-4 bg-muted/20 space-y-3">
                      <label className="font-medium">Comments</label>
                      {consultantReviews.length > 0 ? (
                        <div className="space-y-3">
                          {consultantReviews.map((review) => (
                            <div key={review.id} className="space-y-2">
                              <Textarea
                                defaultValue={review.comments || ""}
                                placeholder="Add comments..."
                                className="text-sm min-h-[80px] bg-background rounded-[1.5rem] px-4 py-3"
                                data-testid={`textarea-review-comments-${review.id}`}
                                readOnly={!isUserFromConsultantOrg || isAtStep(107) || isManagerApproved}
                                onBlur={(e) => {
                                  if (isUserFromConsultantOrg && !isAtStep(107) && !isManagerApproved && e.target.value !== (review.comments || "")) {
                                    updateConsultantReviewMutation.mutate({
                                      id: review.id,
                                      comments: e.target.value,
                                    });
                                  }
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground italic">No review context available</div>
                      )}
                    </div>

                    {(consultantReviews.length > 0 || isAtStep(101)) &&
                      (getStepApproval(isRNCR ? "Consultant Review" : "Consultant Team Approval") || (isAtStep(101) && revisions.some(r => r.approvalStatusCode))) &&
                      (isAtStep(101) || isAtStep(isRNCR ? 1003 : 104) || isAtStep(isRNCR ? 1004 : 105) || isAtStep(106) || isAtStep(107)) &&
                      requestType?.code?.toUpperCase() !== "NCR" && (
                        <div className="border rounded-[1.5rem] p-4 bg-muted/20">
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                                <span className="font-medium">Approval Status</span>
                              </div>

                            </div>
                            {/* Workflow Action: Engineer Review - Send to Site Inspection (Step 104 -> 105 or 1003 -> 1004) */}
                            {getTransitionForStep(isRNCR ? 1004 : 105) && isAtStep(isRNCR ? 1003 : 104) && consultantReviews.length > 0 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={!localApprovalStatus || isSavingApproval}
                                onClick={async () => {
                                  if (localApprovalStatus) {
                                    setIsSavingApproval(true);
                                    const transition = getTransitionForStep(isRNCR ? 1004 : 105);
                                    if (!transition) {
                                      setIsSavingApproval(false);
                                      return;
                                    }
                                    try {
                                      // Execute API calls in parallel for faster response
                                      await Promise.all([
                                        apiRequest("PATCH", `/api/consultant-reviews/${localApprovalStatus.reviewId}`, {
                                          statusCode: localApprovalStatus.statusCode,
                                          reviewedAt: new Date().toISOString(),
                                        }),
                                        apiRequest("POST", `/api/requests/${requestId}/move`, {
                                          toStepId: transition.toStepId,
                                          newStatus: transition.allowedStatus,
                                          remarks: `Status set to ${localApprovalStatus.statusCode}`,
                                        })
                                      ]);

                                      // Wait for all queries to invalidate to ensure UI has fresh data
                                      await Promise.all([
                                        queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId] }),
                                        queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId, "transitions"] }),
                                        queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "history"] }),
                                        queryClient.invalidateQueries({ queryKey: ["/api/revisions", currentRevision?.id, "consultant-reviews"] })
                                      ]);

                                      // Clear local status ONLY after data is refreshed to prevent flickering
                                      setLocalApprovalStatus(null);
                                      toast({ title: "Request updated", description: "Workflow step has been changed" });
                                    } catch (error) {
                                      console.error("Failed to save approval status:", error);
                                      toast({ title: "Error", description: "Failed to update request", variant: "destructive" });
                                    } finally {
                                      setIsSavingApproval(false);
                                    }
                                  }
                                }}
                                data-testid="button-engineer-to-site"
                                title="Proceed to Site Inspection"
                              >
                                {isSavingApproval ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <ArrowRight className="w-4 h-4" />
                                )}
                              </Button>
                            )}
                          </div>
                          {consultantReviews.map((review) => {
                            const isAtEngineerReviewStep = isAtStep(isRNCR ? 1003 : 104);
                            const effectiveStatusCode = isAtEngineerReviewStep && localApprovalStatus?.reviewId === review.id
                              ? localApprovalStatus.statusCode
                              : review.statusCode;

                            return (
                              <div key={review.id} className="flex flex-wrap gap-2">
                                {[
                                  { code: "A", label: "Approved", icon: CheckCircle2, color: "green" },
                                  { code: "B", label: "Approved As Noted", icon: AlertCircle, color: "blue" },
                                  { code: "C", label: "Revise and Resubmit", icon: RotateCcw, color: "yellow" },
                                  { code: "D", label: "Rejected", icon: X, color: "red" },
                                  { code: "E", label: "Close automatically", icon: Clock, color: "gray" },
                                ].filter((status) => !isRNCR || ["A", "D"].includes(status.code))
                                .map((status) => {
                                  const isSelected = effectiveStatusCode === status.code;
                                  const StatusIcon = status.icon;
                                  const colorStyles: Record<string, { bg: string; border: string; text: string; badge: string }> = {
                                    green: { bg: "bg-green-500/15", border: "border-green-500", text: "text-green-700 dark:text-green-400", badge: "bg-green-500" },
                                    blue: { bg: "bg-blue-500/15", border: "border-blue-500", text: "text-blue-700 dark:text-blue-400", badge: "bg-blue-500" },
                                    yellow: { bg: "bg-yellow-500/15", border: "border-yellow-500", text: "text-yellow-700 dark:text-yellow-400", badge: "bg-yellow-500" },
                                    red: { bg: "bg-red-500/15", border: "border-red-500", text: "text-red-700 dark:text-red-400", badge: "bg-red-500" },
                                    gray: { bg: "bg-gray-500/15", border: "border-gray-500", text: "text-gray-700 dark:text-gray-400", badge: "bg-gray-500" },
                                  };
                                  const colors = colorStyles[status.color];

                                  if (!isUserFromConsultantOrg && !isSelected) {
                                    return null;
                                  }

                                  return (
                                    <button
                                      key={status.code}
                                      type="button"
                                      onClick={() => {
                                        if (!isUserFromConsultantOrg || isAtStep(107) || isManagerApproved) return;
                                        if ((isAtStep(106) || (isRNCR && isAtStep(1004))) && !isProjectManager) return;
                                        if (isAtEngineerReviewStep) {
                                          setLocalApprovalStatus({ reviewId: review.id, statusCode: status.code });
                                        } else {
                                          setPendingStatusChange({ reviewId: review.id, statusCode: status.code });
                                        }
                                      }}
                                      disabled={!isUserFromConsultantOrg || isAtStep(107) || ((isAtStep(106) || (isRNCR && isAtStep(1004))) && !isProjectManager) || isManagerApproved}
                                      className={`inline-flex items-center gap-1.5 px-3 py-2 md:py-1.5 text-[10px] md:text-xs font-black uppercase tracking-tight rounded-full border transition-all ${isSelected
                                        ? `${colors.bg} ${colors.border} ${colors.text} shadow-sm`
                                        : "bg-background border-border text-muted-foreground/60 hover-elevate hover:border-primary/30"
                                        } ${(!isUserFromConsultantOrg || isAtStep(107) || ((isAtStep(106) || (isRNCR && isAtStep(1004))) && !isProjectManager) || isManagerApproved) ? "cursor-default" : "active:scale-95"}`}
                                      data-testid={`btn-status-${status.code}-${review.id}`}
                                    >
                                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black ${isSelected ? `${colors.badge} text-white` : "bg-muted text-muted-foreground"
                                        }`}>
                                        {status.code}
                                      </span>
                                      <StatusIcon className="w-3.5 h-3.5" />
                                      <span>{status.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      )}

                    {requestType?.code?.toUpperCase() !== "NCR" && (
                      <div className="pt-2 mt-4 space-y-3">

                        {!isRNCR && (
                          <div className="border rounded-[1.5rem] p-4 bg-muted/20">
                            <div className="grid grid-cols-2 items-center min-h-10">
                              <div className="flex flex-col items-start">
                                <span className="text-sm font-medium">Site Inspection</span>
                              </div>
                              <div className="flex flex-col items-end">
                                {/* Workflow Action: Site Inspection Complete (Step 105 -> 106) */}
                                {isUserFromConsultantOrg && getTransitionForStep(106) && isAtStep(105) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleTransition(getTransitionForStep(106)!)}
                                    data-testid="button-site-to-consultant-pm"
                                    title="Send to Consultant PM"
                                  >
                                    <ArrowRight className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}








                        <div className="border rounded-[1.5rem] p-4 bg-muted/20">
                          <div className="grid grid-cols-2 items-center min-h-10">
                            <div className="flex flex-col items-start">
                              <span className="text-sm font-medium">Manager Approval</span>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              {getStepApproval("Consultant Manager Approval") ? (
                                <div className="px-3 py-1.5 rounded-[1.5rem] bg-green-500/15 border border-green-500/20 flex items-center justify-center min-w-[120px]">
                                  <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                                    {getUserName(getStepApproval("Consultant Manager Approval")!.changedBy) || "User"}
                                  </span>
                                </div>
                              ) : isUserFromConsultantOrg && isProjectManager && (isAtStep(106) || (isNCR && isAtStep(902)) || (isRNCR && isAtStep(1004))) ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={async () => {
                                    const teamStatusCode = consultantReviews.length > 0 ? consultantReviews[0].statusCode : undefined;
                                    const autoStep = isAtStep(106) ? 107 : (isNCR && isAtStep(902) ? 903 : (isRNCR && isAtStep(1004) ? 1004 : undefined));
                                    handleApprovalClick("Consultant Manager Approval", autoStep, teamStatusCode || undefined);
                                  }}
                                  data-testid="button-manager-approval"
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                              ) : null}

                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

          </div>

          <div className="space-y-4">
            {/*            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Status History</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[260px]">
                  <div className="space-y-4">
                    {statusHistory.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No status history yet</p>
                    ) : (
                      statusHistory.map((item) => (
                        <div key={item.id} className="flex gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {getUserName(item.changedBy).split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-sm">{getUserName(item.changedBy)}</p>
                              <span className="text-xs text-muted-foreground">
                                {formatGMT3(item.changedAt, "MMM d, h:mm a")}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {item.newStatus}
                            </p>
                            {item.remarks && (
                              <p className="text-xs text-muted-foreground mt-1 bg-muted p-2 rounded">
                                {item.remarks}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card> */}

            {approvalStatus && !isNcrFamily && (
              <Card>
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">Approval Status</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {(() => {
                    // Use actual approvalStatus if available for this revision
                    let displayStatus = approvalStatus;

                    // Fallback: If no status for current revision and we are at step 101,
                    // look for the most recent revision that had a result.
                    if (!displayStatus && isAtStep(101)) {
                      const latestWithStatus = [...revisions]
                        .filter(r => r.approvalStatusCode)
                        .sort((a, b) => b.revisionNo - a.revisionNo)[0];

                      if (latestWithStatus) {
                        const codeInfo = approvalStatusCodes.find(c => c.code === latestWithStatus.approvalStatusCode);
                        displayStatus = {
                          statusCode: latestWithStatus.approvalStatusCode!,
                          statusLabel: codeInfo?.label || latestWithStatus.approvalStatusCode!,
                          comments: latestWithStatus.approvalComments,
                          approvedBy: latestWithStatus.approvedBy,
                          approvedAt: latestWithStatus.approvedAt
                        };
                      }
                    }

                    if (!displayStatus) return <div className="text-sm text-muted-foreground italic">No approval status recorded yet</div>;

                    const safeStatus = displayStatus;
                    const statusColors: Record<string, string> = {
                      "A": "text-green-600",
                      "B": "text-blue-600",
                      "C": "text-yellow-600",
                      "D": "text-red-600",
                      "E": "text-gray-600"
                    };

                    return (
                      <div className="flex gap-3">
                        {safeStatus.approvedBy && (
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {getUserName(safeStatus.approvedBy).split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm">{safeStatus.approvedBy ? getUserName(safeStatus.approvedBy) : "System"}</p>
                            {safeStatus.approvedAt && (
                              <span className="text-xs text-muted-foreground">
                                {formatGMT3(safeStatus.approvedAt, "MMM d, h:mm a")}
                              </span>
                            )}
                          </div>
                          <p className={`text-sm font-medium ${statusColors[safeStatus.statusCode] || ""}`}>
                            ({safeStatus.statusCode}) {safeStatus.statusLabel}
                            {isAtStep(101) && safeStatus.statusCode === "C" && (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">(Previous Result)</span>
                            )}
                          </p>
                          {safeStatus.comments && (
                            <p className="text-xs text-muted-foreground mt-1 bg-muted p-2 rounded">
                              {safeStatus.comments}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-1">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Messages</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {chatMessages.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ScrollArea className="h-64 pr-2">
                  {chatMessages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No messages yet</p>
                  ) : (
                    <div className="space-y-3">
                      {chatMessages.map((msg) => {
                        const isCurrentUser = msg.senderId === user?.id;
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isCurrentUser ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[85%] rounded-lg p-3 ${isCurrentUser
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                                }`}
                            >
                              {!isCurrentUser && (
                                <p className={`text-xs font-medium mb-1 ${isCurrentUser ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                                  {getUserName(msg.senderId)}
                                </p>
                              )}
                              {msg.message && (
                                <p className="text-sm whitespace-pre-wrap" dir="auto">{msg.message}</p>
                              )}
                              {msg.attachments && msg.attachments.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {msg.attachments.map((att) => (
                                    <div
                                      key={att.id}
                                      className={`flex items-center gap-2 text-xs p-1.5 rounded ${isCurrentUser ? "bg-primary-foreground/10" : "bg-background"
                                        }`}
                                    >
                                      <Paperclip className="w-3 h-3 shrink-0" />
                                      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                        {att.fileUrl ? (
                                          <a
                                            href={att.fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="truncate hover:underline"
                                            data-testid={`link-attachment-${att.id}`}
                                          >
                                            {att.title || att.fileName}
                                          </a>
                                        ) : (
                                          <span className="truncate">{att.title || att.fileName}</span>
                                        )}
                                        <button
                                          onClick={() => setPreviewDoc(att)}
                                          className="p-1 hover:bg-muted-foreground/20 rounded transition-colors"
                                          title="Preview"
                                        >
                                          <Eye className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <p className={`text-xs mt-1 ${isCurrentUser ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                {format(new Date(msg.sentAt), "MMM d, h:mm a")}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={scrollRef} />
                    </div>
                  )}
                </ScrollArea>

                {chatFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 bg-muted/50 rounded-[1.5rem]">
                    {chatFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-1 text-xs bg-background px-3 py-1.5 rounded-[1.5rem]">
                        <Paperclip className="w-3 h-3" />
                        <span className="max-w-[100px] truncate">{file.name}</span>
                        <button
                          onClick={() => setChatFiles(prev => prev.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-foreground"
                          data-testid={`button-remove-file-${idx}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 items-end">
                  <div className="flex-1 relative">
                    <Textarea
                      placeholder="Type a message..."
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      className="resize-none min-h-[38px] max-h-[120px] pr-10 rounded-[1.5rem] px-4 py-2.5"
                      rows={1}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (sendMessageMutation.isPending) return;
                          if (chatMessage.trim() || chatFiles.length > 0) {
                            sendMessageMutation.mutate({
                              message: chatMessage.trim() || undefined,
                              files: chatFiles.length > 0 ? chatFiles : undefined
                            });
                          }
                        }
                      }}
                      data-testid="textarea-chat-message"
                    />
                  </div>
                  <input
                    ref={chatFileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) {
                        setChatFiles(prev => [...prev, ...files]);
                      }
                      e.target.value = "";
                    }}
                    data-testid="input-chat-files"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => chatFileInputRef.current?.click()}
                    data-testid="button-attach-file"
                  >
                    <Paperclip className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    onClick={() => {
                      if (chatMessage.trim() || chatFiles.length > 0) {
                        sendMessageMutation.mutate({
                          message: chatMessage.trim() || undefined,
                          files: chatFiles.length > 0 ? chatFiles : undefined
                        });
                      }
                    }}
                    disabled={sendMessageMutation.isPending || (!chatMessage.trim() && chatFiles.length === 0)}
                    data-testid="button-send-message"
                  >
                    {sendMessageMutation.isPending ? (
                      <Clock className="w-4 h-4 animate-spin" />
                    ) : (
                      <MessageSquare className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Authorized Team Members Card */}
            {revisionStep && authorizedMembers.length > 0 && !isNCR && !["Closed", "Approved", "Resolved", "Rejected"].includes(request?.currentStatus || "") && (
              <Card>
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">Authorized for Step</CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {authorizedMembers.length}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Team members who can perform "{revisionStep?.stepName}"
                  </p>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-40">
                    <div className="space-y-2">
                      {authorizedMembers.map((member) => (
                        <HoverCard key={member.id}>
                          <HoverCardTrigger asChild>
                            <div
                              className="flex items-center gap-3 px-3 py-2 rounded-[1.5rem] bg-muted/50 cursor-help"
                              data-testid={`authorized-member-${member.id}`}
                            >
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs">
                                  {member.nameEnglish?.substring(0, 2).toUpperCase() || "??"}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {member.nameEnglish}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {member.position && (
                                    <span className="truncate">{member.position}</span>
                                  )}
                                  {member.position && member.organizationName && (
                                    <span>-</span>
                                  )}
                                  {member.organizationName && (
                                    <span className="truncate">{member.organizationName}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-80 rounded-[1.5rem]">
                            <div className="flex justify-between space-x-4">
                              <Avatar className="h-10 w-10">
                                <AvatarFallback className="text-sm">
                                  {member.nameEnglish?.substring(0, 2).toUpperCase() || "??"}
                                </AvatarFallback>
                              </Avatar>
                              <div className="space-y-1 flex-1">
                                <h4 className="text-sm font-semibold">{member.nameEnglish}</h4>
                                {member.nameArabic && (
                                  <p className="text-sm text-muted-foreground font-arabic" dir="rtl">
                                    {member.nameArabic}
                                  </p>
                                )}
                                <div className="text-xs space-y-2 pt-2 border-t mt-2">
                                  <p className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Linked Users</p>
                                  {member.users && member.users.length > 0 ? (
                                    <div className="space-y-2">
                                      {member.users.map((u: any) => (
                                        <div key={u.id} className="flex items-center gap-2">
                                          <Avatar className="h-6 w-6">
                                            {u.avatar ? (
                                              <AvatarImage src={u.avatar} />
                                            ) : (
                                              <AvatarFallback className="text-[10px]">
                                                {u.fullName?.substring(0, 2).toUpperCase() || "??"}
                                              </AvatarFallback>
                                            )}
                                          </Avatar>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium truncate">{u.fullName}</p>
                                            <p className="text-[10px] text-muted-foreground truncate">{u.username}</p>
                                          </div>
                                          {!u.isActive && (
                                            <Badge variant="outline" className="text-[8px] h-3 px-1 border-destructive text-destructive">Inactive</Badge>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-[10px] text-muted-foreground italic">No users linked to this team member</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Status History Card */}
            {statusHistory && statusHistory.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-bold">History</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 gap-1.5 text-primary hover:text-primary hover:bg-primary/5"
                      onClick={() => setShowFullStatusHistory(true)}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View All
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[200px] pl-2 pr-4">
                    <div className="space-y-4 pb-6">
                      {statusHistory.map((history, index) => (
                        <div key={history.id} className="relative pl-11 pb-8 last:pb-2">
                          {index !== statusHistory.length - 1 && (
                            <div className="absolute left-[18px] top-[32px] bottom-6 w-[2px] bg-muted/60" />
                          )}
                          <div className="absolute left-1 top-1.5 w-7 h-7 rounded-full bg-white border border-primary/20 flex items-center justify-center shadow-sm z-10">
                            <Clock className="w-4 h-4 text-primary shrink-0" />
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant="secondary" className="text-[11px] font-bold uppercase tracking-wide px-2 py-0 h-5">
                                {history.newStatus}
                              </Badge>
                              <span className="text-xs text-muted-foreground/80 font-medium">
                                {formatGMT3(history.changedAt, "MMM d, HH:mm")}
                              </span>
                            </div>
                            {history.remarks && (
                              <p className="text-sm text-foreground/90 font-medium leading-relaxed bg-muted/30 px-4 py-3 rounded-[1.5rem] border border-muted/50">
                                {history.remarks}
                              </p>
                            )}
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <User className="w-3 h-3 text-muted-foreground" />
                              <p className="text-xs text-muted-foreground font-semibold">
                                {getUserName(history.changedBy)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Consultant Review Status Card - Hidden by user request */}
            {/*
            {getStepApproval("Consultant Manager Approval") && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Consultant Review Status</CardTitle>
                </CardHeader>
                <CardContent>
                  {consultantReviews.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No reviews yet</p>
                  ) : (
                    consultantReviews.map((review) => {
                      const statusMap: Record<string, string> = {
                        "A": "(A) Approved",
                        "B": "(B) Approved As Noted",
                        "C": "(C) Revise and Resubmit",
                        "D": "(D) Rejected",
                        "E": "(E) Close automatically by system"
                      };
                      const statusLabel = statusMap[review.statusCode || ""] || "Not set";

                      return (
                        <div key={review.id} className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Status</label>
                            <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm shadow-sm items-center text-muted-foreground">
                              {statusLabel}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            )}
            */}

            {/* Purpose section removed - moved to Request Details */}
          </div>
        </div>
      </div>

      <Dialog open={showFullStatusHistory} onOpenChange={setShowFullStatusHistory}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl ring-1 ring-black/5 rounded-[1.5rem]">
          <DialogHeader className="p-5 pb-4 bg-gradient-to-br from-primary/5 via-background to-background relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12 blur-2xl" />
            <div className="flex items-center gap-3 relative z-10">
              <div className="p-2 rounded-xl bg-primary shadow-md shadow-primary/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-primary-foreground shrink-0" />
              </div>
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                History
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 pt-2 custom-scrollbar">
            <div className="relative">
              <div className="absolute left-[17px] top-6 bottom-6 w-[2px] bg-gradient-to-b from-primary/30 via-muted to-muted/30" />

              <div className="space-y-10">
                {statusHistory.map((history, index) => {
                  const isLast = index === statusHistory.length - 1;
                  const theme = (() => {
                    const s = history.newStatus.toLowerCase();
                    if (s.includes('approved')) return { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', dot: 'bg-green-500', glow: 'shadow-green-200' };
                    if (s.includes('rejected')) return { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500', glow: 'shadow-red-200' };
                    if (s.includes('submitted')) return { icon: Send, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500', glow: 'shadow-amber-200' };
                    return { icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500', glow: 'shadow-blue-200' };
                  })();

                  return (
                    <div key={history.id} className="relative pl-12 group transition-all duration-300">
                      {/* Timeline Dot */}
                      <div className={`absolute left-0 top-1.5 w-9 h-9 rounded-full border-4 border-background flex items-center justify-center z-10 shadow-md transition-transform group-hover:scale-110 duration-200 ${theme.dot}`}>
                        <theme.icon className="w-4.5 h-4.5 text-white shrink-0" />
                      </div>

                      <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge className={`font-bold tracking-wide shadow-sm px-3 ${theme.bg} ${theme.color} ${theme.border} border`}>
                              {history.newStatus}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground/80 font-medium">
                            {formatGMT3(history.changedAt, "MMM d, HH:mm")}
                          </span>
                        </div>

                        {history.remarks && (
                          <div className="bg-white border rounded-xl p-4 shadow-sm group-hover:shadow-md transition-shadow duration-300 relative">
                            <div className="absolute left-0 top-4 w-1 h-8 bg-primary/20 rounded-r-full" />
                            <p className="text-[15px] leading-relaxed text-foreground/80 font-medium">
                              {history.remarks}
                            </p>
                          </div>
                        )}

                        <div className="flex items-center gap-3 px-1">
                          <div className="p-1.5 rounded-lg bg-muted/50 group-hover:bg-primary/5 transition-colors duration-300">
                            <User className="w-4 h-4 text-primary/70" />
                          </div>
                          <span className="text-sm font-bold text-foreground/90">{getUserName(history.changedBy)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="p-4 bg-muted/30 border-t flex justify-between items-center px-6">
            <div className="flex -space-x-2">
              {/* Optional: Add avatars of people involved */}
            </div>
            <Button
              variant="default"
              className="px-8 font-bold shadow-lg shadow-primary/20"
              onClick={() => setShowFullStatusHistory(false)}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTransitionDialog} onOpenChange={setShowTransitionDialog}>
        <DialogContent className="rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Confirm Workflow Transition</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p>
              Move request to: <strong>{selectedTransition?.allowedStatus}</strong>
            </p>
            <div>
              <label className="text-sm font-medium">Remarks (optional)</label>
              <Textarea
                value={transitionRemarks}
                onChange={(e) => setTransitionRemarks(e.target.value)}
                placeholder="Add any comments about this transition..."
                className="mt-2"
                data-testid="textarea-transition-remarks"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransitionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmTransition} disabled={moveMutation.isPending}>
              {moveMutation.isPending ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addInquiryOpen} onOpenChange={setAddInquiryOpen}>
        <DialogContent className="rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Add Inquiry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Question</label>
              <Textarea
                value={newInquiryQuestion}
                onChange={(e) => setNewInquiryQuestion(e.target.value)}
                placeholder="Enter your question..."
                className="mt-2"
                data-testid="textarea-new-inquiry"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddInquiryOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (newInquiryQuestion.trim()) {
                  addInquiryMutation.mutate({ question: newInquiryQuestion.trim() });
                }
              }}
              disabled={!newInquiryQuestion.trim() || addInquiryMutation.isPending}
              data-testid="button-submit-inquiry"
            >
              {addInquiryMutation.isPending ? "Adding..." : "Add Question"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!approvingStep} onOpenChange={(open) => {
        if (!open) {
          setApprovingStep(null);
          setPendingAutoTransition(null);
          setSelectedApprovalStatusCode("A");
          setApprovalComments("");
        }
      }}>
        <DialogContent className={cn("rounded-[1.5rem]", approvingStep === "Consultant Manager Approval" ? "max-w-lg" : "")}>
          <DialogHeader>
            <DialogTitle>{approvingStep === "Consultant Team Approval" ? "Confirm Receive" : "Confirm Approval"}</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm space-y-4">
            <p>{approvingStep === "Consultant Team Approval" ? "Are you sure you want to confirm?" : <>Are you sure you want to approve <strong>{approvingStep}</strong>?</>}</p>

            {approvingStep === "Consultant Manager Approval" && (
              <div className="space-y-4 border rounded-md p-4 bg-muted/30">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Comments (Optional)</label>
                  <Textarea
                    value={approvalComments}
                    onChange={(e) => setApprovalComments(e.target.value)}
                    placeholder="Add any comments about this approval decision..."
                    rows={3}
                    data-testid="input-approval-comments"
                  />
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    <strong>Note:</strong> Selecting "Conditionally Approved" or "Rejected" will stop the workflow.
                    The contractor will need to create a new revision to continue.
                  </p>
                </div>
              </div>
            )}

            <p className="text-muted-foreground">
              Upon approval, your name will be recorded as the authorizer for this step.
            </p>
            {pendingAutoTransition && !['C', 'E'].includes(selectedApprovalStatusCode) && (
              <p className="text-muted-foreground">
                This will also advance the workflow to the next step.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setApprovingStep(null);
              setPendingAutoTransition(null);
              setSelectedApprovalStatusCode("A");
              setApprovalComments("");
            }}>
              Cancel
            </Button>
            <Button onClick={confirmApproval} disabled={approveMutation.isPending}>
              {approvingStep === "Consultant Team Approval"
                ? (approveMutation.isPending ? "Receiving..." : "Receive")
                : (approveMutation.isPending ? "Approving..." : "Approve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLocationsDialog} onOpenChange={setShowLocationsDialog}>
        <DialogContent className="max-w-2xl rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Work Locations</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {revisionLocations.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No work locations assigned</p>
            ) : (
              <div className="border rounded-md">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left font-medium">Unit</th>
                      <th className="p-2 text-left font-medium">Zone</th>
                      <th className="p-2 text-left font-medium">Block</th>
                      <th className="p-2 text-left font-medium">Building</th>
                      <th className="p-2 text-left font-medium">Floor</th>
                      <th className="p-2 text-left font-medium">Part</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revisionLocations.map((loc) => (
                      <tr key={loc.id} className="border-b last:border-0">
                        <td className="p-2">{loc.unit || "—"}</td>
                        <td className="p-2">{loc.zone || "—"}</td>
                        <td className="p-2">{loc.block || "—"}</td>
                        <td className="p-2">{loc.building || "—"}</td>
                        <td className="p-2">{loc.floor || "—"}</td>
                        <td className="p-2">{loc.part || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowLocationsDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-6xl h-[95vh] rounded-[1.5rem] p-0 overflow-hidden border-none shadow-2xl flex flex-col bg-white dark:bg-background [&>button]:hidden">
          {/* Streamlined Premium Header */}
          <div className="flex items-center justify-between p-3 px-6 bg-card/50 backdrop-blur-md relative z-20 shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <File className="w-5 h-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-sm font-black uppercase tracking-tight truncate max-w-[300px] md:max-w-[500px]">
                  {previewDoc?.title || previewDoc?.fileName || "Document Preview"}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/50 px-2 py-0.5 rounded-full">
                    {previewDoc?.type || previewDoc?.mimeType || previewDoc?.fileType || "Document"}
                  </span>
                  {(previewDoc?.fileSize || (previewDoc as any)?.size) && (
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">
                      • {formatFileSize(previewDoc?.fileSize || (previewDoc as any)?.size)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {(previewDocDetail || (previewDoc && (previewDoc.fileUrl || previewDoc.fileData))) && (
                <Button variant="outline" size="sm" className="rounded-xl font-bold h-9 bg-background/50 border-primary/20 text-primary hover:bg-primary/5 hidden sm:flex" asChild>
                  <a href={(previewDocDetail?.fileUrl || previewDocDetail?.fileData) || (previewDoc?.fileUrl || previewDoc?.fileData)} target="_blank" rel="noopener noreferrer">
                    <Link2 className="w-4 h-4 mr-2" />
                    Open Original
                  </a>
                </Button>
              )}

              <button
                onClick={() => setPreviewDoc(null)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-muted/50 hover:bg-muted transition-all duration-300 text-muted-foreground hover:text-foreground group active:scale-90"
              >
                <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
              </button>
            </div>
          </div>

          {/* Maximized Preview Area */}
          <div className="flex-1 bg-muted/20 flex items-center justify-center overflow-hidden p-0">
            {(!previewDocDetail && !previewDoc?.fileUrl && !previewDoc?.fileData) ? (
              <div className="flex flex-col items-center gap-4">
                <LoadingIcon size={48} />
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Loading preview...</p>
              </div>
            ) : previewInfo?.isImage ? (
              <div className="w-full h-full flex items-center justify-center overflow-auto custom-scrollbar p-2">
                <img
                  src={previewInfo.doc.fileUrl || previewInfo.doc.fileData || ""}
                  alt={previewInfo.doc.title || previewInfo.doc.fileName || "Preview"}
                  className="max-w-full max-h-full object-contain shadow-2xl rounded-xl border border-border/50"
                />
              </div>
            ) : previewInfo?.isPDF ? (
              <iframe
                src={previewInfo.doc.fileUrl || previewInfo.doc.fileData || ""}
                className="w-full h-full border-none bg-white block"
                title={previewInfo.doc.title || previewInfo.doc.fileName || "PDF Preview"}
              />
            ) : (
              <div className="text-center p-10 bg-background/50 rounded-[1.5rem] border border-dashed border-muted-foreground/20">
                <File className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Preview not available for this format</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddRecommendationDialog} onOpenChange={setShowAddRecommendationDialog}>
        <DialogContent className="max-w-md rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Add Recommendation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search existing checklist items</label>
              <Input
                placeholder="Type at least 2 characters to search..."
                value={recommendationSearch}
                onChange={(e) => {
                  setRecommendationSearch(e.target.value);
                  setSelectedChecklistItemId(null);
                }}
                data-testid="input-recommendation-search"
              />
              {recommendationSearch.length >= 2 && searchedChecklistItems.length > 0 && (
                <ScrollArea className="h-40 border rounded-md">
                  <div className="p-2 space-y-1">
                    {searchedChecklistItems.map((item) => (
                      <div
                        key={item.id}
                        className={`p-2 rounded-md cursor-pointer text-sm hover-elevate ${selectedChecklistItemId === item.id
                          ? "bg-primary/10 border border-primary"
                          : "border border-transparent"
                          }`}
                        onClick={() => {
                          setSelectedChecklistItemId(item.id);
                          setCustomRecommendationText("");
                        }}
                        data-testid={`checklist-item-${item.id}`}
                      >
                        <div className="font-medium">{item.nameEnglish}</div>
                        <div className="text-xs text-muted-foreground">{item.code} - {item.category}</div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
              {recommendationSearch.length >= 2 && searchedChecklistItems.length === 0 && (
                <p className="text-sm text-muted-foreground">No items found</p>
              )}
            </div>
            <Separator />
            <div className="space-y-2">
              <label className="text-sm font-medium">Or write a custom recommendation</label>
              <Textarea
                placeholder="Enter custom recommendation text..."
                value={customRecommendationText}
                onChange={(e) => {
                  setCustomRecommendationText(e.target.value);
                  setSelectedChecklistItemId(null);
                }}
                rows={3}
                data-testid="input-custom-recommendation"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddRecommendationDialog(false);
                setRecommendationSearch("");
                setCustomRecommendationText("");
                setSelectedChecklistItemId(null);
              }}
              data-testid="btn-cancel-recommendation"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedChecklistItemId) {
                  addRecommendationMutation.mutate({ checklistItemId: selectedChecklistItemId });
                } else if (customRecommendationText.trim()) {
                  addRecommendationMutation.mutate({ customText: customRecommendationText.trim() });
                }
              }}
              disabled={
                addRecommendationMutation.isPending ||
                (!selectedChecklistItemId && !customRecommendationText.trim())
              }
              data-testid="btn-submit-recommendation"
            >
              {addRecommendationMutation.isPending ? "Adding..." : "Add Recommendation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingAttachmentId} onOpenChange={(open) => !open && setDeletingAttachmentId(null)}>
        <DialogContent className="rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Are you sure you want to delete this attachment? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setDeletingAttachmentId(null)}
                data-testid="button-cancel-delete-attachment"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deletingAttachmentId) {
                    deleteAttachmentMutation.mutate(deletingAttachmentId);
                    setDeletingAttachmentId(null);
                  }
                }}
                disabled={deleteAttachmentMutation.isPending}
                data-testid="button-confirm-delete-attachment"
              >
                {deleteAttachmentMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAttachmentUpload && !!selectedFile} onOpenChange={(open) => {
        if (!open) {
          setShowAttachmentUpload(false);
          setSelectedFile(null);
          setUploadAttachmentTitle("");
        }
      }}>
        <DialogContent className="rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Upload Image Attachment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Selected File</label>
              <p className="text-sm text-muted-foreground">{selectedFile?.name}</p>
            </div>
            <div>
              <label htmlFor="attachment-title" className="text-sm font-medium">Title</label>
              <Input
                id="attachment-title"
                placeholder="Enter a title for this attachment"
                value={uploadAttachmentTitle}
                onChange={(e) => setUploadAttachmentTitle(e.target.value)}
                data-testid="input-attachment-title"
              />
              <p className="text-xs text-muted-foreground mt-1">Leave blank to use the file name</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAttachmentUpload(false);
                setSelectedFile(null);
                setUploadAttachmentTitle("");
              }}
              data-testid="button-cancel-upload"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUploadWithTitle}
              disabled={uploadAttachmentMutation.isPending}
              data-testid="button-confirm-upload"
            >
              {uploadAttachmentMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDocumentUpload} onOpenChange={(open) => {
        if (!open) {
          setShowDocumentUpload(false);
          setSelectedDocumentFile(null);
          setUploadDocumentTitle("");
        }
      }}>
        <DialogContent className="rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Selected File</label>
              <p className="text-sm text-muted-foreground">{selectedDocumentFile?.name}</p>
            </div>
            <div>
              <label htmlFor="document-title" className="text-sm font-medium">Title</label>
              <Input
                id="document-title"
                placeholder="Enter a title for this document"
                value={uploadDocumentTitle}
                onChange={(e) => setUploadDocumentTitle(e.target.value)}
                data-testid="input-document-title"
              />
              <p className="text-xs text-muted-foreground mt-1">Leave blank to use the file name</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDocumentUpload(false);
                setSelectedDocumentFile(null);
                setUploadDocumentTitle("");
              }}
              data-testid="button-cancel-document-upload"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDocumentUploadWithTitle}
              disabled={uploadDocumentMutation.isPending}
              data-testid="button-confirm-document-upload"
            >
              {uploadDocumentMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingRecommendationId} onOpenChange={(open) => !open && setDeletingRecommendationId(null)}>
        <DialogContent className="rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Are you sure you want to delete this recommendation? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setDeletingRecommendationId(null)}
                data-testid="button-cancel-delete-recommendation"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deletingRecommendationId) {
                    deleteRecommendationMutation.mutate(deletingRecommendationId);
                    setDeletingRecommendationId(null);
                  }
                }}
                disabled={deleteRecommendationMutation.isPending}
                data-testid="button-confirm-delete-recommendation"
              >
                {deleteRecommendationMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingDocumentId} onOpenChange={(open) => !open && setDeletingDocumentId(null)}>
        <DialogContent className="rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Are you sure you want to delete this document? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setDeletingDocumentId(null)}
                data-testid="button-cancel-delete-document"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deletingDocumentId) {
                    deleteDocumentMutation.mutate(deletingDocumentId);
                  }
                }}
                disabled={deleteDocumentMutation.isPending}
                data-testid="button-confirm-delete-document"
              >
                {deleteDocumentMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>



      <Dialog open={!!pendingStatusChange} onOpenChange={(open) => !open && setPendingStatusChange(null)}>
        <DialogContent className="rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Confirm Status Change</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm">
            <p>Are you sure you want to set the approval status to:</p>
            <p className="font-semibold mt-2">
              {pendingStatusChange?.statusCode === "A" && "(A) Approved"}
              {pendingStatusChange?.statusCode === "B" && "(B) Approved As Noted"}
              {pendingStatusChange?.statusCode === "C" && "(C) Revise and Resubmit"}
              {pendingStatusChange?.statusCode === "D" && "(D) Rejected"}
              {pendingStatusChange?.statusCode === "E" && "(E) Close automatically"}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingStatusChange(null)} data-testid="button-cancel-status-change">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pendingStatusChange && currentRevision?.id) {
                  // Chain mutations sequentially to avoid race conditions
                  createApprovalStatusMutation.mutate({
                    revisionId: currentRevision.id,
                    statusCode: pendingStatusChange.statusCode,
                  }, {
                    onSuccess: () => {
                      updateConsultantReviewMutation.mutate({
                        id: pendingStatusChange.reviewId,
                        statusCode: pendingStatusChange.statusCode,
                        reviewedAt: new Date().toISOString(),
                      }, {
                        onSuccess: () => {
                          if (isAtStep(104)) {
                            const statusCode = pendingStatusChange.statusCode;
                            if (statusCode === "A" || statusCode === "B" || statusCode === "E") {
                              const transition = getTransitionForStep(105);
                              if (transition) {
                                moveMutation.mutate({
                                  toStepId: transition.toStepId,
                                  newStatus: transition.allowedStatus,
                                  remarks: `Status set to ${statusCode}`,
                                });
                              }
                            }
                            else if (statusCode === "C" || statusCode === "D") {
                              const transition = getTransitionForStep(101);
                              if (transition) {
                                moveMutation.mutate({
                                  toStepId: transition.toStepId,
                                  newStatus: transition.allowedStatus,
                                  remarks: `Status set to ${statusCode} - Returned for revision`,
                                });
                              }
                            }
                          }
                        }
                      });
                    }
                  });
                  setPendingStatusChange(null);
                }
              }}
              disabled={updateConsultantReviewMutation.isPending}
              data-testid="button-confirm-status-change"
            >
              {updateConsultantReviewMutation.isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {requestType?.code === "NCR" || requestType?.code === "RNCR" ? (
        <NcrFormDialog
          open={showWirForm}
          onOpenChange={setShowWirForm}
          requestNumber={request?.requestNumber || ""}
          referenceCode={request?.referenceCode || ""}
          requestTypeCode={requestType?.code}
          project={project}
          developer={developer}
          contractor={contractor}
          consultant={consultant}
          currentRevision={currentRevision}
          statusHistory={statusHistory}
          revisionDocuments={revisionDocuments}
          revisionLocations={revisionLocations}
          consultantReviews={consultantReviews}
          getUserName={getUserName}
          getUserSignature={getUserSignature}
          getUserPosition={getUserPosition}
          createdAt={request?.createdAt || ""}
          updatedAt={request?.updatedAt || ""}
          projectName={request?.projectName}
          contractorName={request?.contractorName}
          consultantName={request?.consultantName}
          revisionAttachments={consultantAttachments}
          parentNcrRevision={linkedNcrCurrentRevision}
        />
      ) : (
        <WirFormDialog
          open={showWirForm}
          onOpenChange={setShowWirForm}
          requestNumber={request?.requestNumber || ""}
          referenceCode={request?.referenceCode || ""}
          requestTypeCode={requestType?.code || "WIR"}
          project={project}
          developer={developer}
          contractor={contractor}
          consultant={consultant}
          currentRevision={currentRevision}
          statusHistory={statusHistory}
          revisionDocuments={revisionDocuments}
          revisionLocations={revisionLocations}
          checklistItems={isMAR ? marChecklistItems : isMIR ? allChecklistItems : isSSR ? ssrChecklistItems : (isDSR || isSD) ? [] : activityChecklistItems}
          checklistResponses={checklistResponses}
          consultantReviews={consultantReviews}
          workListActivity={
            workListActivity || ((currentRevision?.activityName || currentRevision?.activityCode) ? {
              code: currentRevision?.activityCode || undefined,
              nameEnglish: currentRevision?.activityName || undefined
            } : undefined)
          }
          division={
            division || (currentRevision?.divisionName ? {
              nameEnglish: currentRevision?.divisionName || undefined
            } : undefined)
          }
          workLevels={displayWorkLevels}
          revisionPurposes={revisionPurposes}
          getUserName={getUserName}
          getUserSignature={getUserSignature}
          getUserPosition={getUserPosition}
          createdAt={request?.createdAt || ""}
          updatedAt={request?.updatedAt || ""}
          projectName={request?.projectName}
          contractorName={request?.contractorName}
          consultantName={request?.consultantName}
          revisionAttachments={consultantAttachments}
          revisionDeliveries={revisionDeliveries}
          revisionSuppliers={revisionSuppliers}
          revisionMaterials={revisionMaterials}
        />
      )}

      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-primary" />
              بيانات جديدة متوفرة
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            تم تحديث بيانات الطلب من قبل مستخدم آخر. يرجى الضغط على زر التحديث لعرض آخر التغييرات.
          </div>
          <DialogFooter>
            <Button
              onClick={handleRefresh}
              className="w-full"
              data-testid="button-modal-refresh"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              تحديث البيانات الآن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditRequestDetails} onOpenChange={setShowEditRequestDetails}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Edit Request Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className={cn("grid grid-cols-1 gap-4", (requestType?.code === "MIR" || isSSR || isMAR || isDSR || isSD || isNcrFamily) ? "md:grid-cols-2" : "md:grid-cols-3")}>
                  <div className="space-y-2">
                    <Label>Division</Label>
                    <Select value={editSelectedDivisionId} onValueChange={handleEditDivisionChange}>
                      <SelectTrigger data-testid="select-edit-division" className="rounded-[1.5rem] border-primary/30 focus:border-primary focus:ring-primary bg-transparent">
                        <SelectValue placeholder="Select division" />
                      </SelectTrigger>
                      <SelectContent>
                        {divisions.map((div) => (
                          <SelectItem key={div.id} value={div.id}>
                            {div.code} - {div.nameEnglish}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Chapter</Label>
                    <Select
                      value={editSelectedChapterId}
                      onValueChange={handleEditChapterChange}
                      disabled={!editSelectedDivisionId}
                    >
                      <SelectTrigger data-testid="select-edit-chapter" className="rounded-[1.5rem] border-primary/30 focus:border-primary focus:ring-primary bg-transparent">
                        <SelectValue placeholder="Select chapter" />
                      </SelectTrigger>
                      <SelectContent>
                        {editFilteredChapters.map((ch) => (
                          <SelectItem key={ch.id} value={ch.id}>
                            {ch.code} - {ch.nameEnglish}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

              {requestType?.code !== "MIR" && !isSSR && !isMAR && !isDSR && !isSD && !isNcrFamily && (
                <div className="space-y-2">
                  <Label>Activity</Label>
                  <Select
                    value={editSelectedActivityId}
                    onValueChange={setEditSelectedActivityId}
                    disabled={!editSelectedChapterId}
                  >
                    <SelectTrigger data-testid="select-edit-activity" className="rounded-[1.5rem] border-primary/30 focus:border-primary focus:ring-primary bg-transparent">
                      <SelectValue placeholder="Select activity" />
                    </SelectTrigger>
                    <SelectContent>
                      {editFilteredActivities.map((act) => (
                        <SelectItem key={act.id} value={act.id}>
                          {act.code} - {act.nameEnglish}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(isNCR || isRNCR) && (
                <div className="col-span-full mb-2">
                  <Card className="shadow-sm border-border/50 bg-white dark:bg-card overflow-hidden rounded-2xl group">
                    <CardContent className="p-0">
                      <div className="px-5 py-3 border-b border-border/40 flex items-center gap-3 bg-primary/[0.02]">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary transition-transform duration-500 group-hover:rotate-12">
                          <Target className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="font-bold text-base tracking-tight">{isRNCR ? "RNCR Details" : "NCR Details"}</h3>
                          {!isRNCR && <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Select NCR type and source</p>}
                        </div>
                      </div>
                      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/5">
                        {!isRNCR && (
                          <>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            <Label className="text-sm font-bold text-foreground/80">NCR Type</Label>
                          </div>
                          <Select value={editNcrType} onValueChange={setEditNcrType}>
                            <SelectTrigger className="w-full bg-white dark:bg-background border-border/50 focus:ring-primary/20 transition-all rounded-xl shadow-sm">
                              <SelectValue placeholder="Select NCR Type" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="Major" className="rounded-lg">
                                <span className="font-semibold text-destructive">Major</span>
                              </SelectItem>
                              <SelectItem value="Minor" className="rounded-lg">
                                <span className="font-medium text-amber-600">Minor</span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4 text-blue-500" />
                            <Label className="text-sm font-bold text-foreground/80">Source of Non-Conformance</Label>
                          </div>
                          <Select value={editNcrSource} onValueChange={setEditNcrSource}>
                            <SelectTrigger className="w-full bg-white dark:bg-background border-border/50 focus:ring-primary/20 transition-all rounded-xl shadow-sm">
                              <SelectValue placeholder="Select Source" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="Inspection" className="rounded-lg">Inspection</SelectItem>
                              <SelectItem value="Audit" className="rounded-lg">Audit</SelectItem>
                              <SelectItem value="Other" className="rounded-lg">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                          </>
                        )}
                        
                        {isRNCR && (
                          <div className="col-span-full flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <Target className="w-4 h-4 text-primary" />
                              <Label className="text-sm font-bold text-foreground/80">Reference NCR</Label>
                            </div>
                            <div className="w-full bg-muted/40 border border-border/50 px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground flex items-center gap-2">
                              <Link2 className="w-4 h-4 text-blue-500" />
                              {ncrRequests.find((n) => String(n.id) === String(editSelectedLinkedNcrId))?.requestNumber || editSelectedLinkedNcrId || "—"}
                            </div>
                          </div>
                        )}

                        {!isRNCR && (
                          <div className="col-span-full mt-2 flex flex-col gap-2">
                            <Label className="text-sm font-semibold text-foreground">Subject</Label>
                            <Input
                              value={editNcrSubject}
                              onChange={(e: any) => setEditNcrSubject(e.target.value)}
                              placeholder="Enter NCR subject..."
                              className="bg-white dark:bg-background border-border/50 focus:ring-primary/20 transition-all rounded-xl shadow-sm"
                              dir="auto"
                            />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {isSI && (
                <div className="col-span-full mb-2">
                  <Card className="shadow-sm border-border/50 bg-white dark:bg-card overflow-hidden rounded-2xl group">
                    <CardContent className="p-0">
                      <div className="px-5 py-3 border-b border-border/40 flex items-center gap-3 bg-primary/[0.02]">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary transition-transform duration-500 group-hover:rotate-12">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="font-bold text-base tracking-tight">Site Instruction Details</h3>
                        </div>
                      </div>
                      <div className="p-5 flex flex-col gap-4 bg-muted/5">
                        <div className="flex flex-col gap-2">
                          <Label className="text-sm font-semibold text-foreground">Subject</Label>
                          <Input
                            value={editNcrSubject}
                            onChange={(e: any) => setEditNcrSubject(e.target.value)}
                            placeholder="Enter Subject..."
                            className="bg-white dark:bg-background border-border/50 focus:ring-primary/20 transition-all rounded-xl shadow-sm"
                            dir="auto"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {!isMIR && !isSSR && !isMAR && !isDSR && !isNcrFamily && (
                <div className="space-y-2">
                  <Label>Work Levels</Label>
                  <div className="flex flex-wrap gap-2 mb-2 p-3 border rounded-md bg-muted/20 min-h-[40px]">
                    {editSelectedWorkLevels.length === 0 ? (
                      <span className="text-sm text-muted-foreground italic">No levels selected</span>
                    ) : (
                      editSelectedWorkLevels.map(level => (
                        <Badge key={level.id} variant="secondary" className="gap-1 pl-2 pr-1 py-1">
                          {level.code}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 rounded-full p-0 hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => setEditSelectedWorkLevels(editSelectedWorkLevels.filter(l => l.id !== level.id))}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))
                    )}
                  </div>
                  <Select
                    value=""
                    onValueChange={(val) => {
                      const level = allWorkLevels.find(l => l.id === val);
                      if (level && !editSelectedWorkLevels.find(l => l.id === val)) {
                        setEditSelectedWorkLevels([...editSelectedWorkLevels, {
                          id: level.id,
                          code: level.code,
                          title: level.nameEnglish,
                        }]);
                      }
                    }}
                  >
                    <SelectTrigger data-testid="select-edit-work-level">
                      <SelectValue placeholder="Add work level..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allWorkLevels.map((level: WorkLevel) => (
                        <SelectItem key={level.id} value={level.id} disabled={editSelectedWorkLevels.some(l => l.id === level.id)}>
                          {level.code} - {level.nameEnglish}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Purpose</Label>
                <Select value={editSelectedPurposeId} onValueChange={setEditSelectedPurposeId}>
                  <SelectTrigger data-testid="select-edit-purpose" className="rounded-[1.5rem] border-primary/30 focus:border-primary focus:ring-primary bg-transparent">
                    <SelectValue placeholder="Select purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredPurposes.map((purpose) => (
                      <SelectItem key={purpose.id} value={purpose.id}>
                        {purpose.code} - {purpose.nameEnglish}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Actual Date</Label>
                <Input
                  type="date"
                  value={editScheduledDate}
                  onChange={(e) => setEditScheduledDate(e.target.value)}
                  className="w-full rounded-[1.5rem] border-primary/30 focus:border-primary focus:ring-primary bg-transparent"
                  data-testid="input-edit-actual-date"
                />
              </div>
            </div>

            {!isMIR && !isSSR && !isMAR && !isDSR && !isNcrFamily && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <Label>Work Locations</Label>
                  </div>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Zone</TableHead>
                        <TableHead>Block</TableHead>
                        <TableHead>Building</TableHead>
                        <TableHead>Floor</TableHead>
                        <TableHead>Part</TableHead>
                        <TableHead className="w-16">
                          <div className="flex items-center justify-end">
                            Actions
                            <Button
                              size="icon"
                              className="ml-2 rounded-full h-7 w-7"
                              onClick={() => setEditAddLocationOpen(true)}
                              data-testid="button-edit-add-location"
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editSelectedLocations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            No locations added
                          </TableCell>
                        </TableRow>
                      ) : (
                        [...editSelectedLocations]
                          .sort((a, b) => {
                            // Compare Unit FIRST
                            const unitA = a.unit || "";
                            const unitB = b.unit || "";
                            const unitDiff = unitA.localeCompare(unitB, undefined, { numeric: true, sensitivity: 'base' });
                            if (unitDiff !== 0) return unitDiff;

                            const buildingA = a.building || "";
                            const buildingB = b.building || "";
                            const buildingDiff = buildingA.localeCompare(buildingB, undefined, { numeric: true, sensitivity: 'base' });
                            if (buildingDiff !== 0) return buildingDiff;

                            const floorA = a.floor || "";
                            const floorB = b.floor || "";
                            const floorDiff = floorA.localeCompare(floorB, undefined, { numeric: true, sensitivity: 'base' });
                            if (floorDiff !== 0) return floorDiff;

                            const partA = a.part || "";
                            const partB = b.part || "";
                            return partA.localeCompare(partB, undefined, { numeric: true, sensitivity: 'base' });
                          })
                          .map((loc, index) => (
                            <TableRow key={loc.id}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>{loc.unit}</TableCell>
                              <TableCell>{loc.zone}</TableCell>
                              <TableCell>{loc.block}</TableCell>
                              <TableCell>{loc.building}</TableCell>
                              <TableCell>{loc.floor}</TableCell>
                              <TableCell>{loc.part}</TableCell>
                              <TableCell>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleEditRemoveLocation(loc.id)}
                                  data-testid={`button-edit-remove-location-${index}`}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {isMIR && (
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-primary" />
                    <Label className="text-lg font-bold">Associated Deliveries</Label>
                  </div>
                  <Button
                    onClick={() => setEditAddDeliveryOpen(true)}
                    size="sm"
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Delivery
                  </Button>
                </div>

                <div className="border rounded-xl overflow-hidden bg-muted/5">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 border-none hover:bg-muted/30">
                        <TableHead className="w-10 text-center font-bold">#</TableHead>
                        <TableHead className="font-bold">Delivery No</TableHead>
                        <TableHead className="font-bold">Invoice No</TableHead>
                        <TableHead className="font-bold">Material</TableHead>
                        <TableHead className="font-bold">Supplier</TableHead>
                        <TableHead className="w-16 text-right font-bold pr-6">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editSelectedDeliveries.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <Truck className="w-8 h-8 opacity-20" />
                              <p>No deliveries selected</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        editSelectedDeliveries.map((delivery, index) => (
                          <TableRow key={delivery.id}>
                            <TableCell className="text-center">{index + 1}</TableCell>
                            <TableCell className="font-medium">{delivery.shipmentNumber}</TableCell>
                            <TableCell>{delivery.deliveryInvoiceNumber || "---"}</TableCell>
                            <TableCell>{delivery.materialName}</TableCell>
                            <TableCell>{delivery.supplier}</TableCell>
                            <TableCell className="text-right pr-6">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                onClick={() => handleEditRemoveDelivery(delivery.id)}
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
            )}

            {isMAR && (
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <Label className="text-lg font-bold">Selected Materials</Label>
                  </div>
                  <Button
                    onClick={() => setEditAddMaterialOpen(true)}
                    size="sm"
                    className="gap-2 rounded-[1.5rem]"
                  >
                    <Plus className="w-4 h-4" />
                    Add Material
                  </Button>
                </div>

                <div className="bg-muted/5 p-4 rounded-xl border border-border/40">
                  <div className="w-full">
                    {editSelectedMaterials.length === 0 ? (
                      <div className="flex flex-col items-center gap-4 max-w-[280px] mx-auto py-12">
                        <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mb-2">
                          <Layers className="w-10 h-10 text-muted-foreground/30" />
                        </div>
                        <h4 className="font-semibold text-foreground/80">No Materials Selected</h4>
                        <p className="text-sm text-muted-foreground text-center">Please add at least one material for this request.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {editSelectedMaterials.map((material, index) => {
                          const imageUrl = material.imageUrl ? (material.imageUrl.startsWith('http') || material.imageUrl.startsWith('/') ? material.imageUrl : `/${material.imageUrl}`) : null;
                          return (
                            <div key={material.id} className="bg-white dark:bg-card border border-border/40 rounded-[1.25rem] p-4 shadow-sm relative group transition-all duration-300 hover:shadow-md hover:border-primary/20 flex flex-col gap-4">
                              <div className="flex items-start justify-between w-full">
                                <div className="flex gap-4 flex-1 min-w-0">
                                  <div className="w-14 h-14 rounded-[1rem] bg-muted/20 overflow-hidden shrink-0 border border-border/50 flex items-center justify-center relative shadow-sm group-hover:shadow-md transition-all group-hover:border-primary/20">
                                    {imageUrl ? (
                                      <img
                                        src={imageUrl}
                                        alt={material.materialName || "Material Image"}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        onError={(e) => {
                                          (e.target as any).style.display = "none";
                                          (e.target as any).nextSibling.style.display = "flex";
                                        }}
                                      />
                                    ) : null}
                                    <div
                                      className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 text-primary/70 transition-colors group-hover:text-primary"
                                      style={{ display: imageUrl ? "none" : "flex" }}
                                    >
                                      <Package className="w-6 h-6" />
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-1.5 flex-1 min-w-0 justify-center">
                                    <h4 className="font-bold text-base text-foreground/90 truncate pr-2 group-hover:text-primary transition-colors">{material.materialName || "Unknown"}</h4>
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
                                    onClick={() => setEditSelectedMaterials(prev => prev.filter(m => m.id !== material.id))}
                                    title="Remove from request"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>

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
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Linked Suppliers for MAR in Edit Dialog */}
            {isMAR && editSelectedMaterials.length > 0 && (
              <div className="bg-white dark:bg-card border border-border/40 overflow-hidden rounded-3xl transition-all duration-500 shadow-sm mt-6 hidden has-[.supplier-item]:block">
                <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between bg-primary/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary transition-transform duration-500 hover:rotate-12">
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
                    {editSelectedMaterials.map((material) => (
                      <MaterialLinkedSuppliers
                        key={material.id}
                        materialId={material.id}
                        materialName={material.materialName}
                        onEditSupplier={(supplier) => {
                          setSupplierToEdit(supplier as any);
                          setCreateSupplierOpen(true);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {isSSR && (
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    <Label className="text-lg font-bold">Selected Suppliers</Label>
                  </div>
                  <Button
                    onClick={() => setEditAddSupplierOpen(true)}
                    size="sm"
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Supplier
                  </Button>
                </div>

                <div className="bg-muted/5 p-4 rounded-xl border border-border/40">
                  {editSelectedSuppliers.length === 0 ? (
                    <div className="flex flex-col items-center gap-4 max-w-[280px] mx-auto py-12">
                      <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mb-2">
                        <Building2 className="w-10 h-10 text-muted-foreground/30" />
                      </div>
                      <h4 className="font-semibold text-foreground/80">No Suppliers Selected</h4>
                      <p className="text-sm text-muted-foreground text-center">Please add at least one supplier for this request.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {editSelectedSuppliers.map((supplier, index) => (
                        <SupplierCardWithAttachments
                          key={supplier.id}
                          index={index}
                          rs={supplier}
                          onPreviewDoc={(doc) => setPreviewDoc(doc)}
                          onRemove={() => setEditSelectedSuppliers(prev => prev.filter(s => s.id !== supplier.id))}
                          onEdit={() => {
                            setSupplierToEdit(supplier as unknown as Supplier);
                            setCreateSupplierOpen(true);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {(isDSR || isSD) && (
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-primary" />
                    <Label className="text-lg font-bold">Documents / Attachments</Label>
                  </div>
                  <Button
                    onClick={() => setIsEditStorageModalOpen(true)}
                    size="sm"
                    className="gap-2 rounded-[1.5rem]"
                  >
                    <Database className="w-4 h-4" />
                    Add from Storage
                  </Button>
                </div>

                <div className="border rounded-xl overflow-hidden bg-muted/5">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 border-none hover:bg-muted/30">
                        <TableHead className="w-10 text-center font-bold">#</TableHead>
                        {isSD && <TableHead className="font-bold">Doc ID</TableHead>}
                        <TableHead className="font-bold">Title</TableHead>
                        <TableHead className="font-bold">Doc Type</TableHead>
                        <TableHead className="font-bold">File</TableHead>
                        <TableHead className="w-16 text-right font-bold pr-6">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editSelectedDocuments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={isSD ? 6 : 5} className="text-center py-12">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <Paperclip className="w-8 h-8 opacity-20" />
                              <p>No documents selected</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        editSelectedDocuments.map((doc, index) => (
                          <TableRow key={doc.id}>
                            <TableCell className="text-center">{index + 1}</TableCell>
                            {isSD && (
                              <TableCell>
                                <Input
                                  placeholder="Enter document ID"
                                  value={doc.documentRef || ""}
                                  onChange={(e) => {
                                    const updated = [...editSelectedDocuments];
                                    updated[index].documentRef = e.target.value;
                                    setEditSelectedDocuments(updated);
                                  }}
                                  className="bg-transparent border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary/30 h-8 font-medium"
                                />
                              </TableCell>
                            )}
                            <TableCell>
                              <Input
                                placeholder="Enter document title"
                                value={doc.title || ""}
                                onChange={(e) => {
                                  const updated = [...editSelectedDocuments];
                                  updated[index].title = e.target.value;
                                  setEditSelectedDocuments(updated);
                                }}
                                className="bg-transparent border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary/30 h-8 font-medium"
                              />
                            </TableCell>
                            <TableCell>
                              {isSD ? (
                                <span className="text-sm font-medium text-muted-foreground px-3">{doc.documentType || "Drawing"}</span>
                              ) : (
                                <Select
                                  value={doc.documentType || ""}
                                  onValueChange={(value) => {
                                    const updated = [...editSelectedDocuments];
                                    updated[index].documentType = value;
                                    setEditSelectedDocuments(updated);
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
                            <TableCell>
                              <div className="flex items-center gap-1.5 bg-primary/5 p-1 rounded-lg border border-primary/10 text-xs font-medium max-w-[150px] truncate" title={doc.fileName}>
                                <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                                <span className="truncate">{doc.fileName}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right pr-6">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setEditSelectedDocuments(prev => prev.filter(d => d.id !== doc.id))}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowEditRequestDetails(false)}
              className="rounded-[1.5rem] border-primary/30 text-muted-foreground hover:bg-primary/5 hover:text-foreground"
              data-testid="button-cancel-edit-details"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveRequestDetails}
              disabled={(!editSelectedActivityId && !isMIR && !isSSR && !isMAR && !isDSR && !isSD && !isNcrFamily) || (!isMIR && !isSSR && !isMAR && !isDSR && !isNcrFamily && editSelectedWorkLevels.length === 0) || (isMIR && editSelectedDeliveries.length === 0) || (isSSR && editSelectedSuppliers.length === 0) || (isMAR && editSelectedMaterials.length === 0) || isSavingDetails}
              className="rounded-[1.5rem]"
              data-testid="button-save-edit-details"
            >
              {isSavingDetails ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editAddDeliveryOpen} onOpenChange={setEditAddDeliveryOpen}>
        <DialogContent className="max-w-2xl rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Add Deliveries</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Search Deliveries</Label>
              <Command className="border rounded-md" shouldFilter={false}>
                <CommandInput
                  placeholder="Search delivery number, supplier, material..."
                  value={editDeliverySearch}
                  onValueChange={setEditDeliverySearch}
                />
                <CommandList className="max-h-[300px]">
                  <CommandEmpty>No deliveries found.</CommandEmpty>
                  <CommandGroup>
                    {projectDeliveries
                      .filter((d: any) => {
                        const search = editDeliverySearch.toLowerCase();
                        const matchesSearch = !search ||
                          d.shipmentNumber.toLowerCase().includes(search) ||
                          d.supplier.toLowerCase().includes(search) ||
                          (d.items || []).some((i: any) => i.materialName.toLowerCase().includes(search));

                        const notSelected = !editSelectedDeliveries.some(s => s.id === d.id);

                        // Check if the delivery is already linked to ANOTHER request
                        // Allow if it's not linked to anything, or if it's linked to the CURRENT request
                        const isAvailableOrAlreadyLinkedToThis = !d.linkedRequests ||
                          d.linkedRequests.length === 0 ||
                          d.linkedRequests.some((lr: any) => lr.requestId === requestId);

                        return matchesSearch && notSelected && isAvailableOrAlreadyLinkedToThis;
                      })
                      .map((delivery: any) => (
                        <CommandItem
                          key={delivery.id}
                          onSelect={() => handleEditAddDeliveryById(delivery.id)}
                          className="cursor-pointer"
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="flex flex-col">
                              <span className="font-bold">{delivery.shipmentNumber}</span>
                              <span className="text-xs text-muted-foreground">
                                {delivery.supplier} - {(delivery.items || []).map((i: any) => i.materialName).join(", ")}
                              </span>
                            </div>
                            <Plus className="h-4 w-4 opacity-50" />
                          </div>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
              {editSelectedDeliveries.map((delivery) => (
                <Badge key={delivery.id} variant="secondary" className="gap-1 pr-1">
                  {delivery.shipmentNumber}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 rounded-full p-0 hover:bg-muted"
                    onClick={() => handleEditRemoveDelivery(delivery.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>
          <DialogFooter className="pt-4 mt-2">
            <Button variant="default" onClick={() => setEditAddDeliveryOpen(false)} className="w-full">
              Done ({editSelectedDeliveries.length} selected)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editAddSupplierOpen} onOpenChange={setEditAddSupplierOpen}>
        <DialogContent className="max-w-2xl rounded-[1.5rem]">
          <DialogHeader>
            <div className="flex items-center justify-between w-full pr-6">
              <DialogTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                Add Suppliers
              </DialogTitle>
              <Button
                onClick={() => {
                  setEditAddSupplierOpen(false);
                  setTimeout(() => {
                    setSupplierToEdit(null);
                    setCreateSupplierOpen(true);
                  }, 150);
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
            <div className="space-y-2">
              <Label>Search Suppliers</Label>
              <Command className="border rounded-md" shouldFilter={false}>
                <CommandInput
                  placeholder="Search supplier name, category..."
                  value={editSupplierSearch}
                  onValueChange={setEditSupplierSearch}
                />
                <CommandList className="max-h-[300px]">
                  <CommandEmpty>No suppliers found.</CommandEmpty>
                  <CommandGroup>
                    {projectSuppliers
                      ?.filter((s: any) => {
                        const search = editSupplierSearch.toLowerCase();
                        const matchesSearch = !search ||
                          s.supplierName.toLowerCase().includes(search) ||
                          (s.category && s.category.toLowerCase().includes(search));

                        const isAssignedGlobally = assignedSupplierIds.includes(s.id);
                        const notSelected = !editSelectedSuppliers.some(es => es.id === s.id);
                        return matchesSearch && notSelected && !isAssignedGlobally;
                      })
                      .map((supplier: any) => (
                        <CommandItem
                          key={supplier.id}
                          onSelect={() => {
                            if (!editSelectedSuppliers.some(s => s.id === supplier.id)) {
                              setEditSelectedSuppliers([...editSelectedSuppliers, {
                                id: supplier.id,
                                name: supplier.supplierName,
                                supplierName: supplier.supplierName,
                                category: supplier.category,
                                email: supplier.email,
                                phone: supplier.phone,
                                contactPerson: supplier.contactPerson,
                                experienceYears: supplier.experienceYears,
                                address: supplier.address,
                                taxNumber: supplier.taxNumber,
                                logoUrl: supplier.logoUrl
                              }]);
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="flex flex-col">
                              <span className="font-bold">{supplier.supplierName}</span>
                              <span className="text-xs text-muted-foreground">
                                {supplier.category || "General"} {supplier.email ? `- ${supplier.email}` : ""}
                              </span>
                            </div>
                            <Plus className="h-4 w-4 opacity-50" />
                          </div>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
              {editSelectedSuppliers.map((supplier) => (
                <Badge key={supplier.id} variant="secondary" className="gap-1 pr-1">
                  {supplier.name}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 rounded-full p-0 hover:bg-muted"
                    onClick={() => setEditSelectedSuppliers(prev => prev.filter(s => s.id !== supplier.id))}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>
          <DialogFooter className="pt-4 mt-2">
            <Button variant="default" onClick={() => setEditAddSupplierOpen(false)} className="w-full">
              Done ({editSelectedSuppliers.length} selected)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editAddMaterialOpen} onOpenChange={setEditAddMaterialOpen}>
        <DialogContent className="max-w-2xl rounded-[1.5rem]">
          <DialogHeader>
            <div className="flex items-center justify-between w-full pr-6">
              <DialogTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" />
                Add Materials
              </DialogTitle>
              <Button
                onClick={() => {
                  setEditAddMaterialOpen(false);
                  setTimeout(() => {
                    setMaterialToEdit(null);
                    setCreateMaterialOpen(true);
                  }, 150);
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
            <div className="space-y-2">
              <Label>Search Materials</Label>
              <Command className="border rounded-md" shouldFilter={false}>
                <CommandInput
                  placeholder="Search material name, category..."
                  value={editMaterialSearch}
                  onValueChange={setEditMaterialSearch}
                />
                <CommandList className="max-h-[300px]">
                  <CommandEmpty>No materials found.</CommandEmpty>
                  <CommandGroup>
                    {projectMaterials
                      ?.filter((m: any) => {
                        const search = editMaterialSearch.toLowerCase();
                        return !search ||
                          m.materialName.toLowerCase().includes(search) ||
                          (m.category && m.category.toLowerCase().includes(search));
                      })
                      .map((material: any) => {
                        const isAssigned = assignedMaterialIds.includes(material.id);
                        return (
                          <CommandItem
                            key={material.id}
                            value={`${material.materialName} ${material.category}`}
                            onSelect={() => {
                              if (!isAssigned) {
                                if (!editSelectedMaterials.some(m => m.id === material.id)) {
                                  setEditSelectedMaterials([...editSelectedMaterials, {
                                    id: material.id,
                                    materialName: material.materialName,
                                    category: material.category,
                                    unit: material.unit,
                                    materialCode: material.materialCode,
                                    originCountry: material.originCountry,
                                    imageUrl: material.imageUrl || null
                                  }]);
                                }
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
                                    {material.category || "General"}
                                  </Badge>
                                  {material.originCountry && (
                                    <span className="text-[10px] text-muted-foreground">Origin: {material.originCountry}</span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">Unit: {material.unit}</span>
                                </div>
                              </div>
                              {!isAssigned && (
                                editSelectedMaterials.some(m => m.id === material.id) ? (
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
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
              {editSelectedMaterials.map((material) => (
                <Badge key={material.id} variant="secondary" className="gap-1 pr-1 shadow-sm bg-primary/5 text-primary border-primary/10">
                  {material.materialName}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 rounded-full p-0 hover:bg-primary/10"
                    onClick={() => setEditSelectedMaterials(prev => prev.filter(m => m.id !== material.id))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>
          <DialogFooter className="pt-4 mt-2">
            <Button variant="default" onClick={() => setEditAddMaterialOpen(false)} className="w-full shadow-md">
              Done ({editSelectedMaterials.length} selected)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editAddLocationOpen} onOpenChange={setEditAddLocationOpen}>
        <DialogContent className="max-w-2xl rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Add Work Locations</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Building</Label>
                <Select value={editBuildingFilter} onValueChange={setEditBuildingFilter}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-buildings">All Buildings</SelectItem>
                    {editBuildings.map(b => <SelectItem key={b} value={b || ""}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Floor</Label>
                <Select value={editFloorFilter} onValueChange={setEditFloorFilter}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-floors">All Floors</SelectItem>
                    {editFloors.map(f => <SelectItem key={f} value={f || ""}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Part</Label>
                <Select value={editPartFilter} onValueChange={setEditPartFilter}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-parts">All Parts</SelectItem>
                    {editParts.map(p => <SelectItem key={p} value={p || ""}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Search & Select Locations</Label>
                <div className="flex gap-1">
                  {editFilteredWorkLocations.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleEditSelectAllFiltered}
                    >
                      Select All ({editFilteredWorkLocations.length})
                    </Button>
                  )}
                  {editSelectedLocations.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={handleEditDeselectAll}
                    >
                      Deselect All
                    </Button>
                  )}
                </div>
              </div>
              <Command className="border rounded-md" shouldFilter={false}>
                <CommandInput
                  placeholder="Search unit, zone, block..."
                  value={editLocationSearch}
                  onValueChange={setEditLocationSearch}
                />
                <CommandList className="max-h-[300px]">
                  <CommandEmpty>No locations found.</CommandEmpty>
                  <CommandGroup>
                    {editFilteredWorkLocations.map((location: WorkLocation) => (
                      <CommandItem
                        key={location.id}
                        value={`${location.unitCustomNumber} ${location.unitZone} ${location.unitBlock} ${location.buildingNo} ${location.floor} ${location.part}`}
                        onSelect={() => handleEditAddLocationById(location.id)}
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
              {editSelectedLocations.map((loc) => (
                <Badge key={loc.id} variant="secondary" className="gap-1 pr-1">
                  {loc.unit || loc.building}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 rounded-full p-0 hover:bg-muted"
                    onClick={() => handleEditRemoveLocation(loc.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>
          <DialogFooter className="pt-4 mt-2">
            <Button variant="default" onClick={() => setEditAddLocationOpen(false)} className="w-full">
              Done ({editSelectedLocations.length} selected)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeliveryOverviewDialog
        isOpen={!!selectedDeliveryDetail}
        onOpenChange={(open) => !open && setSelectedDeliveryDetail(null)}
        delivery={selectedDeliveryDetail}
        onPreviewAttachment={(attachment) => {
          setPreviewDeliveryAttachment(attachment);
        }}
      />

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
              Please complete the missing fields before saving the request details.
              <br />
              <span className="opacity-70 mt-1 block">يرجى إكمال الحقول المفقودة قبل حفظ تفاصيل الطلب.</span>
            </p>

            <div className="flex flex-col gap-2 mt-2">
              <Button
                variant="outline"
                className="h-12 rounded-xl font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border-slate-200"
                onClick={() => setShowValidationDialog(false)}
              >
                Close and Complete (إغلاق وإكمال الحقل)
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {request?.projectId && (
        <SupplierFormDialog
          isOpen={createSupplierOpen}
          onOpenChange={(open) => {
            setCreateSupplierOpen(open);
            if (!open) setSupplierToEdit(null);
          }}
          projectId={request.projectId}
          supplier={supplierToEdit}
          onSuccess={(updatedSupplier) => {
            if (!supplierToEdit) {
              if (materialToLinkSupplier) {
                setLinkSupplierOpen(true);
              } else if (isSSR) {
                setEditAddSupplierOpen(true);
              }
            }
            setEditSelectedSuppliers(prev => prev.map(s =>
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
      {request?.projectId && (
        <MaterialFormDialog
          isOpen={createMaterialOpen}
          onOpenChange={(open) => {
            setCreateMaterialOpen(open);
            if (!open) setMaterialToEdit(null);
          }}
          projectId={request.projectId}
          material={materialToEdit}
          onSuccess={(updatedMaterial) => {
            if (!materialToEdit) {
              setEditAddMaterialOpen(true);
            }
            setEditSelectedMaterials(prev => prev.map(m =>
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
      {request?.projectId && (
        <LinkSupplierDialog
          isOpen={linkSupplierOpen}
          onOpenChange={(open) => {
            setLinkSupplierOpen(open);
          }}
          projectId={request.projectId}
          materialId={materialToLinkSupplier?.id || ""}
          availableSuppliers={projectSuppliers}
          alreadyLinkedIds={linkedSuppliersForMaterial.map((l: any) => l.supplierId)}
        />
      )}
      {/* Delivery Attachment Preview Dialog */}
      <Dialog open={!!previewDeliveryAttachment} onOpenChange={(open) => !open && setPreviewDeliveryAttachment(null)}>
        <DialogContent className="max-w-6xl h-[95vh] rounded-[1.5rem] p-0 overflow-hidden border-none shadow-2xl flex flex-col bg-white dark:bg-background [&>button]:hidden">
          {/* Streamlined Premium Header */}
          <div className="flex items-center justify-between p-3 px-6 bg-card/50 backdrop-blur-md relative z-20 shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <File className="w-5 h-5 text-primary" />
              </div>
              <div className="flex flex-col text-left">
                <h3 className="text-sm font-black uppercase tracking-tight truncate max-w-[300px] md:max-w-[500px]">
                  {previewDeliveryAttachment?.fileName || previewDeliveryAttachment?.name || "Delivery Attachment"}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/50 px-2 py-0.5 rounded-full">
                    {previewDeliveryAttachment?.type || "Document"}
                  </span>
                  {previewDeliveryAttachment && (
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">
                      • {formatFileSize(previewDeliveryAttachment?.size || (previewDeliveryAttachment as any)?.fileSize || 0)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="rounded-xl font-bold h-9 bg-background/50 border-primary/20 text-primary hover:bg-primary/5 hidden sm:flex" asChild>
                <a href={getFileUrl(previewDeliveryAttachment?.fileUrl || (previewDeliveryAttachment as any)?.fileData || (previewDeliveryAttachment as any)?.file_data)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Original
                </a>
              </Button>

              <button
                onClick={() => setPreviewDeliveryAttachment(null)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-muted/50 hover:bg-muted transition-all duration-300 text-muted-foreground hover:text-foreground group active:scale-90"
              >
                <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
              </button>
            </div>
          </div>

          {/* Maximized Preview Area */}
          <div className="flex-1 bg-muted/20 flex items-center justify-center overflow-hidden p-0">
            {previewDeliveryAttachment ? (
              (() => {
                const url = (previewDeliveryAttachment as any)?.fileData || previewDeliveryAttachment?.fileUrl || (previewDeliveryAttachment as any)?.file_data || "";
                const type = previewDeliveryAttachment?.type?.toLowerCase() || "";
                const name = (previewDeliveryAttachment?.fileName || previewDeliveryAttachment?.name || "").toLowerCase();

                const isPDF = type.includes('pdf') || name.endsWith('.pdf') || url.includes('pdf');
                const isImage = type.includes('image') ||
                  ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "jfif", "pjpeg", "pjp"].some(ext =>
                    type === ext || type === `.${ext}` || name.endsWith(`.${ext}`) || url.endsWith(`.${ext}`)
                  );
                const isVideo = type.includes('video') || ["mp4", "webm", "ogg"].some(ext => name.endsWith(`.${ext}`));

                if (isPDF) {
                  const pdfSrc = getFileUrl(url);
                  return (
                    <iframe
                      src={`${pdfSrc}#toolbar=0`}
                      className="w-full h-full border-none bg-white block"
                      title={previewDeliveryAttachment?.fileName || previewDeliveryAttachment?.name || "View"}
                    />
                  );
                }

                if (isImage) {
                  return (
                    <div className="w-full h-full flex items-center justify-center overflow-auto custom-scrollbar p-2">
                      <img
                        src={url}
                        alt={previewDeliveryAttachment?.fileName || previewDeliveryAttachment?.name}
                        className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-border/50"
                      />
                    </div>
                  );
                }

                if (isVideo) {
                  return (
                    <video
                      src={url}
                      controls
                      className="max-w-full max-h-full rounded-xl shadow-2xl border border-border/50"
                    >
                      Your browser does not support the video tag.
                    </video>
                  );
                }

                return (
                  <div className="text-center p-12 bg-background/50 backdrop-blur-sm rounded-[1.5rem] border border-dashed border-muted-foreground/20 max-w-md mx-auto">
                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                      <File className="w-10 h-10 text-primary" />
                    </div>
                    <h3 className="text-lg font-black uppercase tracking-tight mb-2">Preview not available</h3>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-6 leading-relaxed opacity-60">
                      We can't preview this file type directly in the browser. You can still download it to view it locally.
                    </p>
                    <Button className="rounded-xl font-bold px-8 shadow-lg shadow-primary/20" asChild>
                      <a href={url} download={previewDeliveryAttachment?.fileName || previewDeliveryAttachment?.name}>
                        Download File
                      </a>
                    </Button>
                  </div>
                );
              })()
            ) : (
              <div className="text-center p-12">
                <LoadingIcon size={48} className="mx-auto mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Loading preview...</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {isSI && (
        <SiFormDialog
          open={showSiForm}
          onOpenChange={setShowSiForm}
          requestNumber={request?.requestNumber || ""}
          referenceCode={request?.referenceCode}
          requestTypeCode="SI"
          project={project}
          developer={developer}
          contractor={contractor}
          consultant={consultant}
          currentRevision={currentRevision}
          statusHistory={statusHistory}
          revisionDocuments={revisionDocuments}
          revisionAttachments={consultantAttachments}
          getUserName={getUserName}
          getUserSignature={getUserSignature}
          getUserPosition={getUserPosition}
          createdAt={request?.createdAt}
          updatedAt={request?.updatedAt}
          contractorName={request?.contractorName}
          consultantName={request?.consultantName}
          projectName={request?.projectName}
          workLevels={displayWorkLevels}
        />
      )}
      <ProjectStorageModal
        projectId={request?.projectId || ""}
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
        onSelect={(docs) => linkProjectDocumentsMutation.mutate(docs)}
      />
      <ProjectStorageModal
        projectId={request?.projectId || ""}
        isOpen={isEditStorageModalOpen}
        onClose={() => setIsEditStorageModalOpen(false)}
        onSelect={(selections) => {
          const newDocs = selections.map(sel => {
            const doc = sel.document;
            const isProjectAsset = (doc as any).sourceType === 'project';
            const timestamp = Date.now();
            const random = Math.floor(Math.random() * 1000);
            return {
              id: `storage-${doc.id}-${timestamp}-${random}`,
              title: sel.title || doc.fileName || doc.name || "Untitled",
              fileName: doc.fileName || doc.name,
              fileUrl: (doc as any).fileUrl || doc.fileData,
              fileSize: doc.size || 0,
              mimeType: doc.type || null,
              sourceType: "project",
              projectDocumentId: isProjectAsset ? doc.id : null,
              documentType: isSD ? "Drawing" : "",
              documentRef: "",
              isNew: true
            };
          });
          setEditSelectedDocuments(prev => [...prev, ...newDocs]);
          setIsEditStorageModalOpen(false);
        }}
      />
      {/* Hidden pre-renderer for PDFs to populate cache in background */}
      <div style={{ display: "none" }}>
        {isMIR && revisionDeliveries && revisionDeliveries.map((rd) => {
          if (rd.delivery.attachment && rd.delivery.attachment.fileUrl) {
            const isPDF = rd.delivery.attachment.fileName?.endsWith(".pdf") || rd.delivery.attachment.fileUrl.endsWith(".pdf");
            if (isPDF) {
              const fileSrc = getFileUrl(rd.delivery.attachment.fileUrl);
              return <InlinePdfViewer fileUrl={fileSrc} key={rd.id} />;
            }
          }
          return null;
        })}
        {isSD && revisionDocuments && revisionDocuments.map((doc) => {
          if (doc.fileUrl) {
            const isPDF = doc.fileName?.endsWith(".pdf") || doc.fileUrl.endsWith(".pdf");
            if (isPDF) {
              const fileSrc = getFileUrl(doc.fileUrl);
              return <InlinePdfViewer fileUrl={fileSrc} key={doc.id} />;
            }
          }
          return null;
        })}
        {isNcrFamily && consultantAttachments && consultantAttachments.map((a) => {
          if (a.fileUrl) {
            const isPDF = a.fileName?.endsWith(".pdf") || a.fileUrl.endsWith(".pdf");
            if (isPDF) {
              const fileSrc = getFileUrl(a.fileUrl);
              return <InlinePdfViewer fileUrl={fileSrc} key={a.id} />;
            }
          }
          return null;
        })}
        {isNcrFamily && revisionDocuments && revisionDocuments.map((doc) => {
          if (doc.fileUrl) {
            const isPDF = doc.fileName?.endsWith(".pdf") || doc.fileUrl.endsWith(".pdf");
            if (isPDF) {
              const fileSrc = getFileUrl(doc.fileUrl);
              return <InlinePdfViewer fileUrl={fileSrc} key={doc.id} />;
            }
          }
          return null;
        })}
      </div>
    </div>
  );
}
