import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useLocation } from "wouter";
import type { User } from "@shared/schema";
import { queryClient } from "./queryClient";

type SafeUser = Omit<User, "password"> & { organizationId?: string | null; organizationSectorType?: string | null; positions?: string[] };

interface AuthContextType {
  user: SafeUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Failed to fetch session:", error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (username: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        return { success: false, error: data.error || "فشل تسجيل الدخول" };
      }
      
      queryClient.clear();
      setUser(data.user);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: "خطأ في الاتصال بالخادم" };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      setUser(null);
      queryClient.clear();
      setLocation("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const refetchUser = async () => {
    await fetchUser();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
