import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Mail, ArrowRight, Loader2, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email });
      setIsSubmitted(true);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء إرسال رابط الاسترجاع");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl font-display">تم الإرسال</CardTitle>
            <CardDescription className="text-base">
              إذا كان البريد الإلكتروني مسجلاً لدينا، ستتلقى رابطاً لاسترجاع كلمة المرور خلال دقائق.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              يرجى التحقق من صندوق البريد الوارد ومجلد الرسائل غير المرغوب فيها.
            </p>
            <Link href="/login">
              <Button variant="outline" className="w-full" data-testid="button-back-to-login">
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
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-display">استرجاع كلمة المرور</CardTitle>
          <CardDescription>
            أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور
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
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="أدخل بريدك الإلكتروني"
                required
                disabled={isLoading}
                data-testid="input-email"
              />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
              data-testid="button-submit"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 ml-2" />
                  إرسال رابط الاسترجاع
                </>
              )}
            </Button>

            <div className="text-center">
              <Link href="/login" className="text-sm text-muted-foreground hover:text-primary" data-testid="link-login">
                العودة لتسجيل الدخول
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
