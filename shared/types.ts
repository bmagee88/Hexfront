export const RESOURCES = ["Lumber", "Iron", "Food", "Stone", "Cattle"] as const;
export const HAND_LIMIT = 3;
export type Resource = (typeof RESOURCES)[number];
export const COLORS = ["#e77e61", "#61b9c7", "#c4a5e4", "#e4bf64"] as const;
export type Deck = "basic" | "Infrastructure" | "Weapons Tech" | "Diplomacy";
export type Ability =
  | "Fortress"
  | "Lumber Mill"
  | "Granary"
  | "Workshop"
  | "Border Fort"
  | "Siege Engine"
  | "Ballista"
  | "Raiders"
  | "Cavalry"
  | "Blockade Unit"
  | "Treaty"
  | "Ceasefire"
  | "Envoy"
  | "Shield Pact"
  | "Market Charter";
export interface NumberedHex {
  id: string;
  value: number;
  resource: Resource;
  deck: Deck;
  ability?: Ability;
  owner: string | null;
}
export interface RebelPeg {
  owner: string;
}
export interface TerritoryBase {
  id: string;
  q: number;
  r: number;
  region: number;
  stack: string[];
  rebels: [RebelPeg | null, RebelPeg | null, RebelPeg | null];
  ceasefire?: string;
  patrol?: { owner: string; expires: number };
}
export type Stock = Record<Resource, number>;
export interface MapConfiguration {
  id: string;
  seed: string;
  board: TerritoryBase[];
}
export interface Player {
  id: string;
  name: string;
  color: string;
  tokenHash: string;
  hand: string[];
  stock: Stock;
  ready: boolean;
  bot: boolean;
  spectator: boolean;
  lastSeen: number;
  reserve: number;
  betrayals: number;
  eliminated: boolean;
  raids: string[];
  patrolRound: number;
  turns: number;
  claim?: number;
}
export interface Alliance {
  members: [string, string];
  transferred: number;
}
export interface RuleSettings {
  seed: string;
  reactionSeconds: number;
  alliances: boolean;
  eliminationVictory: boolean;
}
export interface PendingReaction {
  kind: "battle" | "suppression";
  attacker: string;
  defender: string | null;
  source: string;
  target: string;
  card: string;
  underground: boolean;
  attack: number;
  defense: number;
  guard?: string;
  guardBy?: string;
  guardDone: boolean;
  rebelBy?: string;
  rebelBonus: number;
  expires: number;
  faction?: string;
}
export interface Proposal {
  kind: "alliance" | "separation";
  from: string;
  to: string;
  treaty?: string;
  expires: number;
}
export interface ActionEvent {
  version: number;
  round: number;
  message: string;
  actor?: string;
}
export const TITLES = [
  "Longest Supply Line",
  "Strongest Army",
  "Master Builder",
  "Trade Dominance",
  "Diplomatic Influence",
] as const;
export type PrestigeTitle = (typeof TITLES)[number];
export interface Room {
  code: string;
  version: number;
  created: number;
  updated: number;
  host: string;
  phase: "lobby" | "draft" | "playing" | "finished";
  paused: boolean;
  settings: RuleSettings;
  rng: number;
  entropy: string;
  history: { actor: string; action: Action; at: number }[];
  players: Player[];
  board: TerritoryBase[];
  mapChoices?: MapConfiguration[];
  mapIndex?: number;
  mapGeneration?: number;
  mapAlgorithm?: number;
  tiles: Record<string, NumberedHex>;
  decks: Record<Deck, string[]>;
  discards: Record<Deck, string[]>;
  bag: Resource[];
  forecast: Resource[];
  round: number;
  turn: number;
  actions: number;
  draft: string[];
  draftIndex: number;
  pending?: PendingReaction;
  proposal?: Proposal;
  alliances: Alliance[];
  cooldowns: Record<string, number>;
  titles: Partial<Record<PrestigeTitle, string>>;
  metrics: Record<string, number[]>;
  log: ActionEvent[];
  processed: Record<string, number>;
  winner?: string;
}
export type PublicPlayer = Omit<Player, "tokenHash" | "hand" | "raids"> & {
  handCount: number;
  score: number;
  territories: number;
  online: boolean;
};
export interface RoomView extends Omit<
  Room,
  | "players"
  | "tiles"
  | "decks"
  | "discards"
  | "bag"
  | "rng"
  | "entropy"
  | "history"
  | "processed"
  | "created"
  | "updated"
  | "draft"
  | "pending"
> {
  players: PublicPlayer[];
  tiles: Record<string, NumberedHex>;
  deckCounts: Record<Deck, number>;
  hand: NumberedHex[];
  me: string | null;
  priority: string | null;
  legalDraft: string[];
  pending?: Omit<PendingReaction, "card" | "guard"> & {
    card: NumberedHex;
    guard?: NumberedHex;
  };
  draft: string[];
}
export type Action = {
  type: string;
  mapCount?: 1 | 6;
  mapIndex?: number;
  target?: string;
  source?: string;
  card?: string;
  player?: string;
  resource?: Resource;
  give?: Resource;
  amount?: number;
  bottom?: boolean;
  accept?: boolean;
  color?: string;
  name?: string;
  settings?: Partial<RuleSettings>;
  bot?: boolean;
  spectator?: boolean;
  seed?: string;
  order?: string[];
};
