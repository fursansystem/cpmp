import { useState } from "react";
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
import { insertTaskSchema, type InsertTask, type Task, type Project, type TeamMember } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";

interface TaskFormDialogProps {
  task?: Task;
  trigger: React.ReactNode;
  onSubmit: (data: InsertTask) => Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function TaskFormDialog({ task, trigger, onSubmit, open: controlledOpen, onOpenChange }: TaskFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (onOpenChange || (() => {})) : setInternalOpen;

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    reset,
  } = useForm<InsertTask>({
    resolver: zodResolver(insertTaskSchema),
    defaultValues: task ? {
      ...task,
      status: task.status as "todo" | "in-progress" | "completed",
      priority: task.priority as "low" | "medium" | "high" | "urgent",
      type: (task as any).type as "general" | "inspection_request" | "permission_request" | "approval_request",
    } : {
      status: "todo" as const,
      priority: "medium" as const,
      type: "general" as const,
    },
  });

  const onSubmitForm = async (data: InsertTask) => {
    await onSubmit(data);
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Edit Task" : "Create New Task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              {...register("title")}
              placeholder="Complete electrical inspection"
              data-testid="input-title"
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="Task details"
              rows={3}
              data-testid="input-description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Task Type *</Label>
            <Select
              value={watch("type")}
              onValueChange={(value) => setValue("type", value as "general" | "inspection_request" | "permission_request" | "approval_request")}
            >
              <SelectTrigger data-testid="select-type">
                <SelectValue placeholder="Select task type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General Task</SelectItem>
                <SelectItem value="inspection_request">Work Inspection Request</SelectItem>
                <SelectItem value="permission_request">Request for Permission to Work</SelectItem>
                <SelectItem value="approval_request">Request Approvals</SelectItem>
              </SelectContent>
            </Select>
            {errors.type && (
              <p className="text-sm text-destructive">{errors.type.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="projectId">Project *</Label>
              <Select
                value={watch("projectId")}
                onValueChange={(value) => setValue("projectId", value)}
              >
                <SelectTrigger data-testid="select-project">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.projectId && (
                <p className="text-sm text-destructive">{errors.projectId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignedTo">Assigned To (Optional)</Label>
              <Select
                value={watch("assignedTo") || "unassigned"}
                onValueChange={(value) => setValue("assignedTo", value === "unassigned" ? undefined : value)}
              >
                <SelectTrigger data-testid="select-assignee">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority *</Label>
              <Select
                value={watch("priority")}
                onValueChange={(value) => setValue("priority", value as "low" | "medium" | "high" | "urgent")}
              >
                <SelectTrigger data-testid="select-priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
              {errors.priority && (
                <p className="text-sm text-destructive">{errors.priority.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select
                value={watch("status")}
                onValueChange={(value) => setValue("status", value as "todo" | "in-progress" | "completed")}
              >
                <SelectTrigger data-testid="select-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              {errors.status && (
                <p className="text-sm text-destructive">{errors.status.message}</p>
              )}
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                {...register("dueDate")}
                data-testid="input-due-date"
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
              {isSubmitting ? "Saving..." : task ? "Update Task" : "Create Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
