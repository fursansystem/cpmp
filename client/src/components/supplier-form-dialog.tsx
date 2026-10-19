import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { insertSupplierSchema, type Supplier, type InsertSupplier } from "@shared/schema";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, ImageIcon, FileText, Plus, Trash2, Briefcase } from "lucide-react";
import { ProjectStorageModal } from "@/components/ProjectStorageModal";
import { formatFileSize } from "@/lib/utils";
import type { Document, SupplierAttachment } from "@shared/schema";

const SUPPLIER_DOCUMENT_CATEGORIES = [
  "Commercial Register (السجل التجاري)",
  "Company Profile (ملف الشركة)",
  "License (رخصة)",
  "Government (حكومي)",
  "Tax Certificate (شهادة الضريبة)",
  "Zakat Certificate (شهادة الزكاة)",
  "GOSI Certificate (شهادة التأمينات)",
  "Chamber of Commerce Membership (عضوية الغرفة التجارية)",
  "Quality Certificates (شهادات الجودة)",
  "Contract / Agreement (عقد / اتفاقية)",
];

interface SupplierFormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  supplier?: Supplier | null;
  onSuccess?: (supplier: Supplier) => void;
}

export function SupplierFormDialog({
  isOpen,
  onOpenChange,
  projectId,
  supplier,
  onSuccess,
}: SupplierFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isProjectStorageOpen, setIsProjectStorageOpen] = useState(false);
  const [storageMode, setStorageMode] = useState<'logo' | 'attachment'>('logo');
  const [pendingAttachments, setPendingAttachments] = useState<{ document: any, category: string, id: string }[]>([]);

  const form = useForm<InsertSupplier>({
    resolver: zodResolver(insertSupplierSchema),
    defaultValues: {
      supplierName: "",
      contactPerson: "",
      email: "",
      phone: "",
      address: "",
      taxNumber: "",
      logoUrl: "",
      experienceYears: null,
      category: "",
      projectId,
    },
  });

  useEffect(() => {
    if (supplier) {
      setPendingAttachments([]);
      form.reset({
        ...supplier,
        projectId: supplier.projectId || projectId,
        email: supplier.email || "",
        contactPerson: supplier.contactPerson || "",
        phone: supplier.phone || "",
        address: supplier.address || "",
        taxNumber: supplier.taxNumber || "",
        logoUrl: supplier.logoUrl || "",
        category: supplier.category || "",
        experienceYears: supplier.experienceYears ?? null,
      });
    } else {
      setPendingAttachments([]);
      form.reset({
        supplierName: "",
        contactPerson: "",
        email: "",
        phone: "",
        address: "",
        taxNumber: "",
        logoUrl: "",
        experienceYears: null,
        category: "",
        projectId,
      });
    }
  }, [supplier, form, projectId]);

  const { data: attachments = [], isLoading: isLoadingAttachments } = useQuery<(SupplierAttachment & { document: Document })[]>({
    queryKey: ["/api/suppliers", supplier?.id, "attachments"],
    enabled: !!supplier?.id && isOpen,
  });

  const mutation = useMutation({
    mutationFn: async (values: InsertSupplier) => {
      if (supplier) {
        const res = await apiRequest("PATCH", `/api/suppliers/${supplier.id}`, values);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/suppliers", values);
        return res.json();
      }
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", { projectId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/revisions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
      
      if (!supplier && pendingAttachments.length > 0 && data?.id) {
        try {
          for (const att of pendingAttachments) {
            await apiRequest("POST", `/api/suppliers/${data.id}/attachments`, {
              documentId: att.document.id,
              category: att.category,
              remarks: "",
            });
          }
        } catch (error) {
          console.error("Failed to upload pending attachments:", error);
          toast({ title: "Warning", description: "Supplier created but some attachments failed.", variant: "destructive" });
        }
      }

      toast({
        title: supplier ? "Supplier updated" : "Supplier created",
        description: "The supplier information has been saved successfully.",
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

  const removeAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      await apiRequest("DELETE", `/api/suppliers/attachments/${attachmentId}`);
    },
    onSuccess: () => {
      if (supplier?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/suppliers", supplier.id, "attachments"] });
      }
      toast({ title: "Success", description: "Attachment removed successfully" });
    },
  });

  const handleSelectFromStorage = async (selections: { document: any, title: string }[]) => {
    if (storageMode === 'logo') {
      const selected = selections[0];
      if (selected) {
        const url = selected.document.fileUrl || selected.document.fileData;
        form.setValue("logoUrl", url);
        toast({ title: "Logo updated", description: "The company logo has been selected." });
      }
      setIsProjectStorageOpen(false);
      return;
    }

    if (!supplier?.id) {
      setPendingAttachments(prev => [
        ...prev, 
        ...selections.map(s => ({ document: s.document, category: s.title, id: crypto.randomUUID() }))
      ]);
      setIsProjectStorageOpen(false);
      toast({ title: "Success", description: `${selections.length} documents added to list` });
      return;
    }
    
    try {
      for (const selection of selections) {
        await apiRequest("POST", `/api/suppliers/${supplier.id}/attachments`, {
          documentId: selection.document.id,
          category: selection.title,
          remarks: "",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", supplier.id, "attachments"] });
      setIsProjectStorageOpen(false);
      toast({ title: "Success", description: `${selections.length} documents linked successfully` });
    } catch (error: any) {
      toast({ title: "Error linking documents", description: error.message, variant: "destructive" });
    }
  };

  const onSubmit = (values: InsertSupplier) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden border-none shadow-2xl rounded-[2.5rem] bg-[#f8f9fa] dark:bg-background h-[90vh] flex flex-col">
        {/* Modern Header with Gradient */}
        <div className="relative bg-gradient-to-r from-primary to-primary/80 p-8 text-primary-foreground shrink-0 overflow-hidden">
          <div className="absolute top-0 right-0 p-16 bg-white/10 blur-3xl rounded-full -mr-16 -mt-16 animate-pulse" />
          <div className="relative flex items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/30 shadow-2xl transition-transform duration-500 hover:scale-105">
               <Users className="w-8 h-8 text-white" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-black tracking-tight drop-shadow-md">
                {supplier ? "Edit Supplier Profile" : "Onboard New Supplier"}
              </DialogTitle>
              <p className="text-primary-foreground/70 text-xs font-black uppercase tracking-[0.2em] mt-1.5 opacity-80">
                {supplier ? `Managing ${supplier.supplierName}` : "Register a new vendor to project catalog"}
              </p>
            </div>
          </div>
        </div>

        <Form {...form}>
          <form 
            onSubmit={form.handleSubmit(
              onSubmit,
              (errors) => {
                console.error("Supplier form validation errors:", errors);
                const firstErrorKey = Object.keys(errors)[0];
                const firstErrorMsg = errors[firstErrorKey as keyof typeof errors]?.message as string;
                if (firstErrorMsg) {
                  toast({
                    title: `Validation Error: ${firstErrorKey}`,
                    description: firstErrorMsg,
                    variant: "destructive",
                  });
                }
              }
            )} 
            className="flex-1 overflow-hidden flex flex-col"
          >
            <div className="flex-1 overflow-y-auto px-10 py-10 space-y-12 custom-scrollbar">
              
              {/* Logo Upload Section */}
              <div className="flex flex-col items-center justify-center group/logo relative">
                <div className="relative">
                  <div className="w-36 h-36 rounded-[2rem] bg-white dark:bg-card border-2 border-dashed border-primary/20 shadow-2xl overflow-hidden flex items-center justify-center transition-all duration-500 group-hover/logo:border-primary/50 group-hover/logo:shadow-primary/10 group-hover/logo:-translate-y-1">
                    {form.watch("logoUrl") ? (
                      <img 
                        src={form.watch("logoUrl")!} 
                        alt="Preview" 
                        className="w-full h-full object-contain p-3"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-muted-foreground/30 group-hover/logo:text-primary/40 transition-colors">
                        <ImageIcon className="w-12 h-12" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Company Logo</span>
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-2 -right-2">
                    <div 
                      className="bg-primary text-primary-foreground p-3 rounded-2xl shadow-xl border-4 border-[#f8f9fa] dark:border-background transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer shadow-primary/20" 
                      onClick={() => {
                        setStorageMode('logo');
                        setIsProjectStorageOpen(true);
                      }}
                    >
                      <Plus className="w-5 h-5" />
                    </div>
                  </div>
                </div>
                <div className="mt-6 w-full max-w-xs">
                   <FormField
                    control={form.control}
                    name="logoUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input 
                            {...field} 
                            value={field.value ?? ""}
                            placeholder="Paste logo image URL here..." 
                            className="h-9 text-[10px] text-center bg-white border-none shadow-sm rounded-full focus-visible:ring-primary/20 placeholder:text-muted-foreground/40 font-bold"
                          />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* General Information Section */}
              <div className="space-y-6">
                <div className="flex items-center gap-4 border-b border-border/40 pb-3">
                  <div className="bg-primary/10 p-2 rounded-xl">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-foreground/80">General Information</h3>
                </div>
                
                <div className="grid grid-cols-1 gap-6">
                  <FormField
                    control={form.control}
                    name="supplierName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Company Name</FormLabel>
                        <FormControl>
                          <div className="relative group/input">
                            <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/40 transition-colors group-focus-within/input:text-primary" />
                            <Input 
                              placeholder="Legal Entity Name (e.g. Alyusr Elevator Solutions)" 
                              {...field} 
                              className="pl-12 h-12 bg-white border-none shadow-sm rounded-2xl focus-visible:ring-primary/20 transition-all focus:shadow-xl focus:-translate-y-0.5 text-sm font-bold"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="experienceYears"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Experience Years</FormLabel>
                          <FormControl>
                            <div className="relative group/input">
                              <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/40 transition-colors group-focus-within/input:text-primary" />
                              <Input 
                                type="number"
                                min="0"
                                placeholder="e.g. 5" 
                                {...field}
                                value={field.value ?? ""}
                                onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                className="pl-12 h-12 bg-white border-none shadow-sm rounded-2xl focus-visible:ring-primary/20 transition-all focus:shadow-xl focus:-translate-y-0.5 text-sm font-bold"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Category (الفئة)</FormLabel>
                          <FormControl>
                            <div className="relative group/input">
                              <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/40 transition-colors group-focus-within/input:text-primary" />
                              <Input 
                                placeholder="e.g. Civil, Mechanical..." 
                                {...field}
                                value={field.value ?? ""}
                                className="pl-12 h-12 bg-white border-none shadow-sm rounded-2xl focus-visible:ring-primary/20 transition-all focus:shadow-xl focus:-translate-y-0.5 text-sm font-bold"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              {/* Contact Details Section */}
              <div className="space-y-6 pt-2">
                <div className="flex items-center gap-4 border-b border-border/40 pb-3">
                  <div className="bg-primary/10 p-2 rounded-xl">
                    <Loader2 className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-foreground/80">Contact Details</h3>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="contactPerson"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Contact Person</FormLabel>
                        <FormControl>
                          <Input placeholder="Full Name" {...field} value={field.value ?? ""} className="h-12 bg-white border-none shadow-sm rounded-2xl focus-visible:ring-primary/20 text-sm font-bold" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="+966 5..." {...field} value={field.value ?? ""} className="h-12 bg-white border-none shadow-sm rounded-2xl focus-visible:ring-primary/20 text-sm font-bold" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="col-span-2">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Official Email Address</FormLabel>
                          <FormControl>
                            <Input placeholder="procurement@company.sa" {...field} value={field.value ?? ""} className="h-12 bg-white border-none shadow-sm rounded-2xl focus-visible:ring-primary/20 text-sm font-bold" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="col-span-2">
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Headquarters Address</FormLabel>
                          <FormControl>
                            <Input placeholder="Street, District, City..." {...field} value={field.value ?? ""} className="h-12 bg-white border-none shadow-sm rounded-2xl focus-visible:ring-primary/20 text-sm font-bold" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              {/* Compliance Section */}
              <div className="space-y-6 pt-2">
                <div className="flex items-center gap-4 border-b border-border/40 pb-3">
                  <div className="bg-primary/10 p-2 rounded-xl">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-foreground/80">Compliance & Legal</h3>
                </div>

                <FormField
                  control={form.control}
                  name="taxNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Tax Number (VAT)</FormLabel>
                      <FormControl>
                        <Input placeholder="300... (15 digits)" {...field} value={field.value ?? ""} maxLength={15} className="h-12 bg-white border-none shadow-sm rounded-2xl focus-visible:ring-primary/20 font-mono tracking-[0.3em] text-sm font-black" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Attachments Section */}
                <div className="mt-8">
                  <div className="flex items-center justify-between mb-5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Attachments & Certificates</Label>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setStorageMode('attachment');
                          setIsProjectStorageOpen(true);
                        }}
                        className="rounded-2xl h-9 px-5 text-[10px] font-black uppercase tracking-widest border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground transition-all shadow-sm"
                      >
                        <Plus className="w-4 h-4 mr-2" /> Add Document
                      </Button>
                    </div>

                    <div className="grid gap-4">
                      {isLoadingAttachments ? (
                        <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary/20" /></div>
                      ) : (supplier ? attachments : pendingAttachments).length === 0 ? (
                        <div className="bg-white/50 border-2 border-dashed border-border rounded-3xl p-12 text-center flex flex-col items-center gap-4 transition-colors hover:border-primary/20">
                           <div className="bg-muted/10 p-4 rounded-full">
                              <FileText className="w-10 h-10 text-muted-foreground/10" />
                           </div>
                           <div className="space-y-1">
                              <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">No documents attached</p>
                              <p className="text-[10px] text-muted-foreground/40 font-bold uppercase tracking-tight">Add certificates, licenses, or agreements</p>
                           </div>
                        </div>
                      ) : (
                        (supplier ? attachments : pendingAttachments).map((attachment) => (
                          <div 
                            key={attachment.id} 
                            className="flex items-center justify-between p-5 bg-white hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 rounded-3xl border border-white group/att shadow-sm"
                          >
                            <div className="flex items-center gap-5 min-w-0 flex-1">
                              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center group-hover/att:bg-primary/20 transition-colors shrink-0">
                                <FileText className="w-6 h-6 text-primary" />
                              </div>
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <p className="text-sm font-black text-foreground/90 truncate leading-tight tracking-tight">
                                  {attachment.document.fileName || attachment.document.name}
                                </p>
                                <div className="flex items-center gap-3">
                                  {attachment.category && (
                                    <Badge 
                                      variant="outline" 
                                      className="text-[9px] font-black px-2.5 py-0.5 bg-primary/5 border-primary/20 text-primary uppercase tracking-tight h-5 shadow-sm"
                                    >
                                      {attachment.category.split(' (')[0]}
                                    </Badge>
                                  )}
                                  <span className="text-[10px] font-black text-muted-foreground/40 tabular-nums uppercase">
                                    {formatFileSize(attachment.document.size || (attachment.document as any).fileSize)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-6">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (supplier) {
                                    removeAttachmentMutation.mutate(attachment.id);
                                  } else {
                                    setPendingAttachments(prev => prev.filter(a => a.id !== attachment.id));
                                  }
                                }}
                                disabled={removeAttachmentMutation.isPending}
                                className="h-10 w-10 text-destructive/30 hover:text-white hover:bg-destructive rounded-2xl transition-all shadow-sm active:scale-90"
                              >
                                <Trash2 className="w-5 h-5" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
              </div>
            </div>

            {/* Sticky Action Bar */}
            <div className="px-10 py-6 bg-white border-t border-border/40 flex items-center justify-between shrink-0 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)]">
               <Button 
                type="button" 
                variant="ghost" 
                onClick={() => onOpenChange(false)}
                className="rounded-2xl h-14 px-10 text-xs font-black uppercase tracking-[0.2em] text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                Discard
              </Button>
              <Button 
                type="submit" 
                disabled={mutation.isPending}
                className="rounded-2xl h-14 px-12 text-xs font-black uppercase tracking-[0.2em] bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xl shadow-primary/30 transition-all hover:scale-[1.03] active:scale-95 flex items-center gap-3"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>{supplier ? "Update Profile" : "Register Supplier"}</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>

      <ProjectStorageModal
        projectId={projectId}
        isOpen={isProjectStorageOpen}
        onClose={() => setIsProjectStorageOpen(false)}
        onSelect={handleSelectFromStorage}
        multiSelect={storageMode === 'attachment'}
        suggestions={storageMode === 'attachment' ? SUPPLIER_DOCUMENT_CATEGORIES : []}
        skipLabels={storageMode === 'logo'}
      />
    </Dialog>
  );
}
