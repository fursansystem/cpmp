import React, { useRef, useMemo, useState } from "react";
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
import { Printer, FileDown, Eye, CheckCircle2, Clock, Paperclip, FileText, Image as ImageIcon } from "lucide-react";
import type { Project, Organization } from "@shared/schema";
import { safeFormat } from "@/lib/utils";

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
  scheduledDate: string | null;
  remarks: string | null;
  createdBy: string;
  createdAt: string;
  metadata?: Record<string, any> | null;
  approvalStatusCode?: string | null;
  approvalComments?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  divisionName?: string | null;
  chapterName?: string | null;
  workLevelName?: string | null;
  workLevelId?: string | null;
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

export interface SiFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestNumber: string;
  referenceCode?: string;
  requestTypeCode?: string;
  project: Project | undefined;
  developer?: Organization | undefined;
  contractor: Organization | undefined;
  consultant: Organization | undefined;
  currentRevision: RevisionData | undefined;
  statusHistory?: StatusHistoryItem[];
  revisionDocuments?: RequestDocument[];
  revisionAttachments?: RequestAttachment[];
  getUserName?: (userId: string) => string;
  getUserSignature?: (userId: string) => string;
  getUserPosition?: (userId: string) => string;
  createdAt?: string;
  updatedAt?: string;
  contractorName?: string | null;
  consultantName?: string | null;
  projectName?: string | null;
  workLevels?: { id: string; nameEnglish?: string | null; code?: string | null }[] | null;
}

export function SiFormDialog({
  open,
  onOpenChange,
  requestNumber,
  referenceCode,
  requestTypeCode = "SI",
  project,
  developer,
  contractor,
  consultant,
  currentRevision,
  statusHistory = [],
  revisionDocuments = [],
  revisionAttachments = [],
  getUserName = (id) => id,
  getUserSignature,
  getUserPosition,
  createdAt,
  updatedAt,
  contractorName,
  consultantName,
  projectName,
  workLevels,
}: SiFormDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [selectedFileForPreview, setSelectedFileForPreview] = useState<{ url: string; title: string; mimeType: string } | null>(null);

  const getFileUrl = (url?: string) => {
    if (!url) return "";
    if (url.startsWith('http') || url.startsWith('/')) return url;
    if (url.includes('/') || url.includes('.')) return `/${url}`;
    return url;
  };

  const isImageFile = (fileName?: string | null, fileUrl?: string | null) => {
    if (!fileName && !fileUrl) return false;
    const target = (fileName || fileUrl || "").toLowerCase();
    return target.endsWith('.png') || target.endsWith('.jpg') || target.endsWith('.jpeg') || target.endsWith('.gif') || target.endsWith('.webp');
  };

  const isPdfFile = (fileName?: string | null, fileUrl?: string | null) => {
    if (!fileName && !fileUrl) return false;
    const name = (fileName || "").toLowerCase();
    const url = (fileUrl || "").toLowerCase();
    return name.endsWith(".pdf") || url.includes(".pdf?") || url.endsWith(".pdf");
  };

  // Get people who took action
  const preparer = statusHistory.find(h => h.newStatus === "Submitted" || h.newStatus === "Draft");
  const approver = statusHistory.find(h => 
    h.newStatus === "Approved" || 
    h.newStatus === "Issued" || 
    h.newStatus.includes("Consultant Manager Approval") ||
    h.newStatus.includes("PM Approval")
  );

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
    .si-container { max-width: 100%; margin: 0 auto; }
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

  // Metadata extraction for Purpose and Subject
  const metadata = currentRevision?.metadata || {};
  const subject = metadata.subject || currentRevision?.title || "Site Instruction";
  const purpose = metadata.purpose || "General Project Direction";
  const description = currentRevision?.description || metadata.description || "No description provided.";
  const displayCreatedAt = createdAt || currentRevision?.createdAt;
  const createdDate = safeFormat(displayCreatedAt, "yyyy/MM/dd");
  const workLevelName =
    workLevels && workLevels.length > 0
      ? workLevels.map((wl) => wl.nameEnglish || wl.code).join(", ")
      : currentRevision?.workLevelName || "—";

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
        {preparer && (
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
        {approver && (
          <tr>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>{getUserName(approver.changedBy)}</td>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>Approved</td>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>{safeFormat(approver.changedAt, "yyyy/MM/dd")}</td>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>{getPosition(approver.changedBy)}</td>
            <td style={{ textAlign: "center", verticalAlign: "middle" }}>
              {getSignature(approver.changedBy) && (
                <img src={getSignature(approver.changedBy)} alt="Signature" style={{ height: "40px", margin: "0 auto" }} />
              )}
            </td>
          </tr>
        )}
        {!preparer && !approver && (
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
          <DialogTitle className="text-lg font-black text-foreground">SITE INSTRUCTION (SI)</DialogTitle>
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
            .si-container { max-width: 100%; margin: 0 auto; }
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
            className="si-container text-black"
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
                    SITE INSTRUCTION (SI)
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
                  <td className="label-cell">Contractor :</td>
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
                  <td className="label-cell">Work Level :</td>
                  <td colSpan={5}>{workLevelName}</td>
                </tr>
                <tr>
                  <td className="label-cell">Subject :</td>
                  <td colSpan={2}>{subject}</td>
                  <td className="label-cell" style={{ width: "100px" }}>Purpose :</td>
                  <td colSpan={2}>{purpose}</td>
                </tr>
              </tbody>
            </table>

            {/* Description Section */}
            <table className="main-table" style={{ marginTop: "10px" }}>
              <thead>
                <tr>
                  <th className="section-header">Instruction Details & Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "10px", verticalAlign: "top" }}>
                    <div dir="auto" style={{ minHeight: "250px", whiteSpace: "pre-wrap", fontSize: "16px", lineHeight: "1.6" }}>
                      {description}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Attachments Section */}
            <table className="main-table" style={{ marginTop: "10px" }}>
              <thead>
                <tr>
                  <th colSpan={3} className="section-header">Attachments & Drawings</th>
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

            {/* Consultant Section */}
            {consultantTableNode}

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
                        Attachments
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
          </div>
        </div>

        {/* Inline PDF Preview Modal */}
        {selectedFileForPreview && (
          <Dialog open={!!selectedFileForPreview} onOpenChange={() => setSelectedFileForPreview(null)}>
            <DialogContent className="max-w-4xl h-[80vh] p-0 overflow-hidden">
              <InlinePdfViewer
                fileUrl={selectedFileForPreview.url}
              />
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
