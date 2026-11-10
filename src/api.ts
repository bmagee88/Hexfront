import { Action, RoomView } from "../shared/types";
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
export interface Session {
  code: string;
  token: string;
}
export const session = (code: string): Session | null => {
  try {
    return JSON.parse(localStorage.getItem(`hexfront:${code}`) || "null");
  } catch {
    return null;
  }
};
export function remember(data: Session) {
  localStorage.setItem(`hexfront:${data.code}`, JSON.stringify(data));
}
export async function request(
  path: string,
  body?: unknown,
  token?: string,
): Promise<any> {
  let result: Response;
  try {
    result = await fetch(`${API_BASE}/api${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      "Could not reach the game server. It may be starting up; please try again shortly.",
    );
  }
  let data;
  try {
    data = await result.json();
  } catch {
    throw new Error(
      "The website responded, but the game server did not return a valid response.",
    );
  }
  if (!result.ok)
    throw Object.assign(new Error(data.error), { status: result.status });
  return data;
}
export const command = (s: Session, v: RoomView, action: Action) =>
  request(
    `/rooms/${s.code}/action`,
    { id: crypto.randomUUID(), version: v.version, action },
    s.token,
  );
