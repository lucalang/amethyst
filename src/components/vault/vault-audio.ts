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

export type AdminSound = "step" | "publish" | "draft" | "error";

/**
 * Admin panel cues, kept apart from the Vault's answers so publishing a code never sounds like
 * finding one: publish is a short system notice, a crisp click and a bright rising dyad.
 */
export function playAdminSound(name: AdminSound) {
  switch (name) {
    case "step":
      tone(1200, 0, 0.04, "triangle", 0.03);
      break;
    case "publish":
      tone(2400, 0, 0.025, "square", 0.025);
      noise(0, 0.35, 1800, 5200, 0.06, "bandpass", undefined, 0.8);
      tone(880, 0.3, 0.5, "sine", 0.12);
      tone(1318.5, 0.42, 0.9, "sine", 0.1);
      tone(2637, 0.42, 0.6, "sine", 0.025);
      break;
    case "draft":
      tone(523.25, 0, 0.18, "sine", 0.08);
      tone(392, 0.12, 0.3, "sine", 0.07);
      break;
    case "error":
      tone(130, 0, 0.18, "square", 0.05, 110);
      break;
  }
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
