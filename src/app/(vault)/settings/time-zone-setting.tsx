"use client";

import { useState, useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS } from "@/lib/preferences";
import { useOnReset, useSaveSettings } from "./setting-controls";

const noop = () => () => undefined;
let cachedZones: string[] | null = null;
const zones = () => (cachedZones ??= typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []);

/** The zone that decides when "today" starts for My Day; empty follows the device. */
export function TimeZoneSetting({ value, labelId }: { value: string; labelId: string }) {
  const save = useSaveSettings();
  const [shown, setShown] = useState(value);
  const [local, setLocal] = useState(value);
  if (shown !== value) {
    setShown(value);
    setLocal(value);
  }
  useOnReset(["timeZone"], () => setLocal(DEFAULT_SETTINGS.timeZone));
  const device = useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
  const options = useSyncExternalStore(noop, zones, () => null);

  return (
    <select
      aria-labelledby={labelId}
      value={local}
      onChange={(event) => {
        const timeZone = event.target.value;
        setLocal(timeZone);
        void save({ timeZone }).then((ok) => {
          if (!ok) setLocal(value);
        });
      }}
      className="h-10 w-72 max-w-full cursor-pointer rounded-xl border border-input bg-surface px-3 text-sm transition-[border-color,background-color,box-shadow] duration-200 outline-none hover:border-amethyst/50 hover:bg-surface-raised hover:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.08)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 [&>option]:bg-popover"
    >
      <option value="">{device ? `Device time zone (${device.replace(/_/g, " ")})` : "Device time zone"}</option>
      {local && !options?.includes(local) ? <option value={local}>{local.replace(/_/g, " ")}</option> : null}
      {(options ?? []).map((zone) => (
        <option key={zone} value={zone}>
          {zone.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
