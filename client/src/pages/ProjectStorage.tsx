import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Project, type Document, type ProjectFolder } from "@shared/schema";
import { ProjectStorageModal } from "@/components/ProjectStorageModal";
import { Folder, File, ChevronRight, Search, LayoutGrid, List, Check, Link2, Filter, Plus, Upload, MoreVertical, Trash2, Edit2, Move, LayoutDashboard, ArrowLeft, Download, Loader2, X } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn, formatFileSize } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DocumentMetadataDialog } from "@/components/DocumentMetadataDialog";
import { FolderMoveDialog } from "@/components/FolderMoveDialog";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

export default function ProjectStorage() {
  const { projectId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const getFileUrl = (url?: string) => {
    if (!url) return "";
    if (url.startsWith('http') || url.startsWith('/')) return url;
    if (url.includes('/') || url.includes('.')) return `/${url}`;
    return url;
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isMetadataDialogOpen, setIsMetadataDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingItem, setEditingItem] = useState<Document | ProjectFolder | null>(null);
  const [editingItemName, setEditingItemName] = useState("");
  const [movingItem, setMovingItem] = useState<Document | ProjectFolder | null>(null);
  const [movingItems, setMovingItems] = useState<(Document | ProjectFolder)[]>([]);
  const [deletingItem, setDeletingItem] = useState<Document | ProjectFolder | null>(null);
  const [deletingItems, setDeletingItems] = useState<(Document | ProjectFolder)[]>([]);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: project } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
  });

  const { data: storageData, isLoading } = useQuery<{ folders: ProjectFolder[], documents: Document[] }>({
    queryKey: [`/api/projects/${projectId}/storage`],
  });

  const canManageStorage = useMemo(() => {
    if (!user || !project) return false;

    // Super Admin or Admin role
    if (user.role === 'super_admin' || user.isAdmin) return true;

    // Position check (case-insensitive for broad matching)
    // Common positions: Project Manager, Document Controller
    const isSpecialistRole = user.positions?.some(p => {
      const pos = p.toLowerCase();
      return pos.includes('project manager') ||
        pos.includes('document controller') ||
        pos.includes('مدير المشروع') ||
        pos.includes('مراقب المستندات');
    });

    // Per user request: Contractors can access but only PM, DC, and Super Admin can manage.
    // We already checked Super Admin above. Now check PM/DC roles.
    // This applies to everyone: if you are not a PM/DC or Super Admin, you are view-only.
    return !!isSpecialistRole;
  }, [user, project]);

  const canDeleteItems = useMemo(() => {
    return user?.role === 'super_admin';
  }, [user]);

  const isConsultant = useMemo(() => {
    if (!user || user.role === 'super_admin' || user.isAdmin) return false;
    return project?.consultantId === user?.organizationId;
  }, [user, project]);

  // Handle unauthorized access (Consultants are blocked)
  if (isConsultant && !isLoading) {
    navigate(`/projects/${projectId}`);
    return null;
  }

  const folders = storageData?.folders || [];
  const documents = storageData?.documents || [];

  const currentFolder = folders.find(f => f.id === currentFolderId);

  const breadcrumbs = useMemo(() => {
    const list: ProjectFolder[] = [];
    let currentId = currentFolderId;
    while (currentId) {
      const f = folders.find(folder => folder.id === currentId);
      if (f) {
        list.unshift(f);
        currentId = f.parentId;
      } else {
        break;
      }
    }
    return list;
  }, [folders, currentFolderId]);

  const filteredFolders = useMemo(() => folders
    .filter(f => (f.parentId || null) === (currentFolderId || null))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [folders, currentFolderId]);

  const filteredDocs = useMemo(() => documents.filter(d =>
    (d.folderId || null) === (currentFolderId || null) &&
    (d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.fileName && d.fileName.toLowerCase().includes(searchQuery.toLowerCase())))
  ).sort((a, b) => {
    const dateA = a.uploadDate ? new Date(a.uploadDate).getTime() : 0;
    const dateB = b.uploadDate ? new Date(b.uploadDate).getTime() : 0;
    return dateB - dateA;
  }), [documents, currentFolderId, searchQuery]);

  const combinedItems = useMemo(() => {
    const items = [
      ...filteredFolders.map(f => {
        const d = f.createdAt ? new Date(f.createdAt).getTime() : 0;
        return { ...f, type: 'folder' as const, sortDate: isNaN(d) ? 0 : d };
      }),
      ...filteredDocs.map(d => {
        const date = d.uploadDate ? new Date(d.uploadDate).getTime() : 0;
        return { ...d, type: 'document' as const, sortDate: isNaN(date) ? 0 : date };
      })
    ];
    return items.sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
      return b.sortDate - a.sortDate;
    });
  }, [filteredFolders, filteredDocs]);

  const { data: previewDocDetail, isLoading: previewDocLoading } = useQuery<Document>({
    queryKey: ["/api/documents", previewDoc?.id],
    enabled: !!previewDoc && !previewDoc.fileUrl,
  });

  const previewInfo = useMemo(() => {
    const doc = previewDocDetail || previewDoc;
    if (!doc) return null;
    const type = doc.type?.toLowerCase() || "";
    const name = (doc.fileName || doc.name || "").toLowerCase();
    const url = (doc.fileUrl || doc.fileData || "").toLowerCase();

    const isPDF = type.includes('pdf') || name.endsWith('.pdf');
    const isImage = type.includes('image') ||
      ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "jfif", "pjpeg", "pjp"].some(ext =>
        type === ext || type === `.${ext}` || name.endsWith(`.${ext}`) || url.includes(`.${ext}?`) || url.endsWith(`.${ext}`)
      );
    const isVideo = type.includes('video') ||
      ["mp4", "webm", "ogg"].some(ext =>
        type === ext || type === `.${ext}` || name.endsWith(`.${ext}`) || url.includes(`.${ext}?`) || url.endsWith(`.${ext}`)
      );

    return { isPDF, isImage, isVideo, doc };
  }, [previewDoc, previewDocDetail]);

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/project-folders`, {
        name,
        projectId,
        parentId: currentFolderId,
        createdBy: user?.id
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/storage`] });
      toast({ title: "Success", description: "Folder created successfully" });
      setIsFolderDialogOpen(false);
      setNewFolderName("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (item: Document | ProjectFolder) => {
      const isDoc = !("parentId" in (item as any));
      const url = isDoc ? `/api/documents/${item.id}` : `/api/project-folders/${item.id}`;
      await apiRequest("DELETE", url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/storage`] });
      toast({ title: "Success", description: "Item deleted successfully" });
      setDeletingItem(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const renameMutation = useMutation({
    mutationFn: async ({ item, name }: { item: Document | ProjectFolder, name: string }) => {
      const isDoc = !("parentId" in (item as any));
      const url = isDoc ? `/api/documents/${item.id}` : `/api/project-folders/${item.id}`;
      await apiRequest("PATCH", url, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/storage`] });
      toast({ title: "Success", description: "Item renamed successfully" });
      setEditingItem(null);
      setEditingItemName("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });


  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = () => {
    const foldersToMove = filteredFolders.filter(f => selectedIds.has(f.id));
    const docsToMove = filteredDocs.filter(d => selectedIds.has(d.id));
    const itemsToDelete = foldersToMove.concat(docsToMove as any[]);
    setDeletingItems(itemsToDelete);
  };

  const handleBulkMove = () => {
    const foldersToMove = filteredFolders.filter(f => selectedIds.has(f.id));
    const docsToMove = filteredDocs.filter(d => selectedIds.has(d.id));
    const itemsToMove = foldersToMove.concat(docsToMove as any[]);
    setMovingItems(itemsToMove);
  };

  const handleBulkDownload = async () => {
    const docsToDownload = filteredDocs.filter(d => selectedIds.has(d.id));
    if (docsToDownload.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select at least one file to download. Folders cannot be downloaded directly.",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Downloading...",
      description: `Preparing ${docsToDownload.length} files for direct download.`,
    });

    for (let i = 0; i < docsToDownload.length; i++) {
      let doc = docsToDownload[i];

      // If no URL and no data, we must fetch the full document details
      if (!doc.fileUrl && !doc.fileData) {
        try {
          const res = await apiRequest("GET", `/api/documents/${doc.id}`);
          if (res.ok) {
            doc = await res.json();
          }
        } catch (err) {
          console.error("Failed to fetch doc details for download:", err);
          continue;
        }
      }

      const fileSource = doc.fileUrl || doc.fileData;
      if (fileSource) {
        try {
          // Fetch the file to bypass browser tab-opening behavior for cross-origin URLs
          const response = await fetch(fileSource);
          if (!response.ok) throw new Error("Network response was not ok");
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);

          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = doc.fileName || doc.name || 'download';
          document.body.appendChild(a);
          a.click();

          setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }, 1000);
        } catch (error) {
          console.error(`Failed to download ${doc.fileName || doc.name} via Blob, falling back to basic link:`, error);
          // Fallback if CORS prevents fetching the blob
          const a = document.createElement('a');
          a.href = fileSource;
          a.download = doc.fileName || doc.name || 'download';
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }

        if (i < docsToDownload.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      const folderIds = filteredFolders.filter(f => selectedIds.has(f.id)).map(f => f.id);
      const documentIds = filteredDocs.filter(d => selectedIds.has(d.id)).map(d => d.id);

      await apiRequest("POST", "/api/project-storage/bulk-delete", { folderIds, documentIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/storage`] });
      setSelectedIds(new Set());
      setDeletingItems([]);
      toast({
        title: "Items deleted successfully",
        description: "The selected files and folders have been removed.",
      });
    }
  });

  const bulkMoveMutation = useMutation({
    mutationFn: async (targetFolderId: string | null) => {
      const folderIds = filteredFolders.filter(f => selectedIds.has(f.id)).map(f => f.id);
      const documentIds = filteredDocs.filter(d => selectedIds.has(d.id)).map(d => d.id);

      await apiRequest("POST", "/api/project-storage/bulk-move", {
        folderIds,
        documentIds,
        targetFolderId: targetFolderId === "root" ? null : targetFolderId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/storage`] });
      setSelectedIds(new Set());
      setMovingItems([]);
      toast({
        title: "Items moved successfully",
        description: "Selected items have been moved to the destination folder.",
      });
    }
  });

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Page Header */}
      <div className="px-8 py-6 flex items-center justify-between border-b bg-muted/10">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/projects/${projectId}`)}
              className="h-9 w-9 shrink-0 rounded-xl hover:bg-primary/10 hover:text-primary transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl font-bold font-display flex items-center gap-3">
              <div className="bg-primary p-2 rounded-xl text-primary-foreground shadow-lg shadow-primary/20">
                <Folder className="w-5 h-5" />
              </div>
              Project Storage
            </h1>
          </div>
          <p className="text-xs text-muted-foreground font-medium ml-12">
            Managing assets for <span className="text-primary font-bold">{project?.name || "Project"}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!canManageStorage && (
            <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-muted-foreground/20 rounded-lg px-3 py-1 font-bold text-[10px] items-center gap-2">
              View Only Mode
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFolderDialogOpen(true)}
            className="rounded-xl font-bold"
            disabled={!canManageStorage}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Folder
          </Button>
          <Button
            size="sm"
            onClick={() => setIsUploadDialogOpen(true)}
            className="rounded-xl font-bold shadow-lg shadow-primary/20"
            disabled={!canManageStorage}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Files
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Navigation / Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Breadcrumbs & Actions */}
          <div className="px-8 py-4 flex items-center justify-between bg-background border-b z-10 sticky top-0 shadow-sm">
            <div className="flex items-center gap-2 overflow-hidden min-w-0">
              <div className="flex items-center gap-2 mr-2">
                <Checkbox
                  checked={
                    (filteredFolders.length > 0 || filteredDocs.length > 0) &&
                    filteredFolders.every(f => selectedIds.has(f.id)) &&
                    filteredDocs.every(d => selectedIds.has(d.id))
                  }
                  onCheckedChange={(checked) => {
                    if (checked) {
                      const allIds = filteredFolders.map(f => f.id).concat(filteredDocs.map(d => d.id));
                      const newSelected = Array.from(selectedIds).concat(allIds);
                      setSelectedIds(new Set(newSelected));
                    } else {
                      const currentViewIds = new Set(
                        filteredFolders.map(f => f.id).concat(filteredDocs.map(d => d.id))
                      );
                      const remainingSelected = Array.from(selectedIds).filter(id => !currentViewIds.has(id));
                      setSelectedIds(new Set(remainingSelected));
                    }
                  }}
                  className="rounded-md h-5 w-5 border-muted-foreground/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary transition-all shadow-sm"
                />
              </div>
              <button
                onClick={() => setCurrentFolderId(null)}
                className={cn(
                  "text-sm font-bold transition-colors hover:text-primary whitespace-nowrap",
                  currentFolderId === null ? "text-primary bg-primary/5 px-2 py-1 rounded-md" : "text-muted-foreground"
                )}
              >
                Project Root
              </button>
              {breadcrumbs.map((f, i) => (
                <div key={f.id} className="flex items-center gap-2 min-w-0">
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />
                  <button
                    onClick={() => setCurrentFolderId(f.id)}
                    className={cn(
                      "text-sm font-bold transition-colors hover:text-primary truncate whitespace-nowrap",
                      currentFolderId === f.id ? "text-primary bg-primary/5 px-2 py-1 rounded-md" : "text-muted-foreground"
                    )}
                  >
                    {f.name}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-64 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  placeholder="Search storage..."
                  className="pl-9 h-9 border-muted/50 bg-muted/20 focus-visible:ring-primary focus-visible:bg-background transition-all rounded-xl text-[11px] font-medium"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1 px-8 py-6">
            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-x-6 gap-y-8">
                {combinedItems.map(item => (
                  item.type === 'folder' ? (
                    <Card
                      key={item.id}
                      className={cn(
                        "relative group cursor-pointer hover:shadow-lg transition-all border-none shadow-sm rounded-2xl overflow-hidden",
                        selectedIds.has(item.id) ? "ring-2 ring-primary bg-primary/5" : "bg-card/50"
                      )}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('.selection-area')) return;
                        if (selectedIds.size > 0) {
                          toggleSelect(item.id);
                          return;
                        }
                        setCurrentFolderId(item.id);
                      }}
                    >
                      <div className={cn(
                        "absolute top-2 left-2 z-10 transition-opacity selection-area",
                        selectedIds.size > 0 || selectedIds.has(item.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}>
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={() => toggleSelect(item.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded h-5 w-5 bg-background shadow-sm border-muted-foreground/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                      </div>
                      <div className="flex flex-col items-center gap-2 p-4">
                        <div className="w-full aspect-square bg-muted/20 hover:bg-primary/10 rounded-2xl border border-muted-foreground/10 hover:border-primary/20 flex items-center justify-center transition-all group-active:scale-95 shadow-sm hover:shadow-md hover:-translate-y-1">
                          {item.name === "Recycle Bin" ? (
                            <Trash2 className="w-14 h-14 text-destructive fill-destructive/10 group-hover:fill-destructive/20 transition-all" />
                          ) : (
                            <Folder className="w-14 h-14 text-primary fill-primary/10 group-hover:fill-primary/20 transition-all" />
                          )}
                        </div>
                        <span className="text-[11px] font-bold text-center truncate w-full px-2 text-foreground/80 group-hover:text-primary transition-colors">
                          {item.name}
                        </span>
                      </div>
                      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1 rounded-full bg-background/80 shadow-md hover:bg-muted scale-90" onClick={(e) => e.stopPropagation()}>
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-xl">
                            <DropdownMenuItem onClick={() => {
                              setEditingItem(item as any);
                              setEditingItemName(item.name);
                            }} className="font-bold py-2.5 px-3.5 rounded-lg text-xs" disabled={!canManageStorage}>
                              <Edit2 className="w-3.5 h-3.5 mr-2.5 text-primary" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setMovingItem(item as any)} className="font-bold py-2.5 px-3.5 rounded-lg text-xs text-muted-foreground" disabled={!canManageStorage}>
                              <Move className="w-3.5 h-3.5 mr-2.5 text-primary" />
                              Move to Folder
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setDeletingItem(item as any)} className="font-bold py-2.5 px-3.5 rounded-lg text-xs text-destructive hover:bg-destructive/10" disabled={!canDeleteItems}>
                              <Trash2 className="w-3.5 h-3.5 mr-2.5" />
                              Delete Folder
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Card>
                  ) : (
                    <Card
                      key={item.id}
                      className={cn(
                        "relative flex flex-col items-center gap-3 p-4 group hover:shadow-lg transition-all border-none bg-card/50 shadow-sm rounded-3xl",
                        selectedIds.has(item.id) ? "ring-2 ring-primary bg-primary/5" : "bg-card/50"
                      )}
                    >
                      <div className={cn(
                        "absolute top-4 left-4 z-10 transition-opacity selection-area",
                        selectedIds.size > 0 || selectedIds.has(item.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}>
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={() => toggleSelect(item.id)}
                          className="rounded h-5 w-5 bg-background shadow-sm border-muted-foreground/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-all hover:bg-muted p-1 rounded-full bg-background/80 shadow-md scale-90">
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-xl">
                          <DropdownMenuItem onClick={() => {
                            setEditingItem(item as any);
                            setEditingItemName(item.name);
                          }} className="font-bold py-2.5 px-3.5 rounded-lg text-xs" disabled={!canManageStorage}>
                            <Edit2 className="w-3.5 h-3.5 mr-2.5 text-primary" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPreviewDoc(item as any)} className="font-bold py-2.5 px-3.5 rounded-lg text-xs">
                            <Search className="w-3.5 h-3.5 mr-2.5 text-primary" />
                            Preview
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setEditingItem(item as any);
                            setIsMetadataDialogOpen(true);
                          }} className="font-bold py-2.5 px-3.5 rounded-lg text-xs text-muted-foreground" disabled={!canManageStorage}>
                            <Filter className="w-3.5 h-3.5 mr-2.5 text-primary" />
                            Edit Tags & Category
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setMovingItem(item as any)} className="font-bold py-2.5 px-3.5 rounded-lg text-xs text-muted-foreground" disabled={!canManageStorage}>
                            <Move className="w-3.5 h-3.5 mr-2.5 text-primary" />
                            Move to Folder
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeletingItem(item as any)} className="font-bold py-2.5 px-3.5 rounded-lg text-xs text-destructive hover:bg-destructive/10" disabled={!canDeleteItems}>
                            <Trash2 className="w-3.5 h-3.5 mr-2.5" />
                            Delete File
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <div
                        onClick={() => {
                          if (selectedIds.size > 0) {
                            toggleSelect(item.id);
                            return;
                          }
                          setPreviewDoc(item as any);
                        }}
                        className="w-full aspect-square bg-muted/20 hover:bg-muted/40 rounded-2xl border border-muted-foreground/10 flex items-center justify-center transition-all group active:scale-95 shadow-sm hover:shadow-md hover:-translate-y-1 cursor-pointer"
                      >
                        <File className="w-12 h-12 text-muted-foreground/40 group-hover:text-primary transition-all" />
                      </div>
                      <div className="flex flex-col items-center w-full min-w-0">
                        <span
                          className="text-[11px] font-bold text-center truncate w-full px-2 text-foreground/80 group-hover:text-primary transition-colors cursor-pointer"
                          onClick={() => {
                            if (selectedIds.size > 0) {
                              toggleSelect(item.id);
                              return;
                            }
                            setPreviewDoc(item as any);
                          }}
                        >
                          {(item as any).fileName || item.name}
                        </span>
                        <div className="flex flex-wrap justify-center gap-1 mt-1">
                          <Badge variant="outline" className="text-[8px] py-0 px-1.5 h-3.5 font-extrabold tracking-tighter opacity-70 group-hover:opacity-100 uppercase bg-muted/50 border-transparent">
                            {(item as any).type}
                          </Badge>
                          <Badge variant="outline" className="text-[8px] py-0 px-1.5 h-3.5 font-bold tracking-tighter opacity-70 group-hover:opacity-100 bg-primary/5 text-primary border-primary/20">
                            {formatFileSize((item as any).size || (item as any).fileSize)}
                          </Badge>
                          {(item as any).tags?.slice(0, 2).map((tag: any) => (
                            <Badge key={tag} className="text-[8px] py-0 px-1.5 h-3.5 font-bold tracking-tighter opacity-50 group-hover:opacity-100">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </Card>
                  )
                ))}

                {combinedItems.length === 0 && (
                  <div className="col-span-full py-24 flex flex-col items-center justify-center opacity-40">
                    <div className="bg-muted p-10 rounded-full mb-6">
                      <Folder className="w-16 h-16 text-muted-foreground" />
                    </div>
                    <h3 className="font-display font-bold text-lg">No Items Found</h3>
                    <p className="text-sm font-medium">This folder is empty or matches no search terms</p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* New Folder Dialog */}
      <Dialog open={isFolderDialogOpen} onOpenChange={setIsFolderDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Create a subfolder in <span className="font-bold text-primary">{currentFolder?.name || "Project Root"}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="name" className="mb-2 block">Folder Name</Label>
            <Input
              id="name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Invoices, Site Photos..."
              className="rounded-xl h-12"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsFolderDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createFolderMutation.mutate(newFolderName)}
              disabled={!newFolderName || createFolderMutation.isPending}
              className="rounded-xl px-10 font-bold"
            >
              {createFolderMutation.isPending ? "Creating..." : "Create Folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog (Uses editingItem but simpler than Metadata editor for folders) */}
      <Dialog open={editingItem !== null && !isMetadataDialogOpen} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename {editingItem && "parentId" in (editingItem as any) ? "Folder" : "File"}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="rename-input" className="mb-2 block">New Name</Label>
            <Input
              id="rename-input"
              value={editingItemName}
              onChange={(e) => setEditingItemName(e.target.value)}
              className="rounded-xl h-12"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingItem(null)}>Cancel</Button>
            <Button
              onClick={() => renameMutation.mutate({ item: editingItem!, name: editingItemName || editingItem!.name })}
              disabled={renameMutation.isPending || !editingItemName}
              className="rounded-xl px-10 font-bold"
            >
              {renameMutation.isPending ? "Renaming..." : "Rename Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Metadata Dialog for Documents */}
      <DocumentMetadataDialog
        document={editingItem && !("parentId" in (editingItem as any)) ? editingItem as Document : null}
        isOpen={isMetadataDialogOpen}
        onClose={() => {
          setIsMetadataDialogOpen(false);
          setEditingItem(null);
        }}
      />

      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-6xl h-[95vh] rounded-[1.5rem] p-0 overflow-hidden border-none shadow-2xl flex flex-col bg-white dark:bg-background [&>button]:hidden">
          {/* Streamlined Premium Header */}
          <div className="flex items-center justify-between p-3 px-6 bg-card/50 backdrop-blur-md relative z-20 shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <File className="w-5 h-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-sm font-black uppercase tracking-tight truncate max-w-[300px] md:max-w-[500px]">
                  {previewDoc?.fileName || previewDoc?.name || "Document Preview"}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/50 px-2 py-0.5 rounded-full">
                    {previewDoc?.type || "Document"}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">
                    • {formatFileSize(previewDoc?.size || (previewDoc as any)?.fileSize)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {(previewDocDetail || (previewDoc && (previewDoc.fileUrl || previewDoc.fileData))) && (
                <Button variant="outline" size="sm" className="rounded-xl font-bold h-9 bg-background/50 border-primary/20 text-primary hover:bg-primary/5 hidden sm:flex" asChild>
                  <a href={getFileUrl((previewDocDetail?.fileUrl || previewDocDetail?.fileData) || (previewDoc?.fileUrl || previewDoc?.fileData))} target="_blank" rel="noopener noreferrer">
                    <Link2 className="w-4 h-4 mr-2" />
                    Open Original
                  </a>
                </Button>
              )}
              
              <button
                onClick={() => setPreviewDoc(null)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-muted/50 hover:bg-muted transition-all duration-300 text-muted-foreground hover:text-foreground group active:scale-90"
              >
                <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
              </button>
            </div>
          </div>

          {/* Maximized Preview Area */}
          <div className="flex-1 bg-muted/20 flex items-center justify-center overflow-hidden p-0">
            {(!previewDocDetail && !previewDoc?.fileUrl && !previewDoc?.fileData) ? (
              <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Loading preview...</p>
              </div>
            ) : previewInfo?.isImage ? (
              <div className="w-full h-full flex items-center justify-center overflow-auto custom-scrollbar p-2">
                <img
                  src={getFileUrl(previewInfo.doc.fileUrl || previewInfo.doc.fileData || "")}
                  alt={previewInfo.doc.name || previewInfo.doc.fileName || "Preview"}
                  className="max-w-full max-h-full object-contain shadow-2xl rounded-xl border border-border/50"
                />
              </div>
            ) : previewInfo?.isPDF ? (
              <iframe
                src={getFileUrl(previewInfo.doc.fileUrl || previewInfo.doc.fileData || "")}
                className="w-full h-full border-none bg-white block"
                title={previewInfo.doc.name || previewInfo.doc.fileName || "PDF Preview"}
              />
            ) : previewInfo?.isVideo ? (
              <video
                controls
                className="max-w-full max-h-full rounded-xl shadow-2xl border border-border/50"
              >
                <source src={getFileUrl(previewInfo.doc.fileUrl || previewInfo.doc.fileData || "")} />
                Your browser does not support the video tag.
              </video>
            ) : (
              <div className="text-center p-12 bg-background/50 backdrop-blur-sm rounded-[1.5rem] border border-dashed border-muted-foreground/20 max-w-md mx-auto">
                <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-6 ring-8 ring-primary/[0.02]">
                  <File className="w-10 h-10 text-primary/40" />
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight mb-2">No Preview Available</h3>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-6 leading-relaxed opacity-60">
                  This file type cannot be previewed directly. You can download it to view locally.
                </p>
                <Button className="rounded-xl font-bold px-8 shadow-lg shadow-primary/20" asChild>
                  <a href={previewInfo?.doc.fileUrl || previewInfo?.doc.fileData} download={previewInfo?.doc.fileName || previewInfo?.doc.name}>
                    Download File
                  </a>
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Move Dialog */}
      <FolderMoveDialog
        items={movingItem ? [movingItem] : movingItems}
        isOpen={!!movingItem || movingItems.length > 0}
        onClose={() => {
          setMovingItem(null);
          setMovingItems([]);
        }}
        onMove={async (targetFolderId) => {
          const itemsToMove = movingItem ? [movingItem] : movingItems;
          const folderIds = itemsToMove.filter(i => "parentId" in i).map(i => i.id);
          const documentIds = itemsToMove.filter(i => !("parentId" in i)).map(i => i.id);

          await apiRequest("POST", "/api/project-storage/bulk-move", {
            folderIds,
            documentIds,
            targetFolderId: targetFolderId === "root" ? null : targetFolderId
          });

          queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/storage`] });
          setSelectedIds(new Set());
          toast({
            title: "Items moved successfully",
            description: "The items have been moved to the destination folder.",
          });
        }}
        currentFolders={storageData?.folders || []}
      />

      <AlertDialog
        open={!!deletingItem || deletingItems.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingItem(null);
            setDeletingItems([]);
          }
        }}
      >
        <AlertDialogContent className="rounded-3xl border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold flex items-center gap-3 text-destructive">
              <div className="p-2 bg-destructive/10 rounded-xl">
                <Trash2 className="w-5 h-5" />
              </div>
              Confirm Deletion
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground font-medium py-3">
              {deletingItem ? (
                <>Are you sure you want to delete <span className="font-bold text-foreground">{(deletingItem as any).name || (deletingItem as any).fileName}</span>? This action cannot be undone.</>
              ) : (
                <>Are you sure you want to delete <span className="font-bold text-foreground">{deletingItems.length} selected items</span>? This action cannot be undone and will permanently remove all files and subfolders.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl font-bold border-muted-foreground/20">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingItem) deleteMutation.mutate(deletingItem);
                else if (deletingItems.length > 0) bulkDeleteMutation.mutate();
              }}
              className="bg-destructive hover:bg-destructive/90 rounded-xl font-bold px-8 shadow-lg shadow-destructive/20"
            >
              {bulkDeleteMutation.isPending || deleteMutation.isPending ? "Deleting..." : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="max-w-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Documents</DialogTitle>
            <DialogDescription>
              Select files to upload into <span className="font-bold text-primary">{currentFolder?.name || "Project Root"}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 min-h-[300px]">
            <ObjectUploader
              projectId={projectId!}
              folderId={currentFolderId}
              existingFileNames={documents.map((d: any) => d.fileName || d.name)}
              onDuplicateFile={(fileName) => {
                toast({
                  title: "Duplicate file",
                  description: `A file named "${fileName}" already exists in the project storage.`,
                  variant: "destructive"
                });
              }}
              onUploadComplete={() => {
                queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/storage`] });
                setIsUploadDialogOpen(false);
                toast({ title: "Success", description: "Files uploaded successfully" });
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
      {/* Floating Action Bar for Selection */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-background/95 backdrop-blur-md border border-primary/20 shadow-2xl rounded-2xl px-6 py-4 animate-in slide-in-from-bottom-8 duration-300">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Selection Control</span>
            <span className="text-sm font-black text-primary">{selectedIds.size} {selectedIds.size === 1 ? 'Item' : 'Items'} Selected</span>
          </div>
          <div className="w-px h-8 bg-muted-foreground/10 mx-2" />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleBulkDownload}
              className="h-10 rounded-xl font-bold bg-background hover:bg-primary/5 hover:text-primary border-muted-foreground/10 px-4 gap-2 transition-all active:scale-95"
            >
              <Download className="w-4 h-4" /> Download Selected
            </Button>
            {canManageStorage && (
              <>
                <Button
                  variant="outline"
                  onClick={handleBulkMove}
                  className="h-10 rounded-xl font-bold bg-background hover:bg-primary/5 hover:text-primary border-muted-foreground/10 px-4 gap-2 transition-all active:scale-95"
                >
                  <Move className="w-4 h-4" /> Move to...
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleBulkDelete}
                  className="h-10 rounded-xl font-bold px-4 gap-2 shadow-lg shadow-destructive/20 transition-all active:scale-95"
                  disabled={!canDeleteItems}
                >
                  <Trash2 className="w-4 h-4" /> Delete Selected
                </Button>
              </>
            )}
            <div className="w-px h-8 bg-muted-foreground/10 mx-2" />
            <Button
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              className="h-10 rounded-xl font-bold text-muted-foreground hover:bg-muted px-4 transition-all"
            >
              Deselect All
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
