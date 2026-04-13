import fs from "node:fs";
import Papa from "papaparse";
import Decimal from "decimal.js";
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
