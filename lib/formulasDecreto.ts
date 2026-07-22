/**
 * lib/formulasDecreto.ts — Fórmulas de avaliação conforme Decreto Executivo nº 04/2026
 * (Regulamento da Avaliação das Aprendizagens — RAA — Ensino Geral Angola)
 *
 * Fonte: Anexo III do Decreto (fórmulas de cálculo das médias)
 *
 * Nomenclatura do Decreto:
 *  MAC   — Média de Avaliações Contínuas (média das fichas A1..An na escala 0–20)
 *  NPT   — Nota da Prova Trimestral (prova do professor, 0–20)
 *  MT    — Média Trimestral = (MAC + NPT) / 2  [pesos configuráveis, padrão 50/50]
 *  MACT₃ — MAC do 3º trimestre apenas (sem NPT, para classes de exame)
 *  NEN   — Nota do Exame Nacional (0–20)
 *  MENC  — Média do Exame Nacional Combinado (quando há 2 provas: EX1+EX2)/2
 *  MFD   — Média Final da Disciplina (resultado anual)
 */

import { round1 } from './escalaNotas';

// ─── Média Trimestral ────────────────────────────────────────────────────────

/**
 * MT = MAC × percMac% + NPT × (100−percMac)%
 * Padrão do Decreto: percMac = 50 → MT = (MAC + NPT) / 2
 * Fórmula configurável — Decreto Executivo nº 04/2026, Anexo III §2.
 *
 * @param mac      Média de Avaliações Contínuas, já convertida para escala 0–20
 * @param npt      Nota da Prova Trimestral (0–20)
 * @param percMac  Peso da MAC em percentagem (0–100), padrão 50
 */
export function calcMT_decreto(mac: number, npt: number, percMac = 50): number {
  const w = percMac / 100;
  return round1(mac * w + npt * (1 - w));
}

// ─── MFD por tipo de classe ──────────────────────────────────────────────────

/**
 * MFD para classes de TRANSIÇÃO (7ª, 8ª, 10ª, 11ª):
 *   MFD = (MT₁ + MT₂ + MT₃) / 3
 * Decreto Anexo III §3 — média aritmética simples (não configurável).
 */
export function calcMFD_transicao(mt1: number, mt2: number, mt3: number): number {
  return round1((mt1 + mt2 + mt3) / 3);
}

/**
 * MFD para disciplinas NÃO-NUCLEARES em classes de exame (6ª, 9ª, 12ª):
 *   MFD = (MT₁ + MT₂ + MACT₃) / 3
 * Decreto Anexo III §5.
 *
 * @param mt1   Média Trimestral do 1º trimestre
 * @param mt2   Média Trimestral do 2º trimestre
 * @param mact3 Média de Avaliações Contínuas do 3º trimestre (sem NPT)
 */
export function calcMFD_semExame(mt1: number, mt2: number, mact3: number): number {
  return round1((mt1 + mt2 + mact3) / 3);
}

/**
 * MFD para disciplinas NUCLEARES na 6ª e 9ª classe (com Exame Nacional):
 *   MT₃  = (MT₁ + MT₂ + MACT₃) / 3
 *   MFD  = MT₃ × percMT3% + NEN × (100−percMT3)%
 * Padrão do Decreto: percMT3 = 60 → MFD = 0,6×MT₃ + 0,4×NEN
 * Decreto Anexo III §4a.
 *
 * @param mt1      MT do 1º trimestre
 * @param mt2      MT do 2º trimestre
 * @param mact3    MAC do 3º trimestre (sem NPT)
 * @param nen      Nota do Exame Nacional
 * @param percMT3  Peso do MT₃ em percentagem (0–100), padrão 60
 */
export function calcMFD_9a_nuclear(mt1: number, mt2: number, mact3: number, nen: number, percMT3 = 60): number {
  const mt3 = round1((mt1 + mt2 + mact3) / 3);
  const w = percMT3 / 100;
  return round1(w * mt3 + (1 - w) * nen);
}

/**
 * MFD para disciplinas NUCLEARES na 12ª classe (com Exame Nacional):
 *   MT₃  = (MT₁ + MT₂ + MACT₃) / 3
 *   MFD  = MT₃ × percMT3% + NEN × (100−percMT3)%
 * Padrão do Decreto: percMT3 = 50 → MFD = 0,5×MT₃ + 0,5×NEN
 * Decreto Anexo III §4c.
 *
 * @param mt1      MT do 1º trimestre
 * @param mt2      MT do 2º trimestre
 * @param mact3    MAC do 3º trimestre (sem NPT)
 * @param nen      Nota do Exame Nacional
 * @param percMT3  Peso do MT₃ em percentagem (0–100), padrão 50
 */
