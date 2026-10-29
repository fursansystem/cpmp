import { PaymentActionDialog, usePaymentRoles } from "@/components/payments/payment-actions";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Plus,
  Search,
  Warehouse,
  Truck,
  Calendar,
  FileSpreadsheet,
  Edit2,
  FileImage,
  Paperclip,
  FileText,
  MoreVertical,
  Trash2,
  AlertCircle,
  ExternalLink,
  X,
  File,
  Link2,
  Clock,
  CheckCircle2,
  XCircle,
  Lock,
  Banknote
} from "lucide-react";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn, formatFileSize, formatGMT3 } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  type Delivery,
  type Project,
  type DeliveryItem,
  type Document
} from "@shared/schema";
import { DeliveryFormDialog } from "@/components/delivery-form-dialog";
import { DeliveryOverviewDialog } from "@/components/delivery-overview-dialog";
import { LoadingIcon } from "@/components/ui/loading-icon";


import { 
  Avatar, 
  AvatarImage, 
  AvatarFallback 
} from "@/components/ui/avatar";

type EnrichedDelivery = Delivery & {
  items: DeliveryItem[],
  attachment?: Document | null,
  linkedRequests?: { requestId: string, requestNumber: string, currentStatus: string, revCount?: number }[],
  isInspected?: boolean,
  isRejected?: boolean,
  isResubmit?: boolean,
  isFinalApproved?: boolean,
  revisionCount?: number,
  supplierName?: string | null,
  supplierLogo?: string | null
};

// `embedded` renders the list without its page shell (background, back button, title badge
// and project bar) so the warehouse page can host it as a tab. The standalone route keeps
// working unchanged because the prop is simply absent there.
type ProjectDeliveriesProps = {
  embedded?: boolean;
  projectId?: string;
};

