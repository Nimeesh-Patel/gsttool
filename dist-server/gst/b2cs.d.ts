import { Transaction } from "../parsers/amazon";
import { GSTStateCode, SupplyType } from "../utils/stateCodes";
export interface B2CSItem {
    sply_ty: SupplyType;
    rt: number;
    typ: "OE";
    pos: GSTStateCode;
    txval: number;
    iamt?: number;
    camt?: number;
    samt?: number;
    csamt: 0;
}
export interface GSTR1Payload {
    gstin: string;
    fp: string;
    b2cs: B2CSItem[];
}
export interface AggregateB2CSOptions {
    sellerState?: GSTStateCode;
}
export interface BuildGSTR1Options {
    gstin: string;
    fp: string;
}
export declare function aggregateB2CS(transactions: Transaction[], options?: AggregateB2CSOptions): B2CSItem[];
export declare function buildGSTR1(b2cs: B2CSItem[], options: BuildGSTR1Options): GSTR1Payload;
