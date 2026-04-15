import { SourceExtraction } from "../gst/types";
import { GSTStateCode } from "../utils/stateCodes";
export interface AmazonCSVRow {
    [key: string]: string | undefined;
}
export interface ParseAmazonCSVOptions {
    sellerState?: GSTStateCode;
}
export declare function parseAmazonB2BContent(content: Buffer | string, options?: ParseAmazonCSVOptions): SourceExtraction;
export declare function parseAmazonB2CContent(content: Buffer | string, options?: ParseAmazonCSVOptions): SourceExtraction;
