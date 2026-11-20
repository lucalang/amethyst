import { memo } from "react";
import { PLAYABLE, type Character, type Gem, type Traits } from "@/lib/who-am-i";
import { cn } from "@/lib/utils";

/**
 * The Gemfolk: original Amethyst portraits drawn from each character's traits, so what you see is exactly what
 * the cards ask about. Every asked trait has one consistent, bold look:
 * - gem: the faceted badge (top left), the brooch and the backdrop tint, all in the gem's color
 * - hair style and color, headwear (gold crown, blue pointed hat, orange cap, flower wreath)
 * - glasses (dark frames), beard (in the hair color), gem-drop earrings, an open smile, the pink striped scarf,
 *   and the little cyan wisp companion
 * Skin tone, outfit, brows, eyes and the non-smiling mouth vary per character for personality; no card asks
 * about them, and a not-smiling mouth is never curved upward.
 */
export const GEM_COLORS: Record<Gem, string> = {
  amethyst: "#b384ff",
  emerald: "#34d399",
  sapphire: "#4c8dff",
  ruby: "#ff4d6d",
  topaz: "#ffb63b",
};
const GEM_DARK: Record<Gem, string> = {
  amethyst: "#5b2fb0",
  emerald: "#0f7a55",
  sapphire: "#1d4fb8",
  ruby: "#a8173a",
  topaz: "#a86a05",
};
export const HAIR: Record<Traits["hairColor"], { base: string; shade: string; shine: string }> = {
  none: { base: "transparent", shade: "transparent", shine: "transparent" },
  dark: { base: "#3a2620", shade: "#22150f", shine: "#6b4a3c" },
  gold: { base: "#f2c14e", shade: "#c68f1f", shine: "#ffe49a" },
  red: { base: "#d4532a", shade: "#9a3416", shine: "#f08a5d" },
  silver: { base: "#d9dee8", shade: "#9aa3b5", shine: "#ffffff" },
  violet: { base: "#9b6cf7", shade: "#6a3fd0", shine: "#c9adff" },
};
// Per-character looks that no card asks about.
const SKIN = [
  { base: "#f6d3b3", shade: "#e2b28c" },
  { base: "#e3ad86", shade: "#c98f66" },
  { base: "#c48a60", shade: "#a66f48" },
  { base: "#9c6844", shade: "#7f5133" },
  { base: "#74492f", shade: "#5b3622" },
  { base: "#efc39c", shade: "#d9a57b" },
  { base: "#d99c74", shade: "#bb7f58" },
];
const OUTFIT = ["#3b3466", "#2c4a5a", "#523a63", "#3f4f3c", "#5a4034", "#2f3a66", "#4a3048", "#334155"];
const INK = "#1d1530";
const MOUTH = "#6e2232";

function indexOf(character: Character) {
  return Math.max(0, PLAYABLE.findIndex((entry) => entry.id === character.id));
}

/** Curly hair: a halo of curls over the crown and down the sides. */
const CURLS: [number, number, number][] = [
  [29, 50, 5.4], [28, 41, 6], [31, 32, 6.4], [37, 25, 6.6], [45, 21, 6.8], [55, 21, 6.8], [63, 25, 6.6], [69, 32, 6.4], [72, 41, 6], [71, 50, 5.4],
];
const FRINGE_CURLS: [number, number][] = [[38, 31], [45, 28.5], [52, 28], [59, 29.5], [64, 33]];
/** Flower wreath: blossoms over the forehead. */
const BLOSSOMS: [number, number, string, number][] = [[31, 33, "#ff8fc7", 4], [38, 26.5, "#fff3f9", 3.6], [46, 23, "#ffd166", 4.2], [54, 23, "#ff8fc7", 4.2], [62, 26.5, "#fff3f9", 3.6], [69, 33, "#ffd166", 4]];

function Eyes({ variant, glasses }: { variant: number; glasses: boolean }) {
  const ry = variant === 2 ? 2 : 2.9;
  return (
    <g>
      {[43, 57].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={46.5} rx={2.7} ry={ry} fill="#fff" />
          <circle cx={x + (variant === 1 ? 0.6 : 0)} cy={46.8} r={variant === 2 ? 1.7 : 2} fill={INK} />
          <circle cx={x + 0.8} cy={45.8} r={0.7} fill="#fff" />
          {variant === 2 && !glasses ? <path d={`M${x - 3} 45.2 Q${x} 44 ${x + 3} 45.2`} stroke={INK} strokeWidth="0.9" fill="none" strokeLinecap="round" /> : null}
        </g>
      ))}
    </g>
  );
}

