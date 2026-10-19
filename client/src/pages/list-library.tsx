import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Search, Briefcase, Target } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { ExcelImportExport } from "@/components/excel-import-export";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  insertPositionSchema, type Position, type InsertPosition,
  insertPurposeSchema, type Purpose, type InsertPurpose
} from "@shared/schema";

function PurposeFormDialog({
  purpose,
  trigger,
  open,
  onOpenChange,
}: {
  purpose?: Purpose;
  trigger: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? (onOpenChange || (() => {})) : setInternalOpen;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<InsertPurpose>({
    resolver: zodResolver(insertPurposeSchema),
    defaultValues: purpose ? {
      code: purpose.code,
      nameEnglish: purpose.nameEnglish,
      nameArabic: purpose.nameArabic,
      description: purpose.description || "",
      sortOrder: purpose.sortOrder,
    } : {
      code: "",
      nameEnglish: "",
      nameArabic: "",
      description: "",
      sortOrder: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertPurpose) => {
      return await apiRequest("POST", "/api/purposes", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purposes"] });
      toast({ title: "Success", description: "Purpose created successfully" });
      setIsOpen(false);
      reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: InsertPurpose) => {
      return await apiRequest("PATCH", `/api/purposes/${purpose?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purposes"] });
      toast({ title: "Success", description: "Purpose updated successfully" });
      setIsOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = async (data: InsertPurpose) => {
    if (purpose) {
      await updateMutation.mutateAsync(data);
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{purpose ? "Edit Purpose" : "Add Purpose"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Code *</Label>
            <Input
              id="code"
              {...register("code")}
              placeholder="PM"
              data-testid="input-purpose-code"
            />
            {errors.code && (
              <p className="text-sm text-destructive">{errors.code.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="nameEnglish">Name (English) *</Label>
            <Input
              id="nameEnglish"
              {...register("nameEnglish")}
              placeholder="Project Management"
              data-testid="input-purpose-name-english"
            />
            {errors.nameEnglish && (
              <p className="text-sm text-destructive">{errors.nameEnglish.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="nameArabic">Name (Arabic) *</Label>
            <Input
              id="nameArabic"
              {...register("nameArabic")}
              placeholder="إدارة المشروع"
              dir="rtl"
              data-testid="input-purpose-name-arabic"
            />
            {errors.nameArabic && (
              <p className="text-sm text-destructive">{errors.nameArabic.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="Purpose description..."
              data-testid="input-purpose-description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sortOrder">Sort Order</Label>
            <Input
              id="sortOrder"
              type="number"
              {...register("sortOrder", { valueAsNumber: true })}
              placeholder="0"
              data-testid="input-purpose-sort-order"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              data-testid="button-cancel-purpose"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} data-testid="button-submit-purpose">
              {isSubmitting ? "Saving..." : purpose ? "Update" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PurposesTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [purposeToDelete, setPurposeToDelete] = useState<Purpose | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const { data: purposes = [], isLoading } = useQuery<Purpose[]>({
    queryKey: ["/api/purposes"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/purposes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purposes"] });
      toast({ title: "Success", description: "Purpose deleted successfully" });
      setDeleteConfirmOpen(false);
      setPurposeToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleImport = async (data: Record<string, unknown>[]) => {
    setIsImporting(true);
    const errors: string[] = [];
    let successCount = 0;
    
    try {
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        try {
          await apiRequest("POST", "/api/purposes", {
            code: String(item.code || ""),
            nameEnglish: String(item.nameEnglish || ""),
            nameArabic: String(item.nameArabic || ""),
            description: item.description ? String(item.description) : "",
            sortOrder: item.sortOrder ? Number(item.sortOrder) : 0,
          });
          successCount++;
        } catch (error) {
          errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/purposes"] });
      
      if (errors.length > 0) {
        throw new Error(`${successCount} imported, ${errors.length} failed:\n${errors.slice(0, 3).join("\n")}${errors.length > 3 ? `\n...and ${errors.length - 3} more` : ""}`);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const purposeColumns = [
    { key: "code", header: "Code", required: true },
    { key: "nameEnglish", header: "Name (English)", required: true },
    { key: "nameArabic", header: "Name (Arabic)", required: true },
    { key: "description", header: "Description", required: false },
    { key: "sortOrder", header: "Sort Order", required: false },
  ];

  const filteredPurposes = purposes.filter(
    (p) =>
      p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.nameEnglish.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.nameArabic.includes(searchQuery)
  );

  const handleDeleteClick = (purpose: Purpose) => {
    setPurposeToDelete(purpose);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (purposeToDelete) {
      await deleteMutation.mutateAsync(purposeToDelete.id);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search purposes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-purposes"
          />
        </div>
        <div className="flex items-center gap-2">
          <ExcelImportExport
            data={purposes}
            columns={purposeColumns}
            entityName="Purposes"
            onImport={handleImport}
            isImporting={isImporting}
          />
          <PurposeFormDialog
            trigger={
              <Button data-testid="button-add-purpose">
                <Plus className="w-4 h-4 mr-2" />
                Add Purpose
              </Button>
            }
          />
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name (English)</TableHead>
              <TableHead>Name (Arabic)</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-center">Sort Order</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPurposes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No purposes found. Add your first purpose.
                </TableCell>
              </TableRow>
            ) : (
              filteredPurposes.map((purpose) => (
                <TableRow key={purpose.id} data-testid={`row-purpose-${purpose.id}`}>
                  <TableCell className="font-medium">{purpose.code}</TableCell>
                  <TableCell>{purpose.nameEnglish}</TableCell>
                  <TableCell dir="rtl">{purpose.nameArabic}</TableCell>
                  <TableCell className="text-muted-foreground">{purpose.description || "-"}</TableCell>
                  <TableCell className="text-center">{purpose.sortOrder}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <PurposeFormDialog
                        purpose={purpose}
                        trigger={
                          <Button size="icon" variant="ghost" data-testid={`button-edit-purpose-${purpose.id}`}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        }
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteClick(purpose)}
                        data-testid={`button-delete-purpose-${purpose.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purpose</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{purposeToDelete?.nameEnglish}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-purpose">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-purpose"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PositionFormDialog({
  position,
  trigger,
  open,
  onOpenChange,
}: {
  position?: Position;
  trigger: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? (onOpenChange || (() => {})) : setInternalOpen;

  const { data: purposes = [] } = useQuery<Purpose[]>({
    queryKey: ["/api/purposes"],
  });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<InsertPosition>({
    resolver: zodResolver(insertPositionSchema),
    defaultValues: position || {
      numericId: undefined,
      titleEnglish: "",
      titleArabic: "",
      purposeId: null,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertPosition) => {
      return await apiRequest("POST", "/api/positions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      toast({ title: "Success", description: "Position created successfully" });
      setIsOpen(false);
      reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: InsertPosition) => {
      return await apiRequest("PATCH", `/api/positions/${position?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      toast({ title: "Success", description: "Position updated successfully" });
      setIsOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = async (data: InsertPosition) => {
    if (position) {
      await updateMutation.mutateAsync(data);
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{position ? "Edit Position" : "Add Position"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="numericId">ID *</Label>
            <Input
              id="numericId"
              type="number"
              {...register("numericId", { valueAsNumber: true })}
              placeholder="1"
              data-testid="input-numeric-id"
            />
            {errors.numericId && (
              <p className="text-sm text-destructive">{errors.numericId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="titleEnglish">Title (English) *</Label>
            <Input
              id="titleEnglish"
              {...register("titleEnglish")}
              placeholder="Project Manager"
              data-testid="input-title-english"
            />
            {errors.titleEnglish && (
              <p className="text-sm text-destructive">{errors.titleEnglish.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="titleArabic">Title (Arabic) *</Label>
            <Input
              id="titleArabic"
              {...register("titleArabic")}
              placeholder="مدير مشروع"
              dir="rtl"
              data-testid="input-title-arabic"
            />
            {errors.titleArabic && (
              <p className="text-sm text-destructive">{errors.titleArabic.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="purposeId">Purpose</Label>
            <Controller
              name="purposeId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value || "none"}
                  onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                >
                  <SelectTrigger data-testid="select-purpose">
                    <SelectValue placeholder="Select purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Purpose</SelectItem>
                    {purposes.map((purpose) => (
                      <SelectItem key={purpose.id} value={purpose.id}>
                        {purpose.code} - {purpose.nameEnglish}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} data-testid="button-submit">
              {isSubmitting ? "Saving..." : position ? "Update" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PositionsTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [positionToDelete, setPositionToDelete] = useState<Position | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const { data: positions = [], isLoading } = useQuery<Position[]>({
    queryKey: ["/api/positions"],
  });

  const { data: purposes = [] } = useQuery<Purpose[]>({
    queryKey: ["/api/purposes"],
  });

  const purposeMap = new Map(purposes.map((p) => [p.id, p]));

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/positions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      toast({ title: "Success", description: "Position deleted successfully" });
      setDeleteConfirmOpen(false);
      setPositionToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleImport = async (data: Record<string, unknown>[]) => {
    setIsImporting(true);
    const errors: string[] = [];
    let successCount = 0;
    
    try {
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        try {
          await apiRequest("POST", "/api/positions", {
            numericId: item.numericId ? Number(item.numericId) : undefined,
            titleEnglish: String(item.titleEnglish),
            titleArabic: String(item.titleArabic),
            purposeId: item.purposeId ? String(item.purposeId) : null,
          });
          successCount++;
        } catch (error) {
          errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      
      if (errors.length > 0) {
        throw new Error(`${successCount} imported, ${errors.length} failed:\n${errors.slice(0, 3).join("\n")}${errors.length > 3 ? `\n...and ${errors.length - 3} more` : ""}`);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const positionColumns = [
    { key: "numericId", header: "ID", required: true },
    { key: "titleEnglish", header: "Title (English)", required: true },
    { key: "titleArabic", header: "Title (Arabic)", required: true },
    { key: "purposeId", header: "Purpose ID", required: false },
  ];

  const filteredPositions = positions.filter(
    (pos) =>
      pos.titleEnglish.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pos.titleArabic.includes(searchQuery)
  );

  const handleDeleteClick = (position: Position) => {
    setPositionToDelete(position);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (positionToDelete) {
      await deleteMutation.mutateAsync(positionToDelete.id);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search positions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-positions"
          />
        </div>
        <div className="flex items-center gap-2">
          <ExcelImportExport
            data={positions}
            columns={positionColumns}
            entityName="Positions"
            onImport={handleImport}
            isImporting={isImporting}
          />
          <PositionFormDialog
            trigger={
              <Button data-testid="button-add-position">
                <Plus className="w-4 h-4 mr-2" />
                Add Position
              </Button>
            }
          />
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center">ID</TableHead>
              <TableHead>Title (English)</TableHead>
              <TableHead>Title (Arabic)</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPositions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No positions found. Add your first position.
                </TableCell>
              </TableRow>
            ) : (
              filteredPositions.map((position) => {
                const purpose = position.purposeId ? purposeMap.get(position.purposeId) : null;
                return (
                  <TableRow key={position.id} data-testid={`row-position-${position.id}`}>
                    <TableCell className="text-center text-muted-foreground">{position.numericId}</TableCell>
                    <TableCell className="font-medium">{position.titleEnglish}</TableCell>
                    <TableCell dir="rtl">{position.titleArabic}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {purpose ? `${purpose.code} - ${purpose.nameEnglish}` : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <PositionFormDialog
                          position={position}
                          trigger={
                            <Button size="icon" variant="ghost" data-testid={`button-edit-position-${position.id}`}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          }
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteClick(position)}
                          data-testid={`button-delete-position-${position.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Position</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{positionToDelete?.titleEnglish}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
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
    </div>
  );
}

export default function ListLibraryPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">List Library</h1>
          <p className="text-muted-foreground">Manage purposes, positions and other list items</p>
        </div>
      </div>

      <Tabs defaultValue="purposes">
        <TabsList>
          <TabsTrigger value="purposes" className="gap-2" data-testid="tab-purposes">
            <Target className="w-4 h-4" />
            Purposes
          </TabsTrigger>
          <TabsTrigger value="positions" className="gap-2" data-testid="tab-positions">
            <Briefcase className="w-4 h-4" />
            Positions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="purposes" className="mt-6">
          <PurposesTab />
        </TabsContent>

        <TabsContent value="positions" className="mt-6">
          <PositionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
