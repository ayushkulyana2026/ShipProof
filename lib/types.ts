export const ZONES = ["A", "B", "C", "D", "E"] as const;
export type Zone = (typeof ZONES)[number];
/** A zone we could resolve, or "Unknown" when a pincode is missing from the directory. */
export type ResolvedZone = Zone | "Unknown";

export type ShipmentType = "forward" | "rto";

export type InvoiceLine = {
  awb: string;
  courier: string;
  billedWeightKg: number;
  billedZone?: Zone;
  freightCharge: number;
  codCharge?: number;
  rtoCharge?: number;
  fuelSurcharge?: number;
  otherCharges?: number;
  gst?: number;
  totalCharge: number;
  shipmentType?: ShipmentType;
  invoiceDate?: string;
  /** 1-based row number in the uploaded file (for traceability). */
  sourceRow?: number;
};

export type PaymentMode = "COD" | "Prepaid";
export type OrderStatus = "Delivered" | "RTO" | "In transit" | "Cancelled";

export type Order = {
  orderId: string;
  awb: string;
  destinationPincode: string;
  actualWeightKg: number;
  lengthCm?: number;
  breadthCm?: number;
  heightCm?: number;
  paymentMode: PaymentMode;
  orderValue: number;
  status?: OrderStatus;
};

export type RtoRule = "same_as_forward" | "percent_of_forward" | "flat";

export type SlabRate = { firstSlab: number; additionalSlab: number };

export type RateCard = {
  courier: string;
  originPincode: string;
  volumetricDivisor: number;
  firstSlabKg: number;
  additionalSlabKg: number;
  rates: Record<Zone, SlabRate>;
  rtoRule: RtoRule;
  rtoValue?: number;
  codFixed: number;
  codPercent: number;
  fuelSurchargePercent: number;
  gstPercent: number;
  tolerancePercent: number;
};

export const ISSUE_TYPES = [
  "WEIGHT_OVERCHARGE",
  "WRONG_ZONE",
  "RATE_MISMATCH",
  "COD_ON_PREPAID",
  "COD_WRONG_AMOUNT",
  "DUPLICATE_AWB",
  "RTO_WITHOUT_RETURN",
  "RTO_WRONG_RATE",
  "UNMATCHED_AWB",
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export type Severity = "high" | "medium" | "low";

export type Issue = {
  awb: string;
  orderId?: string;
  courier: string;
  type: IssueType;
  severity: Severity;
  expected: string;
  billed: string;
  overchargeAmount: number;
  explanation: string;
  /** Step-by-step calculation shown when the row is expanded. */
  working?: string[];
};

export type BoxSize = { lengthCm: number; breadthCm: number; heightCm: number };