function Brows({ variant, color, smiling }: { variant: number; color: string; smiling: boolean }) {
  // Arched, straight, raised (curious) or angled (determined); the angled set only on unsmiling faces.
  const shape = !smiling && variant === 3 ? 3 : variant % 3;
  const paths = [
    ["M39 40.5 Q43 38 47 40", "M53 40 Q57 38 61 40.5"],
    ["M39 40.2 L47 40", "M53 40 L61 40.2"],
    ["M39 39.4 Q43 36.6 47 38.6", "M53 38.6 Q57 36.6 61 39.4"],
    ["M39 39 L47 41", "M53 41 L61 39"],
  ][shape];
  return (
    <g stroke={color} strokeWidth="1.9" strokeLinecap="round" fill="none">
      {paths.map((d) => <path key={d} d={d} />)}
    </g>
  );
}

function Mouth({ smiling, variant }: { smiling: boolean; variant: number }) {
  if (smiling) {
    // An open, unmistakable smile: curved up, teeth showing, cheeks lifted.
    return (
      <g>
        <path d="M41.5 55.4 Q50 66 58.5 55.4 Q50 58.4 41.5 55.4 Z" fill={MOUTH} stroke={MOUTH} strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M43.6 56.4 Q50 58.6 56.4 56.4 L55.6 57.9 Q50 59.6 44.4 57.9 Z" fill="#fff" />
        <path d="M46 61 Q50 62.6 54 61" stroke="#e46a7f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </g>
    );
  }
  // Not smiling: level, slightly down, or a small "o"; never curved upward.
  if (variant === 0) return <path d="M45 58 L55 58" stroke={MOUTH} strokeWidth="1.9" strokeLinecap="round" />;
  if (variant === 1) return <path d="M45 59 Q50 56.8 55 59" stroke={MOUTH} strokeWidth="1.9" fill="none" strokeLinecap="round" />;
  return <ellipse cx="50" cy="58.2" rx="2.1" ry="2.5" fill={MOUTH} />;
}

