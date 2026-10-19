import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { ExcelImportExport } from "@/components/excel-import-export";
import { 
  insertWorkListChapterSchema, type WorkListChapter, type InsertWorkListChapter,
  insertWorkListActivitySchema, type WorkListActivity, type InsertWorkListActivity,
  insertRequestTypeSchema, type WorkListDivision
} from "@shared/schema";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TreeNodeType = "division" | "chapter" | "activity";

interface TreeNode {
  id: string;
  type: TreeNodeType;
  code: string;
  nameEnglish: string;
  nameArabic: string;
  parentId?: string;
  children?: TreeNode[];
  level: number;
  sortOrder: number;
}

interface RequestType {
  id: string;
  id_number: number;
  code: string;
  name_english: string;
  name_arabic: string;
  description?: string;
  is_active: boolean;
  sort_order: number;
}

export default function WorkListPage() {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [isChapterDialogOpen, setIsChapterDialogOpen] = useState(false);
  const [editingChapter, setEditingChapter] = useState<WorkListChapter | null>(null);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>("");
  const [deleteChapterId, setDeleteChapterId] = useState<string | null>(null);
  
  const [isActivityDialogOpen, setIsActivityDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<WorkListActivity | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");
  const [deleteActivityId, setDeleteActivityId] = useState<string | null>(null);
  
  const [isRequestTypeDialogOpen, setIsRequestTypeDialogOpen] = useState(false);
  const [editingRequestType, setEditingRequestType] = useState<RequestType | null>(null);
  const [deleteRequestTypeId, setDeleteRequestTypeId] = useState<string | null>(null);
  
  const [isImporting, setIsImporting] = useState(false);
  
  const { toast } = useToast();

  const { data: requestTypes = [], isLoading: typesLoading } = useQuery<RequestType[]>({
    queryKey: ["/api/request-types"],
  });

  const { data: divisions = [], isLoading: divisionsLoading } = useQuery<WorkListDivision[]>({
    queryKey: ["/api/work-list-divisions"],
  });

  const { data: chapters = [], isLoading: chaptersLoading } = useQuery<WorkListChapter[]>({
    queryKey: ["/api/work-list-chapters"],
  });

  const { data: activities = [], isLoading: activitiesLoading } = useQuery<WorkListActivity[]>({
    queryKey: ["/api/work-list-activities"],
  });


  const chapterForm = useForm<InsertWorkListChapter>({
    resolver: zodResolver(insertWorkListChapterSchema),
    defaultValues: {
      divisionId: "",
      code: "",
      nameEnglish: "",
      nameArabic: "",
      sortOrder: 0,
    },
  });

  const activityForm = useForm<InsertWorkListActivity>({
    resolver: zodResolver(insertWorkListActivitySchema),
    defaultValues: {
      chapterId: "",
      code: "",
      nameEnglish: "",
      nameArabic: "",
      sortOrder: 0,
    },
  });

  const requestTypeForm = useForm<Partial<RequestType>>({
    resolver: zodResolver(insertRequestTypeSchema),
    defaultValues: {
      id_number: undefined,
      code: "",
      name_english: "",
      name_arabic: "",
      description: "",
      is_active: true,
      sort_order: 0,
    },
  });

  const createChapterMutation = useMutation({
    mutationFn: (data: InsertWorkListChapter) => apiRequest("POST", "/api/work-list-chapters", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-list-chapters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-list-divisions"] });
      toast({ title: "Chapter created successfully" });
      setIsChapterDialogOpen(false);
      chapterForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateChapterMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertWorkListChapter> }) =>
      apiRequest("PATCH", `/api/work-list-chapters/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-list-chapters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-list-divisions"] });
      toast({ title: "Chapter updated successfully" });
      setIsChapterDialogOpen(false);
      setEditingChapter(null);
      chapterForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteChapterMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/work-list-chapters/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-list-chapters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-list-divisions"] });
      toast({ title: "Chapter deleted successfully" });
      setDeleteChapterId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createActivityMutation = useMutation({
    mutationFn: (data: InsertWorkListActivity) => apiRequest("POST", "/api/work-list-activities", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-list-activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-list-chapters"] });
      toast({ title: "Activity created successfully" });
      setIsActivityDialogOpen(false);
      activityForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateActivityMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertWorkListActivity> }) =>
      apiRequest("PATCH", `/api/work-list-activities/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-list-activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-list-chapters"] });
      toast({ title: "Activity updated successfully" });
      setIsActivityDialogOpen(false);
      setEditingActivity(null);
      activityForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteActivityMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/work-list-activities/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-list-activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-list-chapters"] });
      toast({ title: "Activity deleted successfully" });
      setDeleteActivityId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createRequestTypeMutation = useMutation({
    mutationFn: (data: Partial<RequestType>) => apiRequest("POST", "/api/request-types", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/request-types"] });
      toast({ title: "Request type created successfully" });
      setIsRequestTypeDialogOpen(false);
      requestTypeForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateRequestTypeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RequestType> }) =>
      apiRequest("PATCH", `/api/request-types/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/request-types"] });
      toast({ title: "Request type updated successfully" });
      setIsRequestTypeDialogOpen(false);
      setEditingRequestType(null);
      requestTypeForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteRequestTypeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/request-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/request-types"] });
      toast({ title: "Request type deleted successfully" });
      setDeleteRequestTypeId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openCreateChapterDialog = (divisionId: string) => {
    setEditingChapter(null);
    setSelectedDivisionId(divisionId);
    const divisionChapters = chapters.filter(c => c.divisionId === divisionId);
    const maxSortOrder = divisionChapters.reduce((max, c) => Math.max(max, c.sortOrder), 0);
    chapterForm.reset({
      divisionId,
      code: "",
      nameEnglish: "",
      nameArabic: "",
      sortOrder: maxSortOrder + 1,
    });
    setIsChapterDialogOpen(true);
  };

  const openEditChapterDialog = (chapter: WorkListChapter) => {
    setEditingChapter(chapter);
    setSelectedDivisionId(chapter.divisionId);
    chapterForm.reset({
      divisionId: chapter.divisionId,
      code: chapter.code,
      nameEnglish: chapter.nameEnglish,
      nameArabic: chapter.nameArabic,
      sortOrder: chapter.sortOrder,
    });
    setIsChapterDialogOpen(true);
  };

  const onChapterSubmit = (data: InsertWorkListChapter) => {
    if (editingChapter) {
      updateChapterMutation.mutate({ id: editingChapter.id, data });
    } else {
      createChapterMutation.mutate(data);
    }
  };

  const openCreateActivityDialog = (chapterId: string) => {
    setEditingActivity(null);
    setSelectedChapterId(chapterId);
    const chapterActivities = activities.filter(a => a.chapterId === chapterId);
    const maxSortOrder = chapterActivities.reduce((max, a) => Math.max(max, a.sortOrder), 0);
    activityForm.reset({
      chapterId,
      code: "",
      nameEnglish: "",
      nameArabic: "",
      sortOrder: maxSortOrder + 1,
    });
    setIsActivityDialogOpen(true);
  };

  const openEditActivityDialog = (activity: WorkListActivity) => {
    setEditingActivity(activity);
    setSelectedChapterId(activity.chapterId);
    activityForm.reset({
      chapterId: activity.chapterId,
      code: activity.code,
      nameEnglish: activity.nameEnglish,
      nameArabic: activity.nameArabic,
      sortOrder: activity.sortOrder,
    });
    setIsActivityDialogOpen(true);
  };

  const onActivitySubmit = (data: InsertWorkListActivity) => {
    if (editingActivity) {
      updateActivityMutation.mutate({ id: editingActivity.id, data });
    } else {
      createActivityMutation.mutate(data);
    }
  };

  const onRequestTypeSubmit = (data: Partial<RequestType>) => {
    if (editingRequestType) {
      updateRequestTypeMutation.mutate({ id: editingRequestType.id, data });
    } else {
      createRequestTypeMutation.mutate(data);
    }
  };

  const chapterColumns = [
    { key: "divisionCode", header: "Division Code", required: true },
    { key: "code", header: "Chapter Code", required: true },
    { key: "nameEnglish", header: "Name (English)", required: true },
    { key: "nameArabic", header: "Name (Arabic)", required: true },
    { key: "sortOrder", header: "Sort Order", required: false },
  ];

  const activityColumns = [
    { key: "chapterCode", header: "Chapter Code", required: true },
    { key: "code", header: "Activity Code", required: true },
    { key: "nameEnglish", header: "Name (English)", required: true },
    { key: "nameArabic", header: "Name (Arabic)", required: true },
    { key: "sortOrder", header: "Sort Order", required: false },
  ];

  const handleImportChapters = async (data: Record<string, unknown>[]) => {
    setIsImporting(true);
    const errors: string[] = [];
    let successCount = 0;
    
    try {
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        try {
          const division = divisions.find(d => d.code === String(item.divisionCode));
          if (!division) {
            throw new Error(`Division code "${item.divisionCode}" not found`);
          }
          await apiRequest("POST", "/api/work-list-chapters", {
            divisionId: division.id,
            code: String(item.code),
            nameEnglish: String(item.nameEnglish),
            nameArabic: String(item.nameArabic),
            sortOrder: item.sortOrder ? Number(item.sortOrder) : 0,
          });
          successCount++;
        } catch (error) {
          errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/work-list-chapters"] });
      
      if (errors.length > 0) {
        throw new Error(`${successCount} imported, ${errors.length} failed:\n${errors.slice(0, 3).join("\n")}${errors.length > 3 ? `\n...and ${errors.length - 3} more` : ""}`);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportActivities = async (data: Record<string, unknown>[]) => {
    setIsImporting(true);
    const errors: string[] = [];
    let successCount = 0;
    
    try {
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        try {
          const chapter = chapters.find(c => c.code === String(item.chapterCode));
          if (!chapter) {
            throw new Error(`Chapter code "${item.chapterCode}" not found`);
          }
          await apiRequest("POST", "/api/work-list-activities", {
            chapterId: chapter.id,
            code: String(item.code),
            nameEnglish: String(item.nameEnglish),
            nameArabic: String(item.nameArabic),
            sortOrder: item.sortOrder ? Number(item.sortOrder) : 0,
          });
          successCount++;
        } catch (error) {
          errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/work-list-activities"] });
      
      if (errors.length > 0) {
        throw new Error(`${successCount} imported, ${errors.length} failed:\n${errors.slice(0, 3).join("\n")}${errors.length > 3 ? `\n...and ${errors.length - 3} more` : ""}`);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const chaptersWithDivisionCode = chapters.map(c => {
    const div = divisions.find(d => d.id === c.divisionId);
    return { ...c, divisionCode: div?.code || "" };
  });

  const activitiesWithChapterCode = activities.map(a => {
    const chap = chapters.find(c => c.id === a.chapterId);
    return { ...a, chapterCode: chap?.code || "" };
  });

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const buildTreeData = (): TreeNode[] => {
    const treeNodes: TreeNode[] = [];
    
    divisions.forEach(div => {
      const divNode: TreeNode = {
        id: div.id,
        type: "division",
        code: div.code,
        nameEnglish: div.nameEnglish,
        nameArabic: div.nameArabic,
        level: 0,
        sortOrder: div.sortOrder,
        children: [],
      };
      
      const divChapters = chapters.filter(c => c.divisionId === div.id).sort((a, b) => a.sortOrder - b.sortOrder);
      divChapters.forEach(chap => {
        const chapNode: TreeNode = {
          id: chap.id,
          type: "chapter",
          code: chap.code,
          nameEnglish: chap.nameEnglish,
          nameArabic: chap.nameArabic,
          parentId: div.id,
          level: 1,
          sortOrder: chap.sortOrder,
          children: [],
        };
        
        const chapActivities = activities.filter(a => a.chapterId === chap.id).sort((a, b) => a.sortOrder - b.sortOrder);
        chapActivities.forEach(act => {
          const actNode: TreeNode = {
            id: act.id,
            type: "activity",
            code: act.code,
            nameEnglish: act.nameEnglish,
            nameArabic: act.nameArabic,
            parentId: chap.id,
            level: 2,
            sortOrder: act.sortOrder,
          };
          chapNode.children?.push(actNode);
        });
        
        divNode.children?.push(chapNode);
      });
      
      treeNodes.push(divNode);
    });
    
    return treeNodes.sort((a, b) => a.sortOrder - b.sortOrder);
  };

  const flattenTree = (nodes: TreeNode[]): TreeNode[] => {
    const result: TreeNode[] = [];
    
    const traverse = (node: TreeNode) => {
      result.push(node);
      if (expandedNodes.has(node.id) && node.children) {
        node.children.forEach(traverse);
      }
    };
    
    nodes.forEach(traverse);
    return result;
  };

  const treeData = buildTreeData();
  const flattenedTree = flattenTree(treeData);

  const hasChildren = (node: TreeNode): boolean => {
    return (node.children?.length ?? 0) > 0;
  };

  const isTreeLoading = divisionsLoading || chaptersLoading || activitiesLoading;
  const isChapterPending = createChapterMutation.isPending || updateChapterMutation.isPending;
  const isActivityPending = createActivityMutation.isPending || updateActivityMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-display font-bold">Work List</h1>
      
      <Tabs defaultValue="request-type" className="w-full">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="request-type" data-testid="tab-request-type">Request Types</TabsTrigger>
          <TabsTrigger value="division" data-testid="tab-division">Division</TabsTrigger>
          <TabsTrigger value="chapter" data-testid="tab-chapter">Chapter</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="request-type" className="mt-4">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="font-medium text-lg">Request Types</h2>
                <p className="text-muted-foreground text-sm">Manage request types for work requests and approvals</p>
              </div>
              <Button onClick={() => { setEditingRequestType(null); requestTypeForm.reset({ id_number: undefined, code: "", name_english: "", name_arabic: "", description: "", is_active: true, sort_order: 0 }); setIsRequestTypeDialogOpen(true); }} data-testid="button-add-request-type">
                <Plus className="h-4 w-4 mr-2" />
                Add Type
              </Button>
            </div>
            {typesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : requestTypes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No request types found. Create one to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>English Name</TableHead>
                    <TableHead dir="rtl">Arabic Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-20">Active</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requestTypes.map((type, index) => (
                    <TableRow key={type.id} data-testid={`row-request-type-${type.id}`}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell className="font-mono">{type.code}</TableCell>
                      <TableCell>{type.name_english}</TableCell>
                      <TableCell dir="rtl">{type.name_arabic}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{type.description || "-"}</TableCell>
                      <TableCell>{type.is_active ? "Yes" : "No"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingRequestType(type);
                              requestTypeForm.reset({
                                id_number: type.id_number,
                                code: type.code,
                                name_english: type.name_english,
                                name_arabic: type.name_arabic,
                                description: type.description,
                                is_active: type.is_active,
                                sort_order: type.sort_order,
                              });
                              setIsRequestTypeDialogOpen(true);
                            }}
                            data-testid={`button-edit-request-type-${type.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteRequestTypeId(type.id)}
                            data-testid={`button-delete-request-type-${type.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="division" className="mt-4">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-medium text-lg">Division / Chapter / Activity Tree</h2>
            </div>

            {isTreeLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : divisions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No divisions found.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">ID</TableHead>
                    <TableHead className="w-48">Division</TableHead>
                    <TableHead className="w-48">Chapter</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flattenedTree.map((node, index) => (
                    <TableRow 
                      key={`${node.type}-${node.id}`} 
                      data-testid={`row-tree-${node.type}-${node.id}`}
                      className={node.type === "division" ? "bg-muted/30" : node.type === "chapter" ? "bg-muted/10" : ""}
                    >
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell>
                        {node.type === "division" && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => toggleNode(node.id)}
                              data-testid={`button-toggle-${node.id}`}
                            >
                              {hasChildren(node) ? (
                                expandedNodes.has(node.id) ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )
                              ) : (
                                <span className="w-4" />
                              )}
                            </Button>
                            <span className="font-mono text-sm">{node.code}</span>
                            <span>{node.nameEnglish}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {node.type === "chapter" && (
                          <div className="flex items-center gap-2 pl-4">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => toggleNode(node.id)}
                              data-testid={`button-toggle-${node.id}`}
                            >
                              {hasChildren(node) ? (
                                expandedNodes.has(node.id) ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )
                              ) : (
                                <span className="w-4" />
                              )}
                            </Button>
                            <span className="font-mono text-sm">{node.code}</span>
                            <span>{node.nameEnglish}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {node.type === "activity" && (
                          <div className="flex items-center gap-2 pl-8">
                            <span className="font-mono text-sm">{node.code}</span>
                            <span>{node.nameEnglish}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {node.type === "division" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openCreateChapterDialog(node.id)}
                              title="Add Chapter"
                              data-testid={`button-add-chapter-${node.id}`}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                          {node.type === "chapter" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openCreateActivityDialog(node.id)}
                                title="Add Activity"
                                data-testid={`button-add-activity-${node.id}`}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const chapter = chapters.find(c => c.id === node.id);
                                  if (chapter) openEditChapterDialog(chapter);
                                }}
                                data-testid={`button-edit-chapter-${node.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteChapterId(node.id)}
                                data-testid={`button-delete-chapter-${node.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {node.type === "activity" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const activity = activities.find(a => a.id === node.id);
                                  if (activity) openEditActivityDialog(activity);
                                }}
                                data-testid={`button-edit-activity-${node.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteActivityId(node.id)}
                                data-testid={`button-delete-activity-${node.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="chapter" className="mt-4">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="font-medium text-lg">Chapters</h2>
                <p className="text-muted-foreground text-sm">Import/Export chapters. To add manually, use the Division tab.</p>
              </div>
              <ExcelImportExport
                data={chaptersWithDivisionCode}
                columns={chapterColumns}
                entityName="Work List Chapters"
                onImport={handleImportChapters}
                isImporting={isImporting}
              />
            </div>
            {chaptersLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : chapters.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No chapters found. Import from Excel or add via the Division tab.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Division</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>English Name</TableHead>
                    <TableHead dir="rtl">Arabic Name</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chaptersWithDivisionCode.map((chapter, index) => (
                    <TableRow key={chapter.id}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell className="font-mono">{chapter.divisionCode}</TableCell>
                      <TableCell className="font-mono">{chapter.code}</TableCell>
                      <TableCell>{chapter.nameEnglish}</TableCell>
                      <TableCell dir="rtl">{chapter.nameArabic}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="font-medium text-lg">Activities</h2>
                <p className="text-muted-foreground text-sm">Import/Export activities. To add manually, use the Division tab.</p>
              </div>
              <ExcelImportExport
                data={activitiesWithChapterCode}
                columns={activityColumns}
                entityName="Work List Activities"
                onImport={handleImportActivities}
                isImporting={isImporting}
              />
            </div>
            {activitiesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No activities found. Import from Excel or add via the Division tab.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Chapter</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>English Name</TableHead>
                    <TableHead dir="rtl">Arabic Name</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activitiesWithChapterCode.map((activity, index) => (
                    <TableRow key={activity.id}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell className="font-mono">{activity.chapterCode}</TableCell>
                      <TableCell className="font-mono">{activity.code}</TableCell>
                      <TableCell>{activity.nameEnglish}</TableCell>
                      <TableCell dir="rtl">{activity.nameArabic}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isRequestTypeDialogOpen} onOpenChange={setIsRequestTypeDialogOpen}>
        <DialogContent className="rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>{editingRequestType ? "Edit Request Type" : "Add New Request Type"}</DialogTitle>
          </DialogHeader>
          <Form {...requestTypeForm}>
            <form onSubmit={requestTypeForm.handleSubmit(onRequestTypeSubmit)} className="space-y-4">
              <FormField
                control={requestTypeForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., WIR" {...field} data-testid="input-request-type-code" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={requestTypeForm.control}
                name="name_english"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>English Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Work Inspection Request" {...field} data-testid="input-request-type-name-en" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={requestTypeForm.control}
                name="name_arabic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Arabic Name</FormLabel>
                    <FormControl>
                      <Input placeholder="طلب إستلام أعمال" dir="rtl" {...field} data-testid="input-request-type-name-ar" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={requestTypeForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional description" {...field} value={field.value || ""} data-testid="input-request-type-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={requestTypeForm.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0 pt-2">
                    <FormControl>
                      <input type="checkbox" checked={field.value} onChange={field.onChange} data-testid="checkbox-request-type-active" />
                    </FormControl>
                    <FormLabel>Active (نشط)</FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsRequestTypeDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createRequestTypeMutation.isPending || updateRequestTypeMutation.isPending} data-testid="button-submit-request-type">
                  {(createRequestTypeMutation.isPending || updateRequestTypeMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingRequestType ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteRequestTypeId} onOpenChange={() => setDeleteRequestTypeId(null)}>
        <AlertDialogContent className="rounded-[1.5rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Request Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this request type? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteRequestTypeId && deleteRequestTypeMutation.mutate(deleteRequestTypeId)}
              data-testid="button-confirm-delete-request-type"
            >
              {deleteRequestTypeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isChapterDialogOpen} onOpenChange={setIsChapterDialogOpen}>
        <DialogContent className="rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>{editingChapter ? "Edit Chapter" : "Add New Chapter"}</DialogTitle>
          </DialogHeader>
          <Form {...chapterForm}>
            <form onSubmit={chapterForm.handleSubmit(onChapterSubmit)} className="space-y-4">
              <FormField
                control={chapterForm.control}
                name="divisionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Division</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled>
                      <FormControl>
                        <SelectTrigger data-testid="select-chapter-division">
                          <SelectValue placeholder="Select division" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {divisions.map(div => (
                          <SelectItem key={div.id} value={div.id}>
                            {div.code} - {div.nameEnglish}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={chapterForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 01" {...field} data-testid="input-chapter-code" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={chapterForm.control}
                name="nameEnglish"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>English Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Chapter name" {...field} data-testid="input-chapter-name-english" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={chapterForm.control}
                name="nameArabic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Arabic Name</FormLabel>
                    <FormControl>
                      <Input placeholder="اسم الفصل" dir="rtl" {...field} data-testid="input-chapter-name-arabic" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsChapterDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isChapterPending} data-testid="button-submit-chapter">
                  {isChapterPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingChapter ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isActivityDialogOpen} onOpenChange={setIsActivityDialogOpen}>
        <DialogContent className="rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>{editingActivity ? "Edit Activity" : "Add New Activity"}</DialogTitle>
          </DialogHeader>
          <Form {...activityForm}>
            <form onSubmit={activityForm.handleSubmit(onActivitySubmit)} className="space-y-4">
              <FormField
                control={activityForm.control}
                name="chapterId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chapter</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled>
                      <FormControl>
                        <SelectTrigger data-testid="select-activity-chapter">
                          <SelectValue placeholder="Select chapter" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {chapters.map(chap => (
                          <SelectItem key={chap.id} value={chap.id}>
                            {chap.code} - {chap.nameEnglish}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={activityForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 01-001" {...field} data-testid="input-activity-code" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={activityForm.control}
                name="nameEnglish"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>English Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Activity name" {...field} data-testid="input-activity-name-english" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={activityForm.control}
                name="nameArabic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Arabic Name</FormLabel>
                    <FormControl>
                      <Input placeholder="اسم النشاط" dir="rtl" {...field} data-testid="input-activity-name-arabic" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsActivityDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isActivityPending} data-testid="button-submit-activity">
                  {isActivityPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingActivity ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteChapterId} onOpenChange={() => setDeleteChapterId(null)}>
        <AlertDialogContent className="rounded-[1.5rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chapter</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chapter? All activities under this chapter will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteChapterId && deleteChapterMutation.mutate(deleteChapterId)}
              data-testid="button-confirm-delete-chapter"
            >
              {deleteChapterMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteActivityId} onOpenChange={() => setDeleteActivityId(null)}>
        <AlertDialogContent className="rounded-[1.5rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Activity</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this activity? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteActivityId && deleteActivityMutation.mutate(deleteActivityId)}
              data-testid="button-confirm-delete-activity"
            >
              {deleteActivityMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
