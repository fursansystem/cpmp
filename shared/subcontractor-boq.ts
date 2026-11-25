// جدول الكميات لمقاولي الباطن (Subcontractor Contract & Certificate BOQ)
// Pure calculation, validation, and aggregation engine shared by server and client
// so live previews and saved financial records always match to the exact halala/cent.

export const BOQ_BILLING_MODES = ["qty", "progress"] as const;
export type BoqBillingMode = (typeof BOQ_BILLING_MODES)[number];

export const BOQ_COMMON_UNITS = [
  "m²",
  "m³",
  "m",
  "No.",
  "LS",
  "Ton",
  "Kg",
  "Set",
  "Lot",
  "Point",
  "Day",
] as const;

export const roundMoney = (v: number): number => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
export const roundQty = (v: number): number => Math.round((Number(v || 0) + Number.EPSILON) * 10_000) / 10_000;
export const roundPct = (v: number): number => Math.round((Number(v || 0) + Number.EPSILON) * 10_000) / 10_000;

export const computeBoqContractAmount = (contractQty: number, unitRate: number): number =>
  roundMoney(Math.max(0, Number(contractQty || 0)) * Math.max(0, Number(unitRate || 0)));

export interface ContractBoqItemDto {
  id?: string;
  projectBoqItemId?: string | null;
  sortOrder: number;
  section?: string | null;
  itemCode: string;
  costCode?: string | null;
  description: string;
  unit: string;
  billingMode: BoqBillingMode;
  contractQty: number;
  unitRate: number;
  contractAmount: number;
  isVariation: boolean;
  variationRef?: string | null;
  notes?: string | null;
  // Server-enriched certification metadata (read-only)
  certifiedQty?: number;
  certifiedPercent?: number;
  certifiedAmount?: number;
  certifiedCertCount?: number;
  isLocked?: boolean;
}

export interface CertificateBoqLineDto {
  id?: string;
  contractBoqItemId: string | null;
  sortOrder: number;
  section?: string | null;
  itemCode: string;
  costCode?: string | null;
  description: string;
  unit: string;
  billingMode: BoqBillingMode;
  isVariation: boolean;
  variationRef?: string | null;
  contractQty: number;
  unitRate: number;
  contractAmount: number;
  previousQty: number;
  currentQty: number;
  cumulativeQty: number;
  previousPercent: number;
  currentPercent: number;
  cumulativePercent: number;
  previousAmount: number;
  currentAmount: number;
  cumulativeAmount: number;
  notes?: string | null;
}

export interface ComputeBoqLineInput {
  billingMode: BoqBillingMode;
  contractQty: number;
  unitRate: number;
  contractAmount?: number;
  previousQty: number;
  previousPercent: number;
  previousAmount: number;
  // Provide either current* OR cumulative* (bidirectional). If both are provided, cumulative* wins unless source === "current".
  source?: "current" | "cumulative";
  currentQty?: number;
  cumulativeQty?: number;
  currentPercent?: number;
  cumulativePercent?: number;
}

export interface ComputedBoqLineValues {
  contractAmount: number;
  previousQty: number;
  currentQty: number;
  cumulativeQty: number;
  previousPercent: number;
  currentPercent: number;
  cumulativePercent: number;
  previousAmount: number;
  currentAmount: number;
  cumulativeAmount: number;
  remainingAmount: number;
  isOverContract: boolean;
  overQty: number;
  isNegativeAdjustment: boolean;
}

