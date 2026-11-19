import { sfxLevel } from "@/lib/sfx-volume";

/**
 * The Time Machine's own sound palette, synthesised on the spot (no recorded or borrowed audio). Everything is tuned
 * to one key (D major pentatonic), runs through a gentle low-pass, a soft compressor and a generated hall reverb,
 * so the pieces belong together and nothing is harsh:
 *
 * - bed:    a low, slow-breathing drone while a rewind plays (very quiet; silent when paused or muted)
 * - travel: an airy whoosh whose filter and pitch fall as the clock rolls back, landing on a soft bell
 * - reveal: a muted pluck for each memory that rises out of the tunnel, climbing the scale
 * - fact:   a warm open-fifth swell under a statistic
 * - title / home: the opening swell, and the rising return to the present that resolves on a major chord
 *
 * The AudioContext is only created from a user gesture (choosing a rewind), the level follows the SFX Volume
 * setting, and `dispose` closes the context.
 */
export type RewindAudio = {
  /** Call from a user gesture: wakes the context (browsers block audio until then). */
  resume(): void;
  setMuted(muted: boolean): void;
  /** Paused: the bed fades out and new sounds are silent. */
  setPaused(paused: boolean): void;
  /** Whether the quiet bed plays (off when the story isn't running on its own, e.g. with reduced motion). */
  setBed(on: boolean): void;
  title(): void;
  /** A roll back in time over `seconds`, landing on chapter `chapter`. */
  travel(seconds: number, chapter: number): void;
  /** A chapter that keeps the same date. */
  arrive(chapter: number): void;
  reveal(index: number, delay: number): void;
  fact(delay: number): void;
  home(seconds: number): void;
  dispose(): void;
};

/** D major pentatonic across a few octaves (Hz). */
const SCALE = [146.83, 164.81, 185.0, 220.0, 246.94, 293.66, 329.63, 369.99, 440.0, 493.88, 587.33];

