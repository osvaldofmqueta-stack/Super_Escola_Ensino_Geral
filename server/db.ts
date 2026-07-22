import dotenv from "dotenv";
import { Pool } from "pg";
import { getActivePool } from "./db-sync";

dotenv.config();

export { pool } from "./db-pool";

export async function query<T = unknown>(
  sqlText: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pool = getActivePool();
  const res = await pool.query(sqlText, params);
  return res.rows as T[];
}
