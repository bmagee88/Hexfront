import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { Action, RoomView, TerritoryBase } from "../shared/types";
import { mapConnectivity } from "../shared/map";
import { Board } from "./Board";
function NeighborStats({ board }: { board: TerritoryBase[] }) {
  const { histogram, average } = mapConnectivity(board);
  return (
    <p
      className="map-neighbor-stats"
      data-testid="map-neighbor-stats"
      title={histogram
        .slice(2)
        .map((n, i) => `${i + 2} neighbors: ${n} territories`)
        .join(" · ")}
    >
      <span>{average.toFixed(2)} neighbors on average</span>
      <span>{histogram[3] + histogram[4]} with 3–4 neighbors</span>
      <span>{histogram[6]} with all 6</span>
    </p>
  );
}
export default function LobbyMaps({
  room,
  host,
  busy,
  onSend,
}: {
  room: RoomView;
  host: boolean;
  busy: boolean;
  onSend: (a: Action) => Promise<RoomView | undefined>;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [room.board.length]);
  const choices = room.mapChoices || [],
    index = room.mapIndex || 0,
    players = room.players.filter((p) => !p.spectator).length;
  const candidates = choices
    .map((choice, i) => ({ choice, index: i }))
    .slice(-6);
  async function compare() {
    const result = await onSend({ type: "generateMaps", mapCount: 6 });
    if (result) setOpen(true);
  }
  return (
    <section className="panel lobby-map-config">
      <div className="map-config-heading">
        <div>
          <div className="eyebrow">SHAPE THE FRONTIER</div>
          <h2>Choose your battleground.</h2>
          <p className="muted small">
            {room.board.length} empty territories ·{" "}
            {players >= 2
              ? `${room.board.length / players} placements per commander`
              : "Sized for 2–4 commanders"}{" "}
            · Six connected regions
          </p>
        </div>
        <span className="map-layout-label">CONFIGURATION {index + 1}</span>
      </div>
      <div className="lobby-map-preview" data-testid="lobby-map-preview">
        <Board board={room.board} tiles={{}} decorative />
      </div>
      <NeighborStats board={room.board} />
      {host ? (
        <div className="map-config-controls">
          <Button
            variant="outlined"
            disabled={busy || index === 0}
            onClick={() => onSend({ type: "chooseMap", mapIndex: index - 1 })}
          >
            ← Previous map
          </Button>
          <Button
            variant="outlined"
            disabled={busy}
            onClick={() =>
              onSend(
                index + 1 < choices.length
                  ? { type: "chooseMap", mapIndex: index + 1 }
                  : { type: "generateMaps", mapCount: 1 },
              )
            }
          >
            Next random map →
          </Button>
          <Button variant="contained" disabled={busy} onClick={compare}>
            Generate 6 maps
          </Button>
        </div>
      ) : (
        <p className="muted small">
          The host chooses the map before opening deployment. Everyone sees the
          selected configuration.
        </p>
      )}
      <p className="small muted map-config-note">
        No hex tiles are placed yet. Commanders take snake turns placing a hex
        from their private hand anywhere empty, then draw a replacement, until
        this entire map is filled.
      </p>
      <Dialog
        className="map-picker"
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>Choose one of six random maps</DialogTitle>
        <DialogContent>
          <p className="muted small">
            Six connected maps, {room.board.length} empty territories each.
            Borders favor 3–4 neighbors. Your current map stays selected until
            you choose a replacement.
          </p>
          <div className="map-options-grid">
            {candidates.map(({ choice, index: optionIndex }, i) => (
              <section
                className="map-option"
                key={choice.id}
                data-testid={`map-option-${i + 1}`}
              >
                <div className="section-label">
                  MAP {i + 1}
                  <span>{choice.board.length} TERRITORIES</span>
                </div>
                <Board board={choice.board} tiles={{}} decorative />
                <NeighborStats board={choice.board} />
                <Button
                  variant="outlined"
                  fullWidth
                  disabled={busy}
                  onClick={async () => {
                    const result = await onSend({
                      type: "chooseMap",
                      mapIndex: optionIndex,
                    });
                    if (result) setOpen(false);
                  }}
                >
                  Choose map {i + 1}
                </Button>
              </section>
            ))}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Keep current map</Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
