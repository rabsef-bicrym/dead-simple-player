import { getNowPlaying, getUpcoming } from '../parsers/xmltv';
import type { Channel, Programme } from '../types';

/** Group a guide once per refresh, preserving feed order for overlapping airings. */
export function indexProgrammes(programmes: readonly Programme[]): Map<string, Programme[]> {
  const byChannel = new Map<string, Programme[]>();
  for (const programme of programmes) {
    const channel = byChannel.get(programme.channelId);
    if (channel) channel.push(programme);
    else byChannel.set(programme.channelId, [programme]);
  }
  return byChannel;
}

/** The receiver's current airing and "Then comes" entry for each station. */
export function programmeMaps(
  channels: readonly Channel[],
  byChannel: ReadonlyMap<string, Programme[]>,
  now: Date,
) {
  const nowPlayingMap = new Map<string, Programme>();
  const upNextMap = new Map<string, Programme>();
  for (const channel of channels) {
    const programmes = byChannel.get(channel.id) ?? [];
    const current = getNowPlaying(programmes, channel.id, now);
    if (current) nowPlayingMap.set(channel.id, current);

    // Keep the existing six-airing window: interstitials count toward that
    // limit, even though they cannot supply the "Then comes" label.
    const next = getUpcoming(programmes, channel.id, 6, now).find(
      (p) => p.start.getTime() > now.getTime() && !/interstitial/i.test(p.title),
    );
    if (next) upNextMap.set(channel.id, next);
  }
  return { nowPlayingMap, upNextMap };
}
