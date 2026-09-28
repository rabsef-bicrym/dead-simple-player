import { useEffect, useRef } from 'react';
import { createPrewarmer, type PrewarmPort, type Prewarmer } from '../services/prewarm';

/**
 * The pre-warm's port on a real set: one HEAD of the channel's stream URL
 * (the master action accepts HEAD, contract §1) with the pre-warmer's own
 * abort signal, and the platform timers. `src/services/prewarm.ts` says when.
 */
const port: PrewarmPort = {
  touch: (url, signal) => fetch(url, { method: 'HEAD', signal }).then(() => undefined),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Keeps the channel under the resting cursor warm while `enabled`, and
 * nothing warm otherwise (decision 6(a)): the DS-6 dial, and on the phone
 * in landscape the channel Home opened on (a shifter move tunes before the
 * dwell) — never the board cursor, the portrait column, a signed-off set,
 * a screen that is not focused, or a set in the background. The returned
 * pre-warmer lets a tune stop it synchronously, before React's commit
 * would.
 */
export function usePrewarm(url: string | null, enabled: boolean): Prewarmer {
  const prewarmer = useRef<Prewarmer | null>(null);
  if (prewarmer.current === null) prewarmer.current = createPrewarmer(port);
  const instance = prewarmer.current;

  useEffect(() => {
    instance.rest(enabled ? url : null);
  }, [enabled, instance, url]);

  useEffect(() => () => instance.dispose(), [instance]);

  return instance;
}
