import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { 
  insertChecklistItemSchema, 
  type ChecklistItem, 
  type InsertChecklistItem 
} from "@shared/schema";
import { ExcelImportExport } from "@/components/excel-import-export";
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
import { z } from "zod";

type ChecklistCategory = "main" | "sbc" | "recommendations";

const categoryLabels: Record<ChecklistCategory, { english: string; arabic: string }> = {
  main: { english: "Main", arabic: "الرئيسية" },
  sbc: { english: "Saudi Building Codes", arabic: "كود البناء السعودي" },
  recommendations: { english: "Recommendations", arabic: "التوصيات" },
};

export default function ChecklistPage() {
  const [activeCategory, setActiveCategory] = useState<ChecklistCategory>("main");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  
  const { toast } = useToast();

  const { data: allItems = [], isLoading } = useQuery<ChecklistItem[]>({
    queryKey: ["/api/checklist-items"],
  });

  const mainItems = allItems.filter(item => item.category === "main");
  const sbcItems = allItems.filter(item => item.category === "sbc");
  const recommendationsItems = allItems.filter(item => item.category === "recommendations");

  const getCurrentItems = () => {
    switch (activeCategory) {
      case "main": return mainItems;
      case "sbc": return sbcItems;
      case "recommendations": return recommendationsItems;
    }
  };

  const formSchema = insertChecklistItemSchema.extend({
    category: z.enum(["main", "sbc", "recommendations"]),
  });

  const form = useForm<InsertChecklistItem>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category: activeCategory,
      code: "",
      nameEnglish: "",
      nameArabic: "",
      description: "",
      sortOrder: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertChecklistItem) => apiRequest("POST", "/api/checklist-items", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-items"] });
      toast({ title: "Item created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertChecklistItem> }) =>
      apiRequest("PATCH", `/api/checklist-items/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-items"] });
      toast({ title: "Item updated successfully" });
      setIsDialogOpen(false);
      setEditingItem(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/checklist-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-items"] });
      toast({ title: "Item deleted successfully" });
      setDeleteItemId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openCreateDialog = () => {
    setEditingItem(null);
    const currentItems = getCurrentItems();
    const maxSortOrder = currentItems.reduce((max, item) => Math.max(max, item.sortOrder), 0);
    form.reset({
      category: activeCategory,
      code: "",
      nameEnglish: "",
      nameArabic: "",
      description: "",
      sortOrder: maxSortOrder + 1,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (item: ChecklistItem) => {
    setEditingItem(item);
    form.reset({
      category: item.category as ChecklistCategory,
      code: item.code,
      nameEnglish: item.nameEnglish,
      nameArabic: item.nameArabic,
      description: item.description || "",
      sortOrder: item.sortOrder,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: InsertChecklistItem) => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const checklistColumns = [
    { key: "code", header: "Code", required: true },
    { key: "nameEnglish", header: "Name (English)", required: true },
    { key: "nameArabic", header: "Name (Arabic)", required: true },
    { key: "description", header: "Description", required: false },
    { key: "sortOrder", header: "Sort Order", required: false },
  ];

  const handleImport = async (data: Record<string, unknown>[]) => {
    setIsImporting(true);
    const errors: string[] = [];
    let successCount = 0;
    
    try {
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        try {
          await apiRequest("POST", "/api/checklist-items", {
            category: activeCategory,
            code: String(item.code),
            nameEnglish: String(item.nameEnglish),
            nameArabic: String(item.nameArabic),
            description: item.description ? String(item.description) : "",
            sortOrder: item.sortOrder ? Number(item.sortOrder) : 0,
          });
          successCount++;
        } catch (error) {
          errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-items"] });
      
      if (errors.length > 0) {
        throw new Error(`${successCount} imported, ${errors.length} failed:\n${errors.slice(0, 3).join("\n")}${errors.length > 3 ? `\n...and ${errors.length - 3} more` : ""}`);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const renderTable = (items: ChecklistItem[]) => {
    if (isLoading) {
      return (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          No items found. Add your first item to get started.
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead className="w-24">Code</TableHead>
            <TableHead>English Name</TableHead>
            <TableHead dir="rtl">Arabic Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-24 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow key={item.id} data-testid={`row-checklist-${item.id}`}>
              <TableCell className="font-medium">{index + 1}</TableCell>
              <TableCell className="font-mono">{item.code}</TableCell>
              <TableCell>{item.nameEnglish}</TableCell>
              <TableCell dir="rtl">{item.nameArabic}</TableCell>
              <TableCell className="max-w-xs truncate">{item.description}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(item)}
                    data-testid={`button-edit-checklist-${item.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteItemId(item.id)}
                    data-testid={`button-delete-checklist-${item.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-display font-bold">Checklist</h1>
      
      <Tabs 
        defaultValue="main" 
        className="w-full"
        onValueChange={(value) => setActiveCategory(value as ChecklistCategory)}
      >
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="main" data-testid="tab-main">
            Main ({mainItems.length})
          </TabsTrigger>
          <TabsTrigger value="sbc" data-testid="tab-sbc">
            Saudi Building Codes ({sbcItems.length})
          </TabsTrigger>
          <TabsTrigger value="recommendations" data-testid="tab-recommendations">
            Recommendations ({recommendationsItems.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="main" className="mt-4">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-medium text-lg">{categoryLabels.main.english}</h2>
              <div className="flex items-center gap-2">
                <ExcelImportExport
                  data={mainItems}
                  columns={checklistColumns}
                  entityName="Main Checklist"
                  onImport={handleImport}
                  isImporting={isImporting}
                />
                <Button onClick={openCreateDialog} data-testid="button-add-main">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </div>
            {renderTable(mainItems)}
          </Card>
        </TabsContent>

        <TabsContent value="sbc" className="mt-4">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-medium text-lg">{categoryLabels.sbc.english}</h2>
              <div className="flex items-center gap-2">
                <ExcelImportExport
                  data={sbcItems}
                  columns={checklistColumns}
                  entityName="SBC Checklist"
                  onImport={handleImport}
                  isImporting={isImporting}
                />
                <Button onClick={openCreateDialog} data-testid="button-add-sbc">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </div>
            {renderTable(sbcItems)}
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="mt-4">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-medium text-lg">{categoryLabels.recommendations.english}</h2>
              <div className="flex items-center gap-2">
                <ExcelImportExport
                  data={recommendationsItems}
                  columns={checklistColumns}
                  entityName="Recommendations Checklist"
                  onImport={handleImport}
                  isImporting={isImporting}
                />
                <Button onClick={openCreateDialog} data-testid="button-add-recommendations">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </div>
            {renderTable(recommendationsItems)}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Edit Item" : `Add New Item - ${categoryLabels[activeCategory].english}`}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., CHK-001" {...field} data-testid="input-checklist-code" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nameEnglish"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>English Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Item name in English" {...field} data-testid="input-checklist-name-english" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nameArabic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Arabic Name</FormLabel>
                    <FormControl>
                      <Input placeholder="اسم العنصر بالعربية" dir="rtl" {...field} data-testid="input-checklist-name-arabic" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Additional details about this checklist item" 
                        className="resize-none"
                        {...field} 
                        data-testid="input-checklist-description" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending} data-testid="button-submit-checklist">
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingItem ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItemId} onOpenChange={() => setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this checklist item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItemId && deleteMutation.mutate(deleteItemId)}
              data-testid="button-confirm-delete-checklist"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
