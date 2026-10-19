import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
  ShoppingCart,
  Users,
  Package,
  ArrowLeft,
  Edit2,
  Trash2,
  Phone,
  Hash,
  ArrowRight,
  PlusCircle,
  Link2,
  Mail,
  MapPin,
  ExternalLink,
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  DollarSign,
  FileText,
  Eye,
  Settings,
  Briefcase,
  Building2,
  Award,
  Clock,
  Printer,
  User,
  Calendar,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn, formatFileSize } from "@/lib/utils";
import type { Supplier, Material, Project, MaterialSupplier, SupplierAttachment, Document } from "@shared/schema";
import { SupplierFormDialog } from "@/components/supplier-form-dialog";
import { MaterialFormDialog } from "@/components/material-form-dialog";
import { LinkMaterialDialog } from "@/components/link-material-dialog";
import { LoadingIcon } from "@/components/ui/loading-icon";
import { EditMaterialLinkDialog } from "@/components/edit-material-link-dialog";
import { RfqFormDialog } from "@/components/procurement/rfq-form-dialog";
import { QuotationFormDialog } from "@/components/procurement/quotation-form-dialog";
import { QuotationDetailsDialog } from "@/components/procurement/quotation-details-dialog";
import { PoDetailsPrintDialog } from "@/components/procurement/po-details-print-dialog";

import {
  Avatar,
  AvatarImage,
  AvatarFallback
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
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

export const RFQ_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  evaluating: "Evaluating",
  awarded: "Awarded",
};
export const RFQ_STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  evaluating: "bg-amber-100 text-amber-700",
  awarded: "bg-emerald-100 text-emerald-700",
};

