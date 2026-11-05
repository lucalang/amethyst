import Link from "next/link";
import { CalendarDays, Eye, PenLine, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { BadgeEmblem } from "@/components/layout/profile-flair";
import { PROFILE_BADGES, PROFILE_TITLES } from "@/lib/cosmetics";
import type { MemberProfile } from "@/lib/data/profiles";

const SINCE = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });

/** A member's profile card. `avatar` is the owner's stored avatar or another member's avatar route. */
export function MemberProfileView({ profile, own, avatar }: { profile: MemberProfile; own: boolean; avatar: { src?: string | null; imageSrc?: string | null } }) {
  const name = profile.name ?? (own ? "Your profile" : "Amethyst member");
  const title = profile.title ? PROFILE_TITLES[profile.title] : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-12">
      <article aria-labelledby="member-name" className="relative overflow-hidden rounded-2xl border border-amethyst/20 bg-[linear-gradient(180deg,var(--surface-raised),var(--background))] shadow-[0_24px_60px_-30px_rgb(var(--shadow-rgb)/0.8)]">
        <div className="relative h-28 overflow-hidden border-b border-amethyst/15 md:h-40">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_140%_at_18%_0%,rgb(var(--accent-rgb)/0.45),transparent_60%),radial-gradient(90%_120%_at_100%_100%,rgb(var(--rose-rgb,var(--accent-rgb))/0.25),transparent_65%)]" />
          <div aria-hidden className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(45deg,rgb(var(--ink-rgb))_1px,transparent_1px),linear-gradient(-45deg,rgb(var(--ink-rgb))_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(180deg,#000,transparent)]" />
          {profile.badges.length ? (
            <ul aria-label={profile.badges.length === 1 ? "Badge" : "Badges"} className="absolute right-5 bottom-3 flex flex-wrap justify-end gap-1.5 md:right-9 md:bottom-4 md:gap-2">
              {profile.badges.map((id) => (
                <li key={id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="block rounded-full outline-none transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">
                        <BadgeEmblem badge={id} className="size-9 drop-shadow-[0_6px_14px_rgb(var(--shadow-rgb)/0.6)] md:size-11" />
                        <span className="sr-only">{PROFILE_BADGES[id].name}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{PROFILE_BADGES[id].name}</TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="relative px-5 pb-6 md:px-9 md:pb-8">
          <div className="-mt-14 flex flex-wrap items-end justify-between gap-4 md:-mt-[4.5rem]">
            <span className="rounded-full bg-background p-1.5 shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.25),0_12px_30px_-12px_rgb(var(--accent-rgb)/0.6)]">
              <ProfileAvatar
                name={profile.name}
                src={avatar.src}
                imageSrc={avatar.imageSrc}
                decoration={profile.decoration}
                alt={`${name}’s avatar`}
                className="size-24 text-3xl md:size-32 md:text-4xl"
              />
            </span>
            {own ? (
              <Button asChild variant="outline" size="sm" className="mb-1">
                <Link href="/customization/profile">
                  <PenLine aria-hidden /> Edit profile
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="mt-6 min-w-0">
            {title ? <p className="profile-title text-[11px] md:text-xs">{title.name}</p> : null}
            <h1 id="member-name" className="mt-1 text-3xl font-extrabold tracking-tight break-words md:text-4xl">
              {name}
            </h1>
            {!profile.name && own ? <p className="mt-1 text-sm text-muted-foreground">Add a display name so others know who you are.</p> : null}
          </div>

          {profile.motto ? (
            <blockquote className="relative mt-5 max-w-2xl rounded-xl border border-white/[0.06] bg-white/[0.025] py-3.5 pr-4 pl-11 text-base leading-7 break-words text-foreground/90 italic md:text-lg">
              <Quote aria-hidden className="absolute top-4 left-3.5 size-4 text-amethyst/70" />
              {profile.motto}
            </blockquote>
          ) : own ? (
            <p className="mt-5 text-sm text-muted-foreground">No motto yet — add a line that sounds like you.</p>
          ) : null}

          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-amethyst/10 text-amethyst ring-1 ring-amethyst/25">
                <CalendarDays className="size-4.5" />
              </span>
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Member since</dt>
                <dd className="font-medium">
                  <time dateTime={profile.memberSince}>{SINCE.format(new Date(profile.memberSince))}</time>
                </dd>
              </div>
            </div>
          </dl>
        </div>
      </article>

      {own ? (
        <p className="mt-4 flex items-start gap-2 px-1 text-xs leading-5 text-muted-foreground">
          <Eye aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          This is how other signed-in Amethyst members see your profile. Your email, coins, collections and other private data are never shown.
        </p>
      ) : null}
    </div>
  );
}
