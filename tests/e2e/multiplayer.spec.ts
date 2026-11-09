import { test, expect, BrowserContext } from "@playwright/test";
import { RoomView, Action } from "../../shared/types";
import { adjacent } from "../../shared/engine";
import { randomUUID } from "node:crypto";
for (const n of [3, 4])
  test(`${n} independent browsers: lobby, snake draft, synchronization, battle and reconnect`, async ({
    browser,
  }) => {
    const contexts: BrowserContext[] = [],
      seats: { token: string; id: string; context: BrowserContext }[] = [];
    let code = "";
    let state: RoomView;
    try {
      for (let i = 0; i < n; i++) {
        const context = await browser.newContext();
        contexts.push(context);
        const res = await context.request.post(
          `/api/rooms${i ? `/${code}/join` : ""}`,
          { data: { name: `Commander ${i + 1}` } },
        );
        expect(res.ok()).toBe(true);
        const data = await res.json();
        code = data.code;
        state = data.view;
        seats.push({ token: data.token, id: data.view.me, context });
        const page = await context.newPage();
        await page.goto("/");
        await page.evaluate(
          ({ code, token }) =>
            localStorage.setItem(
              `hexfront:${code}`,
              JSON.stringify({ code, token }),
            ),
          { code, token: data.token },
        );
        await page.goto(`/room/${code}`);
        await expect(
          page.getByRole("heading", { name: /The calm before/ }),
        ).toBeVisible();
      }
      async function read(i: number) {
        const res = await seats[i].context.request.get(`/api/rooms/${code}`, {
          headers: { Authorization: `Bearer ${seats[i].token}` },
        });
        expect(res.ok()).toBe(true);
        return (await res.json()).view as RoomView;
      }
      async function act(i: number, action: Action) {
        state = await read(i);
        const res = await seats[i].context.request.post(
          `/api/rooms/${code}/action`,
          {
            headers: { Authorization: `Bearer ${seats[i].token}` },
            data: { id: randomUUID(), version: state.version, action },
          },
        );
        if (!res.ok()) throw new Error(await res.text());
        state = (await res.json()).view;
        return state;
      }
      for (let i = 0; i < n; i++) await act(i, { type: "ready" });
      if (n === 3) {
        const host = contexts[0].pages()[0];
        await expect(host.locator(".lobby-player .ready-label")).toHaveCount(n);
        const original = JSON.stringify((await read(0)).board);
        await host.getByRole("button", { name: "Next random map →" }).click();
        await expect
          .poll(async () => JSON.stringify((await read(0)).board))
          .not.toBe(original);
        await host
          .getByRole("button", { name: "Generate 6 maps", exact: true })
          .click();
        await expect(host.getByRole("dialog")).toBeVisible();
        await expect(host.locator(".map-option")).toHaveCount(6);
        await expect(
          host.getByRole("dialog").getByTestId("map-neighbor-stats"),
        ).toHaveCount(6);
        await expect(
          host.getByRole("dialog").getByTestId("map-neighbor-stats").first(),
        ).toContainText("neighbors on average");
        const contentBounds = await host
          .locator(".map-picker .MuiDialogContent-root")
          .boundingBox();
        const lastChoiceBounds = await host
          .getByRole("button", { name: "Choose map 6", exact: true })
          .boundingBox();
        expect(
          lastChoiceBounds!.y + lastChoiceBounds!.height,
        ).toBeLessThanOrEqual(contentBounds!.y + contentBounds!.height);
        await host.screenshot({
          path: "test-results/six-map-picker.png",
          fullPage: false,
        });
        await host
          .getByRole("button", { name: "Choose map 4", exact: true })
          .click();
        await expect(host.getByRole("dialog")).toHaveCount(0);
        const picked = await read(0);
        expect(picked.board).toEqual(
          picked.mapChoices![picked.mapIndex!].board,
        );
        await expect(
          contexts[1]
            .pages()[0]
            .getByRole("button", { name: "Generate 6 maps", exact: true }),
        ).toHaveCount(0);
      }
      await act(0, { type: "settings", settings: { reactionSeconds: 5 } });
      state = await act(0, { type: "start" });
      if (n === 3) {
        const index = seats.findIndex((s) => s.id === state.priority),
          p = contexts[index].pages()[0];
        const own = await read(index);
        await expect(p.locator(".hand-cards .hand-card")).toHaveCount(3);
        await expect(
          p.getByRole("heading", { name: /^Your hand/ }),
        ).toContainText("3 / 3");
        await p.locator(".hand-cards .hand-card").first().click();
        await p.getByTestId(`tile-${own.legalDraft[0]}`).click();
        await p.getByRole("button", { name: /^Place .* on/ }).click();
        await expect.poll(async () => (await read(index)).draftIndex).toBe(1);
        state = await read(0);
      }
      while (state.phase === "draft") {
        state = await read(0);
        const i = seats.findIndex((s) => s.id === state.priority);
        state = await read(i);
        await act(i, {
          type: "draft",
          target: state.legalDraft[0],
          card: state.hand[0].id,
        });
      }
      for (let i = 0; i < n; i++) {
        const v = await read(i);
        expect(v.phase).toBe("playing");
        expect(
          v.players.every((p) => p.territories === v.board.length / n),
        ).toBe(true);
        expect(Object.keys(v.tiles).length).toBe(
          v.board.length + v.hand.length,
        );
        expect(v.forecast).toEqual(state!.forecast);
        expect(
          v.hand.every(
            (c) =>
              !v.players.some(
                (p) => p.id !== v.me && (p as any).hand?.includes(c.id),
              ),
          ),
        ).toBe(true);
        const page = contexts[i].pages()[0];
        await expect(page.getByText("ROUND 01", { exact: true })).toBeVisible();
        await expect(
          page.getByRole("heading", { name: /^Your hand/ }),
        ).toBeVisible();
      }
      const spectator = await browser.newContext();
      contexts.push(spectator);
      const watch = await spectator.request.post(`/api/rooms/${code}/join`, {
        data: { name: "Public Projector", spectator: true },
      });
      const watchData = await watch.json();
      expect(watchData.view.hand).toEqual([]);
      expect(Object.keys(watchData.view.tiles)).toHaveLength(
        state.board.length,
      );
      const projection = await spectator.newPage();
      await projection.goto("/");
      await projection.evaluate(
        ({ code, token }) =>
          localStorage.setItem(
            `hexfront:${code}`,
            JSON.stringify({ code, token }),
          ),
        { code, token: watchData.token },
      );
      await projection.goto(`/room/${code}`);
      await expect(projection.getByText("PUBLIC PROJECTION")).toBeVisible();
      await expect(
        projection.getByRole("heading", { name: /^Your hand/ }),
      ).toHaveCount(0);
      state = await read(0);
      const i = seats.findIndex((s) => s.id === state.priority);
      state = await read(i);
      const source = state.board.find(
        (t) =>
          state.tiles[t.stack.at(-1)!].owner === state.me &&
          state.board.some(
            (u) =>
              adjacent(t, u) &&
              state!.tiles[u.stack.at(-1)!].owner !== state!.me,
          ),
      )!;
      const target = state.board.find(
        (t) =>
          adjacent(source, t) &&
          state!.tiles[t.stack.at(-1)!].owner !== state!.me,
      )!;
      const c = state.hand[0];
      await act(i, {
        type: "attack",
        source: source.id,
        target: target.id,
        card: c.id,
      });
      if (state.pending) {
        const d = seats.findIndex((s) => s.id === state.pending!.defender);
        await contexts[d].pages()[0].reload();
        await expect(
          contexts[d].pages()[0].getByText("An attack is incoming."),
        ).toBeVisible();
        await act(d, { type: "guard" });
      }
      const versions = [];
      for (let j = 0; j < n; j++) versions.push((await read(j)).version);
      expect(new Set(versions).size).toBe(1);
      const page = contexts[i].pages()[0];
      await page.reload();
      await expect(
        page.getByRole("heading", { name: /^Your hand/ }),
      ).toBeVisible();
      expect((await read(i)).me).toBe(seats[i].id);
      await page.screenshot({
        path: `test-results/${n}-player-game.png`,
        fullPage: true,
      });
    } finally {
      for (const c of contexts) await c.close();
    }
  });
