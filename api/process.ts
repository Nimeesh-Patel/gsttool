import multer from "multer";
import { buildMonthlyGSTR1, deriveFp } from "../src/gst/gstr1";
import { parseAmazonB2BContent, parseAmazonB2CContent } from "../src/parsers/amazon";
import { parseFlipkartWorkbook } from "../src/parsers/flipkart";
import { DEFAULT_SELLER_STATE } from "../src/utils/stateCodes";

const DEFAULT_GSTIN = "07ABGFR8042N1ZO";

// Disable Vercel's built-in body parser so multer can read the raw stream
export const config = { api: { bodyParser: false } };

const upload = multer({ storage: multer.memoryStorage() });

function parseMultipart(req: any, res: any): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.fields([
      { name: "amazonB2B", maxCount: 1 },
      { name: "amazonB2C", maxCount: 1 },
      { name: "flipkart", maxCount: 1 }
    ])(req, res, (err: any) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getSafeField(body: Record<string, any>, key: string, fallback: string): string {
  const v = body?.[key];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s.trim() ? s.trim() : fallback;
}

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET") {
    res.status(200).end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== "POST") {
    res.status(405).end(JSON.stringify({ message: "Method not allowed." }));
    return;
  }

  try {
    await parseMultipart(req, res);

    const files = req.files as Record<string, { buffer: Buffer; originalname: string }[]>;

    const amazonB2BFile = files?.amazonB2B?.[0];
    const amazonB2CFile = files?.amazonB2C?.[0];
    const flipkartFile = files?.flipkart?.[0];

    if (!amazonB2BFile) throw new Error("Missing required upload: amazonB2B");
    if (!amazonB2CFile) throw new Error("Missing required upload: amazonB2C");
    if (!flipkartFile) throw new Error("Missing required upload: flipkart");

    if (!amazonB2BFile.originalname.toLowerCase().endsWith(".csv")) {
      throw new Error("Amazon B2B must be a CSV file.");
    }
    if (!amazonB2CFile.originalname.toLowerCase().endsWith(".csv")) {
      throw new Error("Amazon B2C must be a CSV file.");
    }
    if (!flipkartFile.originalname.toLowerCase().endsWith(".xlsx")) {
      throw new Error("Flipkart upload must be an XLSX file.");
    }

    const gstin = getSafeField(req.body, "gstin", DEFAULT_GSTIN);
    const sellerState = getSafeField(req.body, "sellerState", DEFAULT_SELLER_STATE);

    if (!/^\d{2}$/.test(sellerState)) {
      throw new Error(`Invalid seller state "${sellerState}". Expected 2-digit GST code.`);
    }

    const amazonB2BData = parseAmazonB2BContent(amazonB2BFile.buffer, { sellerState });
    const amazonB2CData = parseAmazonB2CContent(amazonB2CFile.buffer, { sellerState });
    const flipkartData = parseFlipkartWorkbook(flipkartFile.buffer, { sellerState });

    const allRecords = [...amazonB2BData.records, ...amazonB2CData.records, ...flipkartData.records];

    const fpInput = req.body?.fp;
    const userFp = typeof fpInput === "string" && /^\d{6}$/.test(fpInput.trim()) ? fpInput.trim() : null;
    const fp = userFp ?? deriveFp(allRecords);

    if (!fp) {
      throw new Error("Could not determine filing period from data. Provide fp explicitly.");
    }

    const payload = buildMonthlyGSTR1(
      allRecords,
      [
        ...amazonB2BData.documentIssues,
        ...amazonB2CData.documentIssues,
        ...flipkartData.documentIssues
      ],
      { gstin, fp }
    );

    res.status(200).end(JSON.stringify(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process file.";
    res.status(400).end(JSON.stringify({ message }));
  }
}
