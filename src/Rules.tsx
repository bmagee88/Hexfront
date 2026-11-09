import { Link } from "react-router-dom";
import { Brand } from "./App";
import { ABILITIES, PRICES } from "../shared/cards";
const chapters = [
  [
    "Your first campaign",
    "Create a room and share its six-character code. Two to four commanders choose distinct colors and ready up. The host can spectate on a projector, add server-operated automatons, configure the reaction window, and pause the campaign. Browser reconnect keys restore your seat; keep this browser’s site data.",
  ],
  [
    "The opening claim",
    "Before play, the host cycles through random contiguous battlegrounds or generates six maps to preview and choose in a modal. There are 42 territories with two or three commanders and 44 with four, close to Risk’s 42 and divisible evenly by the player count. Every base starts EMPTY, with no numbered hex. Each commander receives three private basic tiles, two Food, and one Lumber. In public shuffled order, take snake turns (A–B–C–D / D–C–B–A / A–B–C–D, continuing). On each turn, select any tile from your own hand, place it on ANY empty base, then draw one replacement. No adjacency restriction. Repeat until every base is occupied, so everyone places the same number of tiles. Only then start round-one production and normal turns.",
  ],
  [
    "Read the board",
    "A territory is a fixed base. Its tile stack holds up to three numbered hexes. The exposed top owner controls the territory. The flat colored chip marks the exposed owner; colored layer edges identify buried owners. Every base has exactly three separate rebel sockets outside its stack. One colored peg is one rebel. Resource stock is shown on commander mats, never as map pegs.",
  ],
  [
    "Borders and routes",
    "Battlegrounds favor territories with three or four neighbors, with a few quieter edges and busy six-sided hubs. Their border mix is inspired by classic Risk, which averages 3.95 neighbors per territory. The host can compare actual neighbor statistics on each map preview. Every territory has at least two neighbors, the whole map is connected, and each of the six colored regions is connected. A shared hex edge is a route; empty gaps are not routes.",
  ],
  [
    "Forecast and turns",
    "The active forecast resource produces for all commanders at the start of each complete round. Each matching exposed territory gives one token, up to three per commander per wave. Workshop raises that cap; Lumber Mill adds Lumber within the cap. Resources are capped at twelve total, plus three per exposed Granary. If a Granary loses its exposed power, overflow is discarded in order: Cattle, Stone, Food, Iron, Lumber. The five-slot queue draws from shuffled bags of all five types without replacement. At round end, shift left and append the next bag draw. Production is never retroactive when you reorder. A normal turn draws up to three basics within the combined three-tile hand cap and grants three actions. Use them in any order, repeat legal actions, then end your turn.",
  ],
  [
    "Basic combat · scenario",
    "Choose Attack, tap your source, choose a hand tile, and tap a legal target. Attack = source top number + played hand number + modifiers. Defense = target top number + one per buried layer (maximum two) + exposed powers + optional pledged rebels + one surprise guard. The defender discards one hand tile to add its number, or passes. A formal ally can instead discard Shield Pact for +3 in that same guard slot. Reactions time out to pass. Attack must be strictly greater; ties defend. Source 4 + hand 3 = 7 versus top 5 + one buried = 6. A surprise guard of 2 makes defense 8: the attack fails and both hand tiles are discarded.",
  ],
  [
    "Three-layer defense · scenario",
    "Source 4 + hand 5 = 9 against top 6 + two buried = 8. The attack succeeds and removes only the defending top. The played tile is discarded because lower layers remain. Lower printed numbers never take damage. When the last layer falls, the played attack tile becomes the new territory tile with the attacker’s chip. The source stays intact. Siege Engine can remove a second layer when it wins by at least four.",
  ],
  [
    "Build, rearrange, and forecast · scenario",
    "Reinforce places your hand tile above or below a friendly stack. Reposition moves your own top from a stack of two or more to an adjacent friendly base with room. Reorder changes your own layers; foreign support remains below the controller’s tiles. If Iron is next, expose an Iron border now to produce on that next wave. Buried resources never produce. Scout draws up to two basics. Discard a hand tile without an action to free a hand slot; Reorganize is a landless rebel action that discards one and draws up to two.",
  ],
  [
    "Resources and private special purchases",
    "Bank Trade exchanges three matching resources for one chosen type, improved to two with an exposed Market Charter. Buy a Special costs one action and the chosen deck price. The draw is random and secret, and all basic and special tiles share a three-tile hand limit. Empty decks recycle their discards. Treaty, Ceasefire, and Shield Pact are one-shots; they cannot become permanent stack layers or attack tiles.",
  ],
  [
    "Formal alliances and inherited support · scenario",
    "Propose an alliance using an action. Each participant independently pays Food + Cattle + Stone or one Treaty when the recipient accepts. Each player can have one formal ally. Alliance support inserts your tile at the bottom of your ally’s stack, with at most one foreign support per territory. A resource transfer uses an action and the alliance shares a cap of two tokens transferred per round. Partners cannot attack each other, combine attack sources, or win jointly. If Red’s exposed tile is removed above Blue’s buried support, Blue immediately controls the territory while their alliance remains valid.",
  ],
  [
    "Separation and betrayal · scenario",
    "On your own turn, request mutual separation or break unilaterally without using an action. Mutual consent discards all partnership support without rebels or penalty. A unilateral break discards support from both partners and creates one rebel for each support tile’s original owner, in that territory, an adjacent hole, or a creation-only reserve if needed. The initiator takes exactly one permanent −2 VP penalty if any rebels were created, including reserves. With no support, there is no penalty. Both regain Sovereignty if they own land. Former allies cannot reunite until three complete rounds have passed.",
  ],
  [
    "Coalition Threat · scenario",
    "A formal pair controlling MORE THAN HALF the map is a Dominant Coalition: at least 22 of 42 territories or 23 of 44. Every outsider gains +1 attack against either member and steals one extra available resource on a rebel raid there. At half the map or less, or when the alliance dissolves, the threat ends immediately. Merely forming an alliance never triggers this bonus.",
  ],
  [
    "Rebel groups, raids, and uprising",
    "All same-color pegs in one territory form a group. Move the whole group one edge to enough empty holes, respecting blockades and the three-socket limit. Recruit costs an action, Food, and Cattle at an existing group with an empty hole. Raid spends an action to steal one available token from the current controller, once per group per turn. You may choose a preferred stock type. Moving a group does not refresh its raid. Underground Attack starts with your pegs already in the target: played tile + local peg count + modifiers, with ordinary stack defense and one guard. It removes the top layer; capturing the final layer deploys your tile and consumes all your local pegs. Rebels can voluntarily pledge one faction’s whole local group to defense; this is separate from the hand guard. Resources can be transferred to active rebel factions as an action.",
  ],
  [
    "Landless survival and containment · scenario",
    "Losing your last territory creates one rebel there, adjacent, or in a creation reserve if holes are full. A landless commander draws two basics and takes two rebel actions, produces no normal resources, and gets no Sovereignty. Reserves deploy to the first free base at the start of their owner’s next turn and cannot act while dormant. Suppression spends an action and hand tile: controlling top + hand versus targeted faction peg count + one optional guard. Strictly greater wins: remove one peg and retreat survivors together. If there is no legal adjacent destination, survivors are captured. Only a completely landless player’s absolutely last peg, counting reserve pegs, skips the initial casualty and must retreat. If every adjacent base is full or blocked, successful suppression kills that last peg permanently. Reserves never provide a retreat escape.",
  ],
  [
    "Patrols and escape routes",
    "Patrol your territory once per round, at most two active patrols, to prevent rebel entry through the end of your next turn. Exposed Border Fort and Blockade Unit also block entry and retreat. The territory inspector lists adjacent hole counts and blocked bases. Retreat resolves to the first legal adjacent base in public map order. This deterministic choice is disclosed before suppression.",
  ],
  [
    "Prestige and Sovereignty",
    "Each of five exclusive titles gives two current VP: Longest Supply Line (longest simple personal path, minimum five); Strongest Army (two deployed owned Weapons Tech); Master Builder (two deployed owned Infrastructure); Trade Dominance (three distinct controlled exposed resource types); Diplomatic Influence (two deployed owned Diplomacy). Deployed special metrics include buried tiles. Titles transfer only when strictly exceeded. Ties retain an eligible incumbent; without an eligible incumbent, a tied lead leaves the title vacant. Every landholding player without a formal ally has two conditional Sovereignty VP. It is not exclusive and does not accumulate. Score = title VP + current Sovereignty − two per qualifying historical betrayal. No VP per territory.",
  ],
  [
    "Fluctuating victory · scenario",
    "At each full round end, recalculate prestige and current scores, then record victory claims. A player reaching eight VP at the end of round four must still hold eight at the end of round five to be eligible. Dropping below eight loses the claim, even after a transient midturn lead. Eligible contenders compare score, then personal territory count, then fewest betrayals. An exact tie continues play. Elimination victory, if enabled, immediately awards the last surviving commander. Individual victories only. After scoring: advance the forecast, reset alliance transfer counters, resolve production, then start the next turn.",
  ],
  [
    "Host controls, privacy, and reconnect",
    "The host manages lobby settings and can pause/resume. Everyone’s actions are validated by the server. A spectator receives the public board, never private hands or deck order. The client refreshes versioned snapshots approximately once per second. Orders include a unique id and expected version; stale orders must be reviewed and resubmitted. Room state persists across server restarts. Inactive rooms expire after 24 hours. Download the public campaign log after play. The host seed is mixed with secret server entropy so it cannot predict private draws. Secret entropy, deck order and private command history stay on the server even after victory; public downloads include only the host seed and public log.",
  ],
  [
    "Playtest boundaries",
    "The canonical 15 special abilities are implemented. Experimental Blitz, Adjacent Support, Draft Reinforcements, asymmetric factions, secret objectives, queue manipulation, Highway, Merchant Guild, Trade Agreement, Saboteur, Shieldbearers, Amnesty, and Slip Through are deferred and cannot be enabled. They never silently affect the standard game.",
  ],
];
export default function Rules() {
  return (
    <div className="rules-page">
      <header className="site-header">
        <Brand />
        <Link to="/">Return to command →</Link>
      </header>
      <main>
        <div className="eyebrow">THE FIELD MANUAL</div>
        <h1>
          Know the ground.
          <br />
          <em>Write your own story.</em>
        </h1>
        <p className="rules-lede">
          The canonical rules, worked examples, and the timing that keeps the
          frontier fair.
        </p>
        <nav className="rules-index">
          {chapters.map(([title], i) => (
            <a key={title} href={`#chapter-${i}`}>
              {String(i + 1).padStart(2, "0")} {title.split(" · ")[0]}
            </a>
          ))}
        </nav>
        {chapters.map(([title, text], i) => (
          <section key={title} id={`chapter-${i}`}>
            <span className="eyebrow">
              {String(i + 1).padStart(2, "0")} / FIELD NOTES
            </span>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))}
        <section>
          <div className="eyebrow">CARD REGISTRY</div>
          <h2>Three decks. Fifteen abilities.</h2>
          {Object.entries(PRICES).map(([deck, cost]) => (
            <div key={deck}>
              <h3>{deck}</h3>
              <p className="muted">
                One action +{" "}
                {Object.entries(cost)
                  .map(([r, n]) => `${n} ${r}`)
                  .join(" + ")}
                . Fifteen cards: three copies of each ability.
              </p>
              <div className="card-rules">
                {Object.entries(ABILITIES)
                  .filter(([, d]) => d.deck === deck)
                  .map(([name, d]) => (
                    <article key={name}>
                      <small>{d.trigger}</small>
                      <h4>{name}</h4>
                      <p>{d.text}</p>
                    </article>
                  ))}
              </div>
            </div>
          ))}
        </section>
      </main>
      <footer>
        <Brand />
        <Link to="/">Start a campaign →</Link>
      </footer>
    </div>
  );
}
