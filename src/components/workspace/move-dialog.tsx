"use client";

import { useState } from "react";
import { Folder, FolderInput, Loader2, SquareDashed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { buildTree, canMoveTo, type TreeNode, type WorkspaceNode } from "@/lib/workspace/tree";

type Option = { id: string | null; name: string; depth: number; disabled: boolean };

function folderOptions(nodes: readonly WorkspaceNode[], movingId: string): Option[] {
  const options: Option[] = [{ id: null, name: "Workspace root", depth: 0, disabled: !canMoveTo(nodes, movingId, null) }];
  const walk = (tree: readonly TreeNode[]) => {
    for (const node of tree) {
      if (node.kind !== "folder") continue;
      options.push({ id: node.id, name: node.name, depth: node.depth + 1, disabled: !canMoveTo(nodes, movingId, node.id) });
      // Never offer the moving folder's own subtree.
      if (node.id !== movingId) walk(node.children);
    }
  };
  walk(buildTree(nodes));
  return options;
}

/** Keyboard- and touch-friendly alternative to drag and drop. */
export function MoveDialog({
  nodes,
  movingId,
  onClose,
  onMove,
}: {
  nodes: readonly WorkspaceNode[];
  movingId: string | null;
  onClose: () => void;
  onMove: (id: string, parentId: string | null) => Promise<void>;
}) {
  const moving = nodes.find((node) => node.id === movingId);
  return (
    <Dialog open={Boolean(moving)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {moving ? <MoveForm key={moving.id} nodes={nodes} moving={moving} onClose={onClose} onMove={onMove} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function MoveForm({
  nodes,
  moving,
  onClose,
  onMove,
}: {
  nodes: readonly WorkspaceNode[];
  moving: WorkspaceNode;
  onClose: () => void;
  onMove: (id: string, parentId: string | null) => Promise<void>;
}) {
  const options = folderOptions(nodes, moving.id);
  const [target, setTarget] = useState<string | null | undefined>(() => options.find((option) => !option.disabled)?.id);
  const [pending, setPending] = useState(false);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Move “{moving.name}”</DialogTitle>
        <DialogDescription>Choose the folder it should live in.</DialogDescription>
      </DialogHeader>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (target === undefined) return;
          setPending(true);
          try {
            await onMove(moving.id, target);
            onClose();
          } catch {
            // onMove reports the failure.
          } finally {
            setPending(false);
          }
        }}
        className="space-y-4"
      >
        <fieldset className="max-h-[50vh] overflow-y-auto rounded-md border border-border py-1">
          <legend className="sr-only">Destination folder</legend>
          {options.map((option) => (
            <label
              key={option.id ?? "root"}
              className={cn(
                "flex min-h-9 cursor-pointer items-center gap-2 pr-3 text-sm has-[:focus-visible]:bg-secondary pointer-coarse:min-h-11",
                option.disabled ? "cursor-not-allowed text-muted-foreground/60" : "hover:bg-secondary/60",
                target === option.id && "bg-secondary",
              )}
              style={{ paddingLeft: 12 + option.depth * 16 }}
            >
              <input
                type="radio"
                name="destination"
                value={option.id ?? ""}
                checked={target === option.id}
                disabled={option.disabled}
                onChange={() => setTarget(option.id)}
                className="accent-[var(--amethyst)]"
              />
              {option.id === null ? (
                <SquareDashed aria-hidden className="size-4 text-muted-foreground" />
              ) : (
                <Folder aria-hidden className="size-4 text-amethyst/90" />
              )}
              <span className="truncate">{option.name}</span>
              {option.id === moving.parentId ? <span className="ml-auto text-xs text-muted-foreground">current</span> : null}
            </label>
          ))}
        </fieldset>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || target === undefined}>
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <FolderInput aria-hidden />} Move here
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
