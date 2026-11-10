import { createApp, startCleanup } from "./app";
const port = Number(process.env.PORT || 4007);
const server = createApp().listen(port, "0.0.0.0", () => {
  console.log(`Hexfront temporary room server listening on port ${port}`);
});
const cleanup = startCleanup();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    clearInterval(cleanup);
    server.close(() => process.exit(0));
  });
