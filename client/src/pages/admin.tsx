import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Shield, UserCog, Pencil, Trash2, Users, Link2, Check, ChevronsUpDown, X, AlertCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema, updateUserSchema, type User, type InsertUser, type UpdateUser, type TeamMember, type Organization } from "@shared/schema";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

type SafeUser = Omit<User, "password">;

const createUserFormSchema = insertUserSchema.extend({
  confirmPassword: z.string().min(6, "Confirm password is required"),
  teamMemberIds: z.array(z.string()).min(1, "At least one team member link is required"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type CreateUserFormData = z.infer<typeof createUserFormSchema>;

const ROLE_LABELS: Record<string, string> = {
  user: "User",
  developer_admin: "Developer Admin",
  org_admin: "Organization Admin",
  super_admin: "Super Admin",
};

function CreateUserDialog({
  trigger,
  open,
  onOpenChange,
  onSubmit,
  teamMembers,
  organizations,
  allowedRoles = ["user", "developer_admin", "org_admin", "super_admin"],
}: {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSubmit: (data: InsertUser) => Promise<any>;
  teamMembers: TeamMember[];
  organizations: Organization[];
  allowedRoles?: string[];
}) {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const [isOpen, setIsOpen] = useState(false);
  const dialogOpen = open ?? isOpen;
  const setDialogOpen = onOpenChange ?? setIsOpen;

  const form = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      fullName: "",
      fullNameArabic: "",
      role: "user",
      isAdmin: false,
      isActive: true,
      teamMemberIds: [],
    },
  });

  const groupedTeamMembers = useMemo(() => {
    const groups: Record<string, TeamMember[]> = {};
    const sortedMembers = [...teamMembers].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    sortedMembers.forEach((member) => {
      const org = organizations.find((o) => o.id === member.organizationId);
      const orgName = org?.name || "No Organization";
      if (!groups[orgName]) {
        groups[orgName] = [];
      }
      groups[orgName].push(member);
    });
    return groups;
  }, [teamMembers, organizations]);

  const handleSubmit = async (data: CreateUserFormData) => {
    const { confirmPassword, teamMemberIds, ...userData } = data;
    const user = await onSubmit(userData);
    
    // Save team member links
    if (user && (user as any).id) {
      if (!teamMemberIds || teamMemberIds.length === 0) {
        toast({
          title: "Error",
          description: "At least one team member link is required",
          variant: "destructive",
        });
        return;
      }
      await apiRequest("PUT", `/api/users/${(user as any).id}/team-members`, {
        teamMemberIds,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user-team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    }

    setDialogOpen(false);
    form.reset();
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Add New User</DialogTitle>
          <DialogDescription>Create a new user account</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter username"
                        data-testid="input-username"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="user@example.com"
                        data-testid="input-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="John Doe"
                        data-testid="input-fullname"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fullNameArabic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name (Arabic)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        dir="rtl"
                        placeholder="الاسم الكامل"
                        data-testid="input-fullname-arabic"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="••••••••"
                        data-testid="input-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="••••••••"
                        data-testid="input-confirm-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {(currentUser?.role === "super_admin") ? (
              <>
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-role">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allowedRoles.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABELS[role] || role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isSuperAdmin && (
                  <div className="flex items-center justify-start pt-2">
                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-3">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-active"
                            />
                          </FormControl>
                          <FormLabel className="!mt-0">Active</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </>
            ) : (
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem className="hidden">
                    <FormControl>
                      <Input {...field} type="hidden" />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="teamMemberIds"
              render={({ field }) => {
                const selectedMembers = teamMembers.filter(m => (field.value || []).includes(m.id));
                return (
                  <FormItem className="flex flex-col gap-2">
                    <FormLabel>Team Member Links *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between min-h-9 h-auto"
                            data-testid="button-team-member-select"
                          >
                            <div className="flex flex-wrap gap-1 flex-1">
                              {selectedMembers.length > 0 ? (
                                selectedMembers.map(member => (
                                  <Badge
                                    key={member.id}
                                    variant="secondary"
                                    className="text-xs gap-1"
                                  >
                                    {member.name}
                                    <X
                                      className="h-3 w-3 cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        field.onChange((field.value || []).filter(id => id !== member.id));
                                      }}
                                    />
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-muted-foreground">Select team members...</span>
                              )}
                            </div>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search team members..." />
                          <CommandList>
                            <CommandEmpty>No team member found.</CommandEmpty>
                            {Object.entries(groupedTeamMembers).map(([orgName, members]) => (
                              <CommandGroup key={orgName} heading={orgName}>
                                {members.map((member) => {
                                  const isSelected = (field.value || []).includes(member.id);
                                  return (
                                    <CommandItem
                                      key={member.id}
                                      value={`${member.name} ${orgName}`}
                                      onSelect={() => {
                                        const current = field.value || [];
                                        const next = isSelected
                                          ? current.filter((id) => id !== member.id)
                                          : [...current, member.id];
                                        field.onChange(next);
                                      }}
                                    >
                                      <Check
                                        className={`mr-2 h-4 w-4 ${isSelected ? "opacity-100" : "opacity-0"}`}
                                      />
                                      <div className="flex-1 flex items-center gap-2">
                                        <span>{member.name}</span>
                                        {member.position && (
                                          <Badge variant="outline" className="text-[10px] h-4 px-1">
                                            {member.position}
                                          </Badge>
                                        )}
                                      </div>
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" data-testid="button-submit-user">
                Add User
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  open,
  onOpenChange,
  onSubmit,
  allowedRoles = ["user", "developer_admin", "org_admin", "super_admin"],
}: {
  user: SafeUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: UpdateUser) => Promise<void>;
  allowedRoles?: string[];
}) {
  const { user: currentUser } = useAuth();
  const form = useForm<UpdateUser>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      fullNameArabic: user.fullNameArabic || "",
      role: user.role as "user" | "super_admin" | "org_admin" | "developer_admin",
      isAdmin: user.isAdmin,
      isActive: user.isActive,
    },
  });

  useEffect(() => {
    form.reset({
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      fullNameArabic: user.fullNameArabic || "",
      role: user.role as "user" | "super_admin" | "org_admin" | "developer_admin",
      isAdmin: user.isAdmin,
      isActive: user.isActive,
    });
  }, [user, form]);

  const handleSubmit = async (data: UpdateUser) => {
    await onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Edit User</DialogTitle>
          <DialogDescription>Update user details and permissions</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter username"
                        data-testid="input-username"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="user@example.com"
                        data-testid="input-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="John Doe"
                        data-testid="input-fullname"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fullNameArabic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name (Arabic)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ""}
                        dir="rtl"
                        placeholder="الاسم الكامل"
                        data-testid="input-fullname-arabic"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role *</FormLabel>
                  {currentUser?.role === "super_admin" ? (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-role">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {allowedRoles.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABELS[role] || role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-muted/50 text-sm">
                      {field.value ? (ROLE_LABELS[field.value] || field.value) : ""}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center pt-2">
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-active"
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Active</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" data-testid="button-submit-user">
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface UserTeamMember {
  id: string;
  userId: string;
  teamMemberId: string;
}

function ManageTeamMembersDialog({
  user,
  open,
  onOpenChange,
  teamMembers,
  organizations,
}: {
  user: SafeUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamMembers: TeamMember[];
  organizations: Organization[];
}) {
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const { data: userTeamMembers = [], isLoading } = useQuery<UserTeamMember[]>({
    queryKey: ["/api/users", user.id, "team-members"],
    enabled: open,
  });

  useEffect(() => {
    if (userTeamMembers.length > 0) {
      setSelectedTeamMembers(new Set(userTeamMembers.map(utm => utm.teamMemberId)));
    } else {
      setSelectedTeamMembers(new Set());
    }
  }, [userTeamMembers]);

  const getOrganizationName = (orgId: string | null) => {
    if (!orgId) return "No Organization";
    const org = organizations.find(o => o.id === orgId);
    return org?.name || "Unknown";
  };

  const handleToggleTeamMember = (teamMemberId: string) => {
    setSelectedTeamMembers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(teamMemberId)) {
        newSet.delete(teamMemberId);
      } else {
        newSet.add(teamMemberId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    if (selectedTeamMembers.size === 0) {
      toast({
        title: "Error",
        description: "At least one team member link is required",
        variant: "destructive",
      });
      return;
    }
    setIsSaving(true);
    try {
      await apiRequest("PUT", `/api/users/${user.id}/team-members`, {
        teamMemberIds: Array.from(selectedTeamMembers),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users", user.id, "team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "Team member links updated successfully",
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update team member links",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const groupedTeamMembers = useMemo(() => {
    const groups: Record<string, TeamMember[]> = {};
    const sortedMembers = [...teamMembers].sort((a, b) => a.name.localeCompare(b.name));
    sortedMembers.forEach(member => {
      const orgName = getOrganizationName(member.organizationId);
      if (!groups[orgName]) {
        groups[orgName] = [];
      }
      groups[orgName].push(member);
    });
    return groups;
  }, [teamMembers, organizations]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="font-display">Manage Team Member Links</DialogTitle>
          <DialogDescription>
            Select which team members to link to {user.fullName}
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="space-y-2 py-4 px-6">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            <ScrollArea className="flex-1 px-6">
              <div className="space-y-4 py-4">
                {Object.entries(groupedTeamMembers).map(([orgName, members]) => (
                  <div key={orgName} className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground sticky top-0 bg-background/95 backdrop-blur z-10 py-1">{orgName}</h4>
                    <div className="space-y-1">
                      {members.map(member => (
                        <div
                          key={member.id}
                          className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 cursor-pointer"
                          onClick={() => handleToggleTeamMember(member.id)}
                          data-testid={`checkbox-team-member-${member.id}`}
                        >
                          <Checkbox
                            checked={selectedTeamMembers.has(member.id)}
                            onCheckedChange={() => handleToggleTeamMember(member.id)}
                          />
                          <div className="flex-1 overflow-hidden">
                            <p className="text-sm font-medium truncate">{member.name}</p>
                            {member.email && (
                              <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                            )}
                          </div>
                          {member.position && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0">
                              {member.position}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="px-6 py-4 border-t mt-auto">
          <div className="flex items-center justify-between w-full">
            <span className="text-sm text-muted-foreground">
              {selectedTeamMembers.size} member{selectedTeamMembers.size !== 1 ? "s" : ""} selected
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={isSaving || selectedTeamMembers.size === 0}
                data-testid="button-save-team-links"
              >
                {isSaving ? "Saving..." : "Save Links"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface UserPermissions {
  canCreateUsers: boolean;
  canCreateProjects: boolean;
  canCreateMembers: boolean;
  canCreateOrganizations: boolean;
  allowedRoles: string[];
}

export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SafeUser | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<SafeUser | null>(null);
  const [teamLinksDialogOpen, setTeamLinksDialogOpen] = useState(false);
  const [teamLinksUser, setTeamLinksUser] = useState<SafeUser | null>(null);

  const { data: users = [], isLoading, error: usersError } = useQuery<SafeUser[]>({
    queryKey: ["/api/users"],
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
  });

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const { data: permissions } = useQuery<UserPermissions>({
    queryKey: ["/api/auth/permissions"],
  });

  // Check if current user is super admin
  const isSuperAdmin = currentUser?.role === "super_admin";

  // Check if user can view team member associations
  const canViewTeamLinks = currentUser?.role === "super_admin" || currentUser?.role === "developer_admin" || currentUser?.role === "org_admin";

  // Check if user can manage links for a specific target user
  const canManageTeamLinks = (targetUser: SafeUser): boolean => {
    if (currentUser?.role === "super_admin" || currentUser?.role === "developer_admin") return true;
    if (currentUser?.role === "org_admin") {
      // Org admin can manage links for users visible in their list
      // Since the users list is already filtered for org_admin, they can manage any user they can see
      return true;
    }
    return false;
  };

  // Fetch all user-team-member associations (only for authorized users)
  const { data: allUserTeamMembers = [] } = useQuery<UserTeamMember[]>({
    queryKey: ["/api/user-team-members"],
    enabled: canViewTeamLinks,
  });

  // Create a map of userId to their linked team member names
  const userTeamMemberMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    allUserTeamMembers.forEach(utm => {
      if (!map[utm.userId]) {
        map[utm.userId] = [];
      }
      const member = teamMembers.find(m => m.id === utm.teamMemberId);
      if (member) {
        map[utm.userId].push(member.name);
      }
    });
    return map;
  }, [allUserTeamMembers, teamMembers]);

  // Check if can edit user (simplified - backend handles org filtering for developer/org admins)
  const canEditUser = (user: SafeUser): boolean => {
    if (currentUser?.role === "super_admin" || currentUser?.role === "developer_admin") return true;
    if (currentUser?.role === "org_admin") return true;
    return false;
  };

  const createMutation = useMutation({
    mutationFn: async (data: InsertUser) => {
      const response = await apiRequest("POST", "/api/users", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({
        title: "Success",
        description: "User created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateUser }) => {
      return await apiRequest("PATCH", `/api/users/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/permissions"] });
      toast({
        title: "Success",
        description: "User updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-team-members"] });
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      // Rule: Only super_admin can see/manage other super_admins
      if (user.role === "super_admin" && currentUser?.role !== "super_admin") {
        return false;
      }

      const matchesSearch =
        user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.fullName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter, currentUser]);

  const handleCreateUser = async (data: InsertUser) => {
    const result = await createMutation.mutateAsync(data);
    return result;
  };

  const handleEditUser = (user: SafeUser) => {
    setEditingUser(user);
    setEditDialogOpen(true);
  };

  const handleUpdateUser = async (data: UpdateUser) => {
    if (editingUser) {
      await updateMutation.mutateAsync({ id: editingUser.id, data });
      setEditingUser(null);
    }
  };

  const handleDeleteClick = (user: SafeUser) => {
    setUserToDelete(user);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (userToDelete) {
      await deleteMutation.mutateAsync(userToDelete.id);
      setUserToDelete(null);
      setDeleteConfirmOpen(false);
    }
  };

  const handleToggleAdmin = async (user: SafeUser) => {
    await updateMutation.mutateAsync({
      id: user.id,
      data: { isAdmin: !user.isAdmin },
    });
  };

  const handleToggleActive = async (user: SafeUser) => {
    await updateMutation.mutateAsync({
      id: user.id,
      data: { isActive: !user.isActive },
    });
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "super_admin":
        return (
          <Badge variant="default" className="gap-1">
            <Shield className="w-3 h-3" />
            Super Admin
          </Badge>
        );
      case "org_admin":
        return (
          <Badge variant="secondary" className="gap-1">
            <UserCog className="w-3 h-3" />
            Organization Admin
          </Badge>
        );
      case "developer_admin":
        return (
          <Badge variant="secondary" className="gap-1">
            <UserCog className="w-3 h-3" />
            Developer Admin
          </Badge>
        );
      default:
        return <Badge variant="outline">User</Badge>;
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold font-display">User Management</h1>
            <p className="text-muted-foreground">Manage user accounts and permissions</p>
          </div>
        </div>
        {permissions?.canCreateUsers && (
          <CreateUserDialog
            trigger={
              <Button data-testid="button-add-user">
                <Plus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            }
            onSubmit={handleCreateUser}
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            teamMembers={teamMembers}
            organizations={organizations}
            allowedRoles={permissions?.allowedRoles || []}
          />
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-users"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-role-filter">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="developer_admin">Developer Admin</SelectItem>
                <SelectItem value="org_admin">Organization Admin</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {usersError ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive opacity-75" />
              <p className="text-lg font-medium text-destructive">Unable to load users</p>
              <p className="text-sm mt-2">
                Your user account may not be linked to a team member.
              </p>
              <p className="text-sm mt-1">
                Please contact a super admin to link your account to a team member in your organization.
              </p>
            </div>
          ) : isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No users found</p>
              <p className="text-sm">
                {users.length === 0
                  ? "Add your first user to get started"
                  : "Try adjusting your search or filters"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Team Links</TableHead>
                  <TableHead className="text-center">Admin</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={user.avatar || undefined} />
                          <AvatarFallback>
                            {user.fullName
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{user.fullName}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{user.username}</TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell>
                      {canViewTeamLinks ? (
                        userTeamMemberMap[user.id]?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {userTeamMemberMap[user.id].slice(0, 2).map((name, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {name}
                              </Badge>
                            ))}
                            {userTeamMemberMap[user.id].length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{userTeamMemberMap[user.id].length - 2}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">No links</span>
                        )
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {isSuperAdmin ? (
                        <Switch
                          checked={user.isAdmin}
                          onCheckedChange={() => handleToggleAdmin(user)}
                          data-testid={`switch-admin-${user.id}`}
                        />
                      ) : (
                        <Badge variant={user.isAdmin ? "default" : "outline"}>
                          {user.isAdmin ? "Yes" : "No"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {isSuperAdmin ? (
                        <Switch
                          checked={user.isActive}
                          onCheckedChange={() => handleToggleActive(user)}
                          data-testid={`switch-active-${user.id}`}
                        />
                      ) : (
                        <Badge variant={user.isActive ? "default" : "secondary"}>
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canManageTeamLinks(user) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setTeamLinksUser(user);
                              setTeamLinksDialogOpen(true);
                            }}
                            data-testid={`button-team-links-${user.id}`}
                            title="Manage Team Links"
                          >
                            <Link2 className="w-4 h-4" />
                          </Button>
                        )}
                        {canEditUser(user) && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEditUser(user)}
                              data-testid={`button-edit-${user.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            {isSuperAdmin && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteClick(user)}
                                data-testid={`button-delete-${user.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editingUser && (
        <EditUserDialog
          user={editingUser}
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setEditingUser(null);
          }}
          onSubmit={handleUpdateUser}
          allowedRoles={permissions?.allowedRoles || ["user", "developer_admin", "org_admin", "super_admin"]}
        />
      )}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle dir="rtl">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete user "{userToDelete?.fullName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {teamLinksUser && (
        <ManageTeamMembersDialog
          user={teamLinksUser}
          open={teamLinksDialogOpen}
          onOpenChange={(open) => {
            setTeamLinksDialogOpen(open);
            if (!open) setTeamLinksUser(null);
          }}
          teamMembers={teamMembers}
          organizations={organizations}
        />
      )}
    </div>
  );
}
