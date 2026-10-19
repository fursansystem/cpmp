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
import { updateMaterialSupplierSchema, type Material, type MaterialSupplier } from "@shared/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Package, DollarSign, Clock } from "lucide-react";
import { useEffect } from "react";

interface EditMaterialLinkDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  link: (MaterialSupplier & { material: Material }) | null;
}

export function EditMaterialLinkDialog({
  isOpen,
  onOpenChange,
  supplierId,
  link,
}: EditMaterialLinkDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(updateMaterialSupplierSchema),
    defaultValues: {
      lastPrice: "",
      leadTime: "",
    },
  });

  useEffect(() => {
    if (link) {
      form.reset({
        lastPrice: link.lastPrice || "",
        leadTime: link.leadTime || "",
      });
    }
  }, [link, form]);

  const mutation = useMutation({
    mutationFn: async (values: any) => {
      if (!link) return;
      const res = await apiRequest("PATCH", `/api/material-suppliers/${link.id}`, values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", supplierId, "materials"] });
      toast({
        title: "Updated",
        description: "Material supplier details updated successfully",
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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl border-none shadow-2xl">
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-center gap-3">
             <div className="p-2.5 bg-primary/10 rounded-2xl">
                <Package className="w-5 h-5 text-primary" />
             </div>
             <div>
                <DialogTitle className="text-xl font-black tracking-tight">
                  Edit Supplier Material
                </DialogTitle>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">
                  {link?.material.materialName}
                </p>
             </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-6 pt-6">
            <div className="grid grid-cols-1 gap-6">
                <FormField
                  control={form.control}
                  name="lastPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <DollarSign className="w-3.5 h-3.5" /> Last Supply Price
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                           <Input 
                              {...field} 
                              type="text"
                              placeholder="0.00" 
                              className="rounded-2xl h-12 bg-muted/30 border-none font-bold focus:ring-2 focus:ring-primary/20" 
                           />
                           <div className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-xs text-muted-foreground uppercase">
                              USD
                           </div>
                        </div>
                      </FormControl>
                      <FormMessage className="text-[10px] font-bold" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="leadTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" /> Lead Time / Delivery
                      </FormLabel>
                      <FormControl>
                        <Input 
                           {...field} 
                           value={field.value || ""} 
                           placeholder="e.g. 3-5 Business Days" 
                           className="rounded-2xl h-12 bg-muted/30 border-none font-bold focus:ring-2 focus:ring-primary/20" 
                        />
                      </FormControl>
                      <FormMessage className="text-[10px] font-bold" />
                    </FormItem>
                  )}
                />
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => onOpenChange(false)} 
                className="rounded-2xl font-black text-[10px] uppercase tracking-widest px-6"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={mutation.isPending} 
                className="rounded-2xl font-black text-[10px] uppercase tracking-widest px-8 shadow-xl shadow-primary/20 h-11"
              >
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Details
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
