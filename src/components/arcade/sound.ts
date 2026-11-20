"use client";

/**
 * Small synthesized sound effects (Web Audio oscillators and filtered noise), so every
 * sound is original and nothing is downloaded. The audio context is only created when a
 * sound is first played, which always follows a player action.
 */

import { sfxLevel } from "@/lib/sfx-volume";

/** `attack`: seconds to reach full volume (default 10 ms); `filter`: a lowpass cutoff that warms a tone. */
type Tone = { freq: number; to?: number; duration: number; type?: OscillatorType; volume?: number; delay?: number; attack?: number; filter?: number };
/** `to`: the filter sweeps to this frequency over the sound; `q`: filter resonance. */
type Noise = { noise: true; duration: number; volume?: number; filter?: BiquadFilterType; freq?: number; to?: number; q?: number; delay?: number; attack?: number };
type Part = Tone | Noise;

export const SOUNDS = {
  move: [{ freq: 220, to: 180, duration: 0.05, type: "triangle", volume: 0.05 }],
  merge: [{ freq: 392, to: 523, duration: 0.09, type: "triangle", volume: 0.09 }],
  flap: [{ freq: 420, to: 720, duration: 0.09, type: "triangle", volume: 0.1 }],
  point: [
    { freq: 880, duration: 0.06, type: "square", volume: 0.045 },
    { freq: 1320, duration: 0.09, type: "square", volume: 0.045, delay: 0.06 },
  ],
  hit: [
    { noise: true, duration: 0.18, volume: 0.22, filter: "lowpass", freq: 900 },
    { freq: 240, to: 70, duration: 0.3, type: "sawtooth", volume: 0.08 },
  ],
  eat: [{ freq: 600, to: 980, duration: 0.08, type: "square", volume: 0.05 }],
  slice: [{ noise: true, duration: 0.11, volume: 0.18, filter: "highpass", freq: 2400 }],
  squish: [
    { noise: true, duration: 0.1, volume: 0.16, filter: "highpass", freq: 2600 },
    { noise: true, duration: 0.12, volume: 0.1, filter: "bandpass", freq: 800, delay: 0.02 },
    { freq: 520, to: 260, duration: 0.08, type: "sine", volume: 0.05, delay: 0.015 },
  ],
  swoosh: [{ noise: true, duration: 0.14, volume: 0.05, filter: "bandpass", freq: 3200 }],
  penalty: [
    { noise: true, duration: 0.32, volume: 0.24, filter: "lowpass", freq: 600 },
    { freq: 220, to: 90, duration: 0.3, type: "sawtooth", volume: 0.07 },
  ],
  tick: [{ freq: 1050, duration: 0.03, type: "sine", volume: 0.04 }],
  perfect: [
    { freq: 1046, duration: 0.14, type: "sine", volume: 0.08 },
    { freq: 2093, duration: 0.09, type: "triangle", volume: 0.03, delay: 0.01 },
  ],
  thud: [
    { freq: 150, to: 95, duration: 0.11, type: "triangle", volume: 0.13 },
    { noise: true, duration: 0.05, volume: 0.06, filter: "lowpass", freq: 1200 },
  ],
  combo: [
    { freq: 660, duration: 0.07, type: "triangle", volume: 0.08 },
    { freq: 880, duration: 0.07, type: "triangle", volume: 0.08, delay: 0.07 },
    { freq: 1175, duration: 0.12, type: "triangle", volume: 0.08, delay: 0.14 },
  ],
  bomb: [
    { noise: true, duration: 0.55, volume: 0.32, filter: "lowpass", freq: 520 },
    { freq: 140, to: 38, duration: 0.5, type: "sawtooth", volume: 0.1 },
  ],
  miss: [{ freq: 330, to: 160, duration: 0.2, type: "triangle", volume: 0.08 }],
  place: [{ freq: 196, to: 150, duration: 0.09, type: "triangle", volume: 0.12 }],
  chip: [{ noise: true, duration: 0.07, volume: 0.1, filter: "bandpass", freq: 1400 }],
  tap: [{ freq: 740, duration: 0.035, type: "sine", volume: 0.05 }],
  erase: [{ freq: 300, to: 220, duration: 0.05, type: "sine", volume: 0.05 }],
  win: [
    { freq: 523, duration: 0.1, type: "triangle", volume: 0.09 },
    { freq: 659, duration: 0.1, type: "triangle", volume: 0.09, delay: 0.1 },
    { freq: 784, duration: 0.1, type: "triangle", volume: 0.09, delay: 0.2 },
    { freq: 1047, duration: 0.26, type: "triangle", volume: 0.09, delay: 0.3 },
  ],
  over: [
    { freq: 392, duration: 0.12, type: "triangle", volume: 0.08 },
    { freq: 311, duration: 0.12, type: "triangle", volume: 0.08, delay: 0.12 },
    { freq: 233, duration: 0.3, type: "triangle", volume: 0.08, delay: 0.24 },
  ],
  chomp: [{ freq: 520, to: 340, duration: 0.05, type: "square", volume: 0.03 }],
  laser: [{ freq: 1500, to: 520, duration: 0.07, type: "square", volume: 0.025 }],
  power: [
    { freq: 440, to: 880, duration: 0.12, type: "triangle", volume: 0.08 },
    { freq: 660, to: 1320, duration: 0.14, type: "triangle", volume: 0.06, delay: 0.08 },
  ],
  boom: [
    { noise: true, duration: 0.22, volume: 0.14, filter: "lowpass", freq: 1400 },
    { freq: 180, to: 60, duration: 0.18, type: "triangle", volume: 0.06 },
  ],
  invalid: [{ freq: 196, to: 165, duration: 0.12, type: "sawtooth", volume: 0.035 }],
  // Interface effects used outside the games.
  check: [
    { freq: 660, to: 990, duration: 0.07, type: "sine", volume: 0.07 },
    { freq: 1320, duration: 0.14, type: "sine", volume: 0.045, delay: 0.06 },
  ],
  uncheck: [{ freq: 520, to: 360, duration: 0.08, type: "sine", volume: 0.045 }],
  add: [{ freq: 480, to: 760, duration: 0.07, type: "triangle", volume: 0.05 }],
  coin: [
    { freq: 988, duration: 0.06, type: "square", volume: 0.03 },
    { freq: 1319, duration: 0.18, type: "square", volume: 0.03, delay: 0.06 },
  ],
  purchase: [
    { noise: true, duration: 0.05, volume: 0.06, filter: "bandpass", freq: 3000 },
    { freq: 1175, duration: 0.07, type: "triangle", volume: 0.07, delay: 0.03 },
    { freq: 1568, duration: 0.2, type: "triangle", volume: 0.06, delay: 0.1 },
  ],
  equip: [
    { freq: 523, duration: 0.05, type: "triangle", volume: 0.06 },
    { freq: 784, duration: 0.1, type: "triangle", volume: 0.06, delay: 0.05 },
  ],
  claim: [
    { freq: 784, duration: 0.08, type: "triangle", volume: 0.07 },
    { freq: 988, duration: 0.08, type: "triangle", volume: 0.07, delay: 0.06 },
    { freq: 1319, duration: 0.22, type: "triangle", volume: 0.07, delay: 0.12 },
    { freq: 2637, duration: 0.16, type: "sine", volume: 0.02, delay: 0.14 },
  ],
  reveal: [
    { freq: 300, to: 900, duration: 0.12, type: "triangle", volume: 0.06 },
    { noise: true, duration: 0.1, volume: 0.04, filter: "highpass", freq: 3000, delay: 0.04 },
  ],
  unlock: [
    { freq: 392, to: 784, duration: 0.25, type: "sawtooth", volume: 0.025 },
    { freq: 523, duration: 0.32, type: "triangle", volume: 0.07, delay: 0.1 },
    { freq: 659, duration: 0.32, type: "triangle", volume: 0.07, delay: 0.16 },
    { freq: 784, duration: 0.45, type: "triangle", volume: 0.07, delay: 0.22 },
  ],
  flame: [
    { noise: true, duration: 0.38, volume: 0.12, filter: "bandpass", freq: 900 },
    { freq: 180, to: 540, duration: 0.32, type: "triangle", volume: 0.06 },
  ],
  crack: [
    { noise: true, duration: 0.12, volume: 0.14, filter: "lowpass", freq: 1600 },
    { freq: 220, to: 110, duration: 0.14, type: "triangle", volume: 0.07 },
  ],

  /* Who Am I?: soft card and bell sounds for the parlor table. */
  waiAsk: [
    { noise: true, duration: 0.07, volume: 0.05, filter: "bandpass", freq: 2200 },
    { freq: 523, to: 587, duration: 0.09, type: "triangle", volume: 0.05, delay: 0.03 },
  ],
  waiYes: [
    { freq: 659, duration: 0.1, type: "triangle", volume: 0.07 },
    { freq: 988, duration: 0.2, type: "triangle", volume: 0.065, delay: 0.08 },
  ],
  waiNo: [
    { freq: 392, duration: 0.1, type: "triangle", volume: 0.07 },
    { freq: 294, duration: 0.22, type: "triangle", volume: 0.065, delay: 0.08 },
  ],
  waiTurn: [{ freq: 880, to: 1046, duration: 0.07, type: "sine", volume: 0.04 }],
  // Spin Wheel: a soft peg click as each slice passes the pointer, and a bright chime on the result.
  wheelTick: [{ noise: true, duration: 0.025, volume: 0.06, filter: "bandpass", freq: 3200, q: 2 }],
  wheelLand: [
    { freq: 784, duration: 0.12, type: "triangle", volume: 0.06 },
    { freq: 1175, duration: 0.3, type: "triangle", volume: 0.055, delay: 0.09 },
    { freq: 1568, duration: 0.4, type: "sine", volume: 0.03, delay: 0.16 },
  ],
  waiWrong: [
    { freq: 330, to: 247, duration: 0.18, type: "triangle", volume: 0.07 },
    { noise: true, duration: 0.08, volume: 0.04, filter: "lowpass", freq: 700, delay: 0.02 },
  ],

  /*
   * Front Wars: one palette for the war table. Low drums (swept sines), muffled ground and paper (filtered noise),
   * soft brass (sawtooth through a lowpass) and wooden bells (triangles), all in D, through a shared bus that
   * compresses gently and adds a small room. Frequent sounds are short and quiet; big moments are rare.
   */
  fwSelect: [
    { noise: true, duration: 0.03, volume: 0.03, filter: "bandpass", freq: 2400 },
    { freq: 587, duration: 0.06, type: "triangle", volume: 0.022 },
  ],
  fwSpawn: [
    { freq: 440, duration: 0.12, type: "triangle", volume: 0.04 },
    { freq: 659, duration: 0.18, type: "triangle", volume: 0.03, delay: 0.05 },
  ],
  fwStart: [
    { freq: 73, duration: 0.7, type: "sine", volume: 0.09 },
    { freq: 147, duration: 0.95, type: "sawtooth", volume: 0.035, attack: 0.1, filter: 700 },
    { freq: 220, duration: 0.95, type: "sawtooth", volume: 0.03, attack: 0.1, filter: 800, delay: 0.15 },
    { freq: 294, duration: 1.1, type: "sawtooth", volume: 0.025, attack: 0.12, filter: 900, delay: 0.3 },
  ],
  fwExpand: [
    { noise: true, duration: 0.1, volume: 0.05, filter: "lowpass", freq: 760, to: 280 },
    { freq: 147, to: 110, duration: 0.11, type: "triangle", volume: 0.04 },
  ],
  fwAttack: [
    { freq: 98, to: 52, duration: 0.34, type: "sine", volume: 0.16 },
    { noise: true, duration: 0.16, volume: 0.09, filter: "lowpass", freq: 380 },
    { noise: true, duration: 0.05, volume: 0.035, filter: "bandpass", freq: 1900, delay: 0.005 },
    { freq: 147, duration: 0.24, type: "sawtooth", volume: 0.025, filter: 520, delay: 0.02 },
  ],
  fwReinforce: [
    { freq: 110, to: 62, duration: 0.2, type: "sine", volume: 0.1 },
    { noise: true, duration: 0.1, volume: 0.05, filter: "lowpass", freq: 420 },
    { freq: 110, to: 62, duration: 0.2, type: "sine", volume: 0.08, delay: 0.12 },
  ],
  fwRetreat: [
    { noise: true, duration: 0.36, volume: 0.05, filter: "bandpass", freq: 900, to: 300, q: 1.4 },
    { freq: 220, to: 147, duration: 0.32, type: "triangle", volume: 0.035 },
  ],
  fwBuild: [
    { noise: true, duration: 0.04, volume: 0.05, filter: "bandpass", freq: 2600 },
    { freq: 330, duration: 0.08, type: "sine", volume: 0.05 },
    { noise: true, duration: 0.04, volume: 0.04, filter: "bandpass", freq: 2200, delay: 0.11 },
    { freq: 440, duration: 0.24, type: "triangle", volume: 0.035, delay: 0.11 },
    { freq: 659, duration: 0.32, type: "triangle", volume: 0.025, delay: 0.17 },
  ],
  fwBuildHeavy: [
    { noise: true, duration: 0.09, volume: 0.06, filter: "bandpass", freq: 1200, q: 2 },
    { freq: 82, duration: 0.38, type: "square", volume: 0.05, filter: 300 },
    { freq: 220, duration: 0.42, type: "triangle", volume: 0.03, delay: 0.08 },
    { freq: 330, duration: 0.5, type: "triangle", volume: 0.025, delay: 0.14 },
  ],
  fwLaunch: [
    { freq: 55, duration: 0.6, type: "sine", volume: 0.07 },
    { noise: true, duration: 1.15, volume: 0.08, filter: "bandpass", freq: 400, to: 2600, q: 0.9, attack: 0.25 },
    { freq: 70, to: 140, duration: 1.05, type: "sawtooth", volume: 0.05, filter: 380, attack: 0.2 },
  ],
  fwSiren: [
    { freq: 622, duration: 0.22, type: "triangle", volume: 0.04, attack: 0.03 },
    { freq: 523, duration: 0.22, type: "triangle", volume: 0.04, attack: 0.03, delay: 0.24 },
    { freq: 622, duration: 0.22, type: "triangle", volume: 0.04, attack: 0.03, delay: 0.48 },
    { freq: 523, duration: 0.32, type: "triangle", volume: 0.035, attack: 0.03, delay: 0.72 },
  ],
  fwIntercept: [
    { freq: 1400, to: 420, duration: 0.2, type: "triangle", volume: 0.04 },
    { noise: true, duration: 0.09, volume: 0.05, filter: "highpass", freq: 2500, delay: 0.17 },
    { freq: 880, duration: 0.24, type: "sine", volume: 0.03, delay: 0.18 },
  ],
  fwImpact: [
    { noise: true, duration: 1.4, volume: 0.2, filter: "lowpass", freq: 900, to: 120 },
    { freq: 62, to: 30, duration: 1.2, type: "sine", volume: 0.2 },
    { noise: true, duration: 1.8, volume: 0.08, filter: "lowpass", freq: 260, delay: 0.1, attack: 0.2 },
  ],
  fwImpactBig: [
    { noise: true, duration: 2.4, volume: 0.22, filter: "lowpass", freq: 1200, to: 90 },
    { freq: 50, to: 24, duration: 2, type: "sine", volume: 0.22 },
    { noise: true, duration: 2.6, volume: 0.1, filter: "lowpass", freq: 200, delay: 0.2, attack: 0.4 },
    { freq: 41, duration: 1.8, type: "sawtooth", volume: 0.05, filter: 160, delay: 0.05 },
  ],
  fwRumble: [
    { noise: true, duration: 1, volume: 0.07, filter: "lowpass", freq: 300, to: 100 },
    { freq: 48, to: 32, duration: 0.8, type: "sine", volume: 0.07 },
  ],
  fwSink: [
    { noise: true, duration: 0.45, volume: 0.07, filter: "lowpass", freq: 1100, to: 250 },
    { freq: 140, to: 60, duration: 0.35, type: "sine", volume: 0.05 },
  ],
  fwSeize: [
    { freq: 988, duration: 0.08, type: "triangle", volume: 0.035 },
    { freq: 1319, duration: 0.14, type: "triangle", volume: 0.03, delay: 0.06 },
    { noise: true, duration: 0.04, volume: 0.015, filter: "highpass", freq: 5000 },
  ],
  fwDefend: [
    { freq: 294, duration: 0.3, type: "triangle", volume: 0.04 },
    { freq: 440, duration: 0.4, type: "triangle", volume: 0.035, delay: 0.06 },
    { noise: true, duration: 0.06, volume: 0.02, filter: "bandpass", freq: 3000 },
  ],
  fwAlert: [
    { freq: 123, to: 98, duration: 0.25, type: "sine", volume: 0.1 },
    { freq: 233, duration: 0.3, type: "triangle", volume: 0.03, delay: 0.02 },
    { freq: 123, to: 98, duration: 0.25, type: "sine", volume: 0.08, delay: 0.16 },
  ],
  fwCapture: [
    { freq: 147, duration: 0.2, type: "sine", volume: 0.05 },
    { freq: 440, duration: 0.14, type: "triangle", volume: 0.04 },
    { freq: 587, duration: 0.2, type: "triangle", volume: 0.035, delay: 0.07 },
  ],
  fwLoss: [
    { freq: 330, to: 294, duration: 0.3, type: "triangle", volume: 0.04 },
    { freq: 247, duration: 0.42, type: "triangle", volume: 0.035, delay: 0.12 },
  ],
  fwError: [
    { noise: true, duration: 0.06, volume: 0.045, filter: "lowpass", freq: 500 },
    { freq: 165, duration: 0.08, type: "sine", volume: 0.04 },
  ],
  /** A Nation conquered: a timpani roll, then a held brass chord. Rare, so it can be grand. */
  fwConquest: [
    { noise: true, duration: 0.12, volume: 0.08, filter: "lowpass", freq: 300 },
    { noise: true, duration: 0.12, volume: 0.08, filter: "lowpass", freq: 300, delay: 0.09 },
    { noise: true, duration: 0.12, volume: 0.09, filter: "lowpass", freq: 320, delay: 0.18 },
    { freq: 98, to: 73, duration: 0.55, type: "sine", volume: 0.15, delay: 0.27 },
    { noise: true, duration: 0.3, volume: 0.08, filter: "lowpass", freq: 500, delay: 0.27 },
    { freq: 147, duration: 1.4, type: "sawtooth", volume: 0.03, filter: 900, attack: 0.12, delay: 0.3 },
    { freq: 220, duration: 1.4, type: "sawtooth", volume: 0.025, filter: 1000, attack: 0.12, delay: 0.36 },
    { freq: 294, duration: 1.5, type: "sawtooth", volume: 0.022, filter: 1200, attack: 0.12, delay: 0.42 },
    { freq: 587, duration: 1.2, type: "triangle", volume: 0.025, attack: 0.05, delay: 0.5 },
  ],
  /** A Bot (small tribe) conquered: one drum and a short fifth. */
  fwConquestSmall: [
    { freq: 110, to: 73, duration: 0.3, type: "sine", volume: 0.1 },
    { noise: true, duration: 0.18, volume: 0.06, filter: "lowpass", freq: 400 },
    { freq: 294, duration: 0.5, type: "triangle", volume: 0.03, delay: 0.1 },
    { freq: 440, duration: 0.6, type: "triangle", volume: 0.025, delay: 0.16 },
  ],
  fwVictory: [
    { freq: 73, duration: 0.8, type: "sine", volume: 0.12 },
    { noise: true, duration: 0.3, volume: 0.08, filter: "lowpass", freq: 450 },
    { freq: 147, duration: 2.2, type: "sawtooth", volume: 0.03, filter: 1000, attack: 0.1 },
    { freq: 220, duration: 2.1, type: "sawtooth", volume: 0.028, filter: 1100, attack: 0.1, delay: 0.18 },
    { freq: 294, duration: 2, type: "sawtooth", volume: 0.026, filter: 1300, attack: 0.1, delay: 0.36 },
    { freq: 370, duration: 1.9, type: "sawtooth", volume: 0.022, filter: 1400, attack: 0.1, delay: 0.54 },
    { freq: 587, duration: 1.6, type: "triangle", volume: 0.03, attack: 0.05, delay: 0.72 },
  ],
  fwDefeat: [
    { freq: 98, to: 49, duration: 1, type: "sine", volume: 0.12 },
    { freq: 147, duration: 1.6, type: "sawtooth", volume: 0.03, filter: 500, attack: 0.1, delay: 0.1 },
    { freq: 175, duration: 1.6, type: "sawtooth", volume: 0.025, filter: 500, attack: 0.1, delay: 0.3 },
    { freq: 110, duration: 2, type: "sawtooth", volume: 0.03, filter: 400, attack: 0.15, delay: 0.5 },
  ],
} satisfies Record<string, Part[]>;

