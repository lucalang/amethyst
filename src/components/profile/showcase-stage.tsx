"use client";

import { useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { Gem, LibraryBig } from "lucide-react";
import { AchievementBadge } from "@/components/achievements/achievement-badge";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { BadgeEmblem } from "@/components/layout/profile-flair";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { artworkVariantSrc } from "@/lib/attachments";
import { PROFILE_BADGES, PROFILE_TITLES, type AvatarDecorationId, type ProfileBadgeId, type ProfileTitleId } from "@/lib/cosmetics";
import { PROFILE_SECTIONS, pedestalCollectible, type ProfileAmbientId, type ShowcaseArrangement, type ShowcasePiece } from "@/lib/profile-styles";
import { ShowcaseOpening } from "./showcase-opening";
import { ShowcasePedestal } from "./showcase-pedestal";
import "./profile-showcase.css";

const SINCE = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });
// Deterministic scatter so server and client render the same particles.
const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  "--x": `${(i * 37 + 11) % 100}%`,
  "--y": `${(i * 53 + 7) % 90}%`,
  "--s": `${2 + (i % 3)}px`,
  "--t": `${9 + ((i * 7) % 8)}s`,
  "--d": `${-((i * 13) % 17)}s`,
})) as CSSProperties[];

function tracker(x: string, y: string) {
  return {
    move(event: PointerEvent<HTMLElement>) {
      if (event.pointerType !== "mouse") return;
      const el = event.currentTarget;
      const box = el.getBoundingClientRect();
      el.style.setProperty(x, ((event.clientX - box.left) / box.width).toFixed(3));
      el.style.setProperty(y, ((event.clientY - box.top) / box.height).toFixed(3));
      el.dataset.live = "";
    },
    leave(event: PointerEvent<HTMLElement>) {
      const el = event.currentTarget;
      el.style.removeProperty(x);
      el.style.removeProperty(y);
      delete el.dataset.live;
    },
  };
}
// Separate names: the stage's values would otherwise inherit into every tilt.
const stageTrack = tracker("--sx", "--sy");
const tiltTrack = tracker("--px", "--py");

export type ShowcaseIdentity = {
  name: string;
  hasName: boolean;
  title: ProfileTitleId | null;
  motto: string | null;
  badges: ProfileBadgeId[];
  decoration: AvatarDecorationId | null;
  memberSince: string;
  avatar: { src?: string | null; imageSrc?: string | null };
};

function PieceArt({ piece }: { piece: ShowcasePiece }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = piece.src && piece.src !== failed ? piece.src : null;
  const Icon = piece.kind === "collection" ? LibraryBig : Gem;
  return (
    <span className="pf-art" style={piece.accent ? ({ "--pf-accent": piece.accent } as CSSProperties) : undefined}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- member showcase route or the owner's private image route
        <img
          src={src}
          alt={piece.title ? `${piece.title}${piece.kind === "collection" ? " collection cover" : " artwork"}` : piece.kind === "collection" ? "Featured collection cover" : "Featured artwork"}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(src)}
        />
      ) : (
        <span className="pf-art-empty" role="img" aria-label={piece.title ?? "Featured piece"}>
          <Icon aria-hidden />
        </span>
      )}
    </span>
  );
}

