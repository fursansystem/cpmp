import { useEffect, useState, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  insertDeliverySchema,
  insertDeliveryItemSchema,
  type Delivery,
  type InsertDelivery,
  type DeliveryItem,
  type InsertDeliveryItem
} from "@shared/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Plus,
  Trash2,
  Package,
  Truck,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  FileImage,
  ImageIcon,
  Link,
  X
} from "lucide-react";
import { ProjectStorageModal } from "@/components/ProjectStorageModal";
import { SupplierFormDialog } from "@/components/supplier-form-dialog";
import { MaterialFormDialog } from "@/components/material-form-dialog";
import type { Document } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import type { ProjectFormSettings } from "@shared/schema";

// Schema for the multi-item form
const multiDeliveryFormSchema = z.object({
  projectId: z.string(),
  shipmentNumber: z.string().optional().nullable(),
  deliveryInvoiceNumber: z.string().optional().nullable(),
  supplier: z.string().min(1, "Required"),
  supplierId: z.string().optional().nullable(),
  arrivalDate: z.string().min(1, "Required"),
  items: z.array(z.object({
    id: z.string().optional(),
    materialName: z.string().min(1, "Required"),
    materialId: z.string().optional().nullable(),
    materialDescription: z.string().optional().nullable(),
    arrivalQuantity: z.string().min(1, "Required"),
    unit: z.string().min(1, "Required"),
    category: z.string().optional().nullable(),
  })).min(1, "At least one material is required to save"),
  deliveryNoteId: z.string().optional().nullable(),
});

type MultiDeliveryFormValues = z.infer<typeof multiDeliveryFormSchema>;

interface DeliveryFormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  delivery?: (Delivery & { items: DeliveryItem[] }) | null;
}

