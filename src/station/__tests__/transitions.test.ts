import type { TuneOrigin } from '../commands';
import {
  portraitWatching,
  preemptedTerminal,
  sameChannelArrival,
  sameChannelArrivalRuled16,
  staticEnds,
  stopAccepted,
  watching,
  type ArrivalScene,
} from '../transitions';

const ORIGINS: TuneOrigin[] = ['register', 'swipe', 'board', 'remote', 'gate', 'link'];

function scene(over: Partial<ArrivalScene>): ArrivalScene {
  return { playbackActive: true, sameIndex: true, tuning: false, sourceReady: true, playerError: null, origin: 'link', ...over };
}

describe('sameChannelArrival — today (watch.tsx:495-502)', () => {
  it('is chrome-only whenever the set is on and the index is the tuned one, whatever the picture', () => {
    const states: Array<Partial<ArrivalScene>> = [
      { tuning: true, sourceReady: false, playerError: null },
      { tuning: true, sourceReady: false, playerError: 'THE SIGNAL WILL NOT JOIN' },
      { tuning: false, sourceReady: true, playerError: 'THE PICTURE IS HAVING DIFFICULTY' },
      { tuning: false, sourceReady: true, playerError: null },
    ];
    for (const s of states) {
      for (const origin of ORIGINS) {
        expect(sameChannelArrival(scene({ ...s, origin })).kind).toBe('chrome-only');
      }
    }
  });

  it('flashes unless the tune came from the register or the static is up', () => {
    expect(sameChannelArrival(scene({ origin: 'link' })).flash).toBe(true);
    expect(sameChannelArrival(scene({ origin: 'register' })).flash).toBe(false);
    expect(sameChannelArrival(scene({ origin: 'link', tuning: true, sourceReady: false })).flash).toBe(false);
    expect(sameChannelArrival(scene({ origin: 'link', playerError: 'x' })).flash).toBe(true);
  });

  it('takes the full branch when the set is off or the index differs', () => {
    expect(sameChannelArrival(scene({ playbackActive: false }))).toEqual({ kind: 'full-tune', flash: true });
    expect(sameChannelArrival(scene({ sameIndex: false }))).toEqual({ kind: 'full-tune', flash: true });
    expect(sameChannelArrival(scene({ sameIndex: false, origin: 'register' }))).toEqual({ kind: 'full-tune', flash: false });
  });
});

describe('sameChannelArrivalRuled16 — decision 16 / WS-20', () => {
  it('re-tunes a channel in error, under the static, or both', () => {
    expect(sameChannelArrivalRuled16(scene({ tuning: true, sourceReady: false })).kind).toBe('full-tune');
    expect(sameChannelArrivalRuled16(scene({ tuning: true, sourceReady: false, playerError: 'x' })).kind).toBe('full-tune');
    expect(sameChannelArrivalRuled16(scene({ playerError: 'x' })).kind).toBe('full-tune');
  });

  it('keeps the chrome-only arrival and its flash for a live, healthy picture', () => {
    expect(sameChannelArrivalRuled16(scene({}))).toEqual({ kind: 'chrome-only', flash: true });
    expect(sameChannelArrivalRuled16(scene({ origin: 'register' }))).toEqual({ kind: 'chrome-only', flash: false });
  });

  it('agrees with today on everything but the failing and static cases', () => {
    for (const origin of ORIGINS) {
      const live = scene({ origin });
      expect(sameChannelArrivalRuled16(live)).toEqual(sameChannelArrival(live));
      const off = scene({ origin, playbackActive: false });
      expect(sameChannelArrivalRuled16(off)).toEqual(sameChannelArrival(off));
    }
  });
});

describe('watching (watch.tsx:147; R19)', () => {
  it('is the picture with sound: the board does not end it, Home and sign-off do', () => {
    expect(watching({ playbackActive: true, homeVisible: false, signOff: false })).toBe(true);
    expect(watching({ playbackActive: true, homeVisible: true, signOff: false })).toBe(false);
    expect(watching({ playbackActive: true, homeVisible: false, signOff: true })).toBe(false);
    expect(watching({ playbackActive: false, homeVisible: false, signOff: false })).toBe(false);
  });

  it('is portrait only on the traveling set held upright', () => {
    expect(portraitWatching({ isPhone: true, landscape: false, watching: true })).toBe(true);
    expect(portraitWatching({ isPhone: true, landscape: true, watching: true })).toBe(false);
    expect(portraitWatching({ isPhone: false, landscape: false, watching: true })).toBe(false);
    expect(portraitWatching({ isPhone: true, landscape: false, watching: false })).toBe(false);
  });
});

describe('staticEnds (watch.tsx:686-691; R1)', () => {
  it('ends the static on the conjunction alone', () => {
    for (const tuning of [true, false]) {
      for (const sourceReady of [true, false]) {
        for (const revealDone of [true, false]) {
          expect(staticEnds({ tuning, sourceReady, revealDone })).toBe(tuning && sourceReady && revealDone);
        }
      }
    }
  });
});

describe('stopAccepted (watch.tsx:842)', () => {
  it('refuses a stop with nothing to stop, and a stop during the collapse', () => {
    expect(stopAccepted({ playbackActive: true, stopping: false })).toBe(true);
    expect(stopAccepted({ playbackActive: true, stopping: true })).toBe(false);
    expect(stopAccepted({ playbackActive: false, stopping: false })).toBe(false);
    expect(stopAccepted({ playbackActive: false, stopping: true })).toBe(false);
  });
});

describe('preemptedTerminal (invariant 12; WS-01, WS-22)', () => {
  it('settles a pre-empted stop to the expanded receiver', () => {
    expect(preemptedTerminal('stopping')).toEqual({ kind: 'stopping', base: 'home', entrance: 'expand', dialFromIndex: true, stopping: false });
  });

  it('settles a pre-empted reveal to done', () => {
    expect(preemptedTerminal('reveal')).toEqual({ kind: 'reveal', revealDone: true });
  });
});
