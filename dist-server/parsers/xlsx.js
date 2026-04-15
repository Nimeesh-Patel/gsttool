"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readXlsxObjects = readXlsxObjects;
const adm_zip_1 = __importDefault(require("adm-zip"));
const fast_xml_parser_1 = require("fast-xml-parser");
const parser = new fast_xml_parser_1.XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    preserveOrder: false,
    trimValues: false,
    processEntities: false
});
function asArray(value) {
    if (!value) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}
function getZipText(zip, name) {
    const entry = zip.getEntry(name);
    if (!entry) {
        throw new Error(`Missing workbook entry: ${name}`);
    }
    return zip.readAsText(entry);
}
function columnIndex(cellRef) {
    const letters = cellRef.match(/^[A-Z]+/)?.[0] ?? "";
    let index = 0;
    for (const character of letters) {
        index = index * 26 + character.charCodeAt(0) - 64;
    }
    return index - 1;
}
function readSharedStrings(zip) {
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
function readSheetTargetByName(zip, sheetName) {
    const workbook = parser.parse(getZipText(zip, "xl/workbook.xml"));
    const rels = parser.parse(getZipText(zip, "xl/_rels/workbook.xml.rels"));
    const sheets = asArray(workbook.workbook?.sheets?.sheet);
    const relationships = asArray(rels.Relationships?.Relationship);
    const relationshipById = new Map(relationships.map((relationship) => [relationship["@_Id"], relationship["@_Target"]]));
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
function readCellValue(cell, sharedStrings) {
    const decodeValue = (value) => value
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
function readSheetRows(zip, sheetTarget, sharedStrings) {
    const worksheet = parser.parse(getZipText(zip, sheetTarget));
    const rows = asArray(worksheet.worksheet?.sheetData?.row);
    return rows.map((row) => {
        const cells = asArray(row.c);
        const values = [];
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
function readXlsxObjects(buffer, sheetName) {
    const zip = new adm_zip_1.default(buffer);
    const sharedStrings = readSharedStrings(zip);
    const sheetTarget = readSheetTargetByName(zip, sheetName);
    const rows = readSheetRows(zip, sheetTarget, sharedStrings).filter((row) => row.some((value) => value !== ""));
    if (rows.length === 0) {
        return [];
    }
    const [header, ...dataRows] = rows;
    return dataRows.map((row) => {
        const record = {};
        header.forEach((key, index) => {
            if (key) {
                record[key] = row[index] ?? "";
            }
        });
        return record;
    });
}
