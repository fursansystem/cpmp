import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationCenter } from "@/components/notification-center";
import { InvitationsIndicator } from "@/components/invitations-indicator";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { LogOut, User, Settings, Home, FolderKanban, BarChart3, Briefcase } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { setOpen, isMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [location, isMobile, setOpenMobile]);

  const navItems = [
    { label: "Home", href: "/", icon: Home },
    { label: "Projects", href: "/projects", icon: Briefcase },
    { label: "Reports", href: "/reports", icon: BarChart3 },
  ].filter(item => {
    if (item.label === "Reports" && user?.organizationSectorType === "Consultant") {
      return false;
    }
    return true;
  });

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header className="flex items-center justify-between gap-6 p-4 border-b bg-background">
      <div className="flex items-center gap-4 flex-1">
        <SidebarTrigger data-testid="button-sidebar-toggle" />
        <nav className="flex items-center gap-6 md:gap-10 ml-2 md:ml-8">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-2.5 py-3 transition-all duration-300 cursor-pointer relative group",
                  location === item.href
                    ? "text-primary"
                    : "text-muted-foreground/60 hover:text-foreground"
                )}
                data-testid={`link-nav-${item.label.toLowerCase()}`}
                title={item.label}
              >
                <item.icon className={cn(
                  "h-4 w-4 transition-transform duration-300 group-hover:scale-110",
                  location === item.href ? "text-primary" : "text-muted-foreground/40 group-hover:text-foreground/70"
                )} />
                <span className="hidden md:inline text-[11px] font-black uppercase tracking-[0.2em]">
                  {item.label}
                </span>
                
                {/* Premium Active Indicator */}
                {location === item.href && (
                  <div className="absolute bottom-0 left-0 w-full h-[3px] bg-primary rounded-t-full shadow-[0_-2px_8px_rgba(var(--primary),0.4)] animate-in slide-in-from-bottom-1 duration-300" />
                )}
                
                {/* Hover Indicator */}
                {location !== item.href && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[2px] bg-primary/30 rounded-t-full group-hover:w-full transition-all duration-300" />
                )}
              </div>
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <InvitationsIndicator />
        <NotificationCenter />
        <ThemeToggle />
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full" data-testid="button-user-menu">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user.avatar || undefined} alt={user.fullName} />
                  <AvatarFallback>{getInitials(user.fullName)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <div className="flex flex-col space-y-1 p-2">
                <p className="text-sm font-medium leading-none">{user.fullName}</p>
                <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <span className="flex items-center w-full cursor-pointer">
                    <Settings className="ml-2 h-4 w-4" />
                    الإعدادات
                  </span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive cursor-pointer" data-testid="button-logout">
                <LogOut className="ml-2 h-4 w-4" />
                تسجيل الخروج
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
