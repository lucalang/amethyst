"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { CosmeticPreview } from "@/components/arcade/shop/preview";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { BadgeEmblem, ProfileFlair } from "@/components/layout/profile-flair";
import { ArtworkFrame } from "@/components/media/artwork-frame";
import { useMotionLevel, webglAvailable } from "@/components/showcase/motion";
import type { MotionLevel } from "@/lib/preferences";
import type { PedestalCollectible, ProfileStyleId, ShowcasePiece } from "@/lib/profile-styles";
import type { PedestalEngine } from "./pedestal-scene";
import type { ShowcaseIdentity } from "./showcase-stage";

const noSubscribe = () => () => {};

/** One owned collectible on a lit 3D pedestal; a CSS plinth stands in when WebGL isn't available. */
export function ShowcasePedestal({
  collectible,
  style,
  identity,
  pieces,
  previewing,
}: {
  collectible: PedestalCollectible;
  style: ProfileStyleId;
  identity: ShowcaseIdentity;
  pieces: readonly ShowcasePiece[];
  previewing: boolean;
}) {
  const motion = useMotionLevel();
  const noWebgl = useSyncExternalStore(noSubscribe, () => !webglAvailable(), () => false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [lit, setLit] = useState(false);
  const flat = noWebgl || failed;
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PedestalEngine | null>(null);
  const latest = useRef({ style, motion, previewing });

  useEffect(() => {
    latest.current = { style, motion, previewing };
    engineRef.current?.setStyle(style);
    engineRef.current?.setMotion(motion);
  }, [style, motion, previewing]);

  useEffect(() => {
    const host = hostRef.current;
    if (flat || !host) return;
    let disposed = false;
    let engine: PedestalEngine | null = null;
    import("./pedestal-scene")
      .then(({ createPedestal }) => {
        if (disposed) return;
        const { style, motion, previewing } = latest.current;
        engine = createPedestal(host, {
          style,
          motion,
          entrance: !previewing,
          onAnchor: ({ top, width }) => {
            host.style.setProperty("--pd-top", top.toFixed(3));
            host.style.setProperty("--pd-width", width.toFixed(3));
          },
          onFail: () => setFailed(true),
        });
        engineRef.current = engine;
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      engine?.dispose();
      engineRef.current = null;
      host.style.removeProperty("--pd-top");
      host.style.removeProperty("--pd-width");
    };
  }, [flat]);

  useEffect(() => {
    engineRef.current?.setHover(lit);
  }, [lit, ready]);

  const point = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    engineRef.current?.setPointer(((event.clientX - box.left) / box.width) * 2 - 1, ((event.clientY - box.top) / box.height) * 2 - 1);
  };

  return (
    <figure
      tabIndex={0}
      className="pf-pedestal"
      data-kind={collectible.kind}
      data-mode={flat ? "flat" : ready ? "3d" : "loading"}
      data-active={lit || undefined}
      aria-label={`${collectible.name}, ${collectible.label}, on the pedestal`}
      onPointerEnter={(event) => event.pointerType === "mouse" && setLit(true)}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setLit(false);
        engineRef.current?.setPointer(0, 0);
      }}
      onPointerMove={point}
      onClick={(event) => {
        const type = (event.nativeEvent as globalThis.PointerEvent).pointerType;
        if (type && type !== "mouse") setLit((value) => !value);
      }}
      onFocus={(event) => event.currentTarget.matches(":focus-visible") && setLit(true)}
      onBlur={() => setLit(false)}
    >
      <div ref={hostRef} className="pf-pedestal-stage">
        {flat ? <span aria-hidden className="pf-plinth" /> : null}
        <div className="pf-relic">
          <div className="pf-relic-float">
            <Relic collectible={collectible} identity={identity} pieces={pieces} motion={motion} />
          </div>
        </div>
      </div>
      <figcaption className="pf-pedestal-caption">
        <span className="pf-pedestal-label">{collectible.label}</span>
        <strong>{collectible.name}</strong>
        <span className="pf-pedestal-desc">{collectible.description}</span>
      </figcaption>
    </figure>
  );
}

function Relic({ collectible, identity, pieces, motion }: { collectible: PedestalCollectible; identity: ShowcaseIdentity; pieces: readonly ShowcasePiece[]; motion: MotionLevel }) {
  switch (collectible.kind) {
    case "game":
      return (
        <div className="pf-relic-screen">
          <CosmeticPreview game={collectible.game} look={{ [collectible.category]: collectible.slug }} focus={collectible.category} effects={motion} />
        </div>
      );
    case "frame": {
      const art = pieces.find((piece) => piece.src)?.src ?? identity.avatar.imageSrc ?? null;
      return (
        <ArtworkFrame frame={collectible.id} className="pf-relic-frame">
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element -- artwork already shown on this showcase
            <img src={art} alt="" decoding="async" className="pf-relic-art" />
          ) : (
            <span className="pf-relic-art pf-relic-blank" />
          )}
        </ArtworkFrame>
      );
    }
    case "decoration":
      return <ProfileAvatar name={identity.hasName ? identity.name : null} src={identity.avatar.src} imageSrc={identity.avatar.imageSrc} decoration={collectible.id} alt="" className="pf-relic-avatar" />;
    case "badge":
      return <BadgeEmblem badge={collectible.id} className="pf-relic-badge" />;
    case "title":
      return (
        <span className="pf-relic-plaque">
          <ProfileFlair badges={[]} title={collectible.id} />
        </span>
      );
  }
}
