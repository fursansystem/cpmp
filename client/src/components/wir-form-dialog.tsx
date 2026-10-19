import React, { useRef, useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Printer, FileDown } from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import type { ChecklistItem, Project, Organization } from "@shared/schema";

import { formatGMT3, safeFormat } from "@/lib/utils";

// Memory cache to store rendered page blob URLs for instant loading
export const pdfPageCache: Record<string, string[]> = {};

export function InlinePdfViewer({ fileUrl }: { fileUrl: string }) {
  const [pages, setPages] = useState<string[]>(pdfPageCache[fileUrl] || []);
  const [loading, setLoading] = useState(!pdfPageCache[fileUrl]);
  const pdfDocRef = useRef<any>(null);

  useEffect(() => {
    if (pdfPageCache[fileUrl]) {
      setLoading(false);
      return;
    }

    let active = true;
    const loadPdfjs = async () => {
      try {
        if (!(window as any).pdfjsLib) {
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          script.async = true;
          document.head.appendChild(script);
          await new Promise((resolve) => {
            script.onload = resolve;
          });
        }
        
        const pdfjsLib = (window as any).pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        if (!active) return;
        pdfDocRef.current = pdf;
        
        const renderedBlobUrls: string[] = [];
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (!active) return;
          const page = await pdf.getPage(pageNum);
          
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (context) {
            const desiredWidth = 650;
            const viewport = page.getViewport({ scale: 1 });
            const scale = desiredWidth / viewport.width;
            const scaledViewport = page.getViewport({ scale });

            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;

            const renderContext = {
              canvasContext: context,
              viewport: scaledViewport,
            };

            const renderTask = page.render(renderContext);
            await renderTask.promise;

            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
            if (blob && active) {
              const objectUrl = URL.createObjectURL(blob);
              renderedBlobUrls.push(objectUrl);
            }
          }
        }
        
        if (active) {
          pdfPageCache[fileUrl] = renderedBlobUrls;
          setPages(renderedBlobUrls);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading PDF via pdf.js:", err);
        if (active) setLoading(false);
      }
    };

    loadPdfjs();
    return () => {
      active = false;
    };
  }, [fileUrl]);

  return (
    // data-pdf-loading lets the bulk exporter wait for pdf.js to finish rasterising
    // instead of capturing a page that still reads "Loading PDF pages...".
    <div
      data-pdf-viewer
      data-pdf-loading={loading ? "1" : "0"}
      style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}
    >
      {loading && <div style={{ textAlign: "center", padding: "10px", color: "#666" }}>Loading PDF pages...</div>}
      {!loading && pages.map((blobUrl, idx) => (
        <div key={idx} style={{ width: "100%", display: "flex", justifyContent: "center", pageBreakInside: "avoid" }}>
          <img
            src={blobUrl}
            alt={`PDF Page ${idx + 1}`}
            style={{ maxWidth: "100%", height: "auto", border: "1px solid #000", background: "#fff", display: "block" }}
          />
        </div>
      ))}
    </div>
  );
}

