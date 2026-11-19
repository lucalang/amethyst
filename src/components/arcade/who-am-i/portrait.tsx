import { memo } from "react";
import { PLAYABLE, type Character, type Gem, type Traits } from "@/lib/who-am-i";
import { cn } from "@/lib/utils";

/**
 * The Gemfolk: original Amethyst portraits drawn from each character's traits, so what you see is exactly what
 * the cards ask about (gem badge, hair, headwear, glasses, beard, earrings, smile, scarf, companion).
 */
export const GEM_COLORS: Record<Gem, string> = {
  amethyst: "#a879ff",
  emerald: "#34d399",
  sapphire: "#4c8dff",
  ruby: "#ff4d6d",
  topaz: "#ffb63b",
};
const HAIR: Record<Traits["hairColor"], string> = {
  none: "transparent",
  dark: "#3b2a24",
  gold: "#e9bb4c",
  red: "#cf4f2c",
  silver: "#cfd4de",
  violet: "#8b5cf6",
};
// Skin tones vary across the roster for character; no card asks about them.
const SKIN = ["#f6d3b3", "#e3ad86", "#c48a60", "#9c6844", "#74492f", "#efc39c"];
const INK = "#1d1530";

function indexOf(character: Character) {
  return Math.max(0, PLAYABLE.findIndex((entry) => entry.id === character.id));
}

/** Curly hair: overlapping curls along the hairline. */
const CURLS: [number, number][] = [[31, 42], [32, 33], [38, 26], [46, 22], [54, 22], [62, 26], [68, 33], [69, 42]];
/** Flower wreath: small blossoms over the forehead. */
const BLOSSOMS: [number, number, string][] = [[33, 31, "#ff9ecf"], [40, 25, "#fff1f8"], [50, 23, "#ffd166"], [60, 25, "#fff1f8"], [67, 31, "#ff9ecf"]];

