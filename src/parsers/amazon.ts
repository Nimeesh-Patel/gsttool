import fs from "node:fs";
import Papa from "papaparse";
import Decimal from "decimal.js";
import {
  DocumentIssueRecord,
  DocumentCategory,
  NormalizedSupplyRecord,
  SourceExtraction
} from "../gst/types";
import {
  DEFAULT_SELLER_STATE,
  getSupplyType,
  GSTStateCode,
  SupplyType,
  toGSTStateCode
} from "../utils/stateCodes";

export interface AmazonCSVRow {
  [key: string]: string | undefined;
}

export interface Transaction {
  shipState: GSTStateCode;
  taxableValue: Decimal;
  taxAmount: Decimal;
  taxRate: Decimal;
  supplyType: SupplyType;
}

export interface NormalizedTransaction extends Transaction {
  pos: GSTStateCode;
}

export interface ParseAmazonCSVOptions {
  sellerState?: GSTStateCode;
}

const AMAZON_HEADERS = {
  transactionType: "Transaction Type",
  shipToState: "Ship To State",
  taxableValue: "Tax Exclusive Gross",
  totalTaxAmount: "Total Tax Amount",
  igstRate: "Igst Rate",
  cgstRate: "Cgst Rate",
  sgstRate: "Sgst Rate",
  utgstRate: "Utgst Rate"
} as const;

function cleanHeader(value: string): string {
  return value.replace(/["']/g, "").trim();
}

function parseRows(csvText: string): AmazonCSVRow[] {
  const parsed = Papa.parse<AmazonCSVRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: cleanHeader
  });

  if (parsed.errors.length > 0) {
    const firstError = parsed.errors[0];
    throw new Error(
      `CSV parse failed at row ${firstError.row ?? "unknown"}: ${firstError.message}`
    );
  }

  return parsed.data;
}

function getRowValue(row: AmazonCSVRow, ...keys: string[]): string {
  for (const key of keys) {
    if (row[key] !== undefined) {
      return (row[key] ?? "").trim();
    }
  }

  return "";
}

function toDecimal(value: string | undefined): Decimal {
  const normalized = (value ?? "").replace(/,/g, "").trim();
  return normalized === "" ? new Decimal(0) : new Decimal(normalized);
}

function formatDate(value: string): string {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    throw new Error(`Unsupported Amazon date: ${value}`);
  }

  const [, year, month, day] = match;
  return `${day}-${month}-${year}`;
}

function getAmazonDocumentCategory(row: AmazonCSVRow): DocumentCategory | null {
  const transactionType = getRowValue(row, AMAZON_HEADERS.transactionType).toLowerCase();
  if (transactionType === "shipment" || transactionType === "freereplacement") {
    return "invoice";
  }

  if (transactionType === "refund") {
    return "credit_note";
  }

  return null;
}

function getAmazonDocumentNumber(row: AmazonCSVRow): string {
  const documentCategory = getAmazonDocumentCategory(row);
  if (documentCategory === "credit_note") {
    return getRowValue(row, "Credit Note No");
  }

  return getRowValue(row, "Invoice Number");
}

function getAmazonQuantity(row: AmazonCSVRow): Decimal {
  return toDecimal(getRowValue(row, "Quantity"));
}

function getAmazonHsn(row: AmazonCSVRow): string {
  return getRowValue(row, "Hsn/sac");
}

function getAmazonRate(row: AmazonCSVRow): Decimal {
  return toDecimal(getRowValue(row, AMAZON_HEADERS.igstRate))
    .plus(toDecimal(getRowValue(row, AMAZON_HEADERS.cgstRate)))
    .plus(toDecimal(getRowValue(row, AMAZON_HEADERS.sgstRate)))
    .plus(toDecimal(getRowValue(row, AMAZON_HEADERS.utgstRate)))
    .mul(100);
}

