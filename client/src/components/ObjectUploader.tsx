import { useState, useRef, useEffect } from "react";
import Uppy from "@uppy/core";
import Dashboard from "@uppy/react/dashboard";
import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";
import AwsS3 from "@uppy/aws-s3";
import Compressor from "@uppy/compressor";
import { useUpload } from "@/hooks/use-upload";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { formatFileSize } from "@/lib/utils";

interface ObjectUploaderProps {
  projectId: string;
  folderId?: string | null;
  onUploadComplete?: () => void;
  maxNumberOfFiles?: number;
  existingFileNames?: string[];
  onDuplicateFile?: (fileName: string) => void;
}

export function ObjectUploader({
  projectId,
  folderId = null,
  onUploadComplete,
  maxNumberOfFiles = 10,
  existingFileNames = [],
  onDuplicateFile,
}: ObjectUploaderProps) {
  const { getUploadParameters } = useUpload();
  const { user } = useAuth();

  const [category, setCategory] = useState<string>("");
  const categoryRef = useRef(category);

  useEffect(() => {
    categoryRef.current = category;
  }, [category]);

  const [uppy] = useState(() => {
    const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    const DWG_MAX_FILE_SIZE = 150 * 1024 * 1024; // 150MB

    const u = new Uppy({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize: DWG_MAX_FILE_SIZE,
      },
      onBeforeFileAdded: (currentFile) => {
        if (!categoryRef.current) {
          u.info('Please select a document category before adding files', 'error', 4000);
          return false;
        }
        if (existingFileNames.includes(currentFile.name)) {
          onDuplicateFile?.(currentFile.name);
          return false; // Prevent adding the file
        }
        const isDwg = currentFile.name.toLowerCase().endsWith(".dwg");
        const maxSize = isDwg ? DWG_MAX_FILE_SIZE : DEFAULT_MAX_FILE_SIZE;
        if (currentFile.size && currentFile.size > maxSize) {
          u.info(
            `"${currentFile.name}" exceeds the ${formatFileSize(maxSize)} limit${isDwg ? "" : " (DWG files may be up to 150 MB)"}`,
            'error',
            5000
          );
          return false;
        }
        return true;
      },
      autoProceed: false,
    });

    u.use(Compressor, {
      quality: 0.7,
      limit: 0.5, // Only compress images > 500KB
    });

    u.use(AwsS3, {
      shouldUseMultipart: false,
      getUploadParameters: async (file) => {
        const response = await fetch("/api/uploads/request-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type || "application/octet-stream",
            folder: folderId || "objects/uploads",
            projectId: projectId,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to get upload URL");
        }

        const data = await response.json();
        // Save the correct R2 objectPath into the file's meta so we can use it on success
        u.setFileMeta(file.id, { key: data.objectPath });

        return {
          method: "PUT",
          url: data.uploadURL,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        };
      },
    })
      .on("upload-success", async (file, response) => {
        // After successful upload to R2, save metadata to our DB
        if (!file) return;
        try {
          const sizeInBytes = file.size || 0;
          const sizeLabel = sizeInBytes > 1024 * 1024
            ? `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`
            : `${Math.round(sizeInBytes / 1024)} KB`;

          // The key was properly saved to meta by getUploadParameters
          const objectKey = file.meta?.key as string || file.name;

          await apiRequest("POST", "/api/documents", {
            projectId,
            folderId: folderId || undefined,
            name: file.name,
            fileName: file.name,
            type: file.extension?.toUpperCase() || "FILE",
            category: categoryRef.current || "general",
            size: formatFileSize(file.size), // Use utility
            fileData: objectKey,
            uploadedBy: user?.id,
            tags: [],
          });
        } catch (error) {
          console.error("Failed to save document metadata:", error);
        }
      })
      .on("complete", (result) => {
        if (result.successful && result.successful.length > 0) {
          onUploadComplete?.();
        }
      });

    return u;
  });

  return (
    <div className="w-full h-full flex flex-col gap-4">
      <div className="bg-muted/30 p-4 rounded-xl border border-primary/10">
        <div className="grid gap-2 max-w-sm">
          <Label htmlFor="categoryField" className="text-sm font-bold text-primary">Document Category <span className="text-destructive">*</span></Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="categoryField" className={!category ? "border-destructive/50 ring-destructive/20 focus:ring-destructive/20" : "border-primary/20"}>
              <SelectValue placeholder="You must select a category first..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="contract">Contract</SelectItem>
              <SelectItem value="plan">Plan</SelectItem>
              <SelectItem value="invoice">Invoice</SelectItem>
              <SelectItem value="photo">Photo</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className={`w-full transition-all duration-300 relative ${!category ? 'hidden' : 'block animate-in fade-in slide-in-from-top-4'}`}>
        <Dashboard
          uppy={uppy}
          width="100%"
          height={400}
          theme="light"
          proudlyDisplayPoweredByUppy={false}
        />
      </div>
    </div>
  );
}
