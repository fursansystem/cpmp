import React, { useRef, useMemo, useState, useEffect } from "react";
import { InlinePdfViewer } from "./wir-form-dialog";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Printer, FileDown } from "lucide-react";
import type { Project, Organization } from "@shared/schema";
import { formatGMT3, safeFormat } from "@/lib/utils";

interface StatusHistoryItem {
  id: string;
  revisionId: string;
  oldStatus: string;
  newStatus: string;
  changedBy: string;
  remarks: string | null;
  changedAt: string;
  userName?: string;
}

interface RevisionData {
  id: string;
  requestId: string;
  revisionNo: number;
  title: string;
  description: string | null;
  workLocationId: string | null;
  scheduledDate: string | null;
  remarks: string | null;
  createdBy: string;
  createdAt: string;
  metadata?: Record<string, any> | null;
  divisionName?: string | null;
  chapterName?: string | null;
  approvalStatusCode?: string | null;
}

interface RequestDocument {
  id: string;
  revisionId: string;
  documentType: string | null;
  documentRef: string | null;
  description: string | null;
  title: string | null;
  fileName: string | null;
  fileUrl: string | null;
  uploadedBy: string | null;
  uploadedAt: string | null;
}

interface RequestAttachment {
  id: string;
  revisionId: string;
  fileName: string;
  fileType: string;
  fileData: string | null;
  fileUrl?: string | null;
  fileSize?: number | null;
  uploadedBy: string | null;
  uploadedAt: string | null;
}

interface RequestWorkLocation {
  id: string;
  revisionId: string;
  workLocationId: string;
  unit: string | null;
  zone: string | null;
  block: string | null;
  building: string | null;
  floor: string | null;
  part: string | null;
}

interface ConsultantReview {
  id: string;
  revisionId: string;
  residentEngineerUserId: string | null;
  comments: string | null;
  statusCode: string | null;
  reviewedAt: string | null;
}

export interface NcrFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestNumber: string;
  referenceCode?: string;
  requestTypeCode: string;
  project: Project | undefined;
  developer: Organization | undefined;
  contractor: Organization | undefined;
  consultant: Organization | undefined;
  currentRevision: RevisionData | undefined;
  statusHistory: StatusHistoryItem[];
  revisionDocuments: RequestDocument[];
  revisionAttachments?: RequestAttachment[];
  revisionLocations: RequestWorkLocation[];
  consultantReviews?: ConsultantReview[];
  getUserName: (userId: string) => string;
  getUserSignature?: (userId: string) => string;
  getUserPosition?: (userId: string) => string;
  createdAt?: string;
  updatedAt?: string;
  contractorName?: string | null;
  consultantName?: string | null;
  projectName?: string | null;
  parentNcrRevision?: any;
}

