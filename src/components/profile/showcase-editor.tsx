"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Eye, Gem, LibraryBig, Loader2, PenLine, Plus, Trash2, X } from "lucide-react";
import { AchievementBadge } from "@/components/achievements/achievement-badge";
import { CatalogSearch, FilterChip } from "@/components/catalog/catalog-search";
import { useCosmetics } from "@/components/layout/cosmetics-context";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { BadgeEmblem } from "@/components/layout/profile-flair";
import { Button } from "@/components/ui/button";
import { deleteLook, renameLook, saveShowcase, type ShowcaseInput, type ShowcaseSaveState } from "@/app/(vault)/profile/actions";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { apiFetch } from "@/lib/api-client";
import { artworkSrc, artworkVariantSrc } from "@/lib/attachments";
import {
  AVATAR_DECORATION_IDS,
  AVATAR_DECORATIONS,
  MAX_PROFILE_BADGES,
  PROFILE_BADGE_IDS,
  PROFILE_BADGES,
  PROFILE_TITLE_IDS,
  PROFILE_TITLES,
  type AvatarDecorationId,
  type ProfileBadgeId,
  type ProfileTitleId,
} from "@/lib/cosmetics";
import type { SavedLook, ShowcaseChoice, ShowcaseEditorData } from "@/lib/data/profiles";
import {
  DEFAULT_PROFILE_STYLE,
  MAX_PROFILE_LOOKS,
  MAX_SHOWCASE_ACHIEVEMENTS,
  MAX_SHOWCASE_ITEMS,
  PROFILE_AMBIENT_IDS,
  PROFILE_AMBIENTS,
  PROFILE_SECTION_IDS,
  PROFILE_SECTIONS,
  PROFILE_STYLE_IDS,
  PROFILE_STYLES,
  pedestalCollectible,
  type PedestalCollectible,
  type ShowcaseArrangement,
  type ShowcasePiece,
  type ShowcaseShape,
} from "@/lib/profile-styles";
import { cn } from "@/lib/utils";
import { ShowcaseStage, type ShowcaseIdentity } from "./showcase-stage";

type DraftItem = ShowcaseChoice & { showTitle: boolean };
type EntryResult = { id: string; title: string; collectionName: string; coverUrl: string | null; coverShape: "square" | "portrait" };

const itemKey = (item: { kind: string; id: string }) => `${item.kind}:${item.id}`;

export const toPiece = (item: DraftItem): ShowcasePiece => ({
  key: itemKey(item),
  kind: item.kind,
  title: item.showTitle ? item.name : null,
  accent: item.accent,
  shape: item.shape,
  src: artworkSrc(item.art),
});