export const Portrait = memo(function Portrait({ character, className, label }: { character: Character; className?: string; label?: string }) {
  const t = character.traits;
  const i = indexOf(character);
  const skin = SKIN[i % SKIN.length];
  const gem = GEM_COLORS[t.gem];
  const hair = HAIR[t.hairColor];
  const id = `wai-${character.id}`;
  return (
    <svg viewBox="0 0 100 100" className={cn("block size-full", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor={gem} stopOpacity="0.55" />
          <stop offset="100%" stopColor={gem} stopOpacity="0.12" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" rx="10" fill="#15102a" />
      <rect width="100" height="100" rx="10" fill={`url(#${id}-bg)`} />
      {/* Facets */}
      <path d="M0 64 L26 40 L0 22 Z M100 60 L78 38 L100 18 Z" fill={gem} opacity="0.14" />

      {t.hair === "long" ? <path d="M29 44 Q28 18 50 18 Q72 18 71 44 L76 84 Q50 92 24 84 Z" fill={hair} /> : null}

      {/* Shoulders, brooch and neck */}
      <path d="M14 100 Q17 75 50 73 Q83 75 86 100 Z" fill="#372e57" />
      <path d="M38 75 L50 92 L62 75" fill="none" stroke={gem} strokeWidth="1.6" opacity="0.8" />
      <rect x="44" y="60" width="12" height="15" rx="3" fill={skin} />
      {t.scarf === "yes" ? (
        <g>
          <path d="M34 72 Q50 82 66 72 L68 79 Q50 91 32 79 Z" fill="#ff7aa8" />
          <path d="M57 82 L63 97 L56 98 L52 84 Z" fill="#ff5c93" />
        </g>
      ) : null}

      {/* Ears and earrings */}
      <circle cx="31" cy="48" r="4.2" fill={skin} />
      <circle cx="69" cy="48" r="4.2" fill={skin} />
      {t.earrings === "yes" ? (
        <g fill={gem} stroke="#fff" strokeWidth="0.8">
          <path d="M31 52.5 L33.2 55.5 L31 58.5 L28.8 55.5 Z" />
          <path d="M69 52.5 L71.2 55.5 L69 58.5 L66.8 55.5 Z" />
        </g>
      ) : null}

      {/* Head */}
      <ellipse cx="50" cy="46" rx="19" ry="22" fill={skin} />

      {/* Hair */}
      {t.hair === "short" ? <path d="M31 43 Q29 21 50 21 Q71 21 69 43 Q65 31 52 30 Q38 30 31 43 Z" fill={hair} /> : null}
      {t.hair === "long" ? <path d="M31 46 Q28 20 50 20 Q72 20 69 46 Q66 31 56 29 Q46 33 33 48 Z" fill={hair} /> : null}
      {t.hair === "curly" ? (
        <g fill={hair}>
          {CURLS.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="6.2" />)}
          <path d="M33 36 Q50 22 67 36 L64 32 Q50 27 36 32 Z" />
        </g>
      ) : null}
      {t.hair === "none" ? <ellipse cx="42" cy="31" rx="6" ry="3" fill="#fff" opacity="0.3" transform="rotate(-20 42 31)" /> : null}

      {/* Beard, then the face on top */}
      {t.beard === "yes" ? <path d="M32 49 Q33 71 50 73 Q67 71 68 49 Q64 62 50 63 Q36 62 32 49 Z" fill={hair} /> : null}
      <circle cx="43" cy="46" r="2.2" fill={INK} />
      <circle cx="57" cy="46" r="2.2" fill={INK} />
      {t.smiling === "yes" ? (
        <path d="M42.5 55.5 Q50 63 57.5 55.5 Q50 59 42.5 55.5 Z" fill="#7a2e3a" stroke="#7a2e3a" strokeWidth="1.4" strokeLinejoin="round" />
      ) : (
        <path d="M44.5 57.5 L55.5 57.5" stroke="#7a2e3a" strokeWidth="1.8" strokeLinecap="round" />
      )}
      {t.glasses === "yes" ? (
        <g fill="#ffffff" fillOpacity="0.16" stroke={INK} strokeWidth="1.6">
          <circle cx="43" cy="46" r="5.4" />
          <circle cx="57" cy="46" r="5.4" />
          <path d="M48.4 46 L51.6 46 M37.6 45 L32 44 M62.4 45 L68 44" fill="none" />
        </g>
      ) : null}

      {/* Headwear */}
      {t.headwear === "crown" ? (
        <path d="M35 25 L37 11 L43.5 18 L50 8 L56.5 18 L63 11 L65 25 Z" fill="#ffd34d" stroke="#a87908" strokeWidth="1.2" strokeLinejoin="round" />
      ) : null}
      {t.headwear === "wizard" ? (
        <g>
          <path d="M31 29 L49 1 Q51 0 52 2 L69 29 Z" fill="#2c3a96" />
          <ellipse cx="50" cy="29" rx="24" ry="4.5" fill="#22307e" />
          <path d="M52 13 l1.4 2.9 3.1 .4 -2.3 2.1 .6 3.1 -2.8 -1.5 -2.8 1.5 .6 -3.1 -2.3 -2.1 3.1 -.4 Z" fill="#ffe27a" />
        </g>
      ) : null}
      {t.headwear === "cap" ? (
        <g>
          <path d="M31 32 Q31 15 50 15 Q69 15 69 32 Z" fill="#f97316" />
          <path d="M50 29 Q71 26 82 32 Q68 37 50 33 Z" fill="#c2410c" />
          <circle cx="50" cy="15.5" r="2" fill="#c2410c" />
        </g>
      ) : null}
      {t.headwear === "flowers" ? (
        <g>
          <path d="M31 33 Q50 18 69 33" fill="none" stroke="#3f8f5a" strokeWidth="2.2" />
          {BLOSSOMS.map(([x, y, color]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="3.6" fill={color} />
              <circle cx={x} cy={y} r="1.3" fill="#f6b73c" />
            </g>
          ))}
        </g>
      ) : null}

      {/* Companion: a little floating wisp */}
      {t.companion === "yes" ? (
        <g>
          <circle cx="84" cy="74" r="10" fill="#9be7ff" opacity="0.25" />
          <path d="M77 78 Q76 66 84 65 Q92 66 91 78 Q88 75 86 79 Q84 75 82 79 Q80 75 77 78 Z" fill="#c9f3ff" />
          <circle cx="81.5" cy="71" r="1.3" fill={INK} />
          <circle cx="86.5" cy="71" r="1.3" fill={INK} />
        </g>
      ) : null}

      {/* Gem badge */}
      <path d="M14 7 L21.5 15 L14 25 L6.5 15 Z" fill={gem} stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6.5 15 L21.5 15 M14 7 L11 15 L14 25 L17 15 Z" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.7" />
    </svg>
  );
});

/** Your own card: hidden until the round is over. */
export function MysteryPortrait({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("block size-full", className)}>
      <rect width="100" height="100" rx="10" fill="#15102a" />
      <rect width="100" height="100" rx="10" fill="#a879ff" opacity="0.18" />
      <path d="M14 100 Q17 75 50 73 Q83 75 86 100 Z" fill="#2a2342" />
      <ellipse cx="50" cy="46" rx="19" ry="22" fill="#2a2342" />
      <text x="50" y="57" textAnchor="middle" fontSize="30" fontWeight="800" fill="#d8c8ff" fontFamily="ui-sans-serif, system-ui">?</text>
    </svg>
  );
}
