import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { deleteTable, findTables, inTable, insertTable, tableAddColumn, tableAddRow, tableDeleteColumn, tableDeleteRow, tableEnter, tableTab } from "@/components/editor/live-tables";

/** The smallest stand-in for an EditorView the commands need: state, dispatch and focus. */
function editor(doc: string, head = 0) {
  const fake = {
    state: EditorState.create({ doc, selection: { anchor: head }, extensions: [markdown({ base: markdownLanguage })] }),
    dispatch(spec: TransactionSpec) {
      fake.state = fake.state.update(spec).state;
      ensureSyntaxTree(fake.state, fake.state.doc.length, 1000);
    },
    focus() {},
  };
  ensureSyntaxTree(fake.state, fake.state.doc.length, 1000);
  return { view: fake as unknown as EditorView, fake };
}
const text = (e: ReturnType<typeof editor>) => e.fake.state.doc.toString();
const selected = (e: ReturnType<typeof editor>) => e.fake.state.sliceDoc(e.fake.state.selection.main.from, e.fake.state.selection.main.to);

const TABLE = "| A | B |\n| --- | --- |\n| 1 | 2 |";

describe("tables in the editor", () => {
  it("finds top-level tables only", () => {
    const e = editor(`intro\n\n${TABLE}\n\n> | x | y |\n> | - | - |\n> | 1 | 2 |\n`);
    const tables = findTables(e.fake.state);
    expect(tables).toHaveLength(1);
    expect(e.fake.state.sliceDoc(tables[0].from, tables[0].to)).toBe(TABLE);
  });

  it("inserts a table on its own lines with the first header selected", () => {
    const e = editor("hello\nnext", 5);
    insertTable(e.view, 3, 2);
    expect(text(e)).toBe("hello\n\n| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |\n|          |          |\nnext".replace("next", "\nnext"));
    expect(selected(e)).toBe("Column 1");
    expect(findTables(e.fake.state)).toHaveLength(1);
    expect(inTable(e.fake.state)).toBe(true);
  });

  it("inserts into an empty document", () => {
    const e = editor("");
    insertTable(e.view, 2, 3);
    expect(findTables(e.fake.state)).toHaveLength(1);
    expect(text(e).split("\n")).toHaveLength(3);
  });

  it("moves between cells with Tab, formatting as it goes, and adds a row at the end", () => {
    const e = editor(TABLE, 2);
    expect(tableTab(e.view, false)).toBe(true);
    expect(text(e).split("\n")[0]).toBe("| A   | B   |");
    expect(selected(e)).toBe("B");
    tableTab(e.view, false);
    expect(selected(e)).toBe("1");
    tableTab(e.view, false);
    expect(selected(e)).toBe("2");
    tableTab(e.view, false);
    expect(text(e).split("\n")).toHaveLength(4);
    expect(e.fake.state.selection.main.empty).toBe(true);
    tableTab(e.view, true);
    expect(selected(e)).toBe("2");
  });

  it("leaves Tab and Enter alone outside a table", () => {
    const e = editor(`${TABLE}\n\nplain`, text(editor(`${TABLE}\n\nplain`)).length - 1);
    expect(tableTab(e.view, false)).toBe(false);
    expect(tableEnter(e.view)).toBe(false);
  });

  it("Enter goes to the same column of the next row, adding one after the last", () => {
    const e = editor(TABLE, 2);
    tableEnter(e.view);
    expect(selected(e)).toBe("1");
    tableEnter(e.view);
    expect(text(e).split("\n")).toHaveLength(4);
  });

  it("adds and deletes rows and columns", () => {
    const e = editor(TABLE, 2);
    tableAddRow(e.view, true);
    expect(text(e).split("\n")).toHaveLength(4);
    tableAddColumn(e.view, true);
    expect(text(e).split("\n")[0].match(/\|/g)).toHaveLength(4);
    tableDeleteColumn(e.view);
    expect(text(e).split("\n")[0].match(/\|/g)).toHaveLength(3);
    // The caret is in the new body row: it can go, and the last body row can't.
    expect(tableDeleteRow(e.view)).toBe(true);
    expect(text(e).split("\n")).toHaveLength(3);
    expect(tableDeleteRow(e.view)).toBe(false);
    // The header row can't be deleted either.
    const header = editor(`${TABLE}\n| 3 | 4 |`, 2);
    expect(tableDeleteRow(header.view)).toBe(false);
  });

  it("deletes a whole table without leaving a gap", () => {
    const e = editor(`before\n\n${TABLE}\n\nafter`, 12);
    expect(inTable(e.fake.state)).toBe(true);
    deleteTable(e.view);
    expect(text(e)).toBe("before\n\n\nafter");
  });
});