export default function ProjectDeliveries({
  embedded = false,
  projectId: projectIdProp,
}: ProjectDeliveriesProps = {}) {
  const params = useParams();
  const projectId = projectIdProp ?? params.projectId;
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [viewingDelivery, setViewingDelivery] = useState<EnrichedDelivery | null>(null);
  const [editingDelivery, setEditingDelivery] = useState<EnrichedDelivery | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Document | null>(null);
  const [deliveryToDelete, setDeliveryToDelete] = useState<string | null>(null);
  // Payments: accounting asks for the invoice of this delivery; everyone else on the project asks for a transfer
  const paymentRoles = usePaymentRoles(projectId ?? "");
  const [paymentDelivery, setPaymentDelivery] = useState<any | null>(null);
  const [dependencyError, setDependencyError] = useState<{ title: string, details: string } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/deliveries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/revisions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      toast({
        title: "Success",
        description: "Delivery record deleted successfully",
      });
    },
    onError: (error: Error) => {
      // Try to parse JSON from the error message (e.g. "409: {"error": "...", "details": "..."}")
      const match = error.message.match(/^\d+: (\{.*\})$/);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          setDependencyError({
            title: parsed.error || "Operation Blocked",
            details: parsed.details || "This item cannot be deleted due to existing dependencies."
          });
          return;
        } catch (e) {
          // If parsing fails, fall back to standard toast
          console.error("Failed to parse error JSON:", e);
        }
      }

      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getFileUrl = (url?: string) => {
    if (!url) return "";
    if (url.startsWith('http') || url.startsWith('/')) return url;
    // If it looks like a path (contains slashes or dots), prepend a leading slash
    if (url.includes('/') || url.includes('.')) return `/${url}`;
    return url;
  };

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: deliveries = [], isLoading } = useQuery<EnrichedDelivery[]>({
    queryKey: ["/api/projects", projectId, "deliveries"],
    enabled: !!projectId,
  });

  const filteredDeliveries = useMemo(() => {
    if (!searchQuery) return deliveries;
    const query = searchQuery.toLowerCase();
    return deliveries.filter(d =>
      d.shipmentNumber.toLowerCase().includes(query) ||
      d.supplier.toLowerCase().includes(query) ||
      (d.deliveryInvoiceNumber?.toLowerCase().includes(query) ?? false) ||
      d.items?.some(item => item.materialName.toLowerCase().includes(query))
    );
  }, [deliveries, searchQuery]);

  const handleEdit = (delivery: EnrichedDelivery) => {
    setEditingDelivery(delivery);
    setFormOpen(true);
  };

  const handleAdd = () => {
    setEditingDelivery(null);
    setFormOpen(true);
  };

  if (isLoading) {
    return (
      <div className={embedded ? "w-full flex items-center justify-center py-20" : "h-screen w-full flex items-center justify-center"}>
        <LoadingIcon size={embedded ? 40 : 64} />
      </div>
    );
  }

  return (
    <div
      className={
        embedded
          ? "space-y-4 relative"
          : "min-h-screen bg-transparent px-6 lg:px-10 pt-2 pb-8 space-y-4 relative overflow-hidden"
      }
    >
      {!embedded && (
        <>
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
            onClick={() => navigate(`/projects/${projectId}`)}
          >
            <ArrowLeft className="w-5 h-5 md:mr-2" />
            <span className="hidden md:inline font-semibold">Back to Project</span>
          </Button>
        </div>

        {/* Centered Page Title */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-2 lg:gap-3 w-full justify-center px-12 lg:px-0">
          <Badge variant="secondary" className="px-4 py-1.5 lg:px-8 lg:py-2 border-none bg-primary/10 text-primary dark:bg-primary/20 rounded-full shadow-sm lg:shadow-md">
            <Warehouse className="w-4 h-4 lg:w-6 lg:h-6 mr-2 lg:mr-3 text-primary" />
            <span className="text-sm lg:text-xl font-bold tracking-tight uppercase truncate max-w-[200px] sm:max-w-none">Warehouse & Delivery Notes</span>
          </Badge>
        </div>

        <div className="flex items-center gap-3 shrink-0 z-10">
          <Button onClick={handleAdd} className="shadow-lg rounded-full font-black text-[10px] uppercase tracking-widest px-6 h-9 lg:h-11 bg-primary hover:bg-primary/90 text-primary-foreground transition-all active:scale-95">
            <Plus className="w-4 h-4 mr-2" />
            Add Delivery
          </Button>
        </div>
      </div>

      {/* Project Metadata Bar */}
      {project && (
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 lg:gap-10 text-[11px] lg:text-sm text-muted-foreground bg-muted/30 p-2 rounded-[1.5rem] border border-border/50 shadow-sm">
          <div className="flex items-center gap-1.5 lg:gap-2.5">
            <span className="font-black uppercase tracking-widest opacity-60 text-[9px] lg:text-[10px]">Project:</span>
            <span className="font-bold text-foreground">{project.name}</span>
          </div>
          <div className="flex items-center gap-1.5 lg:gap-2.5">
            <span className="font-black uppercase tracking-widest opacity-60 text-[9px] lg:text-[10px]">Location:</span>
            <span className="font-bold text-foreground">{project.location}</span>
          </div>
          <div className="flex items-center gap-1.5 lg:gap-2.5">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            <span className="font-bold text-foreground">Material Tracking Log</span>
          </div>
        </div>
      )}
        </>
      )}

      {embedded && (
        <div className="flex justify-end">
          <Button onClick={handleAdd} className="rounded-xl font-bold gap-1.5 text-xs h-9">
            <Plus className="w-4 h-4" />
            إضافة توريد
          </Button>
        </div>
      )}

      {/* Filter Section */}
      <div className="bg-white/40 dark:bg-muted/10 backdrop-blur-md p-4 lg:p-6 rounded-[2rem] flex items-center justify-between gap-4 flex-wrap border border-white/20 shadow-xl mt-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_hsl(var(--primary)/0.4)]" />
            <h2 className="text-sm lg:text-lg font-black uppercase tracking-tight">Delivery Registry</h2>
          </div>
          <p className="text-[10px] lg:text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60">Comprehensive log of incoming materials</p>
        </div>
        <div className="relative w-full max-w-md group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            placeholder="Search deliveries, materials, or suppliers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-10 lg:h-12 bg-white dark:bg-background/50 border-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-full shadow-inner transition-all text-sm font-medium"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12">
        {filteredDeliveries.length === 0 ? (
          <Card className="col-span-full border-2 border-dashed border-muted/50 p-12 rounded-[2rem] bg-muted/5">
            <CardContent className="flex flex-col items-center justify-center text-muted-foreground">
              <div className="bg-primary/10 p-8 rounded-full mb-6">
                <Truck className="w-16 h-16 text-primary opacity-50" />
              </div>
              <p className="font-black text-xl uppercase tracking-tight text-foreground">No Deliveries Found</p>
              <p className="text-sm font-bold uppercase tracking-widest opacity-60 mt-2">Start by recording your first material arrival</p>
            </CardContent>
          </Card>
        ) : (
          filteredDeliveries.map((delivery, i) => (
            <Card 
              key={delivery.id} 
              className="overflow-hidden border border-border/40 shadow-lg group hover:shadow-2xl hover:scale-[1.01] transition-all duration-500 flex flex-col min-h-[340px] bg-white dark:bg-card/50 rounded-[2rem]"
            >
              <CardHeader className="p-6 pb-4 flex-grow">
                {/* Header: Shipment Number & Actions */}
                <div className="flex items-center justify-between mb-6">
                  <Badge variant="secondary" className="px-4 py-1.5 bg-primary/10 text-primary font-black border-none rounded-full text-xs tracking-widest uppercase shadow-sm">
                    {delivery.shipmentNumber}
                  </Badge>
                  
                  <div className="flex items-center gap-1">
                    {delivery.attachment && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewAttachment(delivery.attachment!);
                        }}
                        className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-colors"
                      >
                        <Paperclip className="w-4 h-4" />
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:bg-muted rounded-full">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 rounded-2xl shadow-2xl border-border/40">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEdit(delivery);
                                  }} 
                                  disabled={delivery.isFinalApproved}
                                  className="font-bold rounded-lg m-1 py-2 text-xs"
                                >
                                  {delivery.isFinalApproved ? (
                                    <Lock className="w-4 h-4 mr-2.5 text-muted-foreground" />
                                  ) : (
                                    <Edit2 className="w-4 h-4 mr-2.5 text-primary" />
                                  )}
                                  Edit Details
                                </DropdownMenuItem>
                              </div>
                            </TooltipTrigger>
                            {delivery.isFinalApproved && (
                              <TooltipContent side="left" className="bg-destructive text-destructive-foreground font-bold text-[10px] rounded-lg shadow-lg">
                                Cannot edit: Final Approval Received
                              </TooltipContent>
                            )}
                          </Tooltip>

                          {delivery.attachment && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              setPreviewAttachment(delivery.attachment!);
                            }} className="font-bold rounded-lg m-1 py-2 text-xs">
                              <Paperclip className="w-4 h-4 mr-2.5 text-primary" /> Preview Document
                            </DropdownMenuItem>
                          )}
                          {paymentRoles.mode && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setPaymentDelivery(delivery);
                              }}
                              className="font-bold rounded-lg m-1 py-2 text-xs"
                            >
                              <Banknote className="w-4 h-4 mr-2.5 text-primary" />
                              {paymentRoles.mode === "accounting" ? "Request invoice for this delivery" : "Request a transfer"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive font-bold rounded-lg m-1 py-2 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeliveryToDelete(delivery.id);
                                  }}
                                  disabled={delivery.linkedRequests && delivery.linkedRequests.length > 0}
                                >
                                  {delivery.linkedRequests && delivery.linkedRequests.length > 0 ? (
                                    <Lock className="w-4 h-4 mr-2.5 text-muted-foreground" />
                                  ) : (
                                    <Trash2 className="w-4 h-4 mr-2.5" />
                                  )}
                                  Remove Log
                                </DropdownMenuItem>
                              </div>
                            </TooltipTrigger>
                            {delivery.linkedRequests && delivery.linkedRequests.length > 0 && (
                              <TooltipContent side="left" className="bg-destructive text-destructive-foreground font-bold text-[10px] rounded-lg shadow-lg">
                                Cannot delete: Linked to MIR
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Supplier Info with Logo */}
                <div
                  className="space-y-5 cursor-pointer"
                  onClick={() => setViewingDelivery(delivery)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 bg-white dark:bg-black/20 border-2 border-primary/10 rounded-2xl shadow-sm flex items-center justify-center p-1.5 shrink-0 transition-transform group-hover:scale-105 group-hover:shadow-md">
                      {delivery.supplierLogo ? (
                        <img 
                          src={delivery.supplierLogo} 
                          alt={delivery.supplierName || delivery.supplier} 
                          className="w-full h-full object-contain" 
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            e.currentTarget.parentElement?.classList.add('bg-primary/5');
                            e.currentTarget.parentElement!.innerHTML = `<div class="bg-primary/10 w-full h-full rounded-xl flex items-center justify-center"><span class="text-primary font-black text-xl">${(delivery.supplierName || delivery.supplier || "?").substring(0, 2).toUpperCase()}</span></div>`;
                          }}
                        />
                      ) : (
                        <div className="bg-primary/10 w-full h-full rounded-xl flex items-center justify-center">
                          <span className="text-primary font-black text-xl">
                            {(delivery.supplierName || delivery.supplier || "?").substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <h3 className="font-bold text-base leading-tight text-foreground line-clamp-1 group-hover:text-primary transition-colors uppercase tracking-tight">
                        {delivery.supplierName || delivery.supplier}
                      </h3>
                      {delivery.isInspected && (
                        <div className="flex items-center gap-1.5">
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full animate-pulse",
                            delivery.isRejected ? "bg-red-500" : delivery.isResubmit ? "bg-amber-500" : "bg-emerald-500"
                          )} />
                          <span className={cn(
                            "text-[9px] font-black uppercase tracking-[0.1em]",
                            delivery.isRejected ? "text-red-500" : delivery.isResubmit ? "text-amber-500" : "text-emerald-500"
                          )}>
                            {delivery.isRejected ? "Rejected" : delivery.isResubmit ? "Resubmit" : "Inspected"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3.5 pt-5 border-t border-muted/50">
                    {delivery.linkedRequests && delivery.linkedRequests.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          {delivery.linkedRequests.map(req => (
                            <Button 
                              key={req.requestId}
                              variant="ghost" 
                              className="h-auto w-full py-3 px-4 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all flex items-center justify-between gap-2 group/mir text-primary shadow-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/requests/${req.requestId}`);
                              }}
                            >
                              <div className="flex items-center gap-3">
                                <div className="p-1.5 bg-white dark:bg-background rounded-lg shadow-sm">
                                  <ExternalLink className="w-3.5 h-3.5 text-primary" />
                                </div>
                                <span className="font-mono font-black text-xs tracking-wider">{req.requestNumber}</span>
                              </div>
                              {(req.revCount || 0) > 1 && (
                                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-[9px] font-black text-primary border border-primary/10">
                                  REV {req.revCount}
                                </span>
                              )}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-14 border-2 border-dashed border-muted/30 rounded-2xl bg-muted/5">
                        <span className="text-[10px] text-muted-foreground font-black tracking-widest uppercase opacity-40">Not Linked to MIR</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 mt-1">
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground font-black uppercase tracking-widest opacity-60 text-[8px]">Inventory Inv.</span>
                        <span className="font-mono font-black text-xs text-foreground bg-muted/40 px-3 py-1.5 rounded-xl border border-border/40 w-fit">
                          {delivery.deliveryInvoiceNumber || "N/A"}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <span className="text-muted-foreground font-black uppercase tracking-widest opacity-60 text-[8px]">Arrival Status</span>
                        <div className="flex items-center gap-2 font-black text-xs text-foreground/80 bg-primary/5 px-3 py-1.5 rounded-xl border border-primary/10">
                          <Calendar className="w-3 h-3 text-primary" />
                          {formatGMT3(delivery.arrivalDate, "MMM d, yyyy")}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              
              <div
                className="bg-muted/30 dark:bg-muted/5 px-6 py-5 cursor-pointer border-t border-border/40 mt-auto hover:bg-muted/50 transition-colors"
                onClick={() => setViewingDelivery(delivery)}
              >
                <div className="flex items-center justify-between mb-4 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-primary/10 rounded-lg">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span>Manifest Details</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-black border-primary/30 text-primary bg-primary/5 rounded-full px-3 py-0.5">
                    {delivery.items?.length || 0} SKU
                  </Badge>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {delivery.items?.slice(0, 3).map((item, idx) => (
                    <Badge key={item.id} variant="secondary" className="bg-white dark:bg-background text-[11px] font-bold border-border/40 px-3.5 py-1.5 shadow-sm text-foreground/80 rounded-xl hover:text-primary transition-colors">
                      {item.materialName}
                    </Badge>
                  ))}
                  {(delivery.items?.length || 0) > 3 && (
                    <Badge variant="outline" className="text-[10px] font-black opacity-50 border-dashed border-muted-foreground/30 rounded-xl px-2.5">
                      +{(delivery.items?.length || 0) - 3} More
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <Dialog open={!!previewAttachment} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
        <DialogContent className="max-w-6xl h-[95vh] rounded-[1.5rem] p-0 overflow-hidden border-none shadow-2xl flex flex-col bg-white dark:bg-background [&>button]:hidden">
          {/* Streamlined Premium Header */}
          <div className="flex items-center justify-between p-3 px-6 bg-card/50 backdrop-blur-md relative z-20 shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <File className="w-5 h-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-sm font-black uppercase tracking-tight truncate max-w-[300px] md:max-w-[500px]">
                  {previewAttachment?.fileName || previewAttachment?.name || "Document Preview"}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/50 px-2 py-0.5 rounded-full">
                    {previewAttachment?.type || "Document"}
                  </span>
                  {previewAttachment && (
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">
                      • {formatFileSize(previewAttachment.size || (previewAttachment as any).fileSize || 0)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="rounded-xl font-bold h-9 bg-background/50 border-primary/20 text-primary hover:bg-primary/5 hidden sm:flex" asChild>
                <a href={getFileUrl(previewAttachment?.fileUrl || (previewAttachment as any)?.fileData || (previewAttachment as any)?.file_data)} target="_blank" rel="noopener noreferrer">
                  <Link2 className="w-4 h-4 mr-2" />
                  Open Original
                </a>
              </Button>
              
              <button
                onClick={() => setPreviewAttachment(null)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-muted/50 hover:bg-muted transition-all duration-300 text-muted-foreground hover:text-foreground group active:scale-90"
              >
                <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
              </button>
            </div>
          </div>

          {/* Maximized Preview Area */}
          <div className="flex-1 bg-muted/20 flex items-center justify-center overflow-hidden p-0">
            {previewAttachment ? (
              (() => {
                const url = getFileUrl((previewAttachment as any).fileData || previewAttachment.fileUrl || (previewAttachment as any).file_data || "");
                const type = previewAttachment.type?.toLowerCase() || "";
                const name = (previewAttachment.fileName || previewAttachment.name || "").toLowerCase();

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
                      title={previewAttachment.fileName || previewAttachment.name}
                    />
                  );
                }

                if (isImage) {
                  return (
                    <div className="w-full h-full flex items-center justify-center overflow-auto custom-scrollbar p-2">
                      <img
                        src={url}
                        alt={previewAttachment.fileName || previewAttachment.name}
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
                      <a href={url} download={previewAttachment.fileName || previewAttachment.name}>
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

      <DeliveryOverviewDialog
        isOpen={!!viewingDelivery}
        onOpenChange={(open) => !open && setViewingDelivery(null)}
        delivery={viewingDelivery}
        onPreviewAttachment={(attachment) => {
          setViewingDelivery(null);
          setPreviewAttachment(attachment);
        }}
      />

      {projectId && (
        <DeliveryFormDialog
          isOpen={formOpen}
          onOpenChange={setFormOpen}
          projectId={projectId}
          delivery={editingDelivery}
        />
      )}

      {/* Dependency Error Pop-up */}
      <Dialog open={!!dependencyError} onOpenChange={(open) => !open && setDependencyError(null)}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-destructive/10 p-6 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 bg-destructive/20 rounded-full flex items-center justify-center text-destructive">
              <AlertCircle className="w-10 h-10" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black text-destructive uppercase tracking-tight">
                {dependencyError?.title}
              </DialogTitle>
              <p className="text-xs font-bold text-muted-foreground mt-1 uppercase tracking-widest opacity-60">Action Restricted</p>
            </div>
          </div>
          <div className="p-8 pt-6">
            <div className="bg-muted/50 p-4 rounded-xl border border-muted-foreground/10 mb-6">
              <p className="text-sm font-bold leading-relaxed text-center">
                {dependencyError?.details}
              </p>
            </div>
            <Button
              onClick={() => setDependencyError(null)}
              className="w-full h-12 rounded-xl font-black text-xs uppercase bg-foreground hover:bg-foreground/90 text-background shadow-lg transition-all active:scale-95"
            >
              Understand & Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deletion Confirmation Pop-up */}
      <AlertDialog open={!!deliveryToDelete} onOpenChange={(open) => !open && setDeliveryToDelete(null)}>
        <AlertDialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-none shadow-2xl bg-card">
          <div className="bg-destructive/10 p-6 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 bg-destructive/15 rounded-full flex items-center justify-center text-destructive">
              <Trash2 className="w-8 h-8" />
            </div>
            <div>
              <AlertDialogTitle className="text-xl font-black text-destructive uppercase tracking-tight">
                Remove Delivery Log?
              </AlertDialogTitle>
              <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-widest opacity-60">System Registry Modification</p>
            </div>
          </div>
          <div className="p-8 pt-6">
            <AlertDialogDescription className="text-sm font-bold leading-relaxed text-center text-foreground mb-8">
              Are you absolutely sure you want to delete this delivery record? This action will remove the record from the project's permanent logistics history.
            </AlertDialogDescription>
            <div className="flex gap-3">
              <AlertDialogCancel
                className="flex-1 h-12 rounded-xl border-none bg-muted/50 font-black text-xs uppercase hover:bg-muted transition-all active:scale-95"
              >
                Keep Log
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deliveryToDelete) {
                    deleteMutation.mutate(deliveryToDelete);
                    setDeliveryToDelete(null);
                  }
                }}
                className="flex-1 h-12 rounded-xl font-black text-xs uppercase bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lg shadow-destructive/20 transition-all active:scale-95"
              >
                Yes, Remove
              </AlertDialogAction>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {paymentDelivery && paymentRoles.mode && (
        <PaymentActionDialog
          mode={paymentRoles.mode === "accounting" ? "bill" : "request"}
          onClose={() => setPaymentDelivery(null)}
          context={{
            projectId: projectId ?? "",
            purchaseOrderId: paymentDelivery.purchaseOrderId ?? undefined,
            supplierId: paymentDelivery.supplierId ?? undefined,
            payeeName: paymentDelivery.supplier,
            description: `فاتورة التوريد ${paymentDelivery.shipmentNumber}${paymentDelivery.deliveryInvoiceNumber ? ` (${paymentDelivery.deliveryInvoiceNumber})` : ""}`,
            sourceType: "delivery",
            sourceId: paymentDelivery.id,
          }}
        />
      )}
    </div>
  );
}
