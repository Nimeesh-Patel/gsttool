export * from "./gst/gstr1";
export * from "./gst/types";
export * from "./parsers/amazon";
export * from "./parsers/flipkart";
export * from "./utils/stateCodes";
export interface MonthlyRunOptions {
    amazonB2B: string;
    amazonB2C: string;
    flipkart: string;
    output: string;
    gstin: string;
    fp: string;
    sellerState: string;
}
export declare function runMonthly(options: MonthlyRunOptions): void;
