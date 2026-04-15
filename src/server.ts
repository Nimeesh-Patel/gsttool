import express, { Request, Response } from "express";
import multer from "multer";
import { aggregateB2CS, buildGSTR1 } from "./gst/b2cs";
import { parseAmazonCSVContent } from "./parsers/amazon";
import { DEFAULT_SELLER_STATE } from "./utils/stateCodes";

const DEFAULT_GSTIN = "07ABGFR8042N1ZO";
const DEFAULT_FP = "022026";
const DEFAULT_PORT = 3000;

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

interface ProcessRequestBody {
  gstin?: string;
  fp?: string;
  sellerState?: string;
}

function getSafeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function assertProcessInputs(fileName: string, fp: string, sellerState: string): void {
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

app.get("/health", (_request: Request, response: Response) => {
  response.json({ ok: true });
});

function processUpload(
  request: Request<unknown, unknown, ProcessRequestBody>,
  response: Response
): void {
  try {
    const uploadedFile = request.file;
    if (!uploadedFile) {
      response.status(400).json({ message: "Missing file upload." });
      return;
    }

    const fp = getSafeString(request.body?.fp, DEFAULT_FP);
    const gstin = getSafeString(request.body?.gstin, DEFAULT_GSTIN);
    const sellerState = getSafeString(request.body?.sellerState, DEFAULT_SELLER_STATE);

    assertProcessInputs(uploadedFile.originalname, fp, sellerState);

    const transactions = parseAmazonCSVContent(uploadedFile.buffer, {
      sellerState
    });
    const b2cs = aggregateB2CS(transactions, {
      sellerState
    });
    const payload = buildGSTR1(b2cs, {
      gstin,
      fp
    });

    response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process file.";
    response.status(400).json({ message });
  }
}

app.post(
  ["/process", "/api/process"],
  upload.single("file"),
  processUpload
);

export function startServer(port: number = DEFAULT_PORT): void {
  app.listen(port, () => {
    console.log(`GST backend listening on http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer();
}