// Computes authoritative Qty, %, and Amount columns with zero cumulative rounding drift:
//   currentAmount = roundMoney(cumulativeAmount - previousAmount)
// so reaching 100% progress or full contractQty always sums to the exact contractAmount.
export function computeBoqLine(input: ComputeBoqLineInput): ComputedBoqLineValues {
  const contractQty = Math.max(0, roundQty(input.contractQty));
  const unitRate = Math.max(0, roundMoney(input.unitRate));
  const contractAmount =
    input.contractAmount != null && Number.isFinite(input.contractAmount)
      ? roundMoney(Math.max(0, input.contractAmount))
      : computeBoqContractAmount(contractQty, unitRate);

  const prevQty = roundQty(Math.max(0, input.previousQty || 0));
  const prevPct = roundPct(Math.max(0, input.previousPercent || 0));
  const prevAmt = roundMoney(Math.max(0, input.previousAmount || 0));

  if (input.billingMode === "progress") {
    let cumPct: number;
    if (input.source === "current" && input.currentPercent != null) {
      cumPct = roundPct(prevPct + Number(input.currentPercent || 0));
    } else if (input.cumulativePercent != null) {
      cumPct = roundPct(Number(input.cumulativePercent || 0));
    } else if (input.currentPercent != null) {
      cumPct = roundPct(prevPct + Number(input.currentPercent || 0));
    } else {
      cumPct = prevPct;
    }

    const curPct = roundPct(cumPct - prevPct);
    const cumAmt = roundMoney((contractAmount * cumPct) / 100);
    const curAmt = roundMoney(cumAmt - prevAmt);
    const cumQty = roundQty((contractQty * cumPct) / 100);
    const curQty = roundQty(cumQty - prevQty);
    const remainingAmount = roundMoney(contractAmount - cumAmt);

    return {
      contractAmount,
      previousQty: prevQty,
      currentQty: curQty,
      cumulativeQty: cumQty,
      previousPercent: prevPct,
      currentPercent: curPct,
      cumulativePercent: cumPct,
      previousAmount: prevAmt,
      currentAmount: curAmt,
      cumulativeAmount: cumAmt,
      remainingAmount,
      isOverContract: cumPct > 100.0001,
      overQty: Math.max(0, roundQty(cumQty - contractQty)),
      isNegativeAdjustment: curPct < -0.0001 || curAmt < -0.005,
    };
  }

  // Qty-based (re-measured / unit-rate)
  let cumQty: number;
  if (input.source === "current" && input.currentQty != null) {
    cumQty = roundQty(prevQty + Number(input.currentQty || 0));
  } else if (input.cumulativeQty != null) {
    cumQty = roundQty(Number(input.cumulativeQty || 0));
  } else if (input.currentQty != null) {
    cumQty = roundQty(prevQty + Number(input.currentQty || 0));
  } else {
    cumQty = prevQty;
  }

  const curQty = roundQty(cumQty - prevQty);
  const cumAmt = roundMoney(cumQty * unitRate);
  const curAmt = roundMoney(cumAmt - prevAmt);
  const derivedPrevPct = contractQty > 0 ? roundPct((prevQty / contractQty) * 100) : prevPct;
  const derivedCumPct = contractQty > 0 ? roundPct((cumQty / contractQty) * 100) : 0;
  const derivedCurPct = roundPct(derivedCumPct - derivedPrevPct);
  const remainingAmount = roundMoney(contractAmount - cumAmt);

  return {
    contractAmount,
    previousQty: prevQty,
    currentQty: curQty,
    cumulativeQty: cumQty,
    previousPercent: derivedPrevPct,
    currentPercent: derivedCurPct,
    cumulativePercent: derivedCumPct,
    previousAmount: prevAmt,
    currentAmount: curAmt,
    cumulativeAmount: cumAmt,
    remainingAmount,
    isOverContract: contractQty > 0 && cumQty > contractQty + 0.0001,
    overQty: contractQty > 0 ? Math.max(0, roundQty(cumQty - contractQty)) : 0,
    isNegativeAdjustment: curQty < -0.0001 || curAmt < -0.005,
  };
}

export type BoqLineValidationError = "cumulative_below_zero" | "progress_exceeds_100";

export function validateCertificateBoqLine(line: {
  billingMode: BoqBillingMode;
  cumulativeQty: number;
  cumulativePercent: number;
}): BoqLineValidationError[] {
  const errors: BoqLineValidationError[] = [];
  if (line.billingMode === "progress") {
    if (line.cumulativePercent < -0.0001) errors.push("cumulative_below_zero");
    if (line.cumulativePercent > 100.0001) errors.push("progress_exceeds_100");
  } else {
    if (line.cumulativeQty < -0.0001) errors.push("cumulative_below_zero");
  }
  return errors;
}

export interface BoqSectionSummary {
  section: string;
  itemCount: number;
  contractTotal: number;
  previousTotal: number;
  currentTotal: number;
  cumulativeTotal: number;
  remainingTotal: number;
  progressPercent: number;
}

export interface BoqValuationSummary {
  itemCount: number;
  qtyItemCount: number;
  progressItemCount: number;
  variationCount: number;
  originalContractTotal: number;
  variationsTotal: number;
  revisedContractTotal: number;
  originalPreviousTotal: number;
  originalCurrentTotal: number;
  originalCumulativeTotal: number;
  variationsPreviousTotal: number;
  variationsCurrentTotal: number;
  variationsCumulativeTotal: number;
  previousTotal: number;
  currentTotal: number;
  cumulativeTotal: number;
  remainingTotal: number;
  overallProgressPercent: number;
  overContractCount: number;
  negativeAdjustmentCount: number;
  sections: BoqSectionSummary[];
}

