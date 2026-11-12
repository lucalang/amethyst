"use client";

import type { CutsceneRarity } from "@/lib/rarities";
import { sfxLevel } from "@/lib/sfx-volume";

/** Synthesized soundtrack for a pull cutscene, scheduled up front against the scene's build/burst timing. */
type Kit = {
  ctx: AudioContext;
  out: AudioNode;
  wet: AudioNode;
  at: (seconds: number) => number;
};
type ToneOptions = { to?: number; type?: OscillatorType; volume?: number; attack?: number; release?: number; detune?: number; reverb?: number; filter?: number; filterTo?: number };
type NoiseOptions = { volume?: number; filter?: BiquadFilterType; freq?: number; to?: number; q?: number; attack?: number; reverb?: number };

const NOTE = (semitones: number) => 440 * 2 ** (semitones / 12);

function noiseBuffer(ctx: AudioContext, seconds: number, decay = 0) {
  const buffer = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (decay ? (1 - i / data.length) ** decay : 1);
  }
  return buffer;
}

function envelope(kit: Kit, start: number, duration: number, volume: number, attack: number, release: number, reverb: number) {
  const gain = kit.ctx.createGain();
  const t = kit.at(start);
  const peak = Math.min(attack, duration * 0.5);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + Math.max(0.004, peak));
  gain.gain.setValueAtTime(volume, t + Math.max(peak, duration - release));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  gain.connect(kit.out);
  if (reverb > 0) {
    const send = kit.ctx.createGain();
    send.gain.value = reverb;
    gain.connect(send).connect(kit.wet);
  }
  return gain;
}

function tone(kit: Kit, freq: number, start: number, duration: number, o: ToneOptions = {}) {
  const gain = envelope(kit, start, duration, o.volume ?? 0.08, o.attack ?? 0.01, o.release ?? duration * 0.6, o.reverb ?? 0.3);
  const osc = kit.ctx.createOscillator();
  const t = kit.at(start);
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + duration);
  if (o.detune) osc.detune.value = o.detune;
  if (o.filter) {
    const filter = kit.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(o.filter, t);
    if (o.filterTo) filter.frequency.exponentialRampToValueAtTime(o.filterTo, t + duration);
    osc.connect(filter).connect(gain);
  } else osc.connect(gain);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

function noise(kit: Kit, start: number, duration: number, o: NoiseOptions = {}) {
  const gain = envelope(kit, start, duration, o.volume ?? 0.1, o.attack ?? 0.005, duration * 0.7, o.reverb ?? 0.3);
  const source = kit.ctx.createBufferSource();
  source.buffer = noiseBuffer(kit.ctx, duration + 0.1);
  const filter = kit.ctx.createBiquadFilter();
  const t = kit.at(start);
  filter.type = o.filter ?? "lowpass";
  filter.frequency.setValueAtTime(o.freq ?? 1000, t);
  if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t + duration);
  filter.Q.value = o.q ?? 1;
  source.connect(filter).connect(gain);
  source.start(t);
  source.stop(t + duration + 0.05);
}

const chord = (kit: Kit, notes: number[], start: number, duration: number, o: ToneOptions) =>
  notes.forEach((n, i) => {
    tone(kit, NOTE(n), start, duration, { ...o, detune: -6 });
    tone(kit, NOTE(n), start + i * 0.004, duration, { ...o, detune: 6 });
  });

/** A deep impact shared by every burst; `weight` scales body and length. */
function impact(kit: Kit, at: number, weight: number) {
  tone(kit, 90, at, 0.9 + weight * 0.6, { to: 28, volume: 0.35, release: 0.8 + weight * 0.5, reverb: 0.1 });
  noise(kit, at, 1.2 + weight, { freq: 900, to: 80, volume: 0.32, reverb: 0.6 });
  noise(kit, at, 0.25, { filter: "highpass", freq: 3000, volume: 0.12, reverb: 0.5 });
}

type Score = (kit: Kit, build: number, duration: number) => void;

