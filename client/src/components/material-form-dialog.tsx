import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { insertMaterialSchema, type Material, type InsertMaterial, type Document, type MaterialAttachment } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Package, ImageIcon, Plus, FileText, Trash2 } from "lucide-react";
import { ProjectStorageModal } from "@/components/ProjectStorageModal";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatFileSize } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DEFAULT_CATEGORIES = [
  "General",
  "Sanitary",
  "Electrical",
  "Structural & Civil",
  "Finishing & Paints",
  "Others"
];

const MATERIAL_DOCUMENT_CATEGORIES = [
  "Technical Data Sheet (TDS)",
  "Material Safety Data Sheet (MSDS)",
  "Quality Certificate (QC)",
  "Compliance/Test Report",
  "Catalogue/Brochure",
  "Warranty Certificate",
  "Installation Guide",
  "Other Document",
];

interface MaterialFormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  material?: Material | null;
  supplierId?: string | null;
  initialName?: string;
  onSuccess?: (material: Material) => void;
}

export function MaterialFormDialog({
  isOpen,
  onOpenChange,
  projectId,
  material,
  supplierId,
  initialName,
  onSuccess,
}: MaterialFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isProjectStorageOpen, setIsProjectStorageOpen] = useState(false);
  const [storageMode, setStorageMode] = useState<'image' | 'attachment'>('image');
  const [pendingAttachments, setPendingAttachments] = useState<{ document: any, category: string, id: string }[]>([]);

  const { data: attachments = [], isLoading: isLoadingAttachments } = useQuery<(MaterialAttachment & { document: Document })[]>({
    queryKey: ["/api/materials", material?.id, "attachments"],
    enabled: !!material?.id && isOpen,
  });

  const linkAttachmentMutation = useMutation({
    mutationFn: async (selections: { document: any; title: string }[]) => {
      if (!material?.id) return;
      for (const selection of selections) {
        await apiRequest("POST", `/api/materials/${material.id}/attachments`, {
          documentId: selection.document.id,
          category: selection.title,
          remarks: "",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/materials", material?.id, "attachments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/materials", { projectId }] });
      toast({
        title: "Success",
        description: "Documents attached successfully.",
      });
      setIsProjectStorageOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error linking documents",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      await apiRequest("DELETE", `/api/materials/attachments/${attachmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/materials", material?.id, "attachments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/materials", { projectId }] });
      toast({
        title: "Deleted successfully",
        description: "Attachment has been successfully removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting attachment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ["/api/materials", { projectId }],
    enabled: !!projectId,
  });

  const allCategories = useMemo(() => {
    const dbCats = materials.map(m => m.category).filter(Boolean);
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...dbCats]));
  }, [materials]);

  const form = useForm<InsertMaterial>({
    resolver: zodResolver(insertMaterialSchema),
    defaultValues: {
      projectId,
      materialCode: "",
      materialName: "",
      category: "",
      description: "",
      originCountry: "",
      unit: "",
      imageUrl: "",
      minStockLevel: 0,
    },
  });

  useEffect(() => {
    if (material) {
      setPendingAttachments([]);
      form.reset({
        projectId: material.projectId || projectId,
        materialCode: material.materialCode || "",
        materialName: material.materialName,
        category: material.category || "",
        description: material.description || "",
        originCountry: material.originCountry || "",
        unit: material.unit || "",
        imageUrl: material.imageUrl || "",
        minStockLevel: material.minStockLevel || 0,
      });
    } else if (isOpen) {
      setPendingAttachments([]);
      form.reset({
        projectId,
        materialCode: "",
        materialName: initialName || "",
        category: "",
        description: "",
        originCountry: "",
        unit: "",
        imageUrl: "",
        minStockLevel: 0,
      });
    }
  }, [material, projectId, isOpen, initialName, form]);

  const mutation = useMutation({
    mutationFn: async (values: InsertMaterial) => {
      let result: Material;
      if (material) {
        const res = await apiRequest("PATCH", `/api/materials/${material.id}`, values);
        result = await res.json();
      } else {
        const res = await apiRequest("POST", "/api/materials", values);
        result = await res.json();

        // If supplierId is provided, link this new material to the supplier
        if (supplierId) {
          await apiRequest("POST", "/api/material-suppliers", {
            materialId: result.id,
            supplierId: supplierId,
          });
        }
      }
      return result;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/materials", { projectId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      
      if (!material && pendingAttachments.length > 0 && data?.id) {
        try {
          for (const att of pendingAttachments) {
            await apiRequest("POST", `/api/materials/${data.id}/attachments`, {
              documentId: att.document.id,
              category: att.category,
              remarks: "",
            });
          }
        } catch (error) {
          console.error("Failed to upload pending attachments:", error);
          toast({ title: "Warning", description: "Material created but some attachments failed.", variant: "destructive" });
        }
      }

      toast({
        title: "Success",
        description: material ? "Material updated successfully" : "New material added successfully",
      });
      setPendingAttachments([]);
      onOpenChange(false);
      if (onSuccess && data) {
        onSuccess(data);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-[1.5rem] max-h-[90vh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <DialogTitle className="text-xl font-bold">
              {material ? "Edit Material" : "Add New Material"}
            </DialogTitle>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form 
            onSubmit={form.handleSubmit(
              (data) => mutation.mutate(data),
              (errors) => {
                console.error("Material form validation errors:", errors);
                // Extract the first error message to display
                const firstError = Object.values(errors)[0]?.message as string;
                if (firstError) {
                  toast({
                    title: "Validation Error",
                    description: firstError,
                    variant: "destructive",
                  });
                }
              }
            )} 
            className="space-y-4 pt-4"
          >
            {/* Image Upload Section */}
            <div className="flex flex-col items-center justify-center group/logo relative pb-2">
              <div className="relative">
                <div className="w-24 h-24 rounded-2xl bg-muted/30 border-2 border-dashed border-primary/20 shadow-md overflow-hidden flex items-center justify-center transition-all duration-300 group-hover/logo:border-primary/50">
                  {form.watch("imageUrl") ? (
                    <img
                      src={form.watch("imageUrl")!}
                      alt="Material Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 text-muted-foreground/30 group-hover/logo:text-primary/40 transition-colors">
                      <ImageIcon className="w-8 h-8" />
                      <span className="text-[9px] font-bold uppercase tracking-wider">No Photo</span>
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1">
                  <div
                    className="bg-primary text-primary-foreground p-1.5 rounded-lg shadow-md border-2 border-background transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
                    onClick={() => {
                      setStorageMode('image');
                      setIsProjectStorageOpen(true);
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
              <div className="mt-2 w-full">
                <FormField
                  control={form.control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Paste material image URL or select from storage..."
                          className="h-8 text-[10px] text-center bg-muted/10 border-none shadow-none rounded-lg focus-visible:ring-primary/20 placeholder:text-muted-foreground/40 font-bold"
                        />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="materialCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider">Material ID</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} placeholder="e.g. MAT-001" className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="materialName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider">Material Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Portland Cement" className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider">Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl bg-white border border-border/60 hover:bg-slate-50 transition-colors">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {allCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider">Unit</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="e.g. Bags / m3" className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="originCountry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider">Country of Origin</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="e.g. KSA, UAE, China" className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider">Description</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ""} placeholder="Technical specifications..." className="rounded-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Attachments Section */}
            <div className="mt-6 border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Attachments / المرفقات</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStorageMode('attachment');
                    setIsProjectStorageOpen(true);
                  }}
                  className="rounded-xl h-8 px-4 text-[10px] font-black uppercase tracking-widest border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground transition-all shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add / إضافة
                </Button>
              </div>

              <div className="grid gap-3">
                {isLoadingAttachments ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-primary/20" /></div>
                ) : (material ? attachments : pendingAttachments).length === 0 ? (
                  <div className="bg-white/50 dark:bg-neutral-800/30 border border-dashed border-border rounded-2xl p-6 text-center flex flex-col items-center gap-2 transition-colors hover:border-primary/20">
                    <div className="bg-muted/10 p-2.5 rounded-full">
                      <FileText className="w-6 h-6 text-muted-foreground/10" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">No documents attached / لا يوجد مرفقات</p>
                      <p className="text-[9px] text-muted-foreground/40 font-bold uppercase tracking-tight">Add TDS, MSDS, Catalogue, or reports</p>
                    </div>
                  </div>
                ) : (
                  (material ? attachments : pendingAttachments).map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between p-3.5 bg-white/40 dark:bg-neutral-800/10 hover:shadow-md transition-all duration-300 rounded-2xl border border-border/50 group/att shadow-sm"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center group-hover/att:bg-primary/20 transition-colors shrink-0">
                          <FileText className="w-4.5 h-4.5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-xs font-black text-foreground/90 truncate leading-tight tracking-tight">
                            {attachment.document.fileName || attachment.document.name}
                          </p>
                          <div className="flex items-center gap-2">
                            {attachment.category && (
                              <Badge
                                variant="outline"
                                className="text-[8px] font-black px-2 py-0 h-4 bg-primary/5 border-primary/20 text-primary uppercase tracking-tight shadow-sm"
                              >
                                {attachment.category.split(' (')[0]}
                              </Badge>
                            )}
                            <span className="text-[9px] font-bold text-muted-foreground/40 tabular-nums uppercase">
                              {formatFileSize(attachment.document.size || (attachment.document as any).fileSize)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (material) {
                              deleteAttachmentMutation.mutate(attachment.id);
                            } else {
                              setPendingAttachments(prev => prev.filter(a => a.id !== attachment.id));
                            }
                          }}
                          disabled={deleteAttachmentMutation.isPending}
                          className="h-8 w-8 text-destructive/30 hover:text-white hover:bg-destructive rounded-xl transition-all shadow-sm active:scale-90"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl font-bold text-xs uppercase">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} className="rounded-xl font-bold px-8 shadow-lg shadow-primary/20 text-xs uppercase">
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {material ? "Save Changes" : "Add Material"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
      <ProjectStorageModal
        projectId={projectId}
        isOpen={isProjectStorageOpen}
        onClose={() => setIsProjectStorageOpen(false)}
        onSelect={(selections) => {
          if (storageMode === 'image') {
            const selected = selections[0];
            if (selected) {
              const url = selected.document.fileUrl || selected.document.fileData;
              form.setValue("imageUrl", url);
              toast({ title: "Image updated", description: "Material image has been selected." });
            }
            setIsProjectStorageOpen(false);
          } else {
            if (material?.id) {
              linkAttachmentMutation.mutate(selections);
            } else {
              setPendingAttachments(prev => [
                ...prev, 
                ...selections.map(s => ({ document: s.document, category: s.title, id: crypto.randomUUID() }))
              ]);
              setIsProjectStorageOpen(false);
              toast({ title: "Success", description: `${selections.length} documents added to list` });
            }
          }
        }}
        multiSelect={storageMode === 'attachment'}
        skipLabels={storageMode === 'image'}
        suggestions={storageMode === 'attachment' ? MATERIAL_DOCUMENT_CATEGORIES : []}
      />
    </Dialog>
  );
}