/** The member's display case: identity, worn collectibles and the owner's sections in their chosen order. */
export function ShowcaseStage({
  memberId,
  arrangement,
  identity,
  pieces,
  own,
  actions,
  previewing = false,
}: {
  memberId: string;
  arrangement: ShowcaseArrangement;
  identity: ShowcaseIdentity;
  pieces: readonly ShowcasePiece[];
  own: boolean;
  actions?: ReactNode;
  /** A live editing preview: entrance motion and the opening are skipped so changes appear immediately. */
  previewing?: boolean;
}) {
  const { style, ambient, sections } = arrangement;
  const title = identity.title ? PROFILE_TITLES[identity.title] : null;
  const medals = arrangement.achievements.flatMap((id) => ACHIEVEMENTS.find((item) => item.id === id) ?? []);
  const collectible = pedestalCollectible(arrangement.pedestal);
  const filled = { gallery: pieces.length > 0, achievements: medals.length > 0, pedestal: collectible !== null };
  const shown = sections.filter((id) => filled[id]);
  let order = 0;
  const reveal = () => ({ "--i": order++ }) as CSSProperties;
  const aura = identity.avatar.imageSrc ?? (identity.avatar.src ? artworkVariantSrc(identity.avatar.src, 128) : null);

  const render: Record<keyof typeof filled, () => ReactNode> = {
    gallery: () => (
      <ul aria-label="Featured from the Archive" className="pf-pieces" data-count={pieces.length}>
        {pieces.map((piece) => (
          <li key={piece.key} className="pf-piece pf-reveal" data-shape={piece.shape} style={reveal()}>
            <figure>
              <span tabIndex={0} className="pf-tilt pf-touch" onPointerMove={tiltTrack.move} onPointerLeave={tiltTrack.leave}>
                <PieceArt piece={piece} />
                <span aria-hidden className="pf-glare" />
                <span aria-hidden className="pf-kind">
                  {piece.kind === "collection" ? <LibraryBig /> : <Gem />}
                  {piece.kind === "collection" ? "Collection" : "Archive entry"}
                </span>
              </span>
              {piece.title ? <figcaption className="pf-caption">{piece.title}</figcaption> : null}
            </figure>
          </li>
        ))}
      </ul>
    ),
    achievements: () => (
      <ul aria-label="Pinned achievements" className="pf-medals">
        {medals.map((medal) => (
          <li key={medal.id} tabIndex={0} className="pf-medal pf-touch pf-reveal" style={reveal()}>
            <span className="pf-tilt pf-medal-art" onPointerMove={tiltTrack.move} onPointerLeave={tiltTrack.leave}>
              <AchievementBadge achievement={medal} earned size={68} />
              <span aria-hidden className="pf-foil" />
            </span>
            <span className="pf-medal-name">{medal.name}</span>
            <span className="pf-medal-desc">{medal.description}</span>
          </li>
        ))}
      </ul>
    ),
    pedestal: () =>
      collectible ? (
        <div className="pf-reveal" style={reveal()}>
          <ShowcasePedestal collectible={collectible} style={style} identity={identity} pieces={pieces} previewing={previewing} />
        </div>
      ) : null,
  };

  return (
    <section
      aria-labelledby="member-name"
      className="pf-stage"
      data-pf-style={style}
      data-pf-ambient={ambient}
      data-previewing={previewing || undefined}
      onPointerMove={stageTrack.move}
      onPointerLeave={stageTrack.leave}
    >
      <div aria-hidden className="pf-backdrop" />
      {aura ? (
        <div aria-hidden className="pf-aura">
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative blur of the avatar already loaded above */}
          <img src={aura} alt="" decoding="async" />
        </div>
      ) : null}
      <div aria-hidden className="pf-spot" />
      <Ambient id={ambient} />
      <header className="pf-identity pf-reveal" style={reveal()}>
        <div className="pf-portrait">
          <ProfileAvatar
            name={identity.hasName ? identity.name : null}
            src={identity.avatar.src}
            imageSrc={identity.avatar.imageSrc}
            decoration={identity.decoration}
            alt={`${identity.name}’s avatar`}
            className="pf-avatar"
          />
        </div>
        <div className="pf-plate">
          {title ? <p className="pf-title">{title.name}</p> : null}
          <h1 id="member-name" className="pf-name">
            {identity.name}
          </h1>
          {identity.motto ? <p className="pf-motto">{identity.motto}</p> : own ? <p className="pf-hint">No motto yet — add a line that sounds like you.</p> : null}
          {identity.badges.length ? <Badges badges={identity.badges} /> : null}
          <p className="pf-hallmark">
            Member since <time dateTime={identity.memberSince}>{SINCE.format(new Date(identity.memberSince))}</time>
          </p>
          {actions ? <div className="pf-actions">{actions}</div> : null}
        </div>
      </header>

      <div className="pf-display">
        {shown.map((id) => (
          <div key={id} role="group" aria-label={PROFILE_SECTIONS[id].name} className="pf-section" data-section={id}>
            {render[id]()}
          </div>
        ))}
        {!shown.length ? (
          <div className="pf-empty pf-reveal" style={reveal()}>
            <span aria-hidden className="pf-ghosts">
              <span />
              <span />
              <span />
            </span>
            <p>{own ? "Your display case is waiting. Pin achievements, feature artwork from your Archive or set a collectible on the pedestal." : "Nothing on display yet."}</p>
          </div>
        ) : null}
      </div>
      {previewing ? null : <ShowcaseOpening memberId={memberId} style={style} />}
    </section>
  );
}

function Ambient({ id }: { id: ProfileAmbientId }) {
  if (id === "off") return null;
  return (
    <div aria-hidden className="pf-ambient">
      {id === "aurora" ? (
        <>
          <span className="pf-veil" />
          <span className="pf-veil" />
        </>
      ) : (
        PARTICLES.map((particle, i) => <span key={i} className="pf-particle" style={particle} />)
      )}
    </div>
  );
}

/** Worn badges. Hover, focus or a tap names the badge in the caption line, so nothing depends on hover alone. */
function Badges({ badges }: { badges: readonly ProfileBadgeId[] }) {
  const [active, setActive] = useState<ProfileBadgeId | null>(null);
  const shown = active && badges.includes(active) ? PROFILE_BADGES[active] : null;
  return (
    <div className="pf-badge-row">
      <ul aria-label={badges.length === 1 ? "Badge" : "Badges"} className="pf-badges" onPointerLeave={() => setActive(null)}>
        {badges.map((id) => (
          <li key={id}>
            <button
              type="button"
              className="pf-badge"
              aria-pressed={active === id}
              aria-describedby="pf-badge-caption"
              onPointerEnter={(event) => event.pointerType === "mouse" && setActive(id)}
              onFocus={() => setActive(id)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(active === id ? null : id)}
            >
              <BadgeEmblem badge={id} className="size-full" />
              <span className="sr-only">{PROFILE_BADGES[id].name}</span>
            </button>
          </li>
        ))}
      </ul>
      <p id="pf-badge-caption" aria-live="polite" className="pf-badge-caption">
        {shown ? (
          <>
            <strong>{shown.name}</strong> · {shown.description}
          </>
        ) : (
          <span className="pf-badge-hint">{badges.length === 1 ? "1 badge" : `${badges.length} badges`} — select one to read it</span>
        )}
      </p>
    </div>
  );
}
