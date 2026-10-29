import { GFM, parser } from "@lezer/markdown";
import { TreeFragment, type Tree } from "@lezer/common";

const taskParser = parser.configure(GFM);

function countsFromTree(content: string, tree: Tree): { total: number; checked: number } {
  let total = 0;
  let checked = 0;
  tree.iterate({
    enter(node) {
      if (node.name !== "TaskMarker") return;
      total += 1;
      if (content.slice(node.from + 1, node.to - 1).toLowerCase() === "x") checked += 1;
    },
  });
  return { total, checked };
}

export function markdownTaskCounts(content: string): { total: number; checked: number } {
  return countsFromTree(content, taskParser.parse(content));
}

export function createMarkdownTaskCounter() {
  let previous = "";
  let fragments: readonly TreeFragment[] = [];
  let counts = { total: 0, checked: 0 };
  return (content: string) => {
    if (content === previous) return counts;
    let from = 0;
    while (from < previous.length && from < content.length && previous.charCodeAt(from) === content.charCodeAt(from)) from++;
    let oldEnd = previous.length;
    let newEnd = content.length;
    while (oldEnd > from && newEnd > from && previous.charCodeAt(oldEnd - 1) === content.charCodeAt(newEnd - 1)) {
      oldEnd--;
      newEnd--;
    }
    const changed = TreeFragment.applyChanges(fragments, [{ fromA: from, toA: oldEnd, fromB: from, toB: newEnd }]);
    const tree = taskParser.parse(content, changed);
    fragments = TreeFragment.addTree(tree);
    previous = content;
    counts = countsFromTree(content, tree);
    return counts;
  };
}