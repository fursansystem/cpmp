import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Folder, ChevronRight, LayoutGrid } from "lucide-react";
import { type ProjectFolder, type Document } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface FolderMoveDialogProps {
  items: (Document | ProjectFolder)[];
  isOpen: boolean;
  onClose: () => void;
  onMove: (targetFolderId: string | null) => Promise<void>;
  currentFolders: ProjectFolder[];
}

export function FolderMoveDialog({ items, isOpen, onClose, onMove, currentFolders }: FolderMoveDialogProps) {
  const { toast } = useToast();
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  // Filter out the folders being moved and their children to prevent circular reference
  const isValidTarget = (folderId: string | null) => {
    if (items.length === 0) return false;
    
    for (const item of items) {
      if ("parentId" in item) { // It's a folder
        if (folderId === item.id) return false;
        // Check if folderId is a child of item.id (recursive)
        let currentId = folderId;
        while (currentId) {
          const parent = currentFolders.find(f => f.id === currentId);
          if (parent?.parentId === item.id) return false;
          currentId = parent?.parentId || null;
        }
      }
    }
    return true;
  };

  const handleMove = async () => {
    try {
      setIsMoving(true);
      await onMove(targetFolderId);
      onClose();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsMoving(false);
    }
  };

  const FolderItem = ({ folder, level = 0 }: { folder: ProjectFolder, level?: number }) => {
    const isSelected = targetFolderId === folder.id;
    const canMoveHere = isValidTarget(folder.id);

    return (
      <div className="flex flex-col">
        <button
          onClick={() => canMoveHere && setTargetFolderId(folder.id)}
          disabled={!canMoveHere}
          className={cn(
            "flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-md text-left w-full",
            isSelected ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground",
            !canMoveHere && "opacity-50 cursor-not-allowed"
          )}
          style={{ paddingLeft: `${(level + 1) * 16}px` }}
        >
          <Folder className={cn("h-4 w-4 shrink-0", isSelected ? "text-primary-foreground" : "text-primary opacity-60")} />
          <span className="truncate">{folder.name}</span>
        </button>
        {currentFolders
          .filter(f => f.parentId === folder.id)
          .map(child => <FolderItem key={child.id} folder={child} level={level + 1} />)}
      </div>
    );
  };

  if (items.length === 0) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm h-[500px] flex flex-col p-0 overflow-hidden shadow-2xl border-none">
        <DialogHeader className="p-5 border-b">
          <DialogTitle>Move to Folder</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 p-4 shadow-inner bg-muted/5">
          <div className="space-y-1">
            <button
              onClick={() => isValidTarget(null) && setTargetFolderId(null)}
              disabled={!isValidTarget(null)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-md text-left w-full",
                targetFolderId === null ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground",
                !isValidTarget(null) && "opacity-50 cursor-not-allowed"
              )}
            >
              <LayoutGrid className={cn("h-4 w-4", targetFolderId === null ? "text-primary-foreground" : "text-primary opacity-60")} />
              <span>Project Root</span>
            </button>
            {currentFolders
              .filter(f => !f.parentId)
              .map(folder => <FolderItem key={folder.id} folder={folder} />)}
          </div>
        </ScrollArea>

        <DialogFooter className="p-5 border-t flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} size="sm">
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={isMoving}
            size="sm"
            className="px-6 rounded-lg font-bold"
          >
            {isMoving ? "Moving..." : "Move Here"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
