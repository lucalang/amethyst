/**
 * Coin Slots sound: its own small synth with a quiet master level and a compressor, so layered
 * sounds never stack into anything loud. Created on the first sound after a user gesture. Wins get
 * longer, brighter fanfares and more coins the rarer the line.
 */
import { sfxLevel } from "@/lib/sfx-volume";

export type SlotSound =
  | "click"
  | "spin"
  | "tick"
  | "stop"
  | "match"
  | "tease"
  | "count"
  | "ding"
  | "sweep"
  | "lose"
  | "close"
  | "small"
  | "win"
  | "big"
  | "mega"
  | "jackpot";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function out() {
  if (!ctx) {
    ctx = new AudioContext();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.ratio.value = 8;
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(compressor).connect(ctx.destination);
  }
  master!.gain.value = 0.22 * sfxLevel();
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, master: master! };
}

/** A plucked note; `slide` glides the pitch to that frequency. */
function tone(freq: number, start: number, length: number, type: OscillatorType, level: number, slide?: number) {
  const { ctx, master } = out();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  const t = ctx.currentTime + start;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + length);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

/** A note that swells up and cuts off: the riser before the last reel lands. */
function swell(freq: number, to: number, start: number, length: number, type: OscillatorType, level: number) {
  const { ctx, master } = out();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  const t = ctx.currentTime + start;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + length);
  gain.gain.linearRampToValueAtTime(0, t + length + 0.05);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + length + 0.08);
}

/** Filtered noise for whooshes, rattles and cymbals. `rise` fades in instead of out. */
function noise(start: number, length: number, from: number, to: number, level: number, rise = false) {
  const { ctx, master } = out();
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * length)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    const k = i / data.length;
    data[i] = (Math.random() * 2 - 1) * (rise ? k : 1 - k);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  const t = ctx.currentTime + start;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + length);
  const gain = ctx.createGain();
  gain.gain.value = level;
  source.connect(filter).connect(gain).connect(master);
  source.start(t);
}

/** A coin hitting the tray: two bright, slightly inharmonic partials. */
function clink(start: number, level: number, pitch = 1) {
  tone(2637 * pitch, start, 0.14, "sine", level);
  tone(3990 * pitch, start, 0.09, "sine", level * 0.6);
}

/** Coins pouring out: `count` clinks spread over `length` seconds. */
function shower(start: number, count: number, length: number, level: number) {
  for (let i = 0; i < count; i += 1) clink(start + (i / count) * length + Math.random() * 0.03, level * (0.6 + Math.random() * 0.4), 0.85 + Math.random() * 0.35);
}

/** Bell sparkle: random high notes from the major pentatonic. */
const BELLS = [2093, 2349.3, 2637, 3136, 3520, 4186];
function sparkle(start: number, count: number, length: number, level: number) {
  for (let i = 0; i < count; i += 1) tone(BELLS[Math.floor(Math.random() * BELLS.length)], start + Math.random() * length, 0.35, "sine", level);
}

/** C major from C5 up. */
const NOTES = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093];
function arpeggio(start: number, count: number, step: number, length: number, level: number) {
  NOTES.slice(0, count).forEach((freq, i) => tone(freq, start + i * step, length, "triangle", level));
}
function chord(freqs: number[], start: number, length: number, level: number, type: OscillatorType = "triangle") {
  freqs.forEach((freq) => tone(freq, start, length, type, level));
}

/**
 * `value` is the reel index for "stop" (each reel lands a little higher), the length in seconds
 * for "tease", and the count-up progress (0–1) for "count".
 */
