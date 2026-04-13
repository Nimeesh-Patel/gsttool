import Decimal from "decimal.js";
import { Transaction } from "../parsers/amazon";
import {
  DEFAULT_SELLER_STATE,
  getSupplyType,
  GSTStateCode,
  SupplyType,
  toGSTStateCode
} from "../utils/stateCodes";

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

function round2(value: Decimal): number {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function aggregateB2CS(
  transactions: Transaction[],
  options: AggregateB2CSOptions = {}
): B2CSItem[] {
  const sellerState = options.sellerState ?? DEFAULT_SELLER_STATE;
  const grouped = new Map<
    string,
    {
      pos: GSTStateCode;
      sply_ty: SupplyType;
      rt: number;
      txval: Decimal;
      taxAmount: Decimal;
    }
  >();

  for (const transaction of transactions) {
    const pos = toGSTStateCode(transaction.shipState);
    const rt = round2(transaction.taxRate);
    const sply_ty = transaction.supplyType ?? getSupplyType(pos, sellerState);
    const key = `${pos}|${rt}|${sply_ty}`;
    const current = grouped.get(key);

    if (current) {
      current.txval = current.txval.plus(transaction.taxableValue);
      current.taxAmount = current.taxAmount.plus(transaction.taxAmount);
      continue;
    }

    grouped.set(key, {
      pos,
      sply_ty,
      rt,
      txval: new Decimal(transaction.taxableValue),
      taxAmount: new Decimal(transaction.taxAmount)
    });
  }

  return Array.from(grouped.values())
    .map((item) => {
      const row: B2CSItem = {
        sply_ty: item.sply_ty,
        rt: item.rt,
        typ: "OE",
        pos: item.pos,
        txval: round2(item.txval),
        csamt: 0
      };

      if (item.sply_ty === "INTER") {
        row.iamt = round2(item.taxAmount);
      } else {
        const halfTax = item.taxAmount.div(2);
        row.camt = round2(halfTax);
        row.samt = round2(halfTax);
      }

      return row;
    })
    .sort((left, right) => {
      if (left.pos !== right.pos) {
        return left.pos.localeCompare(right.pos);
      }

      if (left.rt !== right.rt) {
        return left.rt - right.rt;
      }

      return left.sply_ty.localeCompare(right.sply_ty);
    });
}

export function buildGSTR1(
  b2cs: B2CSItem[],
  options: BuildGSTR1Options
): GSTR1Payload {
  return {
    gstin: options.gstin,
    fp: options.fp,
    b2cs
  };
}
