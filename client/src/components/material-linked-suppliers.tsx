import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Building2, Loader2, Users, MapPin, Hash, Briefcase, Mail, Phone, Edit2, Package, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SupplierAttachmentsMenu } from "@/pages/create-wir-request";

interface MaterialLinkedSuppliersProps {
  materialId: string;
  materialName?: string;
  onEditSupplier?: (supplier: any) => void;
  readOnly?: boolean;
}

export function MaterialLinkedSuppliers({ materialId, materialName, onEditSupplier, readOnly = false }: MaterialLinkedSuppliersProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: linkedSuppliers = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/materials", materialId, "suppliers"],
    enabled: !!materialId,
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/material-suppliers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/materials", materialId, "suppliers"] });
      toast({
        title: "Unlinked",
        description: "Supplier has been unlinked from material",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 border border-border/40 rounded-2xl bg-muted/5 supplier-loading">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Loading suppliers...</span>
      </div>
    );
  }

  if (linkedSuppliers.length === 0) {
    return <div className="hidden" data-empty="true" />;
  }

  return (
    <div className="relative border border-border/40 rounded-2xl p-4 bg-muted/5 supplier-item">
      {materialName && (
        <div className="absolute -top-3 left-4 bg-white dark:bg-card px-2 text-xs font-bold text-primary flex items-center gap-1.5 border border-primary/20 rounded-lg py-0.5">
          <Package className="w-3 h-3" />
          {materialName}
        </div>
      )}
      
      <div className="space-y-4">
          {linkedSuppliers.map((link) => {
            const supplier = link.supplier;
            if (!supplier) return null;
            
            return (
              <div key={link.id} className="bg-white border border-border/40 rounded-2xl p-5 shadow-sm relative group transition-all duration-300 hover:shadow-md">
                {/* Top Row: Name, Category, Actions */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex gap-4 items-center">
                    <div className="w-14 h-14 rounded-[1rem] bg-muted/20 overflow-hidden shrink-0 border border-border/50 flex items-center justify-center relative shadow-sm group-hover:shadow-md transition-all group-hover:border-primary/20 text-primary">
                      {supplier.logoUrl ? (
                        <>
                          <img 
                            src={supplier.logoUrl} 
                            alt={supplier.supplierName} 
                            className="w-full h-full object-contain p-1.5 bg-white transition-transform duration-500 group-hover:scale-110"
                            onError={(e) => {
                              (e.target as any).style.display = "none";
                              (e.target as any).nextSibling.style.display = "flex";
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-muted/20 text-primary" style={{ display: "none" }}>
                            <Building2 className="w-6 h-6" />
                          </div>
                        </>
                      ) : (
                        <Building2 className="w-6 h-6" />
                      )}
                    </div>
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
                    {onEditSupplier && !readOnly && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-primary hover:bg-primary/10 rounded-xl transition-all opacity-50 group-hover:opacity-100"
                        onClick={() => onEditSupplier(supplier)}
                        title="Edit Supplier"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                    {!readOnly && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-xl transition-all opacity-50 group-hover:opacity-100"
                        onClick={() => removeMutation.mutate(link.id)}
                        disabled={removeMutation.isPending}
                        title="Unlink Supplier"
                      >
                        {removeMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    )}
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

                {/* Action Bar (Attachments) */}
                <div className="flex items-center justify-start mt-2 border-t pt-2 w-full">
                  <SupplierAttachmentsMenu supplierId={supplier.id} />
                </div>
              </div>
            );
          })}
        </div>
    </div>
  );
}
