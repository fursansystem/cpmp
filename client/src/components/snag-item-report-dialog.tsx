import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, FileDown, MapPin, Layers, Calendar, Clock, AlertTriangle } from "lucide-react";
import { useRef } from "react";
import { format } from "date-fns";
import type { SnagList, SnagItem, Project } from "@shared/schema";

interface SnagItemReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: any; // Enriched snag item
  project: any;
  listNumber: string;
  itemNumber: string;
}

export default function SnagItemReportDialog({
  open,
  onOpenChange,
  item,
  project,
  listNumber,
  itemNumber,
}: SnagItemReportDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!item) return null;

  const getPrintStyles = () => `
    @media print {
      @page { margin: 5mm 8mm; size: A4; }
      body { 
        -webkit-print-color-adjust: exact; 
        font-size: 11px;
      }
      .no-print {
        display: none !important;
      }
      .print-only {
        display: block !important;
      }
    }
    .print-only {
      display: none;
    }
    body {
      font-family: Arial, sans-serif;
      font-size: 12px;
      line-height: 1.3;
      color: #000;
      margin: 0;
      padding: 10px;
      background: #fff;
    }
    .snag-report-container { max-width: 100%; margin: 0 auto; }
    .main-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    .main-table td, .main-table th {
      border: 1px solid #000;
      padding: 6px 8px;
      vertical-align: middle;
      font-size: 12px;
      color: #000;
    }
    .section-header { 
      background: #e2e8f0 !important; 
      font-weight: bold; 
      text-align: center; 
      padding: 8px; 
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .label-cell { 
      font-weight: bold; 
      width: 140px; 
      background: #f8fafc !important; 
    }
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      margin-top: 10px;
      margin-bottom: 15px;
    }
    .photo-card {
      border: 1px solid #000;
      padding: 5px;
      border-radius: 4px;
      text-align: center;
      background: #fff;
    }
    .photo-img {
      max-width: 100%;
      height: 180px;
      object-fit: cover;
      display: block;
      margin: 0 auto 5px auto;
    }
    .photo-caption {
      font-size: 10px;
      font-weight: bold;
      color: #334155;
    }
  `;

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Snag Report - ${itemNumber}</title>
          <style>${getPrintStyles()}</style>
        </head>
        <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 250);
  };

  const formattedDate = (d: any) => {
    if (!d) return "—";
    try {
      return format(new Date(d), "yyyy/MM/dd");
    } catch {
      return "—";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col rounded-[1.5rem] sm:rounded-[1.5rem]">
        <DialogHeader className="flex-row items-center justify-between gap-4 space-y-0 pb-3 border-b border-primary/10">
          <DialogTitle className="text-lg font-black text-foreground">Defect / Snag Report Form</DialogTitle>
          <div className="flex items-center gap-2 pr-10">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-primary/20 text-primary hover:bg-primary/5 hover:text-primary transition-all duration-200 shadow-sm"
              onClick={handlePrint}
            >
              <FileDown className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-primary/20 text-primary hover:bg-primary/5 hover:text-primary transition-all duration-200 shadow-sm"
              onClick={handlePrint}
            >
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-white dark:bg-gray-100 rounded-md p-6">
          <div
            ref={printRef}
            className="snag-report-container text-black"
            style={{
              fontFamily: "Arial, sans-serif",
              fontSize: "12px",
              lineHeight: "1.3",
              color: "#000",
              paddingTop: "15px",
            }}
          >
            {/* Header Document Box */}
             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
               <div style={{ width: "120px", fontWeight: "bold", fontSize: "14px" }}>
                 {project?.developerName || "DEVELOPER"}
               </div>
               <div style={{ flex: 1, textAlign: "center", margin: "0 20px" }}>
                 <div style={{ border: "2px solid #000", padding: "10px", background: "#f8fafc" }}>
                   <div style={{ fontSize: "18px", fontWeight: "bold", letterSpacing: "1px" }}>
                     FIELD DEFECT / SNAG REPORT FORM
                   </div>
                   <div style={{ fontSize: "10px", fontWeight: "bold", marginTop: "4px" }}>
                     {project?.name || "PROJECT NAME"}
                   </div>
                 </div>
               </div>
               <div style={{ width: "120px", textAlign: "right", fontWeight: "bold", fontSize: "14px" }}>
                 {project?.consultantName || "CONSULTANT"}
               </div>
             </div>

            {/* General Info Table */}
            <table className="main-table">
              <thead>
                <tr>
                  <th colSpan={4} className="section-header">1. Snag General Details</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="label-cell">Report No:</td>
                  <td style={{ fontWeight: "bold", fontSize: "13px" }}>{itemNumber}</td>
                  <td className="label-cell">Status:</td>
                  <td style={{ fontWeight: "bold", textTransform: "uppercase" }}>{item.status}</td>
                </tr>
                <tr>
                  <td className="label-cell">Project Name:</td>
                  <td>{project?.name || "—"}</td>
                  <td className="label-cell">Date Logged:</td>
                  <td>{formattedDate(item.createdAt)}</td>
                </tr>
                <tr>
                  <td className="label-cell">Consultant:</td>
                  <td>{project?.consultantName || "—"}</td>
                  <td className="label-cell">Contractor:</td>
                  <td>{project?.contractorName || "—"}</td>
                </tr>
                <tr>
                  <td className="label-cell">Division:</td>
                  <td>{item.division?.nameEnglish || item.division?.nameArabic || "—"}</td>
                  <td className="label-cell">Work Purpose:</td>
                  <td>{item.purpose?.nameEnglish || item.purpose?.nameArabic || "—"}</td>
                </tr>
                <tr>
                  <td className="label-cell">Work Location:</td>
                  <td>
                    {item.workLocation ? [
                      item.workLocation.unitCustomNumber ? `Unit ${item.workLocation.unitCustomNumber}` : null,
                      item.workLocation.buildingNo ? `Building ${item.workLocation.buildingNo}` : null,
                      item.workLocation.unitZone ? `Zone ${item.workLocation.unitZone}` : null,
                    ].filter(Boolean).join(" - ") : "—"}
                  </td>
                  <td className="label-cell">Work Level:</td>
                  <td>{item.workLevel?.nameEnglish || item.workLevel?.nameArabic || "—"}</td>
                </tr>
                <tr>
                  <td className="label-cell">Exact Location:</td>
                  <td colSpan={3}>{item.locationDetails || "—"}</td>
                </tr>
                <tr>
                  <td className="label-cell">Priority:</td>
                  <td style={{ textTransform: "uppercase" }}>{item.priority}</td>
                  <td className="label-cell">Due Date:</td>
                  <td>{formattedDate(item.dueDate)}</td>
                </tr>
                <tr>
                  <td className="label-cell">Defect Title:</td>
                  <td colSpan={3} style={{ fontWeight: "bold" }}>{item.title}</td>
                </tr>
                <tr>
                  <td className="label-cell">Description:</td>
                  <td colSpan={3} style={{ whiteSpace: "pre-wrap" }}>{item.description || "No description provided."}</td>
                </tr>
              </tbody>
            </table>

            {/* Resolution Table */}
            <table className="main-table">
              <thead>
                <tr>
                  <th colSpan={4} className="section-header">2. Contractor Resolution Details</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="label-cell">Action Taken:</td>
                  <td colSpan={3} style={{ minHeight: "60px", whiteSpace: "pre-wrap" }}>
                    {item.resolutionDescription || "No resolution details submitted yet."}
                  </td>
                </tr>
                <tr>
                  <td className="label-cell">Closed Date:</td>
                  <td>{formattedDate(item.closedAt)}</td>
                  <td className="label-cell">Assigned Engineer:</td>
                  <td>{item.assignedMember?.name || "—"}</td>
                </tr>
              </tbody>
            </table>

            {/* Photo Section */}
            {(item.beforeImages?.length > 0 || item.afterImages?.length > 0) && (
              <div style={{ pageBreakInside: "avoid" }}>
                <div style={{ border: "1px solid #000", background: "#e2e8f0", padding: "6px", fontWeight: "bold", textAlign: "center", textTransform: "uppercase", fontSize: "13px" }}>
                  3. Photographic Evidence
                </div>
                <div className="photo-grid">
                  {item.beforeImages?.slice(0, 2).map((img: string, idx: number) => (
                    <div key={`before-${idx}`} className="photo-card">
                      <img src={img} alt="Before Fix" className="photo-img" />
                      <div className="photo-caption">BEFORE FIX / INSPECTION PHOTO #{idx + 1}</div>
                    </div>
                  ))}
                  {item.afterImages?.slice(0, 2).map((img: string, idx: number) => (
                    <div key={`after-${idx}`} className="photo-card">
                      <img src={img} alt="After Fix" className="photo-img" />
                      <div className="photo-caption">AFTER FIX / RESOLUTION PHOTO #{idx + 1}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signatures Table */}
            <table className="main-table" style={{ marginTop: "20px", pageBreakInside: "avoid" }}>
              <thead>
                <tr>
                  <th colSpan={3} className="section-header">4. Verification & Sign-off</th>
                </tr>
                <tr>
                  <th style={{ width: "33%" }}>Role</th>
                  <th style={{ width: "33%" }}>Name & Position</th>
                  <th style={{ width: "34%" }}>Signature & Date</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: "bold", textAlign: "center" }}>Inspected & Reported By (Consultant)</td>
                  <td style={{ textAlign: "center", padding: "15px 8px" }}>—</td>
                  <td style={{ textAlign: "center", padding: "15px 8px" }}>
                    <div style={{ borderBottom: "1px dashed #000", width: "120px", margin: "10px auto 4px auto" }}></div>
                    Date: {formattedDate(item.createdAt)}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", textAlign: "center" }}>Resolved By (Contractor)</td>
                  <td style={{ textAlign: "center", padding: "15px 8px" }}>{item.assignedMember?.name || "—"}</td>
                  <td style={{ textAlign: "center", padding: "15px 8px" }}>
                    <div style={{ borderBottom: "1px dashed #000", width: "120px", margin: "10px auto 4px auto" }}></div>
                    Date: {item.closedAt ? formattedDate(item.closedAt) : "—"}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", textAlign: "center" }}>Closed & Verified By (Consultant)</td>
                  <td style={{ textAlign: "center", padding: "15px 8px" }}>—</td>
                  <td style={{ textAlign: "center", padding: "15px 8px" }}>
                    <div style={{ borderBottom: "1px dashed #000", width: "120px", margin: "10px auto 4px auto" }}></div>
                    Date: {item.closedAt ? formattedDate(item.closedAt) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
