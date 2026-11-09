import { useId, useState } from "react";
import { generateMap } from "../shared/map";
import {
  NumberedHex,
  PublicPlayer,
  RoomView,
  TerritoryBase,
} from "../shared/types";
export const RESOURCE_COLOR: Record<string, string> = {
  Lumber: "#79ae8b",
  Iron: "#8faac0",
  Food: "#e2bd6d",
  Stone: "#c0a8c7",
  Cattle: "#d58d6e",
};
export const RESOURCE_SYMBOL: Record<string, string> = {
  Lumber: "♠",
  Iron: "◆",
  Food: "✦",
  Stone: "⬟",
  Cattle: "♜",
};
const hex = (x: number, y: number, size: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const angle = ((60 * i - 30) * Math.PI) / 180;
    return `${x + size * Math.cos(angle)},${y + size * Math.sin(angle)}`;
  }).join(" ");
export function Board({
  board,
  tiles,
  players = [],
  selected,
  source,
  legal = [],
  onSelect = () => {},
  decorative = false,
}: {
  board: TerritoryBase[];
  tiles: Record<string, NumberedHex>;
  players?: PublicPlayer[];
  selected?: string;
  source?: string;
  legal?: string[];
  onSelect?: (id: string) => void;
  decorative?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const positions = board.map((t) => ({
    x: Math.sqrt(3) * 43 * (t.q + t.r / 2),
    y: 43 * 1.5 * t.r,
  }));
  const minX = Math.min(0, ...positions.map((p) => p.x)) - 55,
    maxX = Math.max(0, ...positions.map((p) => p.x)) + 55,
    minY = Math.min(0, ...positions.map((p) => p.y)) - 55,
    maxY = Math.max(0, ...positions.map((p) => p.y)) + 55;
  const width = maxX - minX,
    height = maxY - minY,
    cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  return (
    <div className={`board-shell ${decorative ? "decorative" : ""}`}>
      <svg
        className="hex-board"
        viewBox={`${cx - width / zoom / 2 + pan.x} ${cy - height / zoom / 2 + pan.y} ${width / zoom} ${height / zoom}`}
        aria-label={`${board.length}-territory frontier map`}
      >
        <defs>
          <filter id={`${uid}-shadow`}>
            <feDropShadow dx="0" dy="4" stdDeviation="3" floodOpacity=".28" />
          </filter>
          <radialGradient id={`${uid}-boardglow`}>
            <stop offset="0" stopColor="#273e42" />
            <stop offset="1" stopColor="#142329" />
          </radialGradient>
        </defs>
        <circle
          cx={cx}
          cy={cy}
          r={Math.max(width, height) / 2}
          fill={`url(#${uid}-boardglow)`}
          opacity=".4"
        />
        {board.map((t) => {
          const x = Math.sqrt(3) * 43 * (t.q + t.r / 2),
            y = 43 * 1.5 * t.r;
          const c = tiles[t.stack[t.stack.length - 1]];
          const owner = players.find((p) => p.id === c?.owner);
          const active = selected === t.id,
            allowed = legal.includes(t.id);
          return (
            <g
              key={t.id}
              role={decorative ? undefined : "button"}
              tabIndex={decorative ? -1 : 0}
              aria-label={`${t.id}, ${c ? `${c.resource} ${c.value}, ${owner?.name || "neutral"}, ${t.stack.length} layers` : "empty territory"}${allowed ? ", legal target" : ""}`}
              data-testid={`tile-${t.id}`}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(t.id);
                }
              }}
              className={`territory ${active ? "selected" : ""} ${allowed ? "legal" : ""}`}
              style={{ cursor: decorative ? "default" : "pointer" }}
            >
              <title>{`${t.id} · Region ${t.region + 1} · ${c ? `${owner?.name || "Neutral"} · ${c.ability || c.resource}` : "Empty — place a hex from your hand"}`}</title>
              <polygon
                points={hex(x, y + 3, 42)}
                fill={
                  c
                    ? "#0c1519"
                    : [
                        "#172e2d",
                        "#202c37",
                        "#302a35",
                        "#302e22",
                        "#302724",
                        "#222e29",
                      ][t.region % 6]
                }
                stroke={
                  active
                    ? "#f3d699"
                    : allowed
                      ? "#dabc81"
                      : source === t.id
                        ? "#fff"
                        : c
                          ? "#31474d"
                          : "#52716b"
                }
                strokeWidth={active || allowed ? 2.5 : 1}
              />
              {c && (
                <>
                  {t.stack.slice(0, -1).map((id, i) => (
                    <polygon
                      key={id}
                      points={hex(x, y - i * 3, 34)}
                      fill="#29393c"
                      stroke={
                        players.find((p) => p.id === tiles[id].owner)?.color ||
                        "#6b7678"
                      }
                      strokeWidth="2"
                    />
                  ))}
                  <polygon
                    points={hex(x, y - (t.stack.length - 1) * 3 - 3, 34)}
                    fill={owner ? `${owner.color}20` : "#26373b"}
                    stroke={RESOURCE_COLOR[c.resource]}
                    strokeWidth="2"
                    filter={`url(#${uid}-shadow)`}
                  />
                  <text
                    x={x}
                    y={y - 2 - (t.stack.length - 1) * 3}
                    textAnchor="middle"
                    fill={owner ? "#f3eee4" : "#b7c6c4"}
                    fontSize="24"
                    fontWeight="600"
                  >
                    {c.value}
                  </text>
                  <text
                    x={x}
                    y={y + 13 - (t.stack.length - 1) * 3}
                    textAnchor="middle"
                    fontSize="8"
                    fill={RESOURCE_COLOR[c.resource]}
                    letterSpacing=".5"
                  >
                    {c.resource.toUpperCase()}
                  </text>
                  <circle
                    cx={x + 21}
                    cy={y - 19 - (t.stack.length - 1) * 3}
                    r="5"
                    fill={owner?.color || "#1b292c"}
                    stroke={owner ? "#ffffff60" : "#5f7377"}
                    strokeWidth="1"
                  />
                </>
              )}
              {!c && (
                <>
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    fill="#8ca19b"
                    fontSize="12"
                  >
                    {t.id}
                  </text>
                  <text
                    x={x}
                    y={y + 14}
                    textAnchor="middle"
                    fill="#627c74"
                    fontSize="7"
                  >
                    EMPTY
                  </text>
                </>
              )}
              {t.rebels.map((peg, i) => (
                <circle
                  key={i}
                  cx={x + (i - 1) * 12}
                  cy={y + 34}
                  r="4"
                  fill={
                    peg
                      ? players.find((p) => p.id === peg.owner)?.color
                      : "#0a1519"
                  }
                  stroke={peg ? "#e8e3d080" : "#4a6267"}
                  strokeWidth="1"
                />
              ))}
              <text x={x - 25} y={y - 24} fill="#849b9d" fontSize="6">
                {t.id.slice(1)}
              </text>
              {c?.ability && (
                <text x={x - 23} y={y + 8} fill="#e1c891" fontSize="10">
                  ✧
                </text>
              )}
              {(t.ceasefire ||
                t.patrol ||
                ["Border Fort", "Blockade Unit"].includes(
                  c?.ability || "",
                )) && (
                <text x={x + 21} y={y + 17} fontSize="10" fill="#e1c891">
                  {t.ceasefire ? "☮" : "⊘"}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {!decorative && (
        <div className="map-controls" aria-label="Map controls">
          <button
            onClick={() => setZoom(Math.min(2, zoom + 0.2))}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => setZoom(Math.max(0.65, zoom - 0.2))}
            aria-label="Zoom out"
          >
            −
          </button>
          {[
            ["←", -40, 0],
            ["↑", 0, -40],
            ["↓", 0, 40],
            ["→", 40, 0],
          ].map(([label, x, y]) => (
            <button
              key={label}
              aria-label={`Pan ${label}`}
              onClick={() =>
                setPan((p) => ({ x: p.x + Number(x), y: p.y + Number(y) }))
              }
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            aria-label="Reset map"
          >
            ↺
          </button>
        </div>
      )}
    </div>
  );
}
export function Card({
  card,
  selected,
  onClick,
  owner,
}: {
  card: NumberedHex;
  selected?: boolean;
  onClick?: () => void;
  owner?: string;
}) {
  return (
    <button
      className={`hand-card ${selected ? "active" : ""}`}
      style={
        { "--resource": RESOURCE_COLOR[card.resource] } as React.CSSProperties
      }
      onClick={onClick}
      title={card.ability || card.resource}
      aria-pressed={selected}
    >
      <span className="card-type">
        {card.deck === "basic" ? "BASIC HEX" : card.deck.toUpperCase()}
      </span>
      <b>{card.value}</b>
      <span>
        {RESOURCE_SYMBOL[card.resource]} {card.resource}
      </span>
      {card.ability && <strong>{card.ability}</strong>}
      {owner && <small>{owner}</small>}
    </button>
  );
}
export function previewBoard() {
  const board = generateMap(42, "home-frontier"),
    tiles: Record<string, NumberedHex> = {};
  const resources = Object.keys(RESOURCE_COLOR);
  board.forEach((t, index) => {
    const i = index + 1,
      card = `c${i}`;
    t.stack = [card];
    tiles[card] = {
      id: card,
      value: ((i * 7) % 6) + 1,
      resource: resources[
        (i * 3 + Math.abs(t.q)) % 5
      ] as NumberedHex["resource"],
      deck: "basic",
      owner: i % 6 === 0 ? "demo" : null,
    };
  });
  return { board, tiles };
}
