import type { Programme } from '../types';

/**
 * The evening for one channel: interstitials removed, back-to-back repeats
 * of the SAME AIRING conjoined into a single row spanning the run.
 *
 * Identity is title plus episode (sub-title or episode number). A short that
 * plays three times running is one engagement; eight distinct episodes of the
 * same series airing back-to-back are eight listings — the MST3K/Prisoner
 * case, where title-only conjoining swallowed whole evenings.
 */
export function airingKey(p: Programme): string {
  return `${p.title}::${p.subtitle ?? p.episodeNum ?? ''}`;
}

export function conjoinEvening(programmes: Programme[], channelId?: string): Programme[] {
  if (!channelId) return [];
  const scheduled = programmes
    .filter((p) => p.channelId === channelId && !/interstitial/i.test(p.title))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const progs: Programme[] = [];
  for (const p of scheduled) {
    const last = progs[progs.length - 1];
    if (last && airingKey(last) === airingKey(p) && p.start.getTime() - last.stop.getTime() < 15 * 60_000) {
      progs[progs.length - 1] = { ...last, stop: p.stop };
    } else {
      progs.push(p);
    }
  }
  return progs;
}

/**
 * What a board row calls a programme. The board is already per-channel, so
 * for series airings the episode name IS the programme; the series name is
 * the channel's own context.
 */
export function boardTitle(p: Programme): string {
  return p.subtitle ?? p.title;
}
