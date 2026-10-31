/**
 * Decodes the visible text of a System window from scrambled glyph fragments, left to right, then
 * leaves the real text in place. It only rewrites text nodes and hands a node back the moment React
 * changes it, so input, selections and rerenders are never affected. Fields, code and screen-reader
 * text are skipped; the container is aria-busy while it runs.
 */
const SCRAMBLE = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789#%&+=<>/[]";
const SKIP = "input, textarea, select, option, code, svg, script, style, .sr-only, [aria-hidden='true'], [data-no-decode]";
const LIMIT = 160;

type Entry = { node: Text; text: string; written: string | null; from: number; length: number };

export type Decoder = { finish: () => void };

const glyph = () => SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)];

/** Visible text nodes in reading order; measured flat, since the window may be squashed mid-reveal. */
function collect(root: HTMLElement) {
  const transform = root.style.transform;
  root.style.transform = "";
  const bounds = root.getBoundingClientRect();
  const scroller = root.querySelector<HTMLElement>(".ax-view-body");
  const scrolled = scroller?.getBoundingClientRect();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue?.trim() || parent.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      const rect = parent.getBoundingClientRect();
      const area = scrolled && scroller?.contains(parent) ? scrolled : bounds;
      if (!rect.width || rect.bottom < area.top || rect.top > area.bottom) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  while (nodes.length < LIMIT && walker.nextNode()) nodes.push(walker.currentNode as Text);
  root.style.transform = transform;
  return nodes;
}

/** Starts decoding `root` over [start, end] ms from now. */
export function decode(root: HTMLElement, start: number, end: number): Decoder {
  const nodes = collect(root);
  if (!nodes.length || end <= start) return { finish() {} };
  const spread = (end - start) * 0.4;
  const entries: Entry[] = nodes.map((node, index) => {
    const text = node.nodeValue ?? "";
    const from = start + (spread * index) / Math.max(1, nodes.length - 1);
    return { node, text, written: null, from, length: Math.max(120, Math.min(end - from, 160 + text.length * 14)) };
  });
  const origin = performance.now();
  let frame = 0;
  let step = -1;
  let done = false;

  const write = (entry: Entry, value: string) => {
    entry.node.nodeValue = value;
    entry.written = value;
  };
  const restore = () => {
    for (const entry of entries) if (entry.written !== null && entry.node.nodeValue === entry.written) entry.node.nodeValue = entry.text;
  };
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    restore();
    root.removeAttribute("aria-busy");
  };
  const tick = (now: number) => {
    const t = now - origin;
    if (t >= end) return finish();
    // Fresh noise about 30 times a second rather than every frame.
    const next = Math.floor(t / 33);
    if (next !== step) {
      step = next;
      for (const entry of entries) {
        // React replaced the text: it owns the node again.
        if (entry.written !== null && entry.node.nodeValue !== entry.written) {
          entry.written = null;
          entry.from = -Infinity;
          continue;
        }
        if (entry.from === -Infinity) continue;
        const p = (t - entry.from) / entry.length;
        if (p >= 1) {
          if (entry.written !== null) write(entry, entry.text);
          entry.from = -Infinity;
          continue;
        }
        const solved = Math.max(0, Math.floor(p * entry.text.length));
        // Before its turn a line shows sparse fragments; then it resolves from the left.
        const density = p < 0 ? 0.45 : 1;
        let value = entry.text.slice(0, solved);
        for (let i = solved; i < entry.text.length; i++) {
          const char = entry.text[i];
          value += /\s/.test(char) ? char : Math.random() < density ? glyph() : "\u2002";
        }
        write(entry, value);
      }
    }
    frame = requestAnimationFrame(tick);
  };
  root.setAttribute("aria-busy", "true");
  tick(origin);
  return { finish };
}
