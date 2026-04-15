import { buildMonthlyGSTR1, deriveFp } from "../src/gst/gstr1";
import { parseAmazonB2BContent, parseAmazonB2CContent } from "../src/parsers/amazon";
import { parseFlipkartWorkbook } from "../src/parsers/flipkart";
import { DEFAULT_SELLER_STATE } from "../src/utils/stateCodes";

const DEFAULT_GSTIN = "07ABGFR8042N1ZO";

function getSafeString(value: FormDataEntryValue | null, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getFile(formData: FormData, key: string): File {
  const file = formData.get(key);
  if (!(file instanceof File)) {
    throw new Error(`Missing required upload: ${key}`);
  }

  return file;
}

function assertProcessInputs(
  files: {
    amazonB2B: File;
    amazonB2C: File;
    flipkart: File;
  },
  sellerState: string
): void {
  if (!files.amazonB2B.name.toLowerCase().endsWith(".csv")) {
    throw new Error("Amazon B2B must be a CSV file.");
  }

  if (!files.amazonB2C.name.toLowerCase().endsWith(".csv")) {
    throw new Error("Amazon B2C must be a CSV file.");
  }

  if (!files.flipkart.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Flipkart upload must be an XLSX file.");
  }

  if (!/^\d{2}$/.test(sellerState)) {
    throw new Error(`Invalid seller state "${sellerState}". Expected 2-digit GST code.`);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

async function handlePost(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const files = {
      amazonB2B: getFile(formData, "amazonB2B"),
      amazonB2C: getFile(formData, "amazonB2C"),
      flipkart: getFile(formData, "flipkart")
    };

    const gstin = getSafeString(formData.get("gstin"), DEFAULT_GSTIN);
    const sellerState = getSafeString(formData.get("sellerState"), DEFAULT_SELLER_STATE);

    assertProcessInputs(files, sellerState);

    const amazonB2BData = parseAmazonB2BContent(
      Buffer.from(await files.amazonB2B.arrayBuffer()),
      { sellerState }
    );
    const amazonB2CData = parseAmazonB2CContent(
      Buffer.from(await files.amazonB2C.arrayBuffer()),
      { sellerState }
    );
    const flipkartData = parseFlipkartWorkbook(
      Buffer.from(await files.flipkart.arrayBuffer()),
      { sellerState }
    );

    const allRecords = [...amazonB2BData.records, ...amazonB2CData.records, ...flipkartData.records];
    const fpInput = formData.get("fp");
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

    return jsonResponse(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process file.";
    return jsonResponse({ message }, 400);
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "GET") {
    return jsonResponse({ ok: true });
  }

  if (request.method === "POST") {
    return handlePost(request);
  }

  return jsonResponse({ message: "Method not allowed." }, 405);
}
