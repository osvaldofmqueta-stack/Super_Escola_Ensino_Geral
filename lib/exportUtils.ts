import * as XLSX from 'xlsx';
import { Platform } from 'react-native';

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

export interface ExportSchoolInfo {
  nomeEscola: string;
  anoLetivo?: string;
  directorGeral?: string;
}

function hoje(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function hojeFilename(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export function exportToExcel(
  title: string,
  columns: ExportColumn[],
  rows: Record<string, any>[],
  filename?: string,
  school?: ExportSchoolInfo,
): void {
  if (Platform.OS !== 'web') return;

  const wb = XLSX.utils.book_new();

  const metaRows: string[][] = [];
  if (school?.nomeEscola) metaRows.push([school.nomeEscola]);
  metaRows.push([title]);
  if (school?.anoLetivo) metaRows.push([`Ano Lectivo: ${school.anoLetivo}`]);
  metaRows.push([`Emitido em: ${hoje()}`]);
  metaRows.push([]);

  const headers = columns.map(c => c.header);
  const dataRows = rows.map(row => columns.map(c => row[c.key] ?? ''));

  const wsData = [...metaRows, headers, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const headerRowIndex = metaRows.length;
  const colWidths = columns.map(c => ({ wch: c.width ?? Math.max(c.header.length + 4, 16) }));
  ws['!cols'] = colWidths;

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cellAddr = XLSX.utils.encode_cell({ r: headerRowIndex, c: C });
    if (!ws[cellAddr]) continue;
    ws[cellAddr].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1A2B5F' } },
      alignment: { horizontal: 'center' },
    };
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Dados');

  const safeName = filename ?? `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${hojeFilename()}`;
  XLSX.writeFile(wb, `${safeName}.xlsx`);
}

export function exportToPDF(
  title: string,
  columns: ExportColumn[],
  rows: Record<string, any>[],
  school?: ExportSchoolInfo,
  options?: { landscape?: boolean; subtitle?: string },
): void {
  if (Platform.OS !== 'web') return;

  const landscape = options?.landscape ?? columns.length > 6;
  const nomeEscola = school?.nomeEscola ?? 'Escola';
  const anoLetivo = school?.anoLetivo ?? '';

  const theadCells = columns.map(c => `<th>${c.header}</th>`).join('');
  const tbodyRows = rows.map((row, i) => {
    const tds = columns.map(c => `<td>${row[c.key] ?? ''}</td>`).join('');
    return `<tr class="${i % 2 === 0 ? 'even' : ''}">${tds}</tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #111; background: #fff; padding: 12mm 14mm; }
  .doc-header { text-align: center; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid #1E3A5F; }
  .doc-header h1 { font-size: 14pt; font-weight: bold; color: #1E3A5F; margin-bottom: 3px; }
  .doc-header h2 { font-size: 11pt; font-weight: bold; color: #111; margin-bottom: 2px; }
  .doc-header p { font-size: 8.5pt; color: #555; }
  .meta-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 8pt; color: #444; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  thead tr th { background: #1E3A5F; color: #fff; padding: 6px 8px; font-size: 8.5pt; text-align: left; border: 1px solid #0D1F35; }
  tbody tr td { padding: 5px 8px; font-size: 8.5pt; border: 1px solid #ddd; vertical-align: top; }
  tbody tr.even td { background: #f4f6fb; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 7.5pt; color: #888; display: flex; justify-content: space-between; }
  .count-badge { display: inline-block; background: #1E3A5F; color: #fff; border-radius: 4px; padding: 2px 8px; font-size: 8pt; margin-bottom: 6px; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<div class="doc-header">
  <h1>${nomeEscola}</h1>
  <h2>${title}</h2>
  ${anoLetivo ? `<p>Ano Lectivo: ${anoLetivo}</p>` : ''}
  ${options?.subtitle ? `<p>${options.subtitle}</p>` : ''}
</div>
<div class="meta-row">
  <span>Emitido em: <strong>${hoje()}</strong></span>
  <span class="count-badge">Total: ${rows.length} registos</span>
</div>
<table>
  <thead><tr>${theadCells}</tr></thead>
  <tbody>${tbodyRows}</tbody>
</table>
${school?.directorGeral ? `
<div class="footer">
  <span>${nomeEscola}</span>
  <span>Director Geral: ${school.directorGeral}</span>
  <span>Página 1</span>
</div>` : `
<div class="footer">
  <span>${nomeEscola}</span>
  <span>${title} — ${hoje()}</span>
  <span>Total: ${rows.length} registos</span>
</div>`}
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}
