// GitHub-flavoured Markdown tables as plain text: parsing a row, laying a table out with aligned columns, and the
// row / column edits the editor offers. Pure functions (no editor state), so they are easy to test.

export type Align = "left" | "center" | "right" | "none";

/** A table's cells; every row has exactly `align.length` cells. */
export type TableModel = { header: string[]; align: Align[]; body: string[][] };

export type Cell = { text: string; /** Offsets of the trimmed text within the line. */ from: number; to: number };

/** Positions of the unescaped pipes of a row. */
function pipePositions(line: string): number[] {
  const positions: number[] = [];
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === "\\") i += 1;
    else if (line[i] === "|") positions.push(i);
  }
  return positions;
}

/** The cells of one row. Leading and trailing pipes are optional; `\|` stays inside its cell. */
export function splitRow(line: string): Cell[] {
  const start = line.search(/\S/);
  if (start < 0) return [];
  const end = line.trimEnd().length;
  const pipes = pipePositions(line);
  const segments: [number, number][] = [];
  let from = start;
  for (const pipe of pipes) {
    segments.push([from, pipe]);
    from = pipe + 1;
  }
  segments.push([from, end]);
  // A pipe that opens or closes the row only frames it.
  if (pipes[0] === start) segments.shift();
  if (pipes.length > 0 && pipes[pipes.length - 1] === end - 1) segments.pop();
  return segments.map(([a, b]) => {
    const raw = line.slice(a, b);
    const text = raw.trim();
    const lead = raw.length - raw.trimStart().length;
    const at = a + (text ? lead : Math.min(1, raw.length));
    return { text, from: at, to: at + text.length };
  });
}

/** The column the caret (an offset within the line) is in. */
export function columnAt(line: string, offset: number, columns: number): number {
  const pipes = pipePositions(line);
  const framed = pipes.length > 0 && pipes[0] === line.search(/\S/) ? 1 : 0;
  const before = pipes.filter((pipe) => pipe < offset).length;
  return Math.min(Math.max(before - framed, 0), Math.max(columns - 1, 0));
}

/** Whether a line is a table's delimiter row (`| --- | :---: |`). */
export function isDelimiterRow(line: string): boolean {
  if (!line.includes("-")) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.text));
}

export function alignOf(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  return left && right ? "center" : right ? "right" : left ? "left" : "none";
}

/** Reads a table from its lines (header, delimiter, then body rows); null when it isn't one. */
export function parseTable(lines: readonly string[]): TableModel | null {
  if (lines.length < 2 || !isDelimiterRow(lines[1])) return null;
  const header = splitRow(lines[0]).map((cell) => cell.text);
  const align = splitRow(lines[1]).map((cell) => alignOf(cell.text));
  if (header.length === 0 || header.length !== align.length) return null;
  const body = lines.slice(2).map((line) => {
    const cells = splitRow(line).map((cell) => cell.text);
    return Array.from({ length: header.length }, (_, column) => cells[column] ?? "");
  });
  return { header, align, body };
}

const MIN_WIDTH = 3;

const pad = (text: string, width: number, align: Align) => {
  const gap = Math.max(0, width - text.length);
  if (align === "right") return " ".repeat(gap) + text;
  if (align === "center") return " ".repeat(Math.floor(gap / 2)) + text + " ".repeat(Math.ceil(gap / 2));
  return text + " ".repeat(gap);
};

const delimiterOf = (align: Align, width: number) =>
  align === "center" ? `:${"-".repeat(width - 2)}:` : align === "right" ? `${"-".repeat(width - 1)}:` : align === "left" ? `:${"-".repeat(width - 1)}` : "-".repeat(width);

export type TableLayout = {
  lines: string[];
  /** Where each cell's text starts and ends in `lines.join("\n")`, row 0 being the header and body rows following. */
  cells: { from: number; to: number }[][];
};

/** The table as aligned text, with the position of every cell (for placing the caret). */
export function layoutTable(model: TableModel): TableLayout {
  const widths = model.header.map((text, column) =>
    Math.max(MIN_WIDTH, text.length, ...model.body.map((row) => (row[column] ?? "").length)),
  );
  const rows = [model.header, ...model.body];
  const lines: string[] = [];
  const cells: { from: number; to: number }[][] = [];
  let offset = 0;
  const place = (line: string, positions?: { from: number; to: number }[]) => {
    lines.push(line);
    if (positions) cells.push(positions);
    offset += line.length + 1;
  };
  rows.forEach((row, index) => {
    const positions: { from: number; to: number }[] = [];
    let line = "|";
    row.forEach((text, column) => {
      const padded = pad(text, widths[column], model.align[column]);
      const lead = padded.length - padded.trimStart().length;
      const start = offset + line.length + 1; // after "| "
      positions.push({ from: start + (text ? lead : 0), to: start + (text ? lead : 0) + text.length });
      line += ` ${padded} |`;
    });
    place(line, positions);
    if (index === 0) place(`| ${model.align.map((align, column) => delimiterOf(align, widths[column])).join(" | ")} |`);
  });
  return { lines, cells };
}

/** A new table: a header of "Column n" cells and empty body rows. */
export function emptyTable(rows: number, columns: number): TableModel {
  const total = Math.max(1, columns);
  return {
    header: Array.from({ length: total }, (_, column) => `Column ${column + 1}`),
    align: Array.from({ length: total }, () => "none" as Align),
    body: Array.from({ length: Math.max(1, rows - 1) }, () => Array.from({ length: total }, () => "")),
  };
}

export const MAX_TABLE_ROWS = 50;
export const MAX_TABLE_COLUMNS = 12;

/** Row 0 is the header; body rows follow. */
export function addRow(model: TableModel, at: number): TableModel {
  const blank = Array.from({ length: model.align.length }, () => "");
  const body = [...model.body];
  body.splice(Math.min(Math.max(at, 0), body.length), 0, blank);
  return { ...model, body };
}

export function deleteRow(model: TableModel, bodyIndex: number): TableModel {
  if (model.body.length <= 1) return model;
  return { ...model, body: model.body.filter((_, index) => index !== bodyIndex) };
}

export function addColumn(model: TableModel, at: number): TableModel {
  const index = Math.min(Math.max(at, 0), model.align.length);
  const insert = <T,>(list: readonly T[], value: T) => [...list.slice(0, index), value, ...list.slice(index)];
  return {
    header: insert(model.header, `Column ${model.header.length + 1}`),
    align: insert(model.align, "none" as Align),
    body: model.body.map((row) => insert(row, "")),
  };
}

export function deleteColumn(model: TableModel, column: number): TableModel {
  if (model.align.length <= 1) return model;
  const drop = <T,>(list: readonly T[]) => list.filter((_, index) => index !== column);
  return { header: drop(model.header), align: drop(model.align), body: model.body.map(drop) };
}

/** The text of a cell as it should display: `\|` shows as `|`. */
export const unescapeCell = (text: string) => text.replace(/\\\|/g, "|");
