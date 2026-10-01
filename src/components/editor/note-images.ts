"use client";

import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { ATTACHMENT_BUCKET, ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, pastedImageName, sanitizeAttachmentName, withSuffix } from "@/lib/attachments";
import { createClient } from "@/lib/supabase/client";

export type ImageSource = "paste" | "file";

/** Upload to the account's private folder and return the stored file name (unique per account). */
export async function uploadNoteImage(file: File, source: ImageSource): Promise<string> {
  const extension = ATTACHMENT_TYPES[file.type];
  if (!extension) throw new Error(`“${file.name || "This file"}” is not a supported image. Use PNG, JPEG, GIF, WebP, AVIF or BMP.`);
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`“${file.name || "This image"}” is larger than 10 MB.`);

  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Your session expired. Sign in again to add images.");

  // Clipboard images are usually just "image.png"; name them like Obsidian does.
  const generic = !file.name || /^image\.\w+$/i.test(file.name);
  const base = source === "paste" || generic ? pastedImageName(extension) : sanitizeAttachmentName(file.name, extension);
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = attempt ? withSuffix(base, attempt) : base;
    const { error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(`${userId}/${name}`, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
    if (!error) return name;
    const status = (error as { statusCode?: string | number }).statusCode;
    if (String(status) !== "409" && !/exists|duplicate/i.test(error.message)) throw new Error(`Could not upload the image: ${error.message}`);
  }
  throw new Error("Could not find a free file name for this image.");
}

type Pending = { id: number; pos: number; label: string };

const addPending = StateEffect.define<Pending>({ map: (value, mapping) => ({ ...value, pos: mapping.mapPos(value.pos, 1) }) });
const removePending = StateEffect.define<number>();

class UploadingWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  eq(other: UploadingWidget) {
    return other.label === this.label;
  }
  toDOM() {
    const element = document.createElement("span");
    element.className = "cm-md-uploading";
    element.setAttribute("role", "status");
    element.textContent = `Uploading ${this.label}…`;
    return element;
  }
}

/** Positions of uploads in flight, kept in place while the user keeps typing. */
const pendingUploads = StateField.define<Pending[]>({
  create: () => [],
  update(value, transaction) {
    let next = transaction.docChanged ? value.map((item) => ({ ...item, pos: transaction.changes.mapPos(item.pos, 1) })) : value;
    for (const effect of transaction.effects) {
      if (effect.is(addPending)) next = [...next, effect.value];
      else if (effect.is(removePending)) next = next.filter((item) => item.id !== effect.value);
    }
    return next;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (items) =>
      Decoration.set(
        items.map((item) => Decoration.widget({ widget: new UploadingWidget(item.label), side: 1 }).range(item.pos)),
        true,
      ),
    ),
});

let nextUploadId = 1;

function safeDispatch(view: EditorView, spec: Parameters<EditorView["dispatch"]>[0]) {
  try {
    view.dispatch(spec);
  } catch {
    // The editor was closed while the upload ran.
  }
}

/** Upload images and embed them at `pos` as ![[name]], in order, like Obsidian. */
export async function insertImageFiles(view: EditorView, files: File[], pos: number, source: ImageSource, onError: (message: string) => void) {
  const items = files.map((file) => ({ file, id: nextUploadId++ }));
  safeDispatch(view, { effects: items.map(({ file, id }) => addPending.of({ id, pos, label: source === "file" && file.name ? file.name : "image" })) });
  let first = true;
  for (const { file, id } of items) {
    try {
      const name = await uploadNoteImage(file, source);
      const at = view.state.field(pendingUploads, false)?.find((item) => item.id === id)?.pos ?? view.state.selection.main.head;
      const insert = `${first ? "" : "\n"}![[${name}]]`;
      const caretHere = view.state.selection.main.empty && view.state.selection.main.head === at;
      safeDispatch(view, {
        changes: { from: at, insert },
        effects: removePending.of(id),
        ...(caretHere ? { selection: { anchor: at + insert.length } } : {}),
        userEvent: "input.paste",
      });
      first = false;
    } catch (error) {
      safeDispatch(view, { effects: removePending.of(id) });
      onError(error instanceof Error ? error.message : "Could not upload the image.");
    }
  }
}

function imageFiles(data: DataTransfer | null): File[] {
  return data ? [...data.files].filter((file) => file.type.startsWith("image/")) : [];
}

/** Paste or drop image files into the editor to upload and embed them. */
export function imageUploads(onError: (message: string) => void) {
  return [
    pendingUploads,
    EditorView.domEventHandlers({
      paste(event, view) {
        const files = imageFiles(event.clipboardData);
        if (!files.length) return false;
        event.preventDefault();
        void insertImageFiles(view, files, view.state.selection.main.head, "paste", onError);
        return true;
      },
      dragover(event) {
        if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
        return false;
      },
      drop(event, view) {
        const files = imageFiles(event.dataTransfer);
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
        void insertImageFiles(view, files, pos, "file", onError);
        return true;
      },
    }),
  ];
}
