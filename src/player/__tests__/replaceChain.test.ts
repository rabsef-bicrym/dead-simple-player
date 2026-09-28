import { createSerialChain } from '../replaceChain';

/** A step shaped like the surface's: guarded by the current generation, then an awaited native call. */
function tuner() {
  let current = 0;
  const started: number[] = [];
  const skipped: number[] = [];
  const pending = new Map<number, () => void>();
  const chain = createSerialChain();
  const tune = (g: number) => {
    current = g;
    return chain.enqueue(async () => {
      if (current !== g) { skipped.push(g); return; }
      started.push(g);
      await new Promise<void>((resolve) => pending.set(g, resolve));
    });
  };
  const resolve = async (g: number) => {
    pending.get(g)?.();
    pending.delete(g);
    await new Promise((r) => setImmediate(r));
  };
  return { tune, resolve, started, skipped };
}

describe('the replace chain (NP-05: last-write-wins at dequeue)', () => {
  it('three tunes in a burst: the one in flight completes, the middle one is a no-op, the newest runs', async () => {
    const t = tuner();
    void t.tune(1);
    await new Promise((r) => setImmediate(r));
    expect(t.started).toEqual([1]);
    void t.tune(2);
    void t.tune(3);
    await new Promise((r) => setImmediate(r));
    expect(t.started).toEqual([1]);                 // one in flight; nothing else has touched the station
    await t.resolve(1);
    expect(t.skipped).toEqual([2]);
    expect(t.started).toEqual([1, 3]);              // one queued replace ran, for the newest generation
    await t.resolve(3);
  });

  it('a step that rejects does not poison the chain', async () => {
    const chain = createSerialChain();
    const order: string[] = [];
    const failed = chain.enqueue(async () => { order.push('a'); throw new Error('replaceAsync failed'); });
    await expect(failed).rejects.toThrow('replaceAsync failed');
    await chain.enqueue(async () => { order.push('b'); });
    expect(order).toEqual(['a', 'b']);
  });

  it('steps run strictly one at a time, in order', async () => {
    const chain = createSerialChain();
    let running = 0;
    let overlap = 0;
    const order: number[] = [];
    const steps = [1, 2, 3].map((n) => chain.enqueue(async () => {
      running += 1;
      if (running > 1) overlap += 1;
      order.push(n);
      await new Promise((r) => setTimeout(r, 1));
      running -= 1;
    }));
    await Promise.all(steps);
    expect(overlap).toBe(0);
    expect(order).toEqual([1, 2, 3]);
  });
});
