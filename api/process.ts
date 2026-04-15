import { aggregateB2CS, buildGSTR1 } from "../src/gst/b2cs";
import { parseAmazonCSVContent } from "../src/parsers/amazon";
import { DEFAULT_SELLER_STATE } from "../src/utils/stateCodes";

const DEFAULT_GSTIN = "07ABGFR8042N1ZO";
const DEFAULT_FP = "022026";

function getSafeString(value: FormDataEntryValue | null, fallback: string): string {
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
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonResponse({ message: "Missing file upload." }, 400);
    }

    const fp = getSafeString(formData.get("fp"), DEFAULT_FP);
    const gstin = getSafeString(formData.get("gstin"), DEFAULT_GSTIN);
    const sellerState = getSafeString(formData.get("sellerState"), DEFAULT_SELLER_STATE);

    assertProcessInputs(file.name, fp, sellerState);

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const transactions = parseAmazonCSVContent(fileBuffer, {
      sellerState
    });
    const b2cs = aggregateB2CS(transactions, {
      sellerState
    });
    const payload = buildGSTR1(b2cs, {
      gstin,
      fp
    });

    return jsonResponse(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process file.";
    return jsonResponse({ message }, 400);
  }
}

export function GET(): Response {
  return jsonResponse({ ok: true });
}

export async function POST(request: Request): Promise<Response> {
  return handlePost(request);
}
