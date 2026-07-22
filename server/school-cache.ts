import { query } from "./db";

let cachedSchoolName: string = "Escola";
let cachedSchoolNameAt = 0;
let cachedFaviconUrl: string = "";
let cachedFaviconAt = 0;
let cachedDirectorGeral: string = "";
let cachedDirectorPedagogico: string = "";
const SCHOOL_NAME_TTL_MS = 30_000;

export async function refreshSchoolName(): Promise<void> {
  try {
    const rows = await query<{ nomeEscola?: string | null; faviconUrl?: string | null; directorGeral?: string | null; directorPedagogico?: string | null }>(
      `SELECT "nomeEscola", "faviconUrl", "directorGeral", "directorPedagogico" FROM public.config_geral ORDER BY id ASC LIMIT 1`,
      [],
    );
    const name = rows[0]?.nomeEscola;
    if (name && String(name).trim()) {
      cachedSchoolName = String(name).trim();
    }
    const fav = rows[0]?.faviconUrl;
    cachedFaviconUrl = fav ? String(fav).trim() : "";
    cachedFaviconAt = Date.now();

    const dir = rows[0]?.directorGeral;
    cachedDirectorGeral = dir ? String(dir).trim() : "";

    const dirPed = rows[0]?.directorPedagogico;
    cachedDirectorPedagogico = dirPed ? String(dirPed).trim() : "";
  } catch {
    // ignorar — manter valor em cache
  } finally {
    cachedSchoolNameAt = Date.now();
  }
}

export function getSchoolNameSync(): string {
  if (Date.now() - cachedSchoolNameAt > SCHOOL_NAME_TTL_MS) {
    void refreshSchoolName();
  }
  return cachedSchoolName;
}

export function getFaviconUrlSync(): string {
  if (Date.now() - cachedFaviconAt > SCHOOL_NAME_TTL_MS) {
    void refreshSchoolName();
  }
  return cachedFaviconUrl;
}

export function getDirectorGeralSync(): string {
  if (Date.now() - cachedSchoolNameAt > SCHOOL_NAME_TTL_MS) {
    void refreshSchoolName();
  }
  return cachedDirectorGeral;
}

export function getDirectorPedagogicoSync(): string {
  if (Date.now() - cachedSchoolNameAt > SCHOOL_NAME_TTL_MS) {
    void refreshSchoolName();
  }
  return cachedDirectorPedagogico;
}

export function invalidateSchoolNameCache(): void {
  cachedSchoolNameAt = 0;
  cachedFaviconAt = 0;
}