function getAmazonTaxComponents(
  row: AmazonCSVRow,
  supplyType: SupplyType
): {
  igst: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  cess: Decimal;
} {
  const taxAmount = toDecimal(getRowValue(row, AMAZON_HEADERS.totalTaxAmount));
  if (supplyType === "INTER") {
    return {
      igst: taxAmount,
      cgst: new Decimal(0),
      sgst: new Decimal(0),
      cess: new Decimal(0)
    };
  }

  const halfTax = taxAmount.div(2);
  return {
    igst: new Decimal(0),
    cgst: halfTax,
    sgst: halfTax,
    cess: new Decimal(0)
  };
}

function buildAmazonDocumentIssue(row: AmazonCSVRow): DocumentIssueRecord | null {
  const category = getAmazonDocumentCategory(row);
  if (!category) {
    return null;
  }

  const number = getAmazonDocumentNumber(row);
  if (!number) {
    return null;
  }

  return {
    category,
    number
  };
}

function buildAmazonSupplyRecord(
  row: AmazonCSVRow,
  section: "b2b" | "b2cs",
  sellerState: GSTStateCode
): NormalizedSupplyRecord | null {
  const transactionType = getRowValue(row, AMAZON_HEADERS.transactionType).toLowerCase();
  if (!["shipment", "refund"].includes(transactionType)) {
    return null;
  }

  const documentCategory = getAmazonDocumentCategory(row);
  const documentNumber = getAmazonDocumentNumber(row);
  const documentDate = formatDate(getRowValue(row, "Invoice Date"));
  const posSource =
    section === "b2b"
      ? getRowValue(row, "Bill To State", "Ship To State")
      : getRowValue(row, "Ship To State", "Bill To State");
  const pos = toGSTStateCode(posSource);
  const supplyType = getSupplyType(pos, sellerState);
  const rate = getAmazonRate(row);
  const taxableValue = toDecimal(getRowValue(row, AMAZON_HEADERS.taxableValue));
  const invoiceValue = toDecimal(getRowValue(row, "Invoice Amount"));
  const tax = getAmazonTaxComponents(row, supplyType);
  const hsn = getAmazonHsn(row);
  const rawQuantity = getAmazonQuantity(row);
  const quantity = taxableValue.lessThan(0) ? rawQuantity.negated() : rawQuantity;

  if (!documentCategory || !documentNumber || !hsn || rate.lt(0)) {
    return null;
  }

  return {
    marketplace: "amazon",
    section,
    documentCategory,
    documentNumber,
    documentDate,
    pos,
    supplyType,
    rate,
    taxableValue,
    igst: tax.igst,
    cgst: tax.cgst,
    sgst: tax.sgst,
    cess: tax.cess,
    invoiceValue,
    quantity,
    hsn,
    ecoGstin: "07AAICA3918J1CV",
    ecoName: "amazon",
    ctin:
      section === "b2b"
        ? getRowValue(row, "Customer Bill To Gstid", "Customer Ship To Gstid")
        : undefined,
    receiverName: section === "b2b" ? getRowValue(row, "Buyer Name") : undefined
  };
}

function toTaxRate(row: AmazonCSVRow): Decimal {
  return toDecimal(getRowValue(row, AMAZON_HEADERS.igstRate))
    .plus(toDecimal(getRowValue(row, AMAZON_HEADERS.cgstRate)))
    .plus(toDecimal(getRowValue(row, AMAZON_HEADERS.sgstRate)))
    .plus(toDecimal(getRowValue(row, AMAZON_HEADERS.utgstRate)))
    .mul(100);
}

function isShipmentRow(row: AmazonCSVRow): boolean {
  return getRowValue(row, AMAZON_HEADERS.transactionType).toLowerCase() === "shipment";
}

