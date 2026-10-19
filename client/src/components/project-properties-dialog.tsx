import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin, FileText, Plus, Trash2, Pencil,
  Settings, Info, X, Check, Layers, ChevronDown, ChevronRight, Shield, Sliders,
  Download, Upload
} from "lucide-react";
import * as XLSX from "xlsx";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  Project, WorkLocation, ProjectFormSettings,
  InsertWorkLocation, WorkLevel, InsertWorkLevel, RequestType, User, TeamMember, Organization
} from "@shared/schema";
import { useAuth } from "@/lib/auth";

interface ProjectPropertiesDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectPropertiesDialog({
  project,
  open,
  onOpenChange
}: ProjectPropertiesDialogProps) {
  const [activeTab, setActiveTab] = useState("general");

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Project Properties - {project.name}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general" className="flex items-center gap-2" data-testid="tab-general">
              <Info className="w-4 h-4" />
              General Info
            </TabsTrigger>
            <TabsTrigger value="locations" className="flex items-center gap-2" data-testid="tab-locations">
              <MapPin className="w-4 h-4" />
              Work Location
            </TabsTrigger>
            <TabsTrigger value="levels" className="flex items-center gap-2" data-testid="tab-levels">
              <Layers className="w-4 h-4" />
              Work Levels
            </TabsTrigger>
            <TabsTrigger value="forms" className="flex items-center gap-2" data-testid="tab-forms">
              <FileText className="w-4 h-4" />
              Form Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <GeneralInfoTab project={project} />
          </TabsContent>

          <TabsContent value="locations" className="mt-4">
            <WorkLocationTab projectId={project.id} />
          </TabsContent>

          <TabsContent value="levels" className="mt-4">
            <WorkLevelsTab projectId={project.id} />
          </TabsContent>

          <TabsContent value="forms" className="mt-4">
            <FormSettingsTab projectId={project.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function GeneralInfoTab({ project }: { project: Project }) {
  const { user } = useAuth();
  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const isSuperAdmin = user?.role === "super_admin";
  const userOrg = organizations.find(org => org.id === user?.organizationId);
  const isDeveloperOrg = userOrg?.sectorType === "Developer";
  const isDeveloperOrSuperAdmin = isSuperAdmin || isDeveloperOrg;

  return (
    <ScrollArea className="h-[500px] pr-4">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-sm">Project Name</Label>
                <p className="font-medium">{project.name}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Status</Label>
                <Badge variant="outline" className="mt-1">{project.status}</Badge>
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Location</Label>
                <p className="font-medium">{project.location}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Progress</Label>
                <p className="font-medium">{project.progress}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {isDeveloperOrSuperAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Financial Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-muted-foreground text-sm">Contract Value</Label>
                  <p className="font-medium text-lg">${Number(project.contractValue).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Estimated Cost</Label>
                  <p className="font-medium text-lg">${Number(project.estimatedCost).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Actual Cost</Label>
                  <p className="font-medium text-lg">${Number(project.actualCost).toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-sm">Start Date</Label>
                <p className="font-medium">{project.startDate}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">End Date</Label>
                <p className="font-medium">{project.endDate}</p>
              </div>
            </div>
            {project.description && (
              <div>
                <Label className="text-muted-foreground text-sm">Description</Label>
                <p className="font-medium">{project.description}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}

interface WorkLocationFormData {
  unitCustomNumber?: string;
  unitDescription?: string;
  unitZone?: string;
  unitCluster?: string;
  unitBlock?: string;
  buildingNo?: string;
  flatNo?: string;
  areaM2?: string;
  floor?: string;
  villaType?: string;
  part?: string;
}

function WorkLocationTab({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const userOrg = organizations.find(org => org.id === user?.organizationId);
  const canModify = user?.role === "super_admin" ||
    userOrg?.sectorType === "Developer" ||
    userOrg?.sectorType === "Contractor";

  const { toast } = useToast();
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<WorkLocationFormData>({});

  const { data: locations = [], isLoading } = useQuery<WorkLocation[]>({
    queryKey: ['/api/projects', projectId, 'work-locations'],
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertWorkLocation) => apiRequest('POST', '/api/work-locations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'work-locations'] });
      resetForm();
      toast({ title: "Work location added successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error adding work location", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertWorkLocation> }) =>
      apiRequest('PATCH', `/api/work-locations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'work-locations'] });
      resetForm();
      toast({ title: "Work location updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error updating work location", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/work-locations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'work-locations'] });
      toast({ title: "Work location deleted" });
    },
  });

  const resetForm = () => {
    setIsAddingNew(false);
    setEditingId(null);
    setFormData({});
  };

  const handleSave = () => {
    const dataToSave: InsertWorkLocation = {
      projectId,
      unitCustomNumber: formData.unitCustomNumber || undefined,
      unitZone: formData.unitZone || undefined,
      unitCluster: formData.unitCluster || undefined,
      unitBlock: formData.unitBlock || undefined,
      buildingNo: formData.buildingNo || undefined,
      flatNo: formData.flatNo || undefined,
      areaM2: formData.areaM2 || undefined,
      floor: formData.floor || undefined,
      villaType: formData.villaType || undefined,
      part: formData.part || undefined,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: dataToSave });
    } else {
      createMutation.mutate(dataToSave);
    }
  };

  const handleEdit = (location: WorkLocation) => {
    setEditingId(location.id);
    setFormData({
      unitCustomNumber: location.unitCustomNumber || '',
      unitDescription: location.unitDescription || '',
      unitZone: location.unitZone || '',
      unitCluster: location.unitCluster || '',
      unitBlock: location.unitBlock || '',
      buildingNo: location.buildingNo || '',
      flatNo: location.flatNo || '',
      areaM2: location.areaM2 || '',
      floor: location.floor || '',
      villaType: location.villaType || '',
      part: location.part || '',
    });
  };

  const handleInputChange = (field: keyof WorkLocationFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleExport = () => {
    const dataToExport = locations.map(loc => ({
      'Unit ID': loc.unitCustomNumber || '',
      'Zone': loc.unitZone || '',
      'Cluster': loc.unitCluster || '',
      'Block': loc.unitBlock || '',
      'Building': loc.buildingNo || '',
      'Flat': loc.flatNo || '',
      'Area (m²)': loc.areaM2 || '',
      'Floor': loc.floor || '',
      'Villa Type': loc.villaType || '',
      'Part': loc.part || '',
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Work Locations");
    XLSX.writeFile(wb, `Work_Locations_${projectId}.xlsx`);
    toast({ title: "Export successful" });
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const locationsToImport: InsertWorkLocation[] = data.map(row => {
          // Helper to safely convert values to string or null
          const toStringOrNull = (val: any): string | null => {
            if (val === undefined || val === null || val === '') return null;
            return String(val).trim();
          };

          return {
            projectId,
            unitCustomNumber: toStringOrNull(row['Unit ID']),
            unitZone: toStringOrNull(row['Zone']),
            unitCluster: toStringOrNull(row['Cluster']),
            unitBlock: toStringOrNull(row['Block']),
            buildingNo: toStringOrNull(row['Building']),
            flatNo: toStringOrNull(row['Flat']),
            areaM2: toStringOrNull(row['Area (m²)']),
            floor: toStringOrNull(row['Floor']),
            villaType: toStringOrNull(row['Villa Type']),
            part: toStringOrNull(row['Part']),
          };
        });

        // Batch import logic would be better but let's do sequential for simplicity in fast mode
        // Or just suggest autonomous mode if we need full robust implementation
        // For now, we'll try to process them
        Promise.all(locationsToImport.map(loc => createMutation.mutateAsync(loc as InsertWorkLocation)))
          .then(() => {
            toast({ title: "Import successful", description: `Imported ${locationsToImport.length} locations` });
          })
          .catch(err => {
            toast({ title: "Import partial or failed", description: err.message, variant: "destructive" });
          });
      } catch (err: any) {
        toast({ title: "Import failed", description: "Invalid file format", variant: "destructive" });
      }
    };
    reader.readAsBinaryString(file);
    // Reset input
    e.target.value = '';
  };

  const handleDownloadTemplate = () => {
    const templateData = [{
      'Unit ID': 'Example-01',
      'Zone': 'North',
      'Cluster': 'A1',
      'Block': '10',
      'Building': 'B1',
      'Flat': '101',
      'Area (m²)': '120.5',
      'Floor': 'G',
      'Villa Type': 'Type-A',
      'Part': 'Main',
    }];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Work_Locations_Template.xlsx");
    toast({ title: "Template downloaded" });
  };

  const isContractorOrAdmin = user?.role === "super_admin" || userOrg?.sectorType === "Contractor";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Work Locations ({locations.length} records)</h3>
        <div className="flex items-center gap-2">
          {isContractorOrAdmin && (
            <>
              <Button size="sm" variant="outline" onClick={handleDownloadTemplate} data-testid="button-download-template">
                <FileText className="w-4 h-4 mr-2" />
                Template
              </Button>
              <Button size="sm" variant="outline" onClick={handleExport} data-testid="button-export-locations">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <div className="relative">
                <Input
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  id="import-locations-input"
                  onChange={handleImport}
                />
                <Button size="sm" variant="outline" asChild data-testid="button-import-locations">
                  <label htmlFor="import-locations-input" className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    Import
                  </label>
                </Button>
              </div>
            </>
          )}
          {canModify && (
            <Button
              size="sm"
              onClick={() => { setIsAddingNew(true); setFormData({}); }}
              disabled={isAddingNew || editingId !== null}
              data-testid="button-add-location"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Location
            </Button>
          )}
        </div>
      </div>

      <div className="h-[500px] overflow-auto border rounded-md relative">
        <Table className="border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[80px] bg-background border-b sticky top-0">Unit ID</TableHead>
              <TableHead className="bg-background border-b sticky top-0">Zone</TableHead>
              <TableHead className="bg-background border-b sticky top-0">Cluster</TableHead>
              <TableHead className="bg-background border-b sticky top-0">Block</TableHead>
              <TableHead className="bg-background border-b sticky top-0">Building</TableHead>
              <TableHead className="bg-background border-b sticky top-0">Flat</TableHead>
              <TableHead className="bg-background border-b sticky top-0">Area (m²)</TableHead>
              <TableHead className="bg-background border-b sticky top-0">Floor</TableHead>
              <TableHead className="bg-background border-b sticky top-0">Villa Type</TableHead>
              <TableHead className="bg-background border-b sticky top-0">Part</TableHead>
              <TableHead className="w-[100px] bg-background border-b sticky top-0">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isAddingNew && (
              <TableRow className="bg-muted/50">
                <TableCell>
                  <Input
                    value={formData.unitCustomNumber || ''}
                    onChange={(e) => handleInputChange('unitCustomNumber', e.target.value)}
                    placeholder="ID"
                    className="h-8 text-sm"
                    data-testid="input-unit-custom-number"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={formData.unitZone || ''}
                    onChange={(e) => handleInputChange('unitZone', e.target.value)}
                    placeholder="Zone"
                    className="h-8 text-sm"
                    data-testid="input-unit-zone"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={formData.unitCluster || ''}
                    onChange={(e) => handleInputChange('unitCluster', e.target.value)}
                    placeholder="Cluster"
                    className="h-8 text-sm"
                    data-testid="input-unit-cluster"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={formData.unitBlock || ''}
                    onChange={(e) => handleInputChange('unitBlock', e.target.value)}
                    placeholder="Block"
                    className="h-8 text-sm"
                    data-testid="input-unit-block"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={formData.buildingNo || ''}
                    onChange={(e) => handleInputChange('buildingNo', e.target.value)}
                    placeholder="Building"
                    className="h-8 text-sm"
                    data-testid="input-building-no"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={formData.flatNo || ''}
                    onChange={(e) => handleInputChange('flatNo', e.target.value)}
                    placeholder="Flat"
                    className="h-8 text-sm"
                    data-testid="input-flat-no"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={formData.areaM2 || ''}
                    onChange={(e) => handleInputChange('areaM2', e.target.value)}
                    placeholder="Area"
                    className="h-8 text-sm"
                    data-testid="input-area-m2"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={formData.floor || ''}
                    onChange={(e) => handleInputChange('floor', e.target.value)}
                    placeholder="Floor"
                    className="h-8 text-sm"
                    data-testid="input-floor"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={formData.villaType || ''}
                    onChange={(e) => handleInputChange('villaType', e.target.value)}
                    placeholder="Villa Type"
                    className="h-8 text-sm"
                    data-testid="input-villa-type"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={formData.part || ''}
                    onChange={(e) => handleInputChange('part', e.target.value)}
                    placeholder="Part"
                    className="h-8 text-sm"
                    data-testid="input-part"
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleSave}
                      disabled={createMutation.isPending}
                      data-testid="button-save-location"
                    >
                      <Check className="w-4 h-4 text-green-600" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={resetForm}>
                      <X className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {isLoading ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                  Loading work locations...
                </TableCell>
              </TableRow>
            ) : locations.length === 0 && !isAddingNew ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                  <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No work locations added yet</p>
                  <p className="text-sm">Click "Add Location" to add work locations</p>
                </TableCell>
              </TableRow>
            ) : (
              locations.map((location) => (
                editingId === location.id ? (
                  <TableRow key={location.id} className="bg-muted/50">
                    <TableCell>
                      <Input
                        value={formData.unitCustomNumber || ''}
                        onChange={(e) => handleInputChange('unitCustomNumber', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={formData.unitZone || ''}
                        onChange={(e) => handleInputChange('unitZone', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={formData.unitCluster || ''}
                        onChange={(e) => handleInputChange('unitCluster', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={formData.unitBlock || ''}
                        onChange={(e) => handleInputChange('unitBlock', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={formData.buildingNo || ''}
                        onChange={(e) => handleInputChange('buildingNo', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={formData.flatNo || ''}
                        onChange={(e) => handleInputChange('flatNo', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={formData.areaM2 || ''}
                        onChange={(e) => handleInputChange('areaM2', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={formData.floor || ''}
                        onChange={(e) => handleInputChange('floor', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={formData.villaType || ''}
                        onChange={(e) => handleInputChange('villaType', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={formData.part || ''}
                        onChange={(e) => handleInputChange('part', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={handleSave}
                          disabled={updateMutation.isPending}
                        >
                          <Check className="w-4 h-4 text-green-600" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={resetForm}>
                          <X className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={location.id} data-testid={`row-location-${location.id}`}>
                    <TableCell className="font-medium">{location.unitCustomNumber || '-'}</TableCell>
                    <TableCell>{location.unitZone || '-'}</TableCell>
                    <TableCell>{location.unitCluster || '-'}</TableCell>
                    <TableCell>{location.unitBlock || '-'}</TableCell>
                    <TableCell>{location.buildingNo || '-'}</TableCell>
                    <TableCell>{location.flatNo || '-'}</TableCell>
                    <TableCell>{location.areaM2 || '-'}</TableCell>
                    <TableCell>{location.floor || '-'}</TableCell>
                    <TableCell>{location.villaType || '-'}</TableCell>
                    <TableCell>{location.part || '-'}</TableCell>
                    <TableCell>
                      {canModify && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEdit(location)}
                            disabled={isAddingNew || editingId !== null}
                            data-testid={`button-edit-location-${location.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(location.id)}
                            data-testid={`button-delete-location-${location.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface WorkLevelFormData {
  code: string;
  nameEnglish: string;
  nameArabic: string;
}

function WorkLevelsTab({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const userOrg = organizations.find(org => org.id === user?.organizationId);
  const canModify = user?.role === "super_admin" ||
    userOrg?.sectorType === "Developer" ||
    userOrg?.sectorType === "Contractor";

  const { toast } = useToast();
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formData, setFormData] = useState<WorkLevelFormData>({
    code: '',
    nameEnglish: '',
    nameArabic: '',
  });

  const { data: levels = [], isLoading } = useQuery<WorkLevel[]>({
    queryKey: ['/api/projects', projectId, 'work-levels'],
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertWorkLevel) => apiRequest('POST', '/api/work-levels', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'work-levels'] });
      resetForm();
      toast({ title: "Work level added successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error adding work level", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<WorkLevelFormData> }) =>
      apiRequest('PATCH', `/api/work-levels/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'work-levels'] });
      resetForm();
      toast({ title: "Work level updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error updating work level", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/work-levels/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'work-levels'] });
      setDeleteConfirmId(null);
      toast({ title: "Work level deleted" });
    },
  });

  const handleDeleteConfirm = () => {
    if (deleteConfirmId) {
      deleteMutation.mutate(deleteConfirmId);
    }
  };

  const levelToDelete = levels.find(l => l.id === deleteConfirmId);

  const resetForm = () => {
    setIsAddingNew(false);
    setEditingId(null);
    setFormData({ code: '', nameEnglish: '', nameArabic: '' });
  };

  const handleSave = () => {
    const isCodeDuplicate = levels.some(
      (level) => level.code === formData.code && level.id !== editingId
    );

    if (isCodeDuplicate) {
      toast({
        title: "Error / خطأ",
        description: "This code already exists / هذا الكود موجود بالفعل",
        variant: "destructive"
      });
      return;
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      const maxSortOrder = levels.reduce((max, l) => Math.max(max, l.sortOrder), 0);
      createMutation.mutate({
        ...formData,
        projectId,
        sortOrder: maxSortOrder + 1,
      } as InsertWorkLevel);
    }
  };

  const handleEdit = (level: WorkLevel) => {
    setEditingId(level.id);
    setFormData({
      code: level.code,
      nameEnglish: level.nameEnglish,
      nameArabic: level.nameArabic,
    });
    setIsAddingNew(false);
  };

  const startAddNew = () => {
    setIsAddingNew(true);
    setEditingId(null);
    setFormData({ code: '', nameEnglish: '', nameArabic: '' });
  };

  // Excel Export
  const handleExport = () => {
    const exportData = levels.map((level, index) => ({
      '#': index + 1,
      'Code': level.code,
      'English Title': level.nameEnglish,
      'Arabic Title': level.nameArabic,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Work Levels");
    XLSX.writeFile(wb, `Work_Levels_${projectId}.xlsx`);
    toast({ title: "Export successful" });
  };

  // Excel Import
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const maxSortOrder = levels.reduce((max, l) => Math.max(max, l.sortOrder), 0);

        const levelsToImport: InsertWorkLevel[] = data.map((row, index) => ({
          projectId,
          code: row['Code'] ? String(row['Code']).trim() : '',
          nameEnglish: row['English Title'] ? String(row['English Title']).trim() : '',
          nameArabic: row['Arabic Title'] ? String(row['Arabic Title']).trim() : '',
          sortOrder: maxSortOrder + index + 1,
        }));

        // Filter out rows with missing required fields
        const validLevels = levelsToImport.filter(l => l.code && l.nameEnglish && l.nameArabic);

        Promise.all(validLevels.map(level => createMutation.mutateAsync(level)))
          .then(() => {
            toast({ title: "Import successful", description: `Imported ${validLevels.length} work levels` });
          })
          .catch(err => {
            toast({ title: "Import partial or failed", description: err.message, variant: "destructive" });
          });
      } catch (err: any) {
        toast({ title: "Import failed", description: "Invalid file format", variant: "destructive" });
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // Download Template
  const handleDownloadTemplate = () => {
    const templateData = [{
      'Code': '01',
      'English Title': 'Ground Floor',
      'Arabic Title': 'الدور الأرضي',
    }];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Work_Levels_Template.xlsx");
    toast({ title: "Template downloaded" });
  };

  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading work levels...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Work Levels ({levels.length})</h3>
        <div className="flex items-center gap-2">
          {canModify && (
            <>
              <Button size="sm" variant="outline" onClick={handleDownloadTemplate} data-testid="button-download-levels-template">
                <FileText className="w-4 h-4 mr-2" />
                Template
              </Button>
              <Button size="sm" variant="outline" onClick={handleExport} data-testid="button-export-levels">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <div className="relative">
                <Input
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  id="import-levels-input"
                  onChange={handleImport}
                />
                <Button size="sm" variant="outline" asChild data-testid="button-import-levels">
                  <label htmlFor="import-levels-input" className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    Import
                  </label>
                </Button>
              </div>
              <Button
                size="sm"
                onClick={startAddNew}
                disabled={isAddingNew || editingId !== null}
                data-testid="button-add-work-level"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Level
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="h-[450px] overflow-auto border rounded-md relative">
        <Table className="border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12 bg-background border-b sticky top-0">#</TableHead>
              <TableHead className="w-24 bg-background border-b sticky top-0">Code</TableHead>
              <TableHead className="bg-background border-b sticky top-0">English Title</TableHead>
              <TableHead dir="rtl" className="bg-background border-b sticky top-0">Arabic Title</TableHead>
              <TableHead className="w-24 text-right bg-background border-b sticky top-0">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isAddingNew && (
              <TableRow data-testid="row-work-level-new">
                <TableCell className="font-mono text-muted-foreground">New</TableCell>
                <TableCell>
                  <Input
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="Code"
                    className="h-8"
                    data-testid="input-work-level-code"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={formData.nameEnglish}
                    onChange={(e) => setFormData({ ...formData, nameEnglish: e.target.value })}
                    placeholder="English Title"
                    className="h-8"
                    data-testid="input-work-level-name-english"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={formData.nameArabic}
                    onChange={(e) => setFormData({ ...formData, nameArabic: e.target.value })}
                    placeholder="العنوان بالعربي"
                    className="h-8"
                    dir="rtl"
                    data-testid="input-work-level-name-arabic"
                  />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleSave}
                      disabled={!formData.code || !formData.nameEnglish || !formData.nameArabic}
                      data-testid="button-save-work-level"
                    >
                      <Check className="w-4 h-4 text-green-600" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={resetForm}
                      data-testid="button-cancel-work-level"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {levels.length === 0 && !isAddingNew ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No work levels defined. Click "Add Level" to create one.
                </TableCell>
              </TableRow>
            ) : (
              levels.map((level, index) => (
                editingId === level.id ? (
                  <TableRow key={level.id} data-testid={`row-work-level-${level.id}`}>
                    <TableCell className="font-mono">{index + 1}</TableCell>
                    <TableCell>
                      <Input
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                        className="h-8"
                        data-testid="input-work-level-code-edit"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={formData.nameEnglish}
                        onChange={(e) => setFormData({ ...formData, nameEnglish: e.target.value })}
                        className="h-8"
                        data-testid="input-work-level-name-english-edit"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={formData.nameArabic}
                        onChange={(e) => setFormData({ ...formData, nameArabic: e.target.value })}
                        className="h-8"
                        dir="rtl"
                        data-testid="input-work-level-name-arabic-edit"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={handleSave}
                          data-testid="button-save-work-level-edit"
                        >
                          <Check className="w-4 h-4 text-green-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={resetForm}
                          data-testid="button-cancel-work-level-edit"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={level.id} data-testid={`row-work-level-${level.id}`}>
                    <TableCell className="font-mono">{index + 1}</TableCell>
                    <TableCell className="font-mono">{level.code}</TableCell>
                    <TableCell>{level.nameEnglish}</TableCell>
                    <TableCell dir="rtl">{level.nameArabic}</TableCell>
                    <TableCell>
                      {canModify && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEdit(level)}
                            disabled={isAddingNew || editingId !== null}
                            data-testid={`button-edit-level-${level.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteConfirmId(level.id)}
                            data-testid={`button-delete-level-${level.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف المستوى "{levelToDelete?.nameArabic}" ({levelToDelete?.code})؟
              <br />
              لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FormSettingsTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [generalOpen, setGeneralOpen] = useState(true);
  const [formSettingsOpen, setFormSettingsOpen] = useState(true);
  const [rbacOpen, setRbacOpen] = useState(false);
  const [selectedFormType, setSelectedFormType] = useState<string>("");
  const [selectedRbacType, setSelectedRbacType] = useState<string>("");

  const { data: requestTypeSettings = [], isLoading: settingsLoading } = useQuery<any[]>({
    queryKey: ['/api/projects', projectId, 'request-type-settings'],
  });

  const { data: requestTypes, isLoading: typesLoading } = useQuery<RequestType[]>({
    queryKey: ['/api/request-types'],
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ['/api/team'],
  });

  const { data: currentUser } = useQuery<User>({
    queryKey: ['/api/auth/session'],
    select: (data: any) => data.user,
  });

  const { data: permissions = [], refetch: refetchPermissions } = useQuery<any[]>({
    queryKey: ['/api/projects', projectId, 'permissions', selectedRbacType],
    enabled: !!selectedRbacType,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (data: { id?: string; requestTypeId: string; prefix?: string; nextNumber?: number; enabled?: boolean; requiresApproval?: boolean }) => {
      if (data.id) {
        return apiRequest('PATCH', `/api/projects/${projectId}/request-type-settings/${data.id}`, data);
      }
      return apiRequest('POST', `/api/projects/${projectId}/request-type-settings`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'request-type-settings'] });
      toast({ title: "Form settings updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error updating form settings", description: error.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'request-type-settings'] });
    },
  });

  const permissionMutation = useMutation({
    mutationFn: (data: { teamMemberId: string; requestTypeId: string; canView: boolean; canCreate: boolean; canEdit: boolean }) =>
      apiRequest('POST', `/api/projects/${projectId}/permissions`, data),
    onSuccess: () => {
      refetchPermissions();
      toast({ title: "Permission updated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update permission", description: error.message, variant: "destructive" });
    },
  });

  // Allow admin roles (org_admin, super_admin) to edit permissions
  const canEditPermissions = currentUser?.role === 'org_admin' || currentUser?.role === 'super_admin';

  if (settingsLoading || typesLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading settings...</div>;
  }

  // Show all active request types from the database
  const activeRequestTypes = (requestTypes?.filter(rt => rt.is_active) ?? [])
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <ScrollArea className="h-[500px] pr-4">
      <div className="space-y-4">
        {/* Form Settings Card with Type Selector */}
        <Collapsible open={formSettingsOpen} onOpenChange={setFormSettingsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover-elevate">
                <CardTitle className="text-base flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Form Settings
                  </div>
                  {formSettingsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
                <div>
                  <Label>Select Form Type</Label>
                  <Select value={selectedFormType} onValueChange={setSelectedFormType}>
                    <SelectTrigger className="mt-1" data-testid="select-form-type">
                      <SelectValue placeholder="Choose a form type to configure..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activeRequestTypes.map((rt) => (
                        <SelectItem key={rt.id} value={rt.id} data-testid={`form-type-${rt.code}`}>
                          {rt.name_english} ({rt.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedFormType && (
                  <div className="border rounded-md p-4 space-y-4 bg-muted/30">
                    {(() => {
                      const selectedType = activeRequestTypes.find(rt => rt.id === selectedFormType);
                      if (!selectedType) return null;

                      // Dynamic Form Configuration
                      const currentSetting = requestTypeSettings.find(s => s.requestTypeId === selectedType.id) || {
                        projectId: projectId,
                        requestTypeId: selectedType.id,
                        prefix: selectedType.code,
                        nextNumber: 1,
                        enabled: true,
                        requiresApproval: true,
                      };

                      return (
                        <>
                          <div className="flex items-center justify-between">
                            <div>
                              <Label className="text-base font-medium">{selectedType.name_english}</Label>
                              <p className="text-sm text-muted-foreground">{selectedType.name_arabic}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={selectedType.is_active ? "default" : "secondary"}>
                                {selectedType.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                          </div>

                          {selectedType.description && (
                            <p className="text-sm text-muted-foreground">{selectedType.description}</p>
                          )}

                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Enable Form</Label>
                              <p className="text-sm text-muted-foreground">Allow creating this form type in the project</p>
                            </div>
                            <Switch
                              checked={currentSetting.enabled}
                              onCheckedChange={(checked) => {
                                updateSettingsMutation.mutate({ ...currentSetting, enabled: checked });
                              }}
                              data-testid={`switch-${selectedType.code.toLowerCase()}-enabled`}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Prefix</Label>
                              <Input
                                key={`prefix-${selectedType.id}-${currentSetting.prefix}`}
                                defaultValue={currentSetting.prefix}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.currentTarget.blur();
                                  }
                                }}
                                onBlur={(e) => {
                                  const newVal = e.target.value;
                                  if (newVal && newVal !== currentSetting.prefix) {
                                    updateSettingsMutation.mutate({ ...currentSetting, prefix: newVal });
                                  }
                                }}
                                placeholder={selectedType.code}
                                data-testid={`input-${selectedType.code.toLowerCase()}-prefix`}
                              />
                            </div>
                            <div>
                              <Label>Next Number</Label>
                              <Input
                                key={`nextnum-${selectedType.id}-${currentSetting.nextNumber}`}
                                type="number"
                                defaultValue={currentSetting.nextNumber}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.currentTarget.blur();
                                  }
                                }}
                                onBlur={(e) => {
                                  const newVal = parseInt(e.target.value) || 1;
                                  if (newVal !== currentSetting.nextNumber) {
                                    updateSettingsMutation.mutate({ ...currentSetting, nextNumber: newVal });
                                  }
                                }}
                                min={1}
                                data-testid={`input-${selectedType.code.toLowerCase()}-next-number`}
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Requires Approval</Label>
                              <p className="text-sm text-muted-foreground">Forms must be approved before completion</p>
                            </div>
                            <Switch
                              checked={currentSetting.requiresApproval}
                              onCheckedChange={(checked) => {
                                updateSettingsMutation.mutate({ ...currentSetting, requiresApproval: checked });
                              }}
                              data-testid={`switch-${selectedType.code.toLowerCase()}-approval`}
                            />
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {!selectedFormType && (
                  <div className="text-center text-muted-foreground py-8 border rounded-md bg-muted/30">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Select a form type above to configure its settings</p>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* RBAC Table Card */}
        <Collapsible open={rbacOpen} onOpenChange={setRbacOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover-elevate">
                <CardTitle className="text-base flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Role-Based Access Control (RBAC)
                  </div>
                  {rbacOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Team member permissions for each form type
                  {!canEditPermissions && <span className="text-xs ml-2">(View only - Admin access required to edit)</span>}
                </p>

                <div>
                  <Label className="text-sm font-medium">Select Request Type</Label>
                  <Select value={selectedRbacType} onValueChange={setSelectedRbacType}>
                    <SelectTrigger className="mt-1" data-testid="select-rbac-type">
                      <SelectValue placeholder="Choose a request type to manage permissions..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activeRequestTypes.map((rt) => (
                        <SelectItem key={rt.id} value={rt.id} data-testid={`rbac-type-${rt.code}`}>
                          {rt.name_english} ({rt.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedRbacType && (
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]">Team Member</TableHead>
                          <TableHead className="w-[150px]">Position</TableHead>
                          <TableHead className="text-center w-[80px]">View</TableHead>
                          <TableHead className="text-center w-[80px]">Create</TableHead>
                          <TableHead className="text-center w-[80px]">Edit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teamMembers && teamMembers.length > 0 ? (
                          teamMembers.map((member) => {
                            const memberPermission = permissions?.find(p => p.teamMemberId === member.id);
                            const canView = memberPermission?.canView ?? true;
                            const canCreate = memberPermission?.canCreate ?? false;
                            const canEdit = memberPermission?.canEdit ?? false;

                            const handlePermissionChange = (field: 'canView' | 'canCreate' | 'canEdit', value: boolean) => {
                              if (!canEditPermissions) return;
                              permissionMutation.mutate({
                                teamMemberId: member.id,
                                requestTypeId: selectedRbacType,
                                canView: field === 'canView' ? value : canView,
                                canCreate: field === 'canCreate' ? value : canCreate,
                                canEdit: field === 'canEdit' ? value : canEdit,
                              });
                            };

                            return (
                              <TableRow key={member.id}>
                                <TableCell className="font-medium">
                                  {member.name}
                                  {member.nameArabic && (
                                    <span className="block text-xs text-muted-foreground">{member.nameArabic}</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">{member.position || '-'}</Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Checkbox
                                    checked={canView}
                                    onCheckedChange={(checked) => handlePermissionChange('canView', !!checked)}
                                    disabled={!canEditPermissions || permissionMutation.isPending}
                                    data-testid={`checkbox-view-${member.id}`}
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  <Checkbox
                                    checked={canCreate}
                                    onCheckedChange={(checked) => handlePermissionChange('canCreate', !!checked)}
                                    disabled={!canEditPermissions || permissionMutation.isPending}
                                    data-testid={`checkbox-create-${member.id}`}
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  <Checkbox
                                    checked={canEdit}
                                    onCheckedChange={(checked) => handlePermissionChange('canEdit', !!checked)}
                                    disabled={!canEditPermissions || permissionMutation.isPending}
                                    data-testid={`checkbox-edit-${member.id}`}
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              No team members found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {!selectedRbacType && (
                  <div className="text-center text-muted-foreground py-8 border rounded-md bg-muted/30">
                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Select a request type above to manage team member permissions</p>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </ScrollArea>
  );
}
