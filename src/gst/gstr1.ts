import Decimal from "decimal.js";
import {
  B2BInvoice,
  B2BRecipient,
  B2CSItem,
  DocumentCategory,
  DocumentIssueRecord,
  DocumentIssueSummaryGroup,
  GenerateGSTR1Options,
  GSTR1Payload,
  HSNItem,
  NormalizedSupplyRecord,
  SupecoItem
} from "./types";
import { getStateNameFromCode } from "../utils/stateCodes";

const GST_VERSION = "GST3.1.6";
const GST_HASH = "hash";

const DOC_FAMILY_ORDER: Array<{
  category: DocumentCategory;
  family: string;
  doc_num: 1 | 4 | 5;
  doc_typ: string;
}> = [
  {
    category: "invoice",
    family: "amazon_invoice",
    doc_num: 1,
    doc_typ: "Invoices for outward supply"
  },
  {
    category: "invoice",
    family: "flipkart_invoice",
    doc_num: 1,
    doc_typ: "Invoices for outward supply"
  },
  {
    category: "credit_note",
    family: "amazon_credit",
    doc_num: 5,
    doc_typ: "Credit Note"
  },
  {
    category: "credit_note",
    family: "flipkart_credit_sales",
    doc_num: 5,
    doc_typ: "Credit Note"
  },
  {
    category: "credit_note",
    family: "flipkart_credit_cashback",
    doc_num: 5,
    doc_typ: "Credit Note"
  },
  {
    category: "debit_note",
    family: "flipkart_debit_cashback",
    doc_num: 4,
    doc_typ: "Debit Note"
  },
  {
    category: "debit_note",
    family: "flipkart_debit_sales",
    doc_num: 4,
    doc_typ: "Debit Note"
  }
];

function round2(value: Decimal): number {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

function itemNumber(rate: number): number {
  return Math.round(rate * 100) + 1;
}

function toDocFamily(number: string, category: DocumentCategory): string {
  if (number.startsWith("IN-")) {
    return "amazon_invoice";
  }

  if (number.startsWith("CN-")) {
    return "amazon_credit";
  }

  if (["FAONVN", "LWAAKVG"].some((prefix) => number.startsWith(prefix))) {
    return "flipkart_invoice";
  }

  if (["RAMDVE", "MFAAJLK"].some((prefix) => number.startsWith(prefix))) {
    return "flipkart_credit_sales";
  }

  if (["CAIWCE", "LYAAI50"].some((prefix) => number.startsWith(prefix))) {
    return "flipkart_credit_cashback";
  }

  if (["DAKDNZ", "LZAAQKD"].some((prefix) => number.startsWith(prefix))) {
    return "flipkart_debit_cashback";
  }

  if (["D1OHR", "LOAAL4T"].some((prefix) => number.startsWith(prefix))) {
    return "flipkart_debit_sales";
  }

  return `${category}_${number}`;
}

export function aggregateB2CS(records: NormalizedSupplyRecord[]): B2CSItem[] {
  const grouped = new Map<
    string,
    {
      pos: string;
      rt: number;
      sply_ty: B2CSItem["sply_ty"];
      txval: Decimal;
      iamt: Decimal;
      camt: Decimal;
      samt: Decimal;
    }
  >();

  for (const record of records.filter((item) => item.section === "b2cs")) {
    const rt = round2(record.rate);
    const key = `${record.pos}|${rt}|${record.supplyType}`;
    const current = grouped.get(key);

    if (current) {
      current.txval = current.txval.plus(record.taxableValue);
      current.iamt = current.iamt.plus(record.igst);
      current.camt = current.camt.plus(record.cgst);
      current.samt = current.samt.plus(record.sgst);
      continue;
    }

    grouped.set(key, {
      pos: record.pos,
      rt,
      sply_ty: record.supplyType,
      txval: new Decimal(record.taxableValue),
      iamt: new Decimal(record.igst),
      camt: new Decimal(record.cgst),
      samt: new Decimal(record.sgst)
    });
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      sply_ty: entry.sply_ty,
      rt: entry.rt,
      typ: "OE" as const,
      pos: entry.pos,
      txval: round2(entry.txval),
      iamt: entry.sply_ty === "INTER" ? round2(entry.iamt) : undefined,
      camt: entry.sply_ty === "INTRA" ? round2(entry.camt) : undefined,
      samt: entry.sply_ty === "INTRA" ? round2(entry.samt) : undefined,
      csamt: 0 as const
    }))
    .sort((left, right) => {
      const stateCompare = getStateNameFromCode(left.pos).localeCompare(
        getStateNameFromCode(right.pos)
      );
      if (stateCompare !== 0) {
        return stateCompare;
      }

      if (left.rt !== right.rt) {
        return left.rt - right.rt;
      }

      return left.sply_ty.localeCompare(right.sply_ty);
    });
}

