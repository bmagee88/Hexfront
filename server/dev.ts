import express from "express";
import { handleApi } from "./api";
import { getStore } from "./store";
import { createServer } from "vite";
const app = express();
app.disable("x-powered-by");
app.use(express.text({ type: "*/*", limit: "8kb" }));
const store = getStore();
app.use("/api", async (req, res) => {
  const url = `http://127.0.0.1:${process.env.PORT || 4007}${req.originalUrl}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers))
    if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
  const request = new Request(url, {
    method: req.method,
    headers,
    body: req.method === "GET" ? undefined : req.body,
  });
  try {
    const result = await handleApi(request, store, req.ip);
    res.status(result.status);
    result.headers.forEach((v, k) => res.setHeader(k, v));
    res.send(await result.text());
  } catch (e) {
    console.error(e);
    res.status(503).json({ error: "Game storage is unavailable." });
  }
});
const port = Number(process.env.PORT || 4007);
app.listen(port, "127.0.0.1", () =>
  console.log(`Hexfront API: http://127.0.0.1:${port}/api/health`),
);
const vite = await createServer();
await vite.listen();
vite.printUrls();
const cleanup = setInterval(
  () => store.cleanup().catch(console.error),
  3600000,
);
cleanup.unref();
