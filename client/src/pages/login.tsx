import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import {
  LogIn,
  Eye,
  EyeOff,
  Loader2,
  Building2,
  HardHat,
  LayoutDashboard,
  Files,
  Users,
  CheckSquare,
  Briefcase,
  Construction,
  Hammer,
  Ruler,
  Compass,
  FileText
} from "lucide-react";

import logo from "@assets/Fursan_PMPro_1769674943487.png";

const bgIcons = [
  Building2, HardHat, LayoutDashboard, Files, Users,
  CheckSquare, Briefcase, Construction, Hammer, Ruler,
  Compass, FileText
];

import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";

function BackgroundIcons() {
  const icons = useMemo(() => {
    const items = [];
    const rows = 6;
    const cols = 10;
    let id = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        items.push({
          id: id++,
          Icon: bgIcons[id % bgIcons.length],
          // Grid position with random offset to prevent overlap but keep distribution
          x: (c * 10) + (Math.random() * 5),
          y: (r * 16) + (Math.random() * 8),
          size: 25 + Math.random() * 25,
          duration: 15 + Math.random() * 25,
          rotate: Math.random() * 360,
          moveY: (Math.random() - 0.5) * 30,
        });
      }
    }
    return items;
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {icons.map((item) => (
        <motion.div
          key={item.id}
          className="absolute opacity-35"
          style={{
            top: `${item.y}%`,
            left: `${item.x}%`,
            width: item.size,
            height: item.size,
            color: item.id % 2 === 0 ? "#D4AF37" : "#C5A028"
          }}
          animate={{
            y: [0, item.moveY, 0],
            rotate: [item.rotate, item.rotate + 360],
          }}
          transition={{
            duration: item.duration,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <item.Icon
            className="w-full h-full"
            style={{
              filter: `drop-shadow(0 0 10px ${item.id % 2 === 0 ? "rgba(212, 175, 55, 0.4)" : "rgba(197, 160, 40, 0.4)"})`
            }}
          />
        </motion.div>
      ))}
    </div>
  );
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  if (user) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await login(username, password);
      if (result.success) {
        setLocation("/");
      } else {
        setError(result.error || "اسم المستخدم أو كلمة المرور غير صحيحة");
      }
    } catch (err) {
      setError("حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-[#fafafa]" dir="rtl">
      {/* Background Layer with Soft Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#ffffff] via-[#f8f9fa] to-[#fcf3cf]/40 -z-10" />

      {/* Animated Background Icons */}
      <BackgroundIcons />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="rounded-[1.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-primary/30 backdrop-blur-xl bg-white/80 relative overflow-hidden">
          <CardHeader className="text-center space-y-4 pt-10 px-8">
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="mx-auto w-36 h-36 flex items-center justify-center"
            >
              <img src={logo} alt="Fursan PMPro" className="w-full h-full object-contain drop-shadow-xl" />
            </motion.div>
            <div className="space-y-2">
              <CardTitle className="text-3xl font-display font-extrabold text-[#1a1a1a] tracking-tight">مرحباً بك مجدداً</CardTitle>
              <CardDescription className="text-base text-muted-foreground/80 font-medium">
                نظام إدارة المشاريع المتكامل
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="px-8 pb-10 pt-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-4 text-sm font-semibold text-destructive bg-destructive/5 border border-destructive/10 rounded-[1.5rem] text-center flex items-center justify-center gap-2"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-[#333] font-bold text-sm mr-1 block text-center w-full">اسم المستخدم</Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="أدخل اسم المستخدم الخاص بك"
                    required
                    disabled={isLoading}
                    className="bg-white/50 border-primary/20 focus:border-primary focus:ring-4 focus:ring-primary/5 h-12 rounded-[1.5rem] transition-all placeholder:text-muted-foreground/50 text-center"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" title="password" className="text-[#333] font-bold text-sm mr-1 block text-center w-full">كلمة المرور</Label>
                  <div className="relative group">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      disabled={isLoading}
                      className="pl-12 pr-12 bg-white/50 border-primary/20 focus:border-primary focus:ring-4 focus:ring-primary/5 h-12 rounded-[1.5rem] transition-all placeholder:text-muted-foreground/50 text-center"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 h-9 w-9 text-muted-foreground/60 hover:text-primary transition-colors rounded-full overflow-hidden"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-lg font-bold shadow-xl shadow-primary/20 bg-primary hover:bg-primary/95 transition-all active:scale-[0.98] rounded-[1.5rem] relative overflow-hidden group"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جاري التحقق...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <LogIn className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                    <span>دخول النظام</span>
                  </div>
                )}
              </Button>

              <div className="text-center pt-2">
                <Link href="/forgot-password" title="password" className="text-sm font-bold text-muted-foreground/70 hover:text-primary transition-all underline-offset-8 decoration-primary/30 hover:underline">
                  هل نسيت كلمة المرور؟
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Footer Attribution */}
        <p className="text-center mt-8 text-sm font-medium text-muted-foreground/40">
          جميع الحقوق محفوظة © {new Date().getFullYear()} فرسان
        </p>
      </motion.div>
    </div>
  );
}
