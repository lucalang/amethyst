"use client";

import { useActionState, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { ArrowDown, ArrowUp, Award, Check, Loader2, Lock, X } from "lucide-react";
import { CatalogSearch, FilterChip } from "@/components/catalog/catalog-search";
import { useCosmetics } from "@/components/layout/cosmetics-context";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { BadgeEmblem, ProfileFlair } from "@/components/layout/profile-flair";
import { ImageUrlField } from "@/components/media/image-url-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { achievementForItem } from "@/lib/achievements";
import {
  AVATAR_DECORATION_IDS,
  AVATAR_DECORATIONS,
  MAX_PROFILE_BADGES,
  PROFILE_BADGE_IDS,
  PROFILE_BADGES,
  PROFILE_TITLE_IDS,
  PROFILE_TITLES,
  type AvatarDecorationId,
  type CosmeticSource,
  type ProfileBadgeId,
  type ProfileTitleId,
} from "@/lib/cosmetics";
import { PICKER_SEARCH_MIN, catalogMatcher } from "@/lib/catalog-search";
import { cn } from "@/lib/utils";
import { updatePassword, updateProfile, type FormState } from "./actions";

const initial: FormState = { status: "idle" };

function StatusLine({ state }: { state: FormState }) {
  return (
    <p role="status" aria-live="polite" className="min-h-5 text-sm">
      {state.status === "error" ? <span className="text-destructive">{state.message}</span> : null}
      {state.status === "success" ? <span className="text-amethyst">{state.message}</span> : null}
    </p>
  );
}

export function ProfileForm({ displayName, motto, avatarUrl }: { displayName: string; motto: string; avatarUrl: string }) {
  const [state, action, pending] = useActionState(updateProfile, initial);
  const cosmetics = useCosmetics();
  const visibleDecorations = AVATAR_DECORATION_IDS.filter(
    (id) => cosmetics.owned.includes(id) || AVATAR_DECORATIONS[id].source === "achievement",
  );
  const [decoration, setDecoration] = useState<AvatarDecorationId | null>(cosmetics.avatarDecoration);
  const [decorationSource, setDecorationSource] = useState<"all" | CosmeticSource>("all");
  const visibleBadges = PROFILE_BADGE_IDS.filter(
    (id) => cosmetics.owned.includes(id) || PROFILE_BADGES[id].source === "achievement" || PROFILE_BADGES[id].source === "tournament",
  );
  const visibleTitles = PROFILE_TITLE_IDS.filter(
    (id) => cosmetics.owned.includes(id) || PROFILE_TITLES[id].source === "achievement" || PROFILE_TITLES[id].source === "tournament",
  );
  const [flairSource, setFlairSource] = useState<"all" | "achievement" | "vault" | "tournament">("all");
  const [badges, setBadges] = useState<ProfileBadgeId[]>(() => [...cosmetics.badges]);
  const [badgeNote, setBadgeNote] = useState("");
  const badgesFull = badges.length >= MAX_PROFILE_BADGES;
  const [title, setTitle] = useState<ProfileTitleId | null>(cosmetics.title);
  const [decorationQuery, setDecorationQuery] = useState("");
  const decorationMatch = visibleDecorations.length + 1 >= PICKER_SEARCH_MIN ? catalogMatcher(decorationQuery) : null;
  const [name, setName] = useState(displayName);
  const [line, setLine] = useState(motto);
  const [avatar, setAvatar] = useState(avatarUrl);
  // Remounts the image field so "Remove picture" clears links and uploads alike.
  const [fieldKey, setFieldKey] = useState(0);
  const [fieldDefault, setFieldDefault] = useState(avatarUrl);

  // Reordering moves DOM nodes, so focus is restored to the matching control after each change.
  function updateBadges(next: ProfileBadgeId[], note: string, focus?: string) {
    flushSync(() => {
      setBadges(next);
      setBadgeNote(note);
    });
    if (focus) document.querySelector<HTMLElement>(`[data-badge-focus="${focus}"]`)?.focus();
  }
  function toggleBadge(id: ProfileBadgeId) {
    const name = PROFILE_BADGES[id].name;
    if (badges.includes(id)) updateBadges(badges.filter((item) => item !== id), `${name} removed.`);
    else if (!badgesFull) updateBadges([...badges, id], `${name} added in position ${badges.length + 1}.`);
  }
  function moveBadge(id: ProfileBadgeId, delta: -1 | 1) {
    const from = badges.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= badges.length) return;
    const next = [...badges];
    [next[from], next[to]] = [next[to], next[from]];
    const edge = delta < 0 ? to === 0 : to === badges.length - 1;
    const focus = `${id}:${(delta < 0) !== edge ? "up" : "down"}`;
    updateBadges(next, `${PROFILE_BADGES[id].name} moved to position ${to + 1} of ${badges.length}.`, focus);
  }
  function removeBadge(id: ProfileBadgeId) {
    const index = badges.indexOf(id);
    const next = badges.filter((item) => item !== id);
    const neighbour = next[index] ?? next[index - 1];
    updateBadges(next, `${PROFILE_BADGES[id].name} removed.`, neighbour ? `${neighbour}:remove` : `${id}:pick`);
  }
  return (
    <form action={action} className="space-y-5">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface/40 bg-[radial-gradient(32rem_9rem_at_0%_0%,rgb(var(--accent-rgb)/0.16),transparent_72%)] p-4 shadow-[0_18px_40px_-30px_var(--amethyst)]">
        <ProfileAvatar name={name} src={avatar} decoration={decoration} className="size-16 text-xl" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{name.trim() || "Your account"}</p>
          <ProfileFlair badges={badges} title={title} className="my-0.5" />
          <p className="line-clamp-2 text-sm break-words text-muted-foreground">{line.trim() || "No motto yet"}</p>
          <p className="mt-1 text-[11px] text-muted-foreground/75">Preview · signed-in members can view your profile page</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          autoComplete="nickname"
          placeholder="What should Home call you?"
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">Used in Home’s welcome, your achievement cabinet and on Arcade leaderboards, so it must be unique. Leave it empty to appear under an anonymous arcade name.</p>
      </div>
      <div id="settings-avatar-picture" className="space-y-1.5">
        <ImageUrlField
          key={fieldKey}
          id="avatarUrl"
          name="avatarUrl"
          label="Picture"
          hint="Upload a square image, or paste a link. Without one, your initials are shown."
          defaultValue={fieldDefault}
          shape="square"
          onValueChange={setAvatar}
        />
        {avatar ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-muted-foreground hover:border-rose/50 hover:bg-rose/10 hover:text-rose hover:[&_svg]:text-rose"
            onClick={() => {
              setAvatar("");
              setFieldDefault("");
              setFieldKey((key) => key + 1);
            }}
          >
            <X aria-hidden /> Remove picture
          </Button>
        ) : null}
      </div>
      <fieldset id="settings-avatar-decoration" className="space-y-2.5">
        <legend className="text-sm font-medium">Avatar decoration</legend>
        <input type="hidden" name="avatarDecoration" value={decoration ?? ""} />
        <div role="group" aria-label="Filter decorations by source" className="flex flex-wrap gap-1.5">
          {([
            ["all", "All"],
            ["shop", "Shop"],
            ["achievement", "Achievements"],
            ["vault", "The Vault"],
          ] as const).map(([value, label]) => (
            <FilterChip key={value} pressed={decorationSource === value} onClick={() => setDecorationSource(value)}>
              {label}
            </FilterChip>
          ))}
        </div>
        {visibleDecorations.length + 1 >= PICKER_SEARCH_MIN ? (
          <CatalogSearch value={decorationQuery} onChange={setDecorationQuery} label="Search avatar decorations" placeholder="Search decorations" />
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {[null, ...visibleDecorations]
            .filter((id) => {
              if (id === null) return decorationSource === "all" || decoration === null;
              if (decorationSource !== "all" && AVATAR_DECORATIONS[id].source !== decorationSource && id !== decoration) return false;
              return !decorationMatch || id === decoration || decorationMatch(AVATAR_DECORATIONS[id].name, AVATAR_DECORATIONS[id].description);
            })
            .map((id) => {
              const checked = decoration === id;
              const isOwned = id === null || cosmetics.owned.includes(id);
              const ach = id ? achievementForItem(id) : undefined;
              const achLabel = ach?.name;
              return (
                <label
                  key={id ?? "none"}
                  data-selected={checked}
                  data-locked={!isOwned}
                  className={cn("ui-card flex items-center gap-3 p-2 pr-3 text-sm select-none", isOwned ? "cursor-pointer" : "opacity-75")}
                >
                  <input
                    type="radio"
                    name="avatarDecorationChoice"
                    value={id ?? ""}
                    checked={checked}
                    disabled={!isOwned}
                    onChange={() => isOwned && setDecoration(id)}
                    className="sr-only"
                  />
                  <span className="ui-stage size-12 shrink-0 rounded-xl border border-border">
                    <ProfileAvatar name={name} src={avatar} decoration={id} className="size-7 text-[10px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-foreground">{id ? AVATAR_DECORATIONS[id].name : "None"}</span>
                    {id && AVATAR_DECORATIONS[id].source === "achievement" ? (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-amethyst">
                        {isOwned ? <Award aria-hidden className="size-3" /> : <Lock aria-hidden className="size-3" />}
                        {isOwned ? "Achievement" : achLabel}
                      </span>
                    ) : null}
                    {!isOwned && ach ? (
                      <Link href={`/achievements#${ach.id}`} className="mt-1 block text-xs font-medium text-amethyst underline-offset-4 hover:underline">
                        View achievement
                      </Link>
                    ) : null}
                  </span>
                </label>
              );
            })}
        </div>
        <p className="text-xs text-muted-foreground">
          Drawn around your picture everywhere it appears; the picture itself isn’t changed. Unlock more in the{" "}
          <Link href="/shop/cosmetics" className="text-amethyst underline-offset-4 hover:underline">
            Shop
          </Link>{" "}
          or your{" "}
          <Link href="/achievements" className="text-amethyst underline-offset-4 hover:underline">
            Achievements cabinet
          </Link>
          .
        </p>
      </fieldset>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Badges & titles</p>
          <div role="group" aria-label="Filter badges and titles by source" className="flex flex-wrap gap-1.5">
            {([
              ["all", "All"],
              ["achievement", "Achievements"],
              ["vault", "The Vault"],
              ["tournament", "Tournaments"],
            ] as const).map(([value, label]) => (
              <FilterChip key={value} pressed={flairSource === value} onClick={() => setFlairSource(value)}>
                {label}
              </FilterChip>
            ))}
          </div>
        </div>
        {badges.map((id) => (
          <input key={id} type="hidden" name="profileBadges" value={id} />
        ))}
        <input type="hidden" name="profileTitle" value={title ?? ""} />
        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset id="settings-profile-badge" className="space-y-2.5 sm:col-span-2">
            <legend className="text-xs font-medium text-muted-foreground">
              Badges{" "}
              <span className="tabular-nums">
                ({badges.length}/{MAX_PROFILE_BADGES} selected)
              </span>
            </legend>
            {badges.length ? (
              <ol aria-label="Worn badges, in display order" className="flex max-w-md flex-col gap-1.5">
                {badges.map((id, index) => {
                  const name = PROFILE_BADGES[id].name;
                  return (
                    <li key={id} className="flex items-center gap-2 rounded-xl border border-amethyst/35 bg-amethyst/[0.08] py-1 pr-1 pl-2.5 text-sm shadow-[0_8px_24px_-16px_var(--amethyst)]">
                      <span aria-hidden className="w-3 text-center text-xs text-muted-foreground tabular-nums">
                        {index + 1}
                      </span>
                      <BadgeEmblem badge={id} className="size-6" />
                      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Move ${name} earlier`} disabled={index === 0} data-badge-focus={`${id}:up`} onClick={() => moveBadge(id, -1)}>
                        <ArrowUp aria-hidden />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Move ${name} later`} disabled={index === badges.length - 1} data-badge-focus={`${id}:down`} onClick={() => moveBadge(id, 1)}>
                        <ArrowDown aria-hidden />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-8 hover:text-rose" aria-label={`Remove ${name}`} data-badge-focus={`${id}:remove`} onClick={() => removeBadge(id)}>
                        <X aria-hidden />
                      </Button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground">No badges worn. Choose up to {MAX_PROFILE_BADGES} below.</p>
            )}
            <p role="status" aria-live="polite" className="sr-only">
              {badgeNote}
            </p>
            <div role="group" aria-label={`Choose badges, up to ${MAX_PROFILE_BADGES}`} className="flex flex-wrap gap-2">
              {visibleBadges
                .filter((id) => badges.includes(id) || flairSource === "all" || PROFILE_BADGES[id].source === flairSource)
                .map((id) => {
                  const isOwned = cosmetics.owned.includes(id);
                  const position = badges.indexOf(id);
                  const selected = position >= 0;
                  const ach = achievementForItem(id);
                  const lockedHint = ach?.name ?? (PROFILE_BADGES[id].source === "tournament" ? "Daily Tournament" : "Vault");
                  const hint = !isOwned ? `Locked (${lockedHint})` : !selected && badgesFull ? "Remove a badge to wear this one" : PROFILE_BADGES[id].description;
                  return (
                    <label
                      key={id}
                      title={`${PROFILE_BADGES[id].name} — ${hint}`}
                      className={cn("flair-option", selected && "flair-option-on", (!isOwned || (!selected && badgesFull)) && "opacity-70")}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={!isOwned || (!selected && badgesFull)}
                        onChange={() => toggleBadge(id)}
                        data-badge-focus={`${id}:pick`}
                        className="sr-only"
                      />
                      <BadgeEmblem badge={id} className="size-6" />
                      <span>{PROFILE_BADGES[id].name}</span>
                      {selected ? (
                        <span aria-hidden className="inline-flex items-center gap-0.5 text-[11px] text-amethyst tabular-nums">
                          <Check className="size-3" />
                          {position + 1}
                        </span>
                      ) : null}
                      {!isOwned ? <Lock aria-hidden className="size-3 text-muted-foreground" /> : null}
                      {!isOwned && ach ? (
                        <Link href={`/achievements#${ach.id}`} className="text-xs font-medium text-amethyst underline-offset-4 hover:underline">
                          {ach.name}
                        </Link>
                      ) : null}
                    </label>
                  );
                })}
            </div>
            {badges.length ? (
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => updateBadges([], "All badges removed.")}>
                Remove all badges
              </Button>
            ) : null}
          </fieldset>
          <fieldset id="settings-profile-title" className="space-y-2">
            <legend className="text-xs font-medium text-muted-foreground">Title</legend>
            <div className="flex flex-wrap gap-2">
              {[null, ...visibleTitles]
                .filter((id) => id === null || id === title || flairSource === "all" || PROFILE_TITLES[id].source === flairSource)
                .map((id) => {
                  const isOwned = id === null || cosmetics.owned.includes(id);
                  const ach = id ? achievementForItem(id) : undefined;
                  const lockedHint = ach?.name ?? (id && PROFILE_TITLES[id].source === "tournament" ? "Daily Tournament" : "Vault");
                  return (
                    <label
                      key={id ?? "none"}
                      title={id ? `${PROFILE_TITLES[id].name} — ${isOwned ? PROFILE_TITLES[id].description : `Locked (${lockedHint})`}` : "No title"}
                      className={cn("flair-option", title === id && "flair-option-on", !isOwned && "opacity-70")}
                    >
                      <input
                        type="radio"
                        name="profileTitleChoice"
                        value={id ?? ""}
                        checked={title === id}
                        disabled={!isOwned}
                        onChange={() => isOwned && setTitle(id)}
                        className="sr-only"
                      />
                      <span>{id ? PROFILE_TITLES[id].name : "None"}</span>
                      {!isOwned ? <Lock aria-hidden className="size-3 text-muted-foreground" /> : null}
                      {!isOwned && ach ? (
                        <Link href={`/achievements#${ach.id}`} className="text-xs font-medium text-amethyst underline-offset-4 hover:underline">
                          {ach.name}
                        </Link>
                      ) : null}
                    </label>
                  );
                })}
            </div>
          </fieldset>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Shown with your name on Home, in the account menu and on your profile page; the first badge leads. Earn milestone badges and titles in{" "}
            <Link href="/achievements" className="text-amethyst underline-offset-4 hover:underline">
              Achievements
            </Link>{" "}
            or discover secret ones in the{" "}
            <Link href="/vault" className="text-amethyst underline-offset-4 hover:underline">
              Vault
            </Link>
            .
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="motto">Motto</Label>
        <Input
          id="motto"
          name="motto"
          value={line}
          onChange={(event) => setLine(event.target.value)}
          maxLength={160}
          placeholder="A short line about you (optional)"
          className="max-w-xl"
        />
        <p className="text-xs text-muted-foreground tabular-nums">{line.length}/160 · shown beneath your welcome on Home.</p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
        Save profile
      </Button>
      <StatusLine state={state} />
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  return (
    <form action={action} className="max-w-sm space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        <p className="text-xs text-muted-foreground">At least 10 characters with a letter and a digit.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
        Update password
      </Button>
      <StatusLine state={state} />
    </form>
  );
}
