import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Link2, Search, Check, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Material } from "@shared/schema";

interface LinkMaterialDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  supplierId: string;
  availableMaterials: Material[];
  alreadyLinkedIds: string[];
}

export function LinkMaterialDialog({
  isOpen,
  onOpenChange,
  projectId,
  supplierId,
  availableMaterials,
  alreadyLinkedIds,
}: LinkMaterialDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredMaterials = availableMaterials.filter(m => 
    !alreadyLinkedIds.includes(m.id) && 
    (m.materialName.toLowerCase().includes(searchQuery.toLowerCase()) || 
     m.category?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const mutation = useMutation({
    mutationFn: async (materialId: string) => {
      const res = await apiRequest("POST", "/api/material-suppliers", {
        materialId,
        supplierId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", supplierId, "materials"] });
      toast({
        title: "Linked",
        description: "Material linked to supplier successfully",
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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-primary/10 rounded-xl">
                <Link2 className="w-5 h-5 text-primary" />
             </div>
             <DialogTitle className="text-xl font-bold">
               Link Existing Material
             </DialogTitle>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-4">
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search materials..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 rounded-xl"
              />
           </div>

           <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                 {filteredMaterials.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground italic text-sm">
                        No available materials found.
                    </div>
                 ) : (
                    filteredMaterials.map((material) => (
                        <div 
                          key={material.id} 
                          className="flex items-center justify-between p-3 rounded-xl border border-muted bg-muted/30 hover:bg-muted/50 transition-colors group"
                        >
                            <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-sm">{material.materialName}</span>
                                <span className="text-[10px] text-muted-foreground uppercase font-medium">{material.category}</span>
                            </div>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => mutation.mutate(material.id)}
                              disabled={mutation.isPending}
                              className="rounded-lg hover:bg-primary hover:text-primary-foreground"
                            >
                                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            </Button>
                        </div>
                    ))
                 )}
              </div>
           </ScrollArea>
        </div>

        <div className="p-6 pt-0 flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl font-bold text-xs uppercase">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
