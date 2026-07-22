/**
 * Helpers para cálculo inteligente de ano lectivo e trimestres.
 * Angola (MED): ano lectivo começa em Setembro (mês 9) e termina em Julho/Agosto.
 *
 * Formato canónico do ano: "2025/2026"
 * Formato alternativo (BD legada): "2025-2026"
 *
 * REGRA FUNDAMENTAL:
 *   - Ano civil   → único número inteiro (ex: 2026) — usado apenas para
 *     operações que são intrínsecamente civis (datas de nascimento, meses
 *     de processamento salarial, numeração sequencial de documentos).
 *   - Ano lectivo → string "YYYY/YYYY" (ex: "2025/2026") — usado em TUDO
 *     o que diz respeito a registos académicos: turmas, matrículas,
 *     propinas, notas, sumários, relatórios e exportações.
 */

export const MES_INICIO_PADRAO = 9;

export type AnoLetivoStr = `${number}/${number}`;

export interface TrimestreRange {
  numero: 1 | 2 | 3;
  dataInicio: string;
  dataFim: string;
  dataInicioExames?: string;
  dataFimExames?: string;
  ativo: boolean;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Devolve a string do ano lectivo correspondente a uma data,
 * considerando o mês em que o ano lectivo começa.
 * Ex.: hoje = 2026-10-05, mesInicio = 9 → "2026/2027"
 *      hoje = 2026-04-05, mesInicio = 9 → "2025/2026"
 */
export function anoLetivoDe(date: Date = new Date(), mesInicio: number = MES_INICIO_PADRAO): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const inicio = m >= mesInicio ? y : y - 1;
  return `${inicio}/${inicio + 1}`;
}

/**
 * Alias claro: devolve o ano lectivo correspondente a HOJE.
 * Nunca devolve um ano civil simples — sempre "YYYY/YYYY".
 */
export function anoLetivoDeHoje(mesInicio: number = MES_INICIO_PADRAO): string {
  return anoLetivoDe(new Date(), mesInicio);
}

/**
 * Normaliza variantes do ano lectivo para o formato canónico "YYYY/YYYY".
 * Aceita: "2025/2026", "2025-2026", "2025", 2025
 * Também reconhece IDs internos de anos académicos como "aa-2025-2026" ou "ano-2024-2025".
 * Devolve sempre "YYYY/YYYY" ou "" se inválido.
 */
export function normalizeAnoLetivo(raw: string | number | null | undefined): string {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  // Já está no formato correcto
  if (/^\d{4}\/\d{4}$/.test(s)) return s;
  // Formato com hífen simples: "2025-2026"
  if (/^\d{4}-\d{4}$/.test(s)) return s.replace('-', '/');
  // IDs internos como "aa-2025-2026", "ano-2024-2025", "1781754853461vtzv0"
  // — extrai o padrão YYYY-YYYY ou YYYY/YYYY onde quer que apareça na string
  const yearPair = s.match(/(\d{4})[-\/](\d{4})/);
  if (yearPair) return `${yearPair[1]}/${yearPair[2]}`;
  // Só o ano de início
  const n = parseInt(s, 10);
  if (Number.isFinite(n) && n >= 1900 && n <= 2100) return `${n}/${n + 1}`;
  return '';
}

/**
 * Extrai o ano civil de início a partir de uma string "YYYY/YYYY", "YYYY-YYYY" ou "YYYY".
 */
export function anoInicioDe(anoLetivo: string | number): number {
  const s = String(anoLetivo || '').trim();
  const part = s.split(/[\/\-]/)[0];
  const n = parseInt(part, 10);
  // Fallback: calcula a partir da data actual — NUNCA usa getFullYear() directamente
  return Number.isFinite(n) ? n : anoInicioDe(anoLetivoDeHoje());
}

/**
 * Verifica se uma string de ano lectivo corresponde à mesma referência académica
 * (trata "/" e "-" como equivalentes, e aceita match parcial com o ano de início).
 * Útil para queries ILIKE no servidor.
 */
export function anoLetivoMatch(a: string, b: string): boolean {
  const norm = (s: string) => normalizeAnoLetivo(s);
  if (norm(a) && norm(b)) return norm(a) === norm(b);
  // Fallback: comparação raw com tratamento de separador
  return a.replace(/[-]/g, '/') === b.replace(/[-]/g, '/');
}

/**
 * Calcula a data padrão de início e fim do ano lectivo dado o mês de início.
 * Default Angola: 15/Set → 31/Jul.
 */
export function rangeAnoPadrao(anoLetivo: string, mesInicio: number = MES_INICIO_PADRAO): { dataInicio: string; dataFim: string } {
  const yIni = anoInicioDe(anoLetivo);
  const yFim = yIni + 1;
  if (mesInicio === 1) {
    return { dataInicio: ymd(yIni, 1, 8), dataFim: ymd(yIni, 12, 15) };
  }
  return {
    dataInicio: ymd(yIni, mesInicio, 15),
    dataFim: ymd(yFim, 7, 31),
  };
}

/**
 * Devolve os 3 trimestres com datas inteligentes (modelo Angola MED) a partir
 * do ano lectivo e do mês de início. Se mesInicio = 1 (ano civil), usa um
 * esquema alternativo Jan–Abr / Mai–Ago / Set–Dez.
 */
export function defaultTrimestres(anoLetivo: string, mesInicio: number = MES_INICIO_PADRAO): TrimestreRange[] {
  const yIni = anoInicioDe(anoLetivo);
  const yFim = yIni + 1;

  if (mesInicio === 1) {
    return [
      { numero: 1, dataInicio: ymd(yIni, 1, 8),  dataFim: ymd(yIni, 4, 15), ativo: false },
      { numero: 2, dataInicio: ymd(yIni, 5, 2),  dataFim: ymd(yIni, 8, 15), ativo: false },
      { numero: 3, dataInicio: ymd(yIni, 9, 1),  dataFim: ymd(yIni, 12, 15), ativo: false },
    ];
  }

  // Modelo Angola MED (Setembro → Julho)
  return [
    { numero: 1, dataInicio: ymd(yIni, 9, 15), dataFim: ymd(yIni, 12, 20), ativo: false },
    { numero: 2, dataInicio: ymd(yFim, 1, 5),  dataFim: ymd(yFim, 4, 5),   ativo: false },
    { numero: 3, dataInicio: ymd(yFim, 4, 15), dataFim: ymd(yFim, 7, 25),  ativo: false },
  ];
}

/**
 * Sugere o próximo ano lectivo a criar dado o conjunto existente.
 * Se não houver nenhum, devolve o ano lectivo correspondente a hoje.
 */
export function sugerirProximoAno(anosExistentes: string[], mesInicio: number = MES_INICIO_PADRAO): string {
  if (!anosExistentes.length) return anoLetivoDeHoje(mesInicio);
  const maxIni = anosExistentes.reduce((acc, s) => Math.max(acc, anoInicioDe(s)), 0);
  return `${maxIni + 1}/${maxIni + 2}`;
}
