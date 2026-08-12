export interface TuneTraceEvent {
  offsetMs: number;
  name: string;
  detail?: string;
}

export interface TuneTrace {
  channelName: string;
  startedAt: number;
  events: TuneTraceEvent[];
}

const MAX_TUNES = 5;
const tunes: TuneTrace[] = [];
let tuneStartTs = 0;

export function traceTuneStart(channelName: string): void {
  tuneStartTs = Date.now();
  tunes.unshift({
    channelName,
    startedAt: tuneStartTs,
    events: [{ offsetMs: 0, name: 'TUNE START', detail: channelName }],
  });
  if (tunes.length > MAX_TUNES) tunes.length = MAX_TUNES;
}

export function traceEvent(name: string, detail?: string): void {
  const currentTune = tunes[0];
  if (!currentTune || tuneStartTs === 0) return;
  currentTune.events.push({
    offsetMs: Math.max(0, Date.now() - tuneStartTs),
    name,
    detail,
  });
}

/** A detached snapshot for the service panel; tracing never drives renders. */
export function getTuneTraceSnapshot(): TuneTrace[] {
  return tunes.map((tune) => ({
    ...tune,
    events: tune.events.map((event) => ({ ...event })),
  }));
}