test("mobile landing, practice draft, direct rules and private projector", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    page = await ctx.newPage();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Build your power/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-home.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Learn the frontier/ }).click();
  await page.getByLabel("Commander name").fill("Solo Captain");
  await page.getByRole("button", { name: "Begin practice" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your battleground." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Begin snake draft →" }).click();
  await expect(page.getByText("THE OPENING CLAIM")).toBeVisible();
  for (let i = 0; i < 50; i++) {
    const pageState = await page.evaluate(() => {
      const code = location.pathname.split("/").at(-1)!;
      return JSON.parse(localStorage.getItem(`hexfront:${code}`)!);
    });
    let response = await ctx.request.get(`/api/rooms/${pageState.code}`, {
      headers: { Authorization: `Bearer ${pageState.token}` },
    });
    let v = (await response.json()).view;
    if (v.phase !== "draft") break;
    await ctx.request.post(`/api/rooms/${pageState.code}/action`, {
      headers: { Authorization: `Bearer ${pageState.token}` },
      data: {
        id: randomUUID(),
        version: v.version,
        action: { type: "draft", target: v.legalDraft[0], card: v.hand[0].id },
      },
    });
  }
  await expect(page.getByText("ROUND 01", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Your hand/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-game.png",
    fullPage: true,
  });
  await page.goto("/rules");
  await expect(
    page.getByRole("heading", { name: /Know the ground/ }),
  ).toBeVisible();
  await ctx.close();
});
