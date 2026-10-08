import { syntaxTree } from "@codemirror/language";
import { isolateHistory } from "@codemirror/commands";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { findImageEmbeds, resolveImageSrc } from "@/lib/attachments";

// Obsidian-style live preview: Markdown stays the document; decorations style
// it in place and hide syntax markers except on the lines holding the caret.

const hidden = Decoration.replace({});
const mark = (className: string) => Decoration.mark({ class: className });
const SYNTAX = mark("cm-md-mark");
const STRONG = mark("cm-md-strong");
const EMPHASIS = mark("cm-md-em");
const STRIKE = mark("cm-md-strike");
const CODE = mark("cm-md-code");
const LINK_TEXT = mark("cm-md-link");
const URL_TEXT = mark("cm-md-url");
const LIST_MARK = mark("cm-md-list-mark");
const RULE = mark("cm-md-hr");
const HEADING_LINES = [1, 2, 3, 4, 5, 6].map((level) => Decoration.line({ class: `cm-md-h cm-md-h${level}` }));
const QUOTE_LINE = Decoration.line({ class: "cm-md-quote" });
const CODE_LINE = Decoration.line({ class: "cm-md-codeblock" });
const TASK_DONE = mark("cm-md-task-done");
const completedTaskAt = new WeakMap<EditorView, number>();

/** Flip the `[ ]` / `[x]` marker of the task item on the line containing `pos`. */
function toggleTaskAt(view: EditorView, pos: number) {
  const line = view.state.doc.lineAt(pos);
  let markerFrom: number | undefined;
  syntaxTree(view.state).iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      if (node.name === "TaskMarker" && node.from >= line.from && node.to <= line.to) markerFrom = node.from;
    },
  });
  if (markerFrom === undefined) return;
  const at = markerFrom + 1;
  const checked = view.state.doc.sliceString(at, at + 1).toLowerCase() === "x";
  if (!checked) completedTaskAt.set(view, markerFrom);
  view.dispatch({
    changes: { from: at, to: at + 1, insert: checked ? " " : "x" },
    selection: view.state.selection,
    annotations: isolateHistory.of("full"),
    userEvent: "input.toggle",
  });
}

const SVG = "http://www.w3.org/2000/svg";

class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly markerFrom: number, readonly label: string) {
    super();
  }
  eq(other: TaskWidget) {
    return other.checked === this.checked && other.markerFrom === this.markerFrom && other.label === this.label;
  }
  updateDOM(box: HTMLElement, view: EditorView) {
    box.setAttribute("aria-checked", String(this.checked));
    box.setAttribute("aria-label", `${this.checked ? "Mark as not done" : "Mark as done"}: ${this.label}`);
    if (this.checked && completedTaskAt.get(view) === this.markerFrom) {
      box.classList.add("check-pop");
      completedTaskAt.delete(view);
    } else if (!this.checked) {
      box.classList.remove("check-pop");
    }
    return true;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("button");
    box.type = "button";
    box.contentEditable = "false";
    box.className = "cm-md-task";
    box.setAttribute("role", "checkbox");
    this.updateDOM(box, view);
    const tick = document.createElementNS(SVG, "svg");
    tick.setAttribute("viewBox", "0 0 24 24");
    tick.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", "M20 6 9 17l-5-5");
    tick.append(path);
    box.append(tick);
    // Toggle without moving the caret or stealing focus.
    box.addEventListener("mousedown", (event) => event.preventDefault());
    box.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleTaskAt(view, view.posAtDOM(box));
    });
    box.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        toggleTaskAt(view, view.posAtDOM(box));
      }
    });
    box.addEventListener("animationend", () => box.classList.remove("check-pop"));
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

/** Lines touched by the selection while the editor has focus. */
function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  if (!view.hasFocus || view.dom.querySelector(".cm-md-task:focus")) return lines;
  const { doc, selection } = view.state;
  for (const range of selection.ranges) {
    const last = doc.lineAt(range.to).number;
    for (let line = doc.lineAt(range.from).number; line <= last; line++) lines.add(line);
  }
  return lines;
}

