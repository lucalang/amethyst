import { syntaxTree } from "@codemirror/language";
import { EditorSelection, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import {
  addColumn,
  addRow,
  columnAt,
  deleteColumn,
  deleteRow,
  emptyTable,
  layoutTable,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  parseTable,
  splitRow,
  unescapeCell,
  type Align,
  type TableModel,
} from "./markdown-tables";

// GFM tables in the editor. The document stays Markdown text: a table the caret isn't in shows as a real HTML table
// (click a cell to edit it); with the caret inside it shows as aligned, editable text. Tab / Shift-Tab / Enter move
// between cells, and the commands below add or remove rows and columns.

export type TableRange = { from: number; to: number; startLine: number; endLine: number };

/** The document's top-level tables, as whole-line ranges. (Tables inside quotes or lists stay plain text.) */
export function findTables(state: EditorState): TableRange[] {
  const tables: TableRange[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Table") return node.name === "Document";
      if (node.node.parent?.name === "Document") {
        const first = state.doc.lineAt(node.from);
        const last = state.doc.lineAt(node.to);
        tables.push({ from: first.from, to: last.to, startLine: first.number, endLine: last.number });
      }
      return false;
    },
  });
  return tables;
}

const touches = (state: EditorState, table: { from: number; to: number }) => state.selection.ranges.some((range) => range.from <= table.to && range.to >= table.from);

/** Whether the table at this range shows as an HTML table (the caret is somewhere else). */
export function isRenderedTable(state: EditorState, from: number, to: number) {
  const first = state.doc.lineAt(from).from;
  const last = state.doc.lineAt(to).to;
  return !touches(state, { from: first, to: last }) && parseTable(linesOf(state, state.doc.lineAt(from).number, state.doc.lineAt(to).number)) !== null;
}

const linesOf = (state: EditorState, startLine: number, endLine: number) => Array.from({ length: endLine - startLine + 1 }, (_, index) => state.doc.line(startLine + index).text);

