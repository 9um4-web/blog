import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// dev 핫리로드 시 커넥션 풀이 계속 늘어나지 않도록 전역에 캐시
const globalForDb = globalThis as unknown as { __blogPgPool?: Pool };

const pool =
  globalForDb.__blogPgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });
globalForDb.__blogPgPool = pool;

export const db = drizzle(pool, { schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
