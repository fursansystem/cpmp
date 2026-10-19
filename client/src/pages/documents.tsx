import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, Search, FileText, Download, Trash2, File, LayoutGrid, List, Eye } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface Document {
  id: string;
  name: string;
  type: string;
  category: "contract" | "plan" | "invoice" | "photo" | "other";
  size: string;
  uploadDate: string;
  projectId: string;
  fileData?: string;
}

export default function Documents() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("other");
  const [viewMode, setViewMode] = useState<"list" | "icon">("list");
  const [viewingImage, setViewingImage] = useState<Document | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetch documents
  const { data: documents = [] } = useQuery({
    queryKey: ["/api/documents"],
    queryFn: async () => {
      const response = await fetch("/api/documents");
      if (!response.ok) throw new Error("Failed to fetch documents");
      return response.json();
    },
  });

  // Fetch projects for the dialog
  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const response = await fetch("/api/projects");
      if (!response.ok) throw new Error("Failed to fetch projects");
      return response.json();
    },
  });
  
  const { data: viewingDocDetail, isLoading: detailLoading } = useQuery<Document>({
    queryKey: ["/api/documents", viewingImage?.id],
    enabled: !!viewingImage,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedProject) {
        throw new Error("Please select a project");
      }

      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = async () => {
          try {
            const fileData = reader.result as string;
            const sizeInKB = Math.round(file.size / 1024);
            const sizeLabel = sizeInKB > 1024 ? `${(sizeInKB / 1024).toFixed(1)} MB` : `${sizeInKB} KB`;

            const response = await apiRequest("POST", "/api/documents", {
              projectId: selectedProject,
              name: file.name,
              type: file.name.split(".").pop()?.toUpperCase() || "FILE",
              category: selectedCategory,
              size: sizeLabel,
              fileData,
            });

            resolve(response);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Success", description: "Document uploaded successfully" });
      setIsDialogOpen(false);
      setSelectedProject("");
      setSelectedCategory("other");
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const response = await apiRequest("DELETE", `/api/documents/${docId}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Success", description: "Document deleted" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete document",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Compress if it is a large image
      let fileToUpload = file;
      if (file.type.startsWith("image/") && file.size > 500 * 1024) {
        try {
          const { default: imageCompression } = await import("browser-image-compression");
          fileToUpload = await imageCompression(file, {
            maxSizeMB: 0.5,
            maxWidthOrHeight: 1920,
            initialQuality: 0.7,
            useWebWorker: true,
          });
        } catch (err) {
          console.error("Compression failed:", err);
        }
      }
      uploadMutation.mutate(fileToUpload as File);
    }
  };

  const categoryConfig = {
    contract: { label: "Contract", className: "bg-chart-1 text-white" },
    plan: { label: "Plan", className: "bg-chart-2 text-white" },
    invoice: { label: "Invoice", className: "bg-chart-3 text-white" },
    photo: { label: "Photo", className: "bg-chart-4 text-white" },
    other: { label: "Other", className: "bg-muted text-muted-foreground" },
  };

  const filteredDocuments = documents.filter((doc: Document) => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || doc.category === categoryFilter;
    return matchesSearch && matchesCategory;
  }).sort((a: Document, b: Document) => {
    const dateA = a.uploadDate ? new Date(a.uploadDate).getTime() : 0;
    const dateB = b.uploadDate ? new Date(b.uploadDate).getTime() : 0;
    return dateB - dateA;
  });

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display mb-2">Documents</h1>
          <p className="text-muted-foreground">
            Manage project documents and files
          </p>
        </div>
        <Button
          onClick={() => setIsDialogOpen(true)}
          data-testid="button-upload"
        >
          <Upload className="w-4 h-4 mr-2" />
          Upload Document
        </Button>
      </div>

      <Card className="border-dashed border-2">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
              <Upload className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium mb-1">Drop files here or click to upload</p>
              <p className="text-sm text-muted-foreground">
                Supported formats: PDF, JPG, PNG (Max 10MB)
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleFileSelect}
              data-testid="button-browse"
            >
              Browse Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept=".pdf,.jpg,.png,.jpeg"
              data-testid="input-file"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 flex-wrap justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-category-filter">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="contract">Contracts</SelectItem>
              <SelectItem value="plan">Plans</SelectItem>
              <SelectItem value="invoice">Invoices</SelectItem>
              <SelectItem value="photo">Photos</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("list")}
            data-testid="button-list-view"
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === "icon" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("icon")}
            data-testid="button-icon-view"
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="space-y-2">
          {filteredDocuments.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No documents found
              </CardContent>
            </Card>
          ) : (
            filteredDocuments.map((doc: Document) => {
              const categoryInfo = categoryConfig[doc.category];
              const project = projects.find((p: any) => p.id === doc.projectId);
              return (
                <Card key={doc.id} className="hover-elevate overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-muted rounded-md flex items-center justify-center flex-shrink-0">
                        {doc.type === "PDF" ? (
                          <FileText className="w-5 h-5 text-muted-foreground" />
                        ) : ["JPG", "PNG", "JPEG", "GIF"].includes(doc.type) ? (
                          <File className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <File className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{doc.name}</p>
                          <Badge className={categoryInfo.className}>
                            {categoryInfo.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          <span>{project?.name || "Unknown Project"}</span>
                          <span>{doc.size}</span>
                          <span>{format(new Date(doc.uploadDate), "MMM d, yyyy")}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid="button-view"
                          onClick={() => setViewingImage(doc)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid="button-delete"
                          onClick={() => setDeletingDocId(doc.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        <div>
          {filteredDocuments.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No documents found
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredDocuments.map((doc: Document) => {
                const categoryInfo = categoryConfig[doc.category];
                const project = projects.find((p: any) => p.id === doc.projectId);
                return (
                  <Card key={doc.id} className="hover-elevate overflow-hidden flex flex-col">
                    <CardContent className="p-4 flex-1 flex flex-col">
                      <div className="flex justify-center mb-4 flex-1">
                        <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                          {doc.type === "PDF" ? (
                            <FileText className="w-8 h-8 text-muted-foreground" />
                          ) : ["JPG", "PNG", "JPEG", "GIF", "WEBP", "SVG"].includes(doc.type?.toUpperCase()) ? (
                            <File className="w-8 h-8 text-muted-foreground" />
                          ) : (
                            <File className="w-8 h-8 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <div className="space-y-2 flex-1">
                        <p className="font-medium text-sm truncate text-center">{doc.name}</p>
                        <div className="flex justify-center">
                          <Badge className={categoryInfo.className}>
                            {categoryInfo.label}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground text-center space-y-1">
                          <p>{project?.name || "Unknown"}</p>
                          <p>{doc.size}</p>
                          <p>{format(new Date(doc.uploadDate), "MMM d")}</p>
                        </div>
                      </div>
                      <div className="flex justify-center gap-1 mt-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid="button-view"
                          onClick={() => setViewingImage(doc)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid="button-delete"
                          onClick={() => setDeletingDocId(doc.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!viewingImage} onOpenChange={() => setViewingImage(null)}>
        <DialogContent className="max-w-6xl max-h-[95vh] h-[95vh]">
          <DialogHeader>
            <DialogTitle>{viewingImage?.name}</DialogTitle>
          </DialogHeader>
          {viewingImage && (
            <div className="flex flex-col items-center justify-center">
              {detailLoading ? (
                <div className="flex flex-col items-center gap-4 py-20">
                  <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <p className="text-sm text-muted-foreground">Loading document data...</p>
                </div>
              ) : viewingDocDetail?.fileData && ["JPG", "PNG", "JPEG", "GIF", "WEBP", "SVG"].includes(viewingDocDetail.type?.toUpperCase()) ? (
                <>
                  <img
                    src={viewingDocDetail.fileData}
                    alt={viewingDocDetail.name}
                    className="max-w-full max-h-[80vh] object-contain rounded-md"
                    data-testid={`img-viewer-${viewingDocDetail.id}`}
                  />
                  <p className="text-sm text-muted-foreground mt-4">
                    {viewingImage.name} • {viewingImage.size} • {format(new Date(viewingImage.uploadDate), "MMM d, yyyy")}
                  </p>
                </>
              ) : viewingDocDetail?.fileData && viewingDocDetail.type?.toUpperCase() === "PDF" ? (
                <>
                  <embed
                    src={viewingDocDetail.fileData}
                    type="application/pdf"
                    className="w-full h-[80vh] rounded-md border"
                    data-testid={`pdf-viewer-${viewingDocDetail.id}`}
                  />
                  <p className="text-sm text-muted-foreground mt-4">
                    {viewingDocDetail.name} • {viewingDocDetail.size} • {format(new Date(viewingDocDetail.uploadDate), "MMM d, yyyy")}
                  </p>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-4 py-8">
                  <div className="w-32 h-40 bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-muted-foreground/30">
                    {viewingImage.type === "PDF" ? (
                      <FileText className="w-16 h-16 text-muted-foreground" />
                    ) : viewingImage.type === "DWG" ? (
                      <FileText className="w-16 h-16 text-muted-foreground" />
                    ) : (
                      <File className="w-16 h-16 text-muted-foreground" />
                    )}
                  </div>
                  <div className="text-center max-w-sm">
                    <p className="font-medium text-lg">{viewingImage.name}</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {viewingImage.size} • {format(new Date(viewingImage.uploadDate), "MMM d, yyyy")}
                    </p>
                    {viewingImage.type === "DWG" && (
                      <p className="text-xs text-muted-foreground mt-3 italic">
                        AutoCAD DWG file - Download to view in AutoCAD or compatible software
                      </p>
                    )}
                  </div>
                  {viewingDocDetail?.fileData && (
                    <Button
                      onClick={() => {
                        if (!viewingDocDetail) return;
                        const a = document.createElement('a');
                        a.href = viewingDocDetail.fileData!;
                        a.download = viewingDocDetail.name;
                        a.click();
                      }}
                      data-testid="button-download"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download File
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingDocId} onOpenChange={() => setDeletingDocId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Are you sure you want to delete this document? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setDeletingDocId(null)}
                data-testid="button-cancel-delete"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deletingDocId) {
                    deleteMutation.mutate(deletingDocId);
                    setDeletingDocId(null);
                  }
                }}
                data-testid="button-confirm-delete"
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="project" className="text-sm font-medium">
                Project *
              </label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger id="project" data-testid="select-project-upload">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project: any) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="category" className="text-sm font-medium">
                Category *
              </label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger id="category" data-testid="select-category-upload">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="plan">Plan</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="photo">Photo</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="file" className="text-sm font-medium">
                File *
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={handleFileSelect}
                className="w-full"
                disabled={uploadMutation.isPending}
                data-testid="button-select-file"
              >
                {uploadMutation.isPending ? "Uploading..." : "Select File"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                accept=".pdf,.jpg,.png,.jpeg"
                data-testid="input-file-dialog"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                data-testid="button-cancel-upload"
              >
                Cancel
              </Button>
              <Button
                disabled={!selectedProject || uploadMutation.isPending}
                data-testid="button-confirm-upload"
              >
                {uploadMutation.isPending ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
