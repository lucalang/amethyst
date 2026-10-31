/**
 * Where panels go in each view of the Crimson Sanctum, shared by the 3D scene (which places them in the
 * world) and the dashboard (which needs page sizes). Units are CSS px of the viewport; `y` is from its top.
 */

export const STATIONS = ["overview", "codes", "detail", "forge"] as const;
export type StationId = (typeof STATIONS)[number];

export type PanelKind = "panel" | "tablet" | "counter" | "timeline" | "plate";

export type PanelSpec = {
  station: StationId;
  slot: string;
  order: number;
  kind: PanelKind;
  /** Code status for tablets (see CODE_STATUS), otherwise empty. */
  tone?: string;
};

export type Slot = {
  id: string;
  x: number;
  width: number;
  /** Top edge; or below the slot named in `after`; or kept `bottom` px above the viewport's bottom edge. */
  y?: number;
  after?: string;
  bottom?: number;
  columns?: number;
  gap?: number;
  rotY?: number;
  rotX?: number;
  z?: number;
  /** Radius (px) of the cylinder a grid curves around, facing the viewer. */
  curve?: number;
  maxHeight?: number;
};

/** Slot order per view: also the keyboard and screen-reader order of the panels. */
export const SLOT_ORDER: Record<StationId, string[]> = {
  overview: ["counters", "timeline", "lists", "activity"],
  codes: ["toolbar", "grid", "drafts"],
  detail: ["summary", "main", "history"],
  forge: ["plate", "rewards", "rules", "seal"],
};

export const HUD_HEIGHT = 64;

export const layoutSize = (width: number) => (width < 760 ? "compact" : width < 1180 ? "medium" : "wide");

/** Code tablets per page, so a page fits the view without scrolling on desktop. */
export function tabletsPerPage(width: number, height: number) {
  const size = layoutSize(width);
  if (size === "compact") return 6;
  if (size === "medium") return height > 820 ? 8 : 6;
  return height > 860 ? 12 : 8;
}

export function gridColumns(width: number) {
  const size = layoutSize(width);
  if (size === "compact") return 1;
  if (size === "medium") return width > 960 ? 3 : 2;
  return 4;
}

/** The slots of one view at the given viewport size. */
export function stationSlots(station: StationId, width: number, height: number): Slot[] {
  const size = layoutSize(width);
  const top = HUD_HEIGHT + 16;
  const edge = width / 2 - (size === "compact" ? 12 : 28);

  if (size === "compact") {
    const full = width - 24;
    const order = SLOT_ORDER[station];
    return order.map((id, index) => ({
      id,
      x: 0,
      width: full,
      ...(index === 0 ? { y: top - 4 } : { after: order[index - 1] }),
      columns: station === "overview" && id === "counters" ? 2 : 1,
      gap: 12,
    }));
  }

  if (station === "overview") {
    if (size === "medium") {
      const half = (width - 72) / 2;
      return [
        { id: "counters", x: 0, y: top, width: width - 56, columns: width > 960 ? 4 : 2, gap: 14 },
        { id: "timeline", x: -(half / 2 + 8), after: "counters", width: half, rotY: 0.08 },
        { id: "lists", x: -(half / 2 + 8), after: "timeline", width: half, rotY: 0.08 },
        { id: "activity", x: half / 2 + 8, after: "counters", width: half, rotY: -0.08, maxHeight: height - 260 },
      ];
    }
    const side = Math.min(380, (width - 700) / 2);
    const center = Math.min(width - side * 2 - 120, 900);
    return [
      { id: "counters", x: 0, y: top, width: center, columns: 4, gap: 16, curve: 1600 },
      { id: "timeline", x: 0, after: "counters", bottom: 28, width: Math.min(center, 640), rotX: -0.16, z: 20 },
      { id: "lists", x: -(edge - side / 2), y: top, width: side, rotY: 0.24, z: -40 },
      { id: "activity", x: edge - side / 2, y: top, width: side, rotY: -0.24, z: -40, maxHeight: height - top - 28 },
    ];
  }

  if (station === "codes") {
    const toolbar = Math.min(width - 56, 1240);
    if (size === "medium") {
      return [
        { id: "toolbar", x: 0, y: top, width: toolbar },
        { id: "grid", x: 0, after: "toolbar", width: toolbar, columns: gridColumns(width), gap: 16, curve: 1800 },
        { id: "drafts", x: 0, after: "grid", width: Math.min(toolbar, 560) },
      ];
    }
    const drafts = 320;
    const grid = Math.min(toolbar - drafts - 24, 1040);
    const left = -(grid + 24 + drafts) / 2;
    return [
      { id: "toolbar", x: 0, y: top, width: toolbar },
      { id: "grid", x: left + grid / 2, after: "toolbar", width: grid, columns: gridColumns(width), gap: 18, curve: 1500 },
      { id: "drafts", x: left + grid + 24 + drafts / 2, after: "toolbar", width: drafts, rotY: -0.2, z: -30 },
    ];
  }

  if (station === "detail") {
    if (size === "medium") {
      const half = (width - 72) / 2;
      return [
        { id: "summary", x: -(half / 2 + 8), y: top, width: half, rotY: 0.08 },
        { id: "history", x: -(half / 2 + 8), after: "summary", width: half, rotY: 0.08, maxHeight: 420 },
        { id: "main", x: half / 2 + 8, y: top, width: half, rotY: -0.08, maxHeight: height - top - 28 },
      ];
    }
    const summary = 330;
    const history = 380;
    const main = Math.min(width - 56 - summary - history - 56, 660);
    const span = summary + main + history + 56;
    const left = -span / 2;
    const historyHeight = (height - top - 28 - 18) / 2;
    return [
      { id: "summary", x: left + summary / 2, y: top, width: summary, rotY: 0.22, z: -36 },
      { id: "main", x: left + summary + 28 + main / 2, y: top, width: main, maxHeight: height - top - 28 },
      { id: "history", x: left + summary + main + 56 + history / 2, y: top, width: history, rotY: -0.22, z: -36, maxHeight: historyHeight },
    ];
  }

  // Forge: rewards on the left, rules and the seal on the right, the core free in the middle.
  if (size === "medium") {
    const half = (width - 72) / 2;
    return [
      { id: "plate", x: 0, y: top, width: Math.min(width - 56, 520), z: 40 },
      { id: "rewards", x: -(half / 2 + 8), y: top, width: half, rotY: 0.08, maxHeight: height - top - 28 },
      { id: "rules", x: half / 2 + 8, y: top, width: half, rotY: -0.08, maxHeight: height - top - 300 },
      { id: "seal", x: half / 2 + 8, after: "rules", width: half, rotY: -0.08 },
    ];
  }
  const rewards = Math.min(480, (width - 560) / 2 + 20);
  const rules = Math.min(430, (width - 560) / 2);
  return [
    { id: "plate", x: 0, y: Math.max(top, height / 2 - 150), width: Math.min(460, width - rewards - rules - 140), z: 60 },
    { id: "rewards", x: -(edge - rewards / 2), y: top, width: rewards, rotY: 0.26, z: -30, maxHeight: height - top - 28 },
    { id: "rules", x: edge - rules / 2, y: top, width: rules, rotY: -0.26, z: -30, maxHeight: Math.max(300, height - top - 300) },
    { id: "seal", x: edge - rules / 2, after: "rules", width: rules, rotY: -0.26, z: -30 },
  ];
}