export function calcMFD_12a_nuclear(mt1: number, mt2: number, mact3: number, nen: number, percMT3 = 50): number {
  const mt3 = round1((mt1 + mt2 + mact3) / 3);
  const w = percMT3 / 100;
  return round1(w * mt3 + (1 - w) * nen);
}

// ─── Função principal (selecciona automaticamente a fórmula correta) ──────────

/**
 * Calcula a Nota do Exame Nacional (NEN) conforme a classe:
 *  - 6ª/9ª:  NEN = ex1  (uma única prova)
 *  - 12ª:    NEN = (ex1 + ex2) / 2  (duas provas — só se ex2 > 0; caso contrário usa ex1)
 * Decreto 04/2026 Anexo III §4.
 */
export function calcNEN(ex1: number, ex2: number, classeNum: number): number {
  if (classeNum === 12 && ex2 > 0) {
    return round1((ex1 + ex2) / 2);
  }
  return ex1;
}

/** Pesos configuráveis passados ao calcMFD_auto */
export interface DecretoWeights {
  percMT3Exame9a?: number;   // padrão 60
  percMT3Exame12a?: number;  // padrão 50
}

/**
 * Calcula o MFD usando a fórmula correcta conforme Decreto 04/2026,
 * baseada no número da classe e no flag nuclear da disciplina.
 *
 * @param mt1        MT do 1º trimestre (ou 0 se não disponível)
 * @param mt2        MT do 2º trimestre (ou 0 se não disponível)
 * @param mt3OrMact3 MT ou MACT₃ do 3º trimestre
 * @param nen        Nota do Exame Nacional (0 se não aplicável)
 * @param nuclear    true se a disciplina tem Exame Nacional
 * @param classeNum  Número da classe (ex: 9, 12, 10, 11…)
 * @param weights    Pesos configuráveis (percMT3Exame9a, percMT3Exame12a)
 * @returns          MFD arredondado a 1 casa decimal
 */
export function calcMFD_auto(
  mt1: number,
  mt2: number,
  mt3OrMact3: number,
  nen: number,
  nuclear: boolean,
  classeNum: number,
  weights?: DecretoWeights,
): number {
  const isExameClass = classeNum === 6 || classeNum === 9 || classeNum === 12;

  if (!isExameClass || !nuclear || nen <= 0) {
    return calcMFD_transicao(mt1, mt2, mt3OrMact3);
  }

  if (classeNum === 6 || classeNum === 9) {
    return calcMFD_9a_nuclear(mt1, mt2, mt3OrMact3, nen, weights?.percMT3Exame9a ?? 60);
  }

  return calcMFD_12a_nuclear(mt1, mt2, mt3OrMact3, nen, weights?.percMT3Exame12a ?? 50);
}

/**
 * Extrai o número da classe a partir de string como "9ª Classe" → 9.
 * Retorna 0 se não conseguir extrair.
 */
export function classeParaNum(classe?: string | null): number {
  if (!classe) return 0;
  const m = classe.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Verifica se a classe é de Exame Nacional (6ª, 9ª, 12ª, Módulo 3, 2º ano EJA).
 * Decreto Executivo nº 04/2026, Anexo III §4 e Anexo V.
 */
export function isClasseExame(classe?: string | null): boolean {
  if (!classe) return false;
  const n = classeParaNum(classe);
  if (n === 6 || n === 9 || n === 12) return true;
  // EJA: Módulo 3 e 2º ano da EJA têm Exame Nacional (Decreto Anexo III §4a-b)
  const s = classe.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/modulo\s*3/.test(s)) return true;
  // Aceita: "2º EJA", "2o EJA", "2 EJA", "2° ano EJA", "2 ano EJA", "2.º ano EJA"
  if (/eja/.test(s) && /\b2[o°º.]?\s*(ano\s*)?(?=eja|\b)/.test(s)) return true;
  if (/eja/.test(s) && /\b2\b/.test(s)) return true;
  return false;
}

/**
 * Verifica se a classe é a 9ª (Exame Nacional do I Ciclo).
 */
export function is9aClasseExame(classe?: string | null): boolean {
  return classeParaNum(classe) === 9;
}

/**
 * Verifica se a classe é a 12ª (Exame Nacional do II Ciclo).
 */
export function is12aClasseExame(classe?: string | null): boolean {
  return classeParaNum(classe) === 12;
}
