/**
 * Text decoding for the Sanctum: visible text in an element briefly shows arcane glyphs that resolve into
 * the real characters, left to right. Purely visual: the element is aria-busy meanwhile, form fields and
 * code are skipped, and text React changes during the effect is left alone.
 */

const GLYPHS = "ΔΘΛΞΠΣΦΨΩ#%&*+=<>/\\|◊※†‡§¤ϟϞϠ";
const SKIP = "input, textarea, select, code, svg, .sr-only, [aria-hidden='true'], [data-no-decode]";
const LIMIT = 180;

type Run = { node: Text; text: string; written: string; reveal: number[] };

export function decodeText(root: HTMLElement, duration = 650, delay = 0): () => void {
  const runs: Run[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP) || !node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node && runs.length < LIMIT; node = walker.nextNode()) {
    const text = (node as Text).data;
    const start = delay + Math.random() * duration * 0.25;
    const span = duration * (0.45 + Math.random() * 0.3);
    runs.push({
      node: node as Text,
      text,
      written: text,
      reveal: [...text].map((_, i, all) => start + (i / Math.max(1, all.length)) * span + Math.random() * 90),
    });
  }
  if (!runs.length) return () => {};

  root.setAttribute("aria-busy", "true");
  const begin = performance.now();
  let frame = 0;
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    for (const run of runs) if (run.node.data === run.written) run.node.data = run.text;
    root.removeAttribute("aria-busy");
  };

  const step = (now: number) => {
    const t = now - begin;
    let pending = false;
    for (const run of runs) {
      if (run.node.data !== run.written) continue;
      const chars = [...run.text];
      let out = "";
      chars.forEach((char, i) => {
        if (t >= run.reveal[i] || char === " " || char === "\n") out += char;
        else {
          pending = true;
          out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
      });
      run.written = out;
      run.node.data = out;
    }
    if (pending) frame = requestAnimationFrame(step);
    else finish();
  };
  frame = requestAnimationFrame(step);
  return finish;
}
