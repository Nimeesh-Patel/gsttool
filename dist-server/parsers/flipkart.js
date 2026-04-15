"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFlipkartWorkbook = parseFlipkartWorkbook;
const decimal_js_1 = __importDefault(require("decimal.js"));
const xlsx_1 = require("./xlsx");
const stateCodes_1 = require("../utils/stateCodes");
const SALES_SHEET = "Sales Report";
const CASHBACK_SHEET = "Cash Back Report";
const FLIPKART_ECO_GSTIN = "07AACCF0683K1CU";
const FLIPKART_ECO_NAME = "flipkart";
const DOC_CATEGORY_BY_SERIES = {
    FAONVN: "invoice",
    LWAAKVG: "invoice",
    RAMDVE: "credit_note",
    MFAAJLK: "credit_note",
    CAIWCE: "credit_note",
    LYAAI50: "credit_note",
    DAKDNZ: "debit_note",
    LZAAQKD: "debit_note",
    D1OHR: "debit_note",
    LOAAL4T: "debit_note"
};
function toDecimal(value) {
    const normalized = value.replace(/,/g, "").trim();
    return normalized === "" || normalized === "NA" ? new decimal_js_1.default(0) : new decimal_js_1.default(normalized);
}
function getDocSeries(number) {
    if (number.includes("260")) {
        return number.split("260")[0];
    }
    const nonDigitPrefix = number.match(/^\D+/);
    return nonDigitPrefix ? nonDigitPrefix[0] : number;
}
function resolveDocCategory(number, fallback) {
    return DOC_CATEGORY_BY_SERIES[getDocSeries(number)] ?? fallback;
}
function formatDate(value) {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
        throw new Error(`Unsupported Flipkart date: ${value}`);
    }
    const [, year, month, day] = match;
    return `${day}-${month}-${year}`;
}
function getBusinessGstin(row) {
    const gstin = (row["Business GST Number"] ?? "").trim();
    if (!gstin || gstin === "NA") {
        return undefined;
    }
    return gstin;
}
function getRate(row) {
    return toDecimal(row["IGST Rate"] ?? "")
        .plus(toDecimal(row["CGST Rate"] ?? ""))
        .plus(toDecimal(row["SGST Rate (or UTGST as applicable)"] ?? ""));
}
function buildSalesDocumentIssue(row) {
    const number = (row["Buyer Invoice ID"] ?? "").trim();
    if (!number) {
        return null;
    }
    const taxableValue = toDecimal(row["Taxable Value (Final Invoice Amount -Taxes)"] ?? "");
    const fallbackCategory = (row["Event Type"] ?? "").trim() === "Sale"
        ? "invoice"
        : taxableValue.greaterThanOrEqualTo(0)
            ? "debit_note"
            : "credit_note";
    return {
        category: resolveDocCategory(number, fallbackCategory),
        number
    };
}
function buildCashbackDocumentIssue(row) {
    const number = (row["Credit Note ID/ Debit Note ID"] ?? "").trim();
    if (!number) {
        return null;
    }
    const fallbackCategory = (row["Document Type"] ?? "").trim() === "Debit Note" ? "debit_note" : "credit_note";
    return {
        category: resolveDocCategory(number, fallbackCategory),
        number
    };
}
function buildSalesRecord(row, sellerState) {
    const documentNumber = (row["Buyer Invoice ID"] ?? "").trim();
    if (!documentNumber) {
        return null;
    }
    const taxableValue = toDecimal(row["Taxable Value (Final Invoice Amount -Taxes)"] ?? "");
    const igst = toDecimal(row["IGST Amount"] ?? "");
    const cgst = toDecimal(row["CGST Amount"] ?? "");
    const sgst = toDecimal(row["SGST Amount (Or UTGST as applicable)"] ?? "");
    const quantity = toDecimal(row["Item Quantity"] ?? "");
    const hsn = (row["HSN Code"] ?? "").trim();
    const rate = getRate(row);
    const ctin = getBusinessGstin(row);
    const pos = (0, stateCodes_1.toGSTStateCode)((row["Customer's Delivery State"] ?? "").trim() ||
        (row["Customer's Billing State"] ?? "").trim());
    const eventType = (row["Event Type"] ?? "").trim();
    const fallbackCategory = eventType === "Sale" ? "invoice" : taxableValue.greaterThanOrEqualTo(0) ? "debit_note" : "credit_note";
    if (!hsn || rate.lessThan(0)) {
        return null;
    }
    return {
        marketplace: "flipkart",
        section: ctin ? "b2b" : "b2cs",
        documentCategory: resolveDocCategory(documentNumber, fallbackCategory),
        documentNumber,
        documentDate: formatDate(row["Buyer Invoice Date"] ?? ""),
        pos,
        supplyType: (0, stateCodes_1.getSupplyType)(pos, sellerState),
        rate,
        taxableValue,
        igst,
        cgst,
        sgst,
        cess: new decimal_js_1.default(0),
        invoiceValue: toDecimal(row["Buyer Invoice Amount "] ?? ""),
        quantity,
        hsn,
        ecoGstin: FLIPKART_ECO_GSTIN,
        ecoName: FLIPKART_ECO_NAME,
        ctin,
        receiverName: ctin ? (row["Business Name"] ?? "").trim() || undefined : undefined
    };
}
function buildCashbackRecord(row, sellerState, hsnByOrderItemId) {
    const documentNumber = (row["Credit Note ID/ Debit Note ID"] ?? "").trim();
    const orderItemId = (row["Order Item ID"] ?? "").trim();
    const hsn = hsnByOrderItemId.get(orderItemId) ?? "";
    if (!documentNumber || !hsn) {
        return null;
    }
    const taxableValue = toDecimal(row["Taxable Value"] ?? "");
    const igst = toDecimal(row["IGST Amount"] ?? "");
    const cgst = toDecimal(row["CGST Amount"] ?? "");
    const sgst = toDecimal(row["SGST Amount (Or UTGST as applicable)"] ?? "");
    const ctin = getBusinessGstin(row);
    const pos = (0, stateCodes_1.toGSTStateCode)((row["Customer's Delivery State"] ?? "").trim());
    const fallbackCategory = (row["Document Type"] ?? "").trim() === "Debit Note" ? "debit_note" : "credit_note";
    return {
        marketplace: "flipkart",
        section: ctin ? "b2b" : "b2cs",
        documentCategory: resolveDocCategory(documentNumber, fallbackCategory),
        documentNumber,
        documentDate: formatDate(row["Invoice Date"] ?? ""),
        pos,
        supplyType: (0, stateCodes_1.getSupplyType)(pos, sellerState),
        rate: getRate(row),
        taxableValue,
        igst,
        cgst,
        sgst,
        cess: new decimal_js_1.default(0),
        invoiceValue: toDecimal(row["Invoice Amount"] ?? ""),
        quantity: new decimal_js_1.default(0),
        hsn,
        ecoGstin: FLIPKART_ECO_GSTIN,
        ecoName: FLIPKART_ECO_NAME,
        ctin,
        receiverName: ctin ? (row["Business Name"] ?? "").trim() || undefined : undefined
    };
}
function parseFlipkartWorkbook(content, options = {}) {
    const sellerState = options.sellerState ?? stateCodes_1.DEFAULT_SELLER_STATE;
    const salesRows = (0, xlsx_1.readXlsxObjects)(content, SALES_SHEET);
    const cashbackRows = (0, xlsx_1.readXlsxObjects)(content, CASHBACK_SHEET);
    const hsnByOrderItemId = new Map();
    for (const row of salesRows) {
        const orderItemId = (row["Order Item ID"] ?? "").trim();
        const hsn = (row["HSN Code"] ?? "").trim();
        if (orderItemId && hsn && !hsnByOrderItemId.has(orderItemId)) {
            hsnByOrderItemId.set(orderItemId, hsn);
        }
    }
    const records = [
        ...salesRows
            .map((row) => buildSalesRecord(row, sellerState))
            .filter((row) => row !== null),
        ...cashbackRows
            .map((row) => buildCashbackRecord(row, sellerState, hsnByOrderItemId))
            .filter((row) => row !== null)
    ];
    const documentIssues = [
        ...salesRows
            .map((row) => buildSalesDocumentIssue(row))
            .filter((row) => row !== null),
        ...cashbackRows
            .map((row) => buildCashbackDocumentIssue(row))
            .filter((row) => row !== null)
    ];
    return {
        records,
        documentIssues
    };
}
