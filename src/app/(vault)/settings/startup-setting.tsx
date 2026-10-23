"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_SETTINGS, type StartupDestination } from "@/lib/preferences";
import { ChoiceCards, useOnReset, useSaveSettings, type Choice } from "./setting-controls";

const OPTIONS: Choice<StartupDestination>[] = [
  { value: "home", title: "Home", description: "Your dashboard with recent and pinned entries." },
  { value: "collection", title: "A collection", description: "Go straight to the collection you choose." },
  { value: "last", title: "Last workspace", description: "Reopen the entry and file you used most recently." },
];

/** Where the app opens after signing in or starting a new browser session. */
export function StartupSetting({
  value,
  collectionId,
  collections,
  labelId,
}: {
  value: StartupDestination;
  collectionId: string | null;
  collections: { id: string; name: string }[];
  labelId: string;
}) {
  const save = useSaveSettings();
  const server = { startup: value, startupCollectionId: collectionId };
  const [shown, setShown] = useState(server);
  const [local, setLocal] = useState(server);
  if (shown.startup !== value || shown.startupCollectionId !== collectionId) {
    setShown(server);
    setLocal(server);
  }
  useOnReset(["startup", "startupCollectionId"], () =>
    setLocal({ startup: DEFAULT_SETTINGS.startup, startupCollectionId: DEFAULT_SETTINGS.startupCollectionId }),
  );

  function update(next: typeof local) {
    setLocal(next);
    void save(next).then((ok) => {
      if (!ok) setLocal(server);
    });
  }

  const selectedCollection = collections.some((collection) => collection.id === local.startupCollectionId) ? local.startupCollectionId : null;

  return (
    <div className="space-y-4">
      <ChoiceCards
        name="startup"
        labelId={labelId}
        value={local.startup}
        options={OPTIONS}
        onChange={(startup) =>
          update({ startup, startupCollectionId: startup === "collection" ? (selectedCollection ?? collections[0]?.id ?? null) : local.startupCollectionId })
        }
      />
      {local.startup === "collection" ? (
        collections.length ? (
          <div className="flex flex-wrap items-center gap-3">
            <span id="startup-collection-label" className="text-sm text-muted-foreground">
              Open
            </span>
            <Select value={selectedCollection ?? undefined} onValueChange={(id) => update({ startup: "collection", startupCollectionId: id })}>
              <SelectTrigger aria-labelledby="startup-collection-label" className="w-64 max-w-full">
                <SelectValue placeholder="Choose a collection" />
              </SelectTrigger>
              <SelectContent>
                {collections.map((collection) => (
                  <SelectItem key={collection.id} value={collection.id}>
                    {collection.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">You don’t have any collections yet, so Home opens instead.</p>
        )
      ) : null}
      <p className="text-xs text-muted-foreground">Applies when you sign in or open the app in a new browser session.</p>
    </div>
  );
}
