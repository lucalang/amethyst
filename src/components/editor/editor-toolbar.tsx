"use client";

import type { EditorView } from "@codemirror/view";
import { useRef, useState, type ReactNode } from "react";
import { BetweenHorizontalStart, BetweenVerticalStart, Bold, ChevronDown, Heading, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered, ListPlus, Redo2, Table2, Trash2, Undo2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TaskLinesDialog } from "@/components/workspace/task-lines-dialog";
import { cn } from "@/lib/utils";
import type { EditorStatus } from "./live-markdown-editor";
import { deleteTable, insertTable, tableAddColumn, tableAddRow, tableDeleteColumn, tableDeleteRow } from "./live-tables";
import { insertLink, insertTaskLines, redoEdit, setHeading, toggleInline, toggleList, undoEdit } from "./markdown-commands";

const HEADING_OPTIONS = [
  { level: 0, label: "Body text", className: "text-sm text-foreground" },
  { level: 1, label: "Heading 1", className: "text-lg font-extrabold text-[var(--md-h1)]" },
  { level: 2, label: "Heading 2", className: "text-base font-extrabold text-[var(--md-h2)]" },
  { level: 3, label: "Heading 3", className: "text-[15px] font-extrabold text-[var(--md-h3)]" },
  { level: 4, label: "Heading 4", className: "text-sm font-bold text-[var(--md-h4)]" },
  { level: 5, label: "Heading 5", className: "text-sm font-bold text-[var(--md-h5)]" },
  { level: 6, label: "Heading 6", className: "text-xs font-bold tracking-wider text-[var(--md-h6)] uppercase" },
];

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const PICKER_ROWS = 6;
const PICKER_COLUMNS = 6;

