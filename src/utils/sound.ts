import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { STORAGE_KEYS } from '../constants/storage';

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

const loaded = new Map<SoundName, AudioPlayer>();
const audioModeReady = setAudioModeAsync({
  allowsRecording: false,
  interruptionMode: 'mixWithOthers',
  playsInSilentMode: true,
}).catch(() => {});

// The service panel's SOUND card — the set can be made silent.
let muted = false;
AsyncStorage.getItem(STORAGE_KEYS.SOUND_MUTED)
  .then((v) => { muted = v === '1'; })
  .catch(() => {});

export function setSoundMuted(next: boolean): void {
  muted = next;
  AsyncStorage.setItem(STORAGE_KEYS.SOUND_MUTED, next ? '1' : '0').catch(() => {});
}

export function isSoundMuted(): boolean {
  return muted;
}

async function get(name: SoundName): Promise<AudioPlayer> {
  const existing = loaded.get(name);
  if (existing) return existing;
  await audioModeReady;
  const player = createAudioPlayer(ASSETS[name], { keepAudioSessionActive: true });
  player.volume = VOLUMES[name];
  loaded.set(name, player);
  return player;
}

/** Fire and forget — a sound that fails to play fails silently. */
export function playSound(name: SoundName): void {
  if (muted) return;
  get(name)
    .then(async (player) => {
      player.volume = VOLUMES[name];
      await player.seekTo(0);
      player.play();
    })
    .catch(() => {});
}

function releasePlayers(): void {
  for (const player of loaded.values()) player.remove();
  loaded.clear();
}

// These are short-lived UI voices, not part of background television. Drop
// their native resources when the UI leaves the foreground; the lazy cache
// repopulates on the next detent or clatter without touching video playback.
AppState.addEventListener('change', (state) => {
  if (state !== 'active') releasePlayers();
});

// The sign-off tone — softly, 1 kHz, the way a station left the air.
let signoffTone: 'soft' | 'silent' = 'soft';
AsyncStorage.getItem(STORAGE_KEYS.SIGNOFF_TONE)
  .then((v) => { if (v === 'silent') signoffTone = 'silent'; })
  .catch(() => {});

export function setSignoffTone(next: 'soft' | 'silent'): void {
  signoffTone = next;
  AsyncStorage.setItem(STORAGE_KEYS.SIGNOFF_TONE, next).catch(() => {});
}

export function getSignoffTone(): 'soft' | 'silent' {
  return signoffTone;
}

/** A breath of 1 kHz sine, fading out — web only; silence elsewhere. */
export function playSignoffTone(): void {
  if (muted || signoffTone === 'silent') return;
  try {
    const Ctx = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.045, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.7);
    osc.onended = () => { ctx.close().catch(() => {}); };
  } catch {
    /* the night ends silently */
  }
}
