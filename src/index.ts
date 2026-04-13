import fs from "node:fs";
import path from "node:path";
import { aggregateB2CS, buildGSTR1 } from "./gst/b2cs";
import { parseAmazonCSV } from "./parsers/amazon";
import { DEFAULT_SELLER_STATE } from "./utils/stateCodes";

export * from "./gst/b2cs";
export * from "./parsers/amazon";
export * from "./utils/stateCodes";

const DEFAULT_GSTIN = "07ABGFR8042N1ZO";
const DEFAULT_FP = "022026";
const DEFAULT_INPUT_FILE = "MTR_B2C-FEBRUARY-2026-A2G23RCK8NBZ6R.csv";
const DEFAULT_OUTPUT_FILE = "gstr1-b2cs.json";

interface CLIOptions {
  input: string;
  output: string;
  gstin: string;
  fp: string;
  sellerState: string;
}

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function getCLIOptions(): CLIOptions {
  return {
    input: path.resolve(process.cwd(), readArg("--input") ?? DEFAULT_INPUT_FILE),
    output: path.resolve(process.cwd(), readArg("--output") ?? DEFAULT_OUTPUT_FILE),
    gstin: readArg("--gstin") ?? DEFAULT_GSTIN,
    fp: readArg("--fp") ?? DEFAULT_FP,
    sellerState: readArg("--seller-state") ?? DEFAULT_SELLER_STATE
  };
}

function assertCLIOptions(options: CLIOptions): void {
  if (!fs.existsSync(options.input)) {
    throw new Error(`Input file not found: ${options.input}`);
  }

  if (!/^\d{6}$/.test(options.fp)) {
    throw new Error(`Invalid filing period "${options.fp}". Expected MMYYYY.`);
  }

  if (!/^\d{2}$/.test(options.sellerState)) {
    throw new Error(`Invalid seller state "${options.sellerState}". Expected 2-digit GST code.`);
  }
}

export function run(options: CLIOptions): void {
  assertCLIOptions(options);

  const transactions = parseAmazonCSV(options.input, {
    sellerState: options.sellerState
  });
  const b2cs = aggregateB2CS(transactions, {
    sellerState: options.sellerState
  });
  const payload = buildGSTR1(b2cs, {
    gstin: options.gstin,
    fp: options.fp
  });

  fs.writeFileSync(options.output, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Generated ${payload.b2cs.length} b2cs rows at ${options.output}`);
}

if (require.main === module) {
  run(getCLIOptions());
}