export function createRewindAudio(): RewindAudio | null {
  const Ctor = typeof window === "undefined" ? undefined : (window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return null;
  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }

  let muted = false;
  let paused = false;
  let bedOn = false;
  const level = () => Math.min(1, sfxLevel()) * 0.7;

  // Master chain: everything → tone (low-pass) → glue compressor → master → out.
  const master = ctx.createGain();
  master.gain.value = level();
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -20;
  glue.knee.value = 18;
  glue.ratio.value = 3;
  glue.attack.value = 0.01;
  glue.release.value = 0.3;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 6500;
  tone.Q.value = 0.3;
  tone.connect(glue).connect(master).connect(ctx.destination);
  const dry = ctx.createGain();
  dry.connect(tone);

  // A generated hall: two decorrelated noise tails that darken as they decay.
  const reverb = ctx.createConvolver();
  const length = Math.floor(ctx.sampleRate * 2.6);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      smooth += (Math.random() * 2 - 1 - smooth) * (0.6 - t * 0.5);
      data[i] = smooth * (1 - t) ** 2.4;
    }
  }
  reverb.buffer = impulse;
  const wet = ctx.createGain();
  wet.gain.value = 0.42;
  reverb.connect(wet).connect(tone);

  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const noiseData = noise.getChannelData(0);
  for (let i = 0; i < noiseData.length; i += 1) noiseData[i] = Math.random() * 2 - 1;

  // The bed: two detuned low sines through a dark filter, breathing slowly.
  const bed = ctx.createGain();
  bed.gain.value = 0;
  const bedFilter = ctx.createBiquadFilter();
  bedFilter.type = "lowpass";
  bedFilter.frequency.value = 380;
  bedFilter.connect(bed).connect(dry);
  bed.connect(reverb);
  const bedVoices = [73.42, 110.0, 146.83 * 1.003].map((frequency) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency;
    osc.connect(bedFilter);
    osc.start();
    return osc;
  });
  const breath = ctx.createOscillator();
  breath.frequency.value = 0.07;
  const breathDepth = ctx.createGain();
  breathDepth.gain.value = 140;
  breath.connect(breathDepth).connect(bedFilter.frequency);
  breath.start();

  const live = () => !muted && !paused && ctx.state !== "closed";
  const syncLevels = () => {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(muted ? 0 : level(), now, 0.08);
    bed.gain.cancelScheduledValues(now);
    bed.gain.setTargetAtTime(live() && bedOn ? 0.05 : 0, now, live() && bedOn ? 0.9 : 0.15);
  };

  /** One enveloped voice: attack, then an exponential fall to silence. */
  function voice(frequency: number, at: number, { type = "sine" as OscillatorType, attack = 0.01, decay = 1.2, gain = 0.1, send = 0.5, cutoff = 4000 } = {}) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    osc.connect(filter).connect(env);
    env.connect(dry);
    if (send > 0) {
      const sendGain = ctx.createGain();
      sendGain.gain.value = send;
      env.connect(sendGain).connect(reverb);
    }
    osc.start(at);
    osc.stop(at + attack + decay + 0.05);
    return osc;
  }

  /** A soft bell: a fundamental with one quiet inharmonic partial. */
  function bell(frequency: number, at: number, gain = 0.07) {
    voice(frequency, at, { attack: 0.006, decay: 2.2, gain, send: 0.7, cutoff: 3200 });
    voice(frequency * 2.756, at, { attack: 0.004, decay: 0.9, gain: gain * 0.18, send: 0.8, cutoff: 3600 });
  }

  /** Filtered air moving past: the band sweeps from `from` to `to` Hz. */
  function whoosh(at: number, seconds: number, from: number, to: number, gain = 0.09) {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.1;
    band.frequency.setValueAtTime(from, at);
    band.frequency.exponentialRampToValueAtTime(to, at + seconds);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + seconds * 0.45);
    env.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    source.connect(band).connect(env);
    env.connect(dry);
    const send = ctx.createGain();
    send.gain.value = 0.6;
    env.connect(send).connect(reverb);
    source.start(at);
    source.stop(at + seconds + 0.05);
  }

  /** A slow pitch glide underneath a whoosh. */
  function glide(at: number, seconds: number, from: number, to: number, gain = 0.035) {
    const osc = voice(from, at, { attack: seconds * 0.4, decay: seconds * 0.7, gain, send: 0.6, cutoff: 1400 });
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + seconds);
  }

  const note = (step: number) => SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length];

  return {
    resume() {
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      syncLevels();
    },
    setMuted(value) {
      muted = value;
      syncLevels();
    },
    setPaused(value) {
      paused = value;
      syncLevels();
    },
    setBed(value) {
      bedOn = value;
      syncLevels();
    },
    title() {
      if (!live()) return;
      const t = ctx.currentTime + 0.05;
      for (const [frequency, gain] of [[73.42, 0.06], [146.83, 0.05], [220.0, 0.04], [369.99, 0.022]] as const) voice(frequency, t, { attack: 1.1, decay: 3.2, gain, send: 0.7, cutoff: 1800 });
      voice(1174.66, t + 0.6, { attack: 1.4, decay: 2.4, gain: 0.008, send: 1, cutoff: 5000 });
    },
    travel(seconds, chapter) {
      if (!live()) return;
      const t = ctx.currentTime + 0.02;
      whoosh(t, seconds, 2400, 260);
      glide(t, seconds, 440, 196);
      // Each chapter lands a step lower: the music walks backwards with the story.
      bell(note(8 - chapter), t + seconds * 0.82);
    },
    arrive(chapter) {
      if (!live()) return;
      bell(note(8 - chapter), ctx.currentTime + 0.05, 0.05);
    },
    reveal(index, delay) {
      if (!live()) return;
      const t = ctx.currentTime + delay;
      voice(note(3 + index * 2), t, { type: "triangle", attack: 0.005, decay: 0.55, gain: 0.05, send: 0.45, cutoff: 1600 });
      voice(note(3 + index * 2) * 2, t, { attack: 0.004, decay: 0.3, gain: 0.012, send: 0.5, cutoff: 2600 });
    },
    fact(delay) {
      if (!live()) return;
      const t = ctx.currentTime + delay;
      for (const [frequency, gain] of [[146.83, 0.05], [220.0, 0.04], [293.66, 0.03]] as const) voice(frequency, t, { attack: 0.18, decay: 1.8, gain, send: 0.6, cutoff: 2200 });
    },
    home(seconds) {
      if (!live()) return;
      const t = ctx.currentTime + 0.02;
      whoosh(t, seconds, 260, 2200, 0.08);
      glide(t, seconds, 196, 440, 0.03);
      const land = t + seconds * 0.85;
      [293.66, 369.99, 440.0, 587.33].forEach((frequency, i) => bell(frequency, land + i * 0.07, 0.045));
      voice(146.83, land, { attack: 0.4, decay: 3, gain: 0.05, send: 0.7, cutoff: 1200 });
    },
    dispose() {
      for (const osc of [...bedVoices, breath]) {
        try {
          osc.stop();
        } catch {
          // Already stopped.
        }
      }
      if (ctx.state !== "closed") void ctx.close().catch(() => {});
    },
  };
}
