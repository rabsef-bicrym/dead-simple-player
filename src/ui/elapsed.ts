/**
 * How far through a programme the clock is, from 0 at its start to 1 at its
 * end. Null when there is nothing on, or the guide's times make no span to
 * measure (a programme that ends before it begins is not drawn as progress).
 */
export function elapsedFraction(
  programme: { start: Date; stop: Date } | undefined,
  at: number,
): number | null {
  if (!programme) return null;
  const start = programme.start.getTime();
  const stop = programme.stop.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start) return null;
  return Math.max(0, Math.min(1, (at - start) / (stop - start)));
}