export function aggregateB2B(records: NormalizedSupplyRecord[]): B2BRecipient[] {
  const recipientMap = new Map<string, Map<string, NormalizedSupplyRecord[]>>();

  for (const record of records.filter(
    (item) => item.section === "b2b" && item.documentCategory === "invoice" && item.ctin
  )) {
    const invoicesByRecipient =
      recipientMap.get(record.ctin!) ?? new Map<string, NormalizedSupplyRecord[]>();
    const items = invoicesByRecipient.get(record.documentNumber) ?? [];
    items.push(record);
    invoicesByRecipient.set(record.documentNumber, items);
    recipientMap.set(record.ctin!, invoicesByRecipient);
  }

  return Array.from(recipientMap.entries()).map(([ctin, invoicesByRecipient]) => {
    const inv = Array.from(invoicesByRecipient.values()).map((items): B2BInvoice => {
      const first = items[0];
      const groupedByRate = new Map<string, NormalizedSupplyRecord[]>();

      for (const item of items) {
        const key = item.rate.toString();
        const current = groupedByRate.get(key) ?? [];
        current.push(item);
        groupedByRate.set(key, current);
      }

      return {
        inum: first.documentNumber,
        idt: first.documentDate,
        val: round2(
          items.reduce((sum, item) => sum.plus(item.invoiceValue), new Decimal(0))
        ),
        pos: first.pos,
        rchrg: "N",
        inv_typ: "R",
        itms: Array.from(groupedByRate.entries()).map(([rateKey, rateItems]) => {
          const rate = round2(new Decimal(rateKey));
          const camt = round2(
            rateItems.reduce((sum, item) => sum.plus(item.cgst), new Decimal(0))
          );
          const samt = round2(
            rateItems.reduce((sum, item) => sum.plus(item.sgst), new Decimal(0))
          );
          return {
            num: itemNumber(rate),
            itm_det: {
              txval: round2(
                rateItems.reduce((sum, item) => sum.plus(item.taxableValue), new Decimal(0))
              ),
              rt: rate,
              iamt: round2(
                rateItems.reduce((sum, item) => sum.plus(item.igst), new Decimal(0))
              ),
              camt: camt !== 0 ? camt : undefined,
              samt: samt !== 0 ? samt : undefined,
              csamt: 0
            }
          };
        })
      };
    });

    return {
      ctin,
      inv
    };
  });
}

export function aggregateHSN(records: NormalizedSupplyRecord[]): {
  hsn_b2b: HSNItem[];
  hsn_b2c: HSNItem[];
} {
  const group = (section: "b2b" | "b2cs"): HSNItem[] => {
    const grouped = new Map<
      string,
      {
        hsn: string;
        rate: number;
        qty: Decimal;
        txval: Decimal;
        iamt: Decimal;
        camt: Decimal;
        samt: Decimal;
      }
    >();

    for (const record of records.filter((item) => item.section === section)) {
      const rate = round2(record.rate);
      const key = `${record.hsn}|${rate}`;
      const current = grouped.get(key);

      if (current) {
        if (record.quantity.greaterThan(0)) {
          current.qty = current.qty.plus(record.quantity);
        }
        current.txval = current.txval.plus(record.taxableValue);
        current.iamt = current.iamt.plus(record.igst);
        current.camt = current.camt.plus(record.cgst);
        current.samt = current.samt.plus(record.sgst);
        continue;
      }

      grouped.set(key, {
        hsn: record.hsn,
        rate,
        qty: record.quantity.greaterThan(0) ? new Decimal(record.quantity) : new Decimal(0),
        txval: new Decimal(record.taxableValue),
        iamt: new Decimal(record.igst),
        camt: new Decimal(record.cgst),
        samt: new Decimal(record.sgst)
      });
    }

    return Array.from(grouped.values()).map((entry, index) => ({
      num: index + 1,
      hsn_sc: entry.hsn,
      uqc: "PCS" as const,
      qty: round2(entry.qty),
      rt: entry.rate,
      txval: round2(entry.txval),
      iamt: round2(entry.iamt),
      samt: round2(entry.samt),
      camt: round2(entry.camt),
      csamt: 0 as const
    }));
  };

  return {
    hsn_b2b: group("b2b"),
    hsn_b2c: group("b2cs")
  };
}

