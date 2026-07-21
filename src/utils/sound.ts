import { Audio } from 'expo-av';

/**
 * The DS-6's two voices, chosen at the sound bench:
 *
 * - detent: a real DIP switch, thrown once — the dial settling into a
 *   station (public domain, Wikimedia Commons).
 * - clatter: a real airport split-flap bulletin board mid-cascade —
 *   sudden head, long tail (public domain, Wikimedia Commons).
 *
 * The house ruling is SUBTLE: both play once per event, under the room,
 * never on the clock, never on a loop.
 */

const ASSETS = {
  detent: require('../../assets/sounds/detent.wav'),
  clatter: require('../../assets/sounds/clatter.wav'),
} as const;

const VOLUMES: Record<keyof typeof ASSETS, number> = {
  detent: 0.22,
  clatter: 0.22,
};

type SoundName = keyof typeof ASSETS;

const loaded = new Map<SoundName, Audio.Sound>();

async function get(name: SoundName): Promise<Audio.Sound> {
  const existing = loaded.get(name);
  if (existing) return existing;
  const { sound } = await Audio.Sound.createAsync(ASSETS[name], { volume: VOLUMES[name] });
  loaded.set(name, sound);
  return sound;
}

/** Fire and forget — a sound that fails to play fails silently. */
export function playSound(name: SoundName): void {
  get(name)
    .then((sound) => sound.replayAsync({ volume: VOLUMES[name] }))
    .catch(() => {});
}
