/**
 * Utilitários para normalização e comparação do campo `ano` de pagamentos.
 *
 * Problema: a BD tem formatos misturados — "2026", "2025/2026", "2025", "2024/2025".
 * Solução: canonical = ano civil de 4 dígitos ("2026").
 *   - Escrita: normalizeAnoPagamento() converte qualquer formato antes de guardar.
 *   - Leitura: matchAno() compara ignorando o formato.
 */

/**
 * Normaliza o campo `ano` de um pagamento para o formato canónico:
 * ano civil de 4 dígitos ("2026").
 *
 * Exemplos:
 *   "2025/2026" → "2026"   (toma o segundo ano do par académico)
 *   "2024/2025" → "2025"
 *   "2026"      → "2026"   (já correcto)
 *   "2025"      → "2025"   (já correcto)
 */
export function normalizeAnoPagamento(ano: string | number | null | undefined): string {
  const s = String(ano ?? '').trim();
  // Formato "YYYY/YYYY" — toma o segundo (ano de fim do ano lectivo)
  const parts = s.match(/^(\d{4})\/(\d{4})$/);
  if (parts) return parts[2];
  // Já é um ano de 4 dígitos
  if (/^\d{4}$/.test(s)) return s;
  // Fallback — devolve o primeiro bloco de 4 dígitos encontrado
  const m = s.match(/\d{4}/);
  return m ? m[0] : s;
}

/**
 * Compara o campo `ano` de um pagamento (qualquer formato) com um ano alvo
 * (também qualquer formato). Devolve true se houver pelo menos um ano civil
 * em comum entre os dois strings.
 *
 * Exemplos:
 *   matchAno("2025/2026", "2026")     → true
 *   matchAno("2026", "2025/2026")     → true
 *   matchAno("2025", "2025/2026")     → true
 *   matchAno("2025", "2026")          → false
 *   matchAno("2024/2025", "2026")     → false
 */
export function matchAno(pAno: string, targetAno: string): boolean {
  if (!pAno || !targetAno) return false;
  if (pAno === targetAno) return true;
  const pYears = String(pAno).match(/\d{4}/g) ?? [];
  const tYears = String(targetAno).match(/\d{4}/g) ?? [];
  return tYears.some(y => pYears.includes(y));
}
