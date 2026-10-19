import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, FileDown, AlertTriangle } from "lucide-react";
import { useRef, useMemo } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface SnagListReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: any;
  items: any[];
  project: any;
}

export default function SnagListReportDialog({
  open,
  onOpenChange,
  list,
  items,
  project,
}: SnagListReportDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users?skipFiltering=true"],
  });

  const relevantUserIds = useMemo(() => {
    const ids = new Set<string>();
    if (list?.createdBy) ids.add(list.createdBy);
    if (items) {
      items.forEach(i => {
        if (i.closedBy) ids.add(i.closedBy);
        if (i.resolvedBy) ids.add(i.resolvedBy);
      });
    }
    return Array.from(ids);
  }, [list, items]);

  const { data: userSignatures = [] } = useQuery<{ id: string; signature: string | null }[]>({
    queryKey: ["/api/users/signatures", relevantUserIds],
    queryFn: async () => {
      if (relevantUserIds.length === 0) return [];
      const res = await apiRequest("POST", "/api/users/signatures", { userIds: relevantUserIds });
      if (!res.ok) throw new Error("Failed to fetch signatures");
      return res.json();
    },
    enabled: open && relevantUserIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const getSignature = (userId?: string) => {
    if (!userId) return null;
    const found = userSignatures.find(s => s.id === userId || String(s.id) === String(userId));
    return found?.signature || null;
  };

  const getUserName = (userId?: string) => {
    if (!userId) return "—";
    const found = users.find(u => u.id === userId || String(u.id) === String(userId));
    if (!found) return userId;
    return found.fullName;
  };

  const getUserPosition = (userId?: string, purposeId?: string | null) => {
    if (!userId) return "Project Engineer";
    const found = users.find(u => u.id === userId || String(u.id) === String(userId));
    if (!found) return "Project Engineer";
    const linkedPositions: { title: string; purposeId: string | null }[] = found.positions || [];
    if (linkedPositions.length > 0) {
      // Prefer the position that matches this item's purpose (e.g. Electrical vs Mechanical)
      if (purposeId) {
        const matching = linkedPositions.find(p => p.purposeId === purposeId);
        if (matching) return matching.title;
      }
      return linkedPositions[0].title;
    }
    return found.role === "super_admin" ? "Project Manager" : "Project Engineer";
  };

  if (!list) return null;

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Snag List Report - ${list.title}</title>
          <style>${getPrintStyles()}</style>
        </head>
        <body>${printContent.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 250);
  };

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
      .page-break {
        page-break-before: always;
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
      border: 1px solid #ccc;
    }
    .photo-caption {
      font-size: 10px;
      font-weight: bold;
      text-transform: uppercase;
    }
    
    .summary-table th {
      background: #cbd5e1 !important;
      font-weight: bold;
      text-align: left;
    }
    .summary-table td, .summary-table th {
      padding: 6px;
      font-size: 11px;
    }
  `;

  const formattedDate = (d: any, includeTime = false) => {
    if (!d) return "—";
    try {
      return format(new Date(d), includeTime ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd");
    } catch {
      return "—";
    }
  };

  const formatListNumber = (num: number | undefined) => num ? `SL-${num.toString().padStart(2, "0")}` : "SL-01";
  const formatItemNumber = (listNum: number | undefined, itemNum: number | undefined, fallbackIndex?: number) => {
    const listStr = `SL-${(listNum || 1).toString().padStart(2, "0")}`;
    const num = itemNum || (fallbackIndex !== undefined ? fallbackIndex + 1 : undefined);
    if (!num) return listStr;
    return `${listStr}.${num}`;
  };

  // Sort items by createdAt ascending to guarantee stable serial numbers matching creation order
  const sortedItems = [...(items || [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0 bg-slate-50 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-white flex flex-row items-center justify-between shrink-0">
          <div>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Print Snag List Report
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Comprehensive report for list "{list.title}" with {items.length} remarks.
            </p>
          </div>
          <div className="flex items-center gap-2 no-print pr-10">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-8 bg-slate-100">
          <div
            ref={printRef}
            className="snag-report-container bg-white shadow-xl mx-auto"
            style={{ maxWidth: "210mm", padding: "20mm", minHeight: "297mm" }}
          >
            <style dangerouslySetInnerHTML={{ __html: getPrintStyles() }} />

            {/* --- PAGE 1: COVER & SUMMARY --- */}
            <div className="report-cover">
              <div style={{ textAlign: "center", marginBottom: "30px" }}>
                <h1 style={{ margin: "0 0 10px 0", fontSize: "24px", textTransform: "uppercase" }}>Snag List Report</h1>
                <h2 style={{ margin: "0", fontSize: "16px", color: "#475569" }}>{formatListNumber(list.serialNumber)}: {list.title}</h2>
              </div>

              <table className="main-table">
                <tbody>
                  <tr>
                    <td className="label-cell">Project Name:</td>
                    <td colSpan={3} style={{ fontWeight: "bold" }}>{project?.name || "—"}</td>
                  </tr>
                  <tr>
                    <td className="label-cell">Consultant:</td>
                    <td>{project?.consultantName || "—"}</td>
                    <td className="label-cell">Contractor:</td>
                    <td>{project?.contractorName || "—"}</td>
                  </tr>
                  <tr>
                    <td className="label-cell">Date:</td>
                    <td colSpan={3}>{formattedDate(list.listDate || list.createdAt)}</td>
                  </tr>
                  <tr>
                    <td className="label-cell">Total Remarks:</td>
                    <td>{items.length}</td>
                    <td className="label-cell">Status Breakdown:</td>
                    <td>
                      Open: {items.filter(i => i.status === 'open').length} |
                      In Prog: {items.filter(i => i.status === 'in_progress').length} |
                      Closed: {items.filter(i => i.status === 'closed').length}
                    </td>
                  </tr>
                </tbody>
              </table>

              <h3 style={{ marginTop: "30px", marginBottom: "10px", fontSize: "14px", borderBottom: "2px solid #000", paddingBottom: "5px" }}>Remarks List</h3>

              <table className="main-table summary-table">
                <thead>
                  <tr>
                    <th style={{ width: "13%" }}>S.N.</th>
                    <th style={{ width: "25%" }}>Division</th>
                    <th style={{ width: "42%" }}>Title</th>
                    <th style={{ width: "10%" }}>Priority</th>
                    <th style={{ width: "10%" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.length > 0 ? (
                    sortedItems.map((item, idx) => (
                      <tr key={`summary-${item.id}`}>
                        <td style={{ fontWeight: "bold" }}>{formatItemNumber(list.serialNumber, item.indexCode, idx)}</td>
                        <td>
                          <div>{item.division?.nameEnglish || item.division?.nameArabic || "—"}</div>
                          <div style={{ fontSize: "10px", color: "#475569" }}>
                            {[
                              item.workLocation?.unitCustomNumber ? `Unit ${item.workLocation.unitCustomNumber}` : null,
                              item.workLocation?.buildingNo ? `Bldg ${item.workLocation.buildingNo}` : null,
                            ].filter(Boolean).join(" - ")}
                          </div>
                        </td>
                        <td>{item.title}</td>
                        <td style={{ textTransform: "uppercase" }}>{item.priority}</td>
                        <td style={{ textTransform: "uppercase", fontWeight: "bold" }}>{item.status}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "20px" }}>No remarks found in this list.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* --- PAGES 2+: INDIVIDUAL REMARK SHEETS --- */}
            {sortedItems.map((item, idx) => (
              <div key={`sheet-${item.id}`} className="page-break" style={{ paddingTop: "20px" }}>

                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                  <h2 style={{ margin: "0", fontSize: "18px", textTransform: "uppercase" }}>Snag Remark Details</h2>
                  <div style={{ fontSize: "14px", marginTop: "5px", color: "#475569" }}>{formatItemNumber(list.serialNumber, item.indexCode, idx)}</div>
                </div>

                <table className="main-table">
                  <thead>
                    <tr>
                      <th colSpan={4} className="section-header">1. Snag General Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="label-cell">Report No:</td>
                      <td style={{ fontWeight: "bold", fontSize: "13px" }}>{formatItemNumber(list.serialNumber, item.indexCode, idx)}</td>
                      <td className="label-cell">Status:</td>
                      <td style={{ fontWeight: "bold", textTransform: "uppercase" }}>{item.status}</td>
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
                      <th
                        colSpan={5}
                        style={{
                          border: "1px solid #000",
                          padding: "6px",
                          background: "#cccccc",
                          fontWeight: "bold",
                          textAlign: "center",
                          fontSize: "13px",
                        }}
                      >
                        2. Contractor Resolution Details
                      </th>
                    </tr>
                    <tr style={{ background: "#e0e0e0" }}>
                      <th style={{ width: "22%", textAlign: "center" }}>Name</th>
                      <th style={{ width: "12%", textAlign: "center" }}>Action</th>
                      <th style={{ width: "26%", textAlign: "center" }}>Date</th>
                      <th style={{ width: "22%", textAlign: "center" }}>Position</th>
                      <th style={{ width: "18%", textAlign: "center" }}>Signature</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Step 1: Contractor Engineer Repair & Photo Upload */}
                    <tr>
                      <td>
                        {item.resolvedBy
                          ? getUserName(item.resolvedBy)
                          : item.assignedMember?.name || project?.contractorName || "Contractor Representative"}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {item.resolutionDescription || (item.afterImages && item.afterImages.length > 0) ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontWeight: "bold",
                              backgroundColor: "#3b82f6",
                              color: "#fff",
                              fontSize: "11px",
                            }}
                          >
                            Prepared
                          </span>
                        ) : (
                          <span style={{ color: "#666", fontStyle: "italic" }}>
                            In Progress
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {formattedDate(item.resolvedAt || item.updatedAt, true)}
                      </td>
                      <td>{getUserPosition(item.resolvedBy, item.purposeId || item.purpose?.id)}</td>
                      <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                        {getSignature(item.resolvedBy) ? (
                          <img
                            src={getSignature(item.resolvedBy)!}
                            alt="signature"
                            style={{ maxHeight: "28px", maxWidth: "90px", margin: "0 auto" }}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>

                    {/* Step 2: Contractor Manager Final Submission */}
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          border: "1px solid #000",
                          padding: "4px 6px",
                          background: "#f5f5f5",
                          fontWeight: "bold",
                          fontSize: "11px",
                        }}
                      >
                        Contractor Manager Submission
                      </td>
                    </tr>
                    <tr>
                      <td>
                        {item.resolvedBy
                          ? getUserName(item.resolvedBy)
                          : item.assignedMember?.name || project?.contractorName || "Contractor Representative"}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {item.status === "closed" || item.status === "pending_inspection" ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontWeight: "bold",
                              backgroundColor: "#22c55e",
                              color: "#fff",
                              fontSize: "11px",
                            }}
                          >
                            Submitted
                          </span>
                        ) : (
                          <span style={{ color: "#666", fontStyle: "italic" }}>
                            Pending
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {item.status === "closed" || item.status === "pending_inspection"
                          ? formattedDate(item.resolvedAt || item.updatedAt, true)
                          : "—"}
                      </td>
                      <td>{getUserPosition(item.resolvedBy, item.purposeId || item.purpose?.id)}</td>
                      <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                        {(item.status === "closed" || item.status === "pending_inspection") && getSignature(item.resolvedBy) ? (
                          <img
                            src={getSignature(item.resolvedBy)!}
                            alt="signature"
                            style={{ maxHeight: "28px", maxWidth: "90px", margin: "0 auto" }}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>

                    {item.resolutionDescription && (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            border: "1px solid #000",
                            padding: "6px 8px",
                            background: "#f8fafc",
                            fontSize: "11px",
                          }}
                        >
                          <span style={{ fontWeight: "bold" }}>Action Taken: </span>
                          <span>{item.resolutionDescription}</span>
                        </td>
                      </tr>
                    )}
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
                {/* --- CONSULTANT SIGN-OFF SECTION FOR THIS REMARK --- */}
                <div style={{ marginTop: "15px", pageBreakInside: "avoid" }}>
                  <table className="main-table">
                    <thead>
                      <tr>
                        <th
                          colSpan={5}
                          style={{
                            border: "1px solid #000",
                            padding: "6px",
                            background: "#cccccc",
                            fontWeight: "bold",
                            textAlign: "center",
                            fontSize: "13px",
                          }}
                        >
                          Consultant Sign-off & Verification
                        </th>
                      </tr>
                      <tr style={{ background: "#e0e0e0" }}>
                        <th style={{ width: "22%", textAlign: "center" }}>Name</th>
                        <th style={{ width: "12%", textAlign: "center" }}>Action</th>
                        <th style={{ width: "26%", textAlign: "center" }}>Date</th>
                        <th style={{ width: "22%", textAlign: "center" }}>Position</th>
                        <th style={{ width: "18%", textAlign: "center" }}>Signature</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Step 1: Consultant Creation / Inspection Issue */}
                      <tr>
                        <td>{getUserName(list.createdBy)}</td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontWeight: "bold",
                              backgroundColor: "#3b82f6",
                              color: "#fff",
                              fontSize: "11px",
                            }}
                          >
                            Log Note
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {formattedDate(item.createdAt || list.listDate || list.createdAt, true)}
                        </td>
                        <td>{getUserPosition(list.createdBy, item.purposeId || item.purpose?.id)}</td>
                        <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                          {getSignature(list.createdBy) ? (
                            <img
                              src={getSignature(list.createdBy)!}
                              alt="signature"
                              style={{ maxHeight: "28px", maxWidth: "90px", margin: "0 auto" }}
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>

                      {/* Step 2: Consultant Closure / Final Approval */}
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            border: "1px solid #000",
                            padding: "4px 6px",
                            background: "#f5f5f5",
                            fontWeight: "bold",
                            fontSize: "11px",
                          }}
                        >
                          Consultant Final Closure & Approval
                        </td>
                      </tr>
                      <tr>
                        <td>{getUserName(item.closedBy || list.createdBy)}</td>
                        <td style={{ textAlign: "center" }}>
                          {item.status === "closed" ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontWeight: "bold",
                                backgroundColor: "#22c55e",
                                color: "#fff",
                                fontSize: "11px",
                              }}
                            >
                              Closed
                            </span>
                          ) : (
                            <span style={{ color: "#666", fontStyle: "italic" }}>
                              Pending
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {item.status === "closed" ? formattedDate(item.updatedAt, true) : "—"}
                        </td>
                        <td>{getUserPosition(item.closedBy || list.createdBy, item.purposeId || item.purpose?.id)}</td>
                        <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                          {item.status === "closed" && getSignature(item.closedBy || list.createdBy) ? (
                            <img
                              src={getSignature(item.closedBy || list.createdBy)!}
                              alt="signature"
                              style={{ maxHeight: "28px", maxWidth: "90px", margin: "0 auto" }}
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