const PO_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
  issued: "Issued",
  partially_received: "Partially received",
  completed: "Completed",
  cancelled: "Cancelled",
};
const PO_STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-emerald-100 text-emerald-700",
  issued: "bg-blue-100 text-blue-700",
  partially_received: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function ProjectPurchaseOrders() {
  const { projectId } = useParams();
  const [location, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Dialog states
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [materialFormOpen, setMaterialFormOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [linkingToSupplierId, setLinkingToSupplierId] = useState<string | null>(null);

  const [linkExistingOpen, setLinkExistingOpen] = useState(false);
  const [linkingSupplierId, setLinkingSupplierId] = useState<string | null>(null);

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: suppliers = [], isLoading: loadingSuppliers } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers", { projectId }],
    enabled: !!projectId,
  });

  const { data: materials = [], isLoading: loadingMaterials } = useQuery<Material[]>({
    queryKey: ["/api/materials", { projectId }],
    enabled: !!projectId,
  });

  const filteredSuppliers = useMemo(() => {
    if (!searchQuery) return suppliers;
    const query = searchQuery.toLowerCase();
    return suppliers.filter(s =>
      s.supplierName.toLowerCase().includes(query) ||
      s.contactPerson?.toLowerCase().includes(query) ||
      s.email?.toLowerCase().includes(query)
    );
  }, [suppliers, searchQuery]);

  const deleteSupplierMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/suppliers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", { projectId }] });
      toast({ title: "Success", description: "Supplier removed successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  // Tabs & Procurement States
  const getTabFromUrl = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tab");
      if (t && ["suppliers", "rfqs", "quotations", "purchase_orders"].includes(t)) {
        return t;
      }
    } catch (e) {}
    return "suppliers";
  };
  const [activeTab, setActiveTab] = useState<string>(getTabFromUrl);

  useEffect(() => {
    const currentUrlTab = getTabFromUrl();
    if (currentUrlTab !== activeTab) {
      setActiveTab(currentUrlTab);
    }
  }, [location, window.location.search]);
  const [rfqFormOpen, setRfqFormOpen] = useState(false);
  const [quotationFormOpen, setQuotationFormOpen] = useState(false);
  const [viewQuotationId, setViewQuotationId] = useState<string | null>(null);
  const [selectedRfqForQuote, setSelectedRfqForQuote] = useState<string | undefined>(undefined);
  const [selectedSupplierForQuote, setSelectedSupplierForQuote] = useState<string | undefined>(undefined);

  const [rfqSearch, setRfqSearch] = useState("");
  const [rfqStatusFilter, setRfqStatusFilter] = useState("all");
  const [rfqToDelete, setRfqToDelete] = useState<any | null>(null);
  const [poToDelete, setPoToDelete] = useState<any | null>(null);


  const [poPrintOpen, setPoPrintOpen] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);

  const { data: rfqs = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "rfqs"],
    enabled: !!projectId,
  });

  const filteredRfqs = useMemo(() => {
    const q = rfqSearch.trim().toLowerCase();
    return rfqs.filter(
      (r: any) =>
        (rfqStatusFilter === "all" || r.status === rfqStatusFilter) &&
        (!q || `${r.rfqNumber} ${r.title}`.toLowerCase().includes(q))
    );
  }, [rfqs, rfqSearch, rfqStatusFilter]);

  const { data: quotations = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "quotations"],
    enabled: !!projectId,
  });

  const { data: purchaseOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "purchase-orders"],
    enabled: !!projectId,
  });

  const deleteRfqMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/rfqs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "rfqs"] });
      toast({ title: "نجاح", description: "تم حذف طلب عرض السعر بنجاح" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const deletePoMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/purchase-orders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "rfqs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs"] });
      toast({ title: "نجاح", description: "تم حذف أمر الشراء بنجاح" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const handleAddSupplier = () => {
    setEditingSupplier(null);
    setSupplierFormOpen(true);
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setSupplierFormOpen(true);
  };

  const handleEditMaterial = (material: Material) => {
    setEditingMaterial(material);
    setLinkingToSupplierId(null);
    setMaterialFormOpen(true);
  };

  const handleAddMaterialToSupplier = (supplierId: string) => {
    setEditingMaterial(null);
    setLinkingToSupplierId(supplierId);
    setMaterialFormOpen(true);
  };

  const handleLinkExistingToSupplier = (supplierId: string) => {
    setLinkingSupplierId(supplierId);
    setLinkExistingOpen(true);
  };

  if (loadingSuppliers || loadingMaterials) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <LoadingIcon size={64} />
      </div>
    );
  }

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
            <ShoppingCart className="w-4 h-4 lg:w-6 lg:h-6 mr-2 lg:mr-3 text-primary" />
            <span className="text-sm lg:text-xl font-bold tracking-tight uppercase truncate max-w-[200px] sm:max-w-none">Purchase Orders & Suppliers</span>
          </Badge>
        </div>

        <div className="flex items-center gap-3 shrink-0 z-10">
          {activeTab === "suppliers" && (
            <Button 
              onClick={handleAddSupplier} 
              className="shadow-lg rounded-full font-black text-[10px] uppercase tracking-widest px-6 h-9 lg:h-11 bg-primary hover:bg-primary/90 text-primary-foreground transition-all active:scale-95"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Supplier
            </Button>
          )}
          {activeTab === "rfqs" && (
            <Button 
              onClick={() => navigate(`/projects/${projectId}/rfqs/new`)} 
              className="shadow-lg rounded-full font-black text-[10px] uppercase tracking-widest px-6 h-9 lg:h-11 bg-primary hover:bg-primary/90 text-primary-foreground transition-all active:scale-95"
            >
              <Plus className="w-4 h-4 mr-2" />
              طلب عرض سعر جديد (New RFQ)
            </Button>
          )}
          {activeTab === "quotations" && (
            <Button 
              onClick={() => {
                setSelectedRfqForQuote(undefined);
                setSelectedSupplierForQuote(undefined);
                setQuotationFormOpen(true);
              }} 
              className="shadow-lg rounded-full font-black text-[10px] uppercase tracking-widest px-6 h-9 lg:h-11 bg-amber-600 hover:bg-amber-700 text-white transition-all active:scale-95"
            >
              <Plus className="w-4 h-4 mr-2" />
              تسجيل عرض سعر (Add Quote)
            </Button>
          )}
          {activeTab === "purchase_orders" && (
            <Button 
              onClick={() => navigate(`/projects/${projectId}/purchase-orders/new`)} 
              className="shadow-lg rounded-full font-black text-[10px] uppercase tracking-widest px-6 h-9 lg:h-11 bg-primary hover:bg-primary/90 text-primary-foreground transition-all active:scale-95"
            >
              <Plus className="w-4 h-4 mr-2" />
              أمر شراء يدوي (New PO)
            </Button>
          )}
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <Tabs 
        value={activeTab} 
        onValueChange={(val) => {
          setActiveTab(val);
          window.history.replaceState(null, "", `/projects/${projectId}/purchase-orders?tab=${val}`);
        }} 
        className="w-full space-y-4"
      >
        <div className="flex items-center justify-between border-b border-border/50 pb-3">
          <TabsList className="bg-muted/40 p-1 rounded-2xl h-11 border border-border/50">
            <TabsTrigger value="suppliers" className="rounded-xl px-5 text-xs font-bold gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Building2 className="w-4 h-4 text-blue-600" />
              Supplier Directory ({suppliers.length})
            </TabsTrigger>
            <TabsTrigger value="rfqs" className="rounded-xl px-5 text-xs font-bold gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <FileText className="w-4 h-4 text-purple-600" />
              RFQs ({rfqs.length})
            </TabsTrigger>
            <TabsTrigger value="quotations" className="rounded-xl px-5 text-xs font-bold gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <DollarSign className="w-4 h-4 text-amber-600" />
              Quotations ({quotations.length})
            </TabsTrigger>
            <TabsTrigger value="purchase_orders" className="rounded-xl px-5 text-xs font-bold gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <ShoppingCart className="w-4 h-4 text-emerald-600" />
              Purchase Orders ({purchaseOrders.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ==================== TAB 1: SUPPLIERS (100% ORIGINAL DESIGN UNTOUCHED) ==================== */}
        <TabsContent value="suppliers" className="space-y-4 outline-none">
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
                <ShoppingCart className="w-3.5 h-3.5 text-primary" />
                <span className="font-bold text-foreground">Supplier Registry</span>
              </div>
            </div>
          )}

          {/* Filter Section */}
          <div className="bg-white/40 dark:bg-muted/10 backdrop-blur-md p-4 lg:p-6 rounded-[1.5rem] flex items-center justify-between gap-4 flex-wrap border border-white/20 shadow-xl mt-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_hsl(var(--primary)/0.4)]" />
                <h2 className="text-sm lg:text-lg font-black uppercase tracking-tight text-foreground/70">Supplier Directory</h2>
              </div>
              <p className="text-[10px] lg:text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60">Manage project-specific vendors</p>
            </div>
            <div className="relative w-full max-w-md group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search suppliers, contacts, or materials..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-10 lg:h-12 bg-white dark:bg-background/50 border-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-full shadow-inner transition-all text-sm font-medium"
              />
            </div>
          </div>

          {/* Suppliers Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pb-12">
            {filteredSuppliers.length === 0 ? (
              <Card className="col-span-full border-2 border-dashed border-muted/50 p-12 rounded-[1.5rem] bg-muted/5">
                <CardContent className="flex flex-col items-center justify-center text-muted-foreground">
                  <div className="bg-primary/10 p-8 rounded-full mb-6">
                    <Users className="w-16 h-16 text-primary opacity-50" />
                  </div>
                  <p className="font-black text-xl uppercase tracking-tight text-foreground">No Suppliers Onboarded</p>
                  <p className="text-sm font-bold uppercase tracking-widest opacity-60 mt-2">Start by adding your first project supplier to manage materials.</p>
                  <Button onClick={handleAddSupplier} className="mt-8 rounded-full font-black text-[10px] uppercase tracking-widest px-8 h-11 bg-primary hover:bg-primary/90 text-primary-foreground transition-all shadow-lg shadow-primary/20">
                    Onboard New Supplier
                  </Button>
                </CardContent>
              </Card>
            ) : (
              filteredSuppliers.map((supplier) => (
                <SupplierCard
                  key={supplier.id}
                  supplier={supplier}
                  onEdit={() => handleEditSupplier(supplier)}
                  onDelete={() => deleteSupplierMutation.mutate(supplier.id)}
                  onAddMaterial={() => handleAddMaterialToSupplier(supplier.id)}
                  onLinkMaterial={() => handleLinkExistingToSupplier(supplier.id)}
                  onEditMaterial={handleEditMaterial}
                  projectId={projectId!}
                />
              ))
            )}
          </div>
        </TabsContent>

        {/* ==================== TAB 2: RFQS ==================== */}
        <TabsContent value="rfqs" className="space-y-4 outline-none">
          {rfqs.length === 0 ? (
            <div className="text-center p-12 border-2 border-dashed border-muted/50 rounded-[1.5rem] bg-muted/5 space-y-3">
              <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto" />
              <p className="font-black text-lg text-foreground">لا توجد طلبات عروض أسعار (RFQs)</p>
              <p className="text-xs text-muted-foreground">
                أنشئ طلب عرض سعر جديد لتحديد المواد المطلوبة ودعوة الموردين لتقديم عروضهم
              </p>
              <Button onClick={() => navigate(`/projects/${projectId}/rfqs/new`)} className="rounded-full text-xs font-bold gap-1.5 px-6 mt-2">
                <Plus className="w-4 h-4" />
                إنشاء طلب عرض سعر جديد
              </Button>
            </div>
          ) : (
            <div className="space-y-3 pb-12">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={rfqSearch}
                    onChange={(e) => setRfqSearch(e.target.value)}
                    placeholder="Search by number or title..."
                    className="pl-9 h-9 rounded-xl text-sm"
                  />
                </div>
                <Select value={rfqStatusFilter} onValueChange={setRfqStatusFilter}>
                  <SelectTrigger className="w-[170px] h-9 rounded-xl text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="evaluating">Evaluating</SelectItem>
                    <SelectItem value="awarded">Awarded</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border rounded-2xl overflow-hidden bg-card" dir="ltr">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead>RFQ No.</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-center">Suppliers</TableHead>
                      <TableHead className="text-center">Quotes</TableHead>
                      <TableHead className="text-center">PO Coverage</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead className="w-[130px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRfqs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                          No RFQs match your search
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRfqs.map((rfq: any) => {
                        const overdue =
                          rfq.dueDate && rfq.status !== "awarded" && new Date(rfq.dueDate) < new Date(new Date().toDateString());
                        return (
                          <TableRow
                            key={rfq.id}
                            className="cursor-pointer"
                            onClick={() => navigate(`/projects/${projectId}/rfqs/${rfq.id}`)}
                          >
                            <TableCell className="font-mono font-bold text-sm whitespace-nowrap">{rfq.rfqNumber}</TableCell>
                            <TableCell className="font-medium max-w-[280px] truncate">{rfq.title}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={cn("text-[11px] font-bold", RFQ_STATUS_STYLES[rfq.status] || RFQ_STATUS_STYLES.sent)}>
                                {RFQ_STATUS_LABELS[rfq.status] || "Sent"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center font-bold">{rfq.itemsCount || 0}</TableCell>
                            <TableCell className="text-center font-bold">{rfq.suppliersCount || 0}</TableCell>
                            <TableCell className="text-center font-bold text-amber-600">{rfq.quotationsCount || 0}</TableCell>
                            <TableCell className="text-center">
                              <span
                                className={cn(
                                  "text-xs font-bold",
                                  (rfq.orderedItemsCount || 0) >= (rfq.itemsCount || 0) && (rfq.itemsCount || 0) > 0
                                    ? "text-emerald-600"
                                    : "text-amber-700"
                                )}
                              >
                                {rfq.orderedItemsCount || 0}/{rfq.itemsCount || 0}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs">
                              {rfq.dueDate ? (
                                <span className={cn(overdue && "text-red-600 font-bold")}>
                                  {rfq.dueDate}
                                  {overdue && " (overdue)"}
                                </span>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{rfq.creatorName || "System"}</TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Compare & award"
                                  onClick={() => navigate(`/projects/${projectId}/rfqs/${rfq.id}?tab=award`)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Award className="w-4 h-4 text-primary" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Add quotation"
                                  onClick={() => {
                                    setSelectedRfqForQuote(rfq.id);
                                    setSelectedSupplierForQuote(undefined);
                                    setQuotationFormOpen(true);
                                  }}
                                  className="h-8 w-8 p-0"
                                >
                                  <Plus className="w-4 h-4 text-amber-600" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Delete"
                                  disabled={rfq.status === "awarded"}
                                  onClick={() => setRfqToDelete(rfq)}
                                  className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <AlertDialog open={!!rfqToDelete} onOpenChange={(open) => !open && setRfqToDelete(null)}>
            <AlertDialogContent dir="ltr">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete RFQ {rfqToDelete?.rfqNumber}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the RFQ with its items and quotations. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    if (rfqToDelete) deleteRfqMutation.mutate(rfqToDelete.id);
                    setRfqToDelete(null);
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        {/* ==================== TAB 3: QUOTATIONS ==================== */}
        <TabsContent value="quotations" className="space-y-4 outline-none">
          {quotations.length === 0 ? (
            <div className="text-center p-12 border-2 border-dashed border-muted/50 rounded-[1.5rem] bg-muted/5 space-y-3">
              <DollarSign className="w-12 h-12 text-muted-foreground/50 mx-auto" />
              <p className="font-black text-lg text-foreground">لا توجد عروض أسعار مسجلة</p>
              <p className="text-xs text-muted-foreground">
                سجّل عروض الأسعار المستلمة من الموردين لبدء المقارنة والترسية
              </p>
              <Button
                onClick={() => {
                  setSelectedRfqForQuote(undefined);
                  setSelectedSupplierForQuote(undefined);
                  setQuotationFormOpen(true);
                }}
                className="rounded-full text-xs font-bold gap-1.5 px-6 mt-2 bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Plus className="w-4 h-4" />
                تسجيل عرض سعر جديد
              </Button>
            </div>
          ) : (
            <div className="border border-border/60 rounded-[1.5rem] overflow-hidden bg-background shadow-md">
              <table className="w-full text-right text-xs">
                <thead className="bg-muted/30 border-b font-bold text-foreground">
                  <tr>
                    <th className="p-3.5">المورد</th>
                    <th className="p-3.5">طلب عرض السعر (RFQ)</th>
                    <th className="p-3.5">رقم العرض</th>
                    <th className="p-3.5">المبلغ الإجمالي</th>
                    <th className="p-3.5">مدة التوريد</th>
                    <th className="p-3.5">الحالة</th>
                    <th className="p-3.5 text-center">المستند</th>
                    <th className="p-3.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {quotations.map((quote: any) => (
                    <tr key={quote.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => setViewQuotationId(quote.id)}>
                      <td className="p-3.5">
                        <div className="font-bold text-sm text-foreground">
                          {quote.supplierName}
                        </div>
                        {quote.contactPerson && (
                          <p className="text-[10px] text-muted-foreground">{quote.contactPerson}</p>
                        )}
                      </td>
                      <td className="p-3.5">
                        <span className="font-semibold text-primary">{quote.rfqTitle || "طلب تسعير"}</span>
                        {quote.rfqNumber && (
                          <span className="text-[10px] text-muted-foreground block font-mono">
                            {quote.rfqNumber}
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-muted-foreground">
                        {quote.quotationNumber || "-"}
                      </td>
                      <td className="p-3.5 font-black text-sm text-emerald-600 dark:text-emerald-400">
                        {Number(quote.totalAmount || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        SAR
                      </td>
                      <td className="p-3.5 text-muted-foreground">
                        {quote.leadTimeDays ? `${quote.leadTimeDays} يوم` : "-"}
                      </td>
                      <td className="p-3.5">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] font-bold ${
                            quote.status === "accepted"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : quote.status === "rejected"
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          }`}
                        >
                          {quote.status === "accepted"
                            ? "مقبول / فائز"
                            : quote.status === "rejected"
                            ? "مرفوض"
                            : "قيد المراجعة"}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-center">
                        {quote.document ? (
                          <a
                            href={quote.document.fileUrl || quote.document.fileData}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title={quote.document.fileName || quote.document.name}
                            className="inline-flex items-center gap-1 text-primary font-bold hover:underline"
                          >
                            <FileText className="w-4 h-4" />
                            عرض
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-3.5 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/projects/${projectId}/rfqs/${quote.rfqId}?tab=award`);
                          }}
                          className="rounded-xl text-xs font-bold gap-1.5 h-8 border-primary/30 text-primary hover:bg-primary/5"
                        >
                          <Award className="w-3.5 h-3.5" />
                          المقارنة والترسية
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ==================== TAB 4: PURCHASE ORDERS ==================== */}
        <TabsContent value="purchase_orders" className="space-y-4 outline-none">
          {purchaseOrders.length === 0 ? (
            <div className="text-center p-12 border-2 border-dashed border-muted/50 rounded-[1.5rem] bg-muted/5 space-y-3">
              <ShoppingCart className="w-12 h-12 text-muted-foreground/50 mx-auto" />
              <p className="font-black text-lg text-foreground">لا توجد أوامر شراء صادرة</p>
              <p className="text-xs text-muted-foreground">
                يمكنك إصدار أمر شراء تلقائياً من عرض السعر الفائز أو إنشاؤه يدوياً
              </p>
              <Button onClick={() => navigate(`/projects/${projectId}/purchase-orders/new`)} className="rounded-full text-xs font-bold gap-1.5 px-6 mt-2">
                <Plus className="w-4 h-4" />
                إنشاء أمر شراء جديد
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
              {purchaseOrders.map((po: any) => (
                <Card key={po.id} className="rounded-[1.5rem] border border-border/60 shadow-md hover:shadow-xl transition-all overflow-hidden flex flex-col justify-between">
                  <CardHeader className="p-4 pb-2 border-b bg-muted/20">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Badge variant="outline" className="text-[10px] font-mono font-bold text-primary">
                          {po.poNumber}
                        </Badge>
                        <CardTitle className="text-base font-bold mt-1 text-foreground line-clamp-1">
                          {po.title}
                        </CardTitle>
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] font-bold", PO_STATUS_STYLES[po.status] || PO_STATUS_STYLES.draft)}
                      >
                        {PO_STATUS_LABELS[po.status] || po.status}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-3 flex-1 text-xs">
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-[11px]">المورد المستهدف:</p>
                      <p className="font-bold text-sm text-foreground flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-primary" />
                        {po.supplierName}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-muted/30 border border-border/40 space-y-1">
                      <div className="flex justify-between text-muted-foreground text-[11px]">
                        <span>عدد البنود:</span>
                        <span className="font-semibold text-foreground">{po.itemsCount || 0} بنود</span>
                      </div>
                      <div className="flex justify-between font-black text-sm text-primary pt-1 border-t border-border/40">
                        <span>الإجمالي:</span>
                        <span>
                          {Number(po.totalAmount || 0).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          SAR
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>تاريخ الطلب: {po.orderDate}</span>
                      {po.expectedDeliveryDate && <span>التسليم: {po.expectedDeliveryDate}</span>}
                    </div>
                  </CardContent>

                  <div className="p-3 border-t bg-muted/10 flex items-center justify-between gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => navigate(`/projects/${projectId}/purchase-orders/${po.id}`)}
                      className="rounded-xl text-xs font-bold gap-1.5 flex-1 h-8 bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      فتح أمر الشراء
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPoToDelete(po)}
                      className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Procurement Dialogs */}
      <RfqFormDialog
        open={rfqFormOpen}
        onOpenChange={setRfqFormOpen}
        projectId={projectId || ""}
        onQuickAddSupplier={() => {
          setEditingSupplier(null);
          setSupplierFormOpen(true);
        }}
        onQuickAddMaterial={() => {
          setEditingMaterial(null);
          setMaterialFormOpen(true);
        }}
      />

      <AlertDialog open={!!poToDelete} onOpenChange={(open) => !open && setPoToDelete(null)}>
        <AlertDialogContent dir="ltr">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete purchase order {poToDelete?.poNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the purchase order and its items. Its RFQ items will show as having no PO again. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (poToDelete) deletePoMutation.mutate(poToDelete.id);
                setPoToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <QuotationDetailsDialog quotationId={viewQuotationId} onOpenChange={(o) => !o && setViewQuotationId(null)} />
      <QuotationFormDialog
        open={quotationFormOpen}
        onOpenChange={setQuotationFormOpen}
        projectId={projectId || ""}
        rfqId={selectedRfqForQuote}
        supplierId={selectedSupplierForQuote}
      />


      <PoDetailsPrintDialog
        open={poPrintOpen}
        onOpenChange={setPoPrintOpen}
        poId={selectedPoId}
        projectId={projectId || ""}
      />

      {/* Dialogs */}
      {projectId && (
        <>
          <SupplierFormDialog
            isOpen={supplierFormOpen}
            onOpenChange={setSupplierFormOpen}
            projectId={projectId}
            supplier={editingSupplier}
          />
          <MaterialFormDialog
            isOpen={materialFormOpen}
            onOpenChange={setMaterialFormOpen}
            projectId={projectId}
            material={editingMaterial}
            supplierId={linkingToSupplierId}
          />
          {linkingSupplierId && (
            <LinkMaterialDialog
              isOpen={linkExistingOpen}
              onOpenChange={setLinkExistingOpen}
              projectId={projectId}
              supplierId={linkingSupplierId}
              availableMaterials={materials}
              alreadyLinkedIds={[]} // We'll handle this inside if needed
            />
          )}
        </>
      )}
    </div>
  );
}

interface SupplierCardProps {
  supplier: Supplier;
  projectId: string;
  onEdit: () => void;
  onDelete: () => void;
  onAddMaterial: () => void;
  onLinkMaterial: () => void;
  onEditMaterial: (material: Material) => void;
}

function SupplierCard({ supplier, projectId, onEdit, onDelete, onAddMaterial, onLinkMaterial, onEditMaterial }: SupplierCardProps) {
  const [, navigate] = useLocation();
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string, name: string, type?: string } | null>(null);
  const [editingLink, setEditingLink] = useState<(MaterialSupplier & { material: Material }) | null>(null);
  const [isEditLinkOpen, setIsEditLinkOpen] = useState(false);

  const { data: supplierMaterials = [], isLoading } = useQuery<(MaterialSupplier & { material: Material, totalDelivered?: number })[]>({
    queryKey: ["/api/suppliers", supplier.id, "materials"],
    enabled: !!supplier.id,
  });

  const { data: attachments = [], isLoading: isLoadingAttachments } = useQuery<(SupplierAttachment & { document: Document })[]>({
    queryKey: ["/api/suppliers", supplier.id, "attachments"],
    enabled: isDetailsOpen,
  });

  const { data: supplierRequests = [], isLoading: isLoadingRequests } = useQuery<any[]>({
    queryKey: ["/api/suppliers", supplier.id, "requests"],
    enabled: !!supplier.id,
  });

  const isApproved = supplierRequests.some(req => 
    req.approvalStatusCode === "A" ||
    req.approvalStatusCode === "B" ||
    req.approvalStatusCode?.startsWith("A") ||
    req.approvalStatusCode?.startsWith("B") ||
    req.currentStatus === "Approved" || 
    req.currentStatus?.toLowerCase().includes("approved")
  );

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const removeAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      await apiRequest("DELETE", `/api/suppliers/attachments/${attachmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", supplier.id, "attachments"] });
      toast({ title: "Success", description: "Attachment removed successfully" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      await apiRequest("DELETE", `/api/material-suppliers/${linkId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", supplier.id, "materials"] });
      toast({ title: "Unlinked", description: "Material removed from supplier catalog" });
    }
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("supplierId") === supplier.id) {
      setIsDetailsOpen(true);
    }
  }, [supplier.id]);

  useEffect(() => {
    if (!isDetailsOpen) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("supplierId") === supplier.id) {
        params.delete("supplierId");
        const newSearch = params.toString();
        const newPath = window.location.pathname + (newSearch ? `?${newSearch}` : "");
        window.history.replaceState({}, "", newPath);
      }
    }
  }, [isDetailsOpen, supplier.id]);

  return (
    <>
      <Card
        className="overflow-hidden border border-border/40 shadow-lg group hover:shadow-2xl hover:scale-[1.01] transition-all duration-500 flex flex-col min-h-[320px] bg-white dark:bg-card/50 rounded-[1.5rem] cursor-pointer"
        onClick={() => setIsDetailsOpen(true)}
      >
        <CardHeader className="p-6 pb-4 flex-grow">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 bg-white dark:bg-black/20 border-2 border-primary/10 rounded-2xl shadow-sm flex items-center justify-center p-1.5 shrink-0 transition-transform group-hover:scale-105 group-hover:shadow-md">
                {supplier.logoUrl ? (
                  <img 
                    src={supplier.logoUrl} 
                    alt={supplier.supplierName} 
                    className="w-full h-full object-contain" 
                    onError={(e) => {
                      // Fallback if image fails to load
                      (e.target as HTMLImageElement).style.display = 'none';
                      e.currentTarget.parentElement?.classList.add('bg-primary/5');
                      e.currentTarget.parentElement!.innerHTML = `<div class="bg-primary/10 w-full h-full rounded-xl flex items-center justify-center"><span class="text-primary font-black text-xl">${(supplier.supplierName || "?").substring(0, 2).toUpperCase()}</span></div>`;
                    }}
                  />
                ) : (
                  <div className="bg-primary/10 w-full h-full rounded-xl flex items-center justify-center">
                    <span className="text-primary font-black text-xl">
                      {(supplier.supplierName || "?").substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                <CardTitle className="text-base font-bold leading-tight text-foreground group-hover:text-primary transition-colors uppercase tracking-tight line-clamp-1">{supplier.supplierName}</CardTitle>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[10px] font-black uppercase tracking-[0.05em] rounded-full px-3 py-0.5 h-auto border-2 transition-colors",
                    isApproved 
                      ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
                      : "bg-amber-50 text-amber-600 border-amber-200"
                  )}
                >
                  {isApproved ? "Approved Vendor" : "Pending Approval"}
                </Badge>
              </div>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-xl hover:bg-muted">
                    <MoreVertical className="w-5 h-5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-xl p-1">
                  <DropdownMenuItem 
                    onClick={onEdit} 
                    disabled={isApproved}
                    className="rounded-lg font-bold text-xs"
                    title={isApproved ? "Approved suppliers cannot be edited" : undefined}
                  >
                    <Edit2 className="w-4 h-4 mr-2.5 text-primary" /> Edit Supplier
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={onDelete} 
                    disabled={isApproved}
                    className="rounded-lg font-bold text-xs text-destructive focus:text-destructive"
                    title={isApproved ? "Approved suppliers cannot be removed" : undefined}
                  >
                    <Trash2 className="w-4 h-4 mr-2.5" /> Remove Vendor
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6 pt-5 border-t border-muted/50">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground font-black uppercase tracking-widest opacity-60 text-[8px] flex items-center gap-1">
                <Mail className="w-3 h-3" /> Email
              </span>
              <p className="text-[11px] font-bold text-foreground truncate bg-muted/40 px-3 py-1.5 rounded-[1rem] border border-border/40">{supplier.email || "N/A"}</p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground font-black uppercase tracking-widest opacity-60 text-[8px] flex items-center gap-1">
                <Phone className="w-3 h-3" /> Phone
              </span>
              <p className="text-[11px] font-bold text-foreground truncate bg-muted/40 px-3 py-1.5 rounded-[1rem] border border-border/40">{supplier.phone || "N/A"}</p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground font-black uppercase tracking-widest opacity-60 text-[8px] flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Address
              </span>
              <p className="text-[11px] font-bold text-foreground line-clamp-1 bg-muted/40 px-3 py-1.5 rounded-[1rem] border border-border/40">{supplier.address || "N/A"}</p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground font-black uppercase tracking-widest opacity-60 text-[8px] flex items-center gap-1">
                <Hash className="w-3 h-3" /> Tax ID
              </span>
              <p className="text-[11px] font-bold text-foreground truncate bg-muted/40 px-3 py-1.5 rounded-[1rem] border border-border/40">{supplier.taxNumber || "N/A"}</p>
            </div>
          </div>

          {supplierRequests.length > 0 && (
            <div 
              className="mt-4 pt-3 border-t border-dashed border-border/40 flex flex-wrap gap-2 items-center" 
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-primary" /> SSR:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {supplierRequests.map((req) => (
                  <Badge
                    key={req.requestId}
                    variant="secondary"
                    className="text-[9px] font-bold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/10 rounded-full px-2 py-0.5 transition-all cursor-pointer hover:scale-105 active:scale-95 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/requests/${req.requestId}`);
                    }}
                    title={req.title}
                  >
                    {req.requestNumber}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="bg-muted/30 dark:bg-muted/5 px-6 py-5 cursor-pointer border-t border-border/40 mt-auto hover:bg-muted/50 transition-colors flex items-center justify-between rounded-b-[1.5rem]">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded-[0.8rem]">
                <Package className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                {supplierMaterials.length} Materials
              </span>
            </div>
            <Badge variant="outline" className="text-[10px] font-black border-primary/30 text-primary bg-primary/5 rounded-full px-4 py-1">
              View Catalog
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl rounded-[1.5rem] p-0 overflow-hidden border-none shadow-2xl bg-[#f8f9fa] dark:bg-background">
          <div className="relative bg-gradient-to-br from-primary to-primary/80 p-6 md:p-8 text-white shrink-0 overflow-hidden">
            <div className="absolute top-0 right-0 p-20 bg-white/10 blur-3xl rounded-full -mr-20 -mt-20 animate-pulse" />
            <div className="relative flex items-center gap-6">
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-white p-3 shadow-2xl shrink-0 flex items-center justify-center transition-transform hover:scale-105 duration-500">
                {supplier.logoUrl ? (
                  <img src={supplier.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <Users className="w-12 h-12 md:w-14 md:h-14 text-primary" />
                )}
              </div>
              <div className="flex-1">
                <h2 className="text-xl md:text-2xl font-bold tracking-tight mb-2 drop-shadow-lg leading-tight">{supplier.supplierName}</h2>
                <div className="flex flex-wrap items-center gap-2 md:gap-3 text-white/90">
                  <div className="flex items-center gap-2 bg-white/15 px-3 py-1.5 rounded-full backdrop-blur-md text-[11px] md:text-xs font-semibold shadow-sm transition-all hover:bg-white/25 shrink-0">
                    <Mail className="w-3.5 h-3.5" /> {supplier.email || "No email"}
                  </div>
                  <div className="flex items-center gap-2 bg-white/15 px-3 py-1.5 rounded-full backdrop-blur-md text-[11px] md:text-xs font-semibold shadow-sm transition-all hover:bg-white/25 shrink-0">
                    <Phone className="w-3.5 h-3.5" /> {supplier.phone || "No phone"}
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="secondary" 
                        className="h-8 bg-white text-primary hover:bg-white/95 border-none rounded-full px-4 gap-2 shadow-lg transition-all hover:scale-105 active:scale-95 group/doc shrink-0"
                      >
                        <div className="relative">
                          <FileText className="w-3.5 h-3.5 transition-transform group-hover/doc:rotate-12" />
                          {attachments.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full animate-pulse border-2 border-white" />
                          )}
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider">{attachments.length} Docs</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[380px] rounded-[1.5rem] p-3 shadow-2xl border-none bg-white/95 backdrop-blur-xl">
                         <div className="px-4 py-3 border-b border-muted/50 mb-2">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Supplier Files & Certificates</p>
                         </div>
                         {attachments.length === 0 ? (
                            <div className="p-12 text-center">
                               <div className="bg-muted/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <FileText className="w-8 h-8 text-muted-foreground/20" />
                               </div>
                               <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider opacity-40">No documents</p>
                            </div>
                         ) : (
                            <div className="space-y-1.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                              {attachments.map(att => (
                                 <DropdownMenuItem 
                                    key={att.id} 
                                    className="rounded-2xl p-3 cursor-pointer focus:bg-primary/5 group" 
                                    asChild
                                 >
                                    <div className="flex items-center justify-between w-full">
                                       <div className="flex items-center gap-4 min-w-0 flex-1">
                                          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center group-focus:bg-primary/20 shrink-0">
                                             <FileText className="w-4 h-4 text-primary" />
                                          </div>
                                           <div className="min-w-0 flex-1">
                                               <p className="truncate text-sm font-bold text-foreground leading-tight tracking-tight">
                                                 {att.document.fileName || att.document.name}
                                              </p>
                                              <div className="flex items-center gap-2.5 mt-1.5">
                                                 {att.category && (
                                                    <Badge 
                                                       variant="outline" 
                                                       className="text-[9px] py-0 px-2 h-4 font-bold border-primary/20 text-primary bg-primary/5 uppercase tracking-tight"
                                                    >
                                                       {att.category.split(' (')[0]}
                                                    </Badge>
                                                 )}
                                                 <span className="text-[9px] text-muted-foreground/50 font-bold tabular-nums uppercase">
                                                    {formatFileSize(att.document.size || (att.document as any).fileSize)}
                                                 </span>
                                              </div>
                                           </div>
                                       </div>
                                       <div className="flex items-center gap-1.5 shrink-0 ml-3">
                                          <Button
                                             variant="ghost"
                                             size="icon"
                                             className="h-8 w-8 rounded-xl hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
                                             onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setPreviewFile({ 
                                                   url: att.document.fileUrl || att.document.fileData, 
                                                   name: att.document.fileName || att.document.name,
                                                   type: att.document.type
                                                });
                                             }}
                                          >
                                             <Eye className="w-4 h-4" />
                                          </Button>
                                          <a 
                                             href={att.document.fileUrl || att.document.fileData} 
                                             target="_blank" 
                                             rel="noopener noreferrer" 
                                             onClick={(e) => e.stopPropagation()}
                                             className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-primary/10 hover:text-primary transition-all text-muted-foreground/40 active:scale-90"
                                          >
                                             <ExternalLink className="w-4 h-4" />
                                          </a>
                                       </div>
                                    </div>
                                 </DropdownMenuItem>
                              ))}
                            </div>
                         )}
                      </DropdownMenuContent>
                   </DropdownMenu>

                   {supplierRequests.length === 1 ? (
                     <Button 
                       variant="secondary" 
                       onClick={() => navigate(`/requests/${supplierRequests[0].requestId}`)}
                       className="h-8 bg-white text-primary hover:bg-white/95 border-none rounded-full px-4 gap-2 shadow-lg transition-all hover:scale-105 active:scale-95 group/req shrink-0"
                     >
                       <div className="relative">
                         <FileText className="w-3.5 h-3.5 transition-transform group-hover/req:rotate-12" />
                         <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full border-2 border-white animate-pulse" />
                       </div>
                       <span className="text-[10px] font-bold uppercase tracking-wider">{supplierRequests[0].requestNumber}</span>
                       <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-60" />
                     </Button>
                   ) : supplierRequests.length > 1 ? (
                     <DropdownMenu>
                       <DropdownMenuTrigger asChild>
                         <Button 
                           variant="secondary" 
                           className="h-8 bg-white text-primary hover:bg-white/95 border-none rounded-full px-4 gap-2 shadow-lg transition-all hover:scale-105 active:scale-95 group/req shrink-0"
                         >
                           <div className="relative">
                             <FileText className="w-3.5 h-3.5 transition-transform group-hover/req:rotate-12" />
                             <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full border-2 border-white animate-pulse" />
                           </div>
                           <span className="text-[10px] font-bold uppercase tracking-wider">{supplierRequests.length} SSRs</span>
                         </Button>
                       </DropdownMenuTrigger>
                       <DropdownMenuContent align="start" className="w-[380px] rounded-[1.5rem] p-3 shadow-2xl border-none bg-white/95 backdrop-blur-xl">
                         <div className="px-4 py-3 border-b border-muted/50 mb-2">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Linked SSR Requests</p>
                         </div>
                         <div className="space-y-1.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                           {supplierRequests.map(req => (
                              <DropdownMenuItem 
                                 key={req.requestId} 
                                 className="rounded-2xl p-3 cursor-pointer focus:bg-primary/5 group" 
                                 onClick={() => navigate(`/requests/${req.requestId}`)}
                              >
                                 <div className="flex items-center gap-4 min-w-0 flex-1">
                                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center group-focus:bg-primary/20 shrink-0">
                                       <FileText className="w-4 h-4 text-primary" />
                                    </div>
                                     <div className="min-w-0 flex-1">
                                         <p className="truncate text-sm font-bold text-foreground leading-tight tracking-tight">
                                           {req.requestNumber}
                                        </p>
                                        <p className="truncate text-[10px] text-muted-foreground/80 mt-1">
                                           {req.title}
                                        </p>
                                     </div>
                                 </div>
                                 <ExternalLink className="w-4 h-4 text-muted-foreground/30 ml-2 group-hover:text-primary transition-colors" />
                              </DropdownMenuItem>
                           ))}
                         </div>
                       </DropdownMenuContent>
                     </DropdownMenu>
                   ) : null}

                </div>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
            
            {/* Complete Supplier Data Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white p-5 rounded-[1.2rem] border border-border/40 shadow-sm">
              <div className="flex flex-col gap-1.5 text-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1.5"><Users className="w-3.5 h-3.5" /> Contact Person</span>
                <p className="text-sm font-bold text-foreground truncate" title={supplier.contactPerson || "N/A"}>{supplier.contactPerson || "N/A"}</p>
              </div>
              <div className="flex flex-col gap-1.5 text-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Address</span>
                <p className="text-sm font-bold text-foreground line-clamp-1" title={supplier.address || "N/A"}>{supplier.address || "N/A"}</p>
              </div>
              <div className="flex flex-col gap-1.5 text-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1.5"><Hash className="w-3.5 h-3.5" /> Tax Number</span>
                <p className="text-sm font-bold text-foreground font-mono truncate" title={supplier.taxNumber || "N/A"}>{supplier.taxNumber || "N/A"}</p>
              </div>
              <div className="flex flex-col gap-1.5 text-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Experience</span>
                <p className="text-sm font-bold text-foreground">{supplier.experienceYears != null ? `${supplier.experienceYears} Years` : "N/A"}</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 bg-primary/10 rounded-xl">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold tracking-tight text-foreground/90">Supplied Materials</h3>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider opacity-70">Verified Product Catalog</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLinkMaterial();
                    }}
                    className="rounded-full h-9 px-4 text-[10px] font-bold uppercase tracking-wider border-primary/20 text-primary hover:bg-primary/5 transition-all active:scale-95 shadow-sm"
                  >
                    <Link2 className="w-3.5 h-3.5 mr-1.5" /> Link Existing
                  </Button>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddMaterial();
                    }}
                    className="rounded-full h-9 px-5 text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/10 transition-all hover:scale-105 active:scale-95"
                  >
                    <PlusCircle className="w-3.5 h-3.5 mr-1.5" /> Add New
                  </Button>
                </div>
              </div>

              <div className="grid gap-3">
                {isLoading ? (
                  <div className="flex justify-center py-12"><LoadingIcon size={40} /></div>
                ) : supplierMaterials.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 bg-white/50 border-2 border-dashed border-border rounded-[2rem] text-muted-foreground/30 transition-colors hover:border-primary/10">
                    <Package className="w-12 h-12 mb-3 opacity-10" />
                    <p className="text-[11px] font-bold uppercase tracking-wider">No materials linked yet</p>
                    <p className="text-[9px] font-semibold uppercase tracking-tight mt-1">Start building the vendor catalog</p>
                  </div>
                ) : (
                  supplierMaterials.map((sm) => (
                    <div 
                      key={sm.id} 
                      className="flex items-center justify-between p-4 bg-white hover:shadow-lg hover:-translate-y-0.5 rounded-[1.2rem] border border-white transition-all duration-300 group/item shadow-sm"
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="w-12 h-12 rounded-[1rem] bg-primary/10 flex items-center justify-center group-hover/item:bg-primary/20 transition-all duration-300 shrink-0 shadow-inner">
                          <Package className="w-6 h-6 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1 px-1">
                          <p className="font-semibold text-foreground/90 text-sm leading-snug tracking-tight mb-1.5 line-clamp-2">
                            {sm.material.materialName}
                          </p>
                          <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider bg-muted/40 border-muted text-muted-foreground px-2 py-0.5 rounded-full">
                             {sm.material.category}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6 ml-4">
                        <div className="flex gap-4">
                          {sm.totalDelivered !== undefined && (
                            <div className="text-center px-3 py-1.5 bg-primary/5 rounded-xl border border-primary/5">
                              <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-0.5">Delivered</p>
                              <p className="text-xs font-bold text-primary tabular-nums tracking-tight">
                                {sm.totalDelivered} <span className="text-[9px] opacity-60 uppercase ml-0.5">{sm.material.unit}</span>
                              </p>
                            </div>
                          )}
                          {sm.lastPrice && (
                            <div className="text-center px-3 py-1.5 bg-emerald-50 rounded-xl border border-emerald-100/50">
                              <p className="text-[9px] font-bold text-emerald-700/60 uppercase tracking-wider mb-0.5">Last Price</p>
                              <p className="text-xs font-bold text-emerald-600 tabular-nums tracking-tight">
                                {Number(sm.lastPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-[9px] opacity-60 ml-0.5">$</span>
                              </p>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1.5 border-l border-muted/50 pl-4">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditMaterial(sm.material);
                            }}
                            className="h-8 w-8 text-amber-500/40 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-all active:scale-90"
                            title="Edit Base Material Info"
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingLink(sm);
                              setIsEditLinkOpen(true);
                            }}
                            className="h-8 w-8 text-primary/40 hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-90"
                            title="Edit Price & Lead Time"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              unlinkMutation.mutate(sm.id);
                            }}
                            className="h-8 w-8 text-destructive/30 hover:text-white hover:bg-destructive rounded-lg transition-all active:scale-90"
                            title="Unlink Material"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Material Link Dialog */}
      <EditMaterialLinkDialog 
        isOpen={isEditLinkOpen}
        onOpenChange={setIsEditLinkOpen}
        supplierId={supplier.id}
        link={editingLink}
      />

      {/* File Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-5xl h-[85vh] p-0 overflow-hidden border-none shadow-2xl rounded-3xl flex flex-col">
          <DialogHeader className="py-2.5 px-4 border-b bg-muted/5 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-1.5 rounded-lg">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-sm font-black truncate max-w-md">
                  {previewFile?.name}
                </DialogTitle>
                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Document Preview</p>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 bg-muted/20 flex items-center justify-center overflow-hidden">
            {previewFile?.url ? (
              (previewFile.url.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(previewFile.url)) ? (
                <img 
                  src={previewFile.url} 
                  alt={previewFile.name} 
                  className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" 
                />
              ) : (
                <iframe 
                  src={previewFile.url} 
                  className="w-full h-full border-none bg-white" 
                  title="Document Preview"
                />
              )
            ) : (
              <div className="text-center p-12">
                <FileText className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-sm text-muted-foreground font-bold">Preview not available for this file type</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


function X(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}
