"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SELLER_STATE = void 0;
exports.toGSTStateCode = toGSTStateCode;
exports.getSupplyType = getSupplyType;
exports.DEFAULT_SELLER_STATE = "07";
const STATE_CODE_MAP = {
    "01": "01",
    "JAMMUANDKASHMIR": "01",
    "JAMMUKASHMIR": "01",
    "JAMMU&KASHMIR": "01",
    "JAMMU AND KASHMIR": "01",
    "JAMMU & KASHMIR": "01",
    "02": "02",
    "HIMACHALPRADESH": "02",
    "HIMACHAL PRADESH": "02",
    "03": "03",
    "PUNJAB": "03",
    "04": "04",
    "CHANDIGARH": "04",
    "05": "05",
    "UTTARAKHAND": "05",
    "UTTARANCHAL": "05",
    "06": "06",
    "HARYANA": "06",
    "07": "07",
    "DELHI": "07",
    "NEWDELHI": "07",
    "NEW DELHI": "07",
    "08": "08",
    "RAJASTHAN": "08",
    "09": "09",
    "UTTARPRADESH": "09",
    "UTTAR PRADESH": "09",
    "10": "10",
    "BIHAR": "10",
    "11": "11",
    "SIKKIM": "11",
    "12": "12",
    "ARUNACHALPRADESH": "12",
    "ARUNACHAL PRADESH": "12",
    "13": "13",
    "NAGALAND": "13",
    "14": "14",
    "MANIPUR": "14",
    "15": "15",
    "MIZORAM": "15",
    "16": "16",
    "TRIPURA": "16",
    "17": "17",
    "MEGHALAYA": "17",
    "18": "18",
    "ASSAM": "18",
    "19": "19",
    "WESTBENGAL": "19",
    "WEST BENGAL": "19",
    "20": "20",
    "JHARKHAND": "20",
    "21": "21",
    "ODISHA": "21",
    "ORISSA": "21",
    "22": "22",
    "CHHATTISGARH": "22",
    "23": "23",
    "MADHYAPRADESH": "23",
    "MADHYA PRADESH": "23",
    "24": "24",
    "GUJARAT": "24",
    "26": "26",
    "DADRAANDNAGARHAVELIANDDAMANANDDIU": "26",
    "DADRA AND NAGAR HAVELI AND DAMAN AND DIU": "26",
    "DADRA&NAGARHAVELIANDDAMAN&DIU": "26",
    "27": "27",
    "MAHARASHTRA": "27",
    "29": "29",
    "KARNATAKA": "29",
    "30": "30",
    "GOA": "30",
    "31": "31",
    "LAKSHADWEEP": "31",
    "32": "32",
    "KERALA": "32",
    "33": "33",
    "TAMILNADU": "33",
    "TAMIL NADU": "33",
    "34": "34",
    "PUDUCHERRY": "34",
    "PONDICHERRY": "34",
    "35": "35",
    "ANDAMANANDNICOBARISLANDS": "35",
    "ANDAMAN AND NICOBAR ISLANDS": "35",
    "36": "36",
    "TELANGANA": "36",
    "37": "37",
    "ANDHRAPRADESH": "37",
    "ANDHRA PRADESH": "37",
    "38": "38",
    "LADAKH": "38",
    "97": "97",
    "OTHER TERRITORY": "97",
    "OTHERTERRITORY": "97"
};
function normalizeLookupKey(value) {
    return value.replace(/[^A-Z0-9& ]/g, "").replace(/\s+/g, " ").trim();
}
function toGSTStateCode(state) {
    const raw = state.trim();
    if (!raw) {
        throw new Error("Missing ship state");
    }
    if (/^\d{1,2}$/.test(raw)) {
        return raw.padStart(2, "0");
    }
    const mapped = STATE_CODE_MAP[normalizeLookupKey(raw).toUpperCase()];
    if (!mapped) {
        throw new Error(`Unsupported ship state: ${state}`);
    }
    return mapped;
}
function getSupplyType(buyerState, sellerState) {
    return buyerState === sellerState ? "INTRA" : "INTER";
}
