import { CARD_STAGGER, SUMMON, UNLOCK, type SummonKind } from "./timing";

/**
 * Vault sound: a small synth with a quiet master level and a compressor (like the Coin Slots one),
 * closed when the Vault unmounts. Answers play on user gestures; the summon and the ambience only
 * play once the page has had one (browsers block sound before that), so nothing starts late.
 */
export type VaultSound = "key" | "verify" | "grant" | "already" | "invalid" | "unavailable" | "locked" | "lost";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let lastKey = 0;
/** The summon plays through its own bus so skipping can fade it out. */
let sequence: GainNode | null = null;
let ambience: { gain: GainNode; sources: AudioScheduledSourceNode[] } | null = null;
let ambienceWanted = false;

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
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, master: master! };
}

/** True when sound can start right now without waiting for a gesture. */
function allowed() {
  if (ctx?.state === "running") return true;
  return typeof navigator !== "undefined" && navigator.userActivation?.hasBeenActive === true;
}

function tone(freq: number, start: number, length: number, type: OscillatorType, level: number, glideTo?: number, into?: AudioNode) {
  const { ctx, master } = out();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t = ctx.currentTime + start;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + length);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level, t + Math.min(0.02, length / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(into ?? master);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

/** Filtered noise sweeping from one frequency to another: hiss, rumble or a rising scan. */
function noise(start: number, length: number, from: number, to: number, level: number, type: BiquadFilterType = "bandpass", into?: AudioNode, attack = 0.3) {
  const { ctx, master } = out();
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const t = ctx.currentTime + start;
  filter.type = type;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + length);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level, t + length * attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  source.connect(filter).connect(gain).connect(into ?? master);
  source.start(t);
}

/** A heavy mechanical lock: a low thud, a clank and a short bright tick. */
function clank(start: number, weight: number, into?: AudioNode) {
  tone(70, start, 0.5, "sine", 0.75 * weight, 34, into);
  [523.25, 811, 1187].forEach((freq, i) => tone(freq, start + i * 0.012, 0.18, "triangle", 0.07 * weight, undefined, into));
  noise(start, 0.16, 3200, 1400, 0.2 * weight, "bandpass", into, 0.05);
}

export function playVaultSound(name: VaultSound) {
  switch (name) {
    case "key": {
      const now = performance.now();
      if (now - lastKey < 45) return;
      lastKey = now;
      tone(1900 + Math.random() * 300, 0, 0.03, "square", 0.025);
      break;
    }
    case "verify":
      noise(0, 0.9, 300, 3200, 0.22);
      tone(55, 0, 1.1, "sine", 0.35, 82);
      tone(880, 0.05, 0.08, "square", 0.03);
      tone(1320, 0.18, 0.08, "square", 0.025);
      break;
    case "grant": {
      // In step with the scene: rings lock, teeth retract, the doors part and the light breaks out.
      const at = (ms: number) => ms / 1000;
      clank(0, 0.7);
      [0, 0.05, 0.1, 0.15].forEach((offset) => tone(1400, at(UNLOCK.retract) + offset, 0.05, "square", 0.02));
      noise(at(UNLOCK.open), 0.7, 2600, 180, 0.32, "lowpass");
      tone(62, at(UNLOCK.open), 1, "sine", 0.6, 36);
      [440, 523.25, 659.25, 880].forEach((freq, i) => tone(freq, at(UNLOCK.burst) + i * 0.07, 1, "triangle", 0.14));
      [1760, 2093, 2637].forEach((freq, i) => tone(freq, at(UNLOCK.burst) + 0.35 + i * 0.12, 1.2, "sine", 0.045));
      break;
    }
    case "already":
      tone(659.25, 0, 0.5, "sine", 0.16);
      tone(880, 0.16, 0.7, "sine", 0.14);
      break;
    case "invalid":
      [0, 0.14].forEach((start) => tone(98, start, 0.12, "sawtooth", 0.12));
      noise(0, 0.25, 900, 300, 0.12);
      break;
    case "unavailable":
      tone(440, 0, 0.7, "sine", 0.16, 196);
      tone(220, 0.05, 0.7, "triangle", 0.08, 98);
      break;
    case "locked":
      tone(50, 0, 0.6, "sine", 0.7, 32);
      noise(0, 0.35, 600, 80, 0.3, "lowpass");
      break;
    case "lost":
      [0, 0.16].forEach((start, i) => tone(i ? 330 : 440, start, 0.12, "square", 0.05));
      break;
  }
  startAmbience();
}

/** One frame piece seating itself: a small thump and a tick. */
function seat(start: number, into: AudioNode) {
  tone(150, start, 0.09, "sine", 0.14, 95, into);
  tone(2300, start, 0.025, "square", 0.018, undefined, into);
}

