import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  UserPlus,
  Package,
  Calendar,
  FileText,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Send,
  Building2,
  AlertCircle,
  Save,
  Search,
  Users,
  X,
} from "lucide-react";
import { MaterialFormDialog } from "@/components/material-form-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Material, Supplier, Project } from "@shared/schema";
import { SupplierFormDialog } from "@/components/supplier-form-dialog";

interface RfqItemInput {
  materialId?: string;
  materialName?: string;
  itemDescription: string;
  quantity: string;
  unit: string;
  notes?: string;
}

function MaterialCombobox({
  materials,
  selectedMaterialId,
  materialName,
  onSelectMaterial,
  onAddCustomMaterial,
}: {
  materials: Material[];
  selectedMaterialId?: string;
  materialName?: string;
  onSelectMaterial: (mat: Material) => void;
  onAddCustomMaterial: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedMat = materials.find((m) => m.id === selectedMaterialId);
  const displayName = selectedMat ? selectedMat.materialName : materialName;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full h-9 rounded-lg text-xs justify-between font-medium bg-background border-input hover:bg-muted/50 transition-all px-2.5",
            !displayName && "text-muted-foreground font-normal"
          )}
        >
          <span className="truncate flex items-center gap-1.5">
            {displayName || "اختر أو اكتب مادة..."}
            {selectedMat && (selectedMat as any).isApproved && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500/10 shrink-0" />
            )}
          </span>
          <ChevronsUpDown className="mr-1 h-3.5 w-3.5 shrink-0 opacity-40" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] sm:w-[380px] p-0 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden" align="start">
        <Command className="w-full">
          <CommandInput
            placeholder="Search catalog or type new material name..."
            value={search}
            onValueChange={setSearch}
            className="h-11 text-xs border-none ring-0 focus:ring-0"
          />
          <CommandList className="custom-scrollbar max-h-60">
            <CommandEmpty className="p-3">
              {search.trim() ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs font-bold text-primary py-2.5 px-3 h-auto hover:bg-primary/10 rounded-xl text-left"
                  onClick={() => {
                    onAddCustomMaterial(search.trim());
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Plus className="w-4 h-4 mr-2 shrink-0" />
                  Add "{search.trim()}" as New Material
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">No materials found in catalog</p>
              )}
            </CommandEmpty>
            <CommandGroup>
              {search.trim() && (
                <CommandItem
                  value={search}
                  onSelect={() => {
                    onAddCustomMaterial(search.trim());
                    setOpen(false);
                    setSearch("");
                  }}
                  className="text-xs py-2.5 px-3 font-bold text-primary cursor-pointer hover:bg-primary/5 flex items-center rounded-lg"
                >
                  <Plus className="w-4 h-4 mr-2 shrink-0" />
                  Add "{search.trim()}" as New Material
                </CommandItem>
              )}
              {materials.map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.materialName}
                  onSelect={() => {
                    onSelectMaterial(m);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="text-xs py-2.5 px-3 flex items-center justify-between cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
                      {m.materialName}
                      {(m as any).isApproved && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500/10 shrink-0" />
                      )}
                    </span>
                    {m.category && (
                      <span className="text-[10px] text-muted-foreground truncate">{m.category}</span>
                    )}
                  </div>
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 text-primary shrink-0 ml-2",
                      m.id === selectedMaterialId ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function ProjectCreateRfq() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId || "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [items, setItems] = useState<RfqItemInput[]>([
    { materialName: "", itemDescription: "", quantity: "1", unit: "pcs", notes: "" },
  ]);

  const [newMaterialDialog, setNewMaterialDialog] = useState<{ open: boolean; name: string; index: number | null }>({
    open: false,
    name: "",
    index: null,
  });
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [supplierSelectDialogOpen, setSupplierSelectDialogOpen] = useState(false);
  const [supplierSearchQuery, setSupplierSearchQuery] = useState("");

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ["/api/materials", { projectId }],
    enabled: !!projectId,
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers", { projectId }],
    enabled: !!projectId,
  });

  const selectedSuppliers = suppliers.filter((s) => selectedSupplierIds.includes(s.id));

  const filteredSuppliers = suppliers.filter((s) => {
    const q = supplierSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      s.supplierName?.toLowerCase().includes(q) ||
      s.contactPerson?.toLowerCase().includes(q) ||
      s.phone?.toLowerCase().includes(q) ||
      s.category?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    );
  });

  const handleRemoveSupplier = (supplierId: string) => {
    setSelectedSupplierIds((prev) => prev.filter((id) => id !== supplierId));
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { materialName: "", itemDescription: "", quantity: "1", unit: "pcs", notes: "" },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof RfqItemInput, value: string) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSelectMaterial = (index: number, material: Material) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        materialId: material.id,
        materialName: material.materialName,
        itemDescription: material.description || "",
        unit: material.unit || updated[index].unit || "pcs",
      };
      return updated;
    });
  };

  const handleAddCustomMaterial = (index: number, materialName: string) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        materialId: "",
        materialName: materialName,
        itemDescription: "",
      };
      return updated;
    });
  };

  const openNewMaterial = (name: string, index: number | null) =>
    setNewMaterialDialog({ open: true, name, index });

  const applyNewMaterial = (mat: Material) => {
    setItems((prev) => {
      const row = {
        materialId: mat.id,
        materialName: mat.materialName,
        itemDescription: mat.description || "",
        unit: mat.unit || "pcs",
      };
      const updated = [...prev];
      let target = newMaterialDialog.index;
      if (target === null) {
        const empty = updated.findIndex((i) => !i.materialId && !i.materialName?.trim() && !i.itemDescription.trim());
        target = empty >= 0 ? empty : -1;
      }
      if (target === -1 || target === null) {
        updated.push({ quantity: "1", notes: "", ...row });
      } else {
        updated[target] = { ...updated[target], ...row };
      }
      return updated;
    });
  };

  const toggleSupplier = (supplierId: string) => {
    setSelectedSupplierIds((prev) =>
      prev.includes(supplierId)
        ? prev.filter((id) => id !== supplierId)
        : [...prev, supplierId]
    );
  };

  const handleSelectAllSuppliers = () => {
    if (selectedSupplierIds.length === suppliers.length) {
      setSelectedSupplierIds([]);
    } else {
      setSelectedSupplierIds(suppliers.map((s) => s.id));
    }
  };

  const createRfqMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("عنوان طلب عرض السعر مطلوب");
      const validItems = items.filter(
        (i) => (i.materialName?.trim() || i.itemDescription.trim()) && Number(i.quantity) > 0
      );
      if (validItems.length === 0) {
        throw new Error("يرجى إضافة بند واحد على الأقل مع تحديد الكمية واسم المادة");
      }

      const payload = {
        title,
        description,
        dueDate: dueDate || null,
        supplierIds: selectedSupplierIds,
        items: validItems.map((i) => {
          return {
            materialId: i.materialId || null,
            itemName: i.materialName?.trim() || null,
            itemDescription: i.itemDescription.trim(),
            quantity: i.quantity,
            unit: i.unit || "pcs",
            notes: i.notes || null,
          };
        }),
      };

      const res = await apiRequest("POST", `/api/projects/${projectId}/rfqs`, payload);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "rfqs"] });
      toast({
        title: "تم الإنشاء بنجاح",
        description: "تم إنشاء طلب عرض السعر ودعوة الموردين بنجاح",
      });
      setLocation(`/projects/${projectId}/purchase-orders?tab=rfqs`);
    },
    onError: (err: any) => {
      toast({
        title: "خطأ",
        description: err.message || "فشل إنشاء طلب عرض السعر",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background pb-20">
      {/* Top Header / Navigation Bar */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-7xl xl:max-w-[1550px] mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation(`/projects/${projectId}/purchase-orders?tab=rfqs`)}
              className="rounded-xl h-9 gap-1.5 font-bold hover:bg-muted"
            >
              <ArrowRight className="w-4 h-4" />
              العودة
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                إنشاء طلب عرض سعر جديد (New RFQ)
              </h1>
              {project && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  {project.name}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation(`/projects/${projectId}/purchase-orders`)}
              className="rounded-xl h-10 px-4 font-bold"
            >
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={() => createRfqMutation.mutate()}
              disabled={createRfqMutation.isPending}
              className="rounded-xl h-10 px-5 font-bold gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20"
            >
              <Save className="w-4 h-4" />
              {createRfqMutation.isPending ? "جاري الحفظ..." : "حفظ وإنشاء الطلب"}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Form Container */}
      <div className="max-w-7xl xl:max-w-[1550px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Top Row: General Information & Invited Suppliers (Side-by-Side) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Card 1: General Info */}
          <Card className="rounded-[1.5rem] border border-border/60 shadow-sm overflow-hidden flex flex-col h-full bg-card">
            <CardHeader className="h-16 px-5 border-b bg-muted/20 flex flex-row items-center justify-between">
              <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2 text-foreground">
                <FileText className="w-4 h-4 text-primary" />
                1. المعلومات الأساسية للطلب (General Information)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 flex-1 flex flex-col justify-between space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="space-y-1.5 flex-1 w-full">
                  <Label className="font-semibold text-xs text-foreground/90 flex items-center gap-1">
                    عنوان طلب عرض السعر / الموضوع <span className="text-destructive font-bold">*</span>
                  </Label>
                  <Input
                    placeholder="مثال: توريد حديد تسليح للمبنى الرئيسي - المرحلة 2"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-10 rounded-xl text-xs sm:text-sm border-input bg-background w-full"
                  />
                </div>

                <div className="space-y-1.5 w-full sm:w-[138px] shrink-0">
                  <Label className="font-semibold text-xs text-foreground/90 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-primary/70" />
                    الموعد النهائي
                  </Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="h-10 rounded-xl text-xs border-input bg-background w-full px-2.5"
                  />
                </div>
              </div>

              <div className="space-y-1.5 flex-1 flex flex-col">
                <Label className="font-semibold text-xs text-foreground/90">
                  ملاحظات وشروط عامة للطلب (General Notes & Terms)
                </Label>
                <Textarea
                  placeholder="أي اشتراطات خاصة بالتسليم أو الدفع أو فحص العينات أو الضمانات..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="rounded-xl resize-none text-xs sm:text-sm flex-1 min-h-[90px] border-input bg-background leading-relaxed"
                />
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Invited Suppliers */}
          <Card className="rounded-[1.5rem] border border-border/60 shadow-sm overflow-hidden flex flex-col h-full bg-card">
            <CardHeader className="h-16 px-5 border-b bg-muted/20 flex flex-row items-center justify-between gap-2">
              <div className="space-y-1">
                <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2 text-foreground">
                  <Users className="w-4 h-4 text-primary" />
                  2. الموردين المدعوين (Invited Suppliers)
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    {selectedSupplierIds.length} {selectedSupplierIds.length === 1 ? "مورد" : "موردين"}
                  </span>
                </CardTitle>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSupplierSelectDialogOpen(true)}
                  className="rounded-xl h-9 text-xs font-semibold gap-1.5 border-primary/40 text-primary hover:bg-primary/5 shadow-xs px-3"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  اختيار موردين
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSupplierFormOpen(true)}
                  className="rounded-xl h-9 text-xs font-semibold gap-1.5 border-dashed hover:bg-muted px-3"
                >
                  <Plus className="w-3.5 h-3.5" />
                  مورد جديد
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-5 flex-1 flex flex-col justify-between">
              {selectedSupplierIds.length === 0 ? (
                <div className="text-center py-7 px-4 border border-dashed rounded-2xl bg-muted/10 space-y-2.5 my-auto">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs sm:text-sm font-bold text-foreground">لم يتم تحديد أي موردين لهذا الطلب بعد</p>
                    <p className="text-xs text-muted-foreground">
                      انقر على "اختيار موردين" لتحديد الموردين المستهدفين ({suppliers.length} متاح بالدليل)
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSupplierSelectDialogOpen(true)}
                    className="rounded-xl text-xs font-semibold gap-1.5 border-primary/40 text-primary hover:bg-primary/10 h-8.5 px-4"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    اختيار موردين من الدليل
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 flex-1 flex flex-col justify-between">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[185px] overflow-y-auto custom-scrollbar p-0.5">
                    {selectedSuppliers.map((supplier) => (
                      <div
                        key={supplier.id}
                        className="flex items-start justify-between gap-2 p-3 rounded-xl border border-primary/25 bg-primary/5 hover:bg-primary/10 transition-colors text-xs relative group shadow-xs"
                      >
                        <div className="overflow-hidden space-y-0.5 flex-1 min-w-0">
                          <p className="font-bold text-slate-900 dark:text-slate-100 truncate text-xs">
                            {supplier.supplierName}
                          {(supplier as any).isApproved && (
  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500/10 shrink-0 inline-block ms-1.5 align-text-bottom" />
)}
                            {(supplier as any).isApproved && (
  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500/10 shrink-0 inline-block ms-1.5 align-text-bottom" />
)}
                          </p>
                          {supplier.contactPerson && (
                            <p className="text-[11px] text-muted-foreground truncate">{supplier.contactPerson}</p>
                          )}
                          {supplier.phone && (
                            <p className="text-[10px] text-muted-foreground/90 truncate font-mono">{supplier.phone}</p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveSupplier(supplier.id)}
                          className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md shrink-0"
                          title="إلغاء اختيار هذا المورد"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-border/40 text-xs">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSupplierSelectDialogOpen(true)}
                      className="rounded-lg text-xs font-semibold gap-1 border-dashed h-8 px-2.5"
                    >
                      <Plus className="w-3 h-3" />
                      تعديل / إضافة موردين
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedSupplierIds([])}
                      className="text-xs text-muted-foreground hover:text-destructive font-medium h-8 px-2"
                    >
                      إلغاء التحديد
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Section 3: Required Materials & Quantities (Full Width Table Layout) */}
        <Card className="rounded-[1.5rem] border border-border/60 shadow-sm overflow-hidden">
          <CardHeader className="p-5 border-b bg-muted/15 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                <Package className="w-4 h-4 text-primary" />
                3. قائمة المواد والكميات المطلوبة (Required Materials & Quantities)
                <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {items.length} {items.length === 1 ? "بند" : "بنود"}
                </span>
              </CardTitle>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openNewMaterial("", null)}
              className="rounded-xl h-9 text-xs font-bold gap-1.5 border-primary/40 text-primary hover:bg-primary/5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              إضافة مادة جديدة
            </Button>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse min-w-[850px]">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30 text-[11px] font-bold text-muted-foreground tracking-wider uppercase">
                    <th className="py-3 px-3 w-12 text-center">#</th>
                    <th className="py-3 px-3 w-[260px] text-center">
                      اسم المادة <span className="text-[10px] text-muted-foreground font-normal">(Material Name)</span> <span className="text-destructive">*</span>
                    </th>
                    <th className="py-3 px-3 min-w-[200px] text-center">
                      المواصفات / الوصف <span className="text-[10px] text-muted-foreground font-normal">(Specs / Description)</span>
                    </th>
                    <th className="py-3 px-3 w-20 text-center">
                      الكمية <span className="text-[10px] text-muted-foreground font-normal">(Qty)</span> <span className="text-destructive">*</span>
                    </th>
                    <th className="py-3 px-3 w-20 text-center">
                      الوحدة <span className="text-[10px] text-muted-foreground font-normal">(Unit)</span>
                    </th>
                    <th className="py-3 px-3 min-w-[180px] text-center">
                      ملاحظات خاصة <span className="text-[10px] text-muted-foreground font-normal">(Notes)</span>
                    </th>
                    <th className="py-3 px-3 w-12 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {items.map((item, index) => (
                    <tr
                      key={index}
                      className="hover:bg-muted/20 transition-colors group"
                    >
                      {/* Index / # */}
                      <td className="py-2.5 px-3 text-center text-xs font-bold text-muted-foreground">
                        {index + 1}
                      </td>

                      {/* Material Combobox */}
                      <td className="py-2.5 px-3">
                        <MaterialCombobox
                          materials={materials}
                          selectedMaterialId={item.materialId}
                          materialName={item.materialName}
                          onSelectMaterial={(mat) => handleSelectMaterial(index, mat)}
                          onAddCustomMaterial={(name) => openNewMaterial(name, index)}
                        />
                      </td>

                      {/* Specification / Description */}
                      <td className="py-2.5 px-3">
                        <Input
                          placeholder="المواصفات، اللون، المقاس..."
                          value={item.itemDescription}
                          onChange={(e) => handleItemChange(index, "itemDescription", e.target.value)}
                          className="h-9 rounded-lg text-xs bg-background"
                        />
                      </td>

                      {/* Quantity */}
                      <td className="py-2.5 px-3">
                        <Input
                          type="number"
                          min="0.01"
                          step="any"
                          placeholder="1.00"
                          value={item.quantity}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val.length <= 5) {
                              handleItemChange(index, "quantity", val);
                            }
                          }}
                          className="h-9 w-[72px] mx-auto rounded-lg text-xs font-bold text-center bg-background px-1"
                        />
                      </td>

                      {/* Unit */}
                      <td className="py-2.5 px-3">
                        <Input
                          placeholder="pcs, ton..."
                          value={item.unit}
                          onChange={(e) => handleItemChange(index, "unit", e.target.value)}
                          className="h-9 rounded-lg text-xs text-center bg-background"
                        />
                      </td>

                      {/* Item Notes */}
                      <td className="py-2.5 px-3">
                        <Input
                          placeholder="ملاحظة أو شرط للمورد..."
                          value={item.notes || ""}
                          onChange={(e) => handleItemChange(index, "notes", e.target.value)}
                          className="h-9 rounded-lg text-xs bg-background"
                        />
                      </td>

                      {/* Delete Action */}
                      <td className="py-2.5 px-3 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={items.length <= 1}
                          onClick={() => handleRemoveItem(index)}
                          className={cn(
                            "h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors",
                            items.length <= 1 && "opacity-30 cursor-not-allowed"
                          )}
                          title="حذف هذا البند"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Quick Add Row Button in Table Footer */}
            <div className="p-3 border-t border-border/40 bg-muted/10 flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddItem}
                className="h-8 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                إضافة صف جديد (Add Row)
              </Button>
              <span className="text-[11px] text-muted-foreground">
                إجمالي البنود: <strong className="text-foreground">{items.length}</strong>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Bottom Actions Bar */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation(`/projects/${projectId}/purchase-orders?tab=rfqs`)}
            className="rounded-xl h-11 px-6 font-bold"
          >
            إلغاء
          </Button>
          <Button
            type="button"
            onClick={() => createRfqMutation.mutate()}
            disabled={createRfqMutation.isPending}
            className="rounded-xl h-11 px-8 font-bold gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
          >
            <Save className="w-4 h-4" />
            {createRfqMutation.isPending ? "جاري الحفظ..." : "حفظ وإنشاء طلب عرض السعر"}
          </Button>
        </div>
      </div>

      {/* Searchable Supplier Selection Dialog Modal */}
      <Dialog open={supplierSelectDialogOpen} onOpenChange={setSupplierSelectDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="p-5 pb-3 border-b bg-muted/15">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              اختيار الموردين المدعوين لطلب عرض السعر
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              ابحث وحدد الموردين الذين ترغب في إرسال طلب عرض السعر لهم ({selectedSupplierIds.length} محدد حالياً)
            </DialogDescription>
          </DialogHeader>

          {/* Search & Bulk Select bar */}
          <div className="p-4 border-b space-y-3 bg-background">
            <div className="relative">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث باسم المورد، الشخص المسؤول، رقم الهاتف، أو التخصص..."
                value={supplierSearchQuery}
                onChange={(e) => setSupplierSearchQuery(e.target.value)}
                className="pr-9 h-10 rounded-xl text-xs"
              />
              {supplierSearchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setSupplierSearchQuery("")}
                  className="absolute left-2 top-2 h-6 w-6 text-muted-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                المعروض: <strong className="text-foreground">{filteredSuppliers.length}</strong> من أصل{" "}
                <strong>{suppliers.length}</strong> مورد
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const visibleIds = filteredSuppliers.map((s) => s.id);
                    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSupplierIds.includes(id));
                    if (allVisibleSelected) {
                      setSelectedSupplierIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
                    } else {
                      setSelectedSupplierIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                    }
                  }}
                  className="h-7 text-xs text-primary font-bold px-2 hover:bg-primary/10"
                >
                  {filteredSuppliers.length > 0 && filteredSuppliers.every((s) => selectedSupplierIds.includes(s.id))
                    ? "إلغاء تحديد نتائج البحث"
                    : "تحديد نتائج البحث"}
                </Button>
              </div>
            </div>
          </div>

          {/* Suppliers List */}
          <div className="flex-1 overflow-y-auto p-4 max-h-[380px] custom-scrollbar space-y-2">
            {filteredSuppliers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs space-y-2">
                <p>لا يوجد موردين يطابقون بحثك "{supplierSearchQuery}"</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSupplierSelectDialogOpen(false);
                    setSupplierFormOpen(true);
                  }}
                  className="rounded-xl text-xs font-bold gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  إضافة هذا المورد كجديد
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredSuppliers.map((supplier) => {
                  const isChecked = selectedSupplierIds.includes(supplier.id);
                  return (
                    <div
                      key={supplier.id}
                      onClick={() => toggleSupplier(supplier.id)}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-all select-none",
                        isChecked
                          ? "bg-primary/10 border-primary text-primary font-bold shadow-xs"
                          : "bg-background border-border hover:border-slate-300 dark:hover:border-slate-700"
                      )}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleSupplier(supplier.id)}
                        className="mt-0.5"
                      />
                      <div className="overflow-hidden min-w-0 flex-1">
                        <p className="truncate font-bold text-slate-900 dark:text-slate-100">
                          {supplier.supplierName}
                        </p>
                        {supplier.contactPerson && (
                          <p className="text-[11px] text-muted-foreground truncate">{supplier.contactPerson}</p>
                        )}
                        {supplier.phone && (
                          <p className="text-[10px] text-muted-foreground/80 truncate font-mono">{supplier.phone}</p>
                        )}
                        {supplier.category && (
                          <span className="inline-block text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground mt-1">
                            {supplier.category}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="p-4 border-t bg-muted/15 flex items-center justify-between sm:justify-between">
            <div className="text-xs font-bold text-foreground">
              تم تحديد: <span className="text-primary">{selectedSupplierIds.length}</span> مورد
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSupplierSelectDialogOpen(false);
                  setSupplierFormOpen(true);
                }}
                className="rounded-xl text-xs font-bold gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                مورد جديد
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setSupplierSelectDialogOpen(false)}
                className="rounded-xl text-xs font-bold px-4 bg-primary text-primary-foreground"
              >
                تأكيد الاختيار ({selectedSupplierIds.length})
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Add Supplier Dialog Modal */}
      <SupplierFormDialog
        isOpen={supplierFormOpen}
        onOpenChange={setSupplierFormOpen}
        projectId={projectId}
      />

      {/* Add Material Dialog (also adds it to the project material catalog) */}
      <MaterialFormDialog
        isOpen={newMaterialDialog.open}
        onOpenChange={(open) => setNewMaterialDialog((s) => ({ ...s, open }))}
        projectId={projectId}
        initialName={newMaterialDialog.name}
        onSuccess={applyNewMaterial}
      />
    </div>
  );
}
