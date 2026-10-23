"use client";

import { useState, startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Copy, FileText, Folder, LayoutTemplate, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/components/workspace/client-utils";
import { apiFetch } from "@/lib/api-client";
import { templateNameSchema, type TemplateSummary } from "@/lib/templates";

type Created = { template: { id: string; name: string } };

/** Name dialog used for both "New template" and "Rename". */
export function TemplateNameDialog({
  open,
  onOpenChange,
  template,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: { id: string; name: string };
  onSaved: (template: { id: string; name: string }) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `template-name-${template?.id ?? "new"}`;
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) { setError(null); onOpenChange(next); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{template ? "Rename template" : "New template"}</DialogTitle>
          <DialogDescription>{template ? "Entries already created from it are not affected." : "You can add folders, notes and checklists next."}</DialogDescription>
        </DialogHeader>
        <form
          key={String(open)}
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const parsed = templateNameSchema.safeParse(new FormData(event.currentTarget).get("name") ?? "");
            if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Enter a name."); return; }
            setPending(true);
            setError(null);
            try {
              const result = await apiFetch<Created>(template ? `/api/templates/${template.id}` : "/api/templates", {
                method: template ? "PATCH" : "POST",
                json: { name: parsed.data },
              });
              onSaved(result.template);
            } catch (saveError) {
              setError(errorMessage(saveError));
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={id}>Name</Label>
            <Input id={id} name="name" defaultValue={template?.name} placeholder="e.g. Game playthrough" maxLength={80} autoComplete="off" autoFocus required disabled={pending} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
          </div>
          {error ? <p id={`${id}-error`} role="alert" className="flex items-start gap-2 text-xs leading-5 text-rose"><AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending} className="gap-2">{pending ? <Loader2 aria-hidden className="animate-spin" /> : null}{template ? "Save" : "Create template"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewTemplateButton({ label = "New template" }: { label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" className="h-9 gap-2 px-3" onClick={() => setOpen(true)}><Plus aria-hidden /> {label}</Button>
      <TemplateNameDialog
        open={open}
        onOpenChange={setOpen}
        onSaved={(template) => {
          setOpen(false);
          router.push(`/settings/templates/${template.id}`);
        }}
      />
    </>
  );
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function TemplateList({ templates, defaults }: { templates: TemplateSummary[]; defaults: Record<string, string[]> }) {
  if (templates.length === 0) {
    return (
      <div className="enter enter-soft flex flex-col items-start gap-4 rounded-lg border border-dashed border-white/[0.1] px-5 py-7 text-sm text-muted-foreground sm:flex-row sm:items-center">
        <LayoutTemplate aria-hidden className="size-5 shrink-0 text-amethyst/70" />
        <p className="flex-1">No templates yet. A template sets up folders, notes and checklists for a new entry, such as a reading log or a game checklist.</p>
        <NewTemplateButton label="Create your first template" />
      </div>
    );
  }
  return (
    <ul aria-label="Your templates" className="enter enter-soft divide-y divide-white/[0.06] border-y border-white/[0.08]">
      {templates.map((template) => <TemplateRow key={template.id} template={template} defaultFor={defaults[template.id] ?? []} />)}
    </ul>
  );
}

function TemplateRow({ template, defaultFor }: { template: TemplateSummary; defaultFor: string[] }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const empty = template.files === 0 && template.folders === 0;

  async function duplicate() {
    setBusy(true);
    try {
      const { template: copy } = await apiFetch<Created>(`/api/templates/${template.id}/duplicate`, { method: "POST" });
      toast.success(`Created “${copy.name}”.`);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(`Couldn’t duplicate “${template.name}”: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await apiFetch(`/api/templates/${template.id}`, { method: "DELETE" });
      toast.success(`Deleted “${template.name}”.`);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(`Couldn’t delete “${template.name}”: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="group/template flex items-center gap-3 px-3 transition-colors hover:bg-white/[0.025] focus-within:bg-white/[0.025]">
      <Link href={`/settings/templates/${template.id}`} className="flex min-h-18 min-w-0 flex-1 items-center gap-3.5 py-3.5">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center self-start rounded-md border border-white/[0.08] bg-surface-raised text-amethyst/80 transition-[color,background-color,border-color] group-hover/template:border-amethyst/30 group-hover/template:bg-amethyst/[0.08] group-hover/template:text-amethyst">
          <LayoutTemplate className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium break-words text-foreground transition-colors group-hover/template:text-amethyst">{template.name}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {empty ? <span>Empty</span> : (
              <>
                <span className="inline-flex items-center gap-1"><Folder aria-hidden className="size-3.5" />{plural(template.folders, "folder")}</span>
                <span className="inline-flex items-center gap-1"><FileText aria-hidden className="size-3.5" />{plural(template.files, "file")}</span>
              </>
            )}
            {defaultFor.length ? <span className="min-w-0 truncate text-amethyst/90">Default for {defaultFor.join(", ")}</span> : null}
          </span>
        </span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" aria-label={`Actions for ${template.name}`} disabled={busy}>
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : <MoreHorizontal aria-hidden />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild><Link href={`/settings/templates/${template.id}`}><LayoutTemplate aria-hidden /> Edit contents</Link></DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRenaming(true)}><Pencil aria-hidden /> Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void duplicate()}><Copy aria-hidden /> Duplicate</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}><Trash2 aria-hidden /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TemplateNameDialog
        open={renaming}
        onOpenChange={setRenaming}
        template={template}
        onSaved={() => {
          setRenaming(false);
          startTransition(() => router.refresh());
        }}
      />
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{template.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Entries created from this template keep their files.
              {defaultFor.length ? ` ${defaultFor.join(", ")} will go back to starting new entries without a template.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
