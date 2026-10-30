import type { ReactNode } from "react";

/**
 * Coin Slots symbol art (original, flat SVG: no gradient ids, so any number can share a page).
 * Keyed by the symbol ids used in `slot_machines.reels`; unknown ids fall back to a lettered tile.
 */
export const SLOT_SYMBOLS: Record<string, { name: string; art: ReactNode }> = {
  gem: {
    name: "Amethyst",
    art: (
      <>
        <path d="M20 10h24l12 14-24 32L8 24z" fill="#8b5cf6" />
        <path d="M20 10h24l12 14H8z" fill="#c4b5fd" />
        <path d="M8 24h48L32 56z" fill="#7c3aed" />
        <path d="M20 10l4 14 8-14 8 14 4-14M8 24l24 32 24-32M24 24l8 32 8-32" fill="none" stroke="#4c1d95" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M22 14l-5 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
      </>
    ),
  },
  crown: {
    name: "Crown",
    art: (
      <>
        <path d="M10 22l11 10 11-18 11 18 11-10-5 26H15z" fill="#fbbf24" stroke="#92400e" strokeWidth="2" strokeLinejoin="round" />
        <rect x="14" y="46" width="36" height="7" rx="2" fill="#f59e0b" stroke="#92400e" strokeWidth="2" />
        <circle cx="32" cy="38" r="4" fill="#ec4899" />
        <circle cx="21" cy="40" r="2.6" fill="#38bdf8" />
        <circle cx="43" cy="40" r="2.6" fill="#38bdf8" />
        <circle cx="10" cy="21" r="3" fill="#fde68a" />
        <circle cx="32" cy="12" r="3" fill="#fde68a" />
        <circle cx="54" cy="21" r="3" fill="#fde68a" />
      </>
    ),
  },
  star: {
    name: "Star",
    art: (
      <>
        <path d="M32 6l7.6 16.4 17.9 2.1-13.2 12.2 3.5 17.7L32 45.6l-15.8 8.8 3.5-17.7L6.5 24.5l17.9-2.1z" fill="#facc15" stroke="#a16207" strokeWidth="2" strokeLinejoin="round" />
        <path d="M32 15l4.4 9.5 10.4 1.2" fill="none" stroke="#fef9c3" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="26" cy="32" r="2" fill="#713f12" />
        <circle cx="38" cy="32" r="2" fill="#713f12" />
        <path d="M28 38q4 3 8 0" fill="none" stroke="#713f12" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  moon: {
    name: "Moon",
    art: (
      <>
        <path d="M40 8a24 24 0 1 0 16 38A20 20 0 0 1 40 8z" fill="#c7d2fe" stroke="#4338ca" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="24" cy="26" r="3.5" fill="#a5b4fc" />
        <circle cx="30" cy="44" r="2.5" fill="#a5b4fc" />
        <circle cx="18" cy="38" r="2" fill="#a5b4fc" />
        <path d="M50 14l1.5 3.5L55 19l-3.5 1.5L50 24l-1.5-3.5L45 19l3.5-1.5z" fill="#fde68a" />
      </>
    ),
  },
  coin: {
    name: "Coin",
    art: (
      <>
        <circle cx="32" cy="34" r="22" fill="#d97706" />
        <circle cx="32" cy="31" r="22" fill="#fbbf24" stroke="#92400e" strokeWidth="2" />
        <circle cx="32" cy="31" r="15" fill="none" stroke="#f59e0b" strokeWidth="2.5" />
        <path d="M32 21l7 10-7 10-7-10z" fill="#fde68a" stroke="#b45309" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M18 22q3-6 9-8" fill="none" stroke="#fff7d6" strokeWidth="2.4" strokeLinecap="round" />
      </>
    ),
  },
  berry: {
    name: "Berries",
    art: (
      <>
        <path d="M32 18q-2-8 6-12M32 18q6-7 14-4-4 7-14 4" fill="#22c55e" stroke="#166534" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="22" cy="38" r="11" fill="#e11d48" stroke="#881337" strokeWidth="2" />
        <circle cx="42" cy="38" r="11" fill="#e11d48" stroke="#881337" strokeWidth="2" />
        <circle cx="32" cy="27" r="9" fill="#f43f5e" stroke="#881337" strokeWidth="2" />
        <circle cx="18" cy="34" r="2.6" fill="#fff" opacity="0.8" />
        <circle cx="38" cy="34" r="2.6" fill="#fff" opacity="0.8" />
        <circle cx="29" cy="24" r="2" fill="#fff" opacity="0.8" />
      </>
    ),
  },
};

export const symbolName = (id: string) => SLOT_SYMBOLS[id]?.name ?? id;

export function SlotSymbol({ id, className }: { id: string; className?: string }) {
  const symbol = SLOT_SYMBOLS[id];
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      {symbol ? (
        symbol.art
      ) : (
        <>
          <rect x="8" y="8" width="48" height="48" rx="10" fill="#4c1d95" />
          <text x="32" y="41" textAnchor="middle" fontSize="24" fontWeight="700" fill="#ede9fe">
            {id.slice(0, 1).toUpperCase()}
          </text>
        </>
      )}
    </svg>
  );
}