export type SoundName = keyof typeof SOUNDS;

let context: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let warBus: AudioNode | null = null;

function audio(): AudioContext | null {
  if (!context) {
    const Ctor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      context = new Ctor();
    } catch {
      return null;
    }
  }
  if (context.state === "suspended") void context.resume().catch(() => {});
  return context;
}

function noise(ctx: AudioContext) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/**
 * Front Wars sounds go through their own bus: a gentle compressor (so a blast and a drum never stack into a harsh
 * peak), a lowpass that keeps the top end soft, and one quiet, damped echo for a sense of room. Built once per
 * audio context and released with it.
 */
function busFor(ctx: AudioContext, name: string): AudioNode {
  if (!name.startsWith("fw")) return ctx.destination;
  if (!warBus || warBus.context !== ctx) {
    const input = ctx.createGain();
    input.gain.value = 0.9;
    const warm = ctx.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = 7000;
    const squeeze = ctx.createDynamicsCompressor();
    squeeze.threshold.value = -20;
    squeeze.knee.value = 12;
    squeeze.ratio.value = 3;
    squeeze.attack.value = 0.005;
    squeeze.release.value = 0.2;
    input.connect(warm).connect(squeeze).connect(ctx.destination);
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.09;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 1800;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    input.connect(delay);
    delay.connect(damp);
    damp.connect(feedback).connect(delay);
    damp.connect(wet).connect(squeeze);
    warBus = input;
  }
  return warBus;
}

