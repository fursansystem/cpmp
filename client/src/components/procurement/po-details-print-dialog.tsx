import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, ShoppingCart, Building2, Calendar, MapPin, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Project, Organization } from "@shared/schema";

interface PoDetailsPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  poId: string | null;
  projectId: string;
}

export function PoDetailsPrintDialog({
  open,
  onOpenChange,
  poId,
  projectId,
}: PoDetailsPrintDialogProps) {
  const { data: po, isLoading } = useQuery<any>({
    queryKey: ["/api/purchase-orders", poId],
    enabled: open && !!poId,
  });

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: open && !!projectId,
  });

  const { data: organization } = useQuery<Organization>({
    queryKey: ["/api/organizations", project?.organizationId],
    enabled: open && !!project?.organizationId,
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-6 rounded-2xl print:p-0 print:max-w-none print:shadow-none print:border-none">
        <DialogHeader className="border-b pb-4 print:hidden flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            معاينة وطباعة أمر الشراء (Purchase Order Preview)
          </DialogTitle>
          <Button
            onClick={handlePrint}
            className="rounded-xl font-bold gap-2 bg-primary text-primary-foreground h-9 px-4"
          >
            <Printer className="w-4 h-4" />
            طباعة / تصدير PDF
          </Button>
        </DialogHeader>

        {isLoading || !po ? (
          <div className="text-center p-12 text-muted-foreground">جاري تحميل بيانات أمر الشراء...</div>
        ) : (
          <div className="space-y-6 p-4 print:p-8 bg-white dark:bg-slate-950 rounded-xl border print:border-none text-slate-900 dark:text-slate-100">
            {/* Document Header */}
            <div className="flex items-start justify-between border-b pb-6">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black text-xl">
                    PO
                  </div>
                  <div>
                    <h1 className="font-black text-2xl tracking-tight text-primary">أمر شراء رسمي</h1>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      Official Purchase Order
                    </p>
                  </div>
                </div>
                {organization && (
                  <div className="text-xs text-muted-foreground pt-1">
                    <p className="font-bold text-foreground">{organization.nameArabic || organization.name}</p>
                    {organization.vatNumber && <p>الرقم الضريبي: {organization.vatNumber}</p>}
                    {organization.phone && <p>الهاتف: {organization.phone}</p>}
                  </div>
                )}
              </div>

              <div className="text-left rtl:text-right space-y-1.5">
                <div className="inline-block bg-slate-100 dark:bg-slate-900 px-3 py-1.5 rounded-lg border font-mono font-bold text-base text-primary">
                  {po.poNumber}
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>
                    تاريخ الإصدار: <span className="font-semibold text-foreground">{po.orderDate}</span>
                  </p>
                  {po.expectedDeliveryDate && (
                    <p>
                      تاريخ التوريد المتوقع:{" "}
                      <span className="font-semibold text-foreground">{po.expectedDeliveryDate}</span>
                    </p>
                  )}
                  <p>
                    الحالة:{" "}
                    <Badge variant="secondary" className="text-[10px] font-bold px-2 py-0">
                      {po.status === "approved" ? "معتمد" : po.status}
                    </Badge>
                  </p>
                </div>
              </div>
            </div>

            {/* Project & Vendor Info Grid */}
            <div className="grid grid-cols-2 gap-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border text-xs">
              {/* Vendor Info */}
              <div className="space-y-1">
                <p className="font-bold text-primary text-sm mb-1.5 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" />
                  بيانات المورد (Vendor / Supplier):
                </p>
                <p className="font-bold text-sm text-foreground">{po.supplierName}</p>
                {po.supplierContactPerson && <p>المسؤول: {po.supplierContactPerson}</p>}
                {po.supplierPhone && <p>الهاتف: {po.supplierPhone}</p>}
                {po.supplierEmail && <p>البريد: {po.supplierEmail}</p>}
                {po.supplierTaxNumber && <p>الرقم الضريبي: {po.supplierTaxNumber}</p>}
              </div>

              {/* Project & Delivery Info */}
              <div className="space-y-1">
                <p className="font-bold text-primary text-sm mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  بيانات المشروع والتسليم:
                </p>
                <p className="font-bold text-sm text-foreground">المشروع: {project?.name}</p>
                <p>الموقع: {project?.location || "الموقع الرئيسي"}</p>
                {po.deliveryAddress && <p>عنوان التسليم: {po.deliveryAddress}</p>}
                {po.paymentTerms && <p>شروط الدفع: {po.paymentTerms}</p>}
              </div>
            </div>

            {/* Subject/Title */}
            <div>
              <p className="text-xs text-muted-foreground font-bold mb-1">الموضوع:</p>
              <p className="font-bold text-sm bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border">
                {po.title}
              </p>
            </div>

            {/* Items Table */}
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-slate-900 border-b font-bold text-slate-800 dark:text-slate-200">
                  <tr>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3">وصف البند / المواصفات الفنية</th>
                    <th className="p-3 w-24 text-center">الكمية</th>
                    <th className="p-3 w-20 text-center">الوحدة</th>
                    <th className="p-3 w-28 text-left rtl:text-right">سعر الوحدة (SAR)</th>
                    <th className="p-3 w-32 text-left rtl:text-right">الإجمالي (SAR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {po.items?.map((item: any, idx: number) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                      <td className="p-3 text-center text-muted-foreground font-semibold">{idx + 1}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {item.itemName || item.itemDescription}
                        </div>
                        {item.itemName && item.itemDescription && (
                          <p className="text-[11px] text-muted-foreground">{item.itemDescription}</p>
                        )}
                        {item.notes && <p className="text-[10px] text-muted-foreground">{item.notes}</p>}
                      </td>
                      <td className="p-3 text-center font-bold">{item.quantity}</td>
                      <td className="p-3 text-center text-muted-foreground">{item.unit || "pcs"}</td>
                      <td className="p-3 text-left rtl:text-right font-semibold">
                        {Number(item.unitPrice || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="p-3 text-left rtl:text-right font-bold text-slate-900 dark:text-slate-100">
                        {Number(item.totalPrice || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Summary */}
            <div className="flex justify-end pt-2">
              <div className="w-72 space-y-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>المجموع الفرعي (Subtotal):</span>
                  <span className="font-semibold text-foreground">
                    {Number(po.subtotal || 0).toFixed(2)} SAR
                  </span>
                </div>
                {Number(po.discountAmount) > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>الخصم (Discount):</span>
                    <span className="font-semibold">-{Number(po.discountAmount).toFixed(2)} SAR</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>ضريبة القيمة المضافة (VAT):</span>
                  <span className="font-semibold text-foreground">
                    +{Number(po.taxAmount || 0).toFixed(2)} SAR
                  </span>
                </div>
                <div className="flex justify-between font-black text-sm text-primary border-t pt-2">
                  <span>الإجمالي الكلي (Grand Total):</span>
                  <span>
                    {Number(po.totalAmount || 0).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    SAR
                  </span>
                </div>
              </div>
            </div>

            {/* Terms & Conditions */}
            {po.termsAndConditions && (
              <div className="border-t pt-4 space-y-1 text-xs">
                <p className="font-bold text-slate-800 dark:text-slate-200">الشروط والأحكام:</p>
                <p className="text-muted-foreground whitespace-pre-wrap">{po.termsAndConditions}</p>
              </div>
            )}

            {/* Signatures and Approvals */}
            <div className="grid grid-cols-3 gap-6 pt-12 text-center text-xs border-t">
              <div className="space-y-8">
                <p className="font-bold text-muted-foreground">إعداد / مهندس المشتريات</p>
                <div className="border-b border-dashed w-32 mx-auto" />
                <p className="text-[10px] text-muted-foreground">{po.creatorName || "المهندس المختص"}</p>
              </div>

              <div className="space-y-8">
                <p className="font-bold text-muted-foreground">اعتماد مدير المشروع</p>
                <div className="border-b border-dashed w-32 mx-auto" />
                <p className="text-[10px] text-emerald-600 font-bold flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> معتمد رسمياً
                </p>
              </div>

              <div className="space-y-8">
                <p className="font-bold text-muted-foreground">استلام وتوقيع المورد</p>
                <div className="border-b border-dashed w-32 mx-auto" />
                <p className="text-[10px] text-muted-foreground">{po.supplierName}</p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="border-t pt-4 print:hidden">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl font-bold"
          >
            إغلاق
          </Button>
          <Button
            type="button"
            onClick={handlePrint}
            className="rounded-xl font-bold gap-2 bg-primary text-primary-foreground"
          >
            <Printer className="w-4 h-4" />
            طباعة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
