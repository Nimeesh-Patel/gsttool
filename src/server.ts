import express, { Request, Response } from "express";
import fs from "node:fs";
import multer from "multer";
import { buildMonthlyGSTR1 } from "./gst/gstr1";
import { parseAmazonB2BContent, parseAmazonB2CContent } from "./parsers/amazon";
import { parseFlipkartWorkbook } from "./parsers/flipkart";
import { DEFAULT_SELLER_STATE } from "./utils/stateCodes";

const DEFAULT_GSTIN = "07ABGFR8042N1ZO";
const DEFAULT_FP = "032026";
const DEFAULT_PORT = 3000;

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

interface ProcessRequestBody {
  gstin?: string;
  fp?: string;
  sellerState?: string;
}

interface ProcessFiles {
  amazonB2B?: Express.Multer.File[];
  amazonB2C?: Express.Multer.File[];
  flipkart?: Express.Multer.File[];
}

function getSafeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getSingleUpload(files: ProcessFiles, key: keyof ProcessFiles): Express.Multer.File {
  const file = files[key]?.[0];
  if (!file) {
    throw new Error(`Missing required upload: ${key}`);
  }

  return file;
}

function assertProcessInputs(
  files: {
    amazonB2B: Express.Multer.File;
    amazonB2C: Express.Multer.File;
    flipkart: Express.Multer.File;
  },
  fp: string,
  sellerState: string
): void {
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

app.get("/health", (_request: Request, response: Response) => {
  response.json({ ok: true });
});

app.post(
  ["/process", "/api/process"],
  upload.fields([
    { name: "amazonB2B", maxCount: 1 },
    { name: "amazonB2C", maxCount: 1 },
    { name: "flipkart", maxCount: 1 }
  ]),
  (
    request: Request<unknown, unknown, ProcessRequestBody>,
    response: Response
  ) => {
    try {
      const files = (request.files ?? {}) as ProcessFiles;
      const amazonB2B = getSingleUpload(files, "amazonB2B");
      const amazonB2C = getSingleUpload(files, "amazonB2C");
      const flipkart = getSingleUpload(files, "flipkart");

      const fp = getSafeString(request.body?.fp, DEFAULT_FP);
      const gstin = getSafeString(request.body?.gstin, DEFAULT_GSTIN);
      const sellerState = getSafeString(request.body?.sellerState, DEFAULT_SELLER_STATE);

      assertProcessInputs({ amazonB2B, amazonB2C, flipkart }, fp, sellerState);

      const amazonB2BData = parseAmazonB2BContent(amazonB2B.buffer, { sellerState });
      const amazonB2CData = parseAmazonB2CContent(amazonB2C.buffer, { sellerState });
      const flipkartData = parseFlipkartWorkbook(flipkart.buffer, { sellerState });

      const payload = buildMonthlyGSTR1(
        [...amazonB2BData.records, ...amazonB2CData.records, ...flipkartData.records],
        [
          ...amazonB2BData.documentIssues,
          ...amazonB2CData.documentIssues,
          ...flipkartData.documentIssues
        ],
        { gstin, fp }
      );

      response.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to process file.";
      response.status(400).json({ message });
    }
  }
);

export function startServer(port: number = DEFAULT_PORT): void {
  app.listen(port, () => {
    console.log(`GST backend listening on http://localhost:${port}`);
  });
}

export function writeReferenceOutput(outputPath: string): void {
  const payload = buildMonthlyGSTR1([], [], {
    gstin: DEFAULT_GSTIN,
    fp: DEFAULT_FP
  });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
}

if (require.main === module) {
  startServer();
}