/** Play a named effect; `pitch` raises or lowers every tone (1 = unchanged). */
export function playSound(name: SoundName, pitch = 1) {
  const level = sfxLevel();
  if (level <= 0) return;
  const ctx = audio();
  if (!ctx || ctx.state === "closed") return;
  const start = ctx.currentTime + 0.005;
  const out = busFor(ctx, name);
  for (const part of SOUNDS[name] as Part[]) {
    const at = start + (part.delay ?? 0);
    const gain = ctx.createGain();
    const volume = (part.volume ?? 0.08) * level;
    const attack = Math.min(part.duration * 0.6, part.attack ?? 0.01);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + part.duration);
    gain.connect(out);
    let source: AudioScheduledSourceNode;
    if ("noise" in part) {
      const buffer = ctx.createBufferSource();
      buffer.buffer = noise(ctx);
      // Long sounds loop the noise rather than run past its end.
      buffer.loop = part.duration > 0.55;
      const filter = ctx.createBiquadFilter();
      filter.type = part.filter ?? "lowpass";
      filter.frequency.setValueAtTime(part.freq ?? 1000, at);
      if (part.to) filter.frequency.exponentialRampToValueAtTime(part.to, at + part.duration);
      if (part.q) filter.Q.value = part.q;
      buffer.connect(filter).connect(gain);
      source = buffer;
    } else {
      const osc = ctx.createOscillator();
      osc.type = part.type ?? "sine";
      osc.frequency.setValueAtTime(part.freq * pitch, at);
      if (part.to) osc.frequency.exponentialRampToValueAtTime(part.to * pitch, at + part.duration);
      if (part.filter) {
        const warm = ctx.createBiquadFilter();
        warm.type = "lowpass";
        warm.frequency.value = part.filter;
        osc.connect(warm).connect(gain);
      } else osc.connect(gain);
      source = osc;
    }
    source.start(at);
    source.stop(at + part.duration + 0.02);
    // Let each voice go as soon as it's done, so long matches don't pile up audio nodes.
    source.onended = () => gain.disconnect();
  }
}

/** Release the audio device when leaving a game. */
export function closeAudio() {
  const ctx = context;
  context = null;
  warBus = null;
  if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
}
