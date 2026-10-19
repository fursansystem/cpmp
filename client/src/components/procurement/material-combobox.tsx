import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Plus, Check, CheckCircle2, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Material } from "@shared/schema";

export function MaterialCombobox({
  materials,
  selectedMaterialId,
  materialName,
  onSelectMaterial,
  onAddCustomMaterial,
  onQuickAddMaterial,
}: {
  materials: Material[];
  selectedMaterialId?: string;
  materialName?: string;
  onSelectMaterial: (mat: Material) => void;
  onAddCustomMaterial: (name: string) => void;
  onQuickAddMaterial?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedMat = materials.find((m) => m.id === selectedMaterialId);
  const displayName = selectedMat ? selectedMat.materialName : materialName;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full h-9 rounded-lg text-xs justify-between font-medium bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all px-3",
            !displayName && "text-muted-foreground"
          )}
        >
          <span className="truncate flex items-center gap-1.5">
            {displayName || "Select or type material..."}
            {selectedMat && (selectedMat as any).isApproved && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500/10 shrink-0" />
            )}
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-40" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] sm:w-[360px] p-0 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden" align="start">
        <Command className="w-full">
          <CommandInput
            placeholder="Search catalog or type new material name..."
            value={search}
            onValueChange={setSearch}
            className="h-10 text-xs border-none ring-0 focus:ring-0"
          />
          <CommandList className="custom-scrollbar max-h-56">
            <CommandEmpty className="p-2">
              <div className="space-y-1">
                {search.trim() ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs font-bold text-primary py-2.5 px-3 h-auto hover:bg-primary/10 rounded-lg text-left"
                    onClick={() => {
                      onAddCustomMaterial(search.trim());
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2 shrink-0" />
                    Add "{search.trim()}" as New Material
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">No material found</p>
                )}

                {onQuickAddMaterial && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs font-medium text-muted-foreground py-2 px-3 h-auto hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-left"
                    onClick={() => {
                      onQuickAddMaterial();
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Plus className="w-3.5 h-3.5 mr-2 text-primary shrink-0" />
                    Create Approved Project Material...
                  </Button>
                )}
              </div>
            </CommandEmpty>
            <CommandGroup>
              {search.trim() && (
                <CommandItem
                  value={search}
                  onSelect={() => {
                    onAddCustomMaterial(search.trim());
                    setOpen(false);
                    setSearch("");
                  }}
                  className="text-xs py-2.5 px-3 font-bold text-primary cursor-pointer hover:bg-primary/5 flex items-center"
                >
                  <Plus className="w-4 h-4 mr-2 shrink-0" />
                  Add "{search.trim()}" as New Material
                </CommandItem>
              )}
              {materials.map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.materialName}
                  onSelect={() => {
                    onSelectMaterial(m);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="text-xs py-2.5 px-3 flex items-center justify-between cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
                      {m.materialName}
                      {(m as any).isApproved && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500/10 shrink-0" />
                      )}
                    </span>
                    {m.category && (
                      <span className="text-[10px] text-muted-foreground truncate">{m.category}</span>
                    )}
                  </div>
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 text-primary shrink-0 ml-2",
                      m.id === selectedMaterialId ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