function PrintableMaterialSuppliers({ materialId, materialName }: { materialId: string, materialName?: string }) {
  const { data: linkedSuppliers = [] } = useQuery<any[]>({
    queryKey: ["/api/materials", materialId, "suppliers"],
    enabled: !!materialId,
  });

  if (!linkedSuppliers || linkedSuppliers.length === 0) return null;

  return (
    <tr>
      <td colSpan={6} style={{ padding: "10px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#d0d0d0" }}>
              <th
                colSpan={5}
                style={{
                  border: "1px solid #000",
                  padding: "6px",
                  textAlign: "center",
                  fontWeight: "bold",
                }}
              >
                Supplier Details (for: {materialName})
              </th>
            </tr>
            <tr style={{ background: "#e0e0e0" }}>
              <th style={{ border: "1px solid #000", padding: "4px", width: "30px", textAlign: "center" }}>#</th>
              <th style={{ border: "1px solid #000", padding: "4px", textAlign: "left" }}>Supplier Name</th>
              <th style={{ border: "1px solid #000", padding: "4px", textAlign: "center", width: "80px" }}>Category</th>
              <th style={{ border: "1px solid #000", padding: "4px", textAlign: "left", width: "220px" }}>Contact Info</th>
              <th style={{ border: "1px solid #000", padding: "4px", textAlign: "left", width: "160px" }}>Company Details</th>
            </tr>
          </thead>
          <tbody>
            {linkedSuppliers.map((link: any, idx: number) => (
              <tr key={link.id}>
                <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>{idx + 1}</td>
                <td style={{ border: "1px solid #000", padding: "4px", fontWeight: "bold" }}>{link.supplier?.supplierName}</td>
                <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>{link.supplier?.category || "General"}</td>
                <td style={{ border: "1px solid #000", padding: "4px", fontSize: "11px" }}>
                  {link.supplier?.contactPerson && <div style={{ marginBottom: "2px" }}><strong>Person:</strong> {link.supplier.contactPerson}</div>}
                  {link.supplier?.email && <div style={{ marginBottom: "2px", wordBreak: "break-all" }}><strong>Email:</strong> {link.supplier.email}</div>}
                  {link.supplier?.phone && <div><strong>Phone:</strong> {link.supplier.phone}</div>}
                </td>
                <td style={{ border: "1px solid #000", padding: "4px", fontSize: "11px" }}>
                  {link.supplier?.taxNumber && <div style={{ marginBottom: "2px" }}><strong>Tax No:</strong> {link.supplier.taxNumber}</div>}
                  {link.supplier?.experienceYears != null && <div style={{ marginBottom: "2px" }}><strong>Experience:</strong> {link.supplier.experienceYears} Years</div>}
                  {link.supplier?.address && <div><strong>Address:</strong> {link.supplier.address}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

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
  workListActivityId: string | null;
  workLocationId: string | null;
  workLevelId: string | null;
  scheduledDate: string | null;
  remarks: string | null;
  createdBy: string;
  createdAt: string;
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

interface RevisionChecklistResponse {
  id: string;
  revisionId: string;
  checklistItemId: string;
  response: "yes" | "no" | "na";
  respondedBy: string | null;
  respondedAt: string | null;
  remarks: string | null;
}

interface ConsultantReview {
  id: string;
  revisionId: string;
  residentEngineerUserId: string | null;
  comments: string | null;
  statusCode: string | null;
  reviewedAt: string | null;
}

interface RevisionPurpose {
  id: string;
  purposeName: string;
}

interface RevisionDelivery {
  id: string;
  deliveryId: string;
  delivery: {
    shipmentNumber: string;
    deliveryInvoiceNumber: string | null;
    supplier: string;
    arrivalDate: string | null;
    attachment?: {
      id: string;
      name: string;
      type: string;
      fileName?: string | null;
      fileUrl?: string | null;
      fileData?: string | null;
    } | null;
    items: {
      id: string;
      materialName: string;
      materialDescription?: string | null;
      arrivalQuantity: string;
      unit: string;
    }[];
  };
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

// Static print CSS, lifted to module scope so the bulk PDF exporter can apply the
// same rules. Everything here lives inside @media print, which html2canvas never
// matches, so PRINT_STYLES_FOR_CAPTURE unwraps it for the offscreen render.
export const PRINT_STYLES = `
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
      /* Optimize spacing to fit on a single A4 page */
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
    .wir-container {
      max-width: 100%;
      margin: 0 auto;
    }
    .wir-header {
      text-align: center;
      margin-bottom: 10px;
      border: 2px solid #000;
      padding: 6px;
      background: #f0f0f0;
    }
    .wir-title {
      font-size: 18px;
      font-weight: bold;
    }
    .info-row {
      margin-bottom: 3px;
      font-size: 12px;
    }
    .info-label {
      font-weight: bold;
      display: inline-block;
      min-width: 100px;
    }
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
    .main-table th {
      background: #e0e0e0;
      font-weight: bold;
      text-align: center;
    }
    .section-header {
      background: #d0d0d0;
      font-weight: bold;
      text-align: center;
      padding: 4px;
    }
    .label-cell {
      font-weight: bold;
      width: 120px;
      background: #f5f5f5;
    }
    .signature-cell {
      min-width: 100px;
    }
    .approval-table {
      width: 100%;
      border-collapse: collapse;
    }
    .approval-table td {
      border: 1px solid #000;
      padding: 3px 6px;
      vertical-align: top;
      font-size: 11px;
    }
    .approval-option {
      padding: 2px 0;
    }
    .approval-checkbox {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 1px solid #000;
      margin-right: 5px;
      vertical-align: middle;
      text-align: center;
      line-height: 10px;
      font-size: 12px;
    }
    .approval-checkbox.checked {
      background: #000;
      color: #fff;
    }
    .remarks-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .remarks-list li {
      margin-bottom: 3px;
    }
    .footer {
      text-align: center;
      margin-top: 10px;
      font-size: 11px;
      color: #666;
      border-top: 1px solid #ccc;
      padding-top: 6px;
    }
    .page-number {
      position: absolute;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
    }
`;

export const PRINT_STYLES_FOR_CAPTURE = PRINT_STYLES
  .replace(/@media\s+print\s*\{/, "")
  .replace(/\}\s*$/, "");

interface WirFormDialogProps {
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
  checklistItems: ChecklistItem[];
  checklistResponses: RevisionChecklistResponse[];
  consultantReviews?: ConsultantReview[];
  workListActivity?: { code?: string; nameEnglish?: string } | null;
  division?: { nameEnglish?: string } | null;
  revisionPurposes?: RevisionPurpose[];
  getUserName: (userId: string) => string;
  getUserSignature?: (userId: string) => string;
  getUserPosition?: (userId: string) => string;
  createdAt?: string;
  updatedAt?: string;
  contractorName?: string | null;
  consultantName?: string | null;
  projectName?: string | null;
  workLevels?: { id: string; nameEnglish?: string | null; code?: string | null }[] | null;
  revisionDeliveries?: RevisionDelivery[];
  revisionSuppliers?: {
    id: string;
    supplierId: string;
    supplier: {
      supplierName: string;
      category?: string | null;
      email?: string | null;
      phone?: string | null;
      contactPerson?: string | null;
      address?: string | null;
      taxNumber?: string | null;
      experienceYears?: number | null;
    };
  }[];
  revisionMaterials?: any[];
  // Renders just the form body, with no Dialog around it, so the bulk exporter can
  // capture its markup offscreen.
  renderInline?: boolean;
}

export function WirFormDialog({
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
  checklistItems,
  checklistResponses,
  consultantReviews = [],
  workListActivity,
  division,
  revisionPurposes = [],
  renderInline = false,
  getUserName,
  createdAt,
  updatedAt,
  contractorName,
  consultantName,
  projectName,
  workLevels,
  getUserSignature,
  getUserPosition,
  revisionDeliveries = [],
  revisionSuppliers = [],
  revisionMaterials = [],
}: WirFormDialogProps) {
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

  // Collect relevant user IDs from status history to fetch signatures on demand
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

  const getPosition = (userId: string): string => {
    return getUserPosition ? getUserPosition(userId) : "";
  };

  const getPrintStyles = () => PRINT_STYLES;


  const handlePrint = () => {
    if (!printRef.current) return;

    const printContent = printRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>WIR - ${requestNumber}</title>
          <style>${getPrintStyles()}</style>
        </head>
        <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
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
          <title>WIR - ${requestNumber}</title>
          <style>${getPrintStyles()}</style>
        </head>
        <body>
          ${printContent}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const getApprovalStatus = (): string => {
    // Priority 1: Check consultantReviews passed from parent (most recent selection)
    if (consultantReviews && consultantReviews.length > 0) {
      const lastReview = consultantReviews[consultantReviews.length - 1];
      const statusCode = lastReview.statusCode || "";

      // First check for single-letter codes (A, B, C, D, E)
      if (["A", "B", "C", "D", "E"].includes(statusCode)) {
        return statusCode;
      }

      const status = statusCode.toLowerCase();

      // Use exact matching for standard codes to prevent overlaps
      if (
        status === "approved" ||
        status === "consultant approved"
      )
        return "A";
      if (
        status === "approved as noted" ||
        status === "noted" ||
        status === "approved by consultant team approval"
      )
        return "B";
      if (status === "approved by consultant manager approval") return "C";
      if (status === "revise and resubmit") return "D";
      if (
        status === "rejected" ||
        status === "closed" ||
        status === "auto" ||
        status.includes("automatically") ||
        status.includes("close automatically")
      )
        return "E";
    }

    // Priority 2: Check status history
    const consultantDecisions = statusHistory.filter((h) => {
      const status = h.newStatus.toLowerCase();
      return (
        (status.startsWith("consultant") || status === "closed" || status.includes("auto")) &&
        (status.includes("approved") ||
          status.includes("rejected") ||
          status.includes("resubmit") ||
          status.includes("revise") ||
          status.includes("noted") ||
          status.includes("closed"))
      );
    });

    if (consultantDecisions.length === 0) return "";

    const lastConsultantDecision =
      consultantDecisions[
        consultantDecisions.length - 1
      ]?.newStatus?.toLowerCase() || "";

    if (
      lastConsultantDecision === "consultant approved" ||
      lastConsultantDecision === "approved"
    )
      return "A";
    if (
      lastConsultantDecision === "consultant approved as noted" ||
      lastConsultantDecision === "approved as noted" ||
      lastConsultantDecision === "noted" ||
      lastConsultantDecision === "approved by consultant team approval"
    )
      return "B";
    if (lastConsultantDecision === "approved by consultant manager approval")
      return "C";
    if (lastConsultantDecision === "revise and resubmit") return "D";
    if (
      lastConsultantDecision.includes("rejected") ||
      lastConsultantDecision.includes("closed") ||
      lastConsultantDecision.includes("auto") ||
      lastConsultantDecision.includes("automatically")
    )
      return "E";

    return "";
  };

  const getChecklistResponse = (itemId: string): string => {
    const response = checklistResponses.find(
      (r) => r.checklistItemId === itemId,
    );
    if (!response) return "";
    switch (response.response) {
      case "yes":
        return "✔";
      case "no":
        return "✘";
      case "na":
        return "N/A";
      default:
        return "";
    }
  };

  const allApprovals = statusHistory.filter(
    (h) => h.newStatus !== "Draft" && h.newStatus !== "Pending",
  );

  const contractorApprovals = statusHistory
    .filter(
      (h) =>
        h.newStatus.toLowerCase().includes("contractor") ||
        h.newStatus.toLowerCase().includes("engineer") ||
        h.newStatus.toLowerCase().includes("qaqc") ||
        h.newStatus.toLowerCase().includes("site"),
    )
    .sort(
      (a, b) =>
        new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
    );

  const consultantApprovals = statusHistory
    .filter(
      (h) =>
        h.newStatus.toLowerCase().includes("consultant") &&
        !h.newStatus.toLowerCase().includes("manager") &&
        !h.newStatus.toLowerCase().includes("pending") &&
        !h.newStatus.toLowerCase().includes("submitted")
    )
    .sort(
      (a, b) =>
        new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
    );

  const consultantTeamApproval = statusHistory.findLast((h) =>
    h.newStatus.toLowerCase().includes("consultant team approval"),
  );

  const closedApproval = statusHistory.findLast(
    (h) => h.newStatus === "Closed",
  );

  const displayConsultantManager = statusHistory.findLast((h) =>
    h.newStatus.toLowerCase().includes("consultant manager approval"),
  );

  const activityCode = (() => {
    if (!workListActivity?.code) return requestTypeCode;
    const cleanCode = workListActivity.code.trim();
    if (cleanCode.toLowerCase().startsWith(requestTypeCode.toLowerCase())) {
      return cleanCode;
    }
    return `${requestTypeCode}.${cleanCode}`;
  })();

  const divisionName = division?.nameEnglish || "";
  const activityName = workListActivity?.nameEnglish || "";
  const activityDetailsText = (() => {
    const dName = divisionName.trim();
    const aName = activityName.trim();
    if (!dName && !aName) return "";
    if (!dName) return `( ${aName} )`;
    if (!aName) return `( ${dName} )`;
    if (dName.toLowerCase() === aName.toLowerCase()) return `( ${aName} )`;
    return `( ${dName} / ${aName} )`;
  })();
  const purposeName =
    revisionPurposes.length > 0
      ? revisionPurposes.map((p) => p.purposeName).join(", ")
      : "";

  // Determine the display date: use revision date if available, otherwise request date
  const displayCreatedAt = currentRevision?.createdAt || createdAt;
  const createdDate = safeFormat(displayCreatedAt, "yyyy-MM-dd HH:mm:ss");
  const createdDateGMT3 = formatGMT3(displayCreatedAt, "yyyy/MM/dd HH:mm:ss");

  const updatedDate = safeFormat(updatedAt, "yyyy-MM-dd HH:mm:ss");
  const transactionDisplay = referenceCode
    ? `${referenceCode} : ${createdDate} / ${updatedDate}`
    : createdDate;

  const scheduledDate = safeFormat(
    currentRevision?.scheduledDate,
    "yyyy-MM-dd HH:mm:ss",
  );

  const remarks = statusHistory.filter((h) => h.remarks).map((h) => h.remarks);
  const approvalStatus = getApprovalStatus();

  const buildings = Array.from(
    new Set(revisionLocations.map((l) => l.building).filter(Boolean)),
  );
  const units = revisionLocations.map((l) => l.unit).filter(Boolean);
  const workLevelName =
    workLevels && workLevels.length > 0
      ? workLevels.map((wl) => wl.nameEnglish || wl.code).join(", ")
      : revisionLocations[0]?.floor || "—";

  const siteEngineerEntries = statusHistory.filter((h) => {
    const status = h.newStatus.toLowerCase();
    return (
      status.includes("site engineer") ||
      (status.includes("site") && !status.includes("consultant"))
    );
  });
  const latestSiteEngineer =
    siteEngineerEntries.length > 0
      ? siteEngineerEntries[siteEngineerEntries.length - 1]
      : null;

  const qaqcEntries = statusHistory.filter((h) => h.newStatus.includes("QAQC"));
  const latestQAQC =
    qaqcEntries.length > 0 ? qaqcEntries[qaqcEntries.length - 1] : null;

  const getSignature = (userId: string): string => {
    // Try to find in the on-demand fetched signatures first
    const signatureObj = userSignatures?.find(s => s.id === userId);
    if (signatureObj?.signature) return signatureObj.signature;

    // Fallback to legacy prop if provided
    return getUserSignature ? getUserSignature(userId) : "";
  };

  const isMAR = requestTypeCode === "MAR";
  const isMIR = requestTypeCode === "MIR";
  const isSSR = requestTypeCode === "SSR";
  const isDSR = requestTypeCode === "DSR";
  const isASD = requestTypeCode === "ASD";
  const isSD = requestTypeCode === "SD" || requestTypeCode === "ASD";
  const finalTitle = isMAR
    ? "Material Approval Request (MAR)"
    : isMIR
      ? "Material Inspection Request (MIR)"
      : isSSR
        ? "Supplier Submittal Request (SSR)"
        : isDSR
          ? "Document Submittal Request (DSR)"
          : isASD
            ? "As-Built Drawing Submittal (ASD)"
            : requestTypeCode === "SD"
              ? "Shop Drawing Submittal (SD)"
              : "Work Inspection Request (WIR)";

  const hasAnyDeliveryDescription = revisionDeliveries.some((rd) =>
    rd.delivery.items.some(
      (item) =>
        item.materialDescription &&
        item.materialDescription !== "No description provided",
    )
  );

  const filteredChecklistItems = checklistItems.filter((item) =>
    isMAR
      ? item.category === "mar" || item.category === "mir" || item.category === "ssr"
      : isMIR
        ? item.category === "mir"
        : isSSR
          ? item.category === "ssr" || item.category === "mir"
          : item.category === "main" || item.category === "sbc"
  );

  const halfLength = Math.ceil(filteredChecklistItems.length / 2);
  const leftChecklistItems = filteredChecklistItems.slice(0, halfLength);
  const rightChecklistItems = filteredChecklistItems.slice(halfLength);

  const consultantImages = (revisionAttachments || []).filter(a => isImageFile(a.fileName, a.fileUrl || a.fileData));

  // The form body is captured in a variable so the bulk exporter can render it offscreen
  // without the Dialog wrapper, which never mounts while closed. One definition means an
  // exported PDF can never drift from what the on-screen dialog shows.
  const formBody = (
          <div
            ref={printRef}
            data-print-root
            className="wir-container text-black"
            style={{
              fontFamily: "Arial, sans-serif",
              fontSize: "12px",
              lineHeight: "1.3",
              color: "#000",
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
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginBottom: "10px",
              }}
            >
              <tbody>
                <tr>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      fontWeight: "bold",
                      width: "120px",
                      background: "#f5f5f5",
                    }}
                  >
                    Activity Code :
                  </td>
                  <td
                    style={{ border: "1px solid #000", padding: "4px 6px" }}
                    colSpan={5}
                  >
                    {activityCode} {activityDetailsText}
                  </td>
                </tr>
                <tr>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      fontWeight: "bold",
                      width: "120px",
                      background: "#f5f5f5",
                    }}
                  >
                    Project Title :
                  </td>
                  <td
                    style={{ border: "1px solid #000", padding: "4px 6px" }}
                    colSpan={5}
                  >
                    {projectName || project?.name || "—"}
                  </td>
                </tr>
                <tr>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      fontWeight: "bold",
                      background: "#f5f5f5",
                    }}
                  >
                    Developer :
                  </td>
                  <td
                    style={{ border: "1px solid #000", padding: "4px 6px" }}
                    colSpan={5}
                  >
                    {developer?.name || "—"}
                  </td>
                </tr>
                <tr>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      fontWeight: "bold",
                      background: "#f5f5f5",
                    }}
                  >
                    Consultant :
                  </td>
                  <td
                    style={{ border: "1px solid #000", padding: "4px 6px" }}
                    colSpan={5}
                  >
                    {consultant?.name || consultantName || "—"}
                  </td>
                </tr>


                <tr>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      fontWeight: "bold",
                      background: "#f5f5f5",
                    }}
                  >
                    Contractors :
                  </td>
                  <td
                    style={{ border: "1px solid #000", padding: "4px 6px" }}
                    colSpan={5}
                  >
                    {contractor?.name || contractorName || "—"}
                  </td>
                </tr>


                <tr>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      fontWeight: "bold",
                      background: "#f5f5f5",
                      width: "120px",
                    }}
                  >
                    Request No :
                  </td>
                  <td style={{ border: "1px solid #000", padding: "4px 6px" }}>
                    {requestNumber}
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      fontWeight: "bold",
                      background: "#f5f5f5",
                      width: "100px",
                    }}
                  >
                    Revision No :
                  </td>
                  <td style={{ border: "1px solid #000", padding: "4px 6px" }}>
                    {currentRevision?.revisionNo}
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      fontWeight: "bold",
                      background: "#f5f5f5",
                      width: "100px",
                    }}
                  >
                    Posting Date :
                  </td>
                  <td style={{ border: "1px solid #000", padding: "4px 6px" }}>
                    {createdDateGMT3}
                  </td>
                </tr>

                {true &&
                  true && (
                    <tr>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px 6px",
                          fontWeight: "bold",
                          background: "#f5f5f5",
                          width: "120px",
                        }}
                      >
                        Description :
                      </td>
                      <td
                        style={{ border: "1px solid #000", padding: "4px 6px" }}
                        colSpan={5}
                      >
                        {currentRevision?.description || "No description provided"}
                      </td>
                    </tr>
                  )}

                {((!isMIR && !isSSR && !isMAR && !isDSR && !isSD) || buildings.length > 0 || units.length > 0 || (workLevelName && workLevelName !== "—")) && (
                  <tr>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "4px 6px",
                        fontWeight: "bold",
                        background: "#f5f5f5",
                        width: "120px",
                      }}
                    >
                      Work Location :
                    </td>
                    <td
                      style={{ border: "1px solid #000", padding: "4px 6px" }}
                      colSpan={2}
                    >
                      {buildings.length > 0 || units.length > 0 ? (
                        <>
                          <span style={{ fontWeight: "bold" }}>Units :</span>{" "}
                          Total Units({revisionLocations.length})
                          {buildings.length > 0 &&
                            `, Building no. (${buildings.join(", ")})`}
                          {units.length > 0 && (
                            <>
                              <br />
                              Units {units.join(",")}
                            </>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "4px 6px",
                        fontWeight: "bold",
                        background: "#f5f5f5",
                        width: "100px",
                      }}
                    >
                      Work Level :
                    </td>
                    <td
                      style={{ border: "1px solid #000", padding: "4px 6px" }}
                      colSpan={2}
                    >
                      {workLevelName || "—"}
                    </td>
                  </tr>
                )}

                <tr>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      fontWeight: "bold",
                      background: "#f5f5f5",
                      width: "120px",
                    }}
                  >
                    Purpose :
                  </td>
                  <td style={{ border: "1px solid #000", padding: "4px 6px" }} colSpan={2}>
                    {purposeName || "General"}
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      fontWeight: "bold",
                      background: "#f5f5f5",
                      width: "100px",
                    }}
                  >
                    Actual Date :
                  </td>
                  <td style={{ border: "1px solid #000", padding: "4px 6px" }} colSpan={2}>
                    {safeFormat(
                      currentRevision?.scheduledDate,
                      "yyyy/MM/dd",
                      "----/--/--",
                    )}
                  </td>
                </tr>

                {revisionDocuments.length > 0 && !isDSR && !isSD && (
                  <tr>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "4px 6px",
                        fontWeight: "bold",
                        background: "#f5f5f5",
                      }}
                    >
                      Documents :
                    </td>
                    <td
                      style={{ border: "1px solid #000", padding: "4px 6px" }}
                      colSpan={5}
                    >
                      {revisionDocuments
                        .map((d, i) => {
                          const details = d.documentType ? `Type: ${d.documentType}` : "";
                          const name = d.title || d.fileName || "Document";
                          return `${i + 1} - ${name}${details ? ` (${details})` : ""}`;
                        })
                        .join(", ")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Material Inspection Section */}
            {isMIR && revisionDeliveries.length > 0 && (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  marginBottom: "10px",
                }}
              >
                <thead>
                  <tr style={{ background: "#d0d0d0" }}>
                    <th
                      colSpan={hasAnyDeliveryDescription ? 7 : 6}
                      style={{
                        border: "1px solid #000",
                        padding: "6px",
                        textAlign: "center",
                        fontWeight: "bold",
                      }}
                    >
                      Material Inspection
                    </th>
                  </tr>
                  <tr style={{ background: "#e0e0e0" }}>
                    <th
                      style={{
                        border: "1px solid #000",
                        padding: "4px",
                        width: "30px",
                        textAlign: "center",
                      }}
                    >
                      #
                    </th>
                    <th
                      style={{
                        border: "1px solid #000",
                        padding: "4px",
                        textAlign: "center",
                        width: "120px",
                      }}
                    >
                      Delivery / Invoice
                    </th>
                    <th
                      style={{
                        border: "1px solid #000",
                        padding: "4px",
                        textAlign: "center",
                      }}
                    >
                      Material Name
                    </th>
                    {hasAnyDeliveryDescription && (
                      <th
                        style={{
                          border: "1px solid #000",
                          padding: "4px",
                          textAlign: "center",
                        }}
                      >
                        Description
                      </th>
                    )}
                    <th
                      style={{
                        border: "1px solid #000",
                        padding: "4px",
                        textAlign: "center",
                        width: "60px",
                      }}
                    >
                      Qty
                    </th>
                    <th
                      style={{
                        border: "1px solid #000",
                        padding: "4px",
                        textAlign: "center",
                        width: "60px",
                      }}
                    >
                      Unit
                    </th>
                    <th
                      style={{
                        border: "1px solid #000",
                        padding: "4px",
                        textAlign: "center",
                      }}
                    >
                      Supplier
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {revisionDeliveries.map((rd, idx) =>
                    rd.delivery.items.map((item, itemIdx) => (
                      <tr key={item.id}>
                        {itemIdx === 0 && (
                          <>
                            <td
                              rowSpan={rd.delivery.items.length}
                              style={{
                                border: "1px solid #000",
                                padding: "4px",
                                textAlign: "center",
                              }}
                            >
                              {idx + 1}
                            </td>
                            <td
                              rowSpan={rd.delivery.items.length}
                              style={{
                                border: "1px solid #000",
                                padding: "4px",
                                textAlign: "center",
                              }}
                            >
                              <div style={{ fontWeight: "bold" }}>
                                {rd.delivery.shipmentNumber}
                              </div>
                              <div style={{ fontSize: "11px", color: "#666" }}>
                                {rd.delivery.deliveryInvoiceNumber || "---"}
                              </div>
                            </td>
                          </>
                        )}
                        <td style={{ border: "1px solid #000", padding: "4px" }}>
                          {item.materialName}
                        </td>
                        {hasAnyDeliveryDescription && (
                          <td
                            style={{
                              border: "1px solid #000",
                              padding: "4px",
                              fontSize: "11px",
                            }}
                          >
                            {item.materialDescription &&
                              item.materialDescription !== "No description provided"
                              ? item.materialDescription
                              : ""}
                          </td>
                        )}
                        <td
                          style={{
                            border: "1px solid #000",
                            padding: "4px",
                            textAlign: "center",
                          }}
                        >
                          {item.arrivalQuantity}
                        </td>
                        <td
                          style={{
                            border: "1px solid #000",
                            padding: "4px",
                            textAlign: "center",
                          }}
                        >
                          {item.unit}
                        </td>
                        {itemIdx === 0 && (
                          <td
                            rowSpan={rd.delivery.items.length}
                            style={{
                              border: "1px solid #000",
                              padding: "4px",
                              textAlign: "center",
                            }}
                          >
                            {rd.delivery.supplier}
                          </td>
                        )}
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            )}

            {isSSR && revisionSuppliers.length > 0 && (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  marginBottom: "10px",
                }}
              >
                <thead>
                  <tr style={{ background: "#d0d0d0" }}>
                    <th
                      colSpan={5}
                      style={{
                        border: "1px solid #000",
                        padding: "6px",
                        textAlign: "center",
                        fontWeight: "bold",
                      }}
                    >
                      Supplier Details
                    </th>
                  </tr>
                  <tr style={{ background: "#e0e0e0" }}>
                    <th style={{ border: "1px solid #000", padding: "4px", width: "30px", textAlign: "center" }}>#</th>
                    <th style={{ border: "1px solid #000", padding: "4px", textAlign: "left" }}>Supplier Name</th>
                    <th style={{ border: "1px solid #000", padding: "4px", textAlign: "center", width: "80px" }}>Category</th>
                    <th style={{ border: "1px solid #000", padding: "4px", textAlign: "left", width: "220px" }}>Contact Info</th>
                    <th style={{ border: "1px solid #000", padding: "4px", textAlign: "left", width: "160px" }}>Company Details</th>
                  </tr>
                </thead>
                <tbody>
                  {revisionSuppliers.map((rs, idx) => (
                    <tr key={rs.id}>
                      <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>{idx + 1}</td>
                      <td style={{ border: "1px solid #000", padding: "4px", fontWeight: "bold" }}>{rs.supplier.supplierName}</td>
                      <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>{rs.supplier.category || "General"}</td>
                      <td style={{ border: "1px solid #000", padding: "4px", fontSize: "11px" }}>
                        {rs.supplier.contactPerson && <div style={{ marginBottom: "2px" }}><strong>Person:</strong> {rs.supplier.contactPerson}</div>}
                        {rs.supplier.email && <div style={{ marginBottom: "2px", wordBreak: "break-all" }}><strong>Email:</strong> {rs.supplier.email}</div>}
                        {rs.supplier.phone && <div><strong>Phone:</strong> {rs.supplier.phone}</div>}
                      </td>
                      <td style={{ border: "1px solid #000", padding: "4px", fontSize: "11px" }}>
                        {rs.supplier.taxNumber && <div style={{ marginBottom: "2px" }}><strong>Tax No:</strong> {rs.supplier.taxNumber}</div>}
                        {rs.supplier.experienceYears != null && <div style={{ marginBottom: "2px" }}><strong>Experience:</strong> {rs.supplier.experienceYears} Years</div>}
                        {rs.supplier.address && <div><strong>Address:</strong> {rs.supplier.address}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {isMAR && revisionMaterials.length > 0 && (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  marginBottom: "10px",
                }}
              >
                <thead>
                  <tr style={{ background: "#d0d0d0" }}>
                    <th
                      colSpan={6}
                      style={{
                        border: "1px solid #000",
                        padding: "6px",
                        textAlign: "center",
                        fontWeight: "bold",
                      }}
                    >
                      Selected Materials
                    </th>
                  </tr>
                  <tr style={{ background: "#e0e0e0" }}>
                    <th style={{ border: "1px solid #000", padding: "4px", width: "40px", textAlign: "center" }}>#</th>
                    <th style={{ border: "1px solid #000", padding: "4px", textAlign: "center", width: "100px" }}>ID</th>
                    <th style={{ border: "1px solid #000", padding: "4px", textAlign: "left" }}>Material Name</th>
                    <th style={{ border: "1px solid #000", padding: "4px", textAlign: "center", width: "130px" }}>Category</th>
                    <th style={{ border: "1px solid #000", padding: "4px", textAlign: "center", width: "80px" }}>Unit</th>
                    <th style={{ border: "1px solid #000", padding: "4px", textAlign: "center", width: "100px" }}>Origin</th>
                  </tr>
                </thead>
                <tbody>
                  {revisionMaterials.map((rm, idx) => (
                    <React.Fragment key={rm.id || idx}>
                      <tr>
                        <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>{idx + 1}</td>
                        <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>{rm.material?.materialCode || (rm.material?.id ? rm.material.id.substring(0, 8) : "—")}</td>
                        <td style={{ border: "1px solid #000", padding: "4px", fontWeight: "bold" }}>{rm.material?.materialName}</td>
                        <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>{rm.material?.category || "General"}</td>
                        <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>{rm.material?.unit || "—"}</td>
                        <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>{rm.material?.originCountry || "—"}</td>
                      </tr>
                      {rm.material?.id && <PrintableMaterialSuppliers materialId={rm.material.id} materialName={rm.material.materialName} />}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}

            {/* Comments Table */}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginBottom: "10px",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      background: "#d0d0d0",
                      textAlign: "center",
                      fontWeight: "bold",
                    }}
                    colSpan={4}
                  >
                    Contractor
                  </th>
                </tr>
                <tr>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      background: "#e0e0e0",
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      background: "#e0e0e0",
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    Date
                  </th>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      background: "#e0e0e0",
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    Position
                  </th>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      background: "#e0e0e0",
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    Signature
                  </th>
                </tr>
              </thead>
              <tbody>
                {contractorApprovals.length > 0 ? (
                  contractorApprovals.map((approval) => (
                    <tr key={approval.id}>
                      <td
                        style={{ border: "1px solid #000", padding: "4px 6px" }}
                      >
                        {getUserName(approval.changedBy)}
                      </td>
                      <td
                        style={{ border: "1px solid #000", padding: "4px 6px" }}
                      >
                        {formatGMT3(approval.changedAt, "yyyy/MM/dd HH:mm:ss")}
                      </td>
                      <td
                        style={{ border: "1px solid #000", padding: "4px 6px" }}
                      >
                        {getUserPosition
                          ? getUserPosition(approval.changedBy) ||
                          (approval.newStatus.includes("QAQC")
                            ? "QAQC Engineer"
                            : approval.newStatus.includes("Site")
                              ? "Site Engineer"
                              : "Engineer")
                          : approval.newStatus.includes("QAQC")
                            ? "QAQC Engineer"
                            : approval.newStatus.includes("Site")
                              ? "Site Engineer"
                              : "Engineer"}
                      </td>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px 6px",
                          minWidth: "80px",
                          textAlign: "center",
                        }}
                      >
                        {getSignature(approval.changedBy) ? (
                          <img
                            src={getSignature(approval.changedBy)}
                            alt="signature"
                            style={{ maxHeight: "30px", maxWidth: "80px" }}
                          />
                        ) : null}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "4px 6px",
                        textAlign: "center",
                      }}
                      colSpan={4}
                    >
                      No contractor approvals yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Site Engineer & QAQC Section */}
            {(latestSiteEngineer || latestQAQC) && (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  marginBottom: "10px",
                }}
              >
                <tbody>
                  <tr>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "4px 6px",
                        fontWeight: "bold",
                        background: "#f5f5f5",
                        width: "150px",
                      }}
                    >
                      Site Engineer :
                    </td>
                    <td
                      style={{ border: "1px solid #000", padding: "4px 6px" }}
                    >
                      {latestSiteEngineer
                        ? getUserName(latestSiteEngineer.changedBy)
                        : "—"}
                    </td>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "4px 6px",
                        fontWeight: "bold",
                        background: "#f5f5f5",
                        width: "60px",
                      }}
                    >
                      Date :
                    </td>
                    <td
                      style={{ border: "1px solid #000", padding: "4px 6px" }}
                    >
                      {formatGMT3(
                        latestSiteEngineer?.changedAt,
                        "yyyy/MM/dd hh:mm:ss a",
                      )}
                    </td>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "4px 6px",
                        fontWeight: "bold",
                        background: "#f5f5f5",
                        width: "80px",
                      }}
                    >
                      Signature :
                    </td>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "4px 6px",
                        minWidth: "80px",
                        textAlign: "center",
                      }}
                    >
                      {latestSiteEngineer &&
                        getSignature(latestSiteEngineer.changedBy) ? (
                        <img
                          src={getSignature(latestSiteEngineer.changedBy)}
                          alt="signature"
                          style={{ maxHeight: "30px", maxWidth: "80px" }}
                        />
                      ) : null}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "4px 6px",
                        fontWeight: "bold",
                        background: "#f5f5f5",
                      }}
                    >
                      QAQC Comments :
                    </td>
                    <td
                      style={{ border: "1px solid #000", padding: "4px 6px" }}
                      colSpan={5}
                    >
                      {latestQAQC?.remarks || "----"}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "6px",
                        background: "#e0e0e0",
                        textAlign: "center",
                      }}
                      colSpan={6}
                    >
                      ready for inspection
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "4px 6px",
                        fontWeight: "bold",
                        background: "#f5f5f5",
                      }}
                    >
                      QAQC Engineer :
                    </td>
                    <td
                      style={{ border: "1px solid #000", padding: "4px 6px" }}
                    >
                      {latestQAQC ? getUserName(latestQAQC.changedBy) : "—"}
                    </td>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "4px 6px",
                        fontWeight: "bold",
                        background: "#f5f5f5",
                      }}
                    >
                      Date :
                    </td>
                    <td
                      style={{ border: "1px solid #000", padding: "4px 6px" }}
                    >
                      {formatGMT3(
                        latestQAQC?.changedAt,
                        "yyyy/MM/dd",
                        "----/--/--",
                      )}
                    </td>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "4px 6px",
                        fontWeight: "bold",
                        background: "#f5f5f5",
                      }}
                    >
                      Signature :
                    </td>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "4px 6px",
                        textAlign: "center",
                      }}
                    >
                      {latestQAQC && getSignature(latestQAQC.changedBy) ? (
                        <img
                          src={getSignature(latestQAQC.changedBy)}
                          alt="signature"
                          style={{ maxHeight: "30px", maxWidth: "80px" }}
                        />
                      ) : null}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* Check List Section or Attachments Table (for DSR) */}
            {!isDSR && !isSD ? (
              <>
                <div
                  style={{
                    width: "100%",
                    border: "1px solid #000",
                    background: "#d0d0d0",
                    padding: "6px",
                    textAlign: "center",
                    fontWeight: "bold",
                    fontSize: "12px",
                    boxSizing: "border-box",
                  }}
                >
                  Check List
                </div>

                <div style={{ display: "flex", gap: "0", width: "100%", marginTop: "-1px", marginBottom: "10px" }}>
                  {/* Left Column Table */}
                  <table
                    style={{
                      flex: 1,
                      borderCollapse: "collapse",
                      fontSize: "11px",
                      width: "50%",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f5f5f5" }}>
                        <th
                          style={{
                            border: "1px solid #000",
                            padding: "4px",
                            width: "30px",
                            textAlign: "center",
                            fontWeight: "bold",
                          }}
                        >
                          No.
                        </th>
                        <th
                          style={{
                            border: "1px solid #000",
                            padding: "4px",
                            textAlign: "left",
                            fontWeight: "bold",
                          }}
                        >
                          Checklist
                        </th>
                        <th
                          style={{
                            border: "1px solid #000",
                            padding: "4px",
                            width: "60px",
                            textAlign: "center",
                            fontWeight: "bold",
                          }}
                        >
                          Result
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {leftChecklistItems.length > 0 ? (
                        leftChecklistItems.map((item, idx) => (
                          <tr key={item.id}>
                            <td
                              style={{
                                border: "1px solid #000",
                                padding: "4px",
                                textAlign: "center",
                              }}
                            >
                              {idx + 1}
                            </td>
                            <td
                              style={{
                                border: "1px solid #000",
                                padding: "4px",
                              }}
                            >
                              {item.nameEnglish}
                            </td>
                            <td
                              style={{
                                border: "1px solid #000",
                                padding: "4px",
                                textAlign: "center",
                                fontWeight: "bold",
                              }}
                            >
                              {getChecklistResponse(item.id)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={3}
                            style={{
                              border: "1px solid #000",
                              padding: "8px",
                              textAlign: "center",
                              fontStyle: "italic",
                              color: "#666",
                            }}
                          >
                            No checklist items
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Right Column Table */}
                  <table
                    style={{
                      flex: 1,
                      borderCollapse: "collapse",
                      fontSize: "11px",
                      width: "50%",
                      marginLeft: "-1px",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f5f5f5" }}>
                        <th
                          style={{
                            border: "1px solid #000",
                            padding: "4px",
                            width: "30px",
                            textAlign: "center",
                            fontWeight: "bold",
                          }}
                        >
                          No.
                        </th>
                        <th
                          style={{
                            border: "1px solid #000",
                            padding: "4px",
                            textAlign: "left",
                            fontWeight: "bold",
                          }}
                        >
                          Checklist
                        </th>
                        <th
                          style={{
                            border: "1px solid #000",
                            padding: "4px",
                            width: "60px",
                            textAlign: "center",
                            fontWeight: "bold",
                          }}
                        >
                          Result
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rightChecklistItems.length > 0 ? (
                        <>
                          {rightChecklistItems.map((item, idx) => (
                            <tr key={item.id}>
                              <td
                                style={{
                                  border: "1px solid #000",
                                  padding: "4px",
                                  textAlign: "center",
                                }}
                              >
                                {halfLength + idx + 1}
                              </td>
                              <td
                                style={{
                                  border: "1px solid #000",
                                  padding: "4px",
                                }}
                              >
                                {item.nameEnglish}
                              </td>
                              <td
                                style={{
                                  border: "1px solid #000",
                                  padding: "4px",
                                  textAlign: "center",
                                  fontWeight: "bold",
                                }}
                              >
                                {getChecklistResponse(item.id)}
                              </td>
                            </tr>
                          ))}
                          {/* Equalize row count if left side is larger */}
                          {rightChecklistItems.length < leftChecklistItems.length && (
                            <tr>
                              <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>&nbsp;</td>
                              <td style={{ border: "1px solid #000", padding: "4px" }}>&nbsp;</td>
                              <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>&nbsp;</td>
                            </tr>
                          )}
                        </>
                      ) : (
                        <tr>
                          <td
                            colSpan={3}
                            style={{
                              border: "1px solid #000",
                              padding: "8px",
                              textAlign: "center",
                              fontStyle: "italic",
                              color: "#666",
                            }}
                          >
                            No checklist items
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                {/* Submitted Documents / Attachments Table for DSR & SD */}
                <div
                  style={{
                    width: "100%",
                    border: "1px solid #000",
                    background: "#d0d0d0",
                    padding: "6px",
                    textAlign: "center",
                    fontWeight: "bold",
                    fontSize: "12px",
                    boxSizing: "border-box",
                  }}
                >
                  {isSD ? "Documents" : "Submitted Documents / Attachments"}
                </div>

                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    marginBottom: "10px",
                    fontSize: "11px",
                    marginTop: "-1px",
                  }}
                >
                  <thead>
                    <tr style={{ background: "#f5f5f5" }}>
                      <th style={{ border: "1px solid #000", padding: "4px", width: "30px", textAlign: "center", fontWeight: "bold" }}>No.</th>
                      <th style={{ border: "1px solid #000", padding: "4px", textAlign: "left", fontWeight: "bold" }}>Doc ID</th>
                      <th style={{ border: "1px solid #000", padding: "4px", textAlign: "left", fontWeight: "bold" }}>Title</th>
                      <th style={{ border: "1px solid #000", padding: "4px", textAlign: "left", fontWeight: "bold" }}>Type</th>
                      <th style={{ border: "1px solid #000", padding: "4px", textAlign: "left", fontWeight: "bold" }}>File Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revisionDocuments.length > 0 ? (
                      revisionDocuments.map((doc, idx) => (
                        <tr key={doc.id || idx}>
                          <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>{idx + 1}</td>
                          <td style={{ border: "1px solid #000", padding: "4px" }}>{doc.documentRef || "—"}</td>
                          <td style={{ border: "1px solid #000", padding: "4px" }}>{doc.title || "—"}</td>
                          <td style={{ border: "1px solid #000", padding: "4px" }}>{doc.documentType || "—"}</td>
                          <td style={{ border: "1px solid #000", padding: "4px" }}>{doc.fileName || "—"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} style={{ border: "1px solid #000", padding: "8px", textAlign: "center", fontStyle: "italic", color: "#666" }}>
                          No documents submitted
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            )}

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginBottom: "10px",
                fontSize: "12px",
              }}
            >
              <tbody>
                {/* Recommendations Section (WIR only) */}
                {!isMIR && !isSSR && !isMAR && !isDSR && !isSD && (
                  <>
                    <tr>
                      <th
                        colSpan={3}
                        style={{
                          border: "1px solid #000",
                          padding: "6px",
                          background: "#d0d0d0",
                          textAlign: "center",
                          fontWeight: "bold",
                          marginTop: "10px",
                        }}
                      >
                        Recommendations
                      </th>
                    </tr>
                    {checklistItems.filter(
                      (item) => item.category === "recommendations",
                    ).length > 0 ? (
                      checklistItems
                        .filter((item) => item.category === "recommendations")
                        .map((item, idx) => (
                          <tr key={item.id}>
                            <td
                              style={{
                                border: "1px solid #000",
                                padding: "4px",
                                textAlign: "center",
                              }}
                            >
                              {idx + 1}
                            </td>
                            <td
                              colSpan={2}
                              style={{
                                border: "1px solid #000",
                                padding: "4px",
                              }}
                            >
                              {item.nameEnglish}
                            </td>
                          </tr>
                        ))
                    ) : (
                      <tr>
                        <td
                          colSpan={3}
                          style={{
                            border: "1px solid #000",
                            padding: "8px",
                            textAlign: "center",
                            fontStyle: "italic",
                            color: "#666",
                          }}
                        >
                          No recommendations
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>

            {/* Consultant Section */}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginBottom: "10px",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      background: "#d0d0d0",
                      textAlign: "center",
                      fontWeight: "bold",
                    }}
                    colSpan={5}
                  >
                    Consultant
                  </th>
                </tr>
                <tr>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      background: "#e0e0e0",
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    Name{" "}
                  </th>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      background: "#e0e0e0",
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    Action
                  </th>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      background: "#e0e0e0",
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    Date
                  </th>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      background: "#e0e0e0",
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    Position
                  </th>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "4px 6px",
                      background: "#e0e0e0",
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    Signature
                  </th>
                </tr>
              </thead>
              <tbody>
                {consultantApprovals.length > 0 ? (
                  consultantApprovals.map((approval) => (
                    <React.Fragment key={approval.id}>
                      <tr>
                        <td
                          style={{
                            border: "1px solid #000",
                            padding: "4px 6px",
                          }}
                        >
                          {getUserName(approval.changedBy)}
                        </td>
                        <td
                          style={{
                            border: "1px solid #000",
                            padding: "4px 6px",
                            textAlign: "center",
                            verticalAlign: "middle",
                          }}
                        >
                          {approvalStatus && approvalStatus !== "" ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontWeight: "bold",
                                backgroundColor:
                                  approvalStatus === "A"
                                    ? "#22c55e"
                                    : approvalStatus === "B"
                                      ? "#3b82f6"
                                      : approvalStatus === "C"
                                        ? "#eab308"
                                        : approvalStatus === "D"
                                          ? "#ef4444"
                                          : approvalStatus === "E"
                                            ? "#d0d0d0"
                                            : "transparent",
                                color:
                                  approvalStatus === "A" ||
                                    approvalStatus === "B" ||
                                    approvalStatus === "C"
                                    ? "#fff"
                                    : "#000",
                              }}
                            >
                              {approvalStatus}
                            </span>
                          ) : (
                            <span
                              style={{ color: "#666", fontStyle: "italic" }}
                            >
                              Pending
                            </span>
                          )}
                        </td>
                        <td
                          style={{
                            border: "1px solid #000",
                            padding: "4px 6px",
                          }}
                        >
                          {formatGMT3(
                            approval.changedAt,
                            "yyyy/MM/dd HH:mm:ss",
                          )}
                        </td>
                        <td
                          style={{
                            border: "1px solid #000",
                            padding: "4px 6px",
                          }}
                        >
                          {getUserPosition
                            ? getUserPosition(approval.changedBy)
                            : "—"}
                        </td>
                        <td
                          style={{
                            border: "1px solid #000",
                            padding: "4px 6px",
                            textAlign: "center",
                            minWidth: "80px",
                          }}
                        >
                          {getSignature(approval.changedBy) ? (
                            <img
                              src={getSignature(approval.changedBy)}
                              alt="signature"
                              style={{ maxHeight: "25px", maxWidth: "80px" }}
                            />
                          ) : null}
                        </td>
                      </tr>
                      {(() => {
                        const commentText = consultantReviews[0]?.comments || approval.remarks;
                        const hasNoComment = !commentText ||
                          commentText === "—" ||
                          commentText.startsWith("Step approved:");

                        if (hasNoComment) return null;

                        return (
                          <tr>
                            <td
                              colSpan={5}
                              style={{
                                border: "1px solid #000",
                                padding: "4px 6px",
                                background: "#f9f9f9",
                              }}
                            >
                              <span style={{ fontWeight: "bold" }}>Comment: </span>
                              {commentText}
                            </td>
                          </tr>
                        );
                      })()}
                    </React.Fragment>
                  ))
                ) : (
                  <tr>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "4px 6px",
                        textAlign: "center",
                      }}
                      colSpan={5}
                    >
                      No consultant actions yet
                    </td>
                  </tr>
                )}
                {displayConsultantManager && (
                  <React.Fragment>
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          border: "1px solid #000",
                          padding: "4px 6px",
                          background: "#f5f5f5",
                          fontWeight: "bold",
                        }}
                      >
                        Consultant Manager Approval
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px 6px",
                        }}
                      >
                        {getUserName(displayConsultantManager.changedBy)}
                      </td>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px 6px",
                          textAlign: "center",
                          verticalAlign: "middle",
                        }}
                      >
                        {approvalStatus && approvalStatus !== "" ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontWeight: "bold",
                              backgroundColor:
                                approvalStatus === "A"
                                  ? "#22c55e"
                                  : approvalStatus === "B"
                                    ? "#3b82f6"
                                    : approvalStatus === "C"
                                      ? "#eab308"
                                      : approvalStatus === "D"
                                        ? "#ef4444"
                                        : approvalStatus === "E"
                                          ? "#d0d0d0"
                                          : "transparent",
                              color:
                                approvalStatus === "A" ||
                                  approvalStatus === "B" ||
                                  approvalStatus === "C"
                                  ? "#fff"
                                  : "#000",
                            }}
                          >
                            {approvalStatus}
                          </span>
                        ) : (
                          <span
                            style={{ color: "#666", fontStyle: "italic" }}
                          >
                            Pending
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px 6px",
                        }}
                      >
                        {formatGMT3(
                          displayConsultantManager.changedAt,
                          "yyyy/MM/dd HH:mm:ss",
                        )}
                      </td>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px 6px",
                        }}
                      >
                        {getUserPosition
                          ? getUserPosition(displayConsultantManager.changedBy)
                          : "—"}
                      </td>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px 6px",
                          textAlign: "center",
                          minWidth: "80px",
                        }}
                      >
                        {getSignature(displayConsultantManager.changedBy) ? (
                          <img
                            src={getSignature(displayConsultantManager.changedBy)}
                            alt="signature"
                            style={{ maxHeight: "25px", maxWidth: "80px" }}
                          />
                        ) : null}
                      </td>
                    </tr>
                    {(() => {
                      const commentText = displayConsultantManager.remarks;
                      const hasNoComment = !commentText ||
                        commentText === "—" ||
                        commentText.startsWith("Step approved:");

                      if (hasNoComment) return null;

                      return (
                        <tr>
                          <td
                            colSpan={5}
                            style={{
                              border: "1px solid #000",
                              padding: "4px 6px",
                              background: "#f9f9f9",
                            }}
                          >
                            <span style={{ fontWeight: "bold" }}>Comment: </span>
                            {commentText}
                          </td>
                        </tr>
                      );
                    })()}
                  </React.Fragment>
                )}
              </tbody>
            </table>



            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginBottom: "10px",
              }}
            >
              <tbody>
                <tr>
                  <td
                    colSpan={2}
                    style={{ border: "1px solid #000", padding: "8px" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "15px",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontWeight: "bold" }}>
                        Approval Status :
                      </span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <div>
                          <span
                            style={{
                              display: "inline-block",
                              width: "14px",
                              height: "14px",
                              border: "1px solid #000",
                              marginRight: "4px",
                              verticalAlign: "middle",
                              textAlign: "center",
                              lineHeight: "12px",
                              fontSize: "12px",
                              background:
                                approvalStatus === "A" ? "#22c55e" : "transparent",
                              color: approvalStatus === "A" ? "#fff" : "#000",
                              fontWeight:
                                approvalStatus === "A" ? "bold" : "normal",
                              outline:
                                approvalStatus === "A"
                                  ? "2px solid #22c55e"
                                  : "none",
                            }}
                          >
                            {approvalStatus === "A" ? "✔" : ""}
                          </span>
                          <span
                            style={{
                              fontWeight:
                                approvalStatus === "A" ? "bold" : "normal",
                            }}
                          >
                            (A) Approved
                          </span>
                        </div>
                        <div>
                          <span
                            style={{
                              display: "inline-block",
                              width: "14px",
                              height: "14px",
                              border: "1px solid #000",
                              marginRight: "4px",
                              verticalAlign: "middle",
                              textAlign: "center",
                              lineHeight: "12px",
                              fontSize: "12px",
                              background:
                                approvalStatus === "B" ? "#3b82f6" : "transparent",
                              color: approvalStatus === "B" ? "#fff" : "#000",
                              fontWeight:
                                approvalStatus === "B" ? "bold" : "normal",
                              outline:
                                approvalStatus === "B"
                                  ? "2px solid #3b82f6"
                                  : "none",
                            }}
                          >
                            {approvalStatus === "B" ? "! " : ""}
                          </span>
                          <span
                            style={{
                              fontWeight:
                                approvalStatus === "B" ? "bold" : "normal",
                            }}
                          >
                            (B) Approved As Noted
                          </span>
                        </div>
                        <div>
                          <span
                            style={{
                              display: "inline-block",
                              width: "14px",
                              height: "14px",
                              border: "1px solid #000",
                              marginRight: "4px",
                              verticalAlign: "middle",
                              textAlign: "center",
                              lineHeight: "12px",
                              fontSize: "12px",
                              background:
                                approvalStatus === "C" ? "#eab308" : "transparent",
                              color: approvalStatus === "C" ? "#fff" : "#000",
                              fontWeight:
                                approvalStatus === "C" ? "bold" : "normal",
                              outline:
                                approvalStatus === "C"
                                  ? "2px solid #eab308"
                                  : "none",
                            }}
                          >
                            {approvalStatus === "C" ? "↺" : ""}
                          </span>
                          <span
                            style={{
                              fontWeight:
                                approvalStatus === "C" ? "bold" : "normal",
                            }}
                          >
                            (C) Revise and Resubmit
                          </span>
                        </div>
                        <div>
                          <span
                            style={{
                              display: "inline-block",
                              width: "14px",
                              height: "14px",
                              border: "1px solid #000",
                              marginRight: "4px",
                              verticalAlign: "middle",
                              textAlign: "center",
                              lineHeight: "12px",
                              fontSize: "12px",
                              background:
                                approvalStatus === "D" ? "#ef4444" : "transparent",
                              color: approvalStatus === "D" ? "#000" : "#000",
                              fontWeight:
                                approvalStatus === "D" ? "bold" : "normal",
                              outline:
                                approvalStatus === "D"
                                  ? "2px solid #ef4444"
                                  : "none",
                            }}
                          >
                            {approvalStatus === "D" ? "X" : ""}
                          </span>
                          <span
                            style={{
                              fontWeight:
                                approvalStatus === "D" ? "bold" : "normal",
                            }}
                          >
                            (D) Rejected
                          </span>
                        </div>
                        <div>
                          <span
                            style={{
                              display: "inline-block",
                              width: "14px",
                              height: "14px",
                              border: "1px solid #000",
                              marginRight: "4px",
                              verticalAlign: "middle",
                              textAlign: "center",
                              lineHeight: "12px",
                              fontSize: "12px",
                              background:
                                approvalStatus === "E" ? "#d0d0d0" : "transparent",
                              color: approvalStatus === "E" ? "#000" : "#000",
                              fontWeight:
                                approvalStatus === "E" ? "bold" : "normal",
                              outline:
                                approvalStatus === "E"
                                  ? "2px solid #d0d0d0"
                                  : "none",
                            }}
                          >
                            {approvalStatus === "E" ? "X" : ""}
                          </span>
                          <span
                            style={{
                              fontWeight:
                                approvalStatus === "E" ? "bold" : "normal",
                            }}
                          >
                            (E) Close automatically by system.
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Signature Section */}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginBottom: "10px",
              }}
            >
              <tbody>
                {revisionAttachments.length > 0 && (
                  <tr>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "6px",
                        fontWeight: "bold",
                        background: "#f5f5f5",
                        width: "120px",
                      }}
                    >
                      Attachments :
                    </td>
                    <td
                      style={{ border: "1px solid #000", padding: "6px" }}
                      colSpan={7}
                    >
                      {revisionAttachments
                        .map((a, i) => `${i + 1} - ${a.fileName}`)
                        .join(", ")}
                    </td>
                  </tr>
                )}
                <tr>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      fontWeight: "bold",
                      background: "#f5f5f5",
                    }}
                  >
                    Contractor Receive :
                  </td>
                  <td style={{ border: "1px solid #000", padding: "6px" }}>
                    {closedApproval
                      ? getUserName(closedApproval.changedBy)
                      : "—"}
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      fontWeight: "bold",
                      background: "#f5f5f5",
                    }}
                  >
                    Position :
                  </td>
                  <td style={{ border: "1px solid #000", padding: "6px" }}>
                    {closedApproval
                      ? getPosition(closedApproval.changedBy)
                      : "—"}
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      fontWeight: "bold",
                      background: "#f5f5f5",
                    }}
                  >
                    Signature :
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      textAlign: "center",
                    }}
                  >
                    {closedApproval &&
                      getSignature(closedApproval.changedBy) ? (
                      <img
                        src={getSignature(closedApproval.changedBy)}
                        alt="signature"
                        style={{ maxHeight: "30px", maxWidth: "100px" }}
                      />
                    ) : null}
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      fontWeight: "bold",
                      background: "#f5f5f5",
                    }}
                  >
                    Date :
                  </td>
                  <td style={{ border: "1px solid #000", padding: "6px" }}>
                    {formatGMT3(
                      closedApproval?.changedAt,
                      "yyyy/MM/dd HH:mm:ss",
                    )}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Consultant Attached Images - Page 2 */}
            {(!isMIR && !isSSR && !isMAR && !isDSR && !isSD) && consultantImages.length > 0 && (
              <div style={{ pageBreakBefore: "always", paddingTop: "20px" }}>
                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: "bold", borderBottom: "2px solid #000", display: "inline-block", paddingBottom: "5px" }}>
                    Consultant Attachments (Images)
                  </h3>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", justifyContent: "center" }}>
                  {consultantImages.map((img, idx) => (
                    <div key={img.id || idx} style={{ width: "100%", maxWidth: "700px", textAlign: "center", marginBottom: "30px", pageBreakInside: "avoid" }}>
                      <p style={{ fontWeight: "bold", marginBottom: "8px", fontSize: "14px" }}>{idx + 1} - {img.fileName}</p>
                      <img
                        src={getFileUrl(img.fileUrl || img.fileData || undefined)}
                        alt={img.fileName}
                        style={{ maxWidth: "100%", maxHeight: "800px", objectFit: "contain", border: "1px solid #000", padding: "5px", background: "#fff", display: "block", margin: "0 auto" }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delivery Note PDF / Image (for MIR) */}
            {isMIR && revisionDeliveries && revisionDeliveries.length > 0 && (
              (() => {
                const validDeliveries = revisionDeliveries.filter(rd => 
                  rd.delivery.attachment && (
                    isPdfFile(rd.delivery.attachment.fileName, rd.delivery.attachment.fileUrl || rd.delivery.attachment.fileData) ||
                    isImageFile(rd.delivery.attachment.fileName, rd.delivery.attachment.fileUrl || rd.delivery.attachment.fileData)
                  )
                );
                
                if (validDeliveries.length === 0) return null;

                return (
                  <div style={{ pageBreakBefore: "always", paddingTop: "0px", marginTop: "0px" }}>
                    <div style={{ textAlign: "center", marginBottom: "15px" }}>
                      <h3 style={{ fontSize: "16px", fontWeight: "bold", display: "inline-block", paddingBottom: "5px" }}>
                        Delivery Notes / مذكرات التسليم
                      </h3>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>
                      {validDeliveries.map((rd, idx) => {
                        const fileSrc = getFileUrl(rd.delivery.attachment?.fileUrl || rd.delivery.attachment?.fileData || undefined);
                        const isPDF = isPdfFile(rd.delivery.attachment?.fileName, rd.delivery.attachment?.fileUrl || rd.delivery.attachment?.fileData);
                        
                        return (
                          <div key={rd.id || idx} style={{ width: "100%" }}>
                            <p style={{ fontWeight: "bold", marginBottom: "8px", fontSize: "13px" }}>
                              {idx + 1} - Delivery Note for Shipment: {rd.delivery.shipmentNumber} ({rd.delivery.attachment?.fileName})
                            </p>
                            <div style={{ width: "100%", marginTop: "10px", display: "flex", justifyContent: "center" }}>
                              {isPDF ? (
                                <InlinePdfViewer fileUrl={fileSrc} />
                              ) : (
                                <img
                                  src={fileSrc}
                                  alt="Delivery Note"
                                  style={{ maxWidth: "100%", height: "auto", border: "1px solid #000", background: "#fff", display: "block" }}
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

            {/* Contractor Submitted Documents / Attachments (for SD and ASD) */}
            {isSD && revisionDocuments && revisionDocuments.length > 0 && (
              (() => {
                const validDocuments = revisionDocuments.filter(doc => 
                  isPdfFile(doc.fileName, doc.fileUrl) ||
                  isImageFile(doc.fileName, doc.fileUrl)
                );
                
                if (validDocuments.length === 0) return null;

                return (
                  <div style={{ pageBreakBefore: "always", paddingTop: "0px", marginTop: "0px" }}>
                    <div style={{ textAlign: "center", marginBottom: "15px" }}>
                      <h3 style={{ fontSize: "16px", fontWeight: "bold", display: "inline-block", paddingBottom: "5px" }}>
                        Submitted Drawings & Documents / الرسومات والمستندات المقدمة
                      </h3>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>
                      {validDocuments.map((doc, idx) => {
                        const fileSrc = getFileUrl(doc.fileUrl || undefined);
                        const isPDF = isPdfFile(doc.fileName, doc.fileUrl);
                        
                        return (
                          <div key={doc.id || idx} style={{ width: "100%" }}>
                            <p style={{ fontWeight: "bold", marginBottom: "8px", fontSize: "13px" }}>
                              {idx + 1} - {doc.title || doc.fileName} {doc.documentRef ? `(${doc.documentRef})` : ""}
                            </p>
                            <div style={{ width: "100%", marginTop: "10px", display: "flex", justifyContent: "center" }}>
                              {isPDF ? (
                                <InlinePdfViewer fileUrl={fileSrc} />
                              ) : (
                                <img
                                  src={fileSrc}
                                  alt={doc.title || "Document"}
                                  style={{ maxWidth: "100%", height: "auto", border: "1px solid #000", background: "#fff", display: "block" }}
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

            {/* Footer */}


            <div
              className="footer-copyright"
              style={{
                textAlign: "center",
                fontSize: "11px",
                color: "#666",
                borderTop: "1px solid #ccc",
                paddingTop: "8px",
                margin: "15px 40px 0 40px",
              }}
            >
              semat.fursan.sa copyright © {new Date().getFullYear()} .
            </div>
          </div>
  );

  if (renderInline) {
    return <div className="bg-white p-4">{formBody}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col rounded-[1.5rem] sm:rounded-[1.5rem]">
        <DialogHeader className="flex-row items-center justify-between gap-4 space-y-0 pb-3 border-b border-primary/10">
          <DialogTitle className="text-lg font-black text-foreground">{finalTitle}</DialogTitle>
          <div className="flex items-center gap-2 pr-10">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-primary/20 text-primary hover:bg-primary/5 hover:text-primary transition-all duration-200 shadow-sm"
              onClick={handleDownloadPDF}
              data-testid="button-download-pdf"
            >
              <FileDown className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-primary/20 text-primary hover:bg-primary/5 hover:text-primary transition-all duration-200 shadow-sm"
              onClick={handlePrint}
              data-testid="button-print-wir"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-white dark:bg-gray-100 rounded-md p-4">
          {formBody}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-close-wir"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog >
  );
}
