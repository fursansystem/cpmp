import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Lock, ArrowRight, Loader2, CheckCircle, XCircle, Eye, EyeOff } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setIsVerifying(false);
        setError("رمز الاسترجاع غير موجود");
        return;
      }

      try {
        const response = await fetch(`/api/auth/verify-reset-token/${token}`);
        const data = await response.json();
        
        if (data.valid) {
          setIsTokenValid(true);
        } else {
          setError(data.error || "رمز الاسترجاع غير صالح");
        }
      } catch (err) {
        setError("حدث خطأ أثناء التحقق من الرمز");
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }

    if (password.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }

    setIsLoading(true);

    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, password });
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء إعادة تعيين كلمة المرور");
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
              <p className="text-muted-foreground">جاري التحقق من الرمز...</p>
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
            <CardTitle className="text-2xl font-display">تم تغيير كلمة المرور</CardTitle>
            <CardDescription className="text-base">
              تم إعادة تعيين كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.
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

  if (!isTokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <XCircle className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-display">رابط غير صالح</CardTitle>
            <CardDescription className="text-base">
              {error || "رمز الاسترجاع غير صالح أو منتهي الصلاحية"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link href="/forgot-password">
              <Button variant="outline" className="w-full" data-testid="button-request-new">
                طلب رابط جديد
              </Button>
            </Link>
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-display">إعادة تعيين كلمة المرور</CardTitle>
          <CardDescription>
            أدخل كلمة المرور الجديدة
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md text-center" data-testid="error-message">
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور الجديدة</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور الجديدة"
                  required
                  disabled={isLoading}
                  className="pl-10"
                  data-testid="input-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="أعد إدخال كلمة المرور"
                  required
                  disabled={isLoading}
                  className="pl-10"
                  data-testid="input-confirm-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
              data-testid="button-reset-password"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جاري التحديث...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 ml-2" />
                  إعادة تعيين كلمة المرور
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
