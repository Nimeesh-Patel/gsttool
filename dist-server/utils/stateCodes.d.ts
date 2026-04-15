export type GSTStateCode = string;
export type SupplyType = "INTER" | "INTRA";
export declare const DEFAULT_SELLER_STATE: GSTStateCode;
export declare function toGSTStateCode(state: string): GSTStateCode;
export declare function getSupplyType(buyerState: GSTStateCode, sellerState: GSTStateCode): SupplyType;
