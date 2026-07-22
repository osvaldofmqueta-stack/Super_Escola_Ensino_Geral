/**
 * lib/escalaNotas.ts — Módulo central de conversão de escalas de avaliações
 *
 * Princípio: o professor lança na escala configurada pela escola
 * (ex.: 1–5, 0–10, 0–20). O sistema converte sempre para a escala
 * canónica 0–20 (oficial MED Angola) para todos os cálculos
 * (MAC, NT, NF, aprovação, boletins, pautas).
 *
 * Existem duas interpretações possíveis para escalas que não começam em zero:
 *  - 'proporcional': valor / macMax × 20  (ex.: 1→4, 5→20) — convenção informal
 *    usada pela maioria das escolas que dizem "multiplico por 4".
 *  - 'linear':       (valor − macMin)/(macMax − macMin) × 20  (ex.: 1→0, 5→20)
 *    — interpretação matemática estrita; o mínimo equivale a zero.
 *
 * Este módulo é partilhado entre cliente (app/) e servidor (server/).
 */

export type TipoEscala = 'proporcional' | 'linear';

export interface EscalaConfig {
  macMin: number;
  macMax: number;
  tipoEscala?: TipoEscala;
}

/** Limita um valor ao intervalo [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Arredonda a uma casa decimal. */
export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Devolve a configuração com defaults aplicados. */
export function escalaCfg(cfg: Partial<EscalaConfig> | null | undefined): Required<EscalaConfig> {
  const macMin = Math.max(0, cfg?.macMin ?? 1);
  const macMaxRaw = cfg?.macMax ?? 5;
  const macMax = macMaxRaw > macMin ? macMaxRaw : macMin + 1;
  const tipoEscala: TipoEscala = (cfg?.tipoEscala === 'linear' ? 'linear' : 'proporcional');
  return { macMin, macMax, tipoEscala };
}

/**
 * Valida e limita um valor lançado em A1..A8 ao intervalo permitido pela escola.
 * Retorna 0 quando o input está vazio/inválido (0 = "não lançado").
 */
export function parseAval(input: string | number, cfg: Partial<EscalaConfig>): number {
  const { macMin, macMax } = escalaCfg(cfg);
  const n = typeof input === 'number' ? input : parseFloat(String(input).replace(',', '.'));
  if (!isFinite(n) || n === 0) return 0;
  return clamp(n, Math.max(0, macMin), macMax);
}

/**
 * Converte um valor da escala bruta (macMin..macMax) para a escala canónica 0–20.
 * Se a escala já for 0–20, devolve o próprio valor.
 */
export function toCanonica(valor: number, cfg: Partial<EscalaConfig>): number {
  const { macMin, macMax, tipoEscala } = escalaCfg(cfg);
  if (!isFinite(valor) || valor <= 0) return 0;
  if (macMax >= 20 && macMin <= 0) return clamp(valor, 0, 20);
  if (tipoEscala === 'linear') {
    const span = macMax - macMin;
    if (span <= 0) return 0;
    return clamp(((valor - macMin) / span) * 20, 0, 20);
  }
  // proporcional
  return clamp((valor / macMax) * 20, 0, 20);
}

/**
 * Converte um valor da escala canónica 0–20 de volta à escala bruta da escola
 * (apenas para apresentação informal; nunca usar em cálculos oficiais).
 */
export function toApresentacao(valor20: number, cfg: Partial<EscalaConfig>): number {
  const { macMin, macMax, tipoEscala } = escalaCfg(cfg);
  if (!isFinite(valor20) || valor20 <= 0) return 0;
  if (macMax >= 20 && macMin <= 0) return clamp(valor20, 0, 20);
  if (tipoEscala === 'linear') {
    return clamp(macMin + (valor20 / 20) * (macMax - macMin), macMin, macMax);
  }
  return clamp((valor20 / 20) * macMax, 0, macMax);
}

/**
 * Calcula a média MAC já em escala 0–20 a partir das avaliações brutas A1..A8.
 * Valores 0 são tratados como "não lançados" e ignorados na média.
 */
export function calcMacCanonica(avaisBrutas: number[], cfg: Partial<EscalaConfig>): number {
  const validas = avaisBrutas.filter(v => v > 0);
  if (validas.length === 0) return 0;
  const escaladas = validas.map(v => toCanonica(v, cfg));
  const media = escaladas.reduce((a, b) => a + b, 0) / escaladas.length;
  return round1(media);
}

/** Descrição legível do modo de escala (para UI/PDF). */
export function descreverEscala(cfg: Partial<EscalaConfig>): string {
  const { macMin, macMax, tipoEscala } = escalaCfg(cfg);
  if (macMax >= 20 && macMin <= 0) return 'Escala 0–20 (directa, sem conversão)';
  const factor = tipoEscala === 'proporcional' ? (20 / macMax).toFixed(2) : null;
  if (tipoEscala === 'proporcional') {
    return `Escala ${macMin}–${macMax} proporcional (multiplica por ${factor} para 0–20)`;
  }
  return `Escala ${macMin}–${macMax} linear (mínimo = 0, máximo = 20)`;
}