export function aggregateSupeco(records: NormalizedSupplyRecord[]): { clttx: SupecoItem[] } {
  const grouped = new Map<
    string,
    {
      etin: string;
      ecoName: string;
      suppval: Decimal;
      igst: Decimal;
      cgst: Decimal;
      sgst: Decimal;
      cess: Decimal;
    }
  >();

  for (const record of records) {
    const key = record.ecoGstin;
    const current = grouped.get(key);

    if (current) {
      current.suppval = current.suppval.plus(record.taxableValue);
      current.igst = current.igst.plus(record.igst);
      current.cgst = current.cgst.plus(record.cgst);
      current.sgst = current.sgst.plus(record.sgst);
      current.cess = current.cess.plus(record.cess);
      continue;
    }

    grouped.set(key, {
      etin: record.ecoGstin,
      ecoName: record.ecoName,
      suppval: new Decimal(record.taxableValue),
      igst: new Decimal(record.igst),
      cgst: new Decimal(record.cgst),
      sgst: new Decimal(record.sgst),
      cess: new Decimal(record.cess)
    });
  }

  return {
    clttx: Array.from(grouped.values())
      .sort((left, right) => left.ecoName.localeCompare(right.ecoName))
      .map((entry) => ({
        etin: entry.etin,
        suppval: round2(entry.suppval),
        igst: round2(entry.igst),
        cgst: round2(entry.cgst),
        sgst: round2(entry.sgst),
        cess: round2(entry.cess),
        flag: "N" as const
      }))
  };
}

export function aggregateDocumentIssues(
  issues: DocumentIssueRecord[]
): { doc_det: DocumentIssueSummaryGroup[] } {
  const grouped = new Map<
    string,
    {
      category: DocumentCategory;
      family: string;
      numbers: string[];
    }
  >();

  for (const issue of issues) {
    const family = toDocFamily(issue.number, issue.category);
    const key = `${issue.category}|${family}`;
    const current = grouped.get(key);

    if (current) {
      current.numbers.push(issue.number);
      continue;
    }

    grouped.set(key, {
      category: issue.category,
      family,
      numbers: [issue.number]
    });
  }

  const groups = new Map<string, DocumentIssueSummaryGroup>();

  for (const config of DOC_FAMILY_ORDER) {
    const entry = grouped.get(`${config.category}|${config.family}`);
    if (!entry) {
      continue;
    }

    const sortedNumbers = [...entry.numbers].sort((left, right) => left.localeCompare(right));
    const summary = {
      num:
        (groups.get(String(config.doc_num))?.docs.length ?? 0) + 1,
      from: sortedNumbers[0],
      to: sortedNumbers[sortedNumbers.length - 1],
      totnum: sortedNumbers.length,
      cancel: 0 as const,
      net_issue: sortedNumbers.length
    };

    const bucketKey = String(config.doc_num);
    const bucket = groups.get(bucketKey);
    if (bucket) {
      bucket.docs.push(summary);
      continue;
    }

    groups.set(bucketKey, {
      doc_num: config.doc_num,
      doc_typ: config.doc_typ,
      docs: [summary]
    });
  }

  return {
    doc_det: Array.from(groups.values())
  };
}

export function buildMonthlyGSTR1(
  records: NormalizedSupplyRecord[],
  issues: DocumentIssueRecord[],
  options: GenerateGSTR1Options
): GSTR1Payload {
  return {
    gstin: options.gstin,
    fp: options.fp,
    version: GST_VERSION,
    hash: GST_HASH,
    b2b: aggregateB2B(records),
    b2cs: aggregateB2CS(records),
    hsn: aggregateHSN(records),
    supeco: aggregateSupeco(records),
    doc_issue: aggregateDocumentIssues(issues)
  };
}
