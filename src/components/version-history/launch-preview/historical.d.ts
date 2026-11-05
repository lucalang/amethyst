declare module "historical/components/layout/app-shell" {
  import type { ReactNode } from "react";
  export function AppShell(props: { children: ReactNode; displayName: string; hasOther: boolean }): ReactNode;
  export function PageContainer(props: { children: ReactNode; className?: string }): ReactNode;
  export function PageHeader(props: { title: string; description?: string }): ReactNode;
}
declare module "historical/components/media/poster-card" {
  import type { ReactNode } from "react";
  import type { LibraryEntry } from "historical/lib/progress/library";
  export function PosterCard(props: { entry: LibraryEntry; priority?: boolean }): ReactNode;
}
declare module "historical/components/ui/button" {
  import type { ComponentProps, ReactNode } from "react";
  export function Button(props: ComponentProps<"button"> & { asChild?: boolean }): ReactNode;
}
declare module "historical/components/media/library-controls" {
  import type { ReactNode } from "react";
  import type { LibrarySearch } from "historical/lib/progress/library";
  export function LibraryControls(props: { search: LibrarySearch; label: string }): ReactNode;
}
declare module "historical/lib/progress/library" {
  export type LibraryEntry = { id: string; kind: "anime" | "game" | "custom"; title: string; coverUrl: string; createdAt: string; lastActivityAt: string; summary: { filesTotal: number; checklistTotal: number; checklistChecked: number } };
  export type LibrarySearch = { q: string; status: "all" | "in_progress" | "completed" | "not_started"; sort: "recent" | "title" | "progress" | "added" };
  export const librarySearchSchema: { parse(value: unknown): LibrarySearch };
  export function filterLibrary(entries: LibraryEntry[], search: LibrarySearch): LibraryEntry[];
}
declare module "historical/lib/collections" {
  export type Collection = { slug: "anime" | "games" | "other"; kind: "anime" | "game" | "custom"; label: string; singular: string; newLabel: string; description: string };
  export const COLLECTIONS: Record<Collection["slug"], Collection>;
}
declare module "historical/components/workspace/workspace" {
  import type { ReactNode } from "react";
  import type { Collection } from "historical/lib/collections";
  import type { PreviewDetail, PreviewNode } from "./state";
  export function EntryWorkspace(props: { collection: Collection; entry: { id: string; kind: string; title: string; cover_url: string; banner_url: string | null; created_at: string; updated_at: string; user_id: string }; initialNodes: PreviewNode[]; initialFile: PreviewDetail | null; imageHosts?: string[] }): ReactNode;
}
declare module "historical/preview-library" {
  import type { ReactNode } from "react";
  import type { Collection } from "historical/lib/collections";
  import type { LibraryEntry, LibrarySearch } from "historical/lib/progress/library";
  export default function HistoricalLibrary(props: { library: LibraryEntry[]; visible: LibraryEntry[]; search: LibrarySearch; collection: Collection; slug: string }): ReactNode;
}
declare const __PREVIEW_SHA__: string;
declare const __PREVIEW_DEFAULT_PATH__: string;
declare const __PREVIEW_LEGACY__: boolean;