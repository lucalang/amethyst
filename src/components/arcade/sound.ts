"use client";

/**
 * Small synthesized sound effects (Web Audio oscillators and filtered noise), so every
 * sound is original and nothing is downloaded. The audio context is only created when a
 * sound is first played, which always follows a player action.
 */

type Tone = { freq: number; to?: number; duration: number; type?: OscillatorType; volume?: number; delay?: number };
type Noise = { noise: true; duration: number; volume?: number; filter?: BiquadFilterType; freq?: number; delay?: number };
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
} satisfies Record<string, Part[]>;

export type SoundName = keyof typeof SOUNDS;

let context: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

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

/** Play a named effect; `pitch` raises or lowers every tone (1 = unchanged). */
export function playSound(name: SoundName, pitch = 1) {
  const ctx = audio();
  if (!ctx || ctx.state === "closed") return;
  const start = ctx.currentTime + 0.005;
  for (const part of SOUNDS[name] as Part[]) {
    const at = start + (part.delay ?? 0);
    const gain = ctx.createGain();
    const volume = part.volume ?? 0.08;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + part.duration);
    gain.connect(ctx.destination);
    if ("noise" in part) {
      const source = ctx.createBufferSource();
      source.buffer = noise(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = part.filter ?? "lowpass";
      filter.frequency.value = part.freq ?? 1000;
      source.connect(filter).connect(gain);
      source.start(at);
      source.stop(at + part.duration + 0.02);
    } else {
      const osc = ctx.createOscillator();
      osc.type = part.type ?? "sine";
      osc.frequency.setValueAtTime(part.freq * pitch, at);
      if (part.to) osc.frequency.exponentialRampToValueAtTime(part.to * pitch, at + part.duration);
      osc.connect(gain);
      osc.start(at);
      osc.stop(at + part.duration + 0.02);
    }
  }
}

/** Release the audio device when leaving a game. */
export function closeAudio() {
  const ctx = context;
  context = null;
  if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
}