/**
 * The summon, in step with the scene: a drone and air while the vault rises, a whoosh as the console
 * arrives, one seat per frame piece, then the lock-in. Silent before any gesture.
 */
export function playVaultSummon(kind: SummonKind) {
  if (!allowed()) return;
  hushVault();
  const { ctx, master } = out();
  const bus = ctx.createGain();
  bus.connect(master);
  sequence = bus;
  const s = (ms: number) => ms / 1000;
  const t = SUMMON[kind];
  if (kind === "full") {
    tone(36, 0, s(t.lock) + 0.3, "sine", 0.45, 52, bus);
    noise(0.2, s(t.lock) - 0.2, 120, 420, 0.22, "lowpass", bus, 0.7);
    noise(s(t.rise), s(t.lock - t.rise), 300, 2600, 0.12, "bandpass", bus, 0.85);
    noise(s(t.console), 0.7, 500, 1800, 0.09, "bandpass", bus, 0.6);
    for (let i = 0; i < 5; i++) seat(s(t.assemble + 300 + i * 95), bus);
    tone(1318.5, s(t.panel) - 0.05, 0.6, "sine", 0.03, 1760, bus);
  } else {
    noise(0, s(t.lock), 400, 2200, 0.1, "bandpass", bus, 0.8);
    for (let i = 0; i < 3; i++) seat(s(t.assemble + 120 + i * 80), bus);
  }
  clank(s(t.lock), kind === "full" ? 1 : 0.6, bus);
}

/** One soft chime per reward as it leaves the vault, starting `at` seconds from now. */
export function playVaultReveal(count: number, at = 0) {
  if (!allowed()) return;
  for (let i = 0; i < Math.min(count, 8); i++) tone(1568 + i * 196, at + (i * CARD_STAGGER) / 1000, 0.5, "sine", 0.05);
}

export type SanctumSound =
  | "hover"
  | "select"
  | "confirm"
  | "flight"
  | "token"
  | "eject"
  | "implode"
  | "boom"
  | "error"
  | "draft"
  | "copy"
  | "tick";

let lastHover = 0;

/**
 * Crimson Sanctum (admin) cues, kept apart from the Vault's answers so publishing a code never sounds
 * like finding one. `delay` is in ms. Hover ticks are throttled so sweeping across cards stays quiet.
 */
export function playSanctumSound(name: SanctumSound, delay = 0) {
  if (!allowed()) return;
  const at = delay / 1000;
  switch (name) {
    case "hover": {
      const now = performance.now();
      if (now - lastHover < 70) return;
      lastHover = now;
      tone(2600 + Math.random() * 500, at, 0.025, "triangle", 0.012);
      break;
    }
    case "tick":
      tone(1750, at, 0.03, "square", 0.012);
      break;
    case "select":
      tone(660, at, 0.09, "triangle", 0.05, 990);
      tone(2200, at, 0.03, "square", 0.012);
      break;
    case "confirm":
      tone(523.25, at, 0.3, "sine", 0.08);
      tone(784, at + 0.07, 0.4, "sine", 0.07);
      break;
    case "flight":
      noise(at, 1.2, 180, 2400, 0.09, "bandpass", undefined, 0.55);
      tone(42, at, 1.2, "sine", 0.22, 70);
      break;
    case "token":
      noise(at, 0.4, 900, 4200, 0.05, "bandpass", undefined, 0.7);
      tone(988, at + 0.32, 0.35, "sine", 0.06);
      tone(1480, at + 0.36, 0.45, "sine", 0.03);
      break;
    case "eject":
      noise(at, 0.35, 3600, 500, 0.06, "bandpass", undefined, 0.15);
      tone(392, at, 0.25, "triangle", 0.05, 196);
      break;
    case "implode":
      noise(at, 0.7, 5200, 160, 0.16, "lowpass", undefined, 0.9);
      tone(220, at, 0.65, "sawtooth", 0.05, 40);
      break;
    case "boom":
      tone(48, at, 2.2, "sine", 0.9, 26);
      noise(at, 1.6, 2400, 90, 0.45, "lowpass", undefined, 0.03);
      clank(at, 1.1);
      [261.63, 392, 523.25, 783.99].forEach((freq, i) => tone(freq, at + 0.25 + i * 0.06, 1.8, "triangle", 0.1));
      [1567.98, 2093, 3135.96].forEach((freq, i) => tone(freq, at + 0.6 + i * 0.1, 1.4, "sine", 0.035));
      break;
    case "error":
      [0, 0.09, 0.18].forEach((offset) => tone(110 - offset * 80, at + offset, 0.08, "square", 0.06));
      noise(at, 0.3, 4000, 1200, 0.07, "highpass", undefined, 0.05);
      break;
    case "draft":
      tone(523.25, at, 0.18, "sine", 0.06);
      tone(392, at + 0.12, 0.3, "sine", 0.05);
      break;
    case "copy":
      tone(1318.5, at, 0.12, "sine", 0.06);
      tone(1975.5, at + 0.06, 0.2, "sine", 0.04);
      break;
  }
}