function move<T>(list: readonly T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

function Thumb({ art, shape, accent, kind }: { art: string | null; shape: ShowcaseShape; accent?: string | null; kind: "entry" | "collection" }) {
  const Icon = kind === "collection" ? LibraryBig : Gem;
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-[3px] bg-amethyst/10 text-amethyst ring-1 ring-foreground/10",
        shape === "wide" ? "h-8 w-14" : shape === "square" ? "size-10" : "h-11 w-8",
      )}
      style={accent ? { backgroundColor: `${accent}55` } : undefined}
    >
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element -- the owner's own artwork through the private image routes
        <img src={artworkVariantSrc(art, 128)} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      ) : (
        <Icon className="size-4" />
      )}
    </span>
  );
}

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  const id = `pf-edit-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="space-y-3 border-t border-foreground/[0.07] pt-5 first:border-t-0 first:pt-0">
      <div>
        <h2 id={id} className="text-sm font-semibold">
          {title}
        </h2>
        {hint ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function OrderButtons({ label, index, count, onMove, onRemove }: { label: string; index: number; count: number; onMove: (delta: -1 | 1) => void; onRemove?: () => void }) {
  return (
    <span className="flex shrink-0">
      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Move ${label} earlier`} disabled={index === 0} onClick={() => onMove(-1)}>
        <ArrowUp aria-hidden />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Move ${label} later`} disabled={index === count - 1} onClick={() => onMove(1)}>
        <ArrowDown aria-hidden />
      </Button>
      {onRemove ? (
        <Button type="button" variant="ghost" size="icon" className="size-8 hover:text-rose" aria-label={`Remove ${label}`} onClick={onRemove}>
          <X aria-hidden />
        </Button>
      ) : null}
    </span>
  );
}

const chip =
  "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";
const chipOn = "border-amethyst/60 bg-amethyst/[0.1] text-foreground";
const chipOff = "border-border text-muted-foreground hover:border-amethyst/40 hover:text-foreground";

/** The owner's showcase editor: the stage on the left is a live preview of every change. */
export function ShowcaseEditor({
  memberId,
  identity,
  initial,
  data,
  onClose,
}: {
  memberId: string;
  identity: ShowcaseIdentity;
  initial: ShowcaseArrangement;
  data: ShowcaseEditorData;
  onClose: (saved?: boolean) => void;
}) {
  const router = useRouter();
  const cosmetics = useCosmetics();
  const earned = new Set(data.earned);
  const [style, setStyle] = useState(initial.style);
  const [sections, setSections] = useState(initial.sections);
  const [ambient, setAmbient] = useState(initial.ambient);
  const [pedestal, setPedestal] = useState(initial.pedestal);
  const [achievements, setAchievements] = useState(() => initial.achievements.filter((id) => earned.has(id)));
  const [items, setItems] = useState<DraftItem[]>(data.items);
  const [looks, setLooks] = useState<SavedLook[]>(data.looks);
  const [worn, setWorn] = useState(data.activeLook);
  const [lookId, setLookId] = useState(data.activeLook);
  const [lookPanel, setLookPanel] = useState<"create" | "rename" | "delete" | null>(null);
  const [lookName, setLookName] = useState("");
  const [replacement, setReplacement] = useState<string>("default");
  const [badges, setBadges] = useState<ProfileBadgeId[]>(() => identity.badges.filter((id) => cosmetics.owned.includes(id)));
  const [title, setTitle] = useState<ProfileTitleId | null>(identity.title);
  const [decoration, setDecoration] = useState<AvatarDecorationId | null>(identity.decoration);
  const [source, setSource] = useState<"entries" | "collections">("entries");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<ShowcaseSaveState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const results = useQuery({
    queryKey: ["showcase-entry-search", debounced],
    queryFn: ({ signal }) => apiFetch<{ entries: EntryResult[] }>(`/api/entries?artwork=1&q=${encodeURIComponent(debounced)}`, { signal }),
    enabled: source === "entries",
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const ownedTitles = PROFILE_TITLE_IDS.filter((id) => cosmetics.owned.includes(id));
  const ownedDecorations = AVATAR_DECORATION_IDS.filter((id) => cosmetics.owned.includes(id));
  const ownedBadges = PROFILE_BADGE_IDS.filter((id) => cosmetics.owned.includes(id));
  const earnedAchievements = ACHIEVEMENTS.filter((item) => earned.has(item.id));
  const itemsFull = items.length >= MAX_SHOWCASE_ITEMS;
  const pinsFull = achievements.length >= MAX_SHOWCASE_ACHIEVEMENTS;
  const selectedKeys = new Set(items.map(itemKey));

  function toggleItem(choice: ShowcaseChoice) {
    const key = itemKey(choice);
    if (selectedKeys.has(key)) {
      setItems(items.filter((item) => itemKey(item) !== key));
      setNote(`${choice.name} removed from your showcase.`);
    } else if (!itemsFull) {
      setItems([...items, { ...choice, showTitle: true }]);
      setNote(`${choice.name} featured in position ${items.length + 1}.`);
    }
  }
  function toggleAchievement(id: string, name: string) {
    if (achievements.includes(id)) {
      setAchievements(achievements.filter((item) => item !== id));
      setNote(`${name} unpinned.`);
    } else if (!pinsFull) {
      setAchievements([...achievements, id]);
      setNote(`${name} pinned in position ${achievements.length + 1}.`);
    }
  }
  function toggleBadge(id: ProfileBadgeId) {
    if (badges.includes(id)) setBadges(badges.filter((item) => item !== id));
    else if (badges.length < MAX_PROFILE_BADGES) setBadges([...badges, id]);
  }

  const ownedPedestal = [...new Set(cosmetics.owned)].flatMap((id) => pedestalCollectible(id) ?? []);
  const selectedLook = looks.find((look) => look.id === lookId) ?? null;

  function input(arrangement: ShowcaseArrangement & { items: DraftItem[] }, look: ShowcaseInput["look"]): ShowcaseInput {
    return {
      style: arrangement.style,
      sections: arrangement.sections,
      ambient: arrangement.ambient,
      pedestal: arrangement.pedestal,
      achievements: arrangement.achievements,
      items: arrangement.items.map((item) => ({ kind: item.kind, id: item.id, showTitle: item.showTitle })),
      badges,
      title,
      decoration,
      look,
    };
  }
  const draft = { style, sections, ambient, pedestal, achievements, items };
  const defaultLook = { ...draft, style: DEFAULT_PROFILE_STYLE, sections: PROFILE_SECTION_IDS, ambient: PROFILE_STYLES[DEFAULT_PROFILE_STYLE].ambient };

  function apply(look: ShowcaseArrangement & { items: DraftItem[] }, id: string | null) {
    setStyle(look.style);
    setSections(look.sections);
    setAmbient(look.ambient);
    setPedestal(look.pedestal);
    setAchievements(look.achievements.filter((item) => earned.has(item)));
    setItems(look.items);
    setLookId(id);
    setLookPanel(null);
  }

  function save(look: ShowcaseInput["look"]) {
    setState({ status: "idle" });
    startTransition(async () => {
      const result = await saveShowcase(input(draft, look));
      setState(result);
      if (result.status === "success") {
        router.refresh();
        onClose(true);
      }
    });
  }

  function rename() {
    if (!selectedLook) return;
    const name = lookName.trim();
    startTransition(async () => {
      const result = await renameLook(selectedLook.id, name);
      setState(result);
      if (result.status === "success") {
        setLooks(looks.map((look) => (look.id === selectedLook.id ? { ...look, name } : look)));
        setLookPanel(null);
      }
    });
  }

  function remove() {
    if (!selectedLook) return;
    const wearing = selectedLook.id === worn;
    const next = replacement === "default" ? null : (looks.find((look) => look.id === replacement && look.id !== selectedLook.id) ?? null);
    const wear = next ? { ...next, items: next.items } : defaultLook;
    startTransition(async () => {
      const result = await deleteLook(selectedLook.id, wearing ? input(wear, { id: next?.id ?? null }) : null);
      setState(result);
      if (result.status !== "success") return;
      setLooks(looks.filter((look) => look.id !== selectedLook.id));
      if (wearing) {
        setWorn(next?.id ?? null);
        apply(wear, next?.id ?? null);
        router.refresh();
      } else {
        setLookId(null);
        setLookPanel(null);
      }
    });
  }

  const entryChoices: ShowcaseChoice[] = (results.data?.entries ?? []).map((entry) => ({
    kind: "entry",
    id: entry.id,
    name: entry.title,
    accent: null,
    shape: entry.coverShape,
    art: entry.coverUrl,
  }));
  const collectionChoices = data.collections.filter((item) => !query.trim() || item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const choices = source === "entries" ? entryChoices : collectionChoices;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
      <div className="min-w-0 lg:sticky lg:top-20">
        <ShowcaseStage
          memberId={memberId}
          arrangement={{ style, sections, ambient, pedestal, achievements }}
          identity={{ ...identity, badges, title, decoration }}
          pieces={items.map(toPiece)}
          own
          previewing
        />
        <p className="mt-3 flex items-start gap-2 px-1 text-xs leading-5 text-muted-foreground">
          <Eye aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          Live preview. Other members see only this display: never your email, coins, notes, tasks or anything you haven’t featured.
        </p>
      </div>

      <div aria-label="Arrange your showcase" role="region" className="rounded-2xl border border-amethyst/20 bg-[var(--surface-raised)]/70 shadow-[0_24px_60px_-40px_rgb(var(--shadow-rgb)/0.9)]">
        <div className="space-y-5 p-4 md:p-5">
          <Section title="Saved looks" hint={`Keep up to ${MAX_PROFILE_LOOKS} arrangements — style, section order, featured pieces, centerpiece and ambience — and switch between them.`}>
            <div role="radiogroup" aria-label="Saved looks" className="flex flex-wrap gap-1.5">
              {[null, ...looks].map((look) => {
                const id = look?.id ?? null;
                return (
                  <button
                    key={id ?? "draft"}
                    type="button"
                    role="radio"
                    aria-checked={lookId === id}
                    className={cn(chip, lookId === id ? chipOn : chipOff)}
                    onClick={() => (look ? apply(look, look.id) : (setLookId(null), setLookPanel(null)))}
                  >
                    {look ? look.name : "Unsaved arrangement"}
                    {id && id === worn ? <span className="text-[10px] font-semibold text-amethyst uppercase">Wearing</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" size="sm" variant="outline" disabled={pending || looks.length >= MAX_PROFILE_LOOKS} aria-expanded={lookPanel === "create"} onClick={() => { setLookName(""); setLookPanel(lookPanel === "create" ? null : "create"); }}>
                <Plus aria-hidden /> Save as new look
              </Button>
              {selectedLook ? (
                <>
                  <Button type="button" size="sm" variant="ghost" disabled={pending} aria-expanded={lookPanel === "rename"} onClick={() => { setLookName(selectedLook.name); setLookPanel(lookPanel === "rename" ? null : "rename"); }}>
                    <PenLine aria-hidden /> Rename
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="hover:text-rose" disabled={pending} aria-expanded={lookPanel === "delete"} onClick={() => { setReplacement("default"); setLookPanel(lookPanel === "delete" ? null : "delete"); }}>
                    <Trash2 aria-hidden /> Delete
                  </Button>
                </>
              ) : null}
            </div>
            {looks.length >= MAX_PROFILE_LOOKS ? <p className="text-xs text-muted-foreground">You have {MAX_PROFILE_LOOKS} looks — delete one to save another.</p> : null}
            {lookPanel === "create" || (lookPanel === "rename" && selectedLook) ? (
              <form
                className="flex gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (lookPanel === "create") save({ create: lookName });
                  else rename();
                }}
              >
                <input
                  autoFocus
                  value={lookName}
                  maxLength={40}
                  onChange={(event) => setLookName(event.target.value)}
                  aria-label={lookPanel === "create" ? "New look name" : "Look name"}
                  placeholder="e.g. Autumn gallery"
                  className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                />
                <Button type="submit" size="sm" disabled={pending || !lookName.trim()}>
                  {lookPanel === "create" ? "Save and wear" : "Rename"}
                </Button>
              </form>
            ) : null}
            {lookPanel === "delete" && selectedLook ? (
              <div className="space-y-2 rounded-lg border border-rose/30 bg-rose/[0.05] p-2.5 text-xs">
                {selectedLook.id === worn ? (
                  <label className="flex flex-col gap-1.5">
                    <span>You’re wearing “{selectedLook.name}”. Choose what to wear instead:</span>
                    <select value={replacement} onChange={(event) => setReplacement(event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                      <option value="default">Default look (Gallery wall)</option>
                      {looks
                        .filter((look) => look.id !== selectedLook.id)
                        .map((look) => (
                          <option key={look.id} value={look.id}>
                            {look.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : (
                  <p>Delete “{selectedLook.name}”? Your current showcase stays as it is.</p>
                )}
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={remove}>
                    Delete look
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setLookPanel(null)}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : null}
          </Section>

          <Section title="Display style" hint="How your case is arranged. You can switch any time.">
            <div role="radiogroup" aria-label="Display style" className="grid grid-cols-3 gap-2">
              {PROFILE_STYLE_IDS.map((id) => (
                <label key={id} title={PROFILE_STYLES[id].description} className={cn("flex cursor-pointer flex-col gap-1.5 rounded-lg border p-1.5 text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", style === id ? chipOn : chipOff)}>
                  <input type="radio" name="pf-style" value={id} checked={style === id} onChange={() => setStyle(id)} className="sr-only" />
                  <span aria-hidden className="pf-swatch" data-pf-style={id}>
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="px-0.5 font-medium">{PROFILE_STYLES[id].name}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{PROFILE_STYLES[style].description}</p>
          </Section>

          <Section title="Section order" hint="Sections appear below your nameplate in this order. Empty sections are hidden.">
            <ol aria-label="Sections, in display order" className="space-y-1.5">
              {sections.map((id, index) => (
                <li key={id} className="flex items-center gap-2 rounded-lg border border-border py-1 pr-1 pl-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{PROFILE_SECTIONS[id].name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{PROFILE_SECTIONS[id].description}</span>
                  </span>
                  <OrderButtons
                    label={PROFILE_SECTIONS[id].name}
                    index={index}
                    count={sections.length}
                    onMove={(delta) => {
                      setSections(move(sections, index, delta));
                      setNote(`${PROFILE_SECTIONS[id].name} moved to position ${index + delta + 1}.`);
                    }}
                  />
                </li>
              ))}
            </ol>
          </Section>

          <Section title="Ambient effect" hint="A quiet background touch. Off keeps the room completely still; reduced-motion settings always show a still version.">
            <div role="radiogroup" aria-label="Ambient effect" className="flex flex-wrap gap-1.5">
              {PROFILE_AMBIENT_IDS.map((id) => (
                <label key={id} title={PROFILE_AMBIENTS[id].description} className={cn(chip, "cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", ambient === id ? chipOn : chipOff)}>
                  <input type="radio" name="pf-ambient" value={id} checked={ambient === id} onChange={() => setAmbient(id)} className="sr-only" />
                  {PROFILE_AMBIENTS[id].name}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{PROFILE_AMBIENTS[ambient].description}</p>
          </Section>

          <Section title="Centerpiece" hint="One collectible you own, lit on a pedestal.">
            {ownedPedestal.length ? (
              <div role="radiogroup" aria-label="Centerpiece" className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto pr-1">
                {[null, ...ownedPedestal].map((item: PedestalCollectible | null) => {
                  const id = item?.id ?? null;
                  return (
                    <button key={id ?? "none"} type="button" role="radio" aria-checked={pedestal === id} title={item?.description} className={cn(chip, pedestal === id ? chipOn : chipOff)} onClick={() => setPedestal(id)}>
                      {item ? (
                        <span className="min-w-0">
                          <span className="block font-medium text-foreground">{item.name}</span>
                          <span className="block text-[10px]">{item.label}</span>
                        </span>
                      ) : (
                        "No centerpiece"
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Collect something in the{" "}
                <Link href="/arcade" className="text-amethyst underline-offset-4 hover:underline">
                  Arcade
                </Link>{" "}
                or Vault to put it on display.
              </p>
            )}
          </Section>

          <Section
            title="Worn collectibles"
            hint={
              <>
                Only pieces you own appear here. Name, picture and motto live in{" "}
                <Link href="/customization/profile" className="text-amethyst underline-offset-4 hover:underline">
                  Customization → Profile
                </Link>
                .
              </>
            }
          >
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Title</p>
              <div className="flex flex-wrap gap-1.5">
                {[null, ...ownedTitles].map((id) => (
                  <button key={id ?? "none"} type="button" aria-pressed={title === id} className={cn(chip, title === id ? chipOn : chipOff)} onClick={() => setTitle(id)}>
                    {id ? PROFILE_TITLES[id].name : "No title"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Avatar decoration</p>
              <div className="flex flex-wrap gap-1.5">
                {[null, ...ownedDecorations].map((id) => (
                  <button key={id ?? "none"} type="button" aria-pressed={decoration === id} className={cn(chip, decoration === id ? chipOn : chipOff)} onClick={() => setDecoration(id)}>
                    <span className="grid size-7 place-items-center">
                      <ProfileAvatar name={identity.hasName ? identity.name : null} src={identity.avatar.src} decoration={id} className="size-5 text-[8px]" />
                    </span>
                    {id ? AVATAR_DECORATIONS[id].name : "None"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Badges <span className="tabular-nums">({badges.length}/{MAX_PROFILE_BADGES}, in the order you pick them)</span>
              </p>
              {ownedBadges.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {ownedBadges.map((id) => {
                    const position = badges.indexOf(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={position >= 0}
                        disabled={position < 0 && badges.length >= MAX_PROFILE_BADGES}
                        className={cn(chip, position >= 0 ? chipOn : chipOff)}
                        onClick={() => toggleBadge(id)}
                      >
                        <BadgeEmblem badge={id} className="size-5" />
                        {PROFILE_BADGES[id].name}
                        {position >= 0 ? <span className="text-[10px] text-amethyst tabular-nums">{position + 1}</span> : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No badges yet — earn them in the{" "}
                  <Link href="/achievements" className="text-amethyst underline-offset-4 hover:underline">
                    Trophy Room
                  </Link>{" "}
                  or the Vault.
                </p>
              )}
            </div>
          </Section>

          <Section title="Pinned achievements" hint={`Up to ${MAX_SHOWCASE_ACHIEVEMENTS} medals you have earned, shown in this order.`}>
            {achievements.length ? (
              <ol aria-label="Pinned achievements, in display order" className="space-y-1.5">
                {achievements.map((id, index) => {
                  const medal = ACHIEVEMENTS.find((item) => item.id === id);
                  if (!medal) return null;
                  return (
                    <li key={id} className="flex items-center gap-2 rounded-lg border border-amethyst/30 bg-amethyst/[0.06] py-1 pr-1 pl-2 text-sm">
                      <AchievementBadge achievement={medal} earned size={26} />
                      <span className="min-w-0 flex-1 truncate font-medium">{medal.name}</span>
                      <OrderButtons
                        label={medal.name}
                        index={index}
                        count={achievements.length}
                        onMove={(delta) => setAchievements(move(achievements, index, delta))}
                        onRemove={() => toggleAchievement(id, medal.name)}
                      />
                    </li>
                  );
                })}
              </ol>
            ) : null}
            {earnedAchievements.length ? (
              <div role="group" aria-label="Earned achievements" className="flex flex-wrap gap-1.5">
                {earnedAchievements.map((medal) => {
                  const on = achievements.includes(medal.id);
                  return (
                    <button
                      key={medal.id}
                      type="button"
                      aria-pressed={on}
                      disabled={!on && pinsFull}
                      title={medal.description}
                      className={cn(chip, on ? chipOn : chipOff)}
                      onClick={() => toggleAchievement(medal.id, medal.name)}
                    >
                      <AchievementBadge achievement={medal} earned size={22} />
                      {medal.name}
                      {on ? <Check aria-hidden className="size-3 text-amethyst" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Earn your first achievement in the{" "}
                <Link href="/achievements" className="text-amethyst underline-offset-4 hover:underline">
                  Trophy Room
                </Link>{" "}
                to pin it here.
              </p>
            )}
          </Section>

          <Section
            title="Featured from your Archive"
            hint={`Up to ${MAX_SHOWCASE_ITEMS} pieces. Only the artwork, and the title if you allow it, is shown — never notes, tasks or other entries.`}
          >
            {items.length ? (
              <ol aria-label="Featured pieces, in display order" className="space-y-1.5">
                {items.map((item, index) => (
                  <li key={itemKey(item)} className="flex items-center gap-2 rounded-lg border border-amethyst/30 bg-amethyst/[0.06] py-1 pr-1 pl-2 text-sm">
                    <Thumb art={item.art} shape={item.shape} accent={item.accent} kind={item.kind} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.name}</span>
                      <label className="mt-0.5 flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={item.showTitle}
                          onChange={(event) => setItems(items.map((other, at) => (at === index ? { ...other, showTitle: event.target.checked } : other)))}
                          className="size-3.5 accent-[var(--amethyst)]"
                        />
                        Show {item.kind === "collection" ? "collection name" : "title"}
                      </label>
                    </span>
                    <OrderButtons
                      label={item.name}
                      index={index}
                      count={items.length}
                      onMove={(delta) => setItems(move(items, index, delta))}
                      onRemove={() => toggleItem(item)}
                    />
                  </li>
                ))}
              </ol>
            ) : null}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Choose from">
              <FilterChip pressed={source === "entries"} onClick={() => setSource("entries")}>
                Entry artwork
              </FilterChip>
              <FilterChip pressed={source === "collections"} onClick={() => setSource("collections")}>
                Collection covers
              </FilterChip>
            </div>
            <CatalogSearch value={query} onChange={setQuery} label={source === "entries" ? "Search entries with artwork" : "Search collections"} placeholder={source === "entries" ? "Search entries" : "Search collections"} className="sm:w-full" />
            <div role="group" aria-label={source === "entries" ? "Entries with artwork" : "Collections"} className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto pr-1">
              {choices.map((choice) => {
                const on = selectedKeys.has(itemKey(choice));
                return (
                  <button
                    key={itemKey(choice)}
                    type="button"
                    aria-pressed={on}
                    disabled={!on && itemsFull}
                    className={cn(chip, "py-1", on ? chipOn : chipOff)}
                    onClick={() => toggleItem(choice)}
                  >
                    <Thumb art={choice.art} shape={choice.shape} accent={choice.accent} kind={choice.kind} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{choice.name}</span>
                      {choice.kind === "collection" && !choice.art ? <span className="block text-[11px]">No cover yet — shows its colour</span> : null}
                      {choice.kind === "entry" ? <span className="block truncate text-[11px]">{results.data?.entries.find((entry) => entry.id === choice.id)?.collectionName}</span> : null}
                    </span>
                    {on ? <Check aria-hidden className="size-4 shrink-0 text-amethyst" /> : null}
                  </button>
                );
              })}
              {source === "entries" && results.isPending ? <p className="py-3 text-center text-xs text-muted-foreground">Loading…</p> : null}
              {source === "entries" && results.isError ? <p className="py-3 text-center text-xs text-destructive">Could not load entries.</p> : null}
              {!choices.length && !(source === "entries" && (results.isPending || results.isError)) ? (
                <p className="py-3 text-center text-xs text-muted-foreground">{source === "entries" ? "No entries with artwork match." : "No collections match."}</p>
              ) : null}
            </div>
          </Section>
          <p role="status" aria-live="polite" className="sr-only">
            {note}
          </p>
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-b-2xl border-t border-foreground/[0.07] bg-[var(--surface-raised)] p-3 md:px-5">
          <Button type="button" onClick={() => save({ id: lookId })} disabled={pending}>
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {selectedLook ? `Save “${selectedLook.name}” and wear it` : "Save showcase"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onClose()} disabled={pending}>
            Cancel
          </Button>
          <p role="status" aria-live="polite" className="min-h-5 basis-full text-sm empty:hidden">
            {state.status === "error" ? <span className="text-destructive">{state.message}</span> : null}
          </p>
        </div>
      </div>
    </div>
  );
}
