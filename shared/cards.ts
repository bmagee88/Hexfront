import { Ability, Deck, Resource } from "./types";
export const PRICES: Record<
  Exclude<Deck, "basic">,
  Partial<Record<Resource, number>>
> = {
  Infrastructure: { Lumber: 2, Stone: 1, Food: 1 },
  "Weapons Tech": { Iron: 2, Cattle: 1, Lumber: 1 },
  Diplomacy: { Food: 1, Cattle: 1, Stone: 1 },
};
export const ABILITIES: Record<
  Ability,
  { deck: Exclude<Deck, "basic">; trigger: string; text: string }
> = {
  Fortress: {
    deck: "Infrastructure",
    trigger: "Exposed",
    text: "+2 defense in this territory.",
  },
  "Lumber Mill": {
    deck: "Infrastructure",
    trigger: "Exposed",
    text: "One extra Lumber on Lumber waves; production cap applies.",
  },
  Granary: {
    deck: "Infrastructure",
    trigger: "Exposed",
    text: "Owner stores 3 extra resource tokens.",
  },
  Workshop: {
    deck: "Infrastructure",
    trigger: "Exposed",
    text: "Owner produces 1 extra token per wave.",
  },
  "Border Fort": {
    deck: "Infrastructure",
    trigger: "Exposed",
    text: "Rebels cannot move or retreat into this territory.",
  },
  "Siege Engine": {
    deck: "Weapons Tech",
    trigger: "Attack",
    text: "Win by 4 or more to remove an additional defending layer.",
  },
  Ballista: {
    deck: "Weapons Tech",
    trigger: "Attack",
    text: "+2 attack against a stack with two or three layers.",
  },
  Raiders: {
    deck: "Weapons Tech",
    trigger: "Capture",
    text: "Steal one resource from the former controller.",
  },
  Cavalry: {
    deck: "Weapons Tech",
    trigger: "Attack",
    text: "Attack two edges away through one friendly territory.",
  },
  "Blockade Unit": {
    deck: "Weapons Tech",
    trigger: "Exposed",
    text: "Rebels cannot move or retreat into this territory.",
  },
  Treaty: {
    deck: "Diplomacy",
    trigger: "One shot",
    text: "Discard instead of paying your alliance resource contribution.",
  },
  Ceasefire: {
    deck: "Diplomacy",
    trigger: "One shot",
    text: "Protect your territory until your next turn begins.",
  },
  Envoy: {
    deck: "Diplomacy",
    trigger: "Deployment",
    text: "Replace an adjacent single-layer neutral tile without combat.",
  },
  "Shield Pact": {
    deck: "Diplomacy",
    trigger: "Reaction",
    text: "Discard to add +3 defense for your formal ally. Uses the one guard slot.",
  },
  "Market Charter": {
    deck: "Diplomacy",
    trigger: "Exposed",
    text: "Bank trades cost two matching resources instead of three.",
  },
};
export const ONE_SHOT = new Set<Ability>([
  "Treaty",
  "Ceasefire",
  "Shield Pact",
]);
