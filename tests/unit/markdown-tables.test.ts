import { describe, expect, it } from "vitest";
import { addColumn, addRow, deleteColumn, deleteRow, emptyTable, isDelimiterRow, layoutTable, parseTable, splitRow } from "@/components/editor/markdown-tables";

describe("markdown tables", () => {
  it("splits rows with or without outer pipes and keeps escaped pipes", () => {
    expect(splitRow("| a | b |").map((cell) => cell.text)).toEqual(["a", "b"]);
    expect(splitRow("a | b").map((cell) => cell.text)).toEqual(["a", "b"]);
    expect(splitRow("| a \\| b | c |").map((cell) => cell.text)).toEqual(["a \\| b", "c"]);
    expect(splitRow("|  | x |").map((cell) => cell.text)).toEqual(["", "x"]);
    expect(splitRow("| a | |").map((cell) => cell.text)).toEqual(["a", ""]);
  });

  it("reports where each cell's text sits in the line", () => {
    const line = "| ab |  c |";
    for (const cell of splitRow(line)) expect(line.slice(cell.from, cell.to)).toBe(cell.text);
  });

  it("recognises delimiter rows", () => {
    expect(isDelimiterRow("| --- | :---: |")).toBe(true);
    expect(isDelimiterRow("|---|---:|")).toBe(true);
    expect(isDelimiterRow("| a | b |")).toBe(false);
  });

  it("parses and lays out an aligned table", () => {
    const model = parseTable(["| Name | Qty |", "| :--- | ---: |", "| Apple | 3 |", "| Fig |"])!;
    expect(model.align).toEqual(["left", "right"]);
    expect(model.body).toEqual([["Apple", "3"], ["Fig", ""]]);
    const { lines, cells } = layoutTable(model);
    expect(lines).toEqual(["| Name  | Qty |", "| :---- | --: |", "| Apple |   3 |", "| Fig   |     |"]);
    const text = lines.join("\n");
    expect(text.slice(cells[0][0].from, cells[0][0].to)).toBe("Name");
    expect(text.slice(cells[1][1].from, cells[1][1].to)).toBe("3");
    expect(cells[2][1].from).toBe(cells[2][1].to);
  });

  it("rejects text that isn't a table", () => {
    expect(parseTable(["| a | b |", "| c | d |"])).toBeNull();
    expect(parseTable(["| a | b |", "| --- |"])).toBeNull();
  });

  it("builds and edits tables", () => {
    const model = emptyTable(3, 2);
    expect(model.header).toEqual(["Column 1", "Column 2"]);
    expect(model.body).toHaveLength(2);
    expect(addRow(model, 1).body).toHaveLength(3);
    expect(deleteRow(addRow(model, 0), 0).body).toHaveLength(2);
    expect(deleteRow({ ...model, body: [["", ""]] }, 0).body).toHaveLength(1);
    const wider = addColumn(model, 1);
    expect(wider.header).toHaveLength(3);
    expect(wider.body.every((row) => row.length === 3)).toBe(true);
    expect(deleteColumn(wider, 0).align).toHaveLength(2);
    expect(deleteColumn(emptyTable(2, 1), 0).align).toHaveLength(1);
    // The laid out table reads back as the same table.
    expect(parseTable(layoutTable(wider).lines)).toEqual(wider);
  });
});
