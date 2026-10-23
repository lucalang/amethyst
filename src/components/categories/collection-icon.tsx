import "server-only";
import { createElement } from "react";
import * as lucide from "lucide-react";
import { LibraryBig, type LucideIcon, type LucideProps } from "lucide-react";
import { ICON_NAME_PATTERN, pascalIconName } from "@/lib/collection-identity";

const registry = lucide as unknown as Record<string, LucideIcon | undefined>;

/** The lucide component for a stored icon name (every icon has a `Lucide`-prefixed export). */
function lookup(name: string | null | undefined): LucideIcon | undefined {
  return name && ICON_NAME_PATTERN.test(name) ? registry[`Lucide${pascalIconName(name)}`] : undefined;
}

export const isKnownIcon = (name: string) => lookup(name) !== undefined;

/** A collection's icon, rendered on the server; falls back to the default library icon. */
export function CollectionIcon({ icon, ...props }: { icon?: string | null } & LucideProps) {
  return createElement(lookup(icon) ?? LibraryBig, { "aria-hidden": true, ...props });
}