export function normalizeRow(
  row: AmazonCSVRow,
  sellerState: GSTStateCode = DEFAULT_SELLER_STATE
): NormalizedTransaction | null {
  if (!isShipmentRow(row)) {
    return null;
  }

  const pos = toGSTStateCode(getRowValue(row, AMAZON_HEADERS.shipToState, "ship state"));
  const taxableValue = toDecimal(getRowValue(row, AMAZON_HEADERS.taxableValue, "taxable value"));
  const taxAmount = toDecimal(getRowValue(row, AMAZON_HEADERS.totalTaxAmount, "tax amount"));
  const taxRate = toTaxRate(row);

  if (taxableValue.lte(0) || taxAmount.lt(0) || taxRate.lt(0)) {
    return null;
  }

  return {
    pos,
    shipState: pos,
    taxableValue,
    taxAmount,
    taxRate,
    supplyType: getSupplyType(pos, sellerState)
  };
}

export function parseAmazonCSV(
  filePath: string,
  options: ParseAmazonCSVOptions = {}
): Transaction[] {
  return parseAmazonCSVContent(fs.readFileSync(filePath), options);
}

export function parseAmazonCSVContent(
  content: Buffer | string,
  options: ParseAmazonCSVOptions = {}
): Transaction[] {
  const sellerState = options.sellerState ?? DEFAULT_SELLER_STATE;
  const csvText = typeof content === "string" ? content : content.toString("utf8");

  return parseRows(csvText)
    .map((row) => normalizeRow(row, sellerState))
    .filter((row): row is NormalizedTransaction => row !== null)
    .map(({ pos: _pos, ...transaction }) => transaction);
}

export function parseAmazonB2BContent(
  content: Buffer | string,
  options: ParseAmazonCSVOptions = {}
): SourceExtraction {
  const sellerState = options.sellerState ?? DEFAULT_SELLER_STATE;
  const csvText = typeof content === "string" ? content : content.toString("utf8");
  const rows = parseRows(csvText);

  const records = rows
    .map((row) => {
      const gstin = getRowValue(row, "Customer Bill To Gstid", "Customer Ship To Gstid");
      if (!gstin) {
        return null;
      }

      return buildAmazonSupplyRecord(row, "b2b", sellerState);
    })
    .filter((row): row is NormalizedSupplyRecord => row !== null);

  const documentIssues = rows
    .map((row) => {
      const category = getAmazonDocumentCategory(row);
      const gstin = getRowValue(row, "Customer Bill To Gstid", "Customer Ship To Gstid");
      if (!category || category !== "invoice" || !gstin) {
        return null;
      }

      return buildAmazonDocumentIssue(row);
    })
    .filter((row): row is DocumentIssueRecord => row !== null);

  return {
    records,
    documentIssues
  };
}

export function parseAmazonB2CContent(
  content: Buffer | string,
  options: ParseAmazonCSVOptions = {}
): SourceExtraction {
  const sellerState = options.sellerState ?? DEFAULT_SELLER_STATE;
  const csvText = typeof content === "string" ? content : content.toString("utf8");
  const rows = parseRows(csvText);

  const records = rows
    .map((row) => {
      const gstin = getRowValue(row, "Customer Bill To Gstid", "Customer Ship To Gstid");
      if (gstin) {
        return null;
      }

      return buildAmazonSupplyRecord(row, "b2cs", sellerState);
    })
    .filter((row): row is NormalizedSupplyRecord => row !== null);

  const documentIssues = rows
    .map((row) => {
      const category = getAmazonDocumentCategory(row);
      const gstin = getRowValue(row, "Customer Bill To Gstid", "Customer Ship To Gstid");
      if (!category || gstin || category === "invoice" && getRowValue(row, AMAZON_HEADERS.transactionType).toLowerCase() === "cancel") {
        return null;
      }

      if (getRowValue(row, AMAZON_HEADERS.transactionType).toLowerCase() === "cancel") {
        return null;
      }

      return buildAmazonDocumentIssue(row);
    })
    .filter((row): row is DocumentIssueRecord => row !== null);

  return {
    records,
    documentIssues
  };
}
