import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Tag } from "lucide-react";
import { type Document } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DocumentMetadataDialogProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentMetadataDialog({ document, isOpen, onClose }: DocumentMetadataDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("general");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  const { data: suggestionTags = [] } = useQuery<string[]>({
    queryKey: [`/api/projects/${document?.projectId}/tags`],
    enabled: !!document?.projectId,
  });

  useEffect(() => {
    if (document) {
      setName(document.name);
      setCategory(document.category);
      setTags(document.tags || []);
    }
  }, [document]);

  const updateMutation = useMutation({
    mutationFn: async (data: { name: string; category: string; tags: string[] }) => {
      const res = await apiRequest("PATCH", `/api/documents/${document?.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${document?.projectId}/storage`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${document?.projectId}/tags`] });
      toast({ title: "Success", description: "Document metadata updated" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleAddTag = () => {
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Document Metadata</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Select category" />
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
          <div className="grid gap-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 px-2 py-1">
                  {tag}
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-destructive"
                    onClick={() => handleRemoveTag(tag)}
                  />
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder="Add a tag..."
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                />
                {newTag && suggestionTags.filter(t => t.toLowerCase().includes(newTag.toLowerCase()) && !tags.includes(t)).length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-32 overflow-y-auto">
                    {suggestionTags.filter(t => t.toLowerCase().includes(newTag.toLowerCase()) && !tags.includes(t)).map(t => (
                      <div
                        key={t}
                        className="px-3 py-2 text-sm hover:bg-accent cursor-pointer flex items-center gap-2"
                        onClick={() => {
                          setTags([...tags, t]);
                          setNewTag("");
                        }}
                      >
                        <Tag className="h-3 w-3" />
                        {t}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Button type="button" size="icon" onClick={handleAddTag} variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => updateMutation.mutate({ name, category, tags })}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
