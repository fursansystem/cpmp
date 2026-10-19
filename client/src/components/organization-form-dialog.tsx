import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImagePlus, X } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertOrganizationSchema, type InsertOrganization, type Organization } from "@shared/schema";
import { z } from "zod";

interface OrganizationFormDialogProps {
  organization?: Organization;
  // Optional: the dialog can also be driven purely by the `open` prop, with no trigger
  // of its own, which is how editing works.
  trigger?: React.ReactNode;
  onSubmit: (data: InsertOrganization) => Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Sectors the current user may pick; defaults to all of them
  allowedSectorTypes?: readonly string[];
  // The sector decides what an organization is allowed to do, so it is a system
  // administrator's setting. Hidden from everyone else, and carried over unchanged.
  canChangeSector?: boolean;
}

const formSchema = insertOrganizationSchema.extend({
  logoFile: z.instanceof(File).optional(),
});

type FormData = z.infer<typeof formSchema>;

const sectorTypes = [
  "Developer",
  "Contractor",
  "Consultant",
];

export function OrganizationFormDialog({ organization, trigger, onSubmit, open: controlledOpen, onOpenChange, allowedSectorTypes, canChangeSector = true }: OrganizationFormDialogProps) {
  const availableSectorTypes = allowedSectorTypes ?? sectorTypes;
  const [internalOpen, setInternalOpen] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(organization?.logo || null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (onOpenChange || (() => { })) : setInternalOpen;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: organization ? {
      ...organization,
      logoFile: undefined,
      nameArabic: organization.nameArabic || "",
      sectorType: (organization.sectorType as FormData["sectorType"]) || undefined,
      vatNumber: organization.vatNumber || "",
      ccrNumber: organization.ccrNumber || "",
    } : {},
  });

  useEffect(() => {
    if (open) {
      if (organization) {
        reset({
          ...organization,
          logoFile: undefined,
          nameArabic: organization.nameArabic || "",
          sectorType: (organization.sectorType as FormData["sectorType"]) || undefined,
          vatNumber: organization.vatNumber || "",
          ccrNumber: organization.ccrNumber || "",
        });
        setLogoPreview(organization.logo || null);
      } else {
        reset({});
        setLogoPreview(null);
      }
    }
  }, [open, organization, reset]);

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    // Clearing the input lets the same file be chosen again right afterwards
    if (logoInputRef.current) {
      logoInputRef.current.value = "";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmitForm = async (data: FormData) => {
    let submitData: InsertOrganization = {
      name: data.name,
      nameArabic: data.nameArabic || undefined,
      email: data.email,
      phone: data.phone,
      // No longer asked for: nothing displays it but the card subtitle, and it merely
      // repeated the name. Existing values are preserved on edit.
      company: organization?.company ?? undefined,
      address: data.address,
      // When the field is hidden the organization keeps the sector it already has
      sectorType: canChangeSector
        ? data.sectorType || undefined
        : (organization?.sectorType as InsertOrganization["sectorType"]) || undefined,
      vatNumber: data.vatNumber || undefined,
      ccrNumber: data.ccrNumber,
      // null, not undefined: the update is a partial patch, so leaving the key out
      // would keep the old logo instead of removing it.
      logo: logoPreview ?? null,
    };
    await onSubmit(submitData);
    reset();
    setLogoPreview(null);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" hideCloseButton>
        <DialogHeader>
          <DialogTitle>{organization ? "Edit Organization" : "Add New Organization"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-4">
          <div className="flex justify-center pb-2">
            <div className="group relative h-28 w-28">
              <label
                htmlFor="logo"
                className="flex h-full w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/30 transition-colors hover:border-primary/60"
              >
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <ImagePlus className="h-7 w-7" />
                    <span className="text-xs">Add logo</span>
                  </div>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-center text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {logoPreview ? "Change" : "Upload"}
                </span>
              </label>
              {/* Sits outside the label so clicking it removes rather than reopens the
                  file picker. The file input is reset too, otherwise picking the same
                  file again would not fire a change event. */}
              {logoPreview && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  title="Remove logo"
                  aria-label="Remove logo"
                  className="absolute -right-2 -top-2 rounded-full border border-border bg-background p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                  data-testid="button-remove-logo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Input
              id="logo"
              ref={logoInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="sr-only"
              data-testid="input-logo"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name (English) *</Label>
              <Input
                id="name"
                {...register("name")}
                placeholder="Organization Name"
                data-testid="input-name"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="nameArabic">Name (Arabic)</Label>
              <Input
                id="nameArabic"
                {...register("nameArabic")}
                placeholder="الاسم بالعربية"
                dir="rtl"
                data-testid="input-name-arabic"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                {...register("email")}
                placeholder="contact@example.com"
                data-testid="input-email"
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                {...register("phone")}
                placeholder="(555) 123-4567"
                data-testid="input-phone"
              />
              {errors.phone && (
                <p className="text-sm text-destructive">{errors.phone.message}</p>
              )}
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                {...register("address")}
                placeholder="123 Main St, City, State ZIP"
                data-testid="input-address"
              />
            </div>

            {canChangeSector && (
            <div className="col-span-2 space-y-2">
              <Label htmlFor="sectorType">Sector Type</Label>
              <Controller
                name="sectorType"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <SelectTrigger data-testid="select-sector-type">
                      <SelectValue placeholder="Select sector type" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSectorTypes.map((sector) => (
                        <SelectItem key={sector} value={sector}>
                          {sector}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="vatNumber">VAT Number (15 digits)</Label>
              <Input
                id="vatNumber"
                {...register("vatNumber")}
                placeholder="123456789012345"
                maxLength={15}
                data-testid="input-vat-number"
              />
              {errors.vatNumber && (
                <p className="text-sm text-destructive">{errors.vatNumber.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ccrNumber">CCR Number (10 digits) *</Label>
              <Input
                id="ccrNumber"
                {...register("ccrNumber")}
                placeholder="1234567890"
                maxLength={10}
                data-testid="input-ccr-number"
              />
              {errors.ccrNumber && (
                <p className="text-sm text-destructive">{errors.ccrNumber.message}</p>
              )}
            </div>


          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} data-testid="button-submit">
              {isSubmitting ? "Saving..." : organization ? "Update Organization" : "Add Organization"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
