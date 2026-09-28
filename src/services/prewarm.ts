/**
 * The pre-warm (SI-01, decision 6(a)): the channel the dial rests on has a
 * live session by the time the person commits, so the common tune is the
 * 6 ms warm case instead of a 0.8–5.3 s cold start.
 *
 * The station's contract (reviews/dsp-polish/03-ersatztv-hls-contract.md §1
 * Stage B, §2): a HEAD of `/iptv/channel/N.m3u8?mode=segmenter` starts (or
 * joins) the session and Touches it; the worker is registered and `Run`
 * fired before the request blocks on the first segment, so a client-side
 * abort cannot kill the session; only master GET/HEADs and segment fetches
 * Touch, and the session dies 60 s after the last one. Hence the shape:
 *
 *   - dwell `PREWARM_DWELL_MS` on a channel, then one HEAD of its `streamUrl`
 *     exactly as the M3U gives it;
 *   - re-touch every `PREWARM_RETOUCH_MS` while the same URL rests — measured
 *     from the touch's start, which is when the server Touches (the
 *     coordinator touches before it waits);
 *   - abort a touch still open after `PREWARM_ABORT_MS` (a cold master may
 *     block up to 30 s; the session is already running);
 *   - `rest(null)` — a tune, leaving Home, the board, the service panel, the
 *     background — stops everything; the server's own 60 s timer is the
 *     cooldown. One channel at a time: `work_ahead_limit=1` pins one QSV
 *     transcode while browsing, and this is the one.
 *
 * Nothing on the tune path awaits or reads this. Its timers schedule fetches
 * of a URL nobody is watching; none is near the first-frame path.
 */

export const PREWARM_DWELL_MS = 400;
export const PREWARM_RETOUCH_MS = 45_000;
export const PREWARM_ABORT_MS = 8_000;

export interface PrewarmPort {
  /** One HEAD of `url`; settles however the request does. `signal` aborts it. */
  touch(url: string, signal: AbortSignal): Promise<void>;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface Prewarmer {
  /** The URL the cursor rests on now, or null when nothing should be warm. Same URL: no-op. */
  rest(url: string | null): void;
  dispose(): void;
}

export function createPrewarmer(port: PrewarmPort): Prewarmer {
  let resting: string | null = null;
  let dwell: unknown = null;
  let retouch: unknown = null;
  let abortTimer: unknown = null;
  let inFlight: AbortController | null = null;

  const clear = (handle: unknown) => {
    if (handle != null) port.clearTimer(handle);
  };

  const settle = (controller: AbortController) => {
    if (inFlight !== controller) return;
    clear(abortTimer);
    abortTimer = null;
    inFlight = null;
  };

  const touch = (url: string) => {
    if (inFlight) inFlight.abort();
    const controller = new AbortController();
    inFlight = controller;
    abortTimer = port.setTimer(() => {
      abortTimer = null;
      if (inFlight === controller) {
        inFlight = null;
        controller.abort();
      }
    }, PREWARM_ABORT_MS);
    clear(retouch);
    retouch = port.setTimer(() => {
      retouch = null;
      if (resting === url) touch(url);
    }, PREWARM_RETOUCH_MS);
    const done = () => settle(controller);
    port.touch(url, controller.signal).then(done, done);
  };

  const stop = () => {
    clear(dwell);
    dwell = null;
    clear(retouch);
    retouch = null;
    clear(abortTimer);
    abortTimer = null;
    if (inFlight) {
      const controller = inFlight;
      inFlight = null;
      controller.abort();
    }
  };

  return {
    rest(url) {
      if (url === resting) return;
      stop();
      resting = url;
      if (url === null) return;
      dwell = port.setTimer(() => {
        dwell = null;
        if (resting === url) touch(url);
      }, PREWARM_DWELL_MS);
    },
    dispose() {
      stop();
      resting = null;
    },
  };
}
