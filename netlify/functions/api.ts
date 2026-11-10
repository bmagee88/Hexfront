import { handleApi } from "../../server/api";
import { NetlifyStore } from "../../server/store";
let store: NetlifyStore | undefined;
export default async (request: Request, context: { ip?: string }) => {
  try {
    store ??= new NetlifyStore();
    return await handleApi(request, store, context.ip || "unknown");
  } catch (error) {
    console.error(
      "Room storage unavailable",
      error instanceof Error ? error.message : "unknown",
    );
    return Response.json(
      {
        error:
          "The room service is temporarily unavailable. Please retry shortly.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
};
