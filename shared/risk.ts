/** Classic 42-territory board, counting land borders and printed sea routes.
 * Includes East Africa–Middle East. Traditional territory names are retained.
 * Board/rules: https://media.wizards.com/2015/rules/Risk_rules.pdf
 * These are reference degrees, not connections added to the hex board.
 */
export const RISK_NEIGHBORS = {
  Alaska: 3,
  "Northwest Territory": 4,
  Greenland: 4,
  Alberta: 4,
  Ontario: 6,
  Quebec: 3,
  "Western United States": 4,
  "Eastern United States": 4,
  "Central America": 3,
  Venezuela: 3,
  Peru: 3,
  Brazil: 4,
  Argentina: 2,
  Iceland: 3,
  Scandinavia: 4,
  "Great Britain": 4,
  "Northern Europe": 5,
  "Western Europe": 4,
  "Southern Europe": 6,
  Ukraine: 6,
  "North Africa": 6,
  Egypt: 4,
  "East Africa": 6,
  Congo: 3,
  "South Africa": 3,
  Madagascar: 2,
  Ural: 4,
  Siberia: 5,
  Yakutsk: 3,
  Kamchatka: 5,
  Irkutsk: 4,
  Mongolia: 5,
  Japan: 2,
  Afghanistan: 5,
  China: 6,
  India: 4,
  "Middle East": 6,
  Siam: 3,
  Indonesia: 3,
  "New Guinea": 3,
  "Western Australia": 3,
  "Eastern Australia": 2,
} as const;
export const RISK_HISTOGRAM = Array.from(
  { length: 7 },
  (_, degree) =>
    Object.values(RISK_NEIGHBORS).filter((n) => n === degree).length,
);
export const RISK_AVERAGE =
  Object.values(RISK_NEIGHBORS).reduce((sum, n) => sum + n, 0) / 42;
