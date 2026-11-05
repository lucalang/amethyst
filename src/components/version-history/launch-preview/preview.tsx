import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { History, RotateCcw } from "lucide-react";
import { Toaster } from "sonner";
import { Tooltip } from "radix-ui";
import { AppShell } from "historical/components/layout/app-shell";
import HistoricalLibrary from "historical/preview-library";
import { EntryWorkspace } from "historical/components/workspace/workspace";
import { COLLECTIONS } from "historical/lib/collections";
import { filterLibrary, librarySearchSchema } from "historical/lib/progress/library";
import { usePathname, useSearchParams } from "./navigation";
import { CHECKLIST_ID, ENTRY_ID, NOTE_ID, readDetails, resetPreview } from "./state";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const timestamp = "2026-10-01T12:00:00.000Z";

if (location.hash === "#reset") resetPreview();

function Preview() {
  const pathname = usePathname();
  const params = useSearchParams();
  const slug = pathname.split("/")[1];
  const collection = __PREVIEW_LEGACY__ ? {
    slug: "anime" as const, kind: "anime" as const, label: "Library", singular: "entry", newLabel: "New entry", description: "",
  } : COLLECTIONS[slug === "games" || slug === "other" ? slug : "anime"];
  const details = readDetails();
  const checklist = details.find((detail) => detail.node.id === CHECKLIST_ID)!;
  const entry = { id: ENTRY_ID, kind: collection.kind, title: "The Forest Journey", cover_url: "./cover.jpg", banner_url: null, created_at: timestamp, updated_at: timestamp, user_id: "preview" };
  const search = librarySearchSchema.parse(Object.fromEntries(params));
  const library = [{
    id: ENTRY_ID, kind: collection.kind, title: entry.title, coverUrl: entry.cover_url, createdAt: timestamp, lastActivityAt: timestamp,
    summary: { filesTotal: 2, checklistTotal: checklist.items.length, checklistChecked: checklist.items.filter((item) => item.checked).length },
  }];
  const entries = filterLibrary(library, search);
  const file = details.find((detail) => detail.node.id === (params.get("file") ?? NOTE_ID)) ?? details[0];
  return (
    <>
      <div className="preview-bar">
        <span>Demo <strong>{__PREVIEW_SHA__}</strong></span>
        <div>
          <button type="button" onClick={resetPreview} title="Reset only this browser's demo"><RotateCcw size={14} aria-hidden />Reset Demo</button>
          <a href="/version-history" target="_top"><History size={14} aria-hidden />Version History</a>
        </div>
      </div>
      <AppShell displayName="Demo visitor" hasOther>
        {pathname.split("/")[2] === ENTRY_ID ? (
          <EntryWorkspace key={collection.slug} collection={collection} entry={entry} initialNodes={details.map((detail) => detail.node)} initialFile={file} imageHosts={[]} />
        ) : (
          <HistoricalLibrary key={collection.slug} library={library} visible={entries} search={search} collection={collection} slug={collection.slug} />
        )}
      </AppShell>
      <Toaster theme="dark" />
    </>
  );
}

document.addEventListener("submit", (event) => { event.preventDefault(); }, true);
const unavailableAction = /^(Sign out|New |Delete|Rename|Move to|Edit details|Add\b|New$)/i;
function disableSampleOnlyControls() {
  for (const control of document.querySelectorAll<HTMLButtonElement | HTMLTextAreaElement | HTMLElement>('button,[role="menuitem"],textarea')) {
    const label = control.getAttribute("aria-label") ?? control.textContent?.trim() ?? "";
    if (!unavailableAction.test(label)) continue;
    control.setAttribute("aria-disabled", "true");
    control.setAttribute("data-preview-disabled", "true");
    control.title = "Unavailable in this demo";
    if (control instanceof HTMLButtonElement || control instanceof HTMLTextAreaElement) control.disabled = true;
    else control.tabIndex = -1;
  }
}
new MutationObserver(disableSampleOnlyControls).observe(document.getElementById("preview")!, { childList: true, subtree: true });
document.addEventListener("click", (event) => {
  const control = (event.target as Element).closest("button,[role=menuitem]");
  const label = control?.getAttribute("aria-label") ?? control?.textContent?.trim() ?? "";
  if (control && unavailableAction.test(label)) {
    event.preventDefault(); event.stopImmediatePropagation();
  }
}, true);

createRoot(document.getElementById("preview")!).render(<QueryClientProvider client={queryClient}><Tooltip.Provider delayDuration={300}><Preview /></Tooltip.Provider></QueryClientProvider>);