import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TaskItem } from "@/components/task-item";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import type { Task, TeamMember, InsertTask } from "@shared/schema";

export default function Tasks() {
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertTask) => {
      return await apiRequest("POST", "/api/tasks", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Success",
        description: "Activity created successfully",
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
    mutationFn: async ({ id, data }: { id: string; data: InsertTask }) => {
      return await apiRequest("PATCH", `/api/tasks/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Success",
        description: "Activity updated successfully",
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
      return await apiRequest("DELETE", `/api/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Success",
        description: "Activity deleted successfully",
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

  const toggleTaskMutation = useMutation({
    mutationFn: async (task: Task) => {
      const newStatus = task.status === "completed" ? "todo" : "completed";
      return await apiRequest("PATCH", `/api/tasks/${task.id}`, {
        ...task,
        status: newStatus,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Success",
        description: "Activity status updated",
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

  const tasksWithNames = useMemo(() => {
    return tasks.map(task => {
      const teamMember = teamMembers.find(tm => tm.id === task.assignedTo);
      return {
        id: task.id,
        title: task.title,
        type: (task as any).type as "general" | "inspection_request" | "permission_request" | "approval_request",
        priority: task.priority as "low" | "medium" | "high" | "urgent",
        status: task.status as "todo" | "in-progress" | "completed",
        assignedTo: teamMember?.name || "Unassigned",
        dueDate: task.dueDate || undefined,
        originalTask: task,
      };
    });
  }, [tasks, teamMembers]);

  const filteredTasks = useMemo(() => {
    return tasksWithNames.filter(task => {
      const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      return matchesSearch && matchesPriority;
    });
  }, [tasksWithNames, searchQuery, priorityFilter]);

  const todoTasks = filteredTasks.filter(t => t.status === "todo");
  const inProgressTasks = filteredTasks.filter(t => t.status === "in-progress");
  const completedTasks = filteredTasks.filter(t => t.status === "completed");

  const handleCreateTask = async (data: InsertTask) => {
    await createMutation.mutateAsync(data);
  };

  const handleToggleTask = async (taskWithName: typeof tasksWithNames[0]) => {
    await toggleTaskMutation.mutateAsync(taskWithName.originalTask);
  };

  const handleDeleteTask = async (id: string) => {
    if (confirm('Are you sure you want to delete this activity?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const renderTaskList = (taskList: typeof filteredTasks) => {
    if (tasksLoading) {
      return (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <div className="p-4 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      );
    }

    if (taskList.length === 0) {
      return (
        <Card>
          <div className="p-6 text-center text-muted-foreground">
            No activity found
          </div>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {taskList.map((task) => (
          <TaskItem
            key={task.id}
            id={task.id}
            title={task.title}
            priority={task.priority}
            status={task.status}
            assignedTo={task.assignedTo}
            dueDate={task.dueDate}
            onToggle={() => handleToggleTask(task)}
            onEdit={() => console.log('Edit task:', task.id)}
            onDelete={() => handleDeleteTask(task.id)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display mb-2">Activity</h1>
          <p className="text-muted-foreground">
            Track and manage project activity
          </p>
        </div>
        <TaskFormDialog
          trigger={
            <Button data-testid="button-new-task">
              <Plus className="w-4 h-4 mr-2" />
              New Activity
            </Button>
          }
          onSubmit={handleCreateTask}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search activity..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-priority-filter">
            <SelectValue placeholder="Filter by priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="all" className="space-y-6">
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all">
            All Activity ({filteredTasks.length})
          </TabsTrigger>
          <TabsTrigger value="todo" data-testid="tab-todo">
            To Do ({todoTasks.length})
          </TabsTrigger>
          <TabsTrigger value="in-progress" data-testid="tab-in-progress">
            In Progress ({inProgressTasks.length})
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            Completed ({completedTasks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          {renderTaskList(filteredTasks)}
        </TabsContent>

        <TabsContent value="todo">
          {renderTaskList(todoTasks)}
        </TabsContent>

        <TabsContent value="in-progress">
          {renderTaskList(inProgressTasks)}
        </TabsContent>

        <TabsContent value="completed">
          {renderTaskList(completedTasks)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
