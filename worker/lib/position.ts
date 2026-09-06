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
