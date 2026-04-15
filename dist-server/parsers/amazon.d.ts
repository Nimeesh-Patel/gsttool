import Decimal from "decimal.js";
import { SourceExtraction } from "../gst/types";
import { GSTStateCode, SupplyType } from "../utils/stateCodes";
export interface AmazonCSVRow {
    [key: string]: string | undefined;
}
export interface Transaction {
    shipState: GSTStateCode;
    taxableValue: Decimal;
    taxAmount: Decimal;
    taxRate: Decimal;
    supplyType: SupplyType;
}
export interface NormalizedTransaction extends Transaction {
    pos: GSTStateCode;
}
export interface ParseAmazonCSVOptions {
    sellerState?: GSTStateCode;
}
export declare function normalizeRow(row: AmazonCSVRow, sellerState?: GSTStateCode): NormalizedTransaction | null;
export declare function parseAmazonCSV(filePath: string, options?: ParseAmazonCSVOptions): Transaction[];
export declare function parseAmazonCSVContent(content: Buffer | string, options?: ParseAmazonCSVOptions): Transaction[];
export declare function parseAmazonB2BContent(content: Buffer | string, options?: ParseAmazonCSVOptions): SourceExtraction;
export declare function parseAmazonB2CContent(content: Buffer | string, options?: ParseAmazonCSVOptions): SourceExtraction;
