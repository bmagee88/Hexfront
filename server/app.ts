import express from "express";
import { handleApi } from "./api";
import { getStore, type Store } from "./store";
export function createApp(store: Store = getStore()) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.text({ type: "*/*", limit: "8kb" }));
  app.use("/api", async (req, res) => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
    const request = new Request(`http://localhost${req.originalUrl}`, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
    });
    try {
      const result = await handleApi(request, store, req.ip);
      res.status(result.status);
      result.headers.forEach((v, k) => res.setHeader(k, v));
      res.send(await result.text());
    } catch (e) {
      console.error(e);
      res.status(503).json({ error: "Game service is unavailable." });
    }
  });
  return app;
}
export function startCleanup(store: Store = getStore()) {
  const timer = setInterval(() => store.cleanup().catch(console.error), 60000);
  timer.unref();
  return timer;
}
