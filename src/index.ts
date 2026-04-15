import fs from "node:fs";
import path from "node:path";
import { buildMonthlyGSTR1 } from "./gst/gstr1";
import { parseAmazonB2BContent, parseAmazonB2CContent } from "./parsers/amazon";
import { parseFlipkartWorkbook } from "./parsers/flipkart";
import { DEFAULT_SELLER_STATE } from "./utils/stateCodes";

export * from "./gst/gstr1";
export * from "./gst/types";
export * from "./parsers/amazon";
export * from "./parsers/flipkart";
export * from "./utils/stateCodes";

const DEFAULT_GSTIN = "07ABGFR8042N1ZO";
const DEFAULT_FP = "032026";
const DEFAULT_OUTPUT_FILE = "gstr1-returns.json";

export interface MonthlyRunOptions {
  amazonB2B: string;
  amazonB2C: string;
  flipkart: string;
  output: string;
  gstin: string;
  fp: string;
  sellerState: string;
}

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireArg(flag: string): string {
  const value = readArg(flag);
  if (!value) {
    throw new Error(`Missing required argument ${flag}`);
  }

  return value;
}

function getCLIOptions(): MonthlyRunOptions {
  return {
    amazonB2B: path.resolve(process.cwd(), requireArg("--amazon-b2b")),
    amazonB2C: path.resolve(process.cwd(), requireArg("--amazon-b2c")),
    flipkart: path.resolve(process.cwd(), requireArg("--flipkart")),
    output: path.resolve(process.cwd(), readArg("--output") ?? DEFAULT_OUTPUT_FILE),
    gstin: readArg("--gstin") ?? DEFAULT_GSTIN,
    fp: readArg("--fp") ?? DEFAULT_FP,
    sellerState: readArg("--seller-state") ?? DEFAULT_SELLER_STATE
  };
}

function assertCLIOptions(options: MonthlyRunOptions): void {
  for (const input of [options.amazonB2B, options.amazonB2C, options.flipkart]) {
    if (!fs.existsSync(input)) {
      throw new Error(`Input file not found: ${input}`);
    }
  }

  if (!/^\d{6}$/.test(options.fp)) {
    throw new Error(`Invalid filing period "${options.fp}". Expected MMYYYY.`);
  }

  if (!/^\d{2}$/.test(options.sellerState)) {
    throw new Error(`Invalid seller state "${options.sellerState}". Expected 2-digit GST code.`);
  }
}

export function runMonthly(options: MonthlyRunOptions): void {
  assertCLIOptions(options);

  const amazonB2B = parseAmazonB2BContent(fs.readFileSync(options.amazonB2B), {
    sellerState: options.sellerState
  });
  const amazonB2C = parseAmazonB2CContent(fs.readFileSync(options.amazonB2C), {
    sellerState: options.sellerState
  });
  const flipkart = parseFlipkartWorkbook(fs.readFileSync(options.flipkart), {
    sellerState: options.sellerState
  });

  const records = [...amazonB2B.records, ...amazonB2C.records, ...flipkart.records];
  const documentIssues = [
    ...amazonB2B.documentIssues,
    ...amazonB2C.documentIssues,
    ...flipkart.documentIssues
  ];

  const payload = buildMonthlyGSTR1(records, documentIssues, {
    gstin: options.gstin,
    fp: options.fp
  });

  fs.writeFileSync(options.output, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Generated GST JSON at ${options.output}`);
}

if (require.main === module) {
  runMonthly(getCLIOptions());
}
