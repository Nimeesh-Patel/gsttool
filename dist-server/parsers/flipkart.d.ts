import { SourceExtraction } from "../gst/types";
import { GSTStateCode } from "../utils/stateCodes";
export interface ParseFlipkartOptions {
    sellerState?: GSTStateCode;
}
export declare function parseFlipkartWorkbook(content: Buffer, options?: ParseFlipkartOptions): SourceExtraction;
