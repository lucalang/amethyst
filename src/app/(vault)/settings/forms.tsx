"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Award, Loader2, Lock, X } from "lucide-react";
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
    (id) => cosmetics.owned.includes(id) || PROFILE_BADGES[id].source === "achievement",
  );
  const visibleTitles = PROFILE_TITLE_IDS.filter(
    (id) => cosmetics.owned.includes(id) || PROFILE_TITLES[id].source === "achievement",
  );
  const [flairSource, setFlairSource] = useState<"all" | "achievement" | "vault">("all");
  const [badge, setBadge] = useState<ProfileBadgeId | null>(cosmetics.badge);
  const [title, setTitle] = useState<ProfileTitleId | null>(cosmetics.title);
  const [decorationQuery, setDecorationQuery] = useState("");
  const decorationMatch = visibleDecorations.length + 1 >= PICKER_SEARCH_MIN ? catalogMatcher(decorationQuery) : null;
  const [name, setName] = useState(displayName);
  const [line, setLine] = useState(motto);
  const [avatar, setAvatar] = useState(avatarUrl);
  // Remounts the image field so "Remove picture" clears links and uploads alike.
  const [fieldKey, setFieldKey] = useState(0);
  const [fieldDefault, setFieldDefault] = useState(avatarUrl);
  return (
    <form action={action} className="space-y-5">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-white/[0.07] bg-white/[0.02] p-4">
        <ProfileAvatar name={name} src={avatar} decoration={decoration} className="size-16 text-xl" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{name.trim() || "Your account"}</p>
          <ProfileFlair badge={badge} title={title} className="my-0.5" />
          <p className="line-clamp-2 text-sm break-words text-muted-foreground">{line.trim() || "No motto yet"}</p>
          <p className="mt-1 text-[11px] text-muted-foreground/75">Preview · only you can see your profile</p>
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
        <p className="text-xs text-muted-foreground">Used in Home’s welcome and your achievement cabinet. Leave it empty to stay unnamed.</p>
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
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-rose"
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
            ["shop", "Arcade shop"],
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
        <div className="flex flex-wrap gap-2">
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
              const achLabel = ach ? (ach.hidden && !isOwned ? "Hidden achievement" : ach.name) : null;
              return (
                <label
                  key={id ?? "none"}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    isOwned ? "cursor-pointer" : "opacity-75",
                    checked
                      ? "border-amethyst/60 bg-amethyst/[0.08] text-foreground"
                      : "border-white/[0.09] text-muted-foreground hover:border-amethyst/35 hover:text-foreground",
                  )}
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
                  <span className="grid size-11 place-items-center">
                    <ProfileAvatar name={name} src={avatar} decoration={id} className="size-7 text-[10px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{id ? AVATAR_DECORATIONS[id].name : "None"}</span>
                    {id && AVATAR_DECORATIONS[id].source === "achievement" ? (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-amethyst">
                        {isOwned ? <Award aria-hidden className="size-3" /> : <Lock aria-hidden className="size-3" />}
                        {isOwned ? "Achievement" : achLabel}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
        </div>
        <p className="text-xs text-muted-foreground">
          Drawn around your picture everywhere it appears; the picture itself isn’t changed. Unlock more in the{" "}
          <Link href="/arcade/shop" className="text-amethyst underline-offset-4 hover:underline">
            Arcade shop
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
            ] as const).map(([value, label]) => (
              <FilterChip key={value} pressed={flairSource === value} onClick={() => setFlairSource(value)}>
                {label}
              </FilterChip>
            ))}
          </div>
        </div>
        <input type="hidden" name="profileBadge" value={badge ?? ""} />
        <input type="hidden" name="profileTitle" value={title ?? ""} />
        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset id="settings-profile-badge" className="space-y-2">
            <legend className="text-xs font-medium text-muted-foreground">Badge</legend>
            <div className="flex flex-wrap gap-2">
              {[null, ...visibleBadges]
                .filter((id) => id === null || id === badge || flairSource === "all" || PROFILE_BADGES[id].source === flairSource)
                .map((id) => {
                  const isOwned = id === null || cosmetics.owned.includes(id);
                  const ach = id ? achievementForItem(id) : undefined;
                  const lockedHint = ach ? (ach.hidden && !isOwned ? "Hidden achievement" : ach.name) : "Vault";
                  return (
                    <label
                      key={id ?? "none"}
                      title={id ? `${PROFILE_BADGES[id].name} — ${isOwned ? PROFILE_BADGES[id].description : `Locked (${lockedHint})`}` : "No badge"}
                      className={cn("flair-option", badge === id && "flair-option-on", !isOwned && "opacity-70")}
                    >
                      <input
                        type="radio"
                        name="profileBadgeChoice"
                        value={id ?? ""}
                        checked={badge === id}
                        disabled={!isOwned}
                        onChange={() => isOwned && setBadge(id)}
                        className="sr-only"
                      />
                      {id ? <BadgeEmblem badge={id} className="size-6" /> : null}
                      <span>{id ? PROFILE_BADGES[id].name : "None"}</span>
                      {!isOwned ? <Lock aria-hidden className="size-3 text-muted-foreground" /> : null}
                    </label>
                  );
                })}
            </div>
          </fieldset>
          <fieldset id="settings-profile-title" className="space-y-2">
            <legend className="text-xs font-medium text-muted-foreground">Title</legend>
            <div className="flex flex-wrap gap-2">
              {[null, ...visibleTitles]
                .filter((id) => id === null || id === title || flairSource === "all" || PROFILE_TITLES[id].source === flairSource)
                .map((id) => {
                  const isOwned = id === null || cosmetics.owned.includes(id);
                  const ach = id ? achievementForItem(id) : undefined;
                  const lockedHint = ach ? (ach.hidden && !isOwned ? "Hidden achievement" : ach.name) : "Vault";
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
                    </label>
                  );
                })}
            </div>
          </fieldset>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Shown with your name on Home and in the account menu. Earn milestone badges and titles in{" "}
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
