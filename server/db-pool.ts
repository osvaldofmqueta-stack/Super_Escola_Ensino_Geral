import { getActivePool } from "./db-sync";

export const pool = new Proxy({} as import("pg").Pool, {
  get(_target, prop) {
    const active = getActivePool();
    const val = (active as any)[prop];
    return typeof val === "function" ? val.bind(active) : val;
  },
});
