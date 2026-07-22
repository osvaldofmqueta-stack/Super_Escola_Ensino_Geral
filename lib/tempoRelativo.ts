/**
 * tempoRelativo — formata datas/timestamps em linguagem natural (pt-PT).
 *
 * Usa comparação por DIA DE CALENDÁRIO (não apenas diferença em horas),
 * por isso "Ontem às 13:10" aparece mesmo que tenham passado menos de 24h.
 */

function meiaDia(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function calDiff(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86400000);
}

/**
 * Formato longo — usado em notificações, mensagens, portal.
 * Ex: "Agora mesmo", "Há 5 min", "Hoje às 14:30", "Ontem às 13:10",
 *     "Anteontem às 09:00", "Há 4 dias", "12/03/2025"
 */
export function tempoRelativo(dateStr: string): string {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const dias = calDiff(dateStr);

  if (mins < 1) return 'Agora mesmo';
  if (mins < 60) return `Há ${mins} min`;
  if (dias === 0) return `Hoje às ${meiaDia(dateStr)}`;
  if (dias === 1) return `Ontem às ${meiaDia(dateStr)}`;
  if (dias === 2) return `Anteontem às ${meiaDia(dateStr)}`;
  if (dias < 7) return `Há ${dias} dias`;
  return new Date(dateStr).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Formato curto — usado em listas de chat/conversas (sidebar).
 * Ex: "14:30" (hoje), "Ontem", "Anteontem", "Seg", "12/03"
 */
export function labelData(dateStr: string): string {
  if (!dateStr) return '';
  const dias = calDiff(dateStr);

  if (dias === 0) return meiaDia(dateStr);
  if (dias === 1) return 'Ontem';
  if (dias === 2) return 'Anteontem';
  if (dias < 7) return new Date(dateStr).toLocaleDateString('pt-PT', { weekday: 'short' });
  return new Date(dateStr).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
}

/**
 * Formato de data legível completa — sem hora relativa.
 * Ex: "07 de maio de 2026"
 */
export function dataLegivel(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
}

/**
 * Grupo de data para separadores em listas.
 * Ex: "Hoje", "Ontem", "Anteontem", "07 de maio de 2026"
 */
export function grupoData(dateStr: string): string {
  if (!dateStr) return '';
  const dias = calDiff(dateStr);
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  if (dias === 2) return 'Anteontem';
  return dataLegivel(dateStr);
}
