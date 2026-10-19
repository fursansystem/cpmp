import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "@/hooks/use-toast";

interface ColumnMapping {
  key: string;
  header: string;
  required?: boolean;
}

interface ExcelImportExportProps {
  data: Record<string, unknown>[];
  columns: ColumnMapping[];
  entityName: string;
  onImport: (data: Record<string, unknown>[]) => Promise<void>;
  isImporting?: boolean;
}

export function ExcelImportExport({
  data,
  columns,
  entityName,
  onImport,
  isImporting = false,
}: ExcelImportExportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    if (data.length === 0) {
      toast({
        title: "No data to export",
        description: `There are no ${entityName} to export.`,
        variant: "destructive",
      });
      return;
    }

    const exportData = data.map((item) => {
      const row: Record<string, unknown> = {};
      columns.forEach((col) => {
        row[col.header] = item[col.key] ?? "";
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, entityName);

    const colWidths = columns.map((col) => ({ wch: Math.max(col.header.length + 5, 15) }));
    worksheet["!cols"] = colWidths;

    const fileName = `${entityName.toLowerCase().replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    toast({
      title: "Export successful",
      description: `${data.length} ${entityName} exported to ${fileName}`,
    });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

      if (jsonData.length === 0) {
        toast({
          title: "Empty file",
          description: "The Excel file contains no data.",
          variant: "destructive",
        });
        return;
      }

      const rowKeys = Object.keys(jsonData[0] || {});
      const headerMap = new Map<string, string>();
      columns.forEach((col) => {
        const matchedKey = rowKeys.find(
          (k) => k.toLowerCase().trim() === col.header.toLowerCase().trim() ||
                 k.toLowerCase().trim() === col.key.toLowerCase().trim()
        );
        if (matchedKey) {
          headerMap.set(col.key, matchedKey);
        }
      });

      const mappedData = jsonData.map((row) => {
        const mappedRow: Record<string, unknown> = {};
        columns.forEach((col) => {
          const excelKey = headerMap.get(col.key) || col.header;
          const value = row[excelKey];
          if (value !== undefined && value !== null && value !== "") {
            if (typeof value === "number") {
              mappedRow[col.key] = value;
            } else {
              mappedRow[col.key] = String(value).trim();
            }
          }
        });
        return mappedRow;
      });

      const requiredColumns = columns.filter((c) => c.required);
      const missingHeaders = requiredColumns.filter((col) => !headerMap.has(col.key));
      
      if (missingHeaders.length > 0) {
        toast({
          title: "Missing columns",
          description: `Excel file is missing required columns: ${missingHeaders.map((c) => c.header).join(", ")}. Please use the Template button to download the correct format.`,
          variant: "destructive",
        });
        return;
      }

      const validData = mappedData.filter((row) => {
        return requiredColumns.every((col) => {
          const value = row[col.key];
          return value !== undefined && value !== null && value !== "";
        });
      });

      if (validData.length === 0) {
        toast({
          title: "Invalid data",
          description: `No valid rows found. All required columns must have values: ${requiredColumns.map((c) => c.header).join(", ")}`,
          variant: "destructive",
        });
        return;
      }

      await onImport(validData);

      toast({
        title: "Import successful",
        description: `${validData.length} ${entityName} imported successfully.`,
      });
    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to process file",
        variant: "destructive",
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      columns.reduce((acc, col) => {
        acc[col.header] = col.required ? "(required)" : "(optional)";
        return acc;
      }, {} as Record<string, string>),
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");

    const colWidths = columns.map((col) => ({ wch: Math.max(col.header.length + 5, 15) }));
    worksheet["!cols"] = colWidths;

    XLSX.writeFile(workbook, `${entityName.toLowerCase().replace(/\s+/g, "_")}_template.xlsx`);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileChange}
        className="hidden"
        data-testid={`input-import-${entityName.toLowerCase().replace(/\s+/g, "-")}`}
      />
      
      <Button
        variant="outline"
        size="sm"
        onClick={handleImportClick}
        disabled={isImporting}
        data-testid={`button-import-${entityName.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <Upload className="h-4 w-4 mr-2" />
        Import
      </Button>
      
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        data-testid={`button-export-${entityName.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <Download className="h-4 w-4 mr-2" />
        Export
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={downloadTemplate}
        className="text-muted-foreground"
        data-testid={`button-template-${entityName.toLowerCase().replace(/\s+/g, "-")}`}
      >
        Template
      </Button>
    </div>
  );
}