/** Table menu: a size grid that inserts a table, and (with the caret in a table) its row and column actions. */
function TableMenu({ run, inTable }: { run: (command: (view: EditorView) => unknown) => () => void; inTable: boolean }) {
  const [hover, setHover] = useState<{ rows: number; columns: number }>({ rows: 3, columns: 3 });
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Table"
              onMouseDown={(event) => event.preventDefault()}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-[color,background-color,scale] duration-150 hover:bg-amethyst/12 hover:text-amethyst focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-90 active:bg-amethyst/20 aria-expanded:bg-amethyst/12 aria-expanded:text-amethyst pointer-coarse:size-10 [&_svg]:size-4"
            >
              <Table2 aria-hidden />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Table</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-56" onCloseAutoFocus={(event) => event.preventDefault()}>
        <DropdownMenuLabel>Insert table · {hover.columns} × {hover.rows}</DropdownMenuLabel>
        <div role="group" aria-label="Table size" className="grid gap-1 px-2 pb-2" style={{ gridTemplateColumns: `repeat(${PICKER_COLUMNS}, 1fr)` }}>
          {Array.from({ length: PICKER_ROWS * PICKER_COLUMNS }, (_, index) => {
            const rows = Math.floor(index / PICKER_COLUMNS) + 1;
            const columns = (index % PICKER_COLUMNS) + 1;
            const lit = rows <= hover.rows && columns <= hover.columns;
            return (
              <button
                key={index}
                type="button"
                aria-label={`${columns} columns × ${rows} rows`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHover({ rows, columns })}
                onFocus={() => setHover({ rows, columns })}
                onClick={run((view) => insertTable(view, rows, columns))}
                className={cn(
                  "aspect-square rounded-[3px] border transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  lit ? "border-amethyst/70 bg-amethyst/25" : "border-border bg-transparent",
                )}
              />
            );
          })}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!inTable} onSelect={run((view) => tableAddRow(view, false))}>
          <BetweenHorizontalStart aria-hidden /> Row above
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!inTable} onSelect={run((view) => tableAddRow(view, true))}>
          <BetweenHorizontalStart aria-hidden className="rotate-180" /> Row below
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!inTable} onSelect={run((view) => tableAddColumn(view, false))}>
          <BetweenVerticalStart aria-hidden className="rotate-180" /> Column left
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!inTable} onSelect={run((view) => tableAddColumn(view, true))}>
          <BetweenVerticalStart aria-hidden /> Column right
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!inTable} onSelect={run(tableDeleteRow)}>
          <Trash2 aria-hidden /> Delete row
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!inTable} onSelect={run(tableDeleteColumn)}>
          <Trash2 aria-hidden /> Delete column
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" disabled={!inTable} onSelect={run(deleteTable)}>
          <Trash2 aria-hidden /> Delete table
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ToolButton({
  label,
  shortcut,
  onRun,
  disabled,
  children,
}: {
  label: string;
  shortcut?: string;
  onRun: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          // Keep the editor's selection: act on mousedown without taking focus.
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRun}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-[color,background-color,scale] duration-150 hover:bg-amethyst/12 hover:text-amethyst focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-90 active:bg-amethyst/20 disabled:opacity-35 pointer-coarse:size-10 [&_svg]:size-4"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? <span className="ml-2 text-background/60">{shortcut.replace("Mod", isMac() ? "⌘" : "Ctrl")}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

export function EditorToolbar({
  getView,
  status,
  className,
  onInsertImages,
}: {
  getView: () => EditorView | null;
  status: EditorStatus;
  className?: string;
  onInsertImages?: (files: File[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linesOpen, setLinesOpen] = useState(false);
  const run = (command: (view: EditorView) => unknown) => () => {
    const view = getView();
    if (view) command(view);
  };
  const current = HEADING_OPTIONS.find((option) => option.level === status.heading) ?? HEADING_OPTIONS[0];

  return (
    <div role="toolbar" aria-label="Formatting" className={cn("flex min-w-0 items-center gap-0.5 overflow-x-auto", className)}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Text style: ${current.label}`}
            onMouseDown={(event) => event.preventDefault()}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-[color,background-color,scale] duration-150 hover:bg-amethyst/12 hover:text-amethyst focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-95 pointer-coarse:h-10"
          >
            <Heading aria-hidden className="size-4" />
            <span className="w-16 text-left">{current.level === 0 ? "Text" : `Heading ${current.level}`}</span>
            <ChevronDown aria-hidden className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48" onCloseAutoFocus={(event) => event.preventDefault()}>
          {HEADING_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.level}
              onSelect={run((view) => setHeading(view, option.level))}
              className={cn(option.level === status.heading && "bg-accent")}
            >
              <span className={option.className}>{option.label}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{isMac() ? "⌘⌥" : "Ctrl+Alt+"}{option.level}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
      <ToolButton label="Bold" shortcut="Mod+B" onRun={run((view) => toggleInline(view, "**"))}>
        <Bold aria-hidden />
      </ToolButton>
      <ToolButton label="Italic" shortcut="Mod+I" onRun={run((view) => toggleInline(view, "*"))}>
        <Italic aria-hidden />
      </ToolButton>
      <ToolButton label="Link" shortcut="Mod+K" onRun={run(insertLink)}>
        <Link2 aria-hidden />
      </ToolButton>
      {onInsertImages ? (
        <>
          <ToolButton label="Insert image (or paste / drop one)" onRun={() => fileInputRef.current?.click()}>
            <ImagePlus aria-hidden />
          </ToolButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"
            multiple
            hidden
            aria-hidden
            tabIndex={-1}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              if (files.length) onInsertImages(files);
            }}
          />
        </>
      ) : null}
      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
      <ToolButton label="Bulleted list" onRun={run((view) => toggleList(view, "bullet"))}>
        <List aria-hidden />
      </ToolButton>
      <ToolButton label="Numbered list" onRun={run((view) => toggleList(view, "ordered"))}>
        <ListOrdered aria-hidden />
      </ToolButton>
      <ToolButton label="Task list" onRun={run((view) => toggleList(view, "task"))}>
        <ListChecks aria-hidden />
      </ToolButton>
      <TableMenu run={run} inTable={Boolean(status.table)} />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-haspopup="dialog"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setLinesOpen(true)}
            className="ml-0.5 flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-white/[0.08] px-2 text-xs font-medium text-muted-foreground transition-[color,background-color,border-color,scale] duration-150 hover:border-amethyst/35 hover:bg-amethyst/12 hover:text-amethyst focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-95 pointer-coarse:h-10 [&_svg]:size-4"
          >
            <ListPlus aria-hidden className="text-amethyst" />
            Add tasks
          </button>
        </TooltipTrigger>
        <TooltipContent>Paste a list: one task per line</TooltipContent>
      </Tooltip>
      <TaskLinesDialog
        open={linesOpen}
        onOpenChange={setLinesOpen}
        title="Add multiple tasks"
        description="Each non-empty line becomes a Markdown task at the cursor, in the same order. Lines starting with “- [x]” stay completed."
        confirmLabel="Insert tasks"
        onConfirm={async (tasks) => {
          const view = getView();
          if (!view) return "The note isn’t ready yet. Try again in a moment.";
          insertTaskLines(view, tasks);
          return null;
        }}
        onCloseAutoFocus={(event) => {
          const view = getView();
          if (!view) return;
          event.preventDefault();
          view.focus();
        }}
      />
      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
      <ToolButton label="Undo" shortcut="Mod+Z" disabled={!status.canUndo} onRun={run(undoEdit)}>
        <Undo2 aria-hidden />
      </ToolButton>
      <ToolButton label="Redo" shortcut="Mod+Shift+Z" disabled={!status.canRedo} onRun={run(redoEdit)}>
        <Redo2 aria-hidden />
      </ToolButton>
    </div>
  );
}
