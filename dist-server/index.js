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
exports.run = run;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const b2cs_1 = require("./gst/b2cs");
const amazon_1 = require("./parsers/amazon");
const stateCodes_1 = require("./utils/stateCodes");
__exportStar(require("./gst/b2cs"), exports);
__exportStar(require("./parsers/amazon"), exports);
__exportStar(require("./utils/stateCodes"), exports);
const DEFAULT_GSTIN = "07ABGFR8042N1ZO";
const DEFAULT_FP = "022026";
const DEFAULT_INPUT_FILE = "MTR_B2C-FEBRUARY-2026-A2G23RCK8NBZ6R.csv";
const DEFAULT_OUTPUT_FILE = "gstr1-b2cs.json";
function readArg(flag) {
    const index = process.argv.indexOf(flag);
    return index >= 0 ? process.argv[index + 1] : undefined;
}
function getCLIOptions() {
    return {
        input: node_path_1.default.resolve(process.cwd(), readArg("--input") ?? DEFAULT_INPUT_FILE),
        output: node_path_1.default.resolve(process.cwd(), readArg("--output") ?? DEFAULT_OUTPUT_FILE),
        gstin: readArg("--gstin") ?? DEFAULT_GSTIN,
        fp: readArg("--fp") ?? DEFAULT_FP,
        sellerState: readArg("--seller-state") ?? stateCodes_1.DEFAULT_SELLER_STATE
    };
}
function assertCLIOptions(options) {
    if (!node_fs_1.default.existsSync(options.input)) {
        throw new Error(`Input file not found: ${options.input}`);
    }
    if (!/^\d{6}$/.test(options.fp)) {
        throw new Error(`Invalid filing period "${options.fp}". Expected MMYYYY.`);
    }
    if (!/^\d{2}$/.test(options.sellerState)) {
        throw new Error(`Invalid seller state "${options.sellerState}". Expected 2-digit GST code.`);
    }
}
function run(options) {
    assertCLIOptions(options);
    const transactions = (0, amazon_1.parseAmazonCSV)(options.input, {
        sellerState: options.sellerState
    });
    const b2cs = (0, b2cs_1.aggregateB2CS)(transactions, {
        sellerState: options.sellerState
    });
    const payload = (0, b2cs_1.buildGSTR1)(b2cs, {
        gstin: options.gstin,
        fp: options.fp
    });
    node_fs_1.default.writeFileSync(options.output, JSON.stringify(payload, null, 2), "utf8");
    console.log(`Generated ${payload.b2cs.length} b2cs rows at ${options.output}`);
}
if (require.main === module) {
    run(getCLIOptions());
}
