import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProjectSchema, type InsertProject, type Project, type Organization } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { z } from "zod";

const projectFormSchema = insertProjectSchema.extend({
  contractValue: z.string().min(1, "Contract value is required"),
  estimatedCost: z.string().min(1, "Estimated cost is required"),
  actualCost: z.string().optional(),
  progress: z.coerce.number().min(0).max(100),
  contractorId: z.string().optional().or(z.literal("")),
  consultantId: z.string().optional().or(z.literal("")),
});

type ProjectFormData = z.infer<typeof projectFormSchema>;

interface ProjectFormDialogProps {
  project?: Project;
  trigger: React.ReactNode;
  onSubmit: (data: InsertProject) => Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ProjectFormDialog({ project, trigger, onSubmit, open: controlledOpen, onOpenChange }: ProjectFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (onOpenChange || (() => {})) : setInternalOpen;
  
  const { user } = useAuth();

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    reset,
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: project ? {
      name: project.name,
      organizationId: project.organizationId,
      contractorId: project.contractorId || "",
      consultantId: project.consultantId || "",
      status: project.status as "pending" | "active" | "completed" | "on-hold" | "overdue",
      location: project.location,
      contractValue: project.contractValue,
      estimatedCost: project.estimatedCost,
      actualCost: project.actualCost || "0",
      startDate: project.startDate,
      endDate: project.endDate,
      progress: project.progress,
      description: project.description || "",
    } : {
      progress: 0,
      actualCost: "0",
      status: "pending" as const,
      organizationId: (user?.role === "org_admin" || user?.role === "developer_admin") ? (user?.organizationId || "") : "",
      contractorId: "",
      consultantId: "",
    },
  });

  // A filled role reads differently from an empty one: the current holder is already on
  // the project, and replacing them frees the seat the moment the invitation goes out.
  const assignedName = (organizationId?: string | null) =>
    organizationId ? organizations.find(org => org.id === organizationId)?.name : undefined;

  const selectedStatus = watch("status");

  useEffect(() => {
    if (project) {
      reset({
        name: project.name,
        organizationId: project.organizationId,
        contractorId: project.contractorId || "",
        consultantId: project.consultantId || "",
        status: project.status as "pending" | "active" | "completed" | "on-hold" | "overdue",
        location: project.location,
        contractValue: project.contractValue,
        estimatedCost: project.estimatedCost,
        actualCost: project.actualCost || "0",
        startDate: project.startDate,
        endDate: project.endDate,
        progress: project.progress,
        description: project.description || "",
      });
    } else {
      reset({
        progress: 0,
        actualCost: "0",
        status: "pending" as const,
        name: "",
        organizationId: (user?.role === "org_admin" || user?.role === "developer_admin") ? (user?.organizationId || "") : "",
        contractorId: "",
        consultantId: "",
        location: "",
        contractValue: "",
        estimatedCost: "",
        startDate: "",
        endDate: "",
        description: "",
      });
    }
  }, [project, reset, user?.role, user?.organizationId]);

  const onSubmitForm = async (data: ProjectFormData) => {
    await onSubmit({
      ...data,
      contractValue: data.contractValue,
      estimatedCost: data.estimatedCost,
      actualCost: data.actualCost || "0",
      contractorId: data.contractorId || undefined,
      consultantId: data.consultantId || undefined,
    });
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? "Edit Project" : "Create New Project"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                {...register("name")}
                placeholder="Downtown Office Renovation"
                data-testid="input-project-name"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="organizationId">Developer *</Label>
              <Select
                value={watch("organizationId")}
                onValueChange={(value) => setValue("organizationId", value)}
                disabled={user?.role === "org_admin" || user?.role === "developer_admin"}
              >
                <SelectTrigger data-testid="select-developer">
                  <SelectValue placeholder="Select developer" />
                </SelectTrigger>
                <SelectContent>
                  {organizations
                    .filter((org) => (user?.role !== "org_admin" && user?.role !== "developer_admin") || org.id === user?.organizationId)
                    .map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>
                      {organization.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.organizationId && (
                <p className="text-sm text-destructive">{errors.organizationId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractorId">
                {project?.contractorId ? "Contractor" : "Contractor (invite)"}
              </Label>
              <Select
                value={watch("contractorId") || "none"}
                onValueChange={(value) => setValue("contractorId", value === "none" ? "" : value)}
              >
                <SelectTrigger data-testid="select-contractor">
                  <SelectValue placeholder="Select contractor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {organizations
                    .filter((org) => org.sectorType === "Contractor")
                    .map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>
                      {organization.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.contractorId && (
                <p className="text-sm text-destructive">{errors.contractorId.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {project?.contractorId ? (
                  <>
                    <span className="font-medium text-foreground">
                      {assignedName(project.contractorId) || "This contractor"}
                    </span>{" "}
                    is assigned. Choosing another organization invites them and removes
                    the current one from the project straight away.
                  </>
                ) : (
                  "Sends an invitation. They join the project once they accept."
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="consultantId">
                {project?.consultantId ? "Consultant" : "Consultant (invite)"}
              </Label>
              <Select
                value={watch("consultantId") || "none"}
                onValueChange={(value) => setValue("consultantId", value === "none" ? "" : value)}
              >
                <SelectTrigger data-testid="select-consultant">
                  <SelectValue placeholder="Select consultant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {organizations
                    .filter((org) => org.sectorType === "Consultant")
                    .map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>
                      {organization.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.consultantId && (
                <p className="text-sm text-destructive">{errors.consultantId.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {project?.consultantId ? (
                  <>
                    <span className="font-medium text-foreground">
                      {assignedName(project.consultantId) || "This consultant"}
                    </span>{" "}
                    is assigned. Choosing another organization invites them and removes
                    the current one from the project straight away.
                  </>
                ) : (
                  "Sends an invitation. They join the project once they accept."
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select
                value={selectedStatus}
                onValueChange={(value) => setValue("status", value as "pending" | "active" | "completed" | "on-hold" | "overdue")}
              >
                <SelectTrigger data-testid="select-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="on-hold">On Hold</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
              {errors.status && (
                <p className="text-sm text-destructive">{errors.status.message}</p>
              )}
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="location">Location *</Label>
              <Input
                id="location"
                {...register("location")}
                placeholder="New York, NY"
                data-testid="input-location"
              />
              {errors.location && (
                <p className="text-sm text-destructive">{errors.location.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractValue">Contract Value ($) *</Label>
              <Input
                id="contractValue"
                {...register("contractValue")}
                placeholder="500000"
                data-testid="input-contract-value"
              />
              {errors.contractValue && (
                <p className="text-sm text-destructive">{errors.contractValue.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedCost">Estimated Cost ($) *</Label>
              <Input
                id="estimatedCost"
                {...register("estimatedCost")}
                placeholder="450000"
                data-testid="input-estimated-cost"
              />
              {errors.estimatedCost && (
                <p className="text-sm text-destructive">{errors.estimatedCost.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="actualCost">Actual Cost ($)</Label>
              <Input
                id="actualCost"
                {...register("actualCost")}
                placeholder="0"
                data-testid="input-actual-cost"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="progress">Progress (%)</Label>
              <Input
                id="progress"
                type="number"
                min="0"
                max="100"
                {...register("progress", { valueAsNumber: true })}
                data-testid="input-progress"
              />
              {errors.progress && (
                <p className="text-sm text-destructive">{errors.progress.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                {...register("startDate")}
                data-testid="input-start-date"
              />
              {errors.startDate && (
                <p className="text-sm text-destructive">{errors.startDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date *</Label>
              <Input
                id="endDate"
                type="date"
                {...register("endDate")}
                data-testid="input-end-date"
              />
              {errors.endDate && (
                <p className="text-sm text-destructive">{errors.endDate.message}</p>
              )}
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="Project details and notes"
                rows={3}
                data-testid="input-description"
              />
            </div>
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
              {isSubmitting ? "Saving..." : project ? "Update Project" : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
