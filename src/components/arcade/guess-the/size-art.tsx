import type { ReactNode } from "react";
import type { SizeArt } from "@/lib/minigames/guess-the";

/**
 * Artwork for Guess the Real Size. Each piece is drawn in a box `w` × 100 whose shape matches the real thing's
 * proportions (w = 100 × aspect), so whatever the scale, the measured side is exactly the box's width or height.
 */
export function artwork(art: SizeArt, w: number): ReactNode {
  const cx = w / 2;
  switch (art) {
    case "earth":
      return (
        <>
          <circle cx={cx} cy="50" r="50" fill="#2a6fd6" />
          <path d="M22 30 Q34 18 48 26 Q52 38 40 44 Q30 52 34 64 Q22 60 18 46 Z M58 54 Q72 50 80 62 Q76 78 62 80 Q56 70 58 54 Z M60 14 Q70 10 76 18 Q70 24 62 22 Z" fill="#46a85a" />
          <circle cx={cx} cy="50" r="50" fill="url(#gts-shade)" />
        </>
      );
    case "moon":
      return (
        <>
          <circle cx={cx} cy="50" r="50" fill="#b9b8b2" />
          {[[30, 32, 9], [62, 26, 6], [56, 62, 12], [28, 66, 6], [76, 48, 5]].map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#9a9993" />
          ))}
          <circle cx={cx} cy="50" r="50" fill="url(#gts-shade)" />
        </>
      );
    case "mars":
      return (
        <>
          <circle cx={cx} cy="50" r="50" fill="#c4562e" />
          <path d="M14 40 Q34 34 52 44 Q70 52 88 44 Q86 56 70 60 Q50 62 30 54 Q18 50 14 40 Z" fill="#9a3a20" />
          <ellipse cx={cx} cy="6" rx="16" ry="4" fill="#f2ece6" />
          <circle cx={cx} cy="50" r="50" fill="url(#gts-shade)" />
        </>
      );
    case "jupiter":
      return (
        <>
          <clipPath id="gts-jup">
            <circle cx={cx} cy="50" r="50" />
          </clipPath>
          <g clipPath="url(#gts-jup)">
            <rect width={w} height="100" fill="#e6cfa8" />
            {[18, 32, 44, 58, 70, 84].map((y, i) => (
              <rect key={y} y={y} width={w} height={i % 2 ? 6 : 8} fill={i % 2 ? "#c79a6a" : "#a8724a"} />
            ))}
            <ellipse cx="64" cy="64" rx="10" ry="5" fill="#c4562e" />
          </g>
          <circle cx={cx} cy="50" r="50" fill="url(#gts-shade)" />
        </>
      );
    case "sun":
      return (
        <>
          <circle cx={cx} cy="50" r="50" fill="url(#gts-sun)" />
          {[[34, 40, 4], [62, 58, 3], [48, 70, 2.5]].map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#d86a10" opacity="0.6" />
          ))}
        </>
      );
    case "eiffel":
      return (
        <>
          <path d={`M0 100 Q${w * 0.3} 62 ${w * 0.4} 30 L${w * 0.47} 6 L${cx} 0 L${w * 0.53} 6 L${w * 0.6} 30 Q${w * 0.7} 62 ${w} 100 L${w * 0.8} 100 Q${cx} 74 ${w * 0.2} 100 Z`} fill="#8a6a4a" />
          <path d={`M${w * 0.12} 80 H${w * 0.88} M${w * 0.33} 50 H${w * 0.67} M${w * 0.44} 24 H${w * 0.56}`} stroke="#5a4028" strokeWidth="1.6" />
          <path d={`M${w * 0.2} 100 L${w * 0.45} 30 M${w * 0.8} 100 L${w * 0.55} 30`} stroke="#5a4028" strokeWidth="0.6" opacity="0.6" />
        </>
      );
    case "liberty":
      return (
        <>
          <path d={`M${w * 0.05} 100 L${w * 0.15} 66 H${w * 0.85} L${w * 0.95} 100 Z`} fill="#b8a888" />
          <rect x={w * 0.22} y="52" width={w * 0.56} height="14" fill="#a8987a" />
          <path d={`M${w * 0.36} 52 Q${w * 0.32} 34 ${w * 0.4} 24 L${w * 0.44} 16 L${w * 0.56} 16 L${w * 0.6} 24 Q${w * 0.68} 34 ${w * 0.64} 52 Z`} fill="#5fa898" />
          <path d={`M${w * 0.58} 22 L${w * 0.72} 4`} stroke="#5fa898" strokeWidth="3.5" strokeLinecap="round" />
          <path d={`M${w * 0.7} 4 L${w * 0.74} 0 L${w * 0.78} 4 Z`} fill="#f2b42a" />
          <circle cx={cx} cy="13" r={w * 0.07} fill="#5fa898" />
          <path d={`M${w * 0.42} 9 L${cx} 4 L${w * 0.58} 9`} stroke="#5fa898" strokeWidth="1.5" fill="none" />
        </>
      );
    case "burj":
      return (
        <>
          {[0, 1, 2, 3, 4].map((k) => (
            <rect key={k} x={w * (0.1 + k * 0.08)} y={30 + k * 14} width={w * (0.8 - k * 0.16)} height={70 - k * 14} fill={k % 2 ? "#9ab0c4" : "#b8c8d8"} />
          ))}
          <rect x={w * 0.42} y="12" width={w * 0.16} height="20" fill="#c8d4e0" />
          <path d={`M${cx} 0 L${w * 0.54} 14 H${w * 0.46} Z`} fill="#dce4ec" />
        </>
      );
    case "empire-state":
      return (
        <>
          <rect x="0" y="70" width={w} height="30" fill="#b8ae9a" />
          <rect x={w * 0.12} y="30" width={w * 0.76} height="42" fill="#c8bea8" />
          <rect x={w * 0.28} y="10" width={w * 0.44} height="22" fill="#d4cab4" />
          <rect x={w * 0.4} y="0" width={w * 0.2} height="12" fill="#e0d6c0" />
          {Array.from({ length: 6 }, (_, k) => (
            <rect key={k} x={w * (0.18 + k * 0.12)} y="34" width={w * 0.03} height="36" fill="#9a907c" />
          ))}
        </>
      );
    case "saturn-v":
      return (
        <>
          <path d={`M${w * 0.47} 0 H${w * 0.53} L${w * 0.55} 8 H${w * 0.45} Z`} fill="#d0d0d0" />
          <path d={`M${w * 0.35} 8 H${w * 0.65} L${w * 0.75} 22 V94 H${w * 0.25} V22 Z`} fill="#f4f4f0" />
          <rect x={w * 0.25} y="40" width={w * 0.5} height="3" fill="#1a1a1a" />
          <rect x={w * 0.25} y="62" width={w * 0.5} height="4" fill="#1a1a1a" />
          <rect x={w * 0.25} y="78" width={w * 0.5} height="3" fill="#1a1a1a" />
          <path d={`M${w * 0.25} 86 L0 100 H${w * 0.3} Z M${w * 0.75} 86 L${w} 100 H${w * 0.7} Z`} fill="#1a1a1a" />
          <rect x={w * 0.3} y="94" width={w * 0.4} height="6" fill="#5a5a5a" />
        </>
      );
    case "a380":
    case "b737": {
      const big = art === "a380";
      const body = big ? { top: 30, bottom: 70 } : { top: 44, bottom: 72 };
      return (
        <>
          <path d={`M${w * 0.86} ${body.top + 6} L${w * 0.92} 0 H${w} L${w * 0.97} ${body.top + 8} Z`} fill={big ? "#2a5aa8" : "#c8202a"} />
          <path
            d={`M${w * 0.03} ${body.bottom - 8} Q0 ${(body.top + body.bottom) / 2} ${w * 0.06} ${body.top + 2} Q${w * 0.1} ${body.top - 2} ${w * 0.18} ${body.top} H${w * 0.88} L${w} ${body.top + 10} L${w * 0.9} ${body.bottom - 4} H${w * 0.08} Q${w * 0.04} ${body.bottom} ${w * 0.03} ${body.bottom - 8} Z`}
            fill="#f2f4f8"
            stroke="#7a8496"
            strokeWidth="1"
          />
          {Array.from({ length: big ? 30 : 18 }, (_, k) => (
            <circle key={k} cx={w * (0.14 + k * (big ? 0.024 : 0.04))} cy={body.top + 9} r="1.4" fill="#5a6a8a" />
          ))}
          {big
            ? Array.from({ length: 30 }, (_, k) => <circle key={`l${k}`} cx={w * (0.14 + k * 0.024)} cy={body.top + 22} r="1.4" fill="#5a6a8a" />)
            : null}
          <path d={`M${w * 0.38} ${body.bottom - 6} L${w * 0.58} ${body.bottom - 4} L${w * 0.46} ${body.bottom + 2} Z`} fill="#c8ccd6" />
          <ellipse cx={w * 0.42} cy={body.bottom + 6} rx={w * 0.05} ry="5" fill="#8a93a6" />
          {big ? <ellipse cx={w * 0.52} cy={body.bottom + 5} rx={w * 0.045} ry="4.5" fill="#8a93a6" /> : null}
          <path d={`M${w * 0.18} ${body.bottom} V100 M${w * 0.5} ${body.bottom + 4} V100`} stroke="#3a3a44" strokeWidth="2" />
        </>
      );
    }
    case "card":
      return (
        <>
          <rect x="0.5" y="0.5" width={w - 1} height="99" rx="6" fill="url(#gts-card)" stroke="#1a2a5a" strokeWidth="1" />
          <rect x={w * 0.1} y="34" width={w * 0.14} height="22" rx="3" fill="#e8c86a" />
          <rect x={w * 0.1} y="72" width={w * 0.55} height="5" rx="2" fill="rgb(255 255 255 / 0.7)" />
          <circle cx={w * 0.82} cy="80" r="9" fill="#e8402a" opacity="0.9" />
          <circle cx={w * 0.89} cy="80" r="9" fill="#f2a81a" opacity="0.9" />
        </>
      );
    case "quarter":
      return (
        <>
          <circle cx={cx} cy="50" r="50" fill="#c8ccd2" />
          <circle cx={cx} cy="50" r="44" fill="none" stroke="#9aa0aa" strokeWidth="2" />
          <path d={`M${cx - 8} 74 Q${cx - 22} 60 ${cx - 14} 40 Q${cx - 6} 22 ${cx + 10} 28 Q${cx + 18} 36 ${cx + 12} 46 L${cx + 14} 56 Q${cx + 6} 62 ${cx + 8} 74 Z`} fill="#a8aeb8" />
          <text x={cx} y="94" textAnchor="middle" fontSize="9" fontWeight="700" fill="#6a707a">
            QUARTER DOLLAR
          </text>
        </>
      );
    case "dollar":
      return (
        <>
          <rect x="0.5" y="0.5" width={w - 1} height="99" rx="2" fill="#d8e4cc" stroke="#5a7a4a" strokeWidth="1.2" />
          <rect x="6" y="6" width={w - 12} height="88" fill="none" stroke="#5a7a4a" strokeWidth="1" />
          <ellipse cx={cx} cy="50" rx="22" ry="30" fill="#b8ccaa" stroke="#4a6a3a" strokeWidth="1.2" />
          <text x="16" y="28" fontSize="16" fontWeight="800" fill="#3a5a2a">
            1
          </text>
          <text x={w - 26} y="88" fontSize="16" fontWeight="800" fill="#3a5a2a">
            1
          </text>
        </>
      );
    case "a4":
      return (
        <>
          <rect x="0.5" y="0.5" width={w - 1} height="99" fill="#fbfbf8" stroke="#a8acb6" strokeWidth="0.8" />
          {Array.from({ length: 12 }, (_, k) => (
            <rect key={k} x={w * 0.12} y={14 + k * 6} width={w * (k % 4 === 3 ? 0.5 : 0.76)} height="1.6" fill="#c8ccd6" />
          ))}
        </>
      );
    case "football":
      return (
        <>
          <circle cx={cx} cy="50" r="49" fill="#fbfbf8" stroke="#2a2a2a" strokeWidth="1.5" />
          <path d={`M${cx} 34 L${cx + 15} 45 L${cx + 9} 62 H${cx - 9} L${cx - 15} 45 Z`} fill="#1a1a1a" />
          {[0, 72, 144, 216, 288].map((a) => (
            <path key={a} d={`M${cx} 4 L${cx + 12} 12 L${cx + 8} 22 H${cx - 8} L${cx - 12} 12 Z`} fill="#1a1a1a" transform={`rotate(${a} ${cx} 50)`} />
          ))}
        </>
      );
    case "tennis-ball":
      return (
        <>
          <circle cx={cx} cy="50" r="50" fill="#d6ec3a" />
          <path d={`M${cx - 44} 26 Q${cx - 10} 50 ${cx - 44} 74 M${cx + 44} 26 Q${cx + 10} 50 ${cx + 44} 74`} stroke="#fbfbf0" strokeWidth="4" fill="none" />
          <circle cx={cx} cy="50" r="50" fill="url(#gts-shade)" />
        </>
      );
    case "golf-ball":
      return (
        <>
          <circle cx={cx} cy="50" r="50" fill="#fbfbf8" />
          {Array.from({ length: 30 }, (_, k) => {
            const a = k * 2.4;
            const d = 8 + (k % 6) * 7;
            return <circle key={k} cx={cx + Math.cos(a) * d} cy={50 + Math.sin(a) * d} r="2.6" fill="#dcdcd4" />;
          })}
          <circle cx={cx} cy="50" r="50" fill="url(#gts-shade)" />
        </>
      );
    case "tennis-court":
      return (
        <>
          <rect width={w} height="100" fill="#3a7ab8" />
          <rect x="1" y="1" width={w - 2} height="98" fill="none" stroke="#fff" strokeWidth="1.5" />
          <path d={`M0 12.5 H${w} M0 87.5 H${w} M${w * 0.23} 12.5 V87.5 M${w * 0.77} 12.5 V87.5 M${w * 0.23} 50 H${w * 0.77}`} stroke="#fff" strokeWidth="1.2" />
          <path d={`M${cx} -2 V102`} stroke="#1a1a1a" strokeWidth="2.4" />
        </>
      );
    case "badminton-court":
      return (
        <>
          <rect width={w} height="100" fill="#2a8a5a" />
          <rect x="1" y="1" width={w - 2} height="98" fill="none" stroke="#fff" strokeWidth="1.5" />
          <path d={`M0 7.5 H${w} M0 92.5 H${w} M${w * 0.06} 0 V100 M${w * 0.94} 0 V100 M${w * 0.35} 0 V100 M${w * 0.65} 0 V100 M${w * 0.06} 50 H${w * 0.35} M${w * 0.65} 50 H${w * 0.94}`} stroke="#fff" strokeWidth="1.1" />
          <path d={`M${cx} -2 V102`} stroke="#1a1a1a" strokeWidth="2.4" />
        </>
      );
    case "pool":
      return (
        <>
          <rect width={w} height="100" fill="#4ab0e0" />
          {Array.from({ length: 9 }, (_, k) => (
            <path key={k} d={`M0 ${(k + 1) * 10} H${w}`} stroke={k % 2 ? "#f2f2f2" : "#e8402a"} strokeWidth="1.2" strokeDasharray="3 2" />
          ))}
          <rect x="0" y="0" width="3" height="100" fill="#1a4a7a" />
          <rect x={w - 3} y="0" width="3" height="100" fill="#1a4a7a" />
        </>
      );
  }
}

/** Shared gradients the artwork refers to. */
export function ArtDefs() {
  return (
    <defs>
      <radialGradient id="gts-shade" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0.55" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.4" />
      </radialGradient>
      <radialGradient id="gts-sun" cx="0.45" cy="0.4" r="0.6">
        <stop offset="0" stopColor="#fff6c0" />
        <stop offset="0.6" stopColor="#ffc23a" />
        <stop offset="1" stopColor="#f2801a" />
      </radialGradient>
      <linearGradient id="gts-card" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#3a5ad8" />
        <stop offset="1" stopColor="#1a2a7a" />
      </linearGradient>
    </defs>
  );
}
