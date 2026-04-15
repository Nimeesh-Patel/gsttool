"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRow = normalizeRow;
exports.parseAmazonCSV = parseAmazonCSV;
exports.parseAmazonCSVContent = parseAmazonCSVContent;
const node_fs_1 = __importDefault(require("node:fs"));
const papaparse_1 = __importDefault(require("papaparse"));
const decimal_js_1 = __importDefault(require("decimal.js"));
const stateCodes_1 = require("../utils/stateCodes");
const AMAZON_HEADERS = {
    transactionType: "Transaction Type",
    shipToState: "Ship To State",
    taxableValue: "Tax Exclusive Gross",
    totalTaxAmount: "Total Tax Amount",
    igstRate: "Igst Rate",
    cgstRate: "Cgst Rate",
    sgstRate: "Sgst Rate",
    utgstRate: "Utgst Rate"
};
function cleanHeader(value) {
    return value.replace(/["']/g, "").trim();
}
function parseRows(csvText) {
    const parsed = papaparse_1.default.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: cleanHeader
    });
    if (parsed.errors.length > 0) {
        const firstError = parsed.errors[0];
        throw new Error(`CSV parse failed at row ${firstError.row ?? "unknown"}: ${firstError.message}`);
    }
    return parsed.data;
}
function getRowValue(row, ...keys) {
    for (const key of keys) {
        if (row[key] !== undefined) {
            return (row[key] ?? "").trim();
        }
    }
    return "";
}
function toDecimal(value) {
    const normalized = (value ?? "").replace(/,/g, "").trim();
    return normalized === "" ? new decimal_js_1.default(0) : new decimal_js_1.default(normalized);
}
function toTaxRate(row) {
    return toDecimal(getRowValue(row, AMAZON_HEADERS.igstRate))
        .plus(toDecimal(getRowValue(row, AMAZON_HEADERS.cgstRate)))
        .plus(toDecimal(getRowValue(row, AMAZON_HEADERS.sgstRate)))
        .plus(toDecimal(getRowValue(row, AMAZON_HEADERS.utgstRate)))
        .mul(100);
}
function isShipmentRow(row) {
    return getRowValue(row, AMAZON_HEADERS.transactionType).toLowerCase() === "shipment";
}
function normalizeRow(row, sellerState = stateCodes_1.DEFAULT_SELLER_STATE) {
    if (!isShipmentRow(row)) {
        return null;
    }
    const pos = (0, stateCodes_1.toGSTStateCode)(getRowValue(row, AMAZON_HEADERS.shipToState, "ship state"));
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
        supplyType: (0, stateCodes_1.getSupplyType)(pos, sellerState)
    };
}
function parseAmazonCSV(filePath, options = {}) {
    return parseAmazonCSVContent(node_fs_1.default.readFileSync(filePath), options);
}
function parseAmazonCSVContent(content, options = {}) {
    const sellerState = options.sellerState ?? stateCodes_1.DEFAULT_SELLER_STATE;
    const csvText = typeof content === "string" ? content : content.toString("utf8");
    return parseRows(csvText)
        .map((row) => normalizeRow(row, sellerState))
        .filter((row) => row !== null)
        .map(({ pos: _pos, ...transaction }) => transaction);
}
