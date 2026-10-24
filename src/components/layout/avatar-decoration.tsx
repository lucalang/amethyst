import { useId } from "react";
import type { AvatarDecorationId } from "@/lib/cosmetics";
import { cn } from "@/lib/utils";

const CENTER = 50;

/** Leaves along one side of the wreath: angles in degrees (SVG, y down), growing from the bottom upwards. */
function laurelLeaves(from: number, to: number, side: 1 | -1) {
  const leaves: { x: number; y: number; angle: number }[] = [];
  const steps = 9;
  for (let index = 0; index <= steps; index += 1) {
    const theta = from + ((to - from) * index) / steps;
    const radius = index % 2 === 0 ? 55.5 : 60.5;
    const rad = (theta * Math.PI) / 180;
    const tangent = side === 1 ? theta + 90 : theta - 90;
    leaves.push({
      x: CENTER + radius * Math.cos(rad),
      y: CENTER + radius * Math.sin(rad),
      angle: tangent + (index % 2 === 0 ? 24 : -24) * side,
    });
  }
  return leaves;
}

const LEFT_LEAVES = laurelLeaves(104, 226, 1);
const RIGHT_LEAVES = laurelLeaves(76, -46, -1);
const LEAF = "M0,0 Q5.5,-4.2 12.5,0 Q5.5,4.2 0,0Z";

function Laurel({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-leaf`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbe6a6" />
          <stop offset="0.55" stopColor="#d9a845" />
          <stop offset="1" stopColor="#8f6420" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="#a4772a" strokeWidth="1.6" strokeLinecap="round">
        <path d="M36,106.3 A58,58 0 0 1 9.7,8.3" />
        <path d="M64,106.3 A58,58 0 0 0 90.3,8.3" />
      </g>
      <g fill={`url(#${id}-leaf)`} stroke="#7a531a" strokeWidth="0.6">
        {[...LEFT_LEAVES, ...RIGHT_LEAVES].map((leaf, index) => (
          <path key={index} d={LEAF} transform={`translate(${leaf.x.toFixed(2)} ${leaf.y.toFixed(2)}) rotate(${leaf.angle.toFixed(1)})`} />
        ))}
      </g>
      <circle cx="50" cy="109" r="4.6" fill="#7c4dd6" stroke="#f3dc95" strokeWidth="1.4" />
      <circle cx="48.6" cy="107.6" r="1.3" fill="#fff" opacity="0.7" />
    </>
  );
}

function Orbit({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fe7ff" />
          <stop offset="0.5" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#f0abfc" />
        </linearGradient>
        <radialGradient id={`${id}-planet`} cx="0.35" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#fff7d6" />
          <stop offset="0.45" stopColor="#f5b8ff" />
          <stop offset="1" stopColor="#6d3fd1" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="64.5" fill="none" stroke="#c4b5fd" strokeOpacity="0.45" strokeWidth="1.3" strokeDasharray="0.5 5" strokeLinecap="round" />
      <circle cx="50" cy="50" r="58.5" fill="none" stroke={`url(#${id}-ring)`} strokeWidth="2.4" />
      <g transform="translate(95.2 12.1)">
        <circle r="10" fill="#c4b5fd" opacity="0.18" />
        <circle r="6.4" fill={`url(#${id}-planet)`} />
        <ellipse rx="10.5" ry="2.6" fill="none" stroke="#fde68a" strokeWidth="1.1" transform="rotate(-24)" />
      </g>
      <circle cx="-1.1" cy="79.5" r="3.4" fill="#7fe7ff" stroke="#0e1530" strokeWidth="0.8" />
      <circle cx="16" cy="-1" r="1.2" fill="#fff" opacity="0.8" />
      <circle cx="104" cy="74" r="1" fill="#fff" opacity="0.7" />
    </>
  );
}

function Crown({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.5" stopColor="#e8b84a" />
          <stop offset="1" stopColor="#9a6a1c" />
        </linearGradient>
      </defs>
      <g transform="rotate(18 50 50)" strokeLinejoin="round">
        <path d="M28,5 L23,-16 L38,-5 L50,-25 L62,-5 L77,-16 L72,5 Z" fill={`url(#${id}-gold)`} stroke="#6f4a12" strokeWidth="1.3" />
        <rect x="27.5" y="-2" width="45" height="7" rx="1.5" fill="#b9862c" stroke="#6f4a12" strokeWidth="1" />
        <circle cx="23" cy="-16" r="2.6" fill="#fff1b8" stroke="#6f4a12" strokeWidth="0.8" />
        <circle cx="50" cy="-25" r="2.8" fill="#fff1b8" stroke="#6f4a12" strokeWidth="0.8" />
        <circle cx="77" cy="-16" r="2.6" fill="#fff1b8" stroke="#6f4a12" strokeWidth="0.8" />
        <path d="M50,-4.5 L54,1.5 L50,7 L46,1.5 Z" fill="#8b5cf6" stroke="#3b1d7a" strokeWidth="0.8" />
        <circle cx="37.5" cy="1.5" r="2.3" fill="#fb7185" stroke="#7f1d3a" strokeWidth="0.7" />
        <circle cx="62.5" cy="1.5" r="2.3" fill="#38bdf8" stroke="#0c4a6e" strokeWidth="0.7" />
        <path d="M49,-2.5 L50.5,-0.5" stroke="#fff" strokeWidth="0.9" strokeLinecap="round" opacity="0.8" />
      </g>
    </>
  );
}

/**
 * A decoration drawn around (never over the middle of) a round avatar. The box extends 30% past
 * the avatar on every side; the avatar image itself is untouched.
 */
export function AvatarDecoration({ decoration, className }: { decoration: AvatarDecorationId; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg
      aria-hidden
      viewBox="-30 -30 160 160"
      className={cn("pointer-events-none absolute -inset-[30%] size-[160%] overflow-visible drop-shadow-[0_2px_3px_rgb(0_0_0/0.45)]", className)}
      data-decoration={decoration}
    >
      {decoration === "laurel-wreath" ? <Laurel id={id} /> : decoration === "orbit-ring" ? <Orbit id={id} /> : <Crown id={id} />}
    </svg>
  );
}
