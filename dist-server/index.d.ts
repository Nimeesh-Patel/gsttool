export * from "./gst/b2cs";
export * from "./parsers/amazon";
export * from "./utils/stateCodes";
interface CLIOptions {
    input: string;
    output: string;
    gstin: string;
    fp: string;
    sellerState: string;
}
export declare function run(options: CLIOptions): void;
