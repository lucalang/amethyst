/**
 * The shared sound-effects level. The SFX Volume setting (0–100%) is mirrored here by the
 * settings provider so every synth (games, interface, Coin Slots, Vault, cutscenes) reads one
 * value at play time. `SFX_BOOST` raises the overall loudness; compressors keep peaks in check.
 */
const SFX_BOOST = 1.7;

let volume = 1;

/** `percent` is the saved setting (0–100). */
export function setSfxVolume(percent: number) {
  volume = Math.min(1, Math.max(0, percent / 100));
}

/** Multiplier for a synth's output level; 0 means silent. */
export function sfxLevel() {
  return volume * SFX_BOOST;
}
