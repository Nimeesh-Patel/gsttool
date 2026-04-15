import { B2BRecipient, B2CSItem, DocumentIssueRecord, DocumentIssueSummaryGroup, GenerateGSTR1Options, GSTR1Payload, HSNItem, NormalizedSupplyRecord, SupecoItem } from "./types";
export declare function aggregateB2CS(records: NormalizedSupplyRecord[]): B2CSItem[];
export declare function aggregateB2B(records: NormalizedSupplyRecord[]): B2BRecipient[];
export declare function deriveFp(records: NormalizedSupplyRecord[]): string | null;
export declare function aggregateHSN(records: NormalizedSupplyRecord[]): {
    hsn_b2b: HSNItem[];
    hsn_b2c?: HSNItem[];
};
export declare function aggregateSupeco(records: NormalizedSupplyRecord[]): {
    clttx: SupecoItem[];
};
export declare function aggregateDocumentIssues(issues: DocumentIssueRecord[]): {
    doc_det: DocumentIssueSummaryGroup[];
};
export declare function buildMonthlyGSTR1(records: NormalizedSupplyRecord[], issues: DocumentIssueRecord[], options: GenerateGSTR1Options): GSTR1Payload;