export function NcrFormDialog({
  open,
  onOpenChange,
  requestNumber,
  referenceCode,
  requestTypeCode,
  project,
  developer,
  contractor,
  consultant,
  currentRevision,
  statusHistory,
  revisionDocuments,
  revisionAttachments = [],
  revisionLocations,
  consultantReviews = [],
  getUserName,
  createdAt,
  updatedAt,
  contractorName,
  consultantName,
  projectName,
  getUserSignature,
  getUserPosition,
  parentNcrRevision,
}: NcrFormDialogProps) {
  const getFileUrl = (url?: string) => {
    if (!url) return "";
    if (url.startsWith('http') || url.startsWith('/')) return url;
    if (url.includes('/') || url.includes('.')) return `/${url}`;
    return url;
  };

  const isImageFile = (fileName?: string | null, fileUrl?: string | null) => {
    if (!fileName && !fileUrl) return false;
    const name = (fileName || "").toLowerCase();
    const url = (fileUrl || "").toLowerCase();
    return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "jfif"].some(ext =>
      name.endsWith(`.${ext}`) || url.includes(`.${ext}?`) || url.endsWith(`.${ext}`)
    );
  };

  const isPdfFile = (fileName?: string | null, fileUrl?: string | null) => {
    if (!fileName && !fileUrl) return false;
    const name = (fileName || "").toLowerCase();
    const url = (fileUrl || "").toLowerCase();
    return name.endsWith(".pdf") || url.includes(".pdf?") || url.endsWith(".pdf");
  };

  const printRef = useRef<HTMLDivElement>(null);

  const relevantUserIds = useMemo(() => {
    return Array.from(new Set(statusHistory.map(h => h.changedBy))).filter(Boolean);
  }, [statusHistory]);

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

  const getSignature = (userId: string): string => {
    const signatureObj = userSignatures?.find(s => s.id === userId);
    if (signatureObj?.signature) return signatureObj.signature;
    return getUserSignature ? getUserSignature(userId) : "";
  };

  const getPosition = (userId: string): string => {
    return getUserPosition ? getUserPosition(userId) : "";
  };

  const getPrintStyles = () => `
    @media print {
      @page { margin: 5mm 8mm; size: A4; }
      body { 
        -webkit-print-color-adjust: exact; 
        font-size: 11px;
      }
      .footer-copyright {
        position: fixed;
        bottom: 5px;
        left: 40px;
        right: 40px;
        margin: 0 !important;
      }
      table {
        margin-bottom: 6px !important;
      }
      td, th {
        padding: 3px 4px !important;
        font-size: 11px !important;
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
      line-height: 1.25;
      color: #000;
      margin: 0;
      padding: 10px;
      background: #fff;
      height: auto;
    }
    .ncr-container { max-width: 100%; margin: 0 auto; }
    .main-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
    }
    .main-table td, .main-table th {
      border: 1px solid #000;
      padding: 3px 5px;
      vertical-align: top;
      font-size: 12px;
    }
    .section-header { background: #d0d0d0; font-weight: bold; text-align: center; padding: 4px; }
    .label-cell { font-weight: bold; width: 120px; background: #f5f5f5; }
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
          <title>${requestTypeCode} - ${requestNumber}</title>
          <style>${getPrintStyles()}</style>
        </head>
        <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 250);
  };

  const handleDownloadPDF = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${requestTypeCode} - ${requestNumber}</title>
          <style>${getPrintStyles()}</style>
        </head>
        <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 250);
  };

  const isRNCR = requestTypeCode === "RNCR";
  const finalTitle = isRNCR ? "REPLY TO NON - CONFORMANCE REPORT (RNCR)" : "NON - CONFORMANCE REPORT (NCR)";

  const displayCreatedAt = currentRevision?.createdAt || createdAt;
  const createdDate = safeFormat(displayCreatedAt, "yyyy/MM/dd");

  const consultantNameStr = consultantName || consultant?.name || "";
  const contractorNameStr = contractorName || contractor?.name || "";
  const projNameStr = projectName || project?.name || "";

  // Get people who took action
  // Get people who took action
  const preparer = statusHistory.find(h => h.newStatus === "Submitted" || h.newStatus === "Draft" || h.newStatus === "Contractor Internal Review");
  
  // Distinguish RNCR and NCR roles
  // Contractor PM is specifically the one who approves for the contractor
  const contractorPM = isRNCR ? statusHistory.find(h => h.newStatus.includes("Contractor PM")) : undefined;
  
  // Consultant Reviewer
  const reviewer = statusHistory.find(h => h.newStatus === "Under Review" || h.newStatus === "Consultant Internal Review");

  // Final Approver (Consultant Manager)
  const approver = statusHistory.find(h => 
    h.newStatus.includes("Consultant Manager Approval") || 
    h.newStatus === "Resolved" || 
    h.newStatus === "Closed"
  );

  const getActionLabel = (newStatus: string) => {
    const statusLower = newStatus.toLowerCase();
    
    if (statusLower === "under review" || statusLower === "consultant internal review") {
      return "Received";
    }
    
    if (
      statusLower.includes("approved") ||
      statusLower.includes("rejected") ||
      statusLower.includes("resolved") ||
      statusLower.includes("closed")
    ) {
      const code = currentRevision?.approvalStatusCode;
      
      // If it's the Consultant Manager's action
      if (statusLower.includes("manager") || statusLower === "resolved") {
        if (code === "D" || statusLower.includes("reject")) {
          return "PM Rejected";
        }
        return "PM Approved";
      }
      
      // For general consultant team actions
      if (code === "D" || statusLower.includes("reject")) {
        return "Rejected";
      }
      if (code === "C") {
        return "Revise & Resubmit";
      }
      return "Approved";
    }
    
    return newStatus;
  };

  const consultantTableNode = (
    <table className="main-table" style={{ marginTop: "10px" }}>
      <thead>
        <tr>
          <th colSpan={5} className="section-header">Consultant</th>
        </tr>
        <tr>
          <th style={{ width: "25%" }}>Name</th>
          <th style={{ width: "20%" }}>Action</th>
          <th style={{ width: "15%" }}>Date</th>
          <th style={{ width: "20%" }}>Position</th>
          <th style={{ width: "20%" }}>Signature</th>
        </tr>
      </thead>
      <tbody>
        {!isRNCR && preparer && (
          <tr>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>{getUserName(preparer.changedBy)}</td>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>Prepared</td>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>{safeFormat(preparer.changedAt, "yyyy/MM/dd")}</td>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>{getPosition(preparer.changedBy)}</td>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>
              {getSignature(preparer.changedBy) && (
                <img src={getSignature(preparer.changedBy)} alt="Signature" style={{ height: "40px", margin: "0 auto" }} />
              )}
            </td>
          </tr>
        )}
        {isRNCR && reviewer && (
          <tr>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>{getUserName(reviewer.changedBy)}</td>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>{getActionLabel(reviewer.newStatus)}</td>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>{safeFormat(reviewer.changedAt, "yyyy/MM/dd")}</td>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>{getPosition(reviewer.changedBy)}</td>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>
              {getSignature(reviewer.changedBy) && (
                <img src={getSignature(reviewer.changedBy)} alt="Signature" style={{ height: "40px", margin: "0 auto" }} />
              )}
            </td>
          </tr>
        )}
        {approver && (
          <tr>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>{getUserName(approver.changedBy)}</td>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>{getActionLabel(approver.newStatus)}</td>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>{safeFormat(approver.changedAt, "yyyy/MM/dd")}</td>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>{getPosition(approver.changedBy)}</td>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>
              {getSignature(approver.changedBy) && (
                <img src={getSignature(approver.changedBy)} alt="Signature" style={{ height: "40px", margin: "0 auto" }} />
              )}
            </td>
          </tr>
        )}
        {((isRNCR && !reviewer && !approver) || (!isRNCR && !preparer && !approver)) && (
          <tr>
            <td colSpan={5} style={{ textAlign: "center", padding: "10px" }}>No consultant actions yet</td>
          </tr>
        )}
      </tbody>
    </table>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col rounded-[1.5rem] sm:rounded-[1.5rem]">
        <DialogHeader className="flex-row items-center justify-between gap-4 space-y-0 pb-3 border-b border-primary/10">
          <DialogTitle className="text-lg font-black text-foreground">{finalTitle}</DialogTitle>
          <div className="flex items-center gap-2 pr-10">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-primary/20 text-primary hover:bg-primary/5 hover:text-primary transition-all duration-200 shadow-sm"
              onClick={handleDownloadPDF}
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

        <div className="flex-1 overflow-auto bg-white dark:bg-gray-100 rounded-md p-4">
          <style>{`
            .ncr-container { max-width: 100%; margin: 0 auto; }
            .main-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 8px;
            }
            .main-table td, .main-table th {
              border: 1px solid #000;
              padding: 3px 5px;
              vertical-align: top;
              font-size: 12px;
              color: #000;
            }
            .section-header { background: #d0d0d0 !important; font-weight: bold; text-align: center; padding: 4px; }
            .label-cell { font-weight: bold; width: 120px; background: #f5f5f5 !important; }
          `}</style>
          <div
            ref={printRef}
            className="ncr-container text-black"
            style={{
              fontFamily: "Arial, sans-serif",
              fontSize: "12px",
              lineHeight: "1.3",
              color: "#000",
              paddingTop: "15px",
            }}
          >
            {/* Header Logos */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <div style={{ width: "100px", textAlign: "center" }}>
                {developer?.logo && (
                  <img
                    src={developer.logo}
                    alt="Developer Logo"
                    style={{
                      maxHeight: "60px",
                      maxWidth: "100px",
                      objectFit: "contain",
                    }}
                  />
                )}
              </div>
              <div style={{ flex: 1, textAlign: "center", margin: "0 20px" }}>
                <div
                  style={{
                    border: "1px solid #000",
                    padding: "8px",
                    background: "#f0f0f0",
                  }}
                >
                  <div style={{ fontSize: "18px", fontWeight: "bold" }}>
                    {finalTitle}
                  </div>
                </div>
              </div>
              <div
                style={{
                  width: "200px",
                  textAlign: "center",
                  display: "flex",
                  gap: "8px",
                  justifyContent: "center",
                }}
              >
                {contractor?.logo && (
                  <img
                    src={contractor.logo}
                    alt="Contractor Logo"
                    style={{
                      maxHeight: "60px",
                      maxWidth: "100px",
                      objectFit: "contain",
                    }}
                  />
                )}
                {consultant?.logo && (
                  <img
                    src={consultant.logo}
                    alt="Consultant Logo"
                    style={{
                      maxHeight: "50px",
                      maxWidth: "100px",
                      objectFit: "contain",
                    }}
                  />
                )}
              </div>
            </div>

            {/* Project Info Table */}
            <table className="main-table">
              <tbody>
                <tr>
                  <td className="label-cell">Project Title :</td>
                  <td colSpan={5}>{projectName || project?.name || "—"}</td>
                </tr>
                <tr>
                  <td className="label-cell">Developer :</td>
                  <td colSpan={5}>{developer?.name || "—"}</td>
                </tr>
                <tr>
                  <td className="label-cell">Consultant :</td>
                  <td colSpan={5}>{consultant?.name || consultantName || "—"}</td>
                </tr>
                <tr>
                  <td className="label-cell">Contractors :</td>
                  <td colSpan={5}>{contractor?.name || contractorName || "—"}</td>
                </tr>
                <tr>
                  <td className="label-cell">Request No :</td>
                  <td>{requestNumber || referenceCode}</td>
                  <td className="label-cell" style={{ width: "100px" }}>Revision No :</td>
                  <td>{currentRevision?.revisionNo ?? "0"}</td>
                  <td className="label-cell" style={{ width: "100px" }}>Posting Date :</td>
                  <td>{createdDate}</td>
                </tr>

                <tr>
                  <td className="label-cell">Division :</td>
                  <td colSpan={2}>{currentRevision?.divisionName || "—"}</td>
                  <td className="label-cell" style={{ width: "100px" }}>Chapter :</td>
                  <td colSpan={2}>{currentRevision?.chapterName || "—"}</td>
                </tr>

                <tr>
                  <td className="label-cell">Type :</td>
                  <td colSpan={5}>
                    { ((parentNcrRevision?.metadata || currentRevision?.metadata) as any)?.ncrType || "—" }
                  </td>
                </tr>
                <tr>
                  <td className="label-cell" style={{ whiteSpace: "nowrap", width: "1%" }}>Source of Non Conformance :</td>
                  <td colSpan={5}>
                    { ((parentNcrRevision?.metadata || currentRevision?.metadata) as any)?.ncrSource || "—" }
                  </td>
                </tr>
                <tr>
                  <td className="label-cell">Subject :</td>
                  <td colSpan={5}>
                    { (currentRevision?.metadata as any)?.ncrSubject || "—" }
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Contractor Section */}
            {isRNCR && (
              <table className="main-table" style={{ marginTop: "10px" }}>
                <thead>
                  <tr>
                    <th colSpan={5} className="section-header">Contractor</th>
                  </tr>
                  <tr>
                    <th style={{ width: "25%" }}>Name</th>
                    <th style={{ width: "20%" }}>Action</th>
                    <th style={{ width: "15%" }}>Date</th>
                    <th style={{ width: "20%" }}>Position</th>
                    <th style={{ width: "20%" }}>Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {preparer ? (
                    <tr>
                      <td style={{ textAlign: "center", verticalAlign: "middle" }}>{getUserName(preparer.changedBy)}</td>
                      <td style={{ textAlign: "center", verticalAlign: "middle" }}>Prepared</td>
                      <td style={{ textAlign: "center", verticalAlign: "middle" }}>{safeFormat(preparer.changedAt, "yyyy/MM/dd")}</td>
                      <td style={{ textAlign: "center", verticalAlign: "middle" }}>{getPosition(preparer.changedBy)}</td>
                      <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                        {getSignature(preparer.changedBy) && (
                          <img src={getSignature(preparer.changedBy)} alt="Signature" style={{ height: "40px", margin: "0 auto" }} />
                        )}
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "10px" }}>No contractor preparation yet</td>
                    </tr>
                  )}
                  {contractorPM ? (
                    <tr>
                      <td style={{ textAlign: "center", verticalAlign: "middle" }}>{getUserName(contractorPM.changedBy)}</td>
                      <td style={{ textAlign: "center", verticalAlign: "middle" }}>PM Approved</td>
                      <td style={{ textAlign: "center", verticalAlign: "middle" }}>{safeFormat(contractorPM.changedAt, "yyyy/MM/dd")}</td>
                      <td style={{ textAlign: "center", verticalAlign: "middle" }}>{getPosition(contractorPM.changedBy)}</td>
                      <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                        {getSignature(contractorPM.changedBy) && (
                          <img src={getSignature(contractorPM.changedBy)} alt="Signature" style={{ height: "40px", margin: "0 auto" }} />
                        )}
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "10px" }}>No contractor manager approval yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Consultant Section (for NCR) */}
            {!isRNCR && consultantTableNode}

            {/* Description Section */}
            <table className="main-table" style={{ marginTop: "10px" }}>
              <thead>
                <tr>
                  <th className="section-header">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "10px", verticalAlign: "top" }}>
                    <div dir="auto" style={{ minHeight: "250px", whiteSpace: "pre-wrap", fontSize: "16px", lineHeight: "1.6" }}>
                      {currentRevision?.description || "No description provided"}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Attachments Section */}
            <table className="main-table" style={{ marginTop: "10px" }}>
              <thead>
                <tr>
                  <th colSpan={3} className="section-header">Attachments</th>
                </tr>
                <tr>
                  <th style={{ width: "10%" }}>No.</th>
                  <th style={{ width: "45%" }}>Title</th>
                  <th style={{ width: "45%" }}>File Name</th>
                </tr>
              </thead>
              <tbody>
                {revisionAttachments && revisionAttachments.length > 0 ? (
                  revisionAttachments.map((a, idx) => (
                    <tr key={a.id}>
                      <td style={{ textAlign: "center" }}>{idx + 1}</td>
                      <td>—</td>
                      <td>{a.fileName}</td>
                    </tr>
                  ))
                ) : revisionDocuments && revisionDocuments.length > 0 ? (
                  revisionDocuments.map((d, idx) => (
                    <tr key={d.id}>
                      <td style={{ textAlign: "center" }}>{idx + 1}</td>
                      <td>{d.title || "—"}</td>
                      <td>{d.fileName || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", padding: "10px" }}>No attachments added</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Consultant Section (for RNCR) */}
            {isRNCR && consultantTableNode}

            {/* Inline Attachments (Images & PDFs) */}
            {((revisionAttachments && revisionAttachments.length > 0) || (revisionDocuments && revisionDocuments.length > 0)) && (
              (() => {
                const attachmentsToRender = revisionAttachments && revisionAttachments.length > 0 
                  ? revisionAttachments.map(a => ({ id: a.id, fileName: a.fileName, fileUrl: a.fileUrl || a.fileData, title: a.fileName }))
                  : revisionDocuments.map(d => ({ id: d.id, fileName: d.fileName || "", fileUrl: d.fileUrl || null, title: d.title || d.fileName || "Document" }));

                const validAttachments = attachmentsToRender.filter(att => 
                  att.fileUrl && (
                    isPdfFile(att.fileName, att.fileUrl) ||
                    isImageFile(att.fileName, att.fileUrl)
                  )
                );

                if (validAttachments.length === 0) return null;

                return (
                  <div style={{ pageBreakBefore: "always", paddingTop: "0px", marginTop: "0px" }}>
                    <div style={{ textAlign: "center", marginBottom: "15px" }}>
                      <h3 style={{ fontSize: "16px", fontWeight: "bold", display: "inline-block", paddingBottom: "5px" }}>
                        Attachments / المرفقات
                      </h3>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>
                      {validAttachments.map((att, idx) => {
                        const fileSrc = getFileUrl(att.fileUrl || undefined);
                        const isPDF = isPdfFile(att.fileName, att.fileUrl);
                        
                        return (
                          <div key={att.id || idx} style={{ width: "100%" }}>
                            <p style={{ fontWeight: "bold", marginBottom: "8px", fontSize: "13px" }}>
                              {idx + 1} - {att.title}
                            </p>
                            <div style={{ width: "100%", marginTop: "10px", display: "flex", justifyContent: "center" }}>
                              {isPDF ? (
                                <InlinePdfViewer fileUrl={fileSrc} />
                              ) : (
                                <img
                                  src={fileSrc}
                                  alt={att.title}
                                  style={{ maxWidth: "100%", height: "auto", border: "1px solid #000", background: "#fff", display: "block", margin: "0 auto" }}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()
            )}

            {/* Consultant Comments Section (for RNCR) */}
            {isRNCR && (
              <table className="main-table" style={{ marginTop: "10px" }}>
                <thead>
                  <tr>
                    <th className="section-header">Consultant Comments</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: "10px", verticalAlign: "top" }}>
                      <div dir="auto" style={{ minHeight: "150px", whiteSpace: "pre-wrap", fontSize: "16px", lineHeight: "1.6" }}>
                        {consultantReviews[0]?.comments || "No comments provided"}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