export function playSlotSound(name: SlotSound, value = 0) {
  switch (name) {
    case "click":
      tone(1400, 0, 0.03, "square", 0.04);
      tone(700, 0, 0.05, "triangle", 0.12);
      break;
    case "spin":
      // Lever clunk, then the reels whooshing up to speed.
      tone(160, 0, 0.14, "sine", 0.55, 70);
      noise(0, 0.06, 2500, 900, 0.3);
      noise(0.05, 0.4, 400, 2600, 0.35);
      tone(220, 0.04, 0.08, "square", 0.07);
      tone(330, 0.1, 0.1, "triangle", 0.1);
      break;
    case "tick":
      tone(1900, 0, 0.015, "square", 0.025);
      tone(520, 0, 0.025, "triangle", 0.06);
      break;
    case "stop": {
      const lift = 1 + value * 0.15;
      tone(110 * lift, 0, 0.18, "sine", 0.55, 80 * lift);
      tone(1800 * lift, 0, 0.03, "square", 0.04);
      noise(0, 0.05, 3000, 1500, 0.18);
      break;
    }
    case "tease": {
      const length = Math.max(0.4, value || 1.5);
      swell(196, 784, 0, length, "sawtooth", 0.06);
      swell(294, 1175, 0, length, "triangle", 0.1);
      noise(0, length, 300, 4000, 0.22, true);
      // A quickening heartbeat under the riser.
      for (let t = 0, gap = 0.36; t < length - 0.05; t += gap, gap = Math.max(0.12, gap * 0.82)) tone(70, t, 0.12, "sine", 0.4, 50);
      break;
    }
    case "count":
      clink(0, 0.05, 0.9 + value * 0.5);
      break;
    case "match": {
      // A reel landing on the same symbol as the ones before it: brighter for every match.
      const lift = 1 + value * 0.26;
      tone(880 * lift, 0, 0.28, "triangle", 0.17);
      tone(1760 * lift, 0.02, 0.22, "sine", 0.07);
      sparkle(0.04, 3, 0.15, 0.03);
      break;
    }
    case "ding":
      tone(2093, 0, 0.7, "sine", 0.18);
      tone(3136, 0.02, 0.55, "sine", 0.08);
      clink(0.05, 0.08);
      break;
    case "sweep":
      noise(0, 0.45, 600, 5200, 0.2, true);
      tone(523.25, 0, 0.45, "sine", 0.05, 1568);
      break;
    case "close":
      // Two reels matched and the third missed: a descending "so close".
      tone(392, 0, 0.18, "triangle", 0.15);
      tone(370, 0.17, 0.18, "triangle", 0.14);
      tone(349.23, 0.34, 0.55, "triangle", 0.14, 311);
      noise(0.34, 0.3, 900, 300, 0.08);
      break;
    case "lose":
      tone(330, 0, 0.2, "triangle", 0.14, 294);
      tone(262, 0.18, 0.4, "triangle", 0.13, 220);
      break;
    case "small":
      arpeggio(0, 2, 0.08, 0.22, 0.22);
      clink(0.18, 0.1);
      break;
    case "win":
      arpeggio(0, 4, 0.08, 0.28, 0.24);
      shower(0.3, 5, 0.4, 0.1);
      break;
    case "big":
      arpeggio(0, 6, 0.07, 0.35, 0.24);
      chord([523.25, 659.25, 783.99, 1046.5], 0.45, 0.8, 0.1);
      shower(0.4, 12, 0.9, 0.1);
      sparkle(0.5, 8, 0.8, 0.05);
      break;
    case "mega":
      noise(0, 0.35, 5000, 1800, 0.3);
      tone(82, 0, 0.5, "sine", 0.6, 45);
      arpeggio(0.05, 7, 0.06, 0.35, 0.22);
      chord([392, 493.88, 587.33, 783.99], 0.5, 0.3, 0.1);
      chord([523.25, 659.25, 783.99, 1046.5], 0.8, 1.1, 0.12);
      chord([261.63, 523.25], 0.8, 1.1, 0.04, "sawtooth");
      shower(0.5, 20, 1.4, 0.1);
      sparkle(0.8, 16, 1.2, 0.05);
      break;
    case "jackpot":
      // Drum roll into a I–IV–V–I fanfare, a long shimmer and a shower of coins.
      for (let i = 0; i < 10; i += 1) noise(i * 0.045, 0.05, 1400, 700, 0.1 + i * 0.025);
      noise(0.45, 0.6, 6000, 1800, 0.35);
      tone(70, 0.45, 0.7, "sine", 0.7, 38);
      chord([523.25, 659.25, 783.99], 0.45, 0.3, 0.14);
      chord([698.46, 880, 1046.5], 0.75, 0.3, 0.14);
      chord([783.99, 987.77, 1174.66], 1.05, 0.3, 0.14);
      chord([523.25, 659.25, 783.99, 1046.5, 1318.5], 1.35, 1.8, 0.11);
      chord([130.81, 261.63], 1.35, 1.8, 0.05, "sawtooth");
      NOTES.forEach((freq, i) => tone(freq * 2, 1.4 + i * 0.05, 0.4, "sine", 0.06));
      sparkle(1.5, 30, 2.2, 0.05);
      shower(0.6, 36, 2.8, 0.1);
      break;
  }
}

export function closeSlotAudio() {
  void ctx?.close();
  ctx = null;
  master = null;
}
