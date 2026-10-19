import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { Folder, File, ChevronRight, Search, LayoutGrid, List, Check, Link2, Filter, FileText, ChevronDown, ExternalLink, Upload, Trash2, ChevronsUpDown } from "lucide-react";
import { useLocation } from "wouter";
import { type ProjectFolder, type Document } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { cn, formatFileSize } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ObjectUploader } from "@/components/ObjectUploader";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ProjectStorageModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selections: { document: Document, title: string }[]) => void;
  multiSelect?: boolean;
  suggestions?: string[];
  skipLabels?: boolean;
}

export function ProjectStorageModal({ 
  projectId, 
  isOpen, 
  onClose, 
  onSelect, 
  multiSelect = false, 
  suggestions = [],
  skipLabels = false
}: ProjectStorageModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [docTitles, setDocTitles] = useState<Record<string, string>>({});
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);

  const { data: storageData, isLoading } = useQuery<{ folders: ProjectFolder[], documents: Document[] }>({
    queryKey: [`/api/projects/${projectId}/storage`],
    enabled: isOpen,
  });

  const folders = storageData?.folders || [];
  const allDocuments = storageData?.documents || [];

  // Categorize documents for filtering
  const categories = useMemo(() => {
    const cats = new Set(allDocuments.map(d => d.category));
    const sorted = Array.from(cats).sort();
    return ["all", ...sorted].filter(Boolean);
  }, [allDocuments]);

  // Derived state: Documents in current folder (or all if searching)
  const filteredDocs = useMemo(() => {
    let docs = allDocuments;

    if (searchQuery) {
      docs = docs.filter(d => 
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (d.fileName && d.fileName.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    } else {
      docs = docs.filter(d => (d.folderId || null) === (currentFolderId || null));
    }

    if (categoryFilter !== "all") {
      docs = docs.filter(d => d.category === categoryFilter);
    }

    return docs.sort((a, b) => {
      const d1 = a.uploadDate ? new Date(a.uploadDate).getTime() : 0;
      const d2 = b.uploadDate ? new Date(b.uploadDate).getTime() : 0;
      const dateA = isNaN(d1) ? 0 : d1;
      const dateB = isNaN(d2) ? 0 : d2;
      return dateB - dateA;
    });
  }, [allDocuments, currentFolderId, searchQuery, categoryFilter]);

  const toggleSelect = (id: string) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!multiSelect) {
          next.clear();
        }
        next.add(id);
      }
      return next;
    });
  };

  const handleNextStep = () => {
    if (skipLabels) {
      const selections = allDocuments
        .filter(d => selectedDocIds.has(d.id))
        .map(doc => ({
          document: doc,
          title: "", // No title needed for logo
        }));
      onSelect(selections);
      setSelectedDocIds(new Set());
      return;
    }

    const selected = allDocuments.filter(d => selectedDocIds.has(d.id));
    const initialTitles = { ...docTitles };
    selected.forEach(doc => {
      if (initialTitles[doc.id] === undefined) {
        initialTitles[doc.id] = ""; 
      }
    });
    setDocTitles(initialTitles);
    setStep(2);
  };

  const handleConfirmSelected = () => {
    const selections = allDocuments
      .filter(d => selectedDocIds.has(d.id))
      .map(doc => ({
        document: doc,
        title: docTitles[doc.id] || "",
      }));
    onSelect(selections);
    // Reset state for next time
    setStep(1);
    setSelectedDocIds(new Set());
    setDocTitles({});
  };

  const handleBackToSelection = () => {
    setStep(1);
  };

  // Tree component for recursive folder navigation
  const FolderTreeItem = ({ folder, level = 0 }: { folder: ProjectFolder, level?: number }) => {
    const isSelected = currentFolderId === folder.id;

    return (
      <div className="flex flex-col">
        <button
          onClick={() => {
            setCurrentFolderId(folder.id);
            setSearchQuery("");
          }}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 text-sm transition-colors rounded-md group text-left w-full",
            isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground"
          )}
          style={{ paddingLeft: `${(level + 1) * 12}px` }}
        >
          {folder.name === "Recycle Bin" || folder.name === "سلة المحذوفات" ? (
            <Trash2 className={cn("h-4 w-4 shrink-0", isSelected ? "text-destructive" : "text-destructive/50")} />
          ) : (
            <Folder className={cn("h-4 w-4 shrink-0", isSelected ? "fill-primary/20 text-primary" : "text-muted-foreground/50")} />
          )}
          <span className="truncate">{folder.name}</span>
          {isSelected && <div className="ml-auto w-1 h-4 bg-primary rounded-full transition-all" />}
        </button>
        {folders
          .filter(f => f.parentId === folder.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .map(child => <FolderTreeItem key={child.id} folder={child} level={level + 1} />)}
      </div>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
          onClose();
          setTimeout(() => setStep(1), 200);
        }
      }}>
      <DialogContent className="max-w-6xl h-[750px] flex flex-col p-0 gap-0 overflow-hidden shadow-2xl border-none">
        <DialogHeader className="p-5 border-b bg-muted/10">
          <div className="flex items-center justify-between pr-8">
            <div className="flex flex-col gap-0.5">
              <DialogTitle className="text-xl font-bold flex items-center gap-2.5">
                <div className="bg-primary p-2 rounded-xl text-primary-foreground shadow-lg shadow-primary/20">
                  <LayoutGrid className="w-5 h-5" />
                </div>
                {step === 1 ? "Project Storage" : "Set Document Titles"}
              </DialogTitle>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold ml-11">
                {step === 1 ? "Asset & Document browser" : "Provide a label for each selected document"}
              </p>
            </div>
            {step === 1 && (
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs font-bold gap-2 text-primary"
                  onClick={() => {
                    onClose();
                    setLocation(`/projects/${projectId}/storage`);
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Manage Storage
                </Button>
                <Button 
                  size="sm" 
                  className="text-xs font-bold gap-2 shadow-sm rounded-lg"
                  onClick={() => setIsUploadDialogOpen(true)}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                </Button>
                <Badge variant="outline" className="bg-background/80 shadow-sm border-muted-foreground/20 px-3 py-1 text-[11px] font-bold">
                  {allDocuments.length} Total Files
                </Badge>
                <Separator orientation="vertical" className="h-8" />
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {step === 1 ? (
            <>
              {/* Left Panel: Folder Tree */}
              <div className="w-64 border-r bg-muted/5 flex flex-col shrink-0">
                <div className="p-4 flex flex-col gap-1.5">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2 px-1">
                    Navigation
                  </h3>
                  <button
                    onClick={() => {
                      setCurrentFolderId(null);
                      setSearchQuery("");
                    }}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 text-sm transition-all rounded-lg w-full text-left font-medium group",
                      currentFolderId === null && !searchQuery ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]" : "text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    <LayoutGrid className={cn("h-4 w-4", currentFolderId === null && !searchQuery ? "text-white" : "text-muted-foreground/50")} />
                    Project Root
                  </button>
                </div>
                <Separator className="bg-muted-foreground/5 mx-4 w-auto" />
                <ScrollArea className="flex-1 px-3 py-4">
                  <div className="space-y-0.5">
                    {folders
                      .filter(f => !f.parentId)
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map(folder => <FolderTreeItem key={folder.id} folder={folder} />)}
                  </div>
                </ScrollArea>
              </div>

              {/* Right Panel: File List */}
              <div className="flex-1 flex flex-col min-w-0 bg-background/50">
                {/* Filters Header */}
                <div className="p-4 border-b bg-background flex flex-col gap-3 shadow-sm z-10">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 group">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        placeholder="Search documents by name..."
                        className="pl-10 h-10 border-muted/50 bg-muted/20 focus-visible:ring-primary focus-visible:bg-background transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-[180px] h-10 border-muted/50 bg-background/50">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <Filter className="h-3.5 w-3.5 text-primary" />
                          <SelectValue placeholder="All Categories" />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="border-muted/50">
                        {categories.map(cat => (
                          <SelectItem key={cat} value={cat} className="text-xs font-medium">
                            {cat === "all" ? "All Categories" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* List Header / Stats */}
                <div className="px-6 py-2.5 bg-muted/10 flex items-center justify-between text-[11px] font-extrabold text-muted-foreground/70 uppercase tracking-[0.1em] border-b">
                  <div className="flex items-center gap-2">
                    <span>Document Details</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="w-28 text-center">Category</span>
                    <span className="w-16 text-right">Size</span>
                    <div className="w-10 shrink-0" />
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  {isLoading ? (
                    <div className="p-6 space-y-4">
                      {[...Array(8)].map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full rounded-xl" />
                      ))}
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      {filteredDocs.length > 0 ? (
                        filteredDocs.map(doc => {
                          const isSelected = selectedDocIds.has(doc.id);
                          return (
                            <div
                              key={doc.id}
                              className={cn(
                                "flex items-center justify-between px-4 py-3 rounded-xl transition-all group cursor-pointer border border-transparent",
                                isSelected
                                  ? "bg-primary/5 border-primary/20 shadow-sm"
                                  : "hover:bg-muted/40 hover:border-muted-foreground/10"
                              )}
                              onClick={() => toggleSelect(doc.id)}
                            >
                              <div className="flex items-center gap-4 min-w-0 pr-4">
                                <div className={cn(
                                  "h-10 w-10 flex items-center justify-center rounded-xl transition-all shrink-0",
                                  isSelected
                                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                                    : "bg-muted/60 text-muted-foreground group-hover:scale-105 group-hover:bg-muted group-hover:shadow-md"
                                )}>
                                  {isSelected ? <Check className="h-5 w-5 stroke-[2.5]" /> : <File className="h-5 w-5" />}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className={cn(
                                    "font-bold text-[13px] truncate",
                                    isSelected ? "text-primary" : "text-foreground/90"
                                  )}>{doc.fileName || doc.name}</span>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="secondary" className="text-[9px] py-0 px-1.5 h-4 font-bold border-transparent bg-muted/60 text-muted-foreground group-hover:bg-background transition-colors uppercase tracking-tighter">
                                      {doc.type}
                                    </Badge>
                                    {doc.folderId && (
                                      <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1 font-medium italic">
                                        <Folder className="w-3 h-3 opacity-50" />
                                        {folders.find(f => f.id === doc.folderId)?.name}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-6 shrink-0">
                                <div className="w-28 flex justify-center">
                                  <span className="text-[10px] font-bold text-primary/80 bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full uppercase tracking-tight">
                                    {doc.category}
                                  </span>
                                </div>
                                <span className="w-16 text-[11px] text-muted-foreground font-bold text-right tabular-nums">
                                  {formatFileSize(doc.size || (doc as any).fileSize)}
                                </span>
                                <div className="w-10 flex justify-center">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleSelect(doc.id)}
                                    className={cn(
                                      "h-5 w-5 rounded-md border-2 transition-all",
                                      isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                                    )}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-5">
                          <div className="relative">
                            <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-150 animate-pulse" />
                            <div className="relative bg-muted/20 p-8 rounded-3xl border-2 border-dashed border-muted-foreground/20">
                              <File className="h-16 w-16 opacity-10" />
                            </div>
                          </div>
                          <div className="text-center space-y-1">
                            <p className="text-base font-bold text-foreground">No documents found</p>
                            <p className="text-xs text-muted-foreground/70 max-w-[240px] leading-relaxed">
                              Try searching for something else or navigate to a different folder to find your documents.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col bg-background/50">
              <div className="px-6 py-4 border-b bg-muted/5 flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  {suggestions.length > 0 ? <LayoutGrid className="w-4 h-4 text-primary" /> : <FileText className="w-4 h-4 text-primary" />}
                </div>
                <div>
                  <h4 className="text-sm font-bold">
                    {suggestions.length > 0 ? "Set Document Categories" : "Set Document Titles"}
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    {suggestions.length > 0 ? "Assign a category for each selected file" : "Assign a distinct title for each selected file"}
                  </p>
                </div>
              </div>
              <ScrollArea className="flex-1 p-6">
                <div className="max-w-3xl mx-auto space-y-6">
                  {allDocuments
                    .filter(d => selectedDocIds.has(d.id))
                    .map((doc, idx) => (
                      <div key={doc.id} className="flex flex-col gap-4 p-5 rounded-2xl border bg-background shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center gap-3 px-1">
                          <Badge variant="outline" className="text-[10px] h-5 rounded-md font-bold px-1.5 bg-primary/5 border-primary/20 text-primary">
                            FILE #{idx + 1}
                          </Badge>
                          <span className="text-sm font-bold text-foreground truncate flex-1 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary/60" />
                            {doc.fileName || doc.name}
                          </span>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between ml-1">
                             <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                               {suggestions.length > 0 ? "Select Category" : "Document Title"}
                             </Label>
                          </div>

                          {suggestions.length > 0 ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className="w-full justify-between rounded-xl h-10 border-muted/50 bg-background/50 text-xs font-medium hover:bg-background"
                                >
                                  {docTitles[doc.id] || "Search or type category..."}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[450px] p-0 rounded-xl shadow-2xl border-primary/10" align="start">
                                <Command shouldFilter={true}>
                                  <CommandInput 
                                    placeholder="Search or type custom category..." 
                                    onValueChange={(val) => {
                                      // Update the category as the user types
                                      setDocTitles(prev => ({ ...prev, [doc.id]: val }));
                                    }}
                                  />
                                  <CommandList className="max-h-[300px]">
                                    <CommandEmpty className="p-4 text-center">
                                      <p className="text-xs text-muted-foreground mb-2">No matching category found.</p>
                                      <p className="text-[10px] font-bold text-primary">Press Enter or keep typing to use this as a custom category.</p>
                                    </CommandEmpty>
                                    <CommandGroup heading="Suggestions">
                                      {suggestions.map((s) => (
                                        <CommandItem
                                          key={s}
                                          value={s}
                                          onSelect={(currentValue) => {
                                            // currentValue from cmdk is lowercase, we want the original suggestion
                                            const originalSuggestion = suggestions.find(sig => sig.toLowerCase() === currentValue.toLowerCase()) || currentValue;
                                            setDocTitles(prev => ({ ...prev, [doc.id]: originalSuggestion }));
                                          }}
                                          className="text-xs py-2 cursor-pointer"
                                        >
                                          <Check className={cn("mr-2 h-4 w-4 text-primary", docTitles[doc.id] === s ? "opacity-100" : "opacity-0")} />
                                          {s}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <Input
                              placeholder="Enter a descriptive title for this document..."
                              value={docTitles[doc.id] || ""}
                              onChange={(e) => setDocTitles(prev => ({ ...prev, [doc.id]: e.target.value }))}
                              className="h-10 border-muted/50 rounded-xl bg-background/50 focus-visible:ring-primary"
                              autoFocus={idx === 0}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="p-5 border-t bg-muted/10 flex items-center justify-between sm:justify-between px-8 bg-gradient-to-r from-muted/20 to-transparent">
          <div className="flex items-center gap-4">
            <div className={cn(
              "p-2.5 rounded-xl transition-all transform",
              selectedDocIds.size > 0 ? "bg-primary scale-110 shadow-lg shadow-primary/30" : "bg-muted scale-100"
            )}>
              <Link2 className={cn("w-5 h-5", selectedDocIds.size > 0 ? "text-primary-foreground" : "text-muted-foreground/40")} />
            </div>
            <div className="flex flex-col">
              {selectedDocIds.size > 0 ? (
                <>
                  <p className="text-sm font-bold text-foreground tracking-tight leading-none mb-1">
                    {selectedDocIds.size} Document{selectedDocIds.size > 1 ? "s" : ""} selected
                  </p>
                  <p className="text-[11px] text-primary font-bold uppercase tracking-widest leading-none">
                    {step === 1 ? "Continue to labels" : "Ready to attach"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-muted-foreground/60 leading-none mb-1">
                    No documents selected
                  </p>
                  <p className="text-[11px] text-muted-foreground/40 font-bold uppercase tracking-widest leading-none">
                    Select files to proceed
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            {step === 1 ? (
              <>
                <Button variant="ghost" onClick={onClose} className="font-bold text-xs uppercase tracking-widest hover:bg-muted/80">
                  Cancel
                </Button>
                <Button
                  disabled={selectedDocIds.size === 0}
                  onClick={handleNextStep}
                  className="px-10 h-11 rounded-xl shadow-xl shadow-primary/20 font-bold text-xs uppercase tracking-[0.15em] transition-all hover:scale-[1.03] active:scale-[0.98]"
                >
                  Continue
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={handleBackToSelection} className="font-bold text-xs uppercase tracking-widest hover:bg-muted/80">
                  Back
                </Button>
                <Button
                  onClick={handleConfirmSelected}
                  className="px-10 h-11 rounded-xl shadow-xl shadow-primary/20 font-bold text-xs uppercase tracking-[0.15em] transition-all hover:scale-[1.03] active:scale-[0.98]"
                >
                  Attach Documents
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Upload Dialog */}
    <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
      <DialogContent className="max-w-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>
            Select files to upload into <span className="font-bold text-primary">{folders.find(f => f.id === currentFolderId)?.name || "Project Root"}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="py-6 min-h-[300px]">
          <ObjectUploader 
            projectId={projectId}
            folderId={currentFolderId}
            existingFileNames={allDocuments.map((d: any) => d.fileName || d.name)}
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
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
