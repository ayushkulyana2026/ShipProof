import Papa from "papaparse";
import { cell } from "./values";

/** A parsed spreadsheet: one header row plus data rows, everything as strings. */
export type RawTable = {
  fileName: string;
  headers: string[];
  rows: string[][];
  /** 1-based spreadsheet row number of each entry in `rows` (for error messages). */
  rowNumbers: number[];
  /** Rows dropped because every cell was empty. */
  blankRows: number;
};

export const MAX_ROWS = 100_000;

function finalize(fileName: string, matrix: unknown[][]): RawTable {
  // First non-empty row is the header (some exports have a title row above it).
  let start = 0;
  while (start < matrix.length && (matrix[start] ?? []).every((c) => cell(c) === "")) start++;
  const headerRow = matrix[start] ?? [];
  const headers = headerRow.map((h, i) => cell(h) || `Column ${i + 1}`);
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  let blankRows = 0;
  matrix.slice(start + 1).forEach((r, i) => {
    const row = headers.map((_, c) => cell(r[c]));
    if (row.every((c) => c === "")) {
      blankRows++;
      return;
    }
    rows.push(row);
    rowNumbers.push(start + i + 2);
  });
  if (rows.length > MAX_ROWS) throw new Error(`File has ${rows.length} rows; the limit is ${MAX_ROWS}.`);
  return { fileName, headers, rows, rowNumbers, blankRows };
}

/** Parse CSV text. Every value stays a string so AWBs keep leading zeros. */
export function readCsvText(text: string, fileName = "upload.csv"): RawTable {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: false, dynamicTyping: false });
  const fatal = parsed.errors.find((e) => e.type === "Delimiter" && parsed.data.length === 0);
  if (fatal) throw new Error(`Could not read ${fileName}: ${fatal.message}`);
  return finalize(fileName, parsed.data);
}

/** Convert an Excel cell value to text without losing digits. */
function excelCell(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return cell(v);
}

/** Parse the first sheet of an .xlsx/.xls workbook. */
export async function readExcel(data: ArrayBuffer, fileName: string): Promise<RawTable> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error(`${fileName} has no sheets.`);
  const ws = wb.Sheets[sheetName]!;
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "", blankrows: true });
  return finalize(fileName, matrix.map((r) => r.map(excelCell)));
}

export function isExcel(fileName: string): boolean {
  return /\.(xlsx|xlsm|xls)$/i.test(fileName);
}

/** Read a browser File (CSV or Excel). Runs entirely client-side. */
export async function readFile(file: File): Promise<RawTable> {
  if (isExcel(file.name)) return readExcel(await file.arrayBuffer(), file.name);
  if (!/\.(csv|txt|tsv)$/i.test(file.name) && file.type && !/csv|text|excel/.test(file.type)) {
    throw new Error(`${file.name}: please upload a CSV or Excel (.xlsx) file.`);
  }
  return readCsvText(await file.text(), file.name);
}
