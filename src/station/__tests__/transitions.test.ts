import type { TuneOrigin } from '../commands';
import {
  portraitWatching,
  preemptedTerminal,
  sameChannelArrival,
  sameChannelArrivalBead381,
  staticEnds,
  stopAccepted,
  watching,
  type ArrivalScene,
} from '../transitions';

const ORIGINS: TuneOrigin[] = ['register', 'swipe', 'board', 'remote', 'gate', 'link'];

function scene(over: Partial<ArrivalScene>): ArrivalScene {
  return { playbackActive: true, sameIndex: true, tuning: false, sourceReady: true, playerError: null, origin: 'link', ...over };
}

describe('sameChannelArrival — since WP-03 (watch.tsx tuneTo; ff-spec §6.2; decision 16)', () => {
  it('is chrome-only when the set is on, the index is the tuned one and the channel is not in error', () => {
    const healthy: Array<Partial<ArrivalScene>> = [
      { tuning: true, sourceReady: false, playerError: null },
      { tuning: false, sourceReady: true, playerError: null },
    ];
    for (const s of healthy) {
      for (const origin of ORIGINS) {
        expect(sameChannelArrival(scene({ ...s, origin })).kind).toBe('chrome-only');
      }
    }
  });

  it('re-tunes a channel in error, under the static or live (WS-20)', () => {
    expect(sameChannelArrival(scene({ tuning: true, sourceReady: false, playerError: 'THE SIGNAL WILL NOT JOIN' })).kind).toBe('full-tune');
    expect(sameChannelArrival(scene({ playerError: 'THE PICTURE IS HAVING DIFFICULTY' })).kind).toBe('full-tune');
  });

  it('never restarts a healthy tune in progress (a second cold master GET can throttle the session)', () => {
    expect(sameChannelArrival(scene({ tuning: true, sourceReady: false, playerError: null })).kind).toBe('chrome-only');
  });

  it('flashes unless the tune came from the register or the static is up', () => {
    expect(sameChannelArrival(scene({ origin: 'link' })).flash).toBe(true);
    expect(sameChannelArrival(scene({ origin: 'register' })).flash).toBe(false);
    expect(sameChannelArrival(scene({ origin: 'link', tuning: true, sourceReady: false })).flash).toBe(false);
  });

  it('takes the full branch when the set is off or the index differs; power never flashes (decision 4)', () => {
    expect(sameChannelArrival(scene({ playbackActive: false }))).toEqual({ kind: 'full-tune', flash: true });
    expect(sameChannelArrival(scene({ sameIndex: false }))).toEqual({ kind: 'full-tune', flash: true });
    expect(sameChannelArrival(scene({ sameIndex: false, origin: 'register' }))).toEqual({ kind: 'full-tune', flash: false });
    expect(sameChannelArrival(scene({ playbackActive: false, origin: 'power' }))).toEqual({ kind: 'full-tune', flash: false });
  });
});

describe('sameChannelArrivalBead381 — the rule before WP-03, the matrix\'s today: oracle', () => {
  it('was chrome-only whatever the picture', () => {
    for (const origin of ORIGINS) {
      expect(sameChannelArrivalBead381(scene({ origin, playerError: 'x' })).kind).toBe('chrome-only');
      expect(sameChannelArrivalBead381(scene({ origin, tuning: true, sourceReady: false, playerError: 'x' })).kind).toBe('chrome-only');
    }
  });

  it('agrees with the live rule on everything but the failing cases', () => {
    for (const origin of ORIGINS) {
      const live = scene({ origin });
      expect(sameChannelArrivalBead381(live)).toEqual(sameChannelArrival(live));
      const under = scene({ origin, tuning: true, sourceReady: false });
      expect(sameChannelArrivalBead381(under)).toEqual(sameChannelArrival(under));
      const off = scene({ origin, playbackActive: false });
      expect(sameChannelArrivalBead381(off)).toEqual(sameChannelArrival(off));
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
