import { createApp, startCleanup } from "./app";
import { createServer } from "vite";
const port = Number(process.env.PORT || 4007);
createApp().listen(port, "127.0.0.1", () =>
  console.log(`Hexfront API: http://127.0.0.1:${port}/api/health`),
);
const vite = await createServer();
await vite.listen();
vite.printUrls();
startCleanup();
