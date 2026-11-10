import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe("hosted game service connection", () => {
  it("uses the same-origin Netlify room API in production", async () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_API_BASE_URL", "");
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ code: "ABC123" }, { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    const { request } = await import("../src/api");
    expect(await request("/rooms", { name: "Host" })).toEqual({
      code: "ABC123",
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/rooms",
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("creates rooms on the configured backend origin", async () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_API_BASE_URL", "https://backend.example/");
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ code: "ABC123" }, { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    const { request } = await import("../src/api");
    expect(await request("/rooms", { name: "Host" })).toEqual({
      code: "ABC123",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://backend.example/api/rooms",
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("distinguishes HTML fallbacks and unreachable backends", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://backend.example");
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("<!doctype html><html></html>"));
    vi.stubGlobal("fetch", fetch);
    const { request } = await import("../src/api");
    await expect(request("/rooms", { name: "Host" })).rejects.toThrow(
      "valid response",
    );
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(request("/rooms", { name: "Host" })).rejects.toThrow(
      "Could not reach the game server",
    );
  });
});
