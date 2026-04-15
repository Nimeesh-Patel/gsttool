"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const b2cs_1 = require("./gst/b2cs");
const amazon_1 = require("./parsers/amazon");
const stateCodes_1 = require("./utils/stateCodes");
const DEFAULT_GSTIN = "07ABGFR8042N1ZO";
const DEFAULT_FP = "022026";
const DEFAULT_PORT = 3000;
const app = (0, express_1.default)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});
function getSafeString(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function assertProcessInputs(fileName, fp, sellerState) {
    if (!fileName.toLowerCase().endsWith(".csv")) {
        throw new Error("Only Amazon CSV uploads are supported right now.");
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
function processUpload(request, response) {
    try {
        const uploadedFile = request.file;
        if (!uploadedFile) {
            response.status(400).json({ message: "Missing file upload." });
            return;
        }
        const fp = getSafeString(request.body?.fp, DEFAULT_FP);
        const gstin = getSafeString(request.body?.gstin, DEFAULT_GSTIN);
        const sellerState = getSafeString(request.body?.sellerState, stateCodes_1.DEFAULT_SELLER_STATE);
        assertProcessInputs(uploadedFile.originalname, fp, sellerState);
        const transactions = (0, amazon_1.parseAmazonCSVContent)(uploadedFile.buffer, {
            sellerState
        });
        const b2cs = (0, b2cs_1.aggregateB2CS)(transactions, {
            sellerState
        });
        const payload = (0, b2cs_1.buildGSTR1)(b2cs, {
            gstin,
            fp
        });
        response.json(payload);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unable to process file.";
        response.status(400).json({ message });
    }
}
app.post(["/process", "/api/process"], upload.single("file"), processUpload);
function startServer(port = DEFAULT_PORT) {
    app.listen(port, () => {
        console.log(`GST backend listening on http://localhost:${port}`);
    });
}
if (require.main === module) {
    startServer();
}
