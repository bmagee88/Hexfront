import {
  mkdir,
  readFile,
  rename,
  writeFile,
  readdir,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { getDatabase } from "@netlify/database";
import { Room } from "../shared/types";
export type RoomTransaction<T> = (room: Room | null) => {
  room: Room;
  result: T;
};
export interface Store {
  transaction<T>(code: string, fn: RoomTransaction<T>): Promise<T>;
  cleanup(): Promise<void>;
}
const queues = new Map<string, Promise<unknown>>();
export class DiskStore implements Store {
  constructor(private directory = path.resolve("data")) {}
  async transaction<T>(code: string, fn: RoomTransaction<T>): Promise<T> {
    const before = queues.get(code) || Promise.resolve();
    const next = before
      .catch(() => {})
      .then(async () => {
        await mkdir(this.directory, { recursive: true });
        const file = path.join(this.directory, `${code}.json`);
        let room: Room | null = null;
        try {
          room = JSON.parse(await readFile(file, "utf8"));
        } catch (e: any) {
          if (e.code !== "ENOENT") throw e;
        }
        const { room: updated, result } = fn(room);
        const temp = `${file}.${process.pid}.tmp`;
        await writeFile(temp, JSON.stringify(updated), { mode: 0o600 });
        await rename(temp, file);
        return result;
      });
    queues.set(code, next);
    try {
      return await next;
    } finally {
      if (queues.get(code) === next) queues.delete(code);
    }
  }
  async cleanup() {
    await mkdir(this.directory, { recursive: true });
    for (const name of await readdir(this.directory)) {
      if (!/^[A-Z0-9]{6}\.json$/.test(name)) continue;
      const file = path.join(this.directory, name);
      if (Date.now() - (await stat(file)).mtimeMs > 86400000)
        await unlink(file);
    }
  }
}
export class PostgresStore implements Store {
  private pool: pg.Pool;
  constructor(url?: string) {
    // getDatabase resolves Netlify's runtime branch automatically. Its package also opts into provisioning.
    const connectionString =
      url || process.env.NETLIFY_DB_URL || getDatabase().connectionString;
    this.pool = new pg.Pool({
      connectionString,
      max: 3,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
    });
  }
  async transaction<T>(code: string, fn: RoomTransaction<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      // Advisory lock also protects creation of a previously absent room row.
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [code]);
      const rows = await c.query(
        "SELECT state FROM hexfront_rooms WHERE code=$1 AND updated_at > now() - interval '24 hours' FOR UPDATE",
        [code],
      );
      const { room, result } = fn(rows.rows[0]?.state || null);
      await c.query(
        "INSERT INTO hexfront_rooms(code,state,updated_at) VALUES($1,$2,now()) ON CONFLICT(code) DO UPDATE SET state=excluded.state,updated_at=now()",
        [code, JSON.stringify(room)],
      );
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async cleanup() {
    await this.pool.query(
      "DELETE FROM hexfront_rooms WHERE updated_at < now() - interval '24 hours'",
    );
  }
}
let singleton: Store | undefined;
export function getStore(): Store {
  return (singleton ??=
    process.env.NETLIFY ||
    process.env.DATABASE_URL ||
    process.env.NETLIFY_DB_URL
      ? new PostgresStore(process.env.DATABASE_URL)
      : new DiskStore());
}
