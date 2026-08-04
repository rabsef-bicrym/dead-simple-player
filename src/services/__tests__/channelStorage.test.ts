import { STORAGE_KEYS } from '../../constants/storage';
import { restoreLastChannelIndex } from '../channelStorage';

describe('restoreLastChannelIndex', () => {
  it('migrates the legacy array index to a stable channel id', async () => {
    const values = new Map<string, string>([
      [STORAGE_KEYS.LAST_CHANNEL_INDEX, '1'],
    ]);
    const storage = {
      getItem: jest.fn(async (key: string) => values.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        values.delete(key);
      }),
    };

    const index = await restoreLastChannelIndex(
      [{ id: 'channel-a' }, { id: 'channel-b' }],
      storage,
    );

    expect(index).toBe(1);
    expect(storage.getItem).toHaveBeenNthCalledWith(1, STORAGE_KEYS.LAST_CHANNEL_ID);
    expect(storage.getItem).toHaveBeenNthCalledWith(2, STORAGE_KEYS.LAST_CHANNEL_INDEX);
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.LAST_CHANNEL_ID, 'channel-b');
    expect(storage.removeItem).toHaveBeenCalledWith(STORAGE_KEYS.LAST_CHANNEL_INDEX);
  });
});