/* ------------------------------------------------------------------------------------------- Rendering */

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(~~[^~]+~~)|(\*[^*\s][^*]*\*)|(\[[^\]]*\]\([^)\s]*\))|\\([|\\`*_~[\]])/g;

/** A cell's text with the inline Markdown that matters in tables (code, bold, italic, strike, links). */
function appendInline(parent: HTMLElement, text: string) {
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) parent.append(text.slice(last, index));
    const [token, code, strong, strike, emphasis, link, escaped] = match;
    if (code) {
      const element = document.createElement("code");
      element.textContent = code.slice(1, -1);
      parent.append(element);
    } else if (strong) {
      const element = document.createElement("strong");
      appendInline(element, strong.slice(2, -2));
      parent.append(element);
    } else if (strike) {
      const element = document.createElement("s");
      appendInline(element, strike.slice(2, -2));
      parent.append(element);
    } else if (emphasis) {
      const element = document.createElement("em");
      appendInline(element, emphasis.slice(1, -1));
      parent.append(element);
    } else if (link) {
      const [, label, url] = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(link) ?? [];
      if (/^(https?:\/\/|mailto:)/i.test(url ?? "")) {
        const element = document.createElement("a");
        element.href = url;
        element.target = "_blank";
        element.rel = "noopener noreferrer";
        element.textContent = label || url;
        parent.append(element);
      } else {
        parent.append(token);
      }
    } else if (escaped) {
      parent.append(escaped);
    }
    last = index + token.length;
  }
  if (last < text.length) parent.append(text.slice(last));
}

type CellPositions = number[][];

class TableWidget extends WidgetType {
  private readonly key: string;
  constructor(
    readonly model: TableModel,
    /** Where each cell's text starts in the document: [row][column], row 0 being the header. */
    readonly positions: CellPositions,
  ) {
    super();
    this.key = JSON.stringify([model, positions]);
  }
  eq(other: TableWidget) {
    return other.key === this.key;
  }
  get estimatedHeight() {
    return (this.model.body.length + 1) * 34 + 16;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-md-table-wrap";
    const table = document.createElement("table");
    table.className = "cm-md-table";
    const fill = (cell: HTMLTableCellElement, text: string, align: Align) => {
      if (align !== "none") cell.style.textAlign = align;
      appendInline(cell, text);
    };
    const head = table.createTHead().insertRow();
    this.model.header.forEach((text, column) => {
      const cell = document.createElement("th");
      cell.dataset.pos = String(this.positions[0][column]);
      fill(cell, unescapeCell(text), this.model.align[column]);
      head.append(cell);
    });
    const body = table.createTBody();
    this.model.body.forEach((row, index) => {
      const tr = body.insertRow();
      row.forEach((text, column) => {
        const cell = tr.insertCell();
        cell.dataset.pos = String(this.positions[index + 1][column]);
        fill(cell, unescapeCell(text), this.model.align[column]);
      });
    });
    // Clicking a cell opens the table for editing with the caret in that cell (links keep opening).
    table.addEventListener("mousedown", (event) => {
      const target = event.target as HTMLElement;
      if (event.button !== 0 || target.closest("a")) return;
      const cell = target.closest<HTMLElement>("th, td");
      const pos = Number(cell?.dataset.pos);
      event.preventDefault();
      if (!Number.isFinite(pos)) return;
      view.dispatch({ selection: EditorSelection.cursor(Math.min(pos, view.state.doc.length)), scrollIntoView: true });
      view.focus();
    });
    wrap.append(table);
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

function widgetFor(state: EditorState, table: TableRange): TableWidget | null {
  const lines = linesOf(state, table.startLine, table.endLine);
  const model = parseTable(lines);
  if (!model) return null;
  const columns = model.align.length;
  const positions: CellPositions = [];
  lines.forEach((text, index) => {
    if (index === 1) return;
    const line = state.doc.line(table.startLine + index);
    const cells = splitRow(text);
    positions.push(Array.from({ length: columns }, (_, column) => (cells[column] ? line.from + cells[column].from : line.to)));
  });
  return new TableWidget(model, positions);
}

const PIPE = Decoration.mark({ class: "cm-md-table-pipe" });
const LINE = Decoration.line({ class: "cm-md-table-line" });
const HEAD_LINE = Decoration.line({ class: "cm-md-table-line cm-md-table-head" });
const SEPARATOR_LINE = Decoration.line({ class: "cm-md-table-line cm-md-table-sep" });

function build(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  for (const table of findTables(state)) {
    if (!touches(state, table)) {
      const widget = widgetFor(state, table);
      if (widget) {
        decorations.push(Decoration.replace({ widget, block: true }).range(table.from, table.to));
        continue;
      }
    }
    for (let number = table.startLine; number <= table.endLine; number += 1) {
      const line = state.doc.line(number);
      decorations.push((number === table.startLine ? HEAD_LINE : number === table.startLine + 1 ? SEPARATOR_LINE : LINE).range(line.from));
      for (let i = 0; i < line.text.length; i += 1) {
        if (line.text[i] === "\\") i += 1;
        else if (line.text[i] === "|") decorations.push(PIPE.range(line.from + i, line.from + i + 1));
      }
    }
  }
  return Decoration.set(decorations, true);
}

export const liveTables = StateField.define<DecorationSet>({
  create: build,
  update(value, transaction) {
    if (transaction.docChanged || transaction.selection || syntaxTree(transaction.state) !== syntaxTree(transaction.startState)) return build(transaction.state);
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/* ------------------------------------------------------------------------------------------- Editing */

type Context = { table: TableRange; model: TableModel; /** 0 = header, then body rows. */ row: number; column: number };

function contextAt(state: EditorState): Context | null {
  const head = state.selection.main.head;
  const table = findTables(state).find((candidate) => head >= candidate.from && head <= candidate.to);
  if (!table) return null;
  const model = parseTable(linesOf(state, table.startLine, table.endLine));
  if (!model) return null;
  const line = state.doc.lineAt(head);
  const lineIndex = line.number - table.startLine;
  return { table, model, row: lineIndex <= 1 ? 0 : lineIndex - 1, column: columnAt(line.text, head - line.from, model.align.length) };
}

export const inTable = (state: EditorState) => contextAt(state) !== null;

/** Rewrites the table as aligned text and puts the caret in a cell (its text selected so typing replaces it). */
function apply(view: EditorView, context: Context, model: TableModel, row: number, column: number) {
  const { lines, cells } = layoutTable(model);
  const at = cells[Math.min(row, cells.length - 1)][Math.min(column, model.align.length - 1)];
  const text = lines.join("\n");
  view.dispatch({
    changes: { from: context.table.from, to: context.table.to, insert: text },
    selection: at.from === at.to ? EditorSelection.cursor(context.table.from + at.from) : EditorSelection.range(context.table.from + at.from, context.table.from + at.to),
    userEvent: "input.format",
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

/** Inserts a table of `rows` rows (including the header) and `columns` columns at the caret, on its own lines. */
export function insertTable(view: EditorView, rows: number, columns: number): boolean {
  const { state } = view;
  const model = emptyTable(Math.min(rows, MAX_TABLE_ROWS), Math.min(columns, MAX_TABLE_COLUMNS));
  const { lines, cells } = layoutTable(model);
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const filled = line.text.trim() !== "";
  const nextFilled = line.number < state.doc.lines && state.doc.line(line.number + 1).text.trim() !== "";
  const previousFilled = line.number > 1 && state.doc.line(line.number - 1).text.trim() !== "";
  const at = filled ? line.to : line.from;
  const prefix = filled ? "\n\n" : previousFilled ? "\n" : "";
  // The table needs a blank line after it, or the next line would read as one more row.
  const suffix = nextFilled ? "\n" : "";
  const first = cells[0][0];
  view.dispatch({
    changes: { from: at, to: filled ? at : line.to, insert: `${prefix}${lines.join("\n")}${suffix}` },
    selection: EditorSelection.range(at + prefix.length + first.from, at + prefix.length + first.to),
    userEvent: "input.format",
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

/** Tab / Shift-Tab: the next or previous cell; Tab in the last cell adds a row. False outside a table. */
export function tableTab(view: EditorView, backward: boolean): boolean {
  const context = contextAt(view.state);
  if (!context) return false;
  const { model, row, column } = context;
  const columns = model.align.length;
  if (backward) {
    if (column > 0) return apply(view, context, model, row, column - 1);
    if (row > 0) return apply(view, context, model, row - 1, columns - 1);
    return apply(view, context, model, 0, 0);
  }
  if (column < columns - 1) return apply(view, context, model, row, column + 1);
  if (row < model.body.length) return apply(view, context, model, row + 1, 0);
  return model.body.length >= MAX_TABLE_ROWS ? apply(view, context, model, row, column) : apply(view, context, addRow(model, model.body.length), row + 1, 0);
}

/** Enter: the same column one row down (a new row after the last). False outside a table. */
export function tableEnter(view: EditorView): boolean {
  const context = contextAt(view.state);
  if (!context) return false;
  const { model, row, column } = context;
  if (row < model.body.length) return apply(view, context, model, row + 1, column);
  return model.body.length >= MAX_TABLE_ROWS ? apply(view, context, model, row, column) : apply(view, context, addRow(model, model.body.length), row + 1, column);
}

export function tableAddRow(view: EditorView, below: boolean): boolean {
  const context = contextAt(view.state);
  if (!context || context.model.body.length >= MAX_TABLE_ROWS) return false;
  const { model, row, column } = context;
  // Above the header isn't possible: a row "above" it goes first in the body.
  const index = below ? row : Math.max(row - 1, 0);
  return apply(view, context, addRow(model, index), index + 1, column);
}

export function tableAddColumn(view: EditorView, right: boolean): boolean {
  const context = contextAt(view.state);
  if (!context || context.model.align.length >= MAX_TABLE_COLUMNS) return false;
  const { model, row, column } = context;
  const index = right ? column + 1 : column;
  return apply(view, context, addColumn(model, index), row, index);
}

export function tableDeleteRow(view: EditorView): boolean {
  const context = contextAt(view.state);
  if (!context || context.row === 0 || context.model.body.length <= 1) return false;
  const next = deleteRow(context.model, context.row - 1);
  return apply(view, context, next, Math.min(context.row, next.body.length), context.column);
}

export function tableDeleteColumn(view: EditorView): boolean {
  const context = contextAt(view.state);
  if (!context || context.model.align.length <= 1) return false;
  const next = deleteColumn(context.model, context.column);
  return apply(view, context, next, context.row, Math.min(context.column, next.align.length - 1));
}

export function deleteTable(view: EditorView): boolean {
  const context = contextAt(view.state);
  if (!context) return false;
  const { doc } = view.state;
  // Take one of the line breaks with it so no gap is left behind.
  const from = context.table.from > 0 ? context.table.from - 1 : context.table.from;
  const to = context.table.from > 0 ? context.table.to : Math.min(context.table.to + 1, doc.length);
  view.dispatch({ changes: { from, to }, selection: EditorSelection.cursor(from), userEvent: "delete" });
  view.focus();
  return true;
}
