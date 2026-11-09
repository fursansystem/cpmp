import { Home, Wallet, Landmark, FolderKanban, CheckSquare, Users, DollarSign, Building2, LogsIcon, Settings, ShieldCheck, Library, ChevronDown } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const menuItems = [
  {
    key: "home",
    url: "/",
    icon: Home,
  },
  {
    key: "projects",
    url: "/projects",
    icon: FolderKanban,
  },
  {
    key: "payments",
    url: "/payments",
    icon: Wallet,
  },
  {
    key: "permits",
    url: "/permits",
    icon: Landmark,
  },
  {
    key: "activity",
    url: "/tasks",
    icon: CheckSquare,
  },
  {
    key: "organizations",
    url: "/organizations",
    icon: Building2,
  },
  {
    key: "members",
    url: "/team",
    icon: Users,
  },
  {
    key: "budget",
    url: "/budget",
    icon: DollarSign,
  },
  {
    key: "audit_log",
    url: "/audit-log",
    icon: LogsIcon,
  },
];

// On the collapsed rail a menu button is a centered square holding only its icon
const RAIL_BUTTON = "group-data-[collapsible=icon]:!size-11 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center";
const RAIL_HIDDEN = "group-data-[collapsible=icon]:hidden";

export function AppSidebar() {
  const { t } = useTranslation("nav");
  const [location] = useLocation();
  const { state, isMobile, setOpen } = useSidebar();
  const [settingsOpen, setSettingsOpen] = useState(true);
  const isRail = state === "collapsed" && !isMobile;
  const { user } = useAuth();
  const isViewOnlyUser = user?.role === "user";
  const isSuperAdmin = user?.role === "super_admin";
  const canManageWebhooks = ["super_admin", "developer_admin", "org_admin"].includes(user?.role ?? "");

  const filteredMenuItems = menuItems.filter(item => {
    if (item.key === "budget" && user?.organizationSectorType === "Consultant") {
      return false;
    }
    if (["activity", "budget", "audit_log"].includes(item.key)) {
      return isSuperAdmin;
    }
    return true;
  });

  return (
    <Sidebar collapsible="icon" className="bg-white dark:bg-sidebar border-e border-slate-200 dark:border-white/5">
      <SidebarHeader className="p-8 pb-6 border-none group-data-[collapsible=icon]:p-3">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <img src="/favicon.png" alt="Fursan Logo" className="w-16 h-16 group-data-[collapsible=icon]:w-12 group-data-[collapsible=icon]:h-12" />
          <div className={RAIL_HIDDEN}>
            <h1 className="font-display font-bold text-lg text-slate-900 dark:text-white tracking-tight">ProjectManager</h1>
            <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t("pro_contracting")}</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="group-data-[collapsible=icon]:!overflow-y-auto">
        <SidebarGroup>
          <SidebarGroupLabel className={cn("text-slate-400 font-bold text-[10px] uppercase tracking-[0.15em] mb-2", RAIL_HIDDEN)}>{t("navigation_system")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMenuItems.map((item) => {
                const label = t(item.key as any);
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild tooltip={label} isActive={location === item.url} className={cn("text-slate-600 dark:text-slate-400 hover:text-primary hover:bg-primary/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary font-black rounded-xl transition-all h-11 group", RAIL_BUTTON)}>
                      <Link href={item.url} data-testid={`link-${item.key}`}>
                        <item.icon className="w-4 h-4 transition-transform group-hover:scale-110" />
                        <span className={cn("text-xs uppercase tracking-[0.15em]", RAIL_HIDDEN)}>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        {!isViewOnlyUser && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible
                  open={settingsOpen}
                  // The rail has no room for the sub-links, so Settings opens the full sidebar there
                  onOpenChange={(next) => {
                    if (isRail) {
                      setOpen(true);
                      setSettingsOpen(true);
                    } else {
                      setSettingsOpen(next);
                    }
                  }}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip={t("settings")}
                        isActive={location.startsWith("/settings") || location === "/admin" || location === "/list-library"}
                        className={cn("text-slate-600 dark:text-slate-400 hover:text-primary hover:bg-primary/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary font-black rounded-xl transition-all h-11 group", RAIL_BUTTON)}
                      >
                        <Settings className="w-4 h-4 transition-transform group-hover:rotate-45" />
                        <span className={cn("text-xs uppercase tracking-[0.15em]", RAIL_HIDDEN)}>{t("settings")}</span>
                        <ChevronDown className={cn("ms-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180", RAIL_HIDDEN)} />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className="border-none px-0 mx-4 gap-0.5">
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={location === "/settings"} className="text-slate-500 hover:text-primary hover:bg-primary/5 data-[active=true]:text-primary data-[active=true]:bg-primary/5 font-bold rounded-lg transition-all h-10 group/sub">
                            <Link href="/settings" data-testid="link-settings" className="flex items-center gap-2">
                              <div className="w-1 h-1 rounded-full bg-current opacity-40 group-hover/sub:opacity-100 transition-opacity" />
                              <span className="text-[11px] uppercase tracking-widest">{t("general")}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={location === "/settings/about"} className="text-slate-500 hover:text-primary hover:bg-primary/5 data-[active=true]:text-primary data-[active=true]:bg-primary/5 font-bold rounded-lg transition-all h-10 group/sub">
                            <Link href="/settings/about" data-testid="link-settings-about" className="flex items-center gap-2">
                              <div className="w-1 h-1 rounded-full bg-current opacity-40 group-hover/sub:opacity-100 transition-opacity" />
                              <span className="text-[11px] uppercase tracking-widest">{t("system_overview")}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        {canManageWebhooks && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={location === "/settings/webhooks"} className="text-slate-500 hover:text-primary hover:bg-primary/5 data-[active=true]:text-primary data-[active=true]:bg-primary/5 font-bold rounded-lg transition-all h-10 group/sub">
                              <Link href="/settings/webhooks" data-testid="link-settings-webhooks" className="flex items-center gap-2">
                                <div className="w-1 h-1 rounded-full bg-current opacity-40 group-hover/sub:opacity-100 transition-opacity" />
                                <span className="text-[11px] uppercase tracking-widest">{t("webhooks_erp")}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={location === "/admin"} className="text-slate-500 hover:text-primary hover:bg-primary/5 data-[active=true]:text-primary data-[active=true]:bg-primary/5 font-bold rounded-lg transition-all h-10 group/sub">
                            <Link href="/admin" data-testid="link-admin" className="flex items-center gap-2">
                              <div className="w-1 h-1 rounded-full bg-current opacity-40 group-hover/sub:opacity-100 transition-opacity" />
                              <span className="text-[11px] uppercase tracking-widest">{t("admin")}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <Collapsible defaultOpen className="group/list-library">
                            <CollapsibleTrigger asChild>
                              <SidebarMenuSubButton 
                                isActive={location === "/list-library" || location === "/work-list" || location === "/checklist" || location === "/activity-checklist-link"}
                                className="text-slate-500 hover:text-primary hover:bg-primary/5 data-[active=true]:text-primary data-[active=true]:bg-primary/5 font-bold rounded-lg transition-all h-10 group/sub"
                              >
                                <div className="w-1 h-1 rounded-full bg-current opacity-40 group-hover/sub:opacity-100 transition-opacity" />
                                <span className="text-[11px] uppercase tracking-widest">{t("list_library")}</span>
                                <ChevronDown className="ms-auto h-3 w-3 transition-transform group-data-[state=open]/list-library:rotate-180" />
                              </SidebarMenuSubButton>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <SidebarMenuSub className="border-none px-0 mx-4 mt-0.5 gap-0.5">
                                <SidebarMenuSubItem>
                                  <SidebarMenuSubButton asChild isActive={location === "/list-library"} className="text-slate-400 hover:text-primary hover:bg-primary/5 data-[active=true]:text-primary data-[active=true]:bg-primary/5 font-bold rounded-lg transition-all h-9 group/nested">
                                    <Link href="/list-library" data-testid="link-positions" className="flex items-center gap-2">
                                      <div className="w-0.5 h-3 bg-current opacity-20 group-hover/nested:opacity-60 transition-opacity" />
                                      <span className="text-[10px] uppercase tracking-widest">{t("positions")}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                  <SidebarMenuSubButton asChild isActive={location === "/work-list"} className="text-slate-400 hover:text-primary hover:bg-primary/5 data-[active=true]:text-primary data-[active=true]:bg-primary/5 font-bold rounded-lg transition-all h-9 group/nested">
                                    <Link href="/work-list" data-testid="link-work-list" className="flex items-center gap-2">
                                      <div className="w-0.5 h-3 bg-current opacity-20 group-hover/nested:opacity-60 transition-opacity" />
                                      <span className="text-[10px] uppercase tracking-widest">{t("work_list")}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                  <SidebarMenuSubButton asChild isActive={location === "/checklist"} className="text-slate-400 hover:text-primary hover:bg-primary/5 data-[active=true]:text-primary data-[active=true]:bg-primary/5 font-bold rounded-lg transition-all h-9 group/nested">
                                    <Link href="/checklist" data-testid="link-checklist" className="flex items-center gap-2">
                                      <div className="w-0.5 h-3 bg-current opacity-20 group-hover/nested:opacity-60 transition-opacity" />
                                      <span className="text-[10px] uppercase tracking-widest">{t("checklist")}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                  <SidebarMenuSubButton asChild isActive={location === "/activity-checklist-link"} className="text-slate-400 hover:text-primary hover:bg-primary/5 data-[active=true]:text-primary data-[active=true]:bg-primary/5 font-bold rounded-lg transition-all h-9 group/nested">
                                    <Link href="/activity-checklist-link" data-testid="link-activity-checklist" className="flex items-center gap-2">
                                      <div className="w-0.5 h-3 bg-current opacity-20 group-hover/nested:opacity-60 transition-opacity" />
                                      <span className="text-[10px] uppercase tracking-widest">{t("activity_checklist")}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              </SidebarMenuSub>
                            </CollapsibleContent>
                          </Collapsible>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
