"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMonthly = runMonthly;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const gstr1_1 = require("./gst/gstr1");
const amazon_1 = require("./parsers/amazon");
const flipkart_1 = require("./parsers/flipkart");
const stateCodes_1 = require("./utils/stateCodes");
__exportStar(require("./gst/gstr1"), exports);
__exportStar(require("./gst/types"), exports);
__exportStar(require("./parsers/amazon"), exports);
__exportStar(require("./parsers/flipkart"), exports);
__exportStar(require("./utils/stateCodes"), exports);
const DEFAULT_GSTIN = "07ABGFR8042N1ZO";
const DEFAULT_OUTPUT_FILE = "gstr1-returns.json";
function readArg(flag) {
    const index = process.argv.indexOf(flag);
    return index >= 0 ? process.argv[index + 1] : undefined;
}
function requireArg(flag) {
    const value = readArg(flag);
    if (!value) {
        throw new Error(`Missing required argument ${flag}`);
    }
    return value;
}
function getCLIOptions() {
    return {
        amazonB2B: node_path_1.default.resolve(process.cwd(), requireArg("--amazon-b2b")),
        amazonB2C: node_path_1.default.resolve(process.cwd(), requireArg("--amazon-b2c")),
        flipkart: node_path_1.default.resolve(process.cwd(), requireArg("--flipkart")),
        output: node_path_1.default.resolve(process.cwd(), readArg("--output") ?? DEFAULT_OUTPUT_FILE),
        gstin: readArg("--gstin") ?? DEFAULT_GSTIN,
        fp: readArg("--fp"),
        sellerState: readArg("--seller-state") ?? stateCodes_1.DEFAULT_SELLER_STATE
    };
}
function assertCLIOptions(options) {
    for (const input of [options.amazonB2B, options.amazonB2C, options.flipkart]) {
        if (!node_fs_1.default.existsSync(input)) {
            throw new Error(`Input file not found: ${input}`);
        }
    }
    if (options.fp !== undefined && !/^\d{6}$/.test(options.fp)) {
        throw new Error(`Invalid filing period "${options.fp}". Expected MMYYYY.`);
    }
    if (!/^\d{2}$/.test(options.sellerState)) {
        throw new Error(`Invalid seller state "${options.sellerState}". Expected 2-digit GST code.`);
    }
}
function runMonthly(options) {
    assertCLIOptions(options);
    const amazonB2B = (0, amazon_1.parseAmazonB2BContent)(node_fs_1.default.readFileSync(options.amazonB2B), {
        sellerState: options.sellerState
    });
    const amazonB2C = (0, amazon_1.parseAmazonB2CContent)(node_fs_1.default.readFileSync(options.amazonB2C), {
        sellerState: options.sellerState
    });
    const flipkart = (0, flipkart_1.parseFlipkartWorkbook)(node_fs_1.default.readFileSync(options.flipkart), {
        sellerState: options.sellerState
    });
    const records = [...amazonB2B.records, ...amazonB2C.records, ...flipkart.records];
    const documentIssues = [
        ...amazonB2B.documentIssues,
        ...amazonB2C.documentIssues,
        ...flipkart.documentIssues
    ];
    const fp = options.fp ?? (0, gstr1_1.deriveFp)(records);
    if (!fp) {
        throw new Error("Could not determine filing period from data. Provide --fp explicitly.");
    }
    const payload = (0, gstr1_1.buildMonthlyGSTR1)(records, documentIssues, {
        gstin: options.gstin,
        fp
    });
    node_fs_1.default.writeFileSync(options.output, JSON.stringify(payload, null, 2), "utf8");
    console.log(`Generated GST JSON at ${options.output}`);
}
if (require.main === module) {
    runMonthly(getCLIOptions());
}
