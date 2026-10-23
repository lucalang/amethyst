import { z } from "zod";

/** How pinned/progress details are shown on cover artwork. */
export const PIN_STYLES = ["current", "clean"] as const;
export type PinStyle = (typeof PIN_STYLES)[number];
export const DEFAULT_PIN_STYLE: PinStyle = "current";

export const isPinStyle = (value: unknown): value is PinStyle => PIN_STYLES.includes(value as PinStyle);

/** Account-level preferences. Add new fields here and in the users table as settings grow. */
export const preferencesSchema = z
  .object({
    pinStyle: z.enum(PIN_STYLES).optional(),
    introSeenOn: z.iso.date().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update.");

export type Preferences = { pinStyle: PinStyle };
