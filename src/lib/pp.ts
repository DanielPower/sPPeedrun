/**
 * osu!-style weighted total pp: the nth-best play (1-indexed) is worth
 * pp * 0.95^(n-1). Sorts a copy so callers can pass any order.
 */
export function weightedTotal(pps: number[]): number {
  return [...pps].sort((a, b) => b - a).reduce((sum, pp, i) => sum + pp * 0.95 ** i, 0);
}
