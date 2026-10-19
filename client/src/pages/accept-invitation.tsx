import { useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Building2, ArrowRight, Loader2, CheckCircle, XCircle, Eye, EyeOff } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface InvitationDetails {
  email: string;
  sectorType: string;
  invitingOrganizationName: string;
  projectName: string | null;
}

const SECTOR_LABELS: Record<string, string> = {
  Contractor: "مقاول",
  Consultant: "استشاري",
};

// Public page: an invited contractor or consultant registers its own organization and
// its first admin account from the emailed link. Nothing here reveals data about other
// organizations, and the invitation token is what authorises the whole thing.
export default function AcceptInvitationPage() {
  const searchString = useSearch();
  const token = new URLSearchParams(searchString).get("token");

  const [isVerifying, setIsVerifying] = useState(true);
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [orgName, setOrgName] = useState("");
  const [orgNameArabic, setOrgNameArabic] = useState("");
  const [ccrNumber, setCcrNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [logo, setLogo] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [fullNameArabic, setFullNameArabic] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [adminPhone, setAdminPhone] = useState("");

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setIsVerifying(false);
        setError("رابط الدعوة غير مكتمل");
        return;
      }

      try {
        const response = await fetch(`/api/invitations/verify?token=${encodeURIComponent(token)}`);
        const data = await response.json();

        if (response.ok) {
          setInvitation(data);
        } else {
          setError(data.error || "رابط الدعوة غير صالح");
        }
      } catch {
        setError("حدث خطأ أثناء التحقق من الدعوة");
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setLogo(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!/^\d{10}$/.test(ccrNumber)) {
      setError("رقم السجل التجاري يجب أن يكون 10 أرقام");
      return;
    }
    if (vatNumber && !/^\d{15}$/.test(vatNumber)) {
      setError("الرقم الضريبي يجب أن يكون 15 رقماً");
      return;
    }
    if (password.length < 8) {
      setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
      return;
    }
    if (password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/invitations/accept", {
        token,
        organization: {
          name: orgName,
          nameArabic: orgNameArabic,
          phone,
          address,
          vatNumber,
          ccrNumber,
          logo: logo || "",
        },
        admin: {
          fullName,
          fullNameArabic,
          username,
          password,
          phone: adminPhone,
        },
      });
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء تسجيل المنشأة");
    } finally {
      setIsLoading(false);
    }
  };

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <p className="text-muted-foreground">جاري التحقق من الدعوة...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl font-display">تم تسجيل المنشأة</CardTitle>
            <CardDescription className="text-base">
              أصبح حسابك مسؤولاً عن المنشأة. سجّل الدخول لتجد دعوة المشاركة في المشروع
              بانتظار قبولك أو رفضك في صفحة الدعوات.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button className="w-full" data-testid="button-go-to-login">
                <ArrowRight className="w-4 h-4 ml-2" />
                تسجيل الدخول
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <XCircle className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-display">رابط غير صالح</CardTitle>
            <CardDescription className="text-base">
              {error || "رابط الدعوة غير صالح أو منتهي الصلاحية"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button variant="ghost" className="w-full" data-testid="button-back-to-login">
                <ArrowRight className="w-4 h-4 ml-2" />
                العودة لتسجيل الدخول
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sectorLabel = SECTOR_LABELS[invitation.sectorType] || invitation.sectorType;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <Card className="w-full max-w-2xl my-8">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-display">تسجيل المنشأة</CardTitle>
          <CardDescription className="text-base">
            {invitation.projectName ? (
              <>
                دعتكم <strong>{invitation.invitingOrganizationName}</strong> للمشاركة في مشروع{" "}
                <strong>{invitation.projectName}</strong> بصفة <strong>{sectorLabel}</strong>.
              </>
            ) : (
              <>
                دعتكم <strong>{invitation.invitingOrganizationName}</strong> للانضمام بصفة{" "}
                <strong>{sectorLabel}</strong>.
              </>
            )}{" "}
            سجّلوا بيانات منشأتكم هنا — وتبقى تحت إدارتكم وحدكم — ثم تقبلون المشروع أو
            ترفضونه بعد الدخول.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md text-center" data-testid="error-message">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground">بيانات المنشأة</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="orgName">اسم المنشأة *</Label>
                  <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} required disabled={isLoading} data-testid="input-org-name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgNameArabic">الاسم بالعربية</Label>
                  <Input id="orgNameArabic" value={orgNameArabic} onChange={(e) => setOrgNameArabic(e.target.value)} disabled={isLoading} data-testid="input-org-name-arabic" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ccrNumber">السجل التجاري (10 أرقام) *</Label>
                  <Input id="ccrNumber" value={ccrNumber} onChange={(e) => setCcrNumber(e.target.value)} required maxLength={10} inputMode="numeric" disabled={isLoading} data-testid="input-ccr-number" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vatNumber">الرقم الضريبي (15 رقماً)</Label>
                  <Input id="vatNumber" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} maxLength={15} inputMode="numeric" disabled={isLoading} data-testid="input-vat-number" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">هاتف المنشأة *</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required disabled={isLoading} data-testid="input-org-phone" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgEmail">البريد الإلكتروني</Label>
                  <Input id="orgEmail" value={invitation.email} readOnly disabled className="bg-muted" data-testid="input-org-email" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">العنوان</Label>
                  <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} disabled={isLoading} data-testid="input-org-address" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="logo">شعار المنشأة</Label>
                  <Input id="logo" type="file" accept="image/*" onChange={handleLogoChange} disabled={isLoading} data-testid="input-org-logo" />
                  {logo && (
                    <img src={logo} alt="Logo preview" className="mt-2 h-24 w-24 rounded object-cover border border-border" />
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground">حساب المسؤول</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">الاسم الكامل *</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required disabled={isLoading} data-testid="input-admin-name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fullNameArabic">الاسم بالعربية</Label>
                  <Input id="fullNameArabic" value={fullNameArabic} onChange={(e) => setFullNameArabic(e.target.value)} disabled={isLoading} data-testid="input-admin-name-arabic" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">اسم المستخدم *</Label>
                  <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} disabled={isLoading} data-testid="input-admin-username" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminPhone">الجوال</Label>
                  <Input id="adminPhone" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} disabled={isLoading} data-testid="input-admin-phone" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">كلمة المرور *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="pl-10"
                      data-testid="input-admin-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">تأكيد كلمة المرور *</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    data-testid="input-admin-confirm-password"
                  />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-register-organization">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جاري التسجيل...
                </>
              ) : (
                "تسجيل المنشأة"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