const SCORES: Record<CutsceneRarity, Score> = {
  // Data chatter speeding up, three lock clicks, an eye-opening sweep and a glitched burst.
  secret: (kit, b, d) => {
    const scale = [0, 3, 5, 7, 10, 12, 15];
    for (let t = 0.05; t < b; t += 0.11 - 0.07 * (t / b)) tone(kit, NOTE(12 + scale[Math.floor(Math.random() * scale.length)]), t, 0.045, { type: "square", volume: 0.025, reverb: 0.15 });
    tone(kit, 55, 0, b, { type: "triangle", to: 110, volume: 0.07, attack: b * 0.8, release: 0.1, reverb: 0 });
    [0.63, 0.75, 0.87].forEach((p, i) => {
      noise(kit, b * p, 0.06, { filter: "highpass", freq: 4000, volume: 0.2, reverb: 0.2 });
      tone(kit, NOTE(-12 + i * 5), b * p, 0.12, { type: "square", volume: 0.07, filter: 1800 });
    });
    noise(kit, b * 0.84, b * 0.16, { filter: "bandpass", freq: 400, to: 5000, q: 4, volume: 0.15, attack: b * 0.15 });
    impact(kit, b, 0.6);
    for (let i = 0; i < 8; i++) tone(kit, 1600 - i * 170, b + i * 0.035, 0.05, { type: "square", volume: 0.05, reverb: 0.4 });
    chord(kit, [-9, -5, -2, 3], b + 0.25, d - b - 0.2, { type: "triangle", volume: 0.025, attack: 0.6, release: 1.4, reverb: 0.7 });
    [3, 7, 10, 15, 19].forEach((n, i) => tone(kit, NOTE(n), b + 0.5 + i * 0.16, 0.5, { type: "square", volume: 0.018, filter: 2400, reverb: 0.8 }));
  },
  // A humming beam, glassy pings rising with the prism, a crystal shatter and a shimmering major chord.
  prismatic: (kit, b, d) => {
    tone(kit, 220, 0, b, { to: 440, type: "sine", volume: 0.06, attack: 0.3, release: 0.1, reverb: 0.4 });
    noise(kit, b * 0.3, b * 0.7, { filter: "bandpass", freq: 600, to: 7000, q: 3, volume: 0.1, attack: b * 0.65 });
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    for (let t = b * 0.22, i = 0; t < b; t += 0.2 - 0.13 * (t / b), i++) tone(kit, NOTE(12 + steps[i % steps.length]), t, 0.5, { volume: 0.035, reverb: 0.8 });
    impact(kit, b, 0.7);
    for (let i = 0; i < 22; i++) tone(kit, 2000 + Math.random() * 5000, b + Math.random() * 0.4, 0.08 + Math.random() * 0.2, { type: "triangle", volume: 0.03, reverb: 0.9 });
    noise(kit, b, 0.6, { filter: "highpass", freq: 5000, volume: 0.12, reverb: 0.8 });
    chord(kit, [3, 7, 10, 14, 15], b + 0.15, d - b - 0.1, { volume: 0.022, attack: 0.5, release: 1.6, reverb: 0.9 });
    [15, 19, 22, 27, 31, 34].forEach((n, i) => tone(kit, NOTE(n), b + 0.4 + i * 0.12, 0.7, { type: "triangle", volume: 0.025, reverb: 0.9 }));
  },
  // A swelling choir pad, the beam whistling down, halo chimes, a brass burst and slow bells.
  exalted: (kit, b, d) => {
    chord(kit, [-21, -14, -9, -5], 0, b + 0.2, { type: "sawtooth", volume: 0.025, attack: b * 0.9, release: 0.2, filter: 300, filterTo: 2400, reverb: 0.6 });
    tone(kit, 2400, b * 0.08, b * 0.64, { to: 300, volume: 0.04, attack: 0.2, release: 0.1, reverb: 0.5 });
    [0.35, 0.5, 0.65].forEach((p, i) => {
      tone(kit, NOTE(19 + i * 4), b * p, 1.2, { volume: 0.04, release: 1.1, reverb: 0.9 });
      tone(kit, NOTE(19 + i * 4) * 2.76, b * p, 0.6, { volume: 0.012, release: 0.55, reverb: 0.9 });
    });
    noise(kit, b * 0.6, b * 0.4, { filter: "bandpass", freq: 300, to: 3000, q: 2, volume: 0.12, attack: b * 0.38 });
    impact(kit, b, 0.9);
    chord(kit, [-21, -9, -5, -2, 3], b, 1.6, { type: "sawtooth", volume: 0.035, attack: 0.03, release: 1.4, filter: 4000, filterTo: 600, reverb: 0.6 });
    chord(kit, [-9, -5, -2, 3], b + 0.3, d - b - 0.25, { type: "triangle", volume: 0.025, attack: 0.8, release: 1.8, reverb: 0.9 });
    [15, 22, 19, 27].forEach((n, i) => {
      tone(kit, NOTE(n), b + 0.6 + i * 0.45, 1.4, { volume: 0.035, release: 1.3, reverb: 0.9 });
      tone(kit, NOTE(n) * 2.76, b + 0.6 + i * 0.45, 0.7, { volume: 0.01, release: 0.65, reverb: 0.9 });
    });
  },
  // A black-hole drone, accelerating heartbeat, cracking crystal, a double shockwave and a dark-to-bright pad.
  amethyst: (kit, b, d) => {
    tone(kit, 41, 0, b + 0.3, { to: 33, type: "sawtooth", volume: 0.08, attack: 0.8, release: 0.3, filter: 160, filterTo: 500, reverb: 0.2 });
    noise(kit, 0, b, { freq: 120, to: 2600, q: 6, volume: 0.12, attack: b * 0.95 });
    // Heartbeats land on the visual pulse peaks: sin(0.009 · t · (1 + 2t/build)) = 1.
    let last = -1;
    for (let ms = 0; ms < b * 1000; ms += 5) {
      const beat = Math.floor((0.009 * ms * (1 + (2 * ms) / (b * 1000)) - Math.PI / 2) / (Math.PI * 2));
      if (beat > last && beat >= 0) {
        last = beat;
        const t = ms / 1000;
        tone(kit, 70, t, 0.22, { to: 40, volume: 0.25 + 0.15 * (t / b), reverb: 0.15 });
        tone(kit, 60, t + 0.16, 0.18, { to: 38, volume: 0.15 + 0.1 * (t / b), reverb: 0.15 });
      }
    }
    for (let i = 0; i < 14; i++) noise(kit, b * (0.68 + (0.32 * i) / 14) + Math.random() * 0.03, 0.03, { filter: "highpass", freq: 2500 + Math.random() * 4000, volume: 0.08 + 0.1 * (i / 14), reverb: 0.4 });
    impact(kit, b, 1.2);
    impact(kit, b + 0.75, 0.5);
    for (let i = 0; i < 16; i++) tone(kit, 2500 + Math.random() * 4000, b + Math.random() * 0.5, 0.15, { type: "triangle", volume: 0.025, reverb: 0.9 });
    chord(kit, [-14, -10, -7, -2], b + 0.1, 1.6, { type: "sawtooth", volume: 0.025, attack: 0.1, release: 1.2, filter: 1800, filterTo: 400, reverb: 0.8 });
    chord(kit, [-14, -9, -5, -2, 3], b + 1.1, d - b - 1, { type: "triangle", volume: 0.03, attack: 1, release: 2, reverb: 0.9 });
    [10, 15, 19, 22, 27].forEach((n, i) => tone(kit, NOTE(n), b + 1.3 + i * 0.22, 1, { volume: 0.025, release: 0.9, reverb: 0.95 }));
  },
};

/** Plays the soundtrack for a rarity; returns a stop function that fades it out. */
export function playPullAudio(rarity: CutsceneRarity, build: number, duration: number): () => void {
  const Ctor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return () => {};
  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return () => {};
  }
  void ctx.resume().catch(() => {});
  const master = ctx.createGain();
  master.gain.value = 0.9 * sfxLevel();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.ratio.value = 8;
  master.connect(limiter).connect(ctx.destination);
  const reverb = ctx.createConvolver();
  reverb.buffer = noiseBuffer(ctx, 2.6, 3);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  wet.connect(reverb).connect(master);
  const origin = ctx.currentTime + 0.05;
  SCORES[rarity]({ ctx, out: master, wet, at: (seconds) => origin + Math.max(0, seconds) }, build / 1000, duration / 1000);

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.25);
    window.setTimeout(() => void ctx.close().catch(() => {}), 400);
  };
}
