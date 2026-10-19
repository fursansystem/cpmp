import { Home, FolderKanban, CheckSquare, Users, DollarSign, Building2, LogsIcon, Settings, ShieldCheck, Library, ChevronDown } from "lucide-react";
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
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const menuItems = [
  {
    title: "Home",
    url: "/",
    icon: Home,
  },
  {
    title: "Projects",
    url: "/projects",
    icon: FolderKanban,
  },
  {
    title: "Activity",
    url: "/tasks",
    icon: CheckSquare,
  },
  {
    title: "Organizations",
    url: "/organizations",
    icon: Building2,
  },
  {
    title: "Members",
    url: "/team",
    icon: Users,
  },
    {
    title: "Budget",
    url: "/budget",
    icon: DollarSign,
  },
  {
    title: "Audit Log",
    url: "/audit-log",
    icon: LogsIcon,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const isViewOnlyUser = user?.role === "user";
  const isSuperAdmin = user?.role === "super_admin";

  const filteredMenuItems = menuItems.filter(item => {
    if (item.title === "Budget" && user?.organizationSectorType === "Consultant") {
      return false;
    }
    if (["Activity", "Budget", "Audit Log"].includes(item.title)) {
      return isSuperAdmin;
    }
    return true;
  });

  return (
    <Sidebar className="bg-white dark:bg-sidebar border-r border-slate-200 dark:border-white/5">
      <SidebarHeader className="p-8 pb-6 border-none">
        <div className="flex items-center gap-2">
          <img src="/favicon.png" alt="Fursan Logo" className="w-16 h-16 " />
          <div>
            <h1 className="font-display font-bold text-lg text-slate-900 dark:text-white tracking-tight">ProjectManager</h1>
            <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Pro Contracting</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.15em] mb-2">Navigation System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url} className="text-slate-600 dark:text-slate-400 hover:text-primary hover:bg-primary/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary font-black rounded-xl transition-all h-11 group">
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase()}`}>
                      <item.icon className="w-4 h-4 transition-transform group-hover:scale-110" />
                      <span className="text-xs uppercase tracking-[0.15em]">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        {!isViewOnlyUser && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible defaultOpen className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton 
                        isActive={location.startsWith("/settings") || location === "/admin" || location === "/list-library"}
                        className="text-slate-600 dark:text-slate-400 hover:text-primary hover:bg-primary/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary font-black rounded-xl transition-all h-11 group"
                      >
                        <Settings className="w-4 h-4 transition-transform group-hover:rotate-45" />
                        <span className="text-xs uppercase tracking-[0.15em]">Settings</span>
                        <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className="border-none px-0 mx-4 gap-0.5">
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={location === "/settings"} className="text-slate-500 hover:text-primary hover:bg-primary/5 data-[active=true]:text-primary data-[active=true]:bg-primary/5 font-bold rounded-lg transition-all h-10 group/sub">
                            <Link href="/settings" data-testid="link-settings" className="flex items-center gap-2">
                              <div className="w-1 h-1 rounded-full bg-current opacity-40 group-hover/sub:opacity-100 transition-opacity" />
                              <span className="text-[11px] uppercase tracking-widest">General</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={location === "/settings/about"} className="text-slate-500 hover:text-primary hover:bg-primary/5 data-[active=true]:text-primary data-[active=true]:bg-primary/5 font-bold rounded-lg transition-all h-10 group/sub">
                            <Link href="/settings/about" data-testid="link-settings-about" className="flex items-center gap-2">
                              <div className="w-1 h-1 rounded-full bg-current opacity-40 group-hover/sub:opacity-100 transition-opacity" />
                              <span className="text-[11px] uppercase tracking-widest">System Overview</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={location === "/admin"} className="text-slate-500 hover:text-primary hover:bg-primary/5 data-[active=true]:text-primary data-[active=true]:bg-primary/5 font-bold rounded-lg transition-all h-10 group/sub">
                            <Link href="/admin" data-testid="link-admin" className="flex items-center gap-2">
                              <div className="w-1 h-1 rounded-full bg-current opacity-40 group-hover/sub:opacity-100 transition-opacity" />
                              <span className="text-[11px] uppercase tracking-widest">Admin</span>
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
                                <span className="text-[11px] uppercase tracking-widest">List Library</span>
                                <ChevronDown className="ml-auto h-3 w-3 transition-transform group-data-[state=open]/list-library:rotate-180" />
                              </SidebarMenuSubButton>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <SidebarMenuSub className="border-none px-0 mx-4 mt-0.5 gap-0.5">
                                <SidebarMenuSubItem>
                                  <SidebarMenuSubButton asChild isActive={location === "/list-library"} className="text-slate-400 hover:text-primary hover:bg-primary/5 data-[active=true]:text-primary data-[active=true]:bg-primary/5 font-bold rounded-lg transition-all h-9 group/nested">
                                    <Link href="/list-library" data-testid="link-positions" className="flex items-center gap-2">
                                      <div className="w-0.5 h-3 bg-current opacity-20 group-hover/nested:opacity-60 transition-opacity" />
                                      <span className="text-[10px] uppercase tracking-widest">Positions</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                  <SidebarMenuSubButton asChild isActive={location === "/work-list"} className="text-slate-400 hover:text-primary hover:bg-primary/5 data-[active=true]:text-primary data-[active=true]:bg-primary/5 font-bold rounded-lg transition-all h-9 group/nested">
                                    <Link href="/work-list" data-testid="link-work-list" className="flex items-center gap-2">
                                      <div className="w-0.5 h-3 bg-current opacity-20 group-hover/nested:opacity-60 transition-opacity" />
                                      <span className="text-[10px] uppercase tracking-widest">Work List</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                  <SidebarMenuSubButton asChild isActive={location === "/checklist"} className="text-slate-400 hover:text-primary hover:bg-primary/5 data-[active=true]:text-primary data-[active=true]:bg-primary/5 font-bold rounded-lg transition-all h-9 group/nested">
                                    <Link href="/checklist" data-testid="link-checklist" className="flex items-center gap-2">
                                      <div className="w-0.5 h-3 bg-current opacity-20 group-hover/nested:opacity-60 transition-opacity" />
                                      <span className="text-[10px] uppercase tracking-widest">Checklist</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                  <SidebarMenuSubButton asChild isActive={location === "/activity-checklist-link"} className="text-slate-400 hover:text-primary hover:bg-primary/5 data-[active=true]:text-primary data-[active=true]:bg-primary/5 font-bold rounded-lg transition-all h-9 group/nested">
                                    <Link href="/activity-checklist-link" data-testid="link-activity-checklist" className="flex items-center gap-2">
                                      <div className="w-0.5 h-3 bg-current opacity-20 group-hover/nested:opacity-60 transition-opacity" />
                                      <span className="text-[10px] uppercase tracking-widest">Activity-Checklist</span>
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