export const Portrait = memo(function Portrait({ character, className, label }: { character: Character; className?: string; label?: string }) {
  const t = character.traits;
  const i = indexOf(character);
  const skin = SKIN[i % SKIN.length];
  const outfit = OUTFIT[(i * 3) % OUTFIT.length];
  const gem = GEM_COLORS[t.gem];
  const gemDark = GEM_DARK[t.gem];
  const hair = HAIR[t.hairColor];
  const smiling = t.smiling === "yes";
  const glasses = t.glasses === "yes";
  const browColor = t.hair === "none" ? "#3a2a2a" : t.hairColor === "silver" ? "#9aa3b5" : hair.shade;
  const id = `wai-${character.id}`;
  return (
    <svg viewBox="0 0 100 100" className={cn("block size-full", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="40%" r="72%">
          <stop offset="0%" stopColor={gem} stopOpacity="0.62" />
          <stop offset="70%" stopColor={gem} stopOpacity="0.16" />
          <stop offset="100%" stopColor={gemDark} stopOpacity="0.3" />
        </radialGradient>
        <linearGradient id={`${id}-face`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={skin.base} />
          <stop offset="100%" stopColor={skin.shade} />
        </linearGradient>
        <linearGradient id={`${id}-hair`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hair.base} />
          <stop offset="100%" stopColor={hair.shade} />
        </linearGradient>
        <clipPath id={`${id}-frame`}>
          <rect width="100" height="100" rx="10" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-frame)`}>
        <rect width="100" height="100" fill="#140f28" />
        <rect width="100" height="100" fill={`url(#${id}-bg)`} />
        {/* Facets */}
        <path d="M0 66 L24 42 L0 24 Z M100 62 L80 40 L100 20 Z M60 0 L72 12 L84 0 Z" fill={gem} opacity="0.16" />

        {/* Long hair falls behind the shoulders */}
        {t.hair === "long" ? <path d="M28 46 Q25 17 50 16 Q75 17 72 46 L78 88 Q50 97 22 88 Z" fill={`url(#${id}-hair)`} /> : null}

        {/* Shoulders, collar and gem brooch */}
        <path d="M12 100 Q15 76 50 73 Q85 76 88 100 Z" fill={outfit} />
        <path d="M12 100 Q15 76 50 73 Q85 76 88 100" fill="none" stroke="#fff" strokeOpacity="0.08" strokeWidth="1.5" />
        <path d="M39 75 L50 86 L61 75" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.6" strokeLinejoin="round" />
        <rect x="44" y="60" width="12" height="16" rx="4" fill={skin.shade} />
        <g transform="translate(40.5 88)">
          <path d="M0 -5 L4.5 0 L0 5.5 L-4.5 0 Z" fill={gem} stroke="#fff" strokeWidth="0.9" strokeLinejoin="round" />
          <path d="M-4.5 0 L4.5 0 M0 -5 L-1.6 0 L0 5.5 L1.6 0 Z" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.5" />
        </g>
        {t.hair === "long" ? (
          <g fill={`url(#${id}-hair)`}>
            <path d="M30 44 Q27 66 34 82 Q38 80 37 70 Q35 58 36 46 Z" />
            <path d="M70 44 Q73 66 66 82 Q62 80 63 70 Q65 58 64 46 Z" />
          </g>
        ) : null}

        {/* Scarf: always the pink striped knit */}
        {t.scarf === "yes" ? (
          <g>
            <path d="M33 70 Q50 81 67 70 L70 78 Q50 92 30 78 Z" fill="#ff6fa3" />
            <path d="M33.5 72.6 Q50 83.5 66.5 72.6 M31.5 75.8 Q50 88 68.5 75.8" stroke="#ffd1e3" strokeWidth="1.2" fill="none" />
            <path d="M56 81 L63 98 L55 99.5 L51 84 Z" fill="#ff4f8f" />
            <path d="M54 88 L60.6 86.6 M55.6 93.4 L62 92" stroke="#ffd1e3" strokeWidth="1.2" />
          </g>
        ) : null}

        {/* Ears */}
        <ellipse cx="31.5" cy="48" rx="3.8" ry="4.8" fill={skin.base} />
        <ellipse cx="68.5" cy="48" rx="3.8" ry="4.8" fill={skin.base} />
        <path d="M31.5 46 Q30 48 31.5 50 M68.5 46 Q70 48 68.5 50" stroke={skin.shade} strokeWidth="1" fill="none" />

        {/* Head */}
        <path d="M31.5 44 Q31.5 25 50 25 Q68.5 25 68.5 44 Q68.5 60 59 66.5 Q50 71.5 41 66.5 Q31.5 60 31.5 44 Z" fill={`url(#${id}-face)`} />

        {/* Hair */}
        {t.hair === "short" ? (
          <g>
            <path d="M30.5 46 Q28 21 50 20 Q72 21 69.5 46 Q68 36 64 32 Q56 36 44 33 Q39 32 36 30 Q32 36 30.5 46 Z" fill={`url(#${id}-hair)`} />
            <path d="M40 24.6 Q48 22 58 24" stroke={hair.shine} strokeOpacity="0.7" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </g>
        ) : null}
        {t.hair === "long" ? (
          <g>
            <path d="M30 47 Q27 19 50 19 Q73 19 70 47 Q67 33 58 29 Q50 36 36 37 Q32 41 30 47 Z" fill={`url(#${id}-hair)`} />
            <path d="M41 23.5 Q49 21 59 23.5" stroke={hair.shine} strokeOpacity="0.7" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </g>
        ) : null}
        {t.hair === "curly" ? (
          <g fill={`url(#${id}-hair)`}>
            {CURLS.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />)}
            <path d="M31 40 Q34 23 50 22 Q66 23 69 40 Q60 30 50 30 Q40 30 31 40 Z" />
            {FRINGE_CURLS.map(([x, y]) => <circle key={`f${x}`} cx={x} cy={y} r="3.6" />)}
            {CURLS.slice(2, 8).map(([x, y]) => <circle key={`s${x}`} cx={x - 1.5} cy={y - 1.8} r="1.4" fill={hair.shine} fillOpacity="0.55" />)}
          </g>
        ) : null}
        {t.hair === "none" ? <ellipse cx="41" cy="31" rx="6.5" ry="3" fill="#fff" opacity="0.32" transform="rotate(-22 41 31)" /> : null}

        {/* Beard in the hair color, with a moustache */}
        {t.beard === "yes" ? (
          <g fill={`url(#${id}-hair)`}>
            <path d="M31.5 47 Q31 70 50 74 Q69 70 68.5 47 Q66 60 58 62 Q50 60 42 62 Q34 60 31.5 47 Z" />
            <path d="M42 55.4 Q46 52.4 50 54.4 Q54 52.4 58 55.4 Q54 56.4 50 55.6 Q46 56.4 42 55.4 Z" fill={hair.shade} />
          </g>
        ) : null}

        {/* Face */}
        <ellipse cx="38.5" cy="53" rx="3.4" ry="2.2" fill="#ff7b8f" opacity={smiling ? 0.45 : 0.2} />
        <ellipse cx="61.5" cy="53" rx="3.4" ry="2.2" fill="#ff7b8f" opacity={smiling ? 0.45 : 0.2} />
        <Brows variant={i % 4} color={browColor} smiling={smiling} />
        <Eyes variant={smiling ? i % 2 : i % 3} glasses={glasses} />
        <path d="M50 48.5 Q48.4 52.2 50.4 52.8" stroke={skin.shade} strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <Mouth smiling={smiling} variant={i % 3} />

        {/* Glasses: bold dark frames */}
        {glasses ? (
          <g>
            <circle cx="43" cy="46.5" r="5.6" fill="#ffffff" fillOpacity="0.14" stroke={INK} strokeWidth="1.9" />
            <circle cx="57" cy="46.5" r="5.6" fill="#ffffff" fillOpacity="0.14" stroke={INK} strokeWidth="1.9" />
            <path d="M48.6 46.2 Q50 45 51.4 46.2 M37.4 45.6 L32.5 44.6 M62.6 45.6 L67.5 44.6" stroke={INK} strokeWidth="1.7" fill="none" strokeLinecap="round" />
            <path d="M40 43.6 L42.2 42.4 M54 43.6 L56.2 42.4" stroke="#fff" strokeOpacity="0.7" strokeWidth="1" strokeLinecap="round" />
          </g>
        ) : null}

        {/* Earrings: gem drops below each ear */}
        {t.earrings === "yes" ? (
          <g stroke="#fff" strokeWidth="0.9" strokeLinejoin="round">
            <path d="M31.5 52.6 L31.5 54.6" stroke="#ffe08a" strokeWidth="1.1" />
            <path d="M68.5 52.6 L68.5 54.6" stroke="#ffe08a" strokeWidth="1.1" />
            <path d="M31.5 54.4 L34.2 58 L31.5 62 L28.8 58 Z" fill={gem} />
            <path d="M68.5 54.4 L71.2 58 L68.5 62 L65.8 58 Z" fill={gem} />
          </g>
        ) : null}

        {/* Headwear */}
        {t.headwear === "crown" ? (
          <g>
            <path d="M34.5 27 L36.5 11 L43.5 19 L50 8 L56.5 19 L63.5 11 L65.5 27 Q50 30 34.5 27 Z" fill="#ffd34d" stroke="#a87908" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M35.4 23.4 Q50 26.4 64.6 23.4" stroke="#a87908" strokeWidth="1" fill="none" />
            <circle cx="50" cy="20.6" r="2.2" fill={gem} stroke="#fff" strokeWidth="0.7" />
            <circle cx="36.5" cy="11" r="1.4" fill="#fff6c9" />
            <circle cx="50" cy="8" r="1.5" fill="#fff6c9" />
            <circle cx="63.5" cy="11" r="1.4" fill="#fff6c9" />
          </g>
        ) : null}
        {t.headwear === "wizard" ? (
          <g>
            <path d="M31 30 Q42 18 47 3 Q49 -1 52 2 Q60 16 69 30 Z" fill="#2f40a8" />
            <path d="M47 3 Q49 -1 52 2 Q55 9 58 14 Q52 11 47 3 Z" fill="#4458d0" />
            <ellipse cx="50" cy="30" rx="25" ry="4.8" fill="#24318a" />
            <path d="M53 14 l1.4 2.9 3.1 .4 -2.3 2.1 .6 3.1 -2.8 -1.5 -2.8 1.5 .6 -3.1 -2.3 -2.1 3.1 -.4 Z" fill="#ffe27a" />
            <circle cx="42" cy="22" r="0.9" fill="#ffe27a" />
            <circle cx="60" cy="25" r="0.9" fill="#ffe27a" />
          </g>
        ) : null}
        {t.headwear === "cap" ? (
          <g>
            <path d="M30.5 33 Q30 15 50 14.5 Q70 15 69.5 33 Q50 29 30.5 33 Z" fill="#f97316" />
            <path d="M50 14.5 L50 31" stroke="#c2410c" strokeWidth="1" />
            <path d="M49 30 Q72 26.5 84 33.5 Q70 38.5 49 34 Z" fill="#c2410c" />
            <circle cx="50" cy="15" r="2.1" fill="#c2410c" />
            <path d="M40 22 Q44 18.5 49 18" stroke="#ffb27a" strokeWidth="1.3" fill="none" strokeLinecap="round" />
          </g>
        ) : null}
        {t.headwear === "flowers" ? (
          <g>
            <path d="M29 35 Q50 17 71 35" fill="none" stroke="#3f8f5a" strokeWidth="2.4" />
            <path d="M34.6 29.4 l-3 -1.8 M42 24.2 l-1.2 -3.2 M58 24.2 l1.2 -3.2 M65.4 29.4 l3 -1.8" stroke="#4fb06f" strokeWidth="2" strokeLinecap="round" />
            {BLOSSOMS.map(([x, y, color, r]) => (
              <g key={`${x}-${y}`}>
                {[0, 72, 144, 216, 288].map((angle) => (
                  <circle key={angle} cx={x + Math.cos((angle * Math.PI) / 180) * r * 0.62} cy={y + Math.sin((angle * Math.PI) / 180) * r * 0.62} r={r * 0.55} fill={color} />
                ))}
                <circle cx={x} cy={y} r={r * 0.38} fill="#f6b73c" />
              </g>
            ))}
          </g>
        ) : null}

        {/* Companion: the little cyan wisp */}
        {t.companion === "yes" ? (
          <g>
            <circle cx="83" cy="73" r="12" fill="#9be7ff" opacity="0.22" />
            <path d="M75 79 Q74 63 83 62.5 Q92 63 91 79 Q88.5 76 86.8 80 Q85 76 83 80 Q81 76 79.2 80 Q77.5 76 75 79 Z" fill="#d4f6ff" stroke="#7fd8f5" strokeWidth="0.8" />
            <ellipse cx="80" cy="70" rx="1.4" ry="1.8" fill={INK} />
            <ellipse cx="86" cy="70" rx="1.4" ry="1.8" fill={INK} />
            <path d="M81.6 73.6 Q83 74.8 84.4 73.6" stroke={INK} strokeWidth="0.9" fill="none" strokeLinecap="round" />
            <path d="M92 62 l1 2 2 .3 -1.5 1.4 .4 2 -1.9 -1 -1.9 1 .4 -2 -1.5 -1.4 2 -.3 Z" fill="#fff" opacity="0.85" />
          </g>
        ) : null}

        {/* Gem badge */}
        <g transform="translate(14 15)">
          <path d="M0 -10 L9 -1 L0 11 L-9 -1 Z" fill={gem} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M-9 -1 L9 -1 M0 -10 L-3.4 -1 L0 11 L3.4 -1 Z" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="0.8" />
          <path d="M-4.6 -5.2 L-2.2 -7.4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
});

/** Your own card: hidden until the round is over. */
export function MysteryPortrait({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("block size-full", className)}>
      <defs>
        <linearGradient id="wai-mystery" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3a2470" />
          <stop offset="100%" stopColor="#1a1233" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="10" fill="url(#wai-mystery)" />
      <path d="M0 66 L24 42 L0 24 Z M100 62 L80 40 L100 20 Z" fill="#c084fc" opacity="0.14" />
      <path d="M12 100 Q15 76 50 73 Q85 76 88 100 Z" fill="#2a2147" />
      <path d="M31.5 44 Q31.5 25 50 25 Q68.5 25 68.5 44 Q68.5 60 59 66.5 Q50 71.5 41 66.5 Q31.5 60 31.5 44 Z" fill="#2f2552" />
      <text x="50" y="58" textAnchor="middle" fontSize="30" fontWeight="800" fill="#e2d4ff" fontFamily="ui-sans-serif, system-ui">?</text>
    </svg>
  );
}
