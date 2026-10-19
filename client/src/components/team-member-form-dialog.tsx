import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { insertTeamMemberSchema, insertPositionSchema, type InsertTeamMember, type TeamMember, type Organization, type Position, type InsertPosition } from "@shared/schema";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";

const teamMemberFormSchema = insertTeamMemberSchema.extend({
  organizationId: z.string().min(1, "Organization is required"),
});
import { Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";

interface TeamMemberFormDialogProps {
  member?: TeamMember;
  trigger: React.ReactNode;
  onSubmit: (data: InsertTeamMember) => Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function TeamMemberFormDialog({ member, trigger, onSubmit, open: controlledOpen, onOpenChange }: TeamMemberFormDialogProps) {
  const { user: currentUser } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const [showAddPositionDialog, setShowAddPositionDialog] = useState(false);
  const [newPositionData, setNewPositionData] = useState({ numericId: "", titleEnglish: "", titleArabic: "" });
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (onOpenChange || (() => {})) : setInternalOpen;

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
  });

  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ["/api/positions"],
  });

  const createPositionMutation = useMutation<Position, unknown, InsertPosition>({
    mutationFn: async (data: InsertPosition) => {
      return await apiRequest("POST", "/api/positions", data) as unknown as Position;
    },
    onSuccess: (newPosition: Position) => {
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      // Auto-select the new position
      setValue("position", newPosition.titleEnglish);
      setShowAddPositionDialog(false);
      setNewPositionData({ numericId: "", titleEnglish: "", titleArabic: "" });
    },
  });

  // Get current user's organization if they're developer_admin
  const userOrganizationId = useMemo(() => {
    if (currentUser?.role === "developer_admin" && currentUser.organizationId) {
      return currentUser.organizationId;
    }
    return null;
  }, [currentUser?.role, currentUser?.organizationId]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    control,
    setValue,
    watch,
  } = useForm<InsertTeamMember>({
    resolver: zodResolver(teamMemberFormSchema),
    defaultValues: {
      name: member?.name || "",
      nameArabic: member?.nameArabic || "",
      email: member?.email || "",
      position: member?.position || "",
      organizationId: member?.organizationId || currentUser?.role === "developer_admin" ? userOrganizationId || "" : "",
    },
  });

  const currentName = watch("name");

  useEffect(() => {
    if (open) {
      reset(member ? {
        name: member.name,
        nameArabic: member.nameArabic || "",
        email: member.email,
        position: member.position || "",
        organizationId: member.organizationId || "",
      } : {
        name: "",
        nameArabic: "",
        email: "",
        position: "",
        organizationId: currentUser?.role === "developer_admin" ? userOrganizationId || "" : "",
      });
      if (currentUser?.role === "developer_admin" && userOrganizationId && !member) {
        setValue("organizationId", userOrganizationId);
      }
    }
  }, [open, member, reset, currentUser?.role, userOrganizationId, setValue]);

  const onSubmitForm = async (data: InsertTeamMember) => {
    await onSubmit(data);
    reset();
    setOpen(false);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{member ? "Edit Member" : "Add Member"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-4">
          <div className="flex justify-center mb-4">
            <Avatar className="w-24 h-24">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                {currentName?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?"}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                {...register("name")}
                placeholder="John Smith"
                data-testid="input-name"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="nameArabic">Name (Arabic)</Label>
              <Input
                id="nameArabic"
                {...register("nameArabic")}
                placeholder="الاسم بالعربية"
                dir="rtl"
                data-testid="input-name-arabic"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                {...register("email")}
                placeholder="john@company.com"
                data-testid="input-email"
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="position">Position</Label>
              <Controller
                name="position"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || ""} onValueChange={(value) => {
                    if (value === "ADD_NEW") {
                      setShowAddPositionDialog(true);
                    } else {
                      field.onChange(value);
                    }
                  }}>
                    <SelectTrigger data-testid="select-position">
                      <SelectValue placeholder="Select position" />
                    </SelectTrigger>
                    <SelectContent>
                      {positions.map((pos) => (
                        <SelectItem key={pos.id} value={pos.titleEnglish}>
                          {pos.titleEnglish} ({pos.titleArabic})
                        </SelectItem>
                      ))}
                      <div className="border-t my-1" />
                      <SelectItem value="ADD_NEW" className="font-semibold text-primary">
                        <Plus className="w-4 h-4 inline mr-2" />
                        Add new option…
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {currentUser?.role === "developer_admin" ? (
              <div className="col-span-2 space-y-2">
                <Label htmlFor="organization">Organization</Label>
                <div className="flex items-center h-9 px-3 border rounded-md bg-muted text-muted-foreground">
                  {organizations.find(o => o.id === userOrganizationId)?.name || "Your Organization"}
                </div>
              </div>
            ) : (
              <div className="col-span-2 space-y-2">
                <Label htmlFor="organization">Organization *</Label>
                <Controller
                  name="organizationId"
                  control={control}
                  rules={{ required: "Organization is required" }}
                  render={({ field }) => (
                    <Select
                      value={field.value || ""}
                      onValueChange={(value) => field.onChange(value)}
                    >
                      <SelectTrigger data-testid="select-organization">
                        <SelectValue placeholder="Select organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {organizations.map((org) => (
                          <SelectItem key={org.id} value={org.id}>
                            {org.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.organizationId && (
                  <p className="text-sm text-destructive">{errors.organizationId.message}</p>
                )}
              </div>
            )}

          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} data-testid="button-submit">
              {isSubmitting ? "Saving..." : member ? "Update Member" : "Add Member"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={showAddPositionDialog} onOpenChange={setShowAddPositionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Create New Position
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-position-id">Position ID *</Label>
              <Input
                id="new-position-id"
                type="number"
                placeholder="e.g., 100"
                value={newPositionData.numericId}
                onChange={(e) => setNewPositionData({ ...newPositionData, numericId: e.target.value })}
                data-testid="input-new-position-id"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="new-position-en">Title (English) *</Label>
              <Input
                id="new-position-en"
                placeholder="e.g., Senior Engineer"
                value={newPositionData.titleEnglish}
                onChange={(e) => setNewPositionData({ ...newPositionData, titleEnglish: e.target.value })}
                data-testid="input-new-position-en"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="new-position-ar">Title (Arabic) *</Label>
              <Input
                id="new-position-ar"
                placeholder="e.g., مهندس أول"
                dir="rtl"
                value={newPositionData.titleArabic}
                onChange={(e) => setNewPositionData({ ...newPositionData, titleArabic: e.target.value })}
                data-testid="input-new-position-ar"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAddPositionDialog(false);
                  setNewPositionData({ numericId: "", titleEnglish: "", titleArabic: "" });
                }}
                data-testid="button-cancel-position"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={createPositionMutation.isPending || !newPositionData.numericId || !newPositionData.titleEnglish || !newPositionData.titleArabic}
                onClick={() => {
                  createPositionMutation.mutate({
                    numericId: parseInt(newPositionData.numericId),
                    titleEnglish: newPositionData.titleEnglish,
                    titleArabic: newPositionData.titleArabic,
                  });
                }}
                data-testid="button-create-position"
                className="flex-1"
              >
                {createPositionMutation.isPending ? "Creating..." : "Create & Select"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
