import { handleApi } from "../../server/api";
import { getStore } from "../../server/store";
export default async (request: Request, context: { ip?: string }) => {
  try {
    return await handleApi(request, getStore(), context.ip || "unknown");
  } catch (error) {
    console.error(
      "Hexfront storage unavailable:",
      error instanceof Error ? error.message : "unknown",
    );
    return new Response(
      JSON.stringify({
        error: "Game storage is unavailable. Please retry shortly.",
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }
};
