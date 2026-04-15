"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregateB2CS = aggregateB2CS;
exports.buildGSTR1 = buildGSTR1;
const decimal_js_1 = __importDefault(require("decimal.js"));
const stateCodes_1 = require("../utils/stateCodes");
function round2(value) {
    return value.toDecimalPlaces(2, decimal_js_1.default.ROUND_HALF_UP).toNumber();
}
function aggregateB2CS(transactions, options = {}) {
    const sellerState = options.sellerState ?? stateCodes_1.DEFAULT_SELLER_STATE;
    const grouped = new Map();
    for (const transaction of transactions) {
        const pos = (0, stateCodes_1.toGSTStateCode)(transaction.shipState);
        const rt = round2(transaction.taxRate);
        const sply_ty = transaction.supplyType ?? (0, stateCodes_1.getSupplyType)(pos, sellerState);
        const key = `${pos}|${rt}|${sply_ty}`;
        const current = grouped.get(key);
        if (current) {
            current.txval = current.txval.plus(transaction.taxableValue);
            current.taxAmount = current.taxAmount.plus(transaction.taxAmount);
            continue;
        }
        grouped.set(key, {
            pos,
            sply_ty,
            rt,
            txval: new decimal_js_1.default(transaction.taxableValue),
            taxAmount: new decimal_js_1.default(transaction.taxAmount)
        });
    }
    return Array.from(grouped.values())
        .map((item) => {
        const row = {
            sply_ty: item.sply_ty,
            rt: item.rt,
            typ: "OE",
            pos: item.pos,
            txval: round2(item.txval),
            csamt: 0
        };
        if (item.sply_ty === "INTER") {
            row.iamt = round2(item.taxAmount);
        }
        else {
            const halfTax = item.taxAmount.div(2);
            row.camt = round2(halfTax);
            row.samt = round2(halfTax);
        }
        return row;
    })
        .sort((left, right) => {
        if (left.pos !== right.pos) {
            return left.pos.localeCompare(right.pos);
        }
        if (left.rt !== right.rt) {
            return left.rt - right.rt;
        }
        return left.sply_ty.localeCompare(right.sply_ty);
    });
}
function buildGSTR1(b2cs, options) {
    return {
        gstin: options.gstin,
        fp: options.fp,
        b2cs
    };
}
