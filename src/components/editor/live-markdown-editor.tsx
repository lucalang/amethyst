"use client";

import { defaultKeymap, history, historyKeymap, redoDepth, undoDepth } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, drawSelection, keymap, placeholder as placeholderExtension } from "@codemirror/view";
import { useEffect, useEffectEvent, useImperativeHandle, useRef, type Ref } from "react";
import { livePreview } from "./live-preview";
import { headingLevelAt, insertLink, setHeading, toggleInline } from "./markdown-commands";
import { imageUploads, insertImageFiles } from "./note-images";

export type EditorStatus = { canUndo: boolean; canRedo: boolean; heading: number };

export type LiveMarkdownEditorHandle = {
  view: () => EditorView | null;
  /** Replace the whole document (e.g. loading another tab's version); undoable. */
  setContent: (text: string) => void;
  focus: () => void;
  /** Upload images and embed them at the caret as ![[name]]. */
  insertImages: (files: File[]) => void;
};

/**
 * Markdown editor with Obsidian-style live preview. The document is always the
 * raw Markdown string; formatting is purely presentational.
 */
export function LiveMarkdownEditor({
  ref,
  initialValue,
  ariaLabel,
  placeholder,
  autoFocus,
  onChange,
  onSave,
  onBlur,
  onStatus,
  onImageError,
}: {
  ref?: Ref<LiveMarkdownEditorHandle>;
  initialValue: string;
  ariaLabel: string;
  placeholder?: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onSave?: () => void;
  onBlur?: () => void;
  onStatus?: (status: EditorStatus) => void;
  onImageError?: (message: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const imageErrorRef = useRef(onImageError);
  useEffect(() => {
    imageErrorRef.current = onImageError;
  });
  const reportImageError = (message: string) => imageErrorRef.current?.(message);

  const emitChange = useEffectEvent((value: string) => onChange(value));
  const emitSave = useEffectEvent(() => onSave?.());
  const emitBlur = useEffectEvent(() => onBlur?.());
  const emitStatus = useEffectEvent((status: EditorStatus) => onStatus?.(status));

  const createView = useEffectEvent((parent: HTMLElement) => {
    let last = "";
    const report = (state: EditorState) => {
      const status: EditorStatus = { canUndo: undoDepth(state) > 0, canRedo: redoDepth(state) > 0, heading: headingLevelAt(state) };
      const key = JSON.stringify(status);
      if (key !== last) {
        last = key;
        emitStatus(status);
      }
    };
    const headingKeys = [0, 1, 2, 3, 4, 5, 6].map((level) => ({ key: `Mod-Alt-${level}`, run: (view: EditorView) => setHeading(view, level) }));
    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage }),
        livePreview,
        imageUploads(reportImageError),
        keymap.of([
          { key: "Mod-b", run: (view) => toggleInline(view, "**") },
          { key: "Mod-i", run: (view) => toggleInline(view, "*") },
          { key: "Mod-k", run: insertLink },
          { key: "Mod-s", preventDefault: true, run: () => (emitSave(), true) },
          ...headingKeys,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        placeholder ? placeholderExtension(placeholder) : [],
        EditorView.contentAttributes.of({ "aria-label": ariaLabel, spellcheck: "true", autocapitalize: "sentences" }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) emitChange(update.state.doc.toString());
          if (update.docChanged || update.selectionSet) report(update.state);
        }),
        EditorView.domEventHandlers({
          blur: () => {
            emitBlur();
            return false;
          },
        }),
      ],
    });
    const view = new EditorView({ state, parent });
    report(view.state);
    if (autoFocus) view.focus();
    return view;
  });

  useEffect(() => {
    if (!hostRef.current) return;
    const view = createView(hostRef.current);
    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      view: () => viewRef.current,
      setContent: (text) => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      },
      focus: () => viewRef.current?.focus(),
      insertImages: (files) => {
        const view = viewRef.current;
        if (!view || files.length === 0) return;
        void insertImageFiles(view, files, view.state.selection.main.head, "file", reportImageError);
      },
    }),
    [],
  );

  return <div ref={hostRef} className="cm-live" />;
}
