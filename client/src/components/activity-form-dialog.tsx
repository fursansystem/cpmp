import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { CalendarIcon, X, FilePlus2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { z } from "zod";
import {
  RequestType,
  WorkListDivision,
  WorkListChapter,
  WorkListActivity
} from "@shared/schema";

interface ActivityFormDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
}

const activityFormSchema = z.object({
  requestTypeId: z.string().min(1, "Request type is required"),
  divisionId: z.string().optional(),
  chapterId: z.string().optional(),
  workListActivityId: z.string().optional(),
  scheduledDate: z.date().optional(),
  description: z.string().optional(),
});

type ActivityFormData = z.infer<typeof activityFormSchema>;

export function ActivityFormDialog({
  projectId,
  open,
  onOpenChange,
  trigger,
}: ActivityFormDialogProps) {
  const [, navigate] = useLocation();
  const [isPending, setIsPending] = useState(false);
  const { user } = useAuth();
  
  const isContractorEngineer = user?.organizationSectorType === "Contractor" && 
    user?.positions?.some((p: string) => p.toLowerCase().includes("engineer") || p.includes("مهندس"));
  const isConsultant = user?.organizationSectorType === "Consultant";

  const form = useForm<ActivityFormData>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      requestTypeId: "",
      divisionId: "",
      chapterId: "",
      workListActivityId: "",
      scheduledDate: new Date(),
      description: "",
    },
  });

  const selectedRequestTypeId = form.watch("requestTypeId");
  const selectedDivisionId = form.watch("divisionId");
  const selectedChapterId = form.watch("chapterId");
  const selectedWorkListActivityId = form.watch("workListActivityId");

  // Fetch request types
  const { data: requestTypes = [] } = useQuery<RequestType[]>({
    queryKey: ["/api/request-types"],
  });

  // Fetch divisions
  const { data: divisions = [] } = useQuery<WorkListDivision[]>({
    queryKey: ["/api/work-list-divisions"],
  });

  // Fetch chapters filtered by division
  const { data: allChapters = [] } = useQuery<WorkListChapter[]>({
    queryKey: ["/api/work-list-chapters"],
  });

  // Fetch activities filtered by chapter
  const { data: allActivities = [] } = useQuery<WorkListActivity[]>({
    queryKey: ["/api/work-list-activities"],
  });

  const isMIRorSSROrMARorDSR = useMemo(() => {
    const rt = requestTypes.find(r => r.id === selectedRequestTypeId);
    return rt?.code === "MIR" || rt?.code === "SSR" || rt?.code === "MAR" || rt?.code === "DSR" || rt?.code === "SD" || rt?.code === "ASD";
  }, [requestTypes, selectedRequestTypeId]);

  const isNCRorSI = useMemo(() => {
    const rt = requestTypes.find(r => r.id === selectedRequestTypeId);
    return rt?.code === "NCR" || rt?.code === "RNCR" || rt?.code === "SI";
  }, [requestTypes, selectedRequestTypeId]);

  const isSI = useMemo(() => {
    const rt = requestTypes.find(r => r.id === selectedRequestTypeId);
    return rt?.code === "SI";
  }, [requestTypes, selectedRequestTypeId]);

  // Filter chapters by selected division
  const filteredChapters = useMemo(() => {
    if (!selectedDivisionId) return [];
    return allChapters.filter(c => c.divisionId === selectedDivisionId);
  }, [allChapters, selectedDivisionId]);

  // Filter activities by selected chapter
  const filteredActivities = useMemo(() => {
    if (!selectedChapterId) return [];
    return allActivities.filter(a => a.chapterId === selectedChapterId);
  }, [allActivities, selectedChapterId]);

  // Reset dependent fields when parent changes
  useEffect(() => {
    if (selectedDivisionId) {
      form.setValue("chapterId", "");
      form.setValue("workListActivityId", "");
    }
  }, [selectedDivisionId]);

  useEffect(() => {
    if (selectedChapterId) {
      form.setValue("workListActivityId", "");
    }
  }, [selectedChapterId]);

  // Fetch next request number for preview
  const { data: nextNumberData } = useQuery<{ nextNumber: string }>({
    queryKey: ["/api/projects", projectId, "request-types", selectedRequestTypeId, "next-number"],
    enabled: !!projectId && !!selectedRequestTypeId && isNCRorSI,
  });

  // Generate activity code
  const activityCode = useMemo(() => {
    const requestType = requestTypes.find(r => r.id === selectedRequestTypeId);
    if (!requestType) return null;

    if (isNCRorSI) {
       return nextNumberData?.nextNumber || `Auto-Generated`;
    }

    const division = divisions.find(d => d.id === selectedDivisionId);
    const chapter = filteredChapters.find(c => c.id === selectedChapterId);
    const activity = filteredActivities.find(a => a.id === selectedWorkListActivityId);

    if (!division || !chapter) {
      return null;
    }

    if (!isMIRorSSROrMARorDSR && !activity) {
      return null;
    }

    // Extract numeric parts: WIR 8.1.3 format
    const divCode = division.code.replace(/^0+/, '') || division.code;
    const chapCode = chapter.code.split('.').pop()?.replace(/^0+/, '') || chapter.code;
    const actCode = activity ? (activity.code.split('.').pop()?.replace(/^0+/, '') || activity.code) : "";

    const baseCode = `${requestType.code} ${divCode}.${chapCode}`;
    return activity ? `${baseCode}.${actCode}` : baseCode;
  }, [selectedRequestTypeId, selectedDivisionId, selectedChapterId, selectedWorkListActivityId, requestTypes, divisions, filteredChapters, filteredActivities, isNCRorSI, isMIRorSSROrMARorDSR, nextNumberData]);

  const onSubmit = async (data: ActivityFormData) => {
    const requestType = requestTypes.find(r => r.id === data.requestTypeId);
    const isNCRorSIRequest = requestType?.code === "NCR" || requestType?.code === "RNCR" || requestType?.code === "SI";
    
    const division = divisions.find(d => d.id === data.divisionId);
    const chapter = filteredChapters.find(c => c.id === data.chapterId);
    const activity = filteredActivities.find(a => a.id === data.workListActivityId);

    const isMIRorSSROrMARorDSRRequest = requestType?.code === "MIR" || requestType?.code === "SSR" || requestType?.code === "MAR" || requestType?.code === "DSR" || requestType?.code === "SD" || requestType?.code === "ASD";
    
    if (!requestType) {
      toast({
        title: "Error",
        description: "Please select request type",
        variant: "destructive",
      });
      return;
    }

    if (!isNCRorSIRequest && (!division || !chapter)) {
      toast({
        title: "Error",
        description: "Please select Division and Chapter",
        variant: "destructive",
      });
      return;
    }

    if (!isNCRorSIRequest && !isMIRorSSROrMARorDSRRequest && !activity) {
      toast({
        title: "Error",
        description: "Please select Activity",
        variant: "destructive",
      });
      return;
    }

    setIsPending(true);
    try {
      // Create request with revision using the workflow endpoint
      // This creates: request header, revision payload, status history, and activity record
      const requestPayload = {
        projectId,
        requestTypeId: data.requestTypeId,
        referenceCode: activityCode || `${requestType?.code || 'REQ'}-000`,
        title: isNCRorSIRequest ? `${requestType.code} Request` : (activity?.nameEnglish || `${requestType?.code} - ${chapter?.nameEnglish}`),
        workListActivityId: data.workListActivityId || null,
        scheduledDate: data.scheduledDate ? format(data.scheduledDate, "yyyy-MM-dd") : null,
        divisionName: division?.nameEnglish || null,
        chapterName: chapter?.nameEnglish || null,
        activityName: activity?.nameEnglish || chapter?.nameEnglish || null,
        activityCode: activityCode || null,
        description: data.description || null,
      };

      const response = await apiRequest("POST", "/api/requests/create-with-revision", requestPayload);
      const result = await response.json();

      toast({
        title: "Success",
        description: "Request created successfully",
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/activities", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/requests", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "form-settings"] });

      form.reset();
      onOpenChange(false);

      // Navigate to the WIR request page to add more details
      if (result?.activity?.id) {
        navigate(`/create-wir/${result.activity.id}`);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create request",
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <div className="hidden">{trigger}</div>}
      <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden border-none shadow-2xl bg-white dark:bg-background rounded-[1.5rem] sm:rounded-[1.5rem] flex flex-col [&>button]:hidden">
        {/* Manual Close Button - Premium Style */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute top-5 right-5 z-[100] w-10 h-10 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-all duration-300 text-primary border border-primary/20 group active:scale-90"
        >
          <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
        </button>

        {/* Premium Background Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

        <DialogHeader className="p-8 pb-4 relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-lg shadow-primary/5 transition-transform duration-500 hover:scale-105 shrink-0">
              <FilePlus2 className="w-8 h-8" />
            </div>
            <div className="flex-grow text-left">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-black uppercase tracking-[0.2em] text-primary">New Activity</span>
              </div>
              <DialogTitle className="text-2xl font-black tracking-tighter text-foreground uppercase leading-none mb-1">
                Add Request
              </DialogTitle>
              <DialogDescription className="text-sm font-bold text-muted-foreground uppercase tracking-widest opacity-60">
                Create a new request for this project
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-8 pb-8 relative z-10">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Request Type and Division Row */}
              <div className="grid gap-4 grid-cols-2">
                <FormField
                  control={form.control}
                  name="requestTypeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Request Type</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-request-type" className="rounded-[1.5rem] border-primary/30 focus:border-primary focus:ring-primary bg-transparent">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {requestTypes.filter(type => {
                            if (!type.is_active || type.code === "DN" || type.code === "RNCR") return false;
                            if (isContractorEngineer && type.code !== "RNCR") return false;
                            if (isConsultant && type.code !== "NCR" && type.code !== "SI") return false;
                            return true;
                          }).map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.code} - {type.name_english}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="divisionId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Division</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-division" className="rounded-[1.5rem] border-primary/30 focus:border-primary focus:ring-primary bg-transparent">
                            <SelectValue placeholder="Select division" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {divisions.map((div) => (
                            <SelectItem key={div.id} value={div.id}>
                              <span className="text-muted-foreground mr-2">{div.code}</span>
                              {div.nameEnglish}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Chapter */}
              <FormField
                control={form.control}
                name="chapterId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chapter</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!selectedDivisionId}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-chapter" className="rounded-[1.5rem] border-primary/30 focus:border-primary focus:ring-primary bg-transparent">
                          <SelectValue placeholder={selectedDivisionId ? "Select chapter" : "Select division first"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredChapters.map((chapter) => (
                          <SelectItem key={chapter.id} value={chapter.id}>
                            <span className="text-muted-foreground mr-2">{chapter.code}</span>
                            {chapter.nameEnglish}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Activity (Hidden for MIR/SSR/MAR/DSR and NCR/SI) */}
              {!isMIRorSSROrMARorDSR && !isNCRorSI && (
                <FormField
                  control={form.control}
                  name="workListActivityId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Activity</FormLabel>
                      <Select
                        value={field.value || ""}
                        onValueChange={field.onChange}
                        disabled={!selectedChapterId}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-activity" className="rounded-[1.5rem] border-primary/30 focus:border-primary focus:ring-primary bg-transparent">
                            <SelectValue placeholder={selectedChapterId ? "Select activity" : "Select chapter first"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredActivities.map((activity) => (
                            <SelectItem key={activity.id} value={activity.id}>
                              <span className="text-muted-foreground mr-2">{activity.code}</span>
                              {activity.nameEnglish}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Description (Optional) - Hidden for NCR/SI, moved to details page */}
              {!isNCRorSI && (
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter description..."
                          className="rounded-[1.5rem] border-primary/30 focus:border-primary focus:ring-primary bg-transparent min-h-[80px]"
                          data-testid="textarea-description"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Activity Code and Date Row */}
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <FormLabel className="mb-2 block">{isNCRorSI ? "Request NO" : "Request code"}</FormLabel>
                  <Badge
                    variant="outline"
                    className="h-10 px-4 text-sm font-bold rounded-[1.5rem] bg-primary/5 text-primary border-primary/30 shadow-none flex items-center"
                    data-testid="badge-activity-code"
                  >
                    {activityCode || "---"}
                  </Badge>
                </div>

                <FormField
                  control={form.control}
                  name="scheduledDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="mb-2">Actual Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-[140px] h-10 rounded-[1.5rem] pl-3 text-left font-semibold border-primary/30 hover:bg-primary/5 bg-transparent",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="button-date-picker"
                            >
                              {field.value ? (
                                format(field.value, "MM/dd/yyyy")
                              ) : (
                                <span>mm/dd/yyyy</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => {
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                return date < today;
                              }}
                              initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="rounded-[1.5rem] flex-1 border-primary/30 text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || !activityCode}
                  className="rounded-[1.5rem] bg-destructive hover:bg-destructive/90 flex-1"
                  data-testid="button-submit-activity"
                >
                  {isPending ? "Creating..." : "Create Request"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
