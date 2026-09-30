import { redo, undo } from "@codemirror/commands";
import { EditorSelection, type ChangeSpec, type EditorState, type Line } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

// Formatting commands edit the Markdown text directly (never HTML).

const HEADING = /^(\s{0,3})(#{1,6})(?:[ \t]+|$)/;
const LIST_PREFIX = /^(\s*)(?:[-*+][ \t]+\[[ xX]\][ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)/;
const LIST_KIND = {
  bullet: /^\s*[-*+][ \t]+(?!\[[ xX]\][ \t])/,
  ordered: /^\s*\d+[.)][ \t]+/,
  task: /^\s*[-*+][ \t]+\[[ xX]\][ \t]+/,
};

export type ListKind = keyof typeof LIST_KIND;

function selectedLines(state: EditorState): Line[] {
  const seen = new Map<number, Line>();
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number;
    for (let number = state.doc.lineAt(range.from).number; number <= last; number++) {
      if (!seen.has(number)) seen.set(number, state.doc.line(number));
    }
  }
  const lines = [...seen.values()];
  const nonEmpty = lines.filter((line) => line.text.trim() !== "");
  return nonEmpty.length > 0 ? nonEmpty : lines;
}

/** Heading level (1-6) of the caret's line, or 0 for body text. */
export function headingLevelAt(state: EditorState): number {
  const match = HEADING.exec(state.doc.lineAt(state.selection.main.head).text);
  return match ? match[2].length : 0;
}

export function setHeading(view: EditorView, level: number): boolean {
  const { state } = view;
  const lines = selectedLines(state);
  const target = lines.every((line) => HEADING.exec(line.text)?.[2].length === level) ? 0 : level;
  const changes: ChangeSpec[] = lines.map((line) => {
    const match = HEADING.exec(line.text);
    const insert = target > 0 ? `${"#".repeat(target)} ` : "";
    return { from: line.from, to: line.from + (match ? match[0].length : 0), insert };
  });
  view.dispatch({ changes, userEvent: "input.format", scrollIntoView: true });
  view.focus();
  return true;
}

function wrappedAround(state: EditorState, from: number, to: number, marker: string): boolean {
  const len = marker.length;
  if (state.sliceDoc(from - len, from) !== marker || state.sliceDoc(to, to + len) !== marker) return false;
  // "*" next to "**" belongs to bold unless it is a bold-italic "***".
  if (marker === "*") {
    const outer = state.sliceDoc(from - 2, from - 1) === "*";
    const outerTriple = state.sliceDoc(from - 3, from) === "***";
    return !outer || outerTriple;
  }
  return true;
}

export function toggleInline(view: EditorView, marker: string): boolean {
  const { state } = view;
  const len = marker.length;
  const transaction = state.changeByRange((range) => {
    if (wrappedAround(state, range.from, range.to, marker)) {
      return {
        changes: [
          { from: range.from - len, to: range.from },
          { from: range.to, to: range.to + len },
        ],
        range: EditorSelection.range(range.from - len, range.to - len),
      };
    }
    const text = state.sliceDoc(range.from, range.to);
    if (!range.empty && text.length > len * 2 && text.startsWith(marker) && text.endsWith(marker)) {
      return {
        changes: [
          { from: range.from, to: range.from + len },
          { from: range.to - len, to: range.to },
        ],
        range: EditorSelection.range(range.from, range.to - len * 2),
      };
    }
    return {
      changes: [
        { from: range.from, insert: marker },
        { from: range.to, insert: marker },
      ],
      range: EditorSelection.range(range.from + len, range.to + len),
    };
  });
  view.dispatch(state.update(transaction, { userEvent: "input.format", scrollIntoView: true }));
  view.focus();
  return true;
}

export function insertLink(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  const text = state.sliceDoc(range.from, range.to);
  if (/^https?:\/\/\S+$/.test(text)) {
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: `[](${text})` },
      selection: EditorSelection.cursor(range.from + 1),
      userEvent: "input.format",
    });
  } else {
    const placeholder = "https://";
    const urlStart = range.from + text.length + 3;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: `[${text}](${placeholder})` },
      selection: text ? EditorSelection.range(urlStart, urlStart + placeholder.length) : EditorSelection.cursor(range.from + 1),
      userEvent: "input.format",
    });
  }
  view.focus();
  return true;
}

export function toggleList(view: EditorView, kind: ListKind): boolean {
  const { state } = view;
  const lines = selectedLines(state);
  const remove = lines.every((line) => LIST_KIND[kind].test(line.text));
  const changes: ChangeSpec[] = lines.map((line, index) => {
    const match = LIST_PREFIX.exec(line.text);
    const indent = match?.[1] ?? /^\s*/.exec(line.text)![0];
    const from = line.from + indent.length;
    const to = match ? line.from + match[0].length : from;
    const prefix = kind === "bullet" ? "- " : kind === "ordered" ? `${index + 1}. ` : "- [ ] ";
    return { from, to, insert: remove ? "" : prefix };
  });
  view.dispatch({ changes, userEvent: "input.format", scrollIntoView: true });
  view.focus();
  return true;
}

export function undoEdit(view: EditorView): boolean {
  const done = undo(view);
  view.focus();
  return done;
}

export function redoEdit(view: EditorView): boolean {
  const done = redo(view);
  view.focus();
  return done;
}
