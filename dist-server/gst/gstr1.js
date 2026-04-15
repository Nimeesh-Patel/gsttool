"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregateB2CS = aggregateB2CS;
exports.aggregateB2B = aggregateB2B;
exports.aggregateHSN = aggregateHSN;
exports.aggregateSupeco = aggregateSupeco;
exports.aggregateDocumentIssues = aggregateDocumentIssues;
exports.buildMonthlyGSTR1 = buildMonthlyGSTR1;
const decimal_js_1 = __importDefault(require("decimal.js"));
const stateCodes_1 = require("../utils/stateCodes");
const GST_VERSION = "GST3.1.6";
const GST_HASH = "hash";
const DOC_FAMILY_ORDER = [
    {
        category: "invoice",
        family: "amazon_invoice",
        doc_num: 1,
        doc_typ: "Invoices for outward supply"
    },
    {
        category: "invoice",
        family: "flipkart_invoice",
        doc_num: 1,
        doc_typ: "Invoices for outward supply"
    },
    {
        category: "credit_note",
        family: "amazon_credit",
        doc_num: 5,
        doc_typ: "Credit Note"
    },
    {
        category: "credit_note",
        family: "flipkart_credit_sales",
        doc_num: 5,
        doc_typ: "Credit Note"
    },
    {
        category: "credit_note",
        family: "flipkart_credit_cashback",
        doc_num: 5,
        doc_typ: "Credit Note"
    },
    {
        category: "debit_note",
        family: "flipkart_debit_cashback",
        doc_num: 4,
        doc_typ: "Debit Note"
    },
    {
        category: "debit_note",
        family: "flipkart_debit_sales",
        doc_num: 4,
        doc_typ: "Debit Note"
    }
];
function round2(value) {
    return value.toDecimalPlaces(2, decimal_js_1.default.ROUND_HALF_UP).toNumber();
}
function itemNumber(rate) {
    return Math.round(rate * 100) + 1;
}
function toDocFamily(number, category) {
    if (number.startsWith("IN-")) {
        return "amazon_invoice";
    }
    if (number.startsWith("CN-")) {
        return "amazon_credit";
    }
    if (["FAONVN", "LWAAKVG"].some((prefix) => number.startsWith(prefix))) {
        return "flipkart_invoice";
    }
    if (["RAMDVE", "MFAAJLK"].some((prefix) => number.startsWith(prefix))) {
        return "flipkart_credit_sales";
    }
    if (["CAIWCE", "LYAAI50"].some((prefix) => number.startsWith(prefix))) {
        return "flipkart_credit_cashback";
    }
    if (["DAKDNZ", "LZAAQKD"].some((prefix) => number.startsWith(prefix))) {
        return "flipkart_debit_cashback";
    }
    if (["D1OHR", "LOAAL4T"].some((prefix) => number.startsWith(prefix))) {
        return "flipkart_debit_sales";
    }
    return `${category}_${number}`;
}
function aggregateB2CS(records) {
    const grouped = new Map();
    for (const record of records.filter((item) => item.section === "b2cs")) {
        const rt = round2(record.rate);
        const key = `${record.pos}|${rt}|${record.supplyType}`;
        const current = grouped.get(key);
        if (current) {
            current.txval = current.txval.plus(record.taxableValue);
            current.iamt = current.iamt.plus(record.igst);
            current.camt = current.camt.plus(record.cgst);
            current.samt = current.samt.plus(record.sgst);
            continue;
        }
        grouped.set(key, {
            pos: record.pos,
            rt,
            sply_ty: record.supplyType,
            txval: new decimal_js_1.default(record.taxableValue),
            iamt: new decimal_js_1.default(record.igst),
            camt: new decimal_js_1.default(record.cgst),
            samt: new decimal_js_1.default(record.sgst)
        });
    }
    return Array.from(grouped.values())
        .map((entry) => ({
        sply_ty: entry.sply_ty,
        rt: entry.rt,
        typ: "OE",
        pos: entry.pos,
        txval: round2(entry.txval),
        iamt: entry.sply_ty === "INTER" ? round2(entry.iamt) : undefined,
        camt: entry.sply_ty === "INTRA" ? round2(entry.camt) : undefined,
        samt: entry.sply_ty === "INTRA" ? round2(entry.samt) : undefined,
        csamt: 0
    }))
        .sort((left, right) => {
        const stateCompare = (0, stateCodes_1.getStateNameFromCode)(left.pos).localeCompare((0, stateCodes_1.getStateNameFromCode)(right.pos));
        if (stateCompare !== 0) {
            return stateCompare;
        }
        if (left.rt !== right.rt) {
            return left.rt - right.rt;
        }
        return left.sply_ty.localeCompare(right.sply_ty);
    });
}
function aggregateB2B(records) {
    const recipientMap = new Map();
    for (const record of records.filter((item) => item.section === "b2b" && item.documentCategory === "invoice" && item.ctin)) {
        const invoicesByRecipient = recipientMap.get(record.ctin) ?? new Map();
        const items = invoicesByRecipient.get(record.documentNumber) ?? [];
        items.push(record);
        invoicesByRecipient.set(record.documentNumber, items);
        recipientMap.set(record.ctin, invoicesByRecipient);
    }
    return Array.from(recipientMap.entries()).map(([ctin, invoicesByRecipient]) => {
        const inv = Array.from(invoicesByRecipient.values()).map((items) => {
            const first = items[0];
            const groupedByRate = new Map();
            for (const item of items) {
                const key = item.rate.toString();
                const current = groupedByRate.get(key) ?? [];
                current.push(item);
                groupedByRate.set(key, current);
            }
            return {
                inum: first.documentNumber,
                idt: first.documentDate,
                val: round2(items.reduce((sum, item) => sum.plus(item.invoiceValue), new decimal_js_1.default(0))),
                pos: first.pos,
                rchrg: "N",
                inv_typ: "R",
                itms: Array.from(groupedByRate.entries()).map(([rateKey, rateItems]) => {
                    const rate = round2(new decimal_js_1.default(rateKey));
                    const camt = round2(rateItems.reduce((sum, item) => sum.plus(item.cgst), new decimal_js_1.default(0)));
                    const samt = round2(rateItems.reduce((sum, item) => sum.plus(item.sgst), new decimal_js_1.default(0)));
                    return {
                        num: itemNumber(rate),
                        itm_det: {
                            txval: round2(rateItems.reduce((sum, item) => sum.plus(item.taxableValue), new decimal_js_1.default(0))),
                            rt: rate,
                            iamt: round2(rateItems.reduce((sum, item) => sum.plus(item.igst), new decimal_js_1.default(0))),
                            camt: camt !== 0 ? camt : undefined,
                            samt: samt !== 0 ? samt : undefined,
                            csamt: 0
                        }
                    };
                })
            };
        });
        return {
            ctin,
            inv
        };
    });
}
function aggregateHSN(records) {
    const group = (section) => {
        const grouped = new Map();
        for (const record of records.filter((item) => item.section === section)) {
            const rate = round2(record.rate);
            const key = `${record.hsn}|${rate}`;
            const current = grouped.get(key);
            if (current) {
                current.qty = current.qty.plus(record.quantity);
                current.txval = current.txval.plus(record.taxableValue);
                current.iamt = current.iamt.plus(record.igst);
                current.camt = current.camt.plus(record.cgst);
                current.samt = current.samt.plus(record.sgst);
                continue;
            }
            grouped.set(key, {
                hsn: record.hsn,
                rate,
                qty: new decimal_js_1.default(record.quantity),
                txval: new decimal_js_1.default(record.taxableValue),
                iamt: new decimal_js_1.default(record.igst),
                camt: new decimal_js_1.default(record.cgst),
                samt: new decimal_js_1.default(record.sgst)
            });
        }
        return Array.from(grouped.values()).map((entry, index) => ({
            num: index + 1,
            hsn_sc: entry.hsn,
            uqc: "PCS",
            qty: round2(entry.qty),
            rt: entry.rate,
            txval: round2(entry.txval),
            iamt: round2(entry.iamt),
            samt: round2(entry.samt),
            camt: round2(entry.camt),
            csamt: 0
        }));
    };
    return {
        hsn_b2b: group("b2b"),
        hsn_b2c: group("b2cs")
    };
}
function aggregateSupeco(records) {
    const grouped = new Map();
    for (const record of records) {
        const key = record.ecoGstin;
        const current = grouped.get(key);
        if (current) {
            current.suppval = current.suppval.plus(record.taxableValue);
            current.igst = current.igst.plus(record.igst);
            current.cgst = current.cgst.plus(record.cgst);
            current.sgst = current.sgst.plus(record.sgst);
            current.cess = current.cess.plus(record.cess);
            continue;
        }
        grouped.set(key, {
            etin: record.ecoGstin,
            ecoName: record.ecoName,
            suppval: new decimal_js_1.default(record.taxableValue),
            igst: new decimal_js_1.default(record.igst),
            cgst: new decimal_js_1.default(record.cgst),
            sgst: new decimal_js_1.default(record.sgst),
            cess: new decimal_js_1.default(record.cess)
        });
    }
    return {
        clttx: Array.from(grouped.values())
            .sort((left, right) => left.ecoName.localeCompare(right.ecoName))
            .map((entry) => ({
            etin: entry.etin,
            suppval: round2(entry.suppval),
            igst: round2(entry.igst),
            cgst: round2(entry.cgst),
            sgst: round2(entry.sgst),
            cess: round2(entry.cess),
            flag: "N"
        }))
    };
}
function aggregateDocumentIssues(issues) {
    const grouped = new Map();
    for (const issue of issues) {
        const family = toDocFamily(issue.number, issue.category);
        const key = `${issue.category}|${family}`;
        const current = grouped.get(key);
        if (current) {
            current.numbers.push(issue.number);
            continue;
        }
        grouped.set(key, {
            category: issue.category,
            family,
            numbers: [issue.number]
        });
    }
    const groups = new Map();
    for (const config of DOC_FAMILY_ORDER) {
        const entry = grouped.get(`${config.category}|${config.family}`);
        if (!entry) {
            continue;
        }
        const sortedNumbers = [...entry.numbers].sort((left, right) => left.localeCompare(right));
        const summary = {
            num: (groups.get(String(config.doc_num))?.docs.length ?? 0) + 1,
            from: sortedNumbers[0],
            to: sortedNumbers[sortedNumbers.length - 1],
            totnum: sortedNumbers.length,
            cancel: 0,
            net_issue: sortedNumbers.length
        };
        const bucketKey = String(config.doc_num);
        const bucket = groups.get(bucketKey);
        if (bucket) {
            bucket.docs.push(summary);
            continue;
        }
        groups.set(bucketKey, {
            doc_num: config.doc_num,
            doc_typ: config.doc_typ,
            docs: [summary]
        });
    }
    return {
        doc_det: Array.from(groups.values())
    };
}
function buildMonthlyGSTR1(records, issues, options) {
    return {
        gstin: options.gstin,
        fp: options.fp,
        version: GST_VERSION,
        hash: GST_HASH,
        b2b: aggregateB2B(records),
        b2cs: aggregateB2CS(records),
        hsn: aggregateHSN(records),
        supeco: aggregateSupeco(records),
        doc_issue: aggregateDocumentIssues(issues)
    };
}
