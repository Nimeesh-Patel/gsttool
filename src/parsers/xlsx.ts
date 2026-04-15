import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: false,
  trimValues: false,
  processEntities: false
});

interface WorkbookSheet {
  "@_name": string;
  "@_r:id": string;
}

interface Relationship {
  "@_Id": string;
  "@_Target": string;
}

interface Cell {
  "@_r": string;
  "@_t"?: string;
  v?: string | number;
  is?: {
    t?: string;
  };
}

interface Row {
  c?: Cell | Cell[];
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function getZipText(zip: AdmZip, name: string): string {
  const entry = zip.getEntry(name);
  if (!entry) {
    throw new Error(`Missing workbook entry: ${name}`);
  }

  return zip.readAsText(entry);
}

function columnIndex(cellRef: string): number {
  const letters = cellRef.match(/^[A-Z]+/)?.[0] ?? "";
  let index = 0;
  for (const character of letters) {
    index = index * 26 + character.charCodeAt(0) - 64;
  }

  return index - 1;
}

function readSharedStrings(zip: AdmZip): string[] {
  const entry = zip.getEntry("xl/sharedStrings.xml");
  if (!entry) {
    return [];
  }

  const xml = parser.parse(zip.readAsText(entry));
  const items = asArray(xml.sst?.si);

  return items.map((item) => {
    if (typeof item.t === "string") {
      return item.t;
    }

    return asArray(item.r)
      .map((run) => (typeof run.t === "string" ? run.t : ""))
      .join("");
  });
}

function readSheetTargetByName(zip: AdmZip, sheetName: string): string {
  const workbook = parser.parse(getZipText(zip, "xl/workbook.xml"));
  const rels = parser.parse(getZipText(zip, "xl/_rels/workbook.xml.rels"));
  const sheets = asArray<WorkbookSheet>(workbook.workbook?.sheets?.sheet);
  const relationships = asArray<Relationship>(rels.Relationships?.Relationship);
  const relationshipById = new Map(
    relationships.map((relationship) => [relationship["@_Id"], relationship["@_Target"]])
  );

  const targetSheet = sheets.find((sheet) => sheet["@_name"] === sheetName);
  if (!targetSheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  const target = relationshipById.get(targetSheet["@_r:id"]);
  if (!target) {
    throw new Error(`Sheet target not found: ${sheetName}`);
  }

  return `xl/${target.replace(/^\/+/, "")}`;
}

function readCellValue(cell: Cell, sharedStrings: string[]): string {
  const decodeValue = (value: string): string =>
    value
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

  if (cell["@_t"] === "s") {
    const sharedIndex = Number(cell.v ?? 0);
    return decodeValue(sharedStrings[sharedIndex] ?? "");
  }

  if (cell["@_t"] === "inlineStr") {
    return cell.is?.t === undefined ? "" : decodeValue(String(cell.is.t));
  }

  return cell.v === undefined ? "" : decodeValue(String(cell.v));
}

function readSheetRows(zip: AdmZip, sheetTarget: string, sharedStrings: string[]): string[][] {
  const worksheet = parser.parse(getZipText(zip, sheetTarget));
  const rows = asArray<Row>(worksheet.worksheet?.sheetData?.row);

  return rows.map((row) => {
    const cells = asArray<Cell>(row.c);
    const values: string[] = [];

    for (const cell of cells) {
      const index = columnIndex(cell["@_r"]);
      while (values.length <= index) {
        values.push("");
      }
      values[index] = readCellValue(cell, sharedStrings);
    }

    return values;
  });
}

export function readXlsxObjects(buffer: Buffer, sheetName: string): Record<string, string>[] {
  const zip = new AdmZip(buffer);
  const sharedStrings = readSharedStrings(zip);
  const sheetTarget = readSheetTargetByName(zip, sheetName);
  const rows = readSheetRows(zip, sheetTarget, sharedStrings).filter((row) =>
    row.some((value) => value !== "")
  );

  if (rows.length === 0) {
    return [];
  }

  const [header, ...dataRows] = rows;
  return dataRows.map((row) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      if (key) {
        record[key] = row[index] ?? "";
      }
    });
    return record;
  });
}
