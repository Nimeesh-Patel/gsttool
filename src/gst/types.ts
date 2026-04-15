import Decimal from "decimal.js";
import { GSTStateCode, SupplyType } from "../utils/stateCodes";

export type Marketplace = "amazon" | "flipkart";
export type DocumentCategory = "invoice" | "credit_note" | "debit_note";
export type ReturnSection = "b2b" | "b2cs";

export interface NormalizedSupplyRecord {
  marketplace: Marketplace;
  section: ReturnSection;
  documentCategory: DocumentCategory;
  documentNumber: string;
  documentDate: string;
  pos: GSTStateCode;
  supplyType: SupplyType;
  rate: Decimal;
  taxableValue: Decimal;
  igst: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  cess: Decimal;
  invoiceValue: Decimal;
  quantity: Decimal;
  hsn: string;
  ecoGstin: string;
  ecoName: string;
  ctin?: string;
  receiverName?: string;
}

export interface DocumentIssueRecord {
  category: DocumentCategory;
  number: string;
}

export interface SourceExtraction {
  records: NormalizedSupplyRecord[];
  documentIssues: DocumentIssueRecord[];
}

export interface B2BItemDetail {
  txval: number;
  rt: number;
  iamt: number;
  camt?: number;
  samt?: number;
  csamt: number;
}

export interface B2BInvoiceItem {
  num: number;
  itm_det: B2BItemDetail;
}

export interface B2BInvoice {
  inum: string;
  idt: string;
  val: number;
  pos: string;
  rchrg: "N";
  inv_typ: "R";
  itms: B2BInvoiceItem[];
}

export interface B2BRecipient {
  ctin: string;
  inv: B2BInvoice[];
}

export interface B2CSItem {
  sply_ty: SupplyType;
  rt: number;
  typ: "OE";
  pos: string;
  txval: number;
  iamt?: number;
  camt?: number;
  samt?: number;
  csamt: 0;
}

export interface HSNItem {
  num: number;
  hsn_sc: string;
  uqc: "PCS";
  qty: number;
  rt: number;
  txval: number;
  iamt: number;
  samt: number;
  camt: number;
  csamt: 0;
}

export interface SupecoItem {
  etin: string;
  suppval: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  flag: "N";
}

export interface DocumentIssueSummaryItem {
  num: number;
  from: string;
  to: string;
  totnum: number;
  cancel: 0;
  net_issue: number;
}

export interface DocumentIssueSummaryGroup {
  doc_num: 1 | 4 | 5;
  doc_typ: string;
  docs: DocumentIssueSummaryItem[];
}

export interface GSTR1Payload {
  gstin: string;
  fp: string;
  version: string;
  hash: string;
  b2b: B2BRecipient[];
  b2cs: B2CSItem[];
  hsn: {
    hsn_b2b: HSNItem[];
    hsn_b2c?: HSNItem[];
  };
  supeco: {
    clttx: SupecoItem[];
  };
  doc_issue: {
    doc_det: DocumentIssueSummaryGroup[];
  };
}

export interface GenerateGSTR1Options {
  gstin: string;
  fp: string;
}
