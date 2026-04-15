"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAmazonB2BContent = parseAmazonB2BContent;
exports.parseAmazonB2CContent = parseAmazonB2CContent;
const papaparse_1 = __importDefault(require("papaparse"));
const decimal_js_1 = __importDefault(require("decimal.js"));
const stateCodes_1 = require("../utils/stateCodes");
const AMAZON_HEADERS = {
    transactionType: "Transaction Type",
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
function formatDate(value) {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
        throw new Error(`Unsupported Amazon date: ${value}`);
    }
    const [, year, month, day] = match;
    return `${day}-${month}-${year}`;
}
function getAmazonDocumentCategory(row) {
    const transactionType = getRowValue(row, AMAZON_HEADERS.transactionType).toLowerCase();
    if (transactionType === "shipment" || transactionType === "freereplacement") {
        return "invoice";
    }
    if (transactionType === "refund") {
        return "credit_note";
    }
    return null;
}
function getAmazonDocumentNumber(row) {
    const documentCategory = getAmazonDocumentCategory(row);
    if (documentCategory === "credit_note") {
        return getRowValue(row, "Credit Note No");
    }
    return getRowValue(row, "Invoice Number");
}
function getAmazonQuantity(row) {
    return toDecimal(getRowValue(row, "Quantity"));
}
function getAmazonHsn(row) {
    return getRowValue(row, "Hsn/sac");
}
function getAmazonRate(row) {
    return toDecimal(getRowValue(row, AMAZON_HEADERS.igstRate))
        .plus(toDecimal(getRowValue(row, AMAZON_HEADERS.cgstRate)))
        .plus(toDecimal(getRowValue(row, AMAZON_HEADERS.sgstRate)))
        .plus(toDecimal(getRowValue(row, AMAZON_HEADERS.utgstRate)))
        .mul(100);
}
function getAmazonTaxComponents(row, supplyType) {
    const taxAmount = toDecimal(getRowValue(row, AMAZON_HEADERS.totalTaxAmount));
    if (supplyType === "INTER") {
        return {
            igst: taxAmount,
            cgst: new decimal_js_1.default(0),
            sgst: new decimal_js_1.default(0),
            cess: new decimal_js_1.default(0)
        };
    }
    const halfTax = taxAmount.div(2);
    return {
        igst: new decimal_js_1.default(0),
        cgst: halfTax,
        sgst: halfTax,
        cess: new decimal_js_1.default(0)
    };
}
function buildAmazonDocumentIssue(row) {
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
function buildAmazonSupplyRecord(row, section, sellerState) {
    const transactionType = getRowValue(row, AMAZON_HEADERS.transactionType).toLowerCase();
    if (!["shipment", "refund"].includes(transactionType)) {
        return null;
    }
    const documentCategory = getAmazonDocumentCategory(row);
    const documentNumber = getAmazonDocumentNumber(row);
    const documentDate = formatDate(getRowValue(row, "Invoice Date"));
    const posSource = section === "b2b"
        ? getRowValue(row, "Bill To State", "Ship To State")
        : getRowValue(row, "Ship To State", "Bill To State");
    const pos = (0, stateCodes_1.toGSTStateCode)(posSource);
    const supplyType = (0, stateCodes_1.getSupplyType)(pos, sellerState);
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
        ctin: section === "b2b"
            ? getRowValue(row, "Customer Bill To Gstid", "Customer Ship To Gstid")
            : undefined,
        receiverName: section === "b2b" ? getRowValue(row, "Buyer Name") : undefined
    };
}
function parseAmazonB2BContent(content, options = {}) {
    const sellerState = options.sellerState ?? stateCodes_1.DEFAULT_SELLER_STATE;
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
        .filter((row) => row !== null);
    const documentIssues = rows
        .map((row) => {
        const category = getAmazonDocumentCategory(row);
        const gstin = getRowValue(row, "Customer Bill To Gstid", "Customer Ship To Gstid");
        if (!category || category !== "invoice" || !gstin) {
            return null;
        }
        return buildAmazonDocumentIssue(row);
    })
        .filter((row) => row !== null);
    return {
        records,
        documentIssues
    };
}
function parseAmazonB2CContent(content, options = {}) {
    const sellerState = options.sellerState ?? stateCodes_1.DEFAULT_SELLER_STATE;
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
        .filter((row) => row !== null);
    const documentIssues = rows
        .map((row) => {
        const category = getAmazonDocumentCategory(row);
        const gstin = getRowValue(row, "Customer Bill To Gstid", "Customer Ship To Gstid");
        if (!category || gstin) {
            return null;
        }
        return buildAmazonDocumentIssue(row);
    })
        .filter((row) => row !== null);
    return {
        records,
        documentIssues
    };
}
