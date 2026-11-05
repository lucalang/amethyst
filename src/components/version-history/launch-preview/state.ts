export type PreviewNode = {
  id: string; parentId: string | null; kind: "note" | "checklist" | "folder"; name: string;
  version: number; updatedAt: string; itemsTotal: number; itemsChecked: number; content: string;
};
export type PreviewItem = {
  id: string; label: string; checked: boolean; position: number; notes: string; starred: boolean;
  dueDate: string | null; steps: { id: string; label: string; checked: boolean; position: number }[];
};
export type PreviewDetail = { node: PreviewNode; items: PreviewItem[] };
const STORAGE_PREFIX = `amethyst:preview:${__PREVIEW_SHA__}:`;
export const STORAGE_KEY = `${STORAGE_PREFIX}workspace`;
const timestamp = "2026-10-01T12:00:00.000Z";
export const ENTRY_ID = "00000000-0000-4000-8000-000000000001";
export const NOTE_ID = "00000000-0000-4000-8000-000000000002";
export const CHECKLIST_ID = "00000000-0000-4000-8000-000000000003";

export function initialDetails(): PreviewDetail[] {
  return [{
    node: { id: NOTE_ID, parentId: null, kind: "note", name: "Overview.md", version: 1, updatedAt: timestamp, itemsTotal: 0, itemsChecked: 0,
      content: "# The Forest Journey\n\n## The journey continues\n\nA traveler returns to the forest paths they once walked with their companions.\n\n### Favorite moments\n\n- The meteor shower\n- New companions joining the party\n- Small acts of kindness along the road\n\n> Even a short journey can leave a lasting mark.\n\n**Watch notes**\n\nThe quiet scenes are the ones I keep coming back to.\n" }, items: [],
  }, {
    node: { id: CHECKLIST_ID, parentId: null, kind: "checklist", name: "Progress", version: 1, updatedAt: timestamp, itemsTotal: 4, itemsChecked: 1, content: "" },
    items: ["The end of the adventure", "A new journey", "The first-class mage exam", "A farewell and a promise"].map((label, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`, label, checked: index === 0,
      position: index, notes: "", starred: false, dueDate: null, steps: index === 1 ? [
        { id: "00000000-0000-4000-8000-000000000020", label: "Meet the traveling companions", checked: false, position: 0 },
        { id: "00000000-0000-4000-8000-000000000021", label: "Reach the forest village", checked: false, position: 1 },
      ] : [],
    })),
  }];
}

function validDetails(value: unknown): value is PreviewDetail[] {
  if (!Array.isArray(value) || value.length !== 2) return false;
  return value.every((detail, index) => {
    const node = detail?.node;
    return node?.id === [NOTE_ID, CHECKLIST_ID][index] && typeof node.content === "string" && node.content.length <= 200000 &&
      Number.isSafeInteger(node.version) && node.version > 0 && Array.isArray(detail.items) && detail.items.length === (index === 0 ? 0 : 4) &&
      detail.items.every((item: PreviewItem, itemIndex: number) => item?.id === initialDetails()[index].items[itemIndex]?.id &&
        typeof item.label === "string" && typeof item.checked === "boolean" && typeof item.notes === "string" && typeof item.starred === "boolean" && Array.isArray(item.steps) &&
        item.steps.length === initialDetails()[index].items[itemIndex].steps.length && item.steps.every((step, stepIndex) =>
          step.id === initialDetails()[index].items[itemIndex].steps[stepIndex].id && typeof step.checked === "boolean" && typeof step.label === "string"));
  });
}

export function readDetails(): PreviewDetail[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (validDetails(stored)) return stored;
  } catch {}
  return initialDetails();
}

export class ApiError extends Error {
  constructor(message = "This action is unavailable in the historical preview.", public status = 403, public code = "preview_read_only") { super(message); }
}

export async function apiFetch<Result>(url: string, options: { method?: string; json?: Record<string, unknown> } = {}): Promise<Result> {
  const details = readDetails();
  const method = options.method ?? "GET";
  const body = options.json ?? {};
  const node = details.find((detail) => url === `/api/nodes/${detail.node.id}`);
  let result: unknown;
  if (node && method === "GET") result = node;
  else if (node && method === "PATCH" && Object.keys(body).every((key) => ["content", "version", "expectedVersion"].includes(key)) && typeof body.content === "string") {
    if (body.expectedVersion !== node.node.version) throw new ApiError("This note changed in another tab.", 409, "conflict");
    node.node.content = body.content.slice(0, 200000);
    node.node.version += 1;
    node.node.updatedAt = new Date().toISOString();
    result = { node: node.node };
  } else {
    const checklist = details[1];
    const step = checklist.items.flatMap((item) => item.steps).find((candidate) => url === `/api/steps/${candidate.id}`);
    const item = checklist.items.find((candidate) => url === `/api/items/${candidate.id}`);
    const allowed = ["checked", "notes", "starred", "dueDate", "label"];
    if (url === `/api/nodes/${CHECKLIST_ID}/items` && method === "PATCH" && Object.keys(body).length === 1 && typeof body.checked === "boolean") {
      for (const candidate of checklist.items) candidate.checked = body.checked;
      result = { items: checklist.items };
    } else if (url === `/api/nodes/${CHECKLIST_ID}/items` && method === "PUT" && Array.isArray(body.itemIds) && body.itemIds.length === checklist.items.length &&
      new Set(body.itemIds).size === checklist.items.length && body.itemIds.every((id) => checklist.items.some((candidate) => candidate.id === id))) {
      for (const candidate of checklist.items) candidate.position = body.itemIds.indexOf(candidate.id);
      result = { items: checklist.items };
    } else if (step && method === "PATCH" && Object.keys(body).every((key) => key === "checked" || key === "label")) {
      if (typeof body.checked === "boolean") step.checked = body.checked;
      if (typeof body.label === "string") step.label = body.label.slice(0, 500);
      result = { step };
    } else {
      if (!item || method !== "PATCH" || Object.keys(body).some((key) => !allowed.includes(key))) throw new ApiError();
      if (typeof body.checked === "boolean") item.checked = body.checked;
      if (typeof body.notes === "string") item.notes = body.notes.slice(0, 20000);
      if (typeof body.label === "string") item.label = body.label.slice(0, 500);
      if (typeof body.starred === "boolean") item.starred = body.starred;
      if (body.dueDate === null || typeof body.dueDate === "string") item.dueDate = body.dueDate;
      result = { item };
    }
    checklist.node.itemsChecked = checklist.items.filter((candidate) => candidate.checked).length;
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(details)); } catch { throw new ApiError("Browser storage is unavailable. Changes could not be saved."); }
  return structuredClone(result) as Result;
}

export function resetPreview() {
  for (const key of Object.keys(localStorage)) if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
  history.replaceState(null, "", `${location.pathname}#${__PREVIEW_DEFAULT_PATH__}`);
  location.reload();
}