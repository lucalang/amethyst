"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2, X } from "lucide-react";
import { CatalogSearch } from "@/components/catalog/catalog-search";
import { useCosmetics } from "@/components/layout/cosmetics-context";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { BadgeEmblem, ProfileFlair } from "@/components/layout/profile-flair";
import { ImageUrlField } from "@/components/media/image-url-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AVATAR_DECORATION_IDS,
  AVATAR_DECORATIONS,
  PROFILE_BADGE_IDS,
  PROFILE_BADGES,
  PROFILE_TITLE_IDS,
  PROFILE_TITLES,
  type AvatarDecorationId,
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
  const ownedDecorations = AVATAR_DECORATION_IDS.filter((id) => cosmetics.owned.includes(id));
  const [decoration, setDecoration] = useState<AvatarDecorationId | null>(cosmetics.avatarDecoration);
  const ownedBadges = PROFILE_BADGE_IDS.filter((id) => cosmetics.owned.includes(id));
  const ownedTitles = PROFILE_TITLE_IDS.filter((id) => cosmetics.owned.includes(id));
  const [badge, setBadge] = useState<ProfileBadgeId | null>(cosmetics.badge);
  const [title, setTitle] = useState<ProfileTitleId | null>(cosmetics.title);
  const [decorationQuery, setDecorationQuery] = useState("");
  const decorationMatch = ownedDecorations.length + 1 >= PICKER_SEARCH_MIN ? catalogMatcher(decorationQuery) : null;
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
      <fieldset id="settings-avatar-decoration" className="space-y-2">
        <legend className="text-sm font-medium">Avatar decoration</legend>
        {ownedDecorations.length + 1 >= PICKER_SEARCH_MIN ? (
          <CatalogSearch value={decorationQuery} onChange={setDecorationQuery} label="Search avatar decorations" placeholder="Search decorations" />
        ) : null}
        <div className="flex flex-wrap gap-2">
          {[null, ...ownedDecorations].filter((id) => !decorationMatch || id === decoration || (id && decorationMatch(AVATAR_DECORATIONS[id].name, AVATAR_DECORATIONS[id].description))).map((id) => {
            const checked = decoration === id;
            return (
              <label
                key={id ?? "none"}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  checked ? "border-amethyst/60 bg-amethyst/[0.08] text-foreground" : "border-white/[0.09] text-muted-foreground hover:border-amethyst/35 hover:text-foreground",
                )}
              >
                <input type="radio" name="avatarDecoration" value={id ?? ""} checked={checked} onChange={() => setDecoration(id)} className="sr-only" />
                <span className="grid size-11 place-items-center">
                  <ProfileAvatar name={name} src={avatar} decoration={id} className="size-7 text-[10px]" />
                </span>
                {id ? AVATAR_DECORATIONS[id].name : "None"}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {ownedDecorations.length
            ? "Drawn around your picture everywhere it appears; the picture itself isn't changed."
            : "Decorations are drawn around your picture without changing it. "}
          <Link href="/arcade/shop" className="text-amethyst underline-offset-4 hover:underline">
            {ownedDecorations.length ? " Visit the Arcade shop" : "Earn coins in the Arcade to buy one in the shop"}
          </Link>
          .
        </p>
      </fieldset>
      {ownedBadges.length || ownedTitles.length ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset id="settings-profile-badge" className="space-y-2">
            <legend className="text-sm font-medium">Badge</legend>
            <div className="flex flex-wrap gap-2">
              {[null, ...ownedBadges].map((id) => (
                <label key={id ?? "none"} className={cn("flair-option", badge === id && "flair-option-on")}>
                  <input type="radio" name="profileBadge" value={id ?? ""} checked={badge === id} onChange={() => setBadge(id)} className="sr-only" />
                  {id ? <BadgeEmblem badge={id} className="size-6" /> : null}
                  {id ? PROFILE_BADGES[id].name : "None"}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset id="settings-profile-title" className="space-y-2">
            <legend className="text-sm font-medium">Title</legend>
            <div className="flex flex-wrap gap-2">
              {[null, ...ownedTitles].map((id) => (
                <label key={id ?? "none"} className={cn("flair-option", title === id && "flair-option-on")}>
                  <input type="radio" name="profileTitle" value={id ?? ""} checked={title === id} onChange={() => setTitle(id)} className="sr-only" />
                  {id ? PROFILE_TITLES[id].name : "None"}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-muted-foreground sm:col-span-2">Shown with your name on Home and in the account menu. More turn up in the Vault.</p>
        </div>
      ) : null}
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
