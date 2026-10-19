import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, CheckCircle2, Link2, FileDown, Upload } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ExcelImportExport } from "@/components/excel-import-export";
import type {
  WorkListDivision,
  WorkListChapter,
  WorkListActivity,
  ChecklistItem,
} from "@shared/schema";

type ChecklistCategory = "main" | "sbc" | "recommendations";

const categoryLabels: Record<ChecklistCategory, string> = {
  main: "Main",
  sbc: "Saudi Building Codes",
  recommendations: "Recommendations",
};

export default function ActivityChecklistLinkPage() {
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>("");
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");
  const [selectedActivityId, setSelectedActivityId] = useState<string>("");
  const [selectedChecklistIds, setSelectedChecklistIds] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<ChecklistCategory>("main");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const justSavedRef = useRef(false);

  const { toast } = useToast();

  // Fetch divisions
  const { data: divisions = [], isLoading: divisionsLoading } = useQuery<WorkListDivision[]>({
    queryKey: ["/api/work-list-divisions"],
  });

  // Fetch chapters
  const { data: allChapters = [] } = useQuery<WorkListChapter[]>({
    queryKey: ["/api/work-list-chapters"],
  });

  // Fetch activities
  const { data: allActivities = [] } = useQuery<WorkListActivity[]>({
    queryKey: ["/api/work-list-activities"],
  });

  // Fetch all checklist items
  const { data: allChecklistItems = [] } = useQuery<ChecklistItem[]>({
    queryKey: ["/api/checklist-items"],
  });

  // Fetch linked checklist items for selected activity
  const { data: linkedItems = [], isLoading: linkedLoading } = useQuery<any[]>({
    queryKey: ["/api/work-list-activities", selectedActivityId, "checklist-items"],
    enabled: !!selectedActivityId,
  });

  // Filter chapters by selected division
  const filteredChapters = useMemo(() => {
    if (!selectedDivisionId) return [];
    return allChapters.filter((c) => c.divisionId === selectedDivisionId);
  }, [allChapters, selectedDivisionId]);

  // Filter activities by selected chapter
  const filteredActivities = useMemo(() => {
    if (!selectedChapterId) return [];
    return allActivities.filter((a) => a.chapterId === selectedChapterId);
  }, [allActivities, selectedChapterId]);

  // Filter checklist items by category
  const filteredChecklistItems = useMemo(() => {
    return allChecklistItems.filter((item) => item.category === activeCategory);
  }, [allChecklistItems, activeCategory]);

  // Count items per category
  const categoryCounts = useMemo(() => {
    return {
      main: allChecklistItems.filter((i) => i.category === "main").length,
      sbc: allChecklistItems.filter((i) => i.category === "sbc").length,
      recommendations: allChecklistItems.filter((i) => i.category === "recommendations").length,
    };
  }, [allChecklistItems]);

  // Update selected checklist IDs when linked items change (but not after save)
  useEffect(() => {
    if (selectedActivityId && !justSavedRef.current) {
      const linkedIds = new Set(linkedItems.map((item) => item.checklistItemId));
      setSelectedChecklistIds(linkedIds);
      setHasUnsavedChanges(false);
    }
    justSavedRef.current = false;
  }, [linkedItems, selectedActivityId]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(
        "PUT",
        `/api/work-list-activities/${selectedActivityId}/checklist-items`,
        { checklistItemIds: Array.from(selectedChecklistIds) }
      );
    },
    onSuccess: () => {
      justSavedRef.current = true;
      queryClient.invalidateQueries({
        queryKey: ["/api/work-list-activities", selectedActivityId, "checklist-items"],
      });
      toast({ title: "Checklist items linked successfully" });
      setHasUnsavedChanges(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDivisionChange = (divisionId: string) => {
    setSelectedDivisionId(divisionId);
    setSelectedChapterId("");
    setSelectedActivityId("");
    setSelectedChecklistIds(new Set());
    setHasUnsavedChanges(false);
  };

  const handleChapterChange = (chapterId: string) => {
    setSelectedChapterId(chapterId);
    setSelectedActivityId("");
    setSelectedChecklistIds(new Set());
    setHasUnsavedChanges(false);
  };

  const handleActivityChange = (activityId: string) => {
    setSelectedActivityId(activityId);
    setHasUnsavedChanges(false);
  };

  const handleChecklistToggle = (itemId: string, checked: boolean) => {
    const newSet = new Set(selectedChecklistIds);
    if (checked) {
      newSet.add(itemId);
    } else {
      newSet.delete(itemId);
    }
    setSelectedChecklistIds(newSet);
    setHasUnsavedChanges(true);
  };

  const handleSelectAll = () => {
    const allIds = new Set(filteredChecklistItems.map((item) => item.id));
    setSelectedChecklistIds((prev) => {
      const newSet = new Set(prev);
      allIds.forEach((id) => newSet.add(id));
      return newSet;
    });
    setHasUnsavedChanges(true);
  };

  const handleDeselectAll = () => {
    const categoryIds = new Set(filteredChecklistItems.map((item) => item.id));
    setSelectedChecklistIds((prev) => {
      const newSet = new Set(prev);
      categoryIds.forEach((id) => newSet.delete(id));
      return newSet;
    });
    setHasUnsavedChanges(true);
  };

  const selectedActivity = allActivities.find((a) => a.id === selectedActivityId);

  const checklistColumns = [
    { key: "activityCode", header: "Activity Code", required: true },
    { key: "code", header: "Checklist Code", required: true },
    { key: "nameEnglish", header: "Name (English)", required: false },
    { key: "nameArabic", header: "Name (Arabic)", required: false },
  ];

  const handleImportLinks = async (data: Record<string, unknown>[]) => {
    setIsImporting(true);
    const errors: string[] = [];
    let successCount = 0;
    let activitiesUpdated = 0;

    try {
      // Group imports by activity code
      const activityGroups = new Map<string, Set<string>>();

      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const activityCode = String(item.activityCode || "");
        const checklistCode = String(item.code || "");

        if (!activityCode || !checklistCode) {
          errors.push(`Row ${i + 2}: Missing activity or checklist code`);
          continue;
        }

        const activity = allActivities.find((a) => a.code === activityCode);
        const checklistItem = allChecklistItems.find((cl) => cl.code === checklistCode);

        if (!activity) {
          errors.push(`Row ${i + 2}: Activity code "${activityCode}" not found`);
          continue;
        }

        if (!checklistItem) {
          errors.push(`Row ${i + 2}: Checklist code "${checklistCode}" not found`);
          continue;
        }

        if (!activityGroups.has(activity.id)) {
          activityGroups.set(activity.id, new Set());
        }
        activityGroups.get(activity.id)!.add(checklistItem.id);
        successCount++;
      }

      // Save all activity-checklist links to database directly
      for (const [activityId, checklistIds] of Array.from(activityGroups.entries())) {
        try {
          await apiRequest(
            "PUT",
            `/api/work-list-activities/${activityId}/checklist-items`,
            { checklistItemIds: Array.from(checklistIds) }
          );
          activitiesUpdated++;

          // If this is the currently selected activity, update the UI
          if (activityId === selectedActivityId) {
            justSavedRef.current = true;
            setSelectedChecklistIds(checklistIds);
            setHasUnsavedChanges(false);
          }
        } catch (error) {
          const activityCode = allActivities.find((a) => a.id === activityId)?.code || activityId;
          errors.push(`Failed to save links for activity "${activityCode}": ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }

      // Invalidate cache to refresh linked items
      if (selectedActivityId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/work-list-activities", selectedActivityId, "checklist-items"],
        });
      }

      if (activitiesUpdated > 0) {
        toast({
          title: "Import completed",
          description: `Successfully saved ${successCount} links across ${activitiesUpdated} activities.`,
        });
      }

      if (errors.length > 0) {
        toast({
          title: "Import warnings",
          description: `${errors.length} issues: ${errors.slice(0, 2).join("; ")}${errors.length > 2 ? "..." : ""}`,
          variant: "destructive",
        });
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Link2 className="h-6 w-6" />
            Activity-Checklist Link
          </h1>
          <p className="text-muted-foreground mt-1">
            Link checklist items to work list activities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExcelImportExport
            data={allChecklistItems
              .filter((item) => selectedChecklistIds.has(item.id))
              .map((item) => ({
                activityCode: selectedActivity?.code || "",
                code: item.code,
                nameEnglish: item.nameEnglish,
                nameArabic: item.nameArabic,
              }))}
            columns={checklistColumns}
            entityName="Activity Links"
            onImport={handleImportLinks}
            isImporting={isImporting}
          />
          {selectedActivityId && (
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!hasUnsavedChanges || saveMutation.isPending}
              data-testid="button-save-links"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Links
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel - Activity Selection */}
        <Card className="p-4">
          <h2 className="font-semibold text-lg mb-4">Select Activity</h2>

          <div className="space-y-4">
            {/* Division Select */}
            <div>
              <label className="text-sm font-medium mb-2 block">Division</label>
              <Select value={selectedDivisionId} onValueChange={handleDivisionChange}>
                <SelectTrigger data-testid="select-link-division">
                  <SelectValue placeholder="Select division" />
                </SelectTrigger>
                <SelectContent>
                  {divisionsLoading ? (
                    <div className="flex justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    divisions.map((div) => (
                      <SelectItem key={div.id} value={div.id}>
                        <span className="text-muted-foreground mr-2">{div.code}</span>
                        {div.nameEnglish}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Chapter Select */}
            <div>
              <label className="text-sm font-medium mb-2 block">Chapter</label>
              <Select
                value={selectedChapterId}
                onValueChange={handleChapterChange}
                disabled={!selectedDivisionId}
              >
                <SelectTrigger data-testid="select-link-chapter">
                  <SelectValue
                    placeholder={selectedDivisionId ? "Select chapter" : "Select division first"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {filteredChapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={chapter.id}>
                      <span className="text-muted-foreground mr-2">{chapter.code}</span>
                      {chapter.nameEnglish}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Activity Select */}
            <div>
              <label className="text-sm font-medium mb-2 block">Activity</label>
              <Select
                value={selectedActivityId}
                onValueChange={handleActivityChange}
                disabled={!selectedChapterId}
              >
                <SelectTrigger data-testid="select-link-activity">
                  <SelectValue
                    placeholder={selectedChapterId ? "Select activity" : "Select chapter first"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {filteredActivities.map((activity) => (
                    <SelectItem key={activity.id} value={activity.id}>
                      <span className="text-muted-foreground mr-2">{activity.code}</span>
                      {activity.nameEnglish}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Selected Activity Info */}
            {selectedActivity && (
              <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                <h3 className="font-medium mb-2">Selected Activity</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Code:</span>
                    <Badge variant="secondary">{selectedActivity.code}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Name:</span>{" "}
                    {selectedActivity.nameEnglish}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Linked items:</span>
                    <Badge>{selectedChecklistIds.size}</Badge>
                  </div>
                </div>

                {/* Linked Items Categorized List */}
                <div className="mt-6 pt-4 border-t border-muted-foreground/20">
                  <h4 className="font-semibold text-sm mb-3">Linked Items by Category</h4>
                  <div className="space-y-4">
                    {(["main", "sbc", "recommendations"] as ChecklistCategory[]).map((category) => {
                      const linkedInCategory = allChecklistItems.filter(
                        (item) => item.category === category && selectedChecklistIds.has(item.id)
                      );
                      
                      if (linkedInCategory.length === 0) return null;

                      return (
                        <div key={category} className="space-y-2">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            {categoryLabels[category]} ({linkedInCategory.length})
                          </h5>
                          <div className="flex flex-wrap gap-1">
                            {linkedInCategory.map((item) => (
                              <Badge key={item.id} variant="outline" className="text-[10px] h-5 py-0">
                                {item.code}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {selectedChecklistIds.size === 0 && (
                      <p className="text-xs text-muted-foreground italic">No items linked yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Right Panel - Checklist Items */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Checklist Items</h2>
            {selectedActivityId && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  data-testid="button-select-all"
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeselectAll}
                  data-testid="button-deselect-all"
                >
                  Deselect All
                </Button>
              </div>
            )}
          </div>

          {!selectedActivityId ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Link2 className="h-12 w-12 mb-4 opacity-50" />
              <p>Select an activity to link checklist items</p>
            </div>
          ) : linkedLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs
              defaultValue="main"
              value={activeCategory}
              onValueChange={(v) => setActiveCategory(v as ChecklistCategory)}
            >
              <TabsList className="w-full grid grid-cols-3 mb-4">
                <TabsTrigger value="main" data-testid="tab-link-main">
                  Main ({categoryCounts.main})
                </TabsTrigger>
                <TabsTrigger value="sbc" data-testid="tab-link-sbc">
                  SBC ({categoryCounts.sbc})
                </TabsTrigger>
                <TabsTrigger value="recommendations" data-testid="tab-link-recommendations">
                  Recommendations ({categoryCounts.recommendations})
                </TabsTrigger>
              </TabsList>

              {(["main", "sbc", "recommendations"] as ChecklistCategory[]).map((category) => (
                <TabsContent key={category} value={category}>
                  <ScrollArea className="h-[400px] pr-4">
                    {filteredChecklistItems.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No {categoryLabels[category]} checklist items found
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {allChecklistItems
                          .filter((item) => item.category === category)
                          .map((item) => (
                            <div
                              key={item.id}
                              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                                selectedChecklistIds.has(item.id)
                                  ? "bg-primary/5 border-primary/30"
                                  : "hover:bg-muted/50"
                              }`}
                              data-testid={`checklist-item-${item.id}`}
                            >
                              <Checkbox
                                id={item.id}
                                checked={selectedChecklistIds.has(item.id)}
                                onCheckedChange={(checked) =>
                                  handleChecklistToggle(item.id, checked as boolean)
                                }
                                data-testid={`checkbox-item-${item.id}`}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {item.code}
                                  </Badge>
                                  {selectedChecklistIds.has(item.id) && (
                                    <CheckCircle2 className="h-4 w-4 text-primary" />
                                  )}
                                </div>
                                <p className="text-sm mt-1">{item.nameEnglish}</p>
                                <p className="text-sm text-muted-foreground" dir="rtl">
                                  {item.nameArabic}
                                </p>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </Card>
      </div>

      {/* Unsaved changes indicator */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-4 right-4 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
          You have unsaved changes
        </div>
      )}
    </div>
  );
}
