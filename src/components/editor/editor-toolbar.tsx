"use client";

import type { EditorView } from "@codemirror/view";
import { useRef, type ReactNode } from "react";
import { Bold, ChevronDown, Heading, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered, Redo2, Undo2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EditorStatus } from "./live-markdown-editor";
import { insertLink, redoEdit, setHeading, toggleInline, toggleList, undoEdit } from "./markdown-commands";

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
