import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Link2, Search, Plus, Building2, Check, Trash2, Database } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import type { Supplier } from "@shared/schema";

interface LinkSupplierDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  materialId: string;
  availableSuppliers: Supplier[];
  alreadyLinkedIds: string[];
  onCreateNew?: () => void;
}

export function LinkSupplierDialog({
  isOpen,
  onOpenChange,
  projectId,
  materialId,
  availableSuppliers,
  alreadyLinkedIds,
  onCreateNew,
}: LinkSupplierDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSuppliers, setSelectedSuppliers] = useState<Supplier[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddSupplier = (supplier: Supplier) => {
    if (!selectedSuppliers.find((s) => s.id === supplier.id)) {
      setSelectedSuppliers([...selectedSuppliers, supplier]);
    }
  };

  const handleRemoveSupplier = (id: string) => {
    setSelectedSuppliers(selectedSuppliers.filter((s) => s.id !== id));
  };

  const linkMutation = useMutation({
    mutationFn: async (supplierId: string) => {
      const res = await apiRequest("POST", "/api/material-suppliers", {
        materialId,
        supplierId,
      });
      return res.json();
    },
  });

  const handleDone = async () => {
    if (selectedSuppliers.length === 0) {
      onOpenChange(false);
      return;
    }

    setIsSubmitting(true);
    try {
      await Promise.all(
        selectedSuppliers.map((supplier) => linkMutation.mutateAsync(supplier.id))
      );
      
      queryClient.invalidateQueries({ queryKey: ["/api/materials", materialId, "suppliers"] });
      toast({
        title: "Success",
        description: `Successfully linked ${selectedSuppliers.length} supplier(s)`,
      });
      setSelectedSuppliers([]);
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to link some suppliers",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset selection when dialog closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedSuppliers([]);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between w-full pr-6">
            <DialogTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Select Suppliers
            </DialogTitle>
            {onCreateNew && (
              <Button
                onClick={() => {
                  onOpenChange(false);
                  setTimeout(() => onCreateNew(), 150);
                }}
                size="sm"
                variant="outline"
                className="rounded-xl shadow-sm bg-primary/5 text-primary hover:bg-primary/10 border-primary/20 transition-all"
              >
                <Plus className="w-4 h-4 mr-1" />
                Create New
              </Button>
            )}
          </div>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <Command className="border rounded-md shadow-sm">
            <CommandInput placeholder="Search supplier name or category..." />
            <CommandList className="max-h-[400px]">
              <CommandEmpty>No suppliers found.</CommandEmpty>
              <CommandGroup>
                {availableSuppliers.map((supplier) => {
                  const isAssigned = alreadyLinkedIds.includes(supplier.id);
                  const isSelected = selectedSuppliers.some(s => s.id === supplier.id);
                  
                  return (
                    <CommandItem
                      key={supplier.id}
                      value={`${supplier.supplierName} ${supplier.category || ''}`}
                      onSelect={() => {
                        if (!isAssigned && !isSelected) {
                          handleAddSupplier(supplier);
                        } else if (isSelected) {
                          handleRemoveSupplier(supplier.id);
                        }
                      }}
                      disabled={isAssigned}
                      className={`p-3 m-1 rounded-xl ${isAssigned ? "opacity-60 cursor-not-allowed" : "cursor-pointer"} ${isSelected ? "bg-muted" : ""}`}
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
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            {supplier.category && (
                              <Badge variant="outline" className="text-[10px] h-4">
                                {supplier.category}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {!isAssigned && (
                          isSelected ? (
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
            {selectedSuppliers.map((supplier) => (
              <Badge key={supplier.id} variant="secondary" className="gap-1 pr-1 shadow-sm bg-primary/5 text-primary border-primary/10">
                {supplier.supplierName}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 rounded-full p-0 hover:bg-primary/10"
                  onClick={() => handleRemoveSupplier(supplier.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </div>
        
        <DialogFooter className="pt-4 mt-2">
          <Button 
            variant="default" 
            onClick={handleDone} 
            className="w-full shadow-md"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Linking...
              </>
            ) : (
              `Done (${selectedSuppliers.length} selected)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

