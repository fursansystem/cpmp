import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Truck, Paperclip, FileSpreadsheet, ChevronRight, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatGMT3, cn } from "@/lib/utils";

interface DeliveryOverviewDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  delivery: any;
  onPreviewAttachment?: (attachment: any) => void;
}

export function DeliveryOverviewDialog({
  isOpen,
  onOpenChange,
  delivery,
  onPreviewAttachment,
}: DeliveryOverviewDialogProps) {
  if (!delivery) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-[1.5rem] overflow-hidden p-0 border-none shadow-2xl bg-white dark:bg-background [&>button]:hidden">
        {/* Manual Close Button - Premium Style */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-5 right-5 z-[100] w-10 h-10 flex items-center justify-center rounded-full bg-muted/50 hover:bg-muted transition-all duration-300 text-muted-foreground hover:text-foreground group active:scale-90"
        >
          <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
        </button>

        {/* Premium Background Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        
        <DialogHeader className="p-8 pb-4 relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground shadow-xl shadow-primary/30 rotate-3 group-hover:rotate-0 transition-transform duration-500">
              <Truck className="w-8 h-8" />
            </div>
            <div className="flex-grow text-left">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Delivery Overview</span>
              </div>
              <DialogTitle className="text-2xl font-black tracking-tighter text-foreground uppercase leading-none mb-1">
                {delivery.shipmentNumber}
              </DialogTitle>
              <DialogDescription className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60">
                {delivery.supplier}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-8 pb-6 relative z-10">
          {/* Metadata Cards */}
          <div className="grid grid-cols-2 gap-2 mb-6">
            <div className="bg-muted/30 p-2.5 rounded-[1.5rem] border border-muted/50 backdrop-blur-sm group hover:border-primary/30 transition-colors">
              <span className="text-[8px] font-black uppercase tracking-[0.15em] text-muted-foreground block mb-0.5 opacity-60">
                Invoice Number
              </span>
              <span className="text-base font-mono font-black text-foreground tracking-tight">
                {delivery.deliveryInvoiceNumber || "---"}
              </span>
            </div>
            <div className="bg-muted/30 p-2.5 rounded-[1.5rem] border border-muted/50 backdrop-blur-sm group hover:border-primary/30 transition-colors">
              <span className="text-[8px] font-black uppercase tracking-[0.15em] text-muted-foreground block mb-0.5 opacity-60">
                Arrival Date
              </span>
              <span className="text-base font-black text-foreground tracking-tight">
                {formatGMT3(delivery.arrivalDate, "MMM d, yyyy")}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4 ml-1">
            <div className="w-2 h-2 rounded-full bg-primary/40" />
            <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-foreground/70">
              Composition List
            </h3>
          </div>

          {/* Scrollable Items Table */}
          <div className="border border-muted/50 rounded-[1.5rem] overflow-hidden shadow-xl bg-white dark:bg-muted/5 backdrop-blur-md">
            <div className="max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-20 backdrop-blur-md">
                  <TableRow className="border-none hover:bg-transparent">
                    <TableHead className="py-4 pl-6 font-black uppercase text-[10px] tracking-[0.15em] text-muted-foreground">
                      Material
                    </TableHead>
                    <TableHead className="py-4 w-[120px] font-black uppercase text-[10px] tracking-[0.15em] text-center text-muted-foreground">
                      Quantity
                    </TableHead>
                    <TableHead className="py-4 w-[90px] font-black uppercase text-[10px] tracking-[0.15em] text-center text-muted-foreground">
                      Unit
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {delivery.items?.map((item: any, idx: number) => (
                    <TableRow
                      key={item.id}
                      className="border-muted/20 hover:bg-primary/5 transition-colors group/row"
                    >
                      <TableCell className="py-2.5 pl-6">
                        <div className="flex flex-col">
                          <span className="font-black text-sm text-foreground group-hover/row:text-primary transition-colors uppercase tracking-tight">
                            {item.materialName}
                          </span>
                          {item.materialDescription && (
                            <span className="text-[10px] text-muted-foreground/60 font-bold uppercase tracking-widest mt-1">
                              {item.materialDescription}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                         <span className="font-mono font-black text-primary text-sm tracking-tighter">
                          {item.arrivalQuantity}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/50 text-[8px] font-black text-muted-foreground uppercase tracking-widest">
                          {item.unit}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Attachment Preview Section */}
          {delivery.attachment && (
            <div className="mt-6">
              <div
                className="group p-3 bg-primary/5 rounded-[1.5rem] border border-dashed border-primary/20 hover:border-primary hover:bg-primary/10 transition-all duration-300 cursor-pointer flex items-center justify-between"
                onClick={() => onPreviewAttachment?.(delivery.attachment)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white dark:bg-background rounded-lg flex items-center justify-center border-none shadow-sm group-hover:bg-primary group-hover:text-white transition-all duration-300">
                    <Paperclip className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-primary block mb-0.5">
                      Attached Document
                    </span>
                    <span className="font-black text-[11px] text-foreground uppercase tracking-tight truncate max-w-[200px] block">
                      {delivery.attachment.fileName || delivery.attachment.name || "View Document"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-primary font-black text-[9px] uppercase tracking-widest mr-1">
                  Preview
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => onOpenChange(false)}
              className="px-10 h-12 rounded-[1.5rem] font-black text-[11px] uppercase tracking-[0.2em] bg-foreground hover:bg-foreground/90 text-background shadow-xl transition-all active:scale-95"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
