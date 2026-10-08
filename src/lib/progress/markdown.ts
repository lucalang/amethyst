import { GFM, parser } from "@lezer/markdown";

const taskParser = parser.configure(GFM);

export function markdownTaskCounts(content: string): { total: number; checked: number } {
  let total = 0;
  let checked = 0;
  taskParser.parse(content).iterate({
    enter(node) {
      if (node.name !== "TaskMarker") return;
      total += 1;
      if (content.slice(node.from + 1, node.to - 1).toLowerCase() === "x") checked += 1;
    },
  });
  return { total, checked };
}