export function summarizeBoqLines(lines: CertificateBoqLineDto[]): BoqValuationSummary {
  let qtyItemCount = 0;
  let progressItemCount = 0;
  let variationCount = 0;
  let originalContractTotal = 0;
  let variationsTotal = 0;
  let originalPreviousTotal = 0;
  let originalCurrentTotal = 0;
  let originalCumulativeTotal = 0;
  let variationsPreviousTotal = 0;
  let variationsCurrentTotal = 0;
  let variationsCumulativeTotal = 0;
  let overContractCount = 0;
  let negativeAdjustmentCount = 0;

  const sectionOrder: string[] = [];
  const sectionMap = new Map<
    string,
    { itemCount: number; contractTotal: number; previousTotal: number; currentTotal: number; cumulativeTotal: number }
  >();

  for (const line of lines) {
    const cAmt = Number(line.contractAmount || 0);
    const pAmt = Number(line.previousAmount || 0);
    const curAmt = Number(line.currentAmount || 0);
    const cumAmt = Number(line.cumulativeAmount || 0);

    if (line.billingMode === "progress") progressItemCount++;
    else qtyItemCount++;

    if (line.isVariation) {
      variationCount++;
      variationsTotal += cAmt;
      variationsPreviousTotal += pAmt;
      variationsCurrentTotal += curAmt;
      variationsCumulativeTotal += cumAmt;
    } else {
      originalContractTotal += cAmt;
      originalPreviousTotal += pAmt;
      originalCurrentTotal += curAmt;
      originalCumulativeTotal += cumAmt;
    }

    const isOver =
      line.billingMode === "qty" && Number(line.contractQty || 0) > 0 && Number(line.cumulativeQty || 0) > Number(line.contractQty || 0) + 0.0001;
    if (isOver) overContractCount++;

    const isNeg =
      (line.billingMode === "progress" ? Number(line.currentPercent || 0) < -0.0001 : Number(line.currentQty || 0) < -0.0001) ||
      curAmt < -0.005;
    if (isNeg) negativeAdjustmentCount++;

    const secKey = (line.section ?? "").trim();
    if (!sectionMap.has(secKey)) {
      sectionOrder.push(secKey);
      sectionMap.set(secKey, { itemCount: 0, contractTotal: 0, previousTotal: 0, currentTotal: 0, cumulativeTotal: 0 });
    }
    const bucket = sectionMap.get(secKey)!;
    bucket.itemCount += 1;
    bucket.contractTotal += cAmt;
    bucket.previousTotal += pAmt;
    bucket.currentTotal += curAmt;
    bucket.cumulativeTotal += cumAmt;
  }

  originalContractTotal = roundMoney(originalContractTotal);
  variationsTotal = roundMoney(variationsTotal);
  const revisedContractTotal = roundMoney(originalContractTotal + variationsTotal);
  originalPreviousTotal = roundMoney(originalPreviousTotal);
  originalCurrentTotal = roundMoney(originalCurrentTotal);
  originalCumulativeTotal = roundMoney(originalCumulativeTotal);
  variationsPreviousTotal = roundMoney(variationsPreviousTotal);
  variationsCurrentTotal = roundMoney(variationsCurrentTotal);
  variationsCumulativeTotal = roundMoney(variationsCumulativeTotal);

  const previousTotal = roundMoney(originalPreviousTotal + variationsPreviousTotal);
  const currentTotal = roundMoney(originalCurrentTotal + variationsCurrentTotal);
  const cumulativeTotal = roundMoney(originalCumulativeTotal + variationsCumulativeTotal);
  const remainingTotal = roundMoney(revisedContractTotal - cumulativeTotal);
  const overallProgressPercent =
    revisedContractTotal > 0 ? roundMoney((cumulativeTotal / revisedContractTotal) * 100) : 0;

  const sections: BoqSectionSummary[] = sectionOrder.map((sec) => {
    const b = sectionMap.get(sec)!;
    const cTot = roundMoney(b.contractTotal);
    const cumTot = roundMoney(b.cumulativeTotal);
    return {
      section: sec,
      itemCount: b.itemCount,
      contractTotal: cTot,
      previousTotal: roundMoney(b.previousTotal),
      currentTotal: roundMoney(b.currentTotal),
      cumulativeTotal: cumTot,
      remainingTotal: roundMoney(cTot - cumTot),
      progressPercent: cTot > 0 ? roundMoney((cumTot / cTot) * 100) : 0,
    };
  });

  return {
    itemCount: lines.length,
    qtyItemCount,
    progressItemCount,
    variationCount,
    originalContractTotal,
    variationsTotal,
    revisedContractTotal,
    originalPreviousTotal,
    originalCurrentTotal,
    originalCumulativeTotal,
    variationsPreviousTotal,
    variationsCurrentTotal,
    variationsCumulativeTotal,
    previousTotal,
    currentTotal,
    cumulativeTotal,
    remainingTotal,
    overallProgressPercent,
    overContractCount,
    negativeAdjustmentCount,
    sections,
  };
}
