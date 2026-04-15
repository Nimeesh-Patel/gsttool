"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
exports.writeReferenceOutput = writeReferenceOutput;
const express_1 = __importDefault(require("express"));
const node_fs_1 = __importDefault(require("node:fs"));
const multer_1 = __importDefault(require("multer"));
const gstr1_1 = require("./gst/gstr1");
const amazon_1 = require("./parsers/amazon");
const flipkart_1 = require("./parsers/flipkart");
const stateCodes_1 = require("./utils/stateCodes");
const DEFAULT_GSTIN = "07ABGFR8042N1ZO";
const DEFAULT_FP = "032026";
const DEFAULT_PORT = 3000;
const app = (0, express_1.default)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 20 * 1024 * 1024
    }
});
function getSafeString(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function getSingleUpload(files, key) {
    const file = files[key]?.[0];
    if (!file) {
        throw new Error(`Missing required upload: ${key}`);
    }
    return file;
}
function assertProcessInputs(files, fp, sellerState) {
    if (!files.amazonB2B.originalname.toLowerCase().endsWith(".csv")) {
        throw new Error("Amazon B2B must be a CSV file.");
    }
    if (!files.amazonB2C.originalname.toLowerCase().endsWith(".csv")) {
        throw new Error("Amazon B2C must be a CSV file.");
    }
    if (!files.flipkart.originalname.toLowerCase().endsWith(".xlsx")) {
        throw new Error("Flipkart upload must be an XLSX file.");
    }
    if (!/^\d{6}$/.test(fp)) {
        throw new Error(`Invalid filing period "${fp}". Expected MMYYYY.`);
    }
    if (!/^\d{2}$/.test(sellerState)) {
        throw new Error(`Invalid seller state "${sellerState}". Expected 2-digit GST code.`);
    }
}
app.get("/health", (_request, response) => {
    response.json({ ok: true });
});
app.post(["/process", "/api/process"], upload.fields([
    { name: "amazonB2B", maxCount: 1 },
    { name: "amazonB2C", maxCount: 1 },
    { name: "flipkart", maxCount: 1 }
]), (request, response) => {
    try {
        const files = (request.files ?? {});
        const amazonB2B = getSingleUpload(files, "amazonB2B");
        const amazonB2C = getSingleUpload(files, "amazonB2C");
        const flipkart = getSingleUpload(files, "flipkart");
        const fp = getSafeString(request.body?.fp, DEFAULT_FP);
        const gstin = getSafeString(request.body?.gstin, DEFAULT_GSTIN);
        const sellerState = getSafeString(request.body?.sellerState, stateCodes_1.DEFAULT_SELLER_STATE);
        assertProcessInputs({ amazonB2B, amazonB2C, flipkart }, fp, sellerState);
        const amazonB2BData = (0, amazon_1.parseAmazonB2BContent)(amazonB2B.buffer, { sellerState });
        const amazonB2CData = (0, amazon_1.parseAmazonB2CContent)(amazonB2C.buffer, { sellerState });
        const flipkartData = (0, flipkart_1.parseFlipkartWorkbook)(flipkart.buffer, { sellerState });
        const payload = (0, gstr1_1.buildMonthlyGSTR1)([...amazonB2BData.records, ...amazonB2CData.records, ...flipkartData.records], [
            ...amazonB2BData.documentIssues,
            ...amazonB2CData.documentIssues,
            ...flipkartData.documentIssues
        ], { gstin, fp });
        response.json(payload);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unable to process file.";
        response.status(400).json({ message });
    }
});
function startServer(port = DEFAULT_PORT) {
    app.listen(port, () => {
        console.log(`GST backend listening on http://localhost:${port}`);
    });
}
function writeReferenceOutput(outputPath) {
    const payload = (0, gstr1_1.buildMonthlyGSTR1)([], [], {
        gstin: DEFAULT_GSTIN,
        fp: DEFAULT_FP
    });
    node_fs_1.default.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
}
if (require.main === module) {
    startServer();
}
