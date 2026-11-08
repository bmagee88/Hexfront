import type { TerritoryBase } from "./types";
export const adjacent = (a: TerritoryBase, b: TerritoryBase) =>
  Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs(a.q + a.r - b.q - b.r),
  ) === 1;
