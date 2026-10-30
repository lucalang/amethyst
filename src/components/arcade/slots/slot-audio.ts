/**
 * Coin Slots sound: its own small synth with a quiet master level and a compressor, so layered
 * sounds never stack into anything loud. Created on the first Spin press (a user gesture).
 */
export type SlotSound = "spin" | "stop" | "win" | "big" | "jackpot";

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
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, master: master! };
}

function tone(freq: number, start: number, length: number, type: OscillatorType, level: number) {
  const { ctx, master } = out();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ctx.currentTime + start;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

function whoosh() {
  const { ctx, master } = out();
  const length = 0.35;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(400, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + length);
  const gain = ctx.createGain();
  gain.gain.value = 0.35;
  source.connect(filter).connect(gain).connect(master);
  source.start();
}

const NOTES = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];

export function playSlotSound(name: SlotSound) {
  switch (name) {
    case "spin":
      whoosh();
      tone(220, 0, 0.08, "square", 0.08);
      break;
    case "stop":
      tone(110, 0, 0.16, "sine", 0.5);
      tone(1800, 0, 0.03, "square", 0.04);
      break;
    case "win":
      NOTES.slice(0, 3).forEach((freq, i) => tone(freq, i * 0.09, 0.25, "triangle", 0.25));
      break;
    case "big":
      NOTES.slice(0, 5).forEach((freq, i) => tone(freq, i * 0.08, 0.35, "triangle", 0.25));
      [2093, 2637].forEach((freq, i) => tone(freq, 0.45 + i * 0.12, 0.5, "sine", 0.08));
      break;
    case "jackpot":
      [0, 0.32, 0.64].forEach((start, chord) =>
        [0, 2, 4].forEach((step) => tone(NOTES[Math.min(NOTES.length - 1, step + (chord === 2 ? 1 : 0))] * (chord === 1 ? 1.122 : 1), start, 0.5, "triangle", 0.16)),
      );
      NOTES.forEach((freq, i) => tone(freq * 2, 1 + i * 0.06, 0.4, "sine", 0.06));
      break;
  }
}

export function closeSlotAudio() {
  void ctx?.close();
  ctx = null;
  master = null;
}
