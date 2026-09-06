// Mirrors worker/lib/position.ts's fractional-indexing math on the client so
// drag-and-drop can compute the position to send without a round trip. Kept
// as a tiny duplicate rather than a cross-import — src/ and worker/ are
// separate compilation targets (DOM vs no-DOM) and don't share modules.
const GAP = 1000;

export function nextPosition(maxExisting: number | null): number {
  return (maxExisting ?? 0) + GAP;
}

export function midpoint(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return GAP;
  if (prev === null) return (next as number) / 2;
  if (next === null) return prev + GAP;
  return (prev + next) / 2;
}