function children(node: SyntaxNode, name: string): SyntaxNode[] {
  const found: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) if (child.name === name) found.push(child);
  return found;
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string | null,
    readonly alt: string,
    readonly label: string,
    readonly width: number | null,
    readonly height: number | null,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt && other.width === this.width && other.height === this.height;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("span");
    wrap.className = "cm-md-embed";
    const missing = () => {
      wrap.classList.add("cm-md-embed-missing");
      wrap.textContent = `“${this.label}” could not be loaded`;
    };
    if (!this.src) {
      missing();
      return wrap;
    }
    const image = document.createElement("img");
    image.src = this.src;
    image.alt = this.alt;
    image.loading = "lazy";
    image.decoding = "async";
    image.draggable = false;
    if (this.width) image.style.width = `${this.width}px`;
    if (this.height) image.style.height = `${this.height}px`;
    // Heights change once the image arrives; let CodeMirror re-measure lines.
    image.addEventListener("load", () => view.requestMeasure());
    image.addEventListener("error", () => {
      missing();
      view.requestMeasure();
    });
    wrap.append(image);
    return wrap;
  }
  ignoreEvent() {
    return false;
  }
}

function inCode(state: EditorState, pos: number): boolean {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (node.name === "InlineCode" || node.name === "FencedCode" || node.name === "CodeBlock") return true;
  }
  return false;
}

