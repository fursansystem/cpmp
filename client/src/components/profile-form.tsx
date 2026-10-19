import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { User as UserIcon, Camera, X, PenLine } from "lucide-react";

const profileUpdateSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  fullNameArabic: z.string().optional(),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional().nullable(),
  photo: z.string().optional().nullable(),
  signature: z.string().optional().nullable(),
});

type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

interface ProfileFormProps {
  user: {
    id: string;
    fullName: string;
    fullNameArabic?: string | null;
    email: string;
    avatar?: string | null;
    role?: string;
    phone?: string | null;
    photo?: string | null;
    signature?: string | null;
  };
}

export function ProfileForm({ user }: ProfileFormProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(user.photo || null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(user.signature || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const { refetchUser } = useAuth();

  const form = useForm<ProfileUpdateInput>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      fullName: user.fullName,
      fullNameArabic: user.fullNameArabic || "",
      email: user.email,
      phone: user.phone || "",
      photo: user.photo || null,
      signature: user.signature || null,
    },
  });

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setPhotoPreview(base64);
        form.setValue("photo", base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoPreview(null);
    form.setValue("photo", null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSignatureChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setSignaturePreview(base64);
        form.setValue("signature", base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveSignature = () => {
    setSignaturePreview(null);
    form.setValue("signature", null);
    if (signatureInputRef.current) {
      signatureInputRef.current.value = "";
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileUpdateInput) => {
      return await apiRequest("PATCH", `/api/users/${user.id}`, data);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      // Refresh the authenticated user data to reflect profile changes immediately
      await refetchUser();
      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const initials = user.fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserIcon className="w-5 h-5" />
          Profile
        </CardTitle>
        <CardDescription>Manage your personal account information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start gap-4">
          <Avatar className="w-16 h-16">
            {photoPreview ? (
              <AvatarImage src={photoPreview} alt={user.fullName} />
            ) : user.avatar ? (
              <AvatarImage src={user.avatar} alt={user.fullName} />
            ) : null}
            <AvatarFallback className="bg-primary text-primary-foreground font-medium text-lg">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="font-medium">{user.fullName}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            {user.phone && <p className="text-sm text-muted-foreground">{user.phone}</p>}
            <p className="text-xs text-muted-foreground capitalize mt-1">{user.role}</p>
          </div>
        </div>

        {!isEditing ? (
          <Button onClick={() => setIsEditing(true)} data-testid="button-edit-profile">
            Edit Profile
          </Button>
        ) : (
          <form
            onSubmit={form.handleSubmit((data) => updateMutation.mutateAsync(data))}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                placeholder="Your full name"
                {...form.register("fullName")}
                data-testid="input-fullName"
              />
              {form.formState.errors.fullName && (
                <p className="text-sm text-destructive">{form.formState.errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullNameArabic">Full Name (Arabic)</Label>
              <Input
                id="fullNameArabic"
                placeholder="اسمك بالعربية"
                {...form.register("fullNameArabic")}
                data-testid="input-fullNameArabic"
                dir="rtl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                {...form.register("email")}
                data-testid="input-email"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="Your phone number"
                {...form.register("phone")}
                data-testid="input-phone"
              />
            </div>

            <div className="space-y-2">
              <Label>Photo</Label>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="w-20 h-20">
                    {photoPreview ? (
                      <AvatarImage src={photoPreview} alt="Profile photo" />
                    ) : null}
                    <AvatarFallback className="bg-primary text-primary-foreground font-medium text-lg">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="hidden"
                    data-testid="input-photo"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute bottom-0 right-0 rounded-full h-7 w-7"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-upload-photo"
                  >
                    <Camera className="w-3 h-3" />
                  </Button>
                  {photoPreview && (
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute top-0 right-0 rounded-full h-5 w-5"
                      onClick={handleRemovePhoto}
                      data-testid="button-remove-photo"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Personal Signature</Label>
              <div className="flex items-center gap-4">
                <div className="relative border rounded-md p-2 bg-muted/30 min-w-[200px] h-[80px] flex items-center justify-center">
                  {signaturePreview ? (
                    <>
                      <img 
                        src={signaturePreview} 
                        alt="Signature" 
                        className="max-h-[70px] max-w-[180px] object-contain"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        className="absolute top-1 right-1 rounded-full h-5 w-5"
                        onClick={handleRemoveSignature}
                        data-testid="button-remove-signature"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-sm">No signature uploaded</span>
                  )}
                </div>
                <input
                  ref={signatureInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleSignatureChange}
                  className="hidden"
                  data-testid="input-signature"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => signatureInputRef.current?.click()}
                  data-testid="button-upload-signature"
                >
                  <PenLine className="w-4 h-4 mr-2" />
                  Upload Signature
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-save-profile"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  form.reset();
                }}
                data-testid="button-cancel-profile"
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