/**
 * The Sanctum's ignition, in step with the scene: a low drone as the sigil traces, a rising rush as the
 * ring spins up, a bright strike at the bloom flash and soft seats as the panels assemble. Silent before
 * any gesture; skipping fades it out.
 */
export function playSanctumIntro(timing: { trace: readonly [number, number]; spin: readonly [number, number]; flash: number; assemble: readonly [number, number] }, full: boolean) {
  if (!allowed()) return;
  hushVault();
  const { ctx, master } = out();
  const bus = ctx.createGain();
  bus.connect(master);
  sequence = bus;
  const s = (ms: number) => ms / 1000;
  if (full) tone(38, s(timing.trace[0]), s(timing.flash - timing.trace[0]) + 0.6, "sine", 0.4, 58, bus);
  noise(s(timing.trace[0]), s(timing.trace[1] - timing.trace[0]), 200, 900, full ? 0.08 : 0.05, "bandpass", bus, 0.8);
  noise(s(timing.spin[0]), s(timing.flash - timing.spin[0]) + 0.05, 300, 4800, full ? 0.14 : 0.08, "bandpass", bus, 0.92);
  tone(55, s(timing.flash), 1.4, "sine", full ? 0.55 : 0.3, 30, bus);
  noise(s(timing.flash), 0.9, 3000, 140, full ? 0.25 : 0.12, "lowpass", bus, 0.03);
  for (let i = 0; i < (full ? 5 : 3); i++) seat(s(timing.assemble[0] + i * ((timing.assemble[1] - timing.assemble[0]) / 6)), bus);
  tone(1318.5, s(timing.assemble[1]), 0.6, "sine", 0.03, undefined, bus);
}

/**
 * The publish charge: a rising drone whose pitch follows `set(level)` (0–1) while the button is held.
 * `stop(true)` lets it swell into the implosion, `stop(false)` sinks it (released early).
 */
export function startSanctumCharge() {
  if (!allowed()) return null;
  const { ctx, master } = out();
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 0.15);
  gain.connect(master);
  const oscillators = [55, 82.5, 110.6].map((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 1 ? "sawtooth" : "sine";
    osc.frequency.value = freq;
    const level = ctx.createGain();
    level.gain.value = i === 1 ? 0.18 : 0.5;
    osc.connect(level).connect(gain);
    osc.start();
    return { osc, base: freq };
  });
  let stopped = false;
  return {
    set(level: number) {
      if (stopped) return;
      const t = ctx.currentTime;
      for (const { osc, base } of oscillators) osc.frequency.setTargetAtTime(base * (1 + level * 2.2), t, 0.05);
      gain.gain.setTargetAtTime(0.12 + level * 0.18, t, 0.05);
    },
    stop(done: boolean) {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      if (!done) for (const { osc, base } of oscillators) osc.frequency.setTargetAtTime(base * 0.7, t, 0.12);
      gain.gain.setTargetAtTime(0, t, done ? 0.08 : 0.12);
      for (const { osc } of oscillators) osc.stop(t + 0.8);
    },
  };
}

/** Fades out the summon (on skip). */
export function hushVault() {
  if (!sequence || !ctx) return;
  const bus = sequence;
  sequence = null;
  bus.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  setTimeout(() => bus.disconnect(), 400);
}

/** A very quiet low bed under the chamber while it is on screen and sound is on. */
export function setVaultAmbience(on: boolean) {
  ambienceWanted = on;
  if (on) startAmbience();
  else if (ambience && ctx) {
    const { gain, sources } = ambience;
    ambience = null;
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    for (const source of sources) source.stop(ctx.currentTime + 1.2);
  }
}

function startAmbience() {
  if (!ambienceWanted || ambience || !allowed()) return;
  const { ctx, master } = out();
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 2.5);
  gain.connect(master);
  const sources: AudioScheduledSourceNode[] = [55, 55.35, 82.4].map((freq, i) => {
    const osc = ctx.createOscillator();
    const level = ctx.createGain();
    osc.frequency.value = freq;
    level.gain.value = i === 2 ? 0.25 : 0.5;
    osc.connect(level).connect(gain);
    osc.start();
    return osc;
  });
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const air = ctx.createBufferSource();
  air.buffer = buffer;
  air.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 220;
  const airLevel = ctx.createGain();
  airLevel.gain.value = 0.35;
  air.connect(filter).connect(airLevel).connect(gain);
  air.start();
  sources.push(air);
  ambience = { gain, sources };
}

export function closeVaultAudio() {
  ambience = null;
  ambienceWanted = false;
  sequence = null;
  void ctx?.close();
  ctx = null;
  master = null;
}