export function buildLivePreview(view: EditorView): DecorationSet {
  const { state } = view;
  const { doc } = state;
  const active = activeLines(view);
  const isActive = (pos: number) => active.has(doc.lineAt(pos).number);
  const ranges: Range<Decoration>[] = [];
  const decoratedLines = new Set<string>();
  const addLines = (from: number, to: number, decoration: Decoration, key: string) => {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      if (!decoratedLines.has(`${key}:${line.from}`)) {
        decoratedLines.add(`${key}:${line.from}`);
        ranges.push(decoration.range(line.from));
      }
      pos = line.to + 1;
    }
  };
  const syntaxMark = (from: number, to: number) => {
    if (to > from) ranges.push((isActive(from) ? SYNTAX : hidden).range(from, to));
  };
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (ref) => {
        const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(ref.name);
        if (heading) {
          addLines(ref.from, ref.name.startsWith("Setext") ? doc.lineAt(ref.from).to : ref.to, HEADING_LINES[Number(heading[1]) - 1], "h");
          return;
        }
        switch (ref.name) {
          case "HeaderMark": {
            if (ref.node.parent?.name.startsWith("Setext")) {
              ranges.push(SYNTAX.range(ref.from, ref.to));
              break;
            }
            const line = doc.lineAt(ref.from);
            const opening = /^\s*$/.test(doc.sliceString(line.from, ref.from));
            let start = ref.from;
            let end = ref.to;
            if (opening) {
              while (end < line.to && /[ \t]/.test(doc.sliceString(end, end + 1))) end++;
            } else {
              while (start > line.from && /[ \t]/.test(doc.sliceString(start - 1, start))) start--;
            }
            syntaxMark(start, end);
            break;
          }
          case "StrongEmphasis":
            ranges.push(STRONG.range(ref.from, ref.to));
            break;
          case "Emphasis":
            ranges.push(EMPHASIS.range(ref.from, ref.to));
            break;
          case "Strikethrough":
            ranges.push(STRIKE.range(ref.from, ref.to));
            break;
          case "InlineCode":
            ranges.push(CODE.range(ref.from, ref.to));
            break;
          case "EmphasisMark":
          case "StrikethroughMark":
            syntaxMark(ref.from, ref.to);
            break;
          case "CodeMark":
            if (ref.node.parent?.name === "InlineCode") syntaxMark(ref.from, ref.to);
            else ranges.push(SYNTAX.range(ref.from, ref.to));
            break;
          case "Link": {
            const marks = children(ref.node, "LinkMark");
            const url = children(ref.node, "URL")[0];
            if (marks.length >= 2 && marks[1].from > marks[0].to) ranges.push(LINK_TEXT.range(marks[0].to, marks[1].from));
            // Only inline links with a destination collapse to their text; references stay visible.
            if (!url || marks.length < 2) break;
            if (isActive(ref.from)) {
              for (const linkMark of marks) ranges.push(SYNTAX.range(linkMark.from, linkMark.to));
              ranges.push(URL_TEXT.range(url.from, url.to));
            } else {
              ranges.push(hidden.range(marks[0].from, marks[0].to));
              ranges.push(hidden.range(marks[1].from, ref.to));
            }
            break;
          }
          case "Image":
          case "Autolink":
            ranges.push(URL_TEXT.range(ref.from, ref.to));
            return false;
          case "ListMark":
          case "TaskMarker":
            ranges.push(LIST_MARK.range(ref.from, ref.to));
            break;
          case "Task": {
            const marker = children(ref.node, "TaskMarker")[0];
            const listMark = ref.node.parent ? children(ref.node.parent, "ListMark")[0] : undefined;
            if (!marker || !listMark) break;
            const checked = /x/i.test(doc.sliceString(marker.from, marker.to));
            let depth = 0;
            for (let ancestor = ref.node.parent?.parent; ancestor; ancestor = ancestor.parent) {
              if (ancestor.name === "ListItem") depth += 1;
            }
            let end = marker.to;
            const firstLine = doc.lineAt(marker.from);
            while (end < firstLine.to && /[ \t]/.test(doc.sliceString(end, end + 1))) end++;
            if (!isActive(marker.from)) {
              const label = doc.sliceString(end, ref.to).replace(/\s+/g, " ").trim().slice(0, 160) || "Task";
              ranges.push(Decoration.replace({ widget: new TaskWidget(checked, marker.from, label) }).range(listMark.from, end));
            }
            for (let pos = firstLine.from; pos <= ref.to; ) {
              const line = doc.lineAt(pos);
              const editing = active.has(line.number);
              const first = line.number === firstLine.number;
              const key = `t:${line.from}`;
              if (!decoratedLines.has(key)) {
                decoratedLines.add(key);
                ranges.push(Decoration.line({
                  class: `cm-md-task-line${editing ? " cm-md-task-editing" : first ? " cm-md-task-rendered" : " cm-md-task-continuation"}${checked && !editing ? " cm-md-task-line-done" : ""}`,
                  attributes: { style: `--cm-task-indent: ${depth * 1.25}rem` },
                }).range(line.from));
              }
              if (!editing) {
                const prefixEnd = first ? listMark.from : line.from + (line.text.match(/^[ \t]*/)?.[0].length ?? 0);
                if (prefixEnd > line.from && /^[ \t]*$/.test(doc.sliceString(line.from, prefixEnd))) ranges.push(hidden.range(line.from, prefixEnd));
                const textFrom = Math.max(end, prefixEnd, line.from);
                const textTo = Math.min(ref.to, line.to);
                if (checked && textTo > textFrom) ranges.push(TASK_DONE.range(textFrom, textTo));
              }
              pos = line.to + 1;
            }
            break;
          }
          case "QuoteMark":
            ranges.push(SYNTAX.range(ref.from, ref.to));
            break;
          case "Blockquote":
            addLines(ref.from, ref.to, QUOTE_LINE, "q");
            break;
          case "FencedCode":
          case "CodeBlock":
            addLines(ref.from, ref.to, CODE_LINE, "c");
            break;
          case "HorizontalRule":
            ranges.push(RULE.range(ref.from, ref.to));
            break;
        }
      },
    });
  }

  // Image embeds (![[name.png|300]], ![alt](url)): the image replaces the syntax on other
  // lines; on the caret line the syntax stays editable and the image shows below it.
  const embeds: Range<Decoration>[] = [];
  const replaced: [number, number][] = [];
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      if (line.text.includes("![")) {
        for (const embed of findImageEmbeds(line.text)) {
          const start = line.from + embed.from;
          const end = line.from + embed.to;
          if (inCode(state, start)) continue;
          const widget = new ImageWidget(resolveImageSrc(embed.target), embed.alt, embed.target, embed.width, embed.height);
          if (isActive(start)) {
            embeds.push(URL_TEXT.range(start, end), Decoration.widget({ widget, side: 1 }).range(end));
          } else {
            embeds.push(Decoration.replace({ widget }).range(start, end));
            replaced.push([start, end]);
          }
        }
      }
      pos = line.to + 1;
    }
  }
  const visible = ranges.filter((range) => range.from === range.to || !replaced.some(([start, end]) => range.from >= start && range.to <= end));
  return Decoration.set([...visible, ...embeds], true);
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildLivePreview(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.focusChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildLivePreview(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