export function DeliveryFormDialog({
  isOpen,
  onOpenChange,
  projectId,
  delivery,
}: DeliveryFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: formSettings } = useQuery<ProjectFormSettings>({
    queryKey: ["/api/projects", projectId, "form-settings"],
    enabled: isOpen,
  });

  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: ["/api/suppliers", { projectId }],
    enabled: isOpen,
  });

  const { data: projectMaterials = [] } = useQuery<any[]>({
    queryKey: ["/api/materials", { projectId }],
    enabled: isOpen,
  });

  const form = useForm<MultiDeliveryFormValues>({
    resolver: zodResolver(multiDeliveryFormSchema),
    defaultValues: {
      projectId,
      shipmentNumber: "",
      deliveryInvoiceNumber: "",
      supplier: "",
      supplierId: null,
      arrivalDate: new Date().toISOString().split("T")[0],
      items: [],
      deliveryNoteId: null,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const selectedSupplierId = form.watch("supplierId");

  const { data: supplierMaterials = [] } = useQuery<any[]>({
    queryKey: ["/api/suppliers", selectedSupplierId, "materials"],
    enabled: !!selectedSupplierId,
  });

  // Filter materials based on selected supplier
  const availableMaterials = useMemo(() => {
    if (selectedSupplierId) {
      return supplierMaterials.map(sm => sm.material);
    }
    return projectMaterials;
  }, [selectedSupplierId, supplierMaterials, projectMaterials]);

  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<{ id: string, name: string } | null>(null);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");
  const [isSupplierPopoverOpen, setIsSupplierPopoverOpen] = useState(false);
  const [isMaterialPopoverOpen, setIsMaterialPopoverOpen] = useState(false);
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [newMaterialOpen, setNewMaterialOpen] = useState(false);

  // Local state for the "staging" item being entered
  const [draftItem, setDraftItem] = useState({
    materialName: "",
    materialId: "",
    materialDescription: "",
    arrivalQuantity: "",
    unit: "",
    category: "",
  });

  useEffect(() => {
    if (delivery) {
      form.reset({
        projectId: delivery.projectId,
        shipmentNumber: delivery.shipmentNumber,
        deliveryInvoiceNumber: delivery.deliveryInvoiceNumber || "",
        supplier: delivery.supplier,
        supplierId: (delivery as any).supplierId || null,
        arrivalDate: delivery.arrivalDate ? new Date(delivery.arrivalDate).toISOString().split("T")[0] : "",
        items: delivery.items.map(item => ({
          id: item.id,
          materialName: item.materialName,
          materialId: (item as any).materialId || null,
          materialDescription: item.materialDescription || "",
          arrivalQuantity: item.arrivalQuantity.toString(),
          unit: item.unit,
          category: (item as any).category || "",
        })),
        deliveryNoteId: delivery.deliveryNoteId || null,
      });

      if (delivery.deliveryNoteId) {
        setSelectedDocument({ id: delivery.deliveryNoteId, name: "Linked Document" });
      } else {
        setSelectedDocument(null);
      }
    } else if (isOpen) {
      form.reset({
        projectId: projectId,
        shipmentNumber: "",
        deliveryInvoiceNumber: "",
        supplier: "",
        arrivalDate: new Date().toISOString().split("T")[0],
        items: [],
        deliveryNoteId: null,
      });
      setSelectedDocument(null);
      setDraftItem({
        materialName: "",
        materialId: "",
        materialDescription: "",
        arrivalQuantity: "",
        unit: "",
        category: "",
      });
    }
  }, [delivery, projectId, isOpen, form]);

  const handleAddItem = () => {
    if (!draftItem.materialName || !draftItem.arrivalQuantity || !draftItem.unit) {
      toast({
        title: "Missing Data",
        description: "Please enter material name, quantity, and unit.",
        variant: "destructive",
      });
      return;
    }

    append({ ...draftItem });
    setDraftItem({
      materialName: "",
      materialId: "",
      materialDescription: "",
      arrivalQuantity: "",
      unit: "",
      category: "",
    });
  };

  const mutation = useMutation({
    mutationFn: async (values: MultiDeliveryFormValues) => {
      if (delivery) {
        const data = {
          projectId: values.projectId,
          shipmentNumber: values.shipmentNumber || "",
          deliveryInvoiceNumber: values.deliveryInvoiceNumber || null,
          supplier: values.supplier,
          supplierId: values.supplierId,
          arrivalDate: values.arrivalDate,
          deliveryNoteId: values.deliveryNoteId || null,
          items: values.items.map(item => ({
            id: item.id,
            materialName: item.materialName,
            materialId: item.materialId,
            materialDescription: item.materialDescription,
            arrivalQuantity: item.arrivalQuantity,
            unit: item.unit,
          }))
        };
        const res = await apiRequest("PATCH", `/api/deliveries/${delivery.id}`, data);
        return res.json();
      } else {
        const deliveryRes = await apiRequest("POST", "/api/deliveries/bulk", {
          shipmentNumber: values.shipmentNumber || "",
          deliveryInvoiceNumber: values.deliveryInvoiceNumber || null,
          supplier: values.supplier,
          supplierId: values.supplierId,
          arrivalDate: values.arrivalDate,
          projectId: values.projectId,
          deliveryNoteId: values.deliveryNoteId || null,
          items: values.items.map(item => ({
            materialName: item.materialName,
            materialId: item.materialId,
            materialDescription: item.materialDescription,
            arrivalQuantity: item.arrivalQuantity,
            unit: item.unit,
          }))
        });
        return await deliveryRes.json();
      }
    },
    onSuccess: () => {
      const supplierId = form.getValues("supplierId");
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "form-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", { projectId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/materials", { projectId }] });
      if (supplierId) {
        queryClient.invalidateQueries({ queryKey: ["/api/suppliers", supplierId, "materials"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/revisions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      toast({
        title: "Success",
        description: delivery ? "Delivery updated successfully" : "New delivery recorded successfully",
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDocumentSelect = (selections: { document: Document, title: string }[]) => {
    if (selections.length > 0) {
      const doc = selections[0].document;
      setSelectedDocument({ id: doc.id, name: doc.fileName || doc.name });
      form.setValue("deliveryNoteId", doc.id);
    }
    setIsStorageModalOpen(false);
  };

  const removeDocument = () => {
    setSelectedDocument(null);
    form.setValue("deliveryNoteId", null);
  };

  const onSubmit = (data: MultiDeliveryFormValues) => {
    if (data.items.length === 0) {
      toast({
        title: "Empty Shipment",
        description: "Please add at least one material to the list before saving.",
        variant: "destructive",
      });
      return;
    }
    // The server no longer invents suppliers or materials from free text, so catch the
    // missing link here rather than letting the user hit a server error on save.
    if (!data.supplierId) {
      toast({
        title: "المورد غير محدد",
        description: "اختر المورد من السجل أو سجّله كمورد جديد.",
        variant: "destructive",
      });
      return;
    }
    const unlinked = data.items.filter((i) => !i.materialId);
    if (unlinked.length > 0) {
      toast({
        title: "مواد غير مرتبطة بالكتالوج",
        description: `${unlinked.length} مادة بلا ربط: ${unlinked
          .map((i) => i.materialName)
          .join("، ")}. أضفها للكتالوج أولًا.`,
        variant: "destructive",
      });
      return;
    }
    mutation.mutate(data);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col overflow-hidden p-0 rounded-[2.5rem] border-none shadow-2xl bg-[#f8f9fa] dark:bg-background">
          {/* Header Section */}
          <div className="relative bg-gradient-to-br from-primary to-primary/80 p-8 text-white shrink-0 overflow-hidden">
            <div className="absolute top-0 right-0 p-20 bg-white/10 blur-3xl rounded-full -mr-20 -mt-20 animate-pulse" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-xl border border-white/20 transition-transform hover:rotate-3">
                  <Truck className="w-9 h-9 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black tracking-tight drop-shadow-sm">
                    {delivery ? "Edit Delivery Record" : "New Shipment Entry"}
                  </DialogTitle>
                  <p className="text-xs font-bold text-white/70 uppercase tracking-widest mt-1 opacity-80">
                    {delivery ? `Ref: ${delivery.shipmentNumber}` : "Log multiple materials into the system"}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge className="bg-white text-primary hover:bg-white/90 h-9 px-5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl border-none">
                  {fields.length} {fields.length === 1 ? 'Material' : 'Materials'} Staged
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="p-8 space-y-10">

                {/* Basic Info Section */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 bg-white dark:bg-muted/10 p-8 rounded-[2rem] shadow-sm border border-white dark:border-muted/20">
                  {delivery && (
                    <FormField
                      control={form.control}
                      name="shipmentNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Delivery No.</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value || ""}
                              readOnly
                              className="bg-muted/30 border-none h-11 rounded-2xl text-sm font-black tabular-nums"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name="deliveryInvoiceNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Invoice / DN No.</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <ClipboardList className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                            <Input {...field} value={field.value || ""} placeholder="e.g. INV-2024" className="pl-11 bg-muted/20 border-none h-11 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="supplierId"
                    render={({ field }) => (
                      <FormItem className="lg:col-span-2">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Supplier / Vendor</FormLabel>
                        <Popover open={isSupplierPopoverOpen} onOpenChange={setIsSupplierPopoverOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  "w-full bg-muted/20 border-none h-11 rounded-2xl text-sm justify-between font-bold px-4 hover:bg-muted/30 transition-colors",
                                  !form.watch("supplier") && "text-muted-foreground font-normal"
                                )}
                              >
                                <span className="truncate flex items-center gap-2">
                                  {form.watch("supplier") ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                                  ) : (
                                    <Truck className="w-3.5 h-3.5 text-muted-foreground/40" />
                                  )}
                                  {form.watch("supplier") || "Select or type supplier..."}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-40" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-3xl shadow-2xl border-none overflow-hidden" align="start">
                            <Command>
                              <CommandInput
                                placeholder="Search or type new supplier..."
                                value={supplierSearch}
                                onValueChange={setSupplierSearch}
                                className="h-12 border-none ring-0 focus:ring-0"
                              />
                              <CommandList className="custom-scrollbar">
                                <CommandEmpty>
                                  <Button
                                    variant="ghost"
                                    className="w-full justify-start text-xs font-black text-primary py-4 px-4 h-auto hover:bg-primary/5 uppercase tracking-widest"
                                    onClick={() => {
                                      // Register the supplier properly instead of passing a
                                      // bare name for the server to auto-create.
                                      setIsSupplierPopoverOpen(false);
                                      setNewSupplierOpen(true);
                                    }}
                                  >
                                    <Plus className="w-4 h-4 mr-3" />
                                    Register "{supplierSearch}" as a new supplier
                                  </Button>
                                </CommandEmpty>
                                <CommandGroup>
                                  {suppliers.map((s) => (
                                    <CommandItem
                                      value={s.supplierName}
                                      key={s.id}
                                      onSelect={() => {
                                        form.setValue("supplierId", s.id);
                                        form.setValue("supplier", s.supplierName);
                                        setIsSupplierPopoverOpen(false);
                                        setSupplierSearch("");
                                      }}
                                      className="text-sm py-3 px-4 flex items-center justify-between cursor-pointer focus:bg-primary/5"
                                    >
                                      <div className="flex items-center gap-3 truncate">
                                        {s.logoUrl ? (
                                          <div className="h-8 w-8 rounded-xl bg-white border flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                                            <img src={s.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                                          </div>
                                        ) : (
                                          <div className="h-8 w-8 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
                                            <Truck className="w-4 h-4 text-muted-foreground" />
                                          </div>
                                        )}
                                        <span className="font-bold">{s.supplierName}</span>
                                      </div>
                                      <Check
                                        className={cn(
                                          "h-4 w-4 text-primary",
                                          s.id === field.value ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="arrivalDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Logistics Date</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" className="bg-muted/20 border-none h-11 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="col-span-full">
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1 mb-2 block">Official Documentation (Storage)</FormLabel>
                    <div className="flex items-center gap-4">
                      {selectedDocument ? (
                        <div className="flex-1 flex items-center justify-between px-5 bg-primary/5 border border-primary/10 h-12 rounded-2xl group transition-all hover:bg-primary/10">
                          <div className="flex items-center gap-3 truncate">
                            <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                              <FileImage className="w-4 h-4 text-primary shrink-0" />
                            </div>
                            <span className="text-xs font-black truncate text-foreground/80 tracking-tight italic">Linked: {selectedDocument.name}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={removeDocument}
                            className="h-8 w-8 text-destructive/40 hover:text-destructive hover:bg-destructive/10 rounded-xl"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsStorageModalOpen(true)}
                          className="flex-1 border-dashed border-primary/30 text-primary/60 hover:text-primary hover:border-primary hover:bg-primary/5 transition-all h-12 rounded-2xl text-xs font-black uppercase tracking-widest gap-3 shadow-sm shadow-primary/5"
                        >
                          <Link className="w-4 h-4" />
                          Link Delivery Note from Storage
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Add Material Area */}
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-1 bg-primary rounded-full" />
                    <h3 className="font-black text-xl text-foreground/90 uppercase tracking-tighter">Add Material Items</h3>
                  </div>

                  <div className="bg-white dark:bg-muted/5 rounded-[2.5rem] border border-white dark:border-muted/20 shadow-xl overflow-hidden p-2">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-6 items-end bg-[#fafafa] dark:bg-muted/10 rounded-[2rem]">
                      <div className="md:col-span-6 space-y-2">
                        <label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                          <Package className="w-3 h-3" /> Material Name
                        </label>
                        <Popover open={isMaterialPopoverOpen} onOpenChange={setIsMaterialPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "w-full bg-white dark:bg-background h-12 rounded-2xl border-none shadow-sm text-sm justify-between font-bold px-4 hover:shadow-md transition-all",
                                !draftItem.materialName && "text-muted-foreground font-normal"
                              )}
                            >
                              <span className="truncate">
                                {draftItem.materialName || "Select or type material..."}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-40" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-3xl shadow-2xl border-none overflow-hidden" align="start">
                            <Command>
                              <CommandInput
                                placeholder="Search catalog..."
                                value={materialSearch}
                                onValueChange={setMaterialSearch}
                                className="h-12 border-none ring-0 focus:ring-0"
                              />
                              <CommandList className="custom-scrollbar">
                                <CommandEmpty>
                                  <Button
                                    variant="ghost"
                                    className="w-full justify-start text-xs font-black text-primary py-4 px-4 h-auto hover:bg-primary/5 uppercase tracking-widest"
                                    onClick={() => {
                                      // Create a real catalog entry (with unit, category and
                                      // min stock level) rather than letting the server invent one.
                                      setIsMaterialPopoverOpen(false);
                                      setNewMaterialOpen(true);
                                    }}
                                  >
                                    <Plus className="w-4 h-4 mr-3" />
                                    Add "{materialSearch}" to the catalog
                                  </Button>
                                </CommandEmpty>
                                <CommandGroup>
                                  {availableMaterials.map((m) => (
                                    <CommandItem
                                      value={m.materialName}
                                      key={m.id}
                                      onSelect={() => {
                                        setDraftItem({
                                          ...draftItem,
                                          materialId: m.id,
                                          materialName: m.materialName,
                                          unit: m.unit || draftItem.unit,
                                          category: m.category || draftItem.category
                                        });
                                        setIsMaterialPopoverOpen(false);
                                        setMaterialSearch("");
                                      }}
                                      className="text-sm py-3 px-4 flex items-center justify-between cursor-pointer focus:bg-primary/5"
                                    >
                                      <div className="flex flex-col min-w-0">
                                        <span className="font-bold text-foreground truncate">{m.materialName}</span>
                                        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-bold truncate">{m.category}</span>
                                      </div>
                                      <Check
                                        className={cn(
                                          "h-4 w-4 text-primary",
                                          m.id === draftItem.materialId ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="md:col-span-3 space-y-2">
                        <label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest ml-1">Quantity</label>
                        <Input
                          type="number"
                          value={draftItem.arrivalQuantity}
                          onChange={(e) => setDraftItem({ ...draftItem, arrivalQuantity: e.target.value })}
                          placeholder="0.00"
                          className="bg-white dark:bg-background h-12 rounded-2xl border-none shadow-sm text-sm font-black tabular-nums focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest ml-1">Unit</label>
                        <Input
                          value={draftItem.unit}
                          onChange={(e) => setDraftItem({ ...draftItem, unit: e.target.value })}
                          placeholder="Tons"
                          className="bg-white dark:bg-background h-12 rounded-2xl border-none shadow-sm text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all text-center"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest ml-1">Category</label>
                        <Input
                          value={draftItem.category}
                          onChange={(e) => setDraftItem({ ...draftItem, category: e.target.value })}
                          placeholder="General"
                          className="bg-white dark:bg-background h-12 rounded-2xl border-none shadow-sm text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all text-center"
                        />
                      </div>
                      <div className="md:col-span-8 space-y-2">
                        <label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest ml-1">Material Description (Optional)</label>
                        <Input
                          value={draftItem.materialDescription}
                          onChange={(e) => setDraftItem({ ...draftItem, materialDescription: e.target.value })}
                          placeholder="Color, dimensions, or specific lot details..."
                          className="bg-white dark:bg-background h-12 rounded-2xl border-none shadow-sm text-sm font-medium focus:ring-2 focus:ring-primary/20 transition-all px-4"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <Button
                          type="button"
                          className="w-full h-12 rounded-2xl gap-3 font-black uppercase text-xs shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all bg-primary text-primary-foreground border-none"
                          onClick={handleAddItem}
                        >
                          <Plus className="w-5 h-5" /> Add to List
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Staged Materials Table */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-1 bg-emerald-500 rounded-full" />
                      <h3 className="font-black text-xl text-foreground/90 uppercase tracking-tighter">Staged for Record</h3>
                    </div>
                  </div>

                  <div className="rounded-[2rem] overflow-hidden bg-white dark:bg-muted/5 border border-white dark:border-muted/20 shadow-xl">
                    <Table>
                      <TableHeader className="bg-[#f0f2f5] dark:bg-muted/20 h-14">
                        <TableRow className="border-none">
                          <TableHead className="w-16 text-center text-[10px] font-black uppercase tracking-widest opacity-40">#</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest opacity-40">Material Details</TableHead>
                          <TableHead className="w-32 text-[10px] font-black uppercase tracking-widest opacity-40 text-center">Qty/Unit</TableHead>
                          <TableHead className="w-20 text-center text-[10px] font-black uppercase tracking-widest opacity-40">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fields.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="h-64 text-center">
                              <div className="flex flex-col items-center justify-center gap-4 opacity-20">
                                <Package className="w-20 h-20" />
                                <div>
                                  <p className="text-sm font-black uppercase tracking-[0.2em]">Staging area is empty</p>
                                  <p className="text-[10px] font-bold uppercase mt-1">Add materials to record the delivery</p>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          fields.map((field, index) => (
                            <TableRow key={field.id} className="group hover:bg-primary/5 transition-all border-b border-muted/30 last:border-0 h-16">
                              <TableCell className="text-center">
                                <span className="w-8 h-8 rounded-xl bg-muted/30 flex items-center justify-center mx-auto text-[10px] font-black tabular-nums text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                  {String(index + 1).padStart(2, '0')}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  {delivery ? (
                                    <div className="space-y-1.5">
                                      <FormField
                                        control={form.control}
                                        name={`items.${index}.materialName`}
                                        render={({ field }) => (
                                          <Input {...field} className="h-7 text-sm font-black border-none bg-transparent hover:bg-white dark:hover:bg-background focus:bg-white dark:focus:bg-background px-2 rounded-lg transition-all" />
                                        )}
                                      />
                                      <FormField
                                        control={form.control}
                                        name={`items.${index}.materialDescription`}
                                        render={({ field }) => (
                                          <Input {...field} value={field.value || ""} className="h-6 text-[10px] opacity-60 font-bold border-none bg-transparent hover:bg-white dark:hover:bg-background focus:bg-white dark:focus:bg-background px-2 rounded-lg transition-all" placeholder="Add description..." />
                                        )}
                                      />
                                    </div>
                                  ) : (
                                    <>
                                      <span className="font-black text-sm text-foreground group-hover:text-primary transition-colors tracking-tight">
                                        {form.getValues(`items.${index}.materialName`)}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground font-medium italic opacity-60 truncate max-w-[250px] block">
                                        {form.getValues(`items.${index}.materialDescription`) || "No specific details provided"}
                                      </span>
                                      {form.getValues(`items.${index}.category`) && (
                                        <Badge variant="outline" className="w-fit text-[8px] h-4 font-black uppercase tracking-tighter border-primary/20 text-primary bg-primary/5 rounded-md px-1.5 mt-1">
                                          {form.getValues(`items.${index}.category`)}
                                        </Badge>
                                      )}
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <span className="font-black text-sm text-primary tabular-nums">
                                    {form.getValues(`items.${index}.arrivalQuantity`)}
                                  </span>
                                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                                    {form.getValues(`items.${index}.unit`)}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-10 w-10 text-destructive/30 hover:text-white hover:bg-destructive rounded-2xl transition-all active:scale-90"
                                  onClick={() => remove(index)}
                                >
                                  <Trash2 className="w-5 h-5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between pt-8 border-t border-muted/20">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-tight text-foreground/80">Finalize Logistics Entry</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">Verified Records Only</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onOpenChange(false)}
                      className="px-8 h-12 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-muted/50 transition-all"
                    >
                      Discard
                    </Button>
                    <Button
                      type="submit"
                      disabled={mutation.isPending || (fields.length === 0)}
                      className="px-10 h-12 rounded-2xl text-xs font-black shadow-2xl shadow-primary/30 transition-all uppercase tracking-[0.2em] hover:scale-105 active:scale-95 bg-primary text-primary-foreground"
                    >
                      {mutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-3 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        delivery ? "Update Delivery" : "Commit Records"
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>

      <ProjectStorageModal
        projectId={projectId}
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
        onSelect={handleDocumentSelect}
        multiSelect={false}
        skipLabels={true}
      />

      <SupplierFormDialog
        isOpen={newSupplierOpen}
        onOpenChange={setNewSupplierOpen}
        projectId={projectId}
        onSuccess={(supplier) => {
          form.setValue("supplierId", supplier.id);
          form.setValue("supplier", supplier.supplierName);
          setSupplierSearch("");
          setNewSupplierOpen(false);
        }}
      />

      <MaterialFormDialog
        isOpen={newMaterialOpen}
        onOpenChange={setNewMaterialOpen}
        projectId={projectId}
        initialName={materialSearch}
        supplierId={form.getValues("supplierId") || null}
        onSuccess={(material) => {
          setDraftItem((prev) => ({
            ...prev,
            materialId: material.id,
            materialName: material.materialName,
            unit: material.unit || prev.unit,
            category: material.category || prev.category,
          }));
          setMaterialSearch("");
          setNewMaterialOpen(false);
        }}
      />
    </>
  );
}
