import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storage';
import type { Channel } from '../types';

type ChannelIdentity = Pick<Channel, 'id'>;

interface ChannelStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
}

/**
 * Restore the remembered station, migrating the former array-index value once.
 */
export async function restoreLastChannelIndex(
  channels: ChannelIdentity[],
  storage: ChannelStorage = AsyncStorage,
): Promise<number> {
  if (channels.length === 0) return 0;

  const channelId = await storage.getItem(STORAGE_KEYS.LAST_CHANNEL_ID);
  if (channelId !== null) {
    const index = channels.findIndex((channel) => channel.id === channelId);
    return index >= 0 ? index : 0;
  }

  const legacyRaw = await storage.getItem(STORAGE_KEYS.LAST_CHANNEL_INDEX);
  const legacyIndex = legacyRaw === null ? 0 : Number.parseInt(legacyRaw, 10);
  const index = Number.isNaN(legacyIndex)
    ? 0
    : Math.min(Math.max(legacyIndex, 0), channels.length - 1);

  await storage.setItem(STORAGE_KEYS.LAST_CHANNEL_ID, channels[index].id);
  if (legacyRaw !== null) {
    await storage.removeItem(STORAGE_KEYS.LAST_CHANNEL_INDEX);
  }
  return index;
}
