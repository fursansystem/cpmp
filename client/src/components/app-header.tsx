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
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { LogOut, Settings, Home, BarChart3, Briefcase, ChevronDown, Hourglass, TrendingUp, PieChart, Store, HardHat, FileText, Landmark, Scissors, Timer, PackageSearch } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Project } from "@shared/schema";
import { cn } from "@/lib/utils";

const REPORT_MENU_ITEMS = [
  { id: "aging", icon: Hourglass },
  { id: "cashflow", icon: TrendingUp },
  { id: "budget", icon: PieChart },
  { id: "supplier", icon: Store },
  { id: "sub", icon: HardHat },
  { id: "po", icon: FileText },
  { id: "licences", icon: Landmark },
  { id: "deductions", icon: Scissors },
  { id: "approvals", icon: Timer },
  { id: "pos", icon: PackageSearch },
] as const;

interface NavDropdownItemProps {
  label: string;
  href: string;
  icon: typeof Home;
  isActive: boolean;
  testId: string;
  children: ReactNode;
  onNavigate: (href: string) => void;
}

function NavDropdownItem({ label, href, icon: Icon, isActive, testId, children, onNavigate }: NavDropdownItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clearTimer = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openMenu = () => {
    clearTimer();
    setMenuOpen(true);
  };

  const scheduleClose = () => {
    clearTimer();
    closeTimer.current = window.setTimeout(() => setMenuOpen(false), 150);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => () => clearTimer(), []);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => {
          if (!menuOpen) {
            openMenu();
          } else {
            setMenuOpen(false);
            onNavigate(href);
          }
        }}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className={cn(
          "flex items-center gap-2 py-3 transition-all duration-300 cursor-pointer relative group bg-transparent border-0",
          isActive
            ? "text-primary"
            : "text-muted-foreground/60 hover:text-foreground"
        )}
        data-testid={testId}
        title={label}
      >
        <Icon className={cn(
          "h-4 w-4 transition-transform duration-300 group-hover:scale-110",
          isActive ? "text-primary" : "text-muted-foreground/40 group-hover:text-foreground/70"
        )} />
        <span className="hidden md:inline text-[11px] font-black uppercase tracking-[0.2em]">
          {label}
        </span>
        <ChevronDown className={cn(
          "hidden md:inline h-3.5 w-3.5 transition-transform duration-200 opacity-60",
          menuOpen && "rotate-180 opacity-100"
        )} />

        {isActive && (
          <div className="absolute bottom-0 start-0 w-full h-[3px] bg-primary rounded-t-full shadow-[0_-2px_8px_rgba(var(--primary),0.4)] animate-in slide-in-from-bottom-1 duration-300" />
        )}
        {!isActive && (
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[2px] bg-primary/30 rounded-t-full group-hover:w-full transition-all duration-300" />
        )}
      </button>

      {menuOpen && (
        <div
          role="menu"
          onClick={() => setMenuOpen(false)}
          className="absolute top-full start-0 z-50 mt-0.5 w-64 rounded-xl border bg-popover text-popover-foreground shadow-lg p-1.5 animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function AppHeader() {
  const { t, i18n } = useTranslation(["nav", "payments"]);
  const isAr = i18n.language === "ar";
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { setOpen, isMobile, setOpenMobile } = useSidebar();
  const { data: projectsList = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [location, isMobile, setOpenMobile]);

  const showReports = user?.organizationSectorType !== "Consultant";
  const navItems = [
    { key: "home", label: t("nav:home"), href: "/", icon: Home },
    { key: "projects", label: t("nav:projects"), href: "/projects", icon: Briefcase },
    ...(showReports ? [{ key: "reports", label: t("nav:reports"), href: "/reports", icon: BarChart3 }] : []),
  ];

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
        <nav className="flex items-center gap-6 md:gap-10 ms-2 md:ms-8">
          {navItems.map((item) => {
            const isActive = item.href === "/" ? location === "/" : location === item.href || location.startsWith(`${item.href}/`) || location.startsWith(`${item.href}?`);
            if (item.key === "projects") {
              return (
                <NavDropdownItem
                  key={item.href}
                  label={item.label}
                  href={item.href}
                  icon={item.icon}
                  isActive={isActive}
                  testId={`link-nav-${item.key}`}
                  onNavigate={(href) => navigate(href)}
                >
                  <Link
                    href="/projects"
                    className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Briefcase className="w-3.5 h-3.5 shrink-0" />
                      <span>{isAr ? "كل المشاريع" : "All Projects"}</span>
                    </span>
                    <span className="text-[11px] tabular-nums opacity-75">{projectsList.length}</span>
                  </Link>
                  {projectsList.length > 0 && (
                    <>
                      <div className="my-1 border-t border-border/60" />
                      <div className="max-h-72 overflow-y-auto space-y-0.5">
                        {projectsList.map((proj) => (
                          <Link
                            key={proj.id}
                            href={`/projects/${proj.id}`}
                            className={cn(
                              "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs hover:bg-muted/70 transition-colors",
                              location === `/projects/${proj.id}` && "bg-primary/10 text-primary font-semibold"
                            )}
                          >
                            <span className="truncate">{proj.name}</span>
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                </NavDropdownItem>
              );
            }

            if (item.key === "reports") {
              return (
                <NavDropdownItem
                  key={item.href}
                  label={item.label}
                  href={item.href}
                  icon={item.icon}
                  isActive={isActive}
                  testId={`link-nav-${item.key}`}
                  onNavigate={(href) => navigate(href)}
                >
                  <Link
                    href="/reports"
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
                  >
                    <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                    <span>{isAr ? "مكتبة التقارير (الكل)" : "All Reports"}</span>
                  </Link>
                  <div className="my-1 border-t border-border/60" />
                  <div className="max-h-80 overflow-y-auto space-y-0.5">
                    {REPORT_MENU_ITEMS.map((rep) => (
                      <Link
                        key={rep.id}
                        href={`/reports?report=${rep.id}`}
                        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs hover:bg-muted/70 transition-colors"
                      >
                        <rep.icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{t(`payments:reports_lib.reports.${rep.id}.title`)}</span>
                      </Link>
                    ))}
                  </div>
                </NavDropdownItem>
              );
            }

            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-2.5 py-3 transition-all duration-300 cursor-pointer relative group",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground/60 hover:text-foreground"
                  )}
                  data-testid={`link-nav-${item.key}`}
                  title={item.label}
                >
                  <item.icon className={cn(
                    "h-4 w-4 transition-transform duration-300 group-hover:scale-110",
                    isActive ? "text-primary" : "text-muted-foreground/40 group-hover:text-foreground/70"
                  )} />
                  <span className="hidden md:inline text-[11px] font-black uppercase tracking-[0.2em]">
                    {item.label}
                  </span>

                  {/* Premium Active Indicator */}
                  {isActive && (
                    <div className="absolute bottom-0 start-0 w-full h-[3px] bg-primary rounded-t-full shadow-[0_-2px_8px_rgba(var(--primary),0.4)] animate-in slide-in-from-bottom-1 duration-300" />
                  )}

                  {/* Hover Indicator */}
                  {!isActive && (
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[2px] bg-primary/30 rounded-t-full group-hover:w-full transition-all duration-300" />
                  )}
                </div>
              </Link>
            );
          })}
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
                    <Settings className="me-2 h-4 w-4" />
                    {t("nav:settings")}
                  </span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive cursor-pointer" data-testid="button-logout">
                <LogOut className="me-2 h-4 w-4" />
                {t("nav:logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
