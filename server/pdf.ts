import { Request, Response, Express } from 'express';
import { query } from './db';
import { requireAuth } from './auth';
import { calcMacCanonica, type EscalaConfig } from '../lib/escalaNotas';
import { anoLetivoDe } from '../lib/anoLetivo';
import { garantirNumeracaoPagamento } from './saft';
import QRCode from 'qrcode';

const MESES = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const JSBARCODE_CDN = `<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>`;

function buildQRUrl(data: string, size = 120): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&bgcolor=ffffff&color=1a2b5f&margin=4&ecc=M`;
}

function safeBarcode(val: string): string {
  return (val || 'REF000').replace(/[^A-Z0-9\-\.\ \$\/\+\%]/gi, '').substring(0, 30) || 'REF000';
}

// Generate barcode as inline SVG using bwip-js (server-side, no CDN dependency)
// Note: bwip-js toSVG is synchronous — wrap in async for uniform call signature
async function buildLocalBarcodeSvg(value: string): Promise<string> {
  try {
    const bwipjs = await import('bwip-js');
    const bwip = (bwipjs as any).default ?? bwipjs;
    // toSVG is synchronous in bwip-js
    const svg: string = bwip.toSVG({
      bcid: 'code128',
      text: value,
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: 'center',
      textcolor: '1a2b5f',
      barcolor: '1a2b5f',
    });
    return typeof svg === 'string' ? svg : (svg as any).toString();
  } catch (e) {
    console.warn('[barcode] bwip-js failed:', (e as Error).message);
    return '';
  }
}

// Generate QR code as base64 data URL (local — no external API dependency)
async function buildLocalQRDataUrl(data: string, size = 120): Promise<string> {
  try {
    return await QRCode.toDataURL(data, {
      width: size,
      margin: 2,
      color: { dark: '#1a2b5f', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
  } catch {
    // fallback to external URL if local generation fails
    return buildQRUrl(data, size);
  }
}

function buildVerificationSection(opts: {
  barcodeId: string;
  barcodeValue: string;
  qrData: string;
  docRef: string;
  emitidoEm: string;
  emitidoPor?: string;
  qrDataUrl?: string;   // optional pre-built local QR
  barcodeSvg?: string;  // optional pre-built server-side barcode SVG
}): string {
  const qrSrc = opts.qrDataUrl || buildQRUrl(opts.qrData, 110);
  const bc = safeBarcode(opts.barcodeValue);
  // Use pre-generated server-side SVG when available; fall back to JsBarcode CDN
  const barcodeHtml = opts.barcodeSvg
    ? `<div style="overflow:hidden;display:flex;align-items:center;justify-content:center;max-width:100%;height:60px">${opts.barcodeSvg}</div>`
    : `<svg id="bc-${opts.barcodeId}" class="verif-svg"></svg>`;
  const barcodeScript = opts.barcodeSvg ? '' : `
<script>
window.addEventListener('load', function() {
  try {
    if(typeof JsBarcode !== 'undefined') JsBarcode('#bc-${opts.barcodeId}', '${bc}', {
      format: 'CODE128', width: 1.8, height: 45, displayValue: true,
      fontSize: 10, margin: 3, background: 'transparent',
      lineColor: '#1a2b5f', fontOptions: 'bold',
    });
  } catch(e) { var el = document.getElementById('bc-${opts.barcodeId}'); if(el) el.style.display='none'; }
});
</script>`;
  return `
<div class="verif-section" id="vs-${opts.barcodeId}">
  <div class="verif-qr">
    <img src="${qrSrc}" alt="QR Verificação" onerror="this.style.display='none'" />
    <div class="verif-qr-lbl">QR Verificação</div>
  </div>
  <div class="verif-bar">
    ${barcodeHtml}
    <div class="verif-bar-lbl">Código de Barras</div>
  </div>
  <div class="verif-info">
    <strong>Ref.:</strong> ${opts.docRef}<br>
    <strong>Emitido:</strong> ${opts.emitidoEm}<br>
    ${opts.emitidoPor ? `<strong>Por:</strong> ${opts.emitidoPor}<br>` : ''}
    <span style="font-size:7.5pt;color:#9ca3af">Documento autêntico verificável pelo QR</span>
  </div>
</div>${barcodeScript}`;
}

const VERIF_CSS = `
.verif-section{display:flex;gap:16px;align-items:center;margin:14px 0 8px;padding:10px 12px;border:1px solid #dde0ef;border-radius:8px;background:#f9faff}
.verif-qr{text-align:center;flex-shrink:0}
.verif-qr img{width:100px;height:100px;border:1px solid #dde;border-radius:4px}
.verif-qr-lbl{font-size:7.5pt;text-transform:uppercase;color:#888;margin-top:3px;letter-spacing:.5px}
.verif-bar{flex:1;text-align:center}
.verif-svg{max-width:100%;height:60px}
.verif-bar-lbl{font-size:7.5pt;text-transform:uppercase;color:#888;margin-top:2px;letter-spacing:.5px}
.verif-info{flex:1.2;font-size:9pt;line-height:1.8;color:#555}
.verif-info strong{color:#1a2b5f}
@media print{.verif-section{break-inside:avoid}}
`;

const METODO_LABEL: Record<string, string> = {
  dinheiro:            'Dinheiro',
  transferencia:       'Transferência / RUPE',
  referencia_bancaria: 'RUPE / Referência Bancária',
  rupe:                'RUPE / AGT',
  multicaixa:          'Multicaixa Express',
  multicaixa_express:  'Multicaixa Express',
  cartao:              'Cartão Bancário',
};

function buildMetodoBadge(metodo: string): string {
  const cfg: Record<string, { label: string; bg: string; color: string; border: string }> = {
    dinheiro:            { label: 'Dinheiro',               bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
    transferencia:       { label: 'Transferência / RUPE',   bg: '#dbeafe', color: '#1e3a8a', border: '#93c5fd' },
    referencia_bancaria: { label: 'RUPE / Ref. Bancária',   bg: '#dbeafe', color: '#1e3a8a', border: '#93c5fd' },
    rupe:                { label: 'RUPE / AGT',             bg: '#dbeafe', color: '#1e3a8a', border: '#93c5fd' },
    multicaixa:          { label: 'Multicaixa Express',     bg: '#dcfce7', color: '#14532d', border: '#86efac' },
    multicaixa_express:  { label: 'Multicaixa Express',     bg: '#dcfce7', color: '#14532d', border: '#86efac' },
    cartao:              { label: 'Cartão Bancário',        bg: '#f3e8ff', color: '#581c87', border: '#d8b4fe' },
  };
  const c = cfg[metodo] || { label: METODO_LABEL[metodo] || metodo || '—', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
  return `<span style="display:inline-block;padding:2px 10px;border-radius:10px;font-size:8.5pt;font-weight:700;background:${c.bg};color:${c.color};border:1px solid ${c.border};letter-spacing:0.3px">${c.label}</span>`;
}

const TIPO_LABEL: Record<string, string> = {
  propina: 'Propina',
  matricula: 'Matrícula',
  material: 'Material Didáctico',
  exame: 'Exame',
  multa: 'Multa',
  outro: 'Outro',
};

function fmtDate(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  } catch { return iso; }
}

function fmtMoney(n: number): string {
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtAOA(v: number): string {
  return `${v.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;
}

const MESES_SHORT_EXT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_LONG_EXT  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const METODO_LABEL_EXT: Record<string, string> = {
  dinheiro: 'Dinheiro', transferencia: 'Transferência / RUPE', referencia_bancaria: 'RUPE / Ref. Bancária',
  rupe: 'RUPE / AGT', multicaixa: 'Multicaixa Express', multicaixa_express: 'Multicaixa Express', cartao: 'Cartão Bancário',
};
const TIPO_LABEL_EXT: Record<string, string> = {
  propina: 'Propina', matricula: 'Matrícula', material: 'Material', exame: 'Exame', multa: 'Multa', outro: 'Outro',
};

function docRefExtrato(matricula: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const m = (matricula || 'X').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
  return `EXTR-${m}-${ts}`;
}

function buildExtratoHTML(opts: {
  aluno: any;
  pagamentos: any[];
  resumo: { totalPago: number; totalPendente: number; totalCancelado: number; total: number };
  filtros: { dataInicio: string | null; dataFim: string | null };
  nomeEscola?: string;
  directorGeral?: string;
  chefeSecretaria?: string;
  autoprint?: boolean;
}): string {
  const { aluno, pagamentos, resumo, filtros } = opts;
  const escola     = opts.nomeEscola    || 'Escola Secundária';
  const director   = opts.directorGeral || '___________________________';
  const chefeSec   = opts.chefeSecretaria || '___________________________';
  const docId      = docRefExtrato(aluno.numeroMatricula || aluno.id || '');
  const now        = new Date();
  const dataEmissao = now.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
  const hora        = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

  function fmtDateLocal(d: string): string {
    if (!d) return '—';
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
  }

  function mesLabel(mes?: number | null): string {
    if (!mes) return '';
    return MESES_SHORT_EXT[(mes - 1) % 12] || '';
  }

  const periodoLabel = filtros.dataInicio
    ? `${fmtDateLocal(filtros.dataInicio)} a ${fmtDateLocal(filtros.dataFim || 'Presente')}`
    : 'Todos os pagamentos registados';

  const qrLines = [
    `DOC: ${docId}`,
    `ESCOLA: ${escola}`,
    `ALUNO: ${aluno.nome || ''} ${aluno.apelido || ''}`.trim(),
    `MATRICULA: ${aluno.numeroMatricula || 'N/D'}`,
    `TURMA: ${aluno.turmaNome || 'N/D'}`,
    `TOTAL PAGO: ${fmtAOA(resumo.totalPago)}`,
    `PENDENTE: ${fmtAOA(resumo.totalPendente)}`,
    `TRANSACCOES: ${resumo.total}`,
    `EMITIDO: ${dataEmissao}`,
    filtros.dataInicio ? `PERIODO: ${fmtDateLocal(filtros.dataInicio)} a ${fmtDateLocal(filtros.dataFim || 'Presente')}` : 'PERIODO: Todos',
  ].join('\n');

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(qrLines)}&bgcolor=ffffff&color=1a2540&margin=6&ecc=M`;
  const barcodeVal = safeBarcode(aluno.numeroMatricula || 'REF000');

  const rows = pagamentos.map((p: any, idx: number) => {
    const descricao = [
      p.taxaDescricao || TIPO_LABEL_EXT[p.taxaTipo || ''] || (p.taxaTipo || ''),
      p.mes ? mesLabel(p.mes) : '',
      p.ano || '',
    ].filter(Boolean).join(' · ');
    const statusStyle = p.status === 'pago'
      ? 'color:#1a6b2a;background:#d4edda;'
      : p.status === 'pendente' ? 'color:#856404;background:#fff3cd;' : 'color:#6c757d;background:#e2e3e5;';
    const valor = p.status === 'cancelado'
      ? `<span style="color:#aaa;text-decoration:line-through;">${fmtAOA(Number(p.valor || 0))}</span>`
      : `<strong style="color:${p.status === 'pago' ? '#1a6b2a' : '#856404'};">${fmtAOA(Number(p.valor || 0))}</strong>`;
    const bg = idx % 2 === 0 ? '#fff' : '#f9f9ff';
    const ref = [p.referencia ? `Ref: ${p.referencia}` : '', p.observacao || ''].filter(Boolean).join(' · ');
    return `<tr style="background:${bg};">
      <td style="padding:6px 8px;font-size:10px;color:#555;white-space:nowrap;">${fmtDateLocal(p.data)}</td>
      <td style="padding:6px 8px;font-size:10px;">
        <span style="font-weight:600;color:#1a2540;">${descricao}</span>
        ${ref ? `<br><span style="font-size:9px;color:#888;">${ref}</span>` : ''}
      </td>
      <td style="padding:6px 8px;font-size:10px;color:#555;">${METODO_LABEL_EXT[p.metodoPagamento] || p.metodoPagamento || '—'}</td>
      <td style="padding:6px 8px;text-align:right;white-space:nowrap;">${valor}</td>
      <td style="padding:4px 8px;text-align:center;">
        <span style="font-size:9px;font-weight:bold;padding:2px 6px;border-radius:4px;${statusStyle}">${(p.status || '').charAt(0).toUpperCase() + (p.status || '').slice(1)}</span>
      </td>
    </tr>`;
  }).join('');

  const nomeCompleto = `${aluno.nome || ''} ${aluno.apelido || ''}`.trim();

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Extracto de Propinas — ${nomeCompleto}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:11px;color:#111;background:#fff}
.page{max-width:210mm;margin:0 auto;padding:18mm 18mm 14mm;min-height:297mm;position:relative}
.btn-toolbar{display:flex;gap:10px;justify-content:center;margin:10px auto 16px}
.print-btn{display:inline-block;padding:10px 28px;background:#1a2540;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold}
.print-btn:hover{background:#2d3f6e}
.download-btn{display:inline-block;padding:10px 28px;background:#166534;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold}
.download-btn:hover{background:#14532d}
.doc-header{text-align:center;border-bottom:3px solid #1a2540;padding-bottom:12px;margin-bottom:14px}
.header-brasao{width:65px;height:auto;display:block;margin:0 auto 5px}
.header-rep{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#555;margin:0;line-height:1.6}
.escola-nome{font-size:14px;font-weight:800;color:#1a2540;text-transform:uppercase;letter-spacing:.5px;margin-top:4px}
.doc-header-title{text-align:center;margin-top:8px}
.titulo{font-size:13px;font-weight:800;color:#1a2540;text-transform:uppercase;letter-spacing:1px}
.docnum{font-size:9.5px;color:#888;margin-top:4px;font-family:monospace}
.periodo-badge{display:inline-block;margin-top:4px;background:#1a2540;color:#fff;padding:2px 8px;border-radius:10px;font-size:9px;letter-spacing:.5px}
.aluno-box{background:#f0f4ff;border:1px solid #c5d0ee;border-radius:8px;padding:10px 14px;margin-bottom:14px}
.aluno-name{font-size:15px;font-weight:800;color:#1a2540}
.aluno-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 14px;margin-top:8px}
.aluno-grid .field label{font-size:8.5px;text-transform:uppercase;color:#888;font-weight:600;letter-spacing:.5px;display:block}
.aluno-grid .field span{font-size:10.5px;font-weight:600;color:#1a2540}
.resumo-row{display:grid;grid-template-columns:repeat(3,1fr) 1fr;gap:8px;margin-bottom:14px}
.resumo-card{border-radius:8px;padding:8px 10px;text-align:center}
.val{font-size:13px;font-weight:800;display:block}
.lbl{font-size:8.5px;text-transform:uppercase;letter-spacing:.5px;display:block;margin-top:2px}
.card-pago{background:#d4edda;color:#155724}
.card-pend{background:#fff3cd;color:#856404}
.card-canc{background:#e2e3e5;color:#495057}
.card-total{background:#1a2540;color:#fff}
.section-title{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;color:#1a2540;margin-bottom:6px;padding-bottom:4px;border-bottom:1.5px solid #1a2540}
table{width:100%;border-collapse:collapse}
thead th{background:#1a2540;color:#fff;padding:7px 8px;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;text-align:left}
thead th:last-child{text-align:center}
thead th:nth-child(4){text-align:right}
tbody tr:last-child td{border-bottom:2px solid #1a2540}
.qr-bar-row{display:flex;gap:24px;align-items:center;margin:14px 0 10px;padding:12px;border:1px solid #dde0ef;border-radius:8px;background:#f9faff}
.qr-box{text-align:center}
.qr-box img{width:110px;height:110px;border:1px solid #dde;border-radius:4px}
.qr-lbl{font-size:8px;text-transform:uppercase;color:#888;margin-top:4px;letter-spacing:.5px}
.bar-box{flex:1;text-align:center}
.bar-box svg{max-width:100%;height:60px}
.bar-lbl{font-size:8px;text-transform:uppercase;color:#888;margin-top:2px;letter-spacing:.5px}
.doc-info{flex:1.2;font-size:9.5px;line-height:1.7;color:#555}
.doc-info strong{color:#1a2540}
.footer-totals{display:flex;justify-content:flex-end;margin-top:10px}
.totals-table{border:1px solid #dde;border-radius:8px;overflow:hidden;min-width:280px}
.tot-row{display:flex;justify-content:space-between;padding:5px 12px;font-size:10px}
.tot-row:not(:last-child){border-bottom:1px solid #eee}
.tot-grand{background:#1a2540;color:#fff;font-weight:800;font-size:11px}
.sig-section{display:flex;gap:20px;margin-top:20px;justify-content:space-between}
.sig-block{text-align:center;flex:1}
.sig-label{font-size:9px;font-weight:700;color:#333;text-transform:uppercase;margin-bottom:24px}
.sig-line{border-top:1px solid #333;margin:0 auto 4px;width:150px}
.sig-name{font-size:9px;font-weight:700;color:#1a2540}
.footer-note{margin-top:18px;border-top:1px dashed #ccc;padding-top:8px;font-size:8.5px;color:#aaa;text-align:center;line-height:1.7}
.no-print{display:block}
@media print{
  @page{size:A4 portrait;margin: 0}
  body{margin:0}
  .page{padding:0;max-width:100%}
  .no-print{display:none!important}
}
</style>
</head>
<body>
<div class="btn-toolbar no-print"><button class="print-btn" onclick="window.print()">🖨 Imprimir</button><button class="download-btn" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()">📥 Guardar</button></div>
<div class="page">
  <div class="doc-header">
    <img class="header-brasao" src="/angola-brasao.png" alt="Insígnia da República de Angola" onerror="this.style.display='none'"/>
    <p class="header-rep">REPÚBLICA DE ANGOLA</p>
    <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
    <p class="header-rep">ENSINO GERAL</p>
    <div class="escola-nome">${escola}</div>
    <div class="doc-header-title">
      <div class="titulo">Extracto de Propinas</div>
      <div class="docnum">${docId}</div>
      <div class="periodo-badge">Período: ${periodoLabel}</div>
    </div>
  </div>

  <div class="aluno-box">
    <div class="aluno-name">${nomeCompleto}</div>
    <div class="aluno-grid">
      <div class="field"><label>Nº de Matrícula</label><span>${aluno.numeroMatricula || '—'}</span></div>
      ${aluno.turmaNome ? `<div class="field"><label>Turma</label><span>${aluno.turmaNome}</span></div>` : '<div></div>'}
      ${aluno.cursoNome ? `<div class="field"><label>Curso</label><span>${aluno.cursoNome}</span></div>` : '<div></div>'}
      ${aluno.nomeEncarregado ? `<div class="field"><label>Encarregado</label><span>${aluno.nomeEncarregado}</span></div>` : '<div></div>'}
      <div class="field"><label>Data de Emissão</label><span>${dataEmissao}</span></div>
      <div class="field"><label>Hora</label><span>${hora}</span></div>
    </div>
  </div>

  <div class="resumo-row">
    <div class="resumo-card card-pago"><span class="val">${fmtAOA(resumo.totalPago)}</span><span class="lbl">✓ Total Pago</span></div>
    <div class="resumo-card card-pend"><span class="val">${fmtAOA(resumo.totalPendente)}</span><span class="lbl">⏳ Pendente</span></div>
    <div class="resumo-card card-canc"><span class="val">${fmtAOA(resumo.totalCancelado)}</span><span class="lbl">✗ Cancelado</span></div>
    <div class="resumo-card card-total"><span class="val">${resumo.total}</span><span class="lbl">Transacções</span></div>
  </div>

  <div class="section-title">Movimentos no Período</div>
  ${pagamentos.length === 0
    ? `<div style="text-align:center;padding:30px;color:#aaa;font-size:12px;border:1px dashed #ddd;border-radius:8px;">Nenhum pagamento encontrado para o período seleccionado.</div>`
    : `<table>
        <thead>
          <tr>
            <th style="width:80px;">Data</th>
            <th>Descrição</th>
            <th style="width:100px;">Método</th>
            <th style="width:110px;text-align:right;">Valor</th>
            <th style="width:70px;text-align:center;">Estado</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
  }

  <div class="footer-totals">
    <div class="totals-table">
      ${resumo.totalPago > 0 ? `<div class="tot-row"><span>Total Pago</span><span style="color:#155724;font-weight:700;">${fmtAOA(resumo.totalPago)}</span></div>` : ''}
      ${resumo.totalPendente > 0 ? `<div class="tot-row"><span>Total Pendente</span><span style="color:#856404;font-weight:700;">${fmtAOA(resumo.totalPendente)}</span></div>` : ''}
      ${resumo.totalCancelado > 0 ? `<div class="tot-row"><span>Total Cancelado</span><span style="color:#aaa;">${fmtAOA(resumo.totalCancelado)}</span></div>` : ''}
      <div class="tot-row tot-grand"><span>TOTAL GERAL</span><span>${fmtAOA(resumo.totalPago + resumo.totalPendente)}</span></div>
    </div>
  </div>

  <div class="qr-bar-row">
    <div class="qr-box">
      <img src="${qrUrl}" alt="QR Verificação" onerror="this.style.display='none'"/>
      <div class="qr-lbl">QR Verificação</div>
    </div>
    <div class="bar-box">
      <svg id="extrato-barcode"></svg>
      <div class="bar-lbl">Código de Barras — Nº Matrícula</div>
    </div>
    <div class="doc-info">
      <strong>Documento:</strong> ${docId}<br>
      <strong>Aluno:</strong> ${nomeCompleto}<br>
      <strong>Matrícula:</strong> ${aluno.numeroMatricula || '—'}<br>
      <strong>Turma:</strong> ${aluno.turmaNome || '—'}<br>
      <strong>Data:</strong> ${dataEmissao} às ${hora}<br>
      <strong>Total Pago:</strong> ${fmtAOA(resumo.totalPago)}<br>
      <strong>Transacções:</strong> ${resumo.total}<br>
      <span style="font-size:7.5pt;color:#9ca3af">Documento autêntico verificável pelo QR</span>
    </div>
  </div>

  <div class="sig-section">
    <div class="sig-block">
      <div class="sig-label">O Director Geral</div>
      <div class="sig-line"></div>
      <div class="sig-name">${director}</div>
    </div>
    <div class="sig-block">
      <div class="sig-label">O Chefe de Secretaria</div>
      <div class="sig-line"></div>
      <div class="sig-name">${chefeSec}</div>
    </div>
    <div class="sig-block">
      <div class="sig-label">O(A) Encarregado(a)</div>
      <div class="sig-line"></div>
      <div class="sig-name">____________________________</div>
    </div>
  </div>

  <div class="footer-note">
    Documento emitido em ${dataEmissao} às ${hora} · ${escola}<br>
    Este extracto é meramente informativo e não substitui recibo oficial de pagamento.<br>
    Os dados apresentados reflectem o estado dos registos no sistema à data de emissão. · Ref. ${docId}
  </div>
</div>
<script>
window.addEventListener('load', function() {
  try {
    JsBarcode('#extrato-barcode', '${barcodeVal}', {
      format: 'CODE128', width: 2, height: 50, displayValue: true,
      fontSize: 11, margin: 4, background: 'transparent',
      lineColor: '#1a2540', fontOptions: 'bold',
    });
  } catch(e) {
    var el = document.getElementById('extrato-barcode');
    if (el) el.style.display = 'none';
  }
});
</script>
${opts.autoprint ? `<script>window.onload=function(){setTimeout(function(){window.print()},800)}</script>` : ''}
</body>
</html>`;
}

function ordinalVia(n: number): string {
  if (n === 1) return 'ORIGINAL';
  if (n === 2) return '2ª VIA';
  if (n === 3) return '3ª VIA';
  return `${n}ª VIA`;
}

function buildReciboBody(p: any, aluno: any, turma: any, idx: number, multaInfo?: { valor: number; isento: boolean }, viaNumber: number = 1, qrDataUrl?: string, barcodeSvg?: string): string {
  // Prefer SAF-T sequential number; fallback to UUID-based legacy ref
  const numRef = p.numeroSerie || `REC-${(p.id || '').toString().replace(/-/g,'').substring(0,8).toUpperCase()}`;
  const mesTxt = p.mes ? `${MESES[p.mes] || ''} ` : '';
  const tipoLabel = TIPO_LABEL[p.tipoTaxa] || 'Pagamento';
  const descricao = `${tipoLabel}${mesTxt ? ' – ' + mesTxt : ''}${p.ano ? p.ano : ''}`;
  const statusOk = p.status === 'pago';
  const statusColor = statusOk ? '#16a34a' : p.status === 'pendente' ? '#d97706' : '#6b7280';
  const statusLabel = statusOk ? '✓ LIQUIDADO' : p.status === 'pendente' ? '⏳ EM COBRANÇA' : 'CANCELADO';
  const dataPagto = p.data || p.dataPagamento || p.createdAt;
  const dataEmissaoRec = fmtDate(new Date().toISOString());
  const valorMulta = multaInfo?.valor ?? p.valorMulta ?? 0;
  const isento = multaInfo?.isento ?? false;
  const valorTotal = Number(p.valor || 0) + (isento ? 0 : valorMulta);
  const nifEncarregado = aluno?.encarregadoNif || aluno?.nif || '999999999';
  const nifEscola = p.nifEscola || '';
  const hashCurto = (p.hashDoc || '').slice(0, 12);

  const _publicDomain =
    process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(',')[0].trim()}`
      : process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : null;
  const qrLines = _publicDomain
    ? `${_publicDomain}/verificar-recibo/${encodeURIComponent(numRef)}`
    : [
        `DOC: ${numRef}`,
        `ESCOLA: ${p.escolaNome || 'N/D'}`,
        nifEscola ? `NIF ESCOLA: ${nifEscola}` : null,
        `ALUNO: ${aluno?.nomeCompleto || aluno?.nome || 'N/D'}`,
        `TOTAL: ${fmtMoney(valorTotal)} Kz`,
        `DATA: ${fmtDate(dataPagto)}`,
        `SISTEMA: Super Escola SIGA v3`,
      ].filter(Boolean).join('\n');

  const verifHtml = buildVerificationSection({
    barcodeId: `rec-${idx}-${numRef.replace(/\s/g,'_')}`,
    barcodeValue: numRef.replace(/\s/g,'-').substring(0,30),
    qrData: qrLines,
    docRef: numRef,
    emitidoEm: dataEmissaoRec,
    qrDataUrl,
    barcodeSvg,
  });

  const multaRow = valorMulta > 0
    ? isento
      ? `<div class="info-row" style="background:#d4edda;border-radius:4px;margin:2px 0"><span class="info-label" style="color:#155724">Multa (Isenta)</span><span class="info-value" style="color:#155724;font-weight:600">Dispensado por decisão da Direcção</span></div>`
      : `<div class="info-row" style="background:#fff3cd;border-radius:4px;margin:2px 0"><span class="info-label" style="color:#856404">Multa por Atraso</span><span class="info-value" style="color:#d97706;font-weight:700">${fmtMoney(valorMulta)} Kz</span></div>`
    : '';

  const totalRow = valorMulta > 0 && !isento
    ? `<div class="info-row highlight" style="background:#1a2b5f;border-radius:4px;margin-top:6px"><span class="info-label" style="color:#fff;font-weight:700">TOTAL A PAGAR</span><span class="info-value valor" style="color:#fff">${fmtMoney(valorTotal)} Kz</span></div>`
    : '';

  const isVia = viaNumber > 1;
  const viaLabel = ordinalVia(viaNumber);
  const watermarkHtml = isVia ? `
  <div class="watermark"><div class="watermark-text">${viaLabel}</div></div>
  <div class="via-badge">${viaLabel}<div class="via-badge-sub">Reimpressão · ${fmtDate(new Date().toISOString())}</div></div>` : '';

  return `<div class="recibo${idx > 0 ? ' page-break' : ''}${isVia ? ' is-via' : ''}">
  ${watermarkHtml}
  <div class="header">
    <div class="logo-box">
      <div class="logo-inner">
        <div style="font-size:18pt;font-weight:900;color:white;letter-spacing:-1px;">A</div>
      </div>
    </div>
    <div class="escola-info">
      <div class="escola-nome">ESCOLA</div>
      <div class="escola-sub">RECIBO DE PAGAMENTO${isVia ? ` · ${viaLabel}` : ''}</div>
      ${nifEscola ? `<div style="font-size:7pt;color:#6b7280;margin-top:2px">NIF: ${nifEscola}</div>` : ''}
    </div>
    <div class="ref-box">
      <div class="ref-label">Nº DOCUMENTO</div>
      <div class="ref-value" style="font-size:${numRef.length > 12 ? '9pt' : '11pt'}">${numRef}</div>
      <div class="ref-date">${fmtDate(p.createdAt || new Date().toISOString())}</div>
      ${hashCurto ? `<div style="font-size:6pt;color:#9ca3af;margin-top:2px;font-family:monospace">HASH: ${hashCurto}</div>` : ''}
    </div>
  </div>
  <hr class="divider"/>
  <div class="section-title">DADOS DO CLIENTE</div>
  <div class="info-grid">
    <div class="info-row"><span class="info-label">Nome Completo</span><span class="info-value">${aluno?.nomeCompleto || aluno?.nome || '—'}</span></div>
    <div class="info-row"><span class="info-label">Nº de Matrícula</span><span class="info-value">${aluno?.numeroMatricula || (aluno?.id || '').substring(0,8).toUpperCase()}</span></div>
    <div class="info-row"><span class="info-label">Turma / Classe</span><span class="info-value">${turma?.nome || '—'}</span></div>
    ${aluno?.encarregadoNome ? `<div class="info-row"><span class="info-label">Encarregado</span><span class="info-value">${aluno.encarregadoNome}</span></div>` : ''}
    <div class="info-row"><span class="info-label">NIF / BI</span><span class="info-value mono">${nifEncarregado}</span></div>
  </div>
  <hr class="divider"/>
  <div class="section-title">DETALHES DO PAGAMENTO</div>
  <div class="info-grid">
    <div class="info-row"><span class="info-label">Descrição</span><span class="info-value">${descricao}</span></div>
    <div class="info-row highlight"><span class="info-label">Valor Base</span><span class="info-value valor">${fmtMoney(Number(p.valor || 0))} Kz</span></div>
    ${multaRow}
    ${totalRow}
    <div class="info-row" style="background:#f0fdf4;border-radius:4px;margin:2px 0">
      <span class="info-label" style="color:#15803d">Regime Fiscal</span>
      <span class="info-value" style="color:#15803d;font-size:8pt">Isento IVA — art. 9.º al. b) CIVA</span>
    </div>
    <div class="info-row"><span class="info-label">Método de Pagamento</span><span class="info-value">${buildMetodoBadge(p.metodoPagamento)}</span></div>
    ${p.referencia ? `<div class="info-row" style="background:#e8f1fb;border-left:3px solid #1e6fd9;border-radius:4px;margin:4px 0;padding:6px 8px"><span class="info-label" style="color:#1e6fd9;font-weight:700">RUPE (verif. AGT)</span><span class="info-value mono" style="font-size:11pt;font-weight:700;letter-spacing:0.4px;color:#0b3d8a">${p.referencia}</span></div>` : ''}
    <div class="info-row"><span class="info-label">Data</span><span class="info-value">${fmtDate(dataPagto)}</span></div>
    <div class="info-row"><span class="info-label">Estado</span><span class="info-value" style="color:${statusColor};font-weight:700;font-size:10pt">${statusLabel}</span></div>
    ${p.observacao ? `<div class="info-row"><span class="info-label">Observação</span><span class="info-value">${p.observacao}</span></div>` : ''}
    ${p.criadoPorNome ? `<div class="info-row" style="background:#f5f3ff;border-left:3px solid #7c3aed;border-radius:4px;margin:4px 0;padding:5px 8px"><span class="info-label" style="color:#5b21b6">Processado por</span><span class="info-value" style="color:#3b0764;font-weight:600">${p.criadoPorNome}</span></div>` : ''}
  </div>
  ${verifHtml}
  ${p.referencia ? `<div class="agt-verif" style="margin-top:8px;padding:8px 10px;border:1px dashed #1e6fd9;border-radius:4px;background:#f4f8fd;font-size:8.5pt;color:#0b3d8a;line-height:1.45;display:flex;gap:10px;align-items:center">
    <div style="flex:1">
      <div style="font-weight:700;color:#1e6fd9;margin-bottom:3px;letter-spacing:0.3px">COMO VERIFICAR ESTE PAGAMENTO NO PORTAL DA AGT</div>
      <div>1. Aceder a <span style="font-weight:700">portaldocontribuinte.minfin.gov.ao</span> (ou ler o QR ao lado)</div>
      <div>2. Escolher <span style="font-weight:700">Consulta de Nota de Liquidação / RUPE</span></div>
      <div>3. Inserir o RUPE: <span class="mono" style="font-weight:700;letter-spacing:0.4px">${p.referencia}</span></div>
      <div style="margin-top:3px;font-style:italic;color:#5a6b85">A consulta confirma o valor, a data e o estado de liquidação junto da Administração Geral Tributária.</div>
    </div>
    <div style="flex-shrink:0;text-align:center">
      <img src="${buildQRUrl(`https://portaldocontribuinte.minfin.gov.ao/?rupe=${encodeURIComponent(p.referencia)}`, 90)}" alt="QR AGT" style="width:80px;height:80px;border:1px solid #cfd9ee;border-radius:4px;background:white" onerror="this.style.display='none'" />
      <div style="font-size:7pt;color:#1e6fd9;margin-top:2px;font-weight:700;letter-spacing:0.4px">PORTAL AGT</div>
    </div>
  </div>` : ''}
  <div class="footer">
    <div class="assinatura-block"><div class="assinatura-linha"></div><div class="assinatura-label">Responsável Financeiro</div></div>
    <div class="assinatura-block"><div class="assinatura-linha"></div><div class="assinatura-label">Encarregado de Educação</div></div>
  </div>
  <div class="emitido">Emitido em ${fmtDate(new Date().toISOString())}${p.criadoPorNome ? ` · Operador: ${p.criadoPorNome}` : ''} · Válido como comprovativo de pagamento · Verificável pelo QR Code · Isento de IVA (art. 9.º al. b) CIVA)</div>
</div>`;
}

function buildPageHTML(reciboBodies: string[], escolaNome: string, autoprint: boolean): string {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<title>Recibos – ${escolaNome}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;background:#f0f0f0;color:#111}
.recibo{background:white;width:210mm;min-height:135mm;margin:8mm auto;padding:10mm 14mm;border:1px solid #ddd;border-radius:4px;position:relative}
@media print{
  @page{size:A4 portrait;margin:0}
  body{background:white}
  .recibo{margin:0;border:none;width:100%;min-height:auto;padding:12mm 14mm}
  .page-break{page-break-before:always}
  .no-print{display:none!important}
}
.header{display:flex;align-items:center;gap:14px;margin-bottom:10px}
.logo-box{width:56px;height:56px;background:#1a2b5f;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.logo-inner{display:flex;align-items:center;justify-content:center;width:100%;height:100%}
.escola-info{flex:1}
.escola-nome{font-size:15pt;font-weight:700;color:#1a2b5f;line-height:1.1}
.escola-sub{font-size:7pt;letter-spacing:3px;color:#6b7280;margin-top:3px}
.ref-box{text-align:right;padding:8px 12px;background:#1a2b5f;border-radius:8px;color:white;min-width:120px}
.ref-label{font-size:6pt;letter-spacing:2px;opacity:.7;text-transform:uppercase}
.ref-value{font-size:11pt;font-weight:700;letter-spacing:2px;margin:2px 0;font-family:monospace}
.ref-date{font-size:8pt;opacity:.75}
.divider{border:none;border-top:2px solid #f3f4f6;margin:8px 0}
.section-title{font-size:6.5pt;font-weight:700;letter-spacing:2.5px;color:#9ca3af;margin-bottom:6px;text-transform:uppercase}
.info-grid{margin-bottom:8px}
.info-row{display:flex;padding:4px 6px;border-bottom:1px solid #f9fafb;align-items:baseline;gap:4px}
.info-row.highlight{background:#eff6ff;border-radius:4px;margin:4px 0}
.info-label{width:145px;font-size:8pt;color:#6b7280;flex-shrink:0}
.info-value{font-size:9pt;color:#111827;font-weight:500;flex:1}
.info-value.valor{font-size:14pt;font-weight:700;color:#1a2b5f}
.info-value.mono{font-family:monospace;font-size:9pt;letter-spacing:1px}
.footer{display:flex;justify-content:space-around;margin-top:18px;padding-top:8px;gap:20px}
.assinatura-block{text-align:center;flex:1}
.assinatura-linha{border-top:1px solid #374151;margin-bottom:4px;margin-left:10px;margin-right:10px}
.assinatura-label{font-size:7pt;color:#6b7280}
.emitido{text-align:center;font-size:6.5pt;color:#9ca3af;margin-top:8px;border-top:1px dashed #e5e7eb;padding-top:6px}
.print-btn{position:fixed;top:10px;right:10px;background:#1a2b5f;color:white;border:none;padding:10px 18px;border-radius:8px;font-size:12pt;cursor:pointer;z-index:999;font-family:Arial}
.print-btn:hover{background:#243c7a}
.recibo.is-via{border:2px solid #d97706}
.watermark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden;z-index:0}
.watermark-text{font-size:110pt;font-weight:900;color:rgba(217,119,6,0.18);letter-spacing:8px;transform:rotate(-28deg);white-space:nowrap;text-transform:uppercase;font-family:Arial,sans-serif;border:6px solid rgba(217,119,6,0.18);padding:6px 28px;border-radius:8px}
.via-badge{position:absolute;top:8px;right:8px;background:#d97706;color:white;padding:6px 12px;border-radius:6px;font-size:9pt;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;box-shadow:0 2px 6px rgba(0,0,0,.15);z-index:5;text-align:center}
.via-badge-sub{font-size:6pt;font-weight:500;letter-spacing:0.5px;text-transform:none;opacity:.95;margin-top:2px}
.recibo .header,.recibo .info-grid,.recibo .footer,.recibo hr,.recibo .section-title,.recibo .verif-section,.recibo .agt-verif,.recibo .emitido{position:relative;z-index:1}
@media print{.watermark-text{color:rgba(217,119,6,0.20);border-color:rgba(217,119,6,0.20)}}
${VERIF_CSS}
</style>
${JSBARCODE_CDN}
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">🖨 Imprimir</button><button class="no-print" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()" style="position:fixed;top:55px;right:10px;background:#166534;color:white;border:none;padding:10px 18px;border-radius:8px;font-size:11pt;cursor:pointer;z-index:999">📥 Guardar</button>
${reciboBodies.join('\n')}
${autoprint ? `<script>window.onload=function(){setTimeout(function(){window.print()},600)}</script>` : ''}
</body>
</html>`;
}

// ─────────────────────────────────────────────
// BOLETIM DE NOTAS
// ─────────────────────────────────────────────
function escalaDe(nota: any): EscalaConfig {
  return {
    macMin: Number(nota?.escalaMin) > 0 ? Number(nota.escalaMin) : 1,
    macMax: Number(nota?.escalaMax) > 0 ? Number(nota.escalaMax) : 5,
    tipoEscala: (nota?.escalaTipo === 'linear' ? 'linear' : 'proporcional'),
  };
}

function macCanonicaNota(nota: any): number {
  const vals = [nota?.aval1, nota?.aval2, nota?.aval3, nota?.aval4, nota?.aval5, nota?.aval6, nota?.aval7, nota?.aval8]
    .map((v: any) => Number(v) || 0);
  return calcMacCanonica(vals, escalaDe(nota));
}

function calcMedia(nota: any): number {
  if (Number(nota?.nf) > 0) return Math.round(Number(nota.nf));
  const macCan = macCanonicaNota(nota);
  if (macCan > 0) return Math.round(macCan);
  return 0;
}

function notaClass(n: number): string {
  if (n >= 14) return 'nota-bom';
  if (n >= 10) return 'nota-suf';
  return 'nota-neg';
}

function buildBoletimHTML(aluno: any, turma: any, notas: any[], config: any, trimestre: number | null, autoprint: boolean, disciplinasInfo?: Array<{nome: string, categoriaFormacao: string}>): string {
  const escolaNome = config?.nomeEscola || 'Escola';
  const dirGeral = config?.directorGeral || '';
  const anoLetivo = turma?.anoLetivo || anoLetivoDe();

  const trimestres = trimestre ? [trimestre] : [1, 2, 3];
  const disciplinasSet = new Set<string>(notas.map((n: any) => n.disciplina));
  const disciplinas = Array.from(disciplinasSet).sort();

  // ── Agrupamento por Categoria de Formação ──────────────────────────────────
  const _bCatMap = new Map<string, string>();
  if (disciplinasInfo) for (const d of disciplinasInfo) _bCatMap.set(d.nome.trim(), d.categoriaFormacao || '');
  const _bCAT_ORDER = ['formacao_geral', 'formacao_especifica', 'opcional', ''];
  const _bCAT_LABELS: Record<string, string> = { formacao_geral: 'Formação Geral', formacao_especifica: 'Formação Específica', opcional: 'Disciplinas Opcionais', '': 'Outras' };
  const _bGrouped: Record<string, string[]> = { formacao_geral: [], formacao_especifica: [], opcional: [], '': [] };
  for (const disc of disciplinas) { const c = _bCatMap.get(disc.trim()) ?? ''; (_bGrouped[_bCAT_ORDER.includes(c) ? c : ''] ??= []).push(disc); }
  const _bHasCats = !!disciplinasInfo && (_bGrouped.formacao_geral.length + _bGrouped.formacao_especifica.length + _bGrouped.opcional.length) > 0;

  const nomeCompleto = aluno ? `${aluno.nome || ''} ${aluno.apelido || ''}`.trim() : '—';

  let tabelasHTML = '';
  for (const tri of trimestres) {
    const notasTri = notas.filter((n: any) => n.trimestre === tri);
    if (!notasTri.length && trimestre === null) continue;

    let rows = '';
    for (const _cat of _bCAT_ORDER) {
      const _discs = _bGrouped[_cat];
      if (!_discs.length) continue;
      if (_bHasCats) rows += `<tr><td colspan="6" style="padding:4px 0 2px 4px;font-size:8pt;font-weight:700;color:#1a2b5f;text-transform:uppercase;letter-spacing:0.3px;background:#f1f5f9;border-bottom:1px solid #dde3ec">${_bCAT_LABELS[_cat]}</td></tr>`;
      for (const disc of _discs) {
        const n = notasTri.find((x: any) => x.disciplina === disc);
        if (!n) { rows += `<tr><td>${disc}</td><td>—</td><td>—</td><td>—</td><td>—</td><td class="nota-cell nota-neutro">—</td></tr>`; continue; }
        const med = calcMedia(n);
        const macCan = macCanonicaNota(n);
        const macStr = macCan > 0 ? macCan.toFixed(1) : (n.mac || n.mac1 || '—');
        rows += `<tr>
        <td>${disc}</td>
        <td class="center">${n.aval1 || '—'}</td>
        <td class="center">${n.aval2 || '—'}</td>
        <td class="center">${n.aval3 || '—'}</td>
        <td class="center">${macStr}</td>
        <td class="nota-cell center ${notaClass(med)}">${med}</td>
      </tr>`;
      }
    }

    const notasValidas = notasTri.filter((n: any) => n.nf > 0 || n.aval1 > 0);
    const mediaGeral = notasValidas.length
      ? Math.round(notasValidas.reduce((s: number, n: any) => s + calcMedia(n), 0) / notasValidas.length)
      : null;

    tabelasHTML += `
    <div class="trimestre-block">
      <div class="tri-header">${tri}º Trimestre</div>
      <table>
        <thead>
          <tr>
            <th style="text-align:left;width:38%">Disciplina</th>
            <th class="center">Av.1</th>
            <th class="center">Av.2</th>
            <th class="center">Av.3</th>
            <th class="center">MAC</th>
            <th class="center">Média</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${mediaGeral !== null ? `<div class="media-geral">Média Geral: <span class="${notaClass(mediaGeral)}">${mediaGeral}</span></div>` : ''}
    </div>`;
  }

  const dataEmissaoBoletim = fmtDate(new Date().toISOString());
  const matriculaBoletim = aluno?.numeroMatricula || 'MAT000';
  const boletimVerif = buildVerificationSection({
    barcodeId: `boletim-${matriculaBoletim}`,
    barcodeValue: matriculaBoletim,
    qrData: [
      `DOC: BOLETIM DE NOTAS`,
      `ESCOLA: ${escolaNome}`,
      `ALUNO: ${nomeCompleto}`,
      `MATRICULA: ${matriculaBoletim}`,
      `TURMA: ${turma?.nome || 'N/D'} · ${turma?.classe || 'N/D'}`,
      `ANO: ${anoLetivo}`,
      `TRIMESTRE: ${trimestre ? trimestre + 'º' : 'Todos'}`,
      `EMITIDO: ${dataEmissaoBoletim}`,
    ].join('\n'),
    docRef: `BOL-${matriculaBoletim}-${anoLetivo}`,
    emitidoEm: dataEmissaoBoletim,
  });

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<title>Boletim – ${nomeCompleto}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;background:#f0f0f0;color:#111;font-size:9pt}
.doc{background:white;width:210mm;min-height:297mm;margin:8mm auto;padding:14mm 16mm;border:1px solid #ddd}
@media print{
  body{background:white}
  .doc{margin:0;border:none;width:100%;padding:12mm}
  .no-print{display:none!important}
}
.header{display:flex;align-items:center;gap:14px;margin-bottom:8px;border-bottom:3px solid #1a2b5f;padding-bottom:8px}
.logo-box{width:54px;height:54px;background:#1a2b5f;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:20pt;font-weight:900;flex-shrink:0}
.escola-info{flex:1}
.escola-nome{font-size:14pt;font-weight:700;color:#1a2b5f}
.escola-sub{font-size:7.5pt;color:#6b7280;margin-top:2px;letter-spacing:1px}
.titulo-doc{text-align:right;padding:8px 12px;background:#1a2b5f;color:white;border-radius:6px;min-width:110px}
.titulo-doc-label{font-size:6pt;letter-spacing:2px;opacity:.7}
.titulo-doc-val{font-size:10pt;font-weight:700}
.aluno-section{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0;background:#f8fafc;border-radius:6px;padding:8px 12px;border:1px solid #e2e8f0}
.aluno-field{display:flex;flex-direction:column;gap:1px}
.aluno-label{font-size:6.5pt;color:#9ca3af;text-transform:uppercase;letter-spacing:1px}
.aluno-value{font-size:9pt;font-weight:600;color:#1e293b}
.trimestre-block{margin:10px 0}
.tri-header{background:#1a2b5f;color:white;padding:5px 10px;border-radius:4px 4px 0 0;font-size:9pt;font-weight:700;letter-spacing:1px}
table{width:100%;border-collapse:collapse;margin-top:0}
th{background:#f1f5f9;font-size:7.5pt;font-weight:700;color:#475569;padding:5px 8px;border:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:.5px}
td{font-size:8.5pt;padding:5px 8px;border:1px solid #e2e8f0;color:#1e293b}
tr:nth-child(even) td{background:#fafafa}
.center{text-align:center}
.nota-cell{font-weight:700;font-size:9.5pt}
.nota-bom{color:#16a34a}
.nota-suf{color:#d97706}
.nota-neg{color:#dc2626}
.nota-neutro{color:#9ca3af}
.media-geral{text-align:right;font-size:9pt;font-weight:700;color:#1a2b5f;padding:4px 8px;background:#f0f6ff;border:1px solid #dbeafe;border-top:none;border-radius:0 0 4px 4px}
.media-geral span{font-size:12pt;margin-left:6px}
.footer{display:flex;justify-content:space-around;margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;gap:20px}
.assinatura-block{text-align:center;flex:1}
.assinatura-linha{border-top:1px solid #374151;margin:20px 10px 4px}
.assinatura-label{font-size:7pt;color:#6b7280}
.rodape{text-align:center;font-size:6.5pt;color:#9ca3af;margin-top:10px;border-top:1px dashed #e5e7eb;padding-top:6px}
.print-btn{position:fixed;top:10px;right:10px;background:#1a2b5f;color:white;border:none;padding:10px 18px;border-radius:8px;font-size:11pt;cursor:pointer;z-index:999}
${VERIF_CSS}
</style>
${JSBARCODE_CDN}
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">🖨 Imprimir</button><button class="no-print" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()" style="position:fixed;top:55px;right:10px;background:#166534;color:white;border:none;padding:10px 18px;border-radius:8px;font-size:11pt;cursor:pointer;z-index:999">📥 Guardar</button>
<div class="doc">
  <div class="header">
    <div class="logo-box">${escolaNome.charAt(0)}</div>
    <div class="escola-info">
      <div class="escola-nome">${escolaNome}</div>
      <div class="escola-sub">Ano Lectivo ${anoLetivo}</div>
    </div>
    <div class="titulo-doc">
      <div class="titulo-doc-label">DOCUMENTO</div>
      <div class="titulo-doc-val">BOLETIM DE NOTAS</div>
    </div>
  </div>

  <div class="aluno-section">
    <div class="aluno-field"><span class="aluno-label">Nome do Aluno</span><span class="aluno-value">${nomeCompleto}</span></div>
    <div class="aluno-field"><span class="aluno-label">Nº de Matrícula</span><span class="aluno-value">${aluno?.numeroMatricula || '—'}</span></div>
    <div class="aluno-field"><span class="aluno-label">Turma / Classe</span><span class="aluno-value">${turma?.nome || '—'} · ${turma?.classe || '—'}</span></div>
    <div class="aluno-field"><span class="aluno-label">Turno</span><span class="aluno-value">${turma?.turno || '—'}</span></div>
    <div class="aluno-field"><span class="aluno-label">Encarregado de Educação</span><span class="aluno-value">${aluno?.nomeEncarregado || '—'}</span></div>
    <div class="aluno-field"><span class="aluno-label">Data de Emissão</span><span class="aluno-value">${fmtDate(new Date().toISOString())}</span></div>
  </div>

  ${tabelasHTML || '<p style="color:#9ca3af;text-align:center;padding:20px">Sem notas registadas</p>'}

  ${boletimVerif}
  <div class="footer">
    <div class="assinatura-block"><div class="assinatura-linha"></div><div class="assinatura-label">Director(a) Pedagógico(a)</div></div>
    <div class="assinatura-block"><div class="assinatura-linha"></div><div class="assinatura-label">Director(a) Geral</div></div>
    <div class="assinatura-block"><div class="assinatura-linha"></div><div class="assinatura-label">Encarregado de Educação</div></div>
  </div>
  <div class="rodape">Emitido em ${fmtDate(new Date().toISOString())} · ${escolaNome} · Documento Oficial</div>
</div>
${autoprint ? `<script>window.onload=function(){setTimeout(function(){window.print()},600)}</script>` : ''}
</body>
</html>`;
}

// ─────────────────────────────────────────────
// DECLARAÇÃO DE MATRÍCULA
// ─────────────────────────────────────────────
function fmtDataNascimento(raw: string): string {
  if (!raw) return '___/___/______';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function buildHabilitacoesHTML(aluno: any, turma: any, config: any, notas: any[], autoprint: boolean, disciplinasInfo?: Array<{nome: string, categoriaFormacao: string}>): string {
  const escolaNome = config?.nomeEscola || 'Escola';
  const dirGeral = config?.directorGeral || '_________________________';
  const nif = config?.nifEscola || '';
  const codigo = config?.codigoMED || '';
  const anoLetivo = turma?.anoLetivo || anoLetivoDe();

  const nomeCompleto = aluno ? `${aluno.nome || ''} ${aluno.apelido || ''}`.trim() : '—';
  const nomePai = aluno?.nomePai || '_______________';
  const nomeMae = aluno?.nomeMae || '_______________';
  const municipio = aluno?.municipio || '_______________';
  const provincia = aluno?.provincia || '_______________';
  const dataNasc = fmtDataNascimento(aluno?.dataNascimento || '');
  const classe = turma?.classe || '___';
  const turmaNome = turma?.nome || '___';
  const hoje = fmtDate(new Date().toISOString());
  const localEscola = config?.municipioEscola || config?.municipio || 'Luanda';

  // Calcular média geral
  const valorCanon = (n: any) => Number(n?.nf) > 0 ? Number(n.nf) : macCanonicaNota(n);
  const notasValidas = notas.filter((n: any) => valorCanon(n) > 0);
  const mediaGeral = notasValidas.length
    ? Math.round(notasValidas.reduce((s: number, n: any) => s + valorCanon(n), 0) / notasValidas.length)
    : null;

  // Lista de disciplinas únicas, ordenadas — agrupadas por categoria de formação
  const disciplinasList = Array.from(new Set(notas.map((n: any) => n.disciplina as string))).sort();

  const _hCatMap = new Map<string, string>();
  if (disciplinasInfo) for (const d of disciplinasInfo) _hCatMap.set(d.nome.trim(), d.categoriaFormacao || '');
  const _hCAT_ORDER = ['formacao_geral', 'formacao_especifica', 'opcional', ''];
  const _hCAT_LABELS: Record<string, string> = { formacao_geral: 'I — Formação Geral', formacao_especifica: 'II — Formação Específica', opcional: 'III — Disciplinas Opcionais', '': 'Outras Disciplinas' };
  const _hGrouped: Record<string, string[]> = { formacao_geral: [], formacao_especifica: [], opcional: [], '': [] };
  for (const disc of disciplinasList) { const c = _hCatMap.get(disc.trim()) ?? ''; (_hGrouped[_hCAT_ORDER.includes(c) ? c : ''] ??= []).push(disc); }
  const _hHasCats = !!disciplinasInfo && (_hGrouped.formacao_geral.length + _hGrouped.formacao_especifica.length + _hGrouped.opcional.length) > 0;

  let linhasDisciplinas = '';
  for (const _cat of _hCAT_ORDER) {
    const _discs = _hGrouped[_cat];
    if (!_discs.length) continue;
    if (_hHasCats) {
      linhasDisciplinas += `
        <tr><td colspan="2" style="padding:7px 0 3px;font-size:9pt;font-weight:700;color:#1a2b5f;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #1a2b5f33">${_hCAT_LABELS[_cat]}</td></tr>`;
    }
    for (const disc of _discs) {
      const nota = notas.find((n: any) => n.disciplina === disc);
      const valor = nota ? valorCanon(nota) : 0;
      const valorStr = valor > 0 ? String(Math.round(valor)) : '___';
      linhasDisciplinas += `
        <tr>
          <td style="padding:3px 0;font-size:10.5pt;width:70%">${disc} <span style="letter-spacing:-1px">${'.'.repeat(60)}</span></td>
          <td style="padding:3px 6px;font-size:10.5pt;text-align:left">${valorStr}</td>
        </tr>`;
    }
  }
  if (!linhasDisciplinas) linhasDisciplinas = `<tr><td colspan="2" style="color:#9ca3af;font-style:italic;padding:8px 0;font-size:9pt">Sem classificações registadas</td></tr>`;

  const mediaStr = mediaGeral !== null ? String(mediaGeral) : '_______________';

  const docRef = `HAB-${(aluno?.id || '').replace(/-/g,'').substring(0,8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const verificacao = buildVerificationSection({
    barcodeId: `hab-${docRef}`,
    barcodeValue: docRef,
    qrData: [
      `DOC: DECLARAÇÃO DE HABILITAÇÕES`,
      `ESCOLA: ${escolaNome}`,
      `ALUNO: ${nomeCompleto}`,
      `MATRICULA: ${aluno?.numeroMatricula || 'N/D'}`,
      `CLASSE: ${classe} · TURMA: ${turmaNome}`,
      `ANO: ${anoLetivo}`,
      `MEDIA: ${mediaStr}`,
      `EMITIDO: ${hoje}`,
      `REF: ${docRef}`,
    ].join('\n'),
    docRef,
    emitidoEm: hoje,
  });

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<title>Declaração de Habilitações – ${nomeCompleto}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Times New Roman',Times,serif;background:#f0f0f0;color:#111;font-size:11pt}
.doc{background:white;width:210mm;min-height:297mm;margin:8mm auto;padding:20mm 22mm;border:1px solid #ddd;display:flex;flex-direction:column}
@media print{
  body{background:white}
  .doc{margin:0;border:none;width:100%;padding:18mm 20mm}
  .no-print{display:none!important}
}
.header{text-align:center;border-bottom:2px solid #1a2b5f;padding-bottom:12px;margin-bottom:20px}
.republica{font-size:8pt;letter-spacing:1px;color:#6b7280;margin-bottom:4px}
.escola-nome{font-size:15pt;font-weight:700;color:#1a2b5f;text-transform:uppercase}
.escola-meta{font-size:8pt;color:#6b7280;margin-top:4px}
.titulo{text-align:center;margin:20px 0 18px;font-size:13pt;font-weight:700;text-decoration:underline;text-transform:uppercase;color:#1a2b5f;letter-spacing:1px}
.corpo{font-size:11pt;color:#1e293b;flex:1;line-height:2}
.corpo p{margin-bottom:6px}
.disc-table{width:65%;margin:12px 0 16px 0;border-collapse:collapse}
.nota-final{margin:8px 0 16px 0;font-size:11pt}
.efeito{margin-top:16px;font-size:11pt}
.veracidade{margin-top:20px;font-size:11pt;text-align:justify;line-height:1.8}
.local-data{margin-top:28px;font-size:11pt}
.assinatura-section{margin-top:50px;display:flex;justify-content:center}
.assinatura-block{text-align:center;min-width:200px}
.assinatura-linha{border-top:1px solid #374151;margin-bottom:6px}
.assinatura-label{font-size:8.5pt;color:#374151}
.assinatura-nome{font-size:9pt;font-weight:700;margin-top:2px}
.rodape{text-align:center;font-size:7pt;color:#9ca3af;margin-top:28px;border-top:1px dashed #e5e7eb;padding-top:8px}
.print-btn{position:fixed;top:10px;right:10px;background:#1a2b5f;color:white;border:none;padding:10px 18px;border-radius:8px;font-size:11pt;cursor:pointer;z-index:999;font-family:Arial}
${VERIF_CSS}
</style>
${JSBARCODE_CDN}
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">🖨 Imprimir</button>
<button class="no-print" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='habilitacoes.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()" style="position:fixed;top:55px;right:10px;background:#166534;color:white;border:none;padding:10px 18px;border-radius:8px;font-size:11pt;cursor:pointer;z-index:999">📥 Guardar</button>
<div class="doc">
  <div class="header">
    <div class="republica">REPÚBLICA DE ANGOLA · MINISTÉRIO DA EDUCAÇÃO</div>
    <div class="escola-nome">${escolaNome}</div>
    <div class="escola-meta">${codigo ? 'Cód. MED: ' + codigo + ' · ' : ''}${nif ? 'NIF: ' + nif : ''}</div>
  </div>

  <div class="titulo">Declaração de Habilitações (Ensino Primário)</div>

  <div class="corpo">
    <p>Eu, <strong>${dirGeral}</strong>, Director(a) do ${escolaNome} Declaro que: <strong>${nomeCompleto}</strong>,</p>
    <p>Filho (a) de <u>${nomePai}</u> E de <u>${nomeMae}</u>,</p>
    <p>Natural de ${municipio}, Município de ${municipio}, Província de ${provincia},</p>
    <p>Nascido (a) aos ${dataNasc},</p>
    <p>portador (a) do bilhete de identificação ou cédula nº <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u> passado pelos arquivos de identificação de <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u> aos&nbsp;&nbsp;__/__/__</p>

    <p style="margin-top:14px">Frequentou o ano lectivo de <strong>${anoLetivo}</strong> E concluiu a <strong>${classe}</strong> classe do Ensino Primário de Educação nesta Escola, conforme consta na Pauta <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u> livro nº <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>,</p>
    <p>Sala <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u> Turma <strong>${turmaNome}</strong> com a média final de <u>&nbsp;${mediaStr}&nbsp;</u> obtidas nas seguintes classificações:</p>

    <table class="disc-table">
      <tbody>
        ${linhasDisciplinas}
      </tbody>
    </table>

    <p class="efeito">Esta declaração é para efeito de matrícula.</p>

    <p class="veracidade" style="margin-top:18px">Pela veracidade e autenticidade, passamos a presente declaração que vai por mim assinado e autenticado com carimbos a óleo em uso neste estabelecimento de ensino ${escolaNome}${nif ? ' – ' + nif : ''}.</p>
  </div>

  <p class="local-data">${localEscola}, ${hoje}</p>

  ${verificacao}

  <div class="assinatura-section">
    <div class="assinatura-block">
      <div class="assinatura-linha"></div>
      <div class="assinatura-label">O / A Director(a) Geral</div>
    </div>
  </div>

  <div class="rodape">Documento emitido em ${hoje} pelo sistema QUETA · ${escolaNome}${nif ? ' · NIF: ' + nif : ''}</div>
</div>
${autoprint ? `<script>window.onload=function(){setTimeout(function(){window.print()},600)}</script>` : ''}
</body>
</html>`;
}

function buildDeclaracaoHTML(aluno: any, turma: any, config: any, tipo: string, autoprint: boolean): string {
  const escolaNome = config?.nomeEscola || 'Escola';
  const dirGeral = config?.directorGeral || '_________________________';
  const nif = config?.nifEscola || '';
  const codigo = config?.codigoMED || '';
  const anoLetivo = turma?.anoLetivo || anoLetivoDe();
  const nomeCompleto = aluno ? `${aluno.nome || ''} ${aluno.apelido || ''}`.trim() : '—';
  const hoje = fmtDate(new Date().toISOString());

  const titulos: Record<string, string> = {
    matricula: 'DECLARAÇÃO DE MATRÍCULA',
    frequencia: 'DECLARAÇÃO DE FREQUÊNCIA',
    conclusao: 'DECLARAÇÃO DE CONCLUSÃO',
  };

  const textos: Record<string, string> = {
    matricula: `Declara-se, para os devidos efeitos legais, que <strong>${nomeCompleto}</strong>, portador(a) do Bilhete de Identidade / Documento de Identificação nº <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>, encontra-se regularmente matriculado(a) neste estabelecimento de ensino, na <strong>${turma?.classe || '—'}</strong>, turma <strong>${turma?.nome || '—'}</strong>, turno <strong>${turma?.turno || '—'}</strong>, no ano lectivo de <strong>${anoLetivo}</strong>.`,
    frequencia: `Declara-se, para os devidos efeitos legais, que <strong>${nomeCompleto}</strong>, portador(a) do Bilhete de Identidade / Documento de Identificação nº <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>, é aluno(a) devidamente matriculado(a) e a frequentar as aulas neste estabelecimento de ensino, na <strong>${turma?.classe || '—'}</strong>, turma <strong>${turma?.nome || '—'}</strong>, turno <strong>${turma?.turno || '—'}</strong>, no ano lectivo de <strong>${anoLetivo}</strong>.`,
    conclusao: `Declara-se, para os devidos efeitos legais, que <strong>${nomeCompleto}</strong>, portador(a) do Bilhete de Identidade / Documento de Identificação nº <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>, concluiu com aproveitamento o percurso escolar na <strong>${turma?.classe || '—'}</strong>, turma <strong>${turma?.nome || '—'}</strong>, no ano lectivo de <strong>${anoLetivo}</strong>, neste estabelecimento de ensino.`,
  };

  const titulo = titulos[tipo] || titulos.matricula;
  const texto = textos[tipo] || textos.matricula;

  const docRefDecl = `DECL-${(aluno?.id || '').replace(/-/g,'').substring(0,8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const declaracaoVerif = buildVerificationSection({
    barcodeId: `decl-${docRefDecl}`,
    barcodeValue: docRefDecl,
    qrData: [
      `DOC: ${titulo}`,
      `ESCOLA: ${escolaNome}`,
      `ALUNO: ${nomeCompleto}`,
      `MATRICULA: ${aluno?.numeroMatricula || 'N/D'}`,
      `TURMA: ${turma?.nome || 'N/D'} · ${turma?.classe || 'N/D'}`,
      `ANO: ${anoLetivo}`,
      `VALIDADE: 90 DIAS`,
      `EMITIDO: ${hoje}`,
      `REF: ${docRefDecl}`,
    ].join('\n'),
    docRef: docRefDecl,
    emitidoEm: hoje,
  });

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<title>${titulo} – ${nomeCompleto}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Times New Roman',Times,serif;background:#f0f0f0;color:#111;font-size:11pt}
.doc{background:white;width:210mm;min-height:297mm;margin:8mm auto;padding:20mm 22mm;border:1px solid #ddd;display:flex;flex-direction:column}
@media print{
  body{background:white}
  .doc{margin:0;border:none;width:100%;padding:18mm 20mm}
  .no-print{display:none!important}
}
.header{text-align:center;border-bottom:2px solid #1a2b5f;padding-bottom:12px;margin-bottom:20px}
.republica{font-size:8pt;letter-spacing:1px;color:#6b7280;margin-bottom:4px}
.escola-nome{font-size:15pt;font-weight:700;color:#1a2b5f;text-transform:uppercase}
.escola-meta{font-size:8pt;color:#6b7280;margin-top:4px}
.titulo{text-align:center;margin:24px 0 20px;font-size:14pt;font-weight:700;text-decoration:underline;text-transform:uppercase;color:#1a2b5f;letter-spacing:2px}
.corpo{line-height:2;text-align:justify;font-size:11pt;color:#1e293b;flex:1}
.corpo p{margin-bottom:12px}
.declaracao-texto{margin:20px 0;font-size:11pt;line-height:2.2;text-indent:40px}
.validade{margin-top:16px;font-size:9pt;color:#6b7280;font-style:italic;text-align:center}
.local-data{margin-top:40px;text-align:right;font-size:10pt}
.assinatura-section{margin-top:60px;display:flex;justify-content:center}
.assinatura-block{text-align:center;min-width:200px}
.assinatura-linha{border-top:1px solid #374151;margin-bottom:6px}
.assinatura-label{font-size:8.5pt;color:#374151}
.assinatura-nome{font-size:9pt;font-weight:700;margin-top:2px}
.rodape{text-align:center;font-size:7pt;color:#9ca3af;margin-top:30px;border-top:1px dashed #e5e7eb;padding-top:8px}
.print-btn{position:fixed;top:10px;right:10px;background:#1a2b5f;color:white;border:none;padding:10px 18px;border-radius:8px;font-size:11pt;cursor:pointer;z-index:999;font-family:Arial}
${VERIF_CSS}
</style>
${JSBARCODE_CDN}
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">🖨 Imprimir</button><button class="no-print" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()" style="position:fixed;top:55px;right:10px;background:#166534;color:white;border:none;padding:10px 18px;border-radius:8px;font-size:11pt;cursor:pointer;z-index:999">📥 Guardar</button>
<div class="doc">
  <div class="header">
    <div class="republica">REPÚBLICA DE ANGOLA · MINISTÉRIO DA EDUCAÇÃO</div>
    <div class="escola-nome">${escolaNome}</div>
    <div class="escola-meta">${codigo ? 'Cód. MED: ' + codigo + ' · ' : ''}${nif ? 'NIF: ' + nif : ''}</div>
  </div>

  <div class="titulo">${titulo}</div>

  <div class="corpo">
    <p class="declaracao-texto">${texto}</p>
    <p style="text-indent:40px">A presente declaração é passada a pedido do(a) interessado(a) e destina-se aos fins que o(a) mesmo(a) indicar.</p>
  </div>

  <p class="validade">Válida por 90 dias a partir da data de emissão</p>

  <div class="local-data">Luanda, ${hoje}</div>

  ${declaracaoVerif}

  <div class="assinatura-section">
    <div class="assinatura-block">
      <div class="assinatura-linha"></div>
      <div class="assinatura-label">O / A Director(a) Geral</div>
    </div>
  </div>

  <div class="rodape">Documento emitido em ${hoje} pelo sistema QUETA · ${escolaNome}${nif ? ' · NIF: ' + nif : ''}</div>
</div>
${autoprint ? `<script>window.onload=function(){setTimeout(function(){window.print()},600)}</script>` : ''}
</body>
</html>`;
}

// ─────────────────────────────────────────────
// RELATÓRIO DE TURMA
// ─────────────────────────────────────────────
function buildRelatorioTurmaHTML(turma: any, alunos: any[], notas: any[], config: any, trimestre: number, autoprint: boolean): string {
  const escolaNome = config?.nomeEscola || 'Escola';
  const anoLetivo = turma?.anoLetivo || anoLetivoDe();

  const disciplinasSet = new Set<string>(notas.map((n: any) => n.disciplina));
  const disciplinas = Array.from(disciplinasSet).sort();

  const rows = alunos.map((aluno: any) => {
    const nomeCompleto = `${aluno.nome || ''} ${aluno.apelido || ''}`.trim();
    const notasAluno = notas.filter((n: any) => n.alunoId === aluno.id && n.trimestre === trimestre);
    const notas_vals = notasAluno.map((n: any) => calcMedia(n)).filter((v: number) => v > 0);
    const media = notas_vals.length ? Math.round(notas_vals.reduce((a: number, b: number) => a + b, 0) / notas_vals.length) : null;
    const aprovado = media !== null && media >= (config?.notaMinimaAprovacao || 10);

    const discCells = disciplinas.map(disc => {
      const n = notasAluno.find((x: any) => x.disciplina === disc);
      const med = n ? calcMedia(n) : null;
      return `<td class="center ${med !== null ? notaClass(med) : 'nota-neutro'}">${med !== null ? med : '—'}</td>`;
    }).join('');

    return `<tr>
      <td style="font-weight:600">${nomeCompleto}</td>
      <td class="center mono">${aluno.numeroMatricula || '—'}</td>
      ${discCells}
      <td class="center nota-cell ${media !== null ? notaClass(media) : 'nota-neutro'}">${media !== null ? media : '—'}</td>
      <td class="center" style="font-weight:700;color:${aprovado ? '#16a34a' : media === null ? '#9ca3af' : '#dc2626'}">${media === null ? '—' : aprovado ? 'APROV.' : 'REPROV.'}</td>
    </tr>`;
  }).join('');

  const aprovados = alunos.filter(a => {
    const notasA = notas.filter((n: any) => n.alunoId === a.id && n.trimestre === trimestre && calcMedia(n) > 0);
    if (!notasA.length) return false;
    const med = Math.round(notasA.reduce((s: number, n: any) => s + calcMedia(n), 0) / notasA.length);
    return med >= (config?.notaMinimaAprovacao || 10);
  }).length;

  const discHeaders = disciplinas.map(d => `<th class="center" style="white-space:nowrap;font-size:7pt">${d}</th>`).join('');

  const dataEmissaoRel = fmtDate(new Date().toISOString());
  const turmaRefRel = `REL-${(turma?.id || '').replace(/-/g,'').substring(0,8).toUpperCase()}-T${trimestre}`;
  const relatorioVerif = buildVerificationSection({
    barcodeId: `rel-${turmaRefRel}`,
    barcodeValue: turmaRefRel,
    qrData: [
      `DOC: RELATORIO DE TURMA`,
      `ESCOLA: ${escolaNome}`,
      `TURMA: ${turma?.nome || 'N/D'} · ${turma?.classe || 'N/D'}`,
      `TURNO: ${turma?.turno || 'N/D'}`,
      `ANO: ${anoLetivo}`,
      `TRIMESTRE: ${trimestre}`,
      `TOTAL ALUNOS: ${alunos.length}`,
      `APROVADOS: ${aprovados}`,
      `EMITIDO: ${dataEmissaoRel}`,
      `REF: ${turmaRefRel}`,
    ].join('\n'),
    docRef: turmaRefRel,
    emitidoEm: dataEmissaoRel,
  });

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<title>Relatório ${turma?.nome} – ${trimestre}º Trimestre</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;background:#f0f0f0;color:#111;font-size:8.5pt}
.doc{background:white;margin:8mm auto;padding:12mm 14mm;border:1px solid #ddd;max-width:100%}
@media print{
  body{background:white}
  .doc{margin:0;border:none;padding:10mm}
  .no-print{display:none!important}
  table{font-size:7pt}
}
.header{display:flex;align-items:center;gap:14px;margin-bottom:8px;border-bottom:3px solid #1a2b5f;padding-bottom:8px}
.logo-box{width:50px;height:50px;background:#1a2b5f;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:18pt;font-weight:900;flex-shrink:0}
.escola-info{flex:1}
.escola-nome{font-size:13pt;font-weight:700;color:#1a2b5f}
.escola-sub{font-size:7pt;color:#6b7280;margin-top:2px}
.badge{text-align:right;padding:6px 10px;background:#1a2b5f;color:white;border-radius:6px}
.badge-label{font-size:6pt;letter-spacing:1.5px;opacity:.7;text-transform:uppercase}
.badge-val{font-size:9pt;font-weight:700}
.meta{display:flex;gap:12px;margin:8px 0;background:#f8fafc;padding:6px 10px;border-radius:6px;border:1px solid #e2e8f0;flex-wrap:wrap}
.meta-item{display:flex;flex-direction:column}
.meta-label{font-size:6pt;color:#9ca3af;text-transform:uppercase}
.meta-value{font-size:8.5pt;font-weight:600;color:#1e293b}
.stats{display:flex;gap:12px;margin:8px 0;flex-wrap:wrap}
.stat-card{flex:1;min-width:80px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:6px 10px;text-align:center}
.stat-val{font-size:14pt;font-weight:700;color:#0369a1}
.stat-label{font-size:6.5pt;color:#0369a1;text-transform:uppercase}
table{width:100%;border-collapse:collapse;margin-top:8px}
th{background:#1a2b5f;color:white;font-size:7.5pt;font-weight:600;padding:5px 6px;border:1px solid #233;text-align:left}
td{font-size:8pt;padding:4px 6px;border:1px solid #e2e8f0;color:#1e293b}
tr:nth-child(even) td{background:#f8fafc}
.center{text-align:center}
.mono{font-family:monospace;font-size:7.5pt}
.nota-cell{font-weight:700;font-size:9pt}
.nota-bom{color:#16a34a}
.nota-suf{color:#d97706}
.nota-neg{color:#dc2626}
.nota-neutro{color:#9ca3af}
.rodape{text-align:center;font-size:6.5pt;color:#9ca3af;margin-top:10px;border-top:1px dashed #e5e7eb;padding-top:6px}
.print-btn{position:fixed;top:10px;right:10px;background:#1a2b5f;color:white;border:none;padding:10px 18px;border-radius:8px;font-size:11pt;cursor:pointer;z-index:999}
${VERIF_CSS}
</style>
${JSBARCODE_CDN}
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">🖨 Imprimir</button><button class="no-print" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()" style="position:fixed;top:55px;right:10px;background:#166534;color:white;border:none;padding:10px 18px;border-radius:8px;font-size:11pt;cursor:pointer;z-index:999">📥 Guardar</button>
<div class="doc">
  <div class="header">
    <div class="logo-box">${escolaNome.charAt(0)}</div>
    <div class="escola-info">
      <div class="escola-nome">${escolaNome}</div>
      <div class="escola-sub">Relatório de Aproveitamento Escolar · Ano Lectivo ${anoLetivo}</div>
    </div>
    <div class="badge">
      <div class="badge-label">Período</div>
      <div class="badge-val">${trimestre}º Trimestre</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-item"><span class="meta-label">Turma</span><span class="meta-value">${turma?.nome || '—'}</span></div>
    <div class="meta-item"><span class="meta-label">Classe</span><span class="meta-value">${turma?.classe || '—'}</span></div>
    <div class="meta-item"><span class="meta-label">Turno</span><span class="meta-value">${turma?.turno || '—'}</span></div>
    <div class="meta-item"><span class="meta-label">Nº de Alunos</span><span class="meta-value">${alunos.length}</span></div>
    <div class="meta-item"><span class="meta-label">Emitido em</span><span class="meta-value">${fmtDate(new Date().toISOString())}</span></div>
  </div>

  <div class="stats">
    <div class="stat-card"><div class="stat-val">${alunos.length}</div><div class="stat-label">Total Alunos</div></div>
    <div class="stat-card" style="background:#f0fdf4;border-color:#bbf7d0"><div class="stat-val" style="color:#16a34a">${aprovados}</div><div class="stat-label" style="color:#16a34a">Aprovados</div></div>
    <div class="stat-card" style="background:#fff1f2;border-color:#fecdd3"><div class="stat-val" style="color:#dc2626">${alunos.length - aprovados}</div><div class="stat-label" style="color:#dc2626">Reprovados</div></div>
    <div class="stat-card" style="background:#fefce8;border-color:#fef08a"><div class="stat-val" style="color:#ca8a04">${alunos.length > 0 ? Math.round((aprovados / alunos.length) * 100) : 0}%</div><div class="stat-label" style="color:#ca8a04">Taxa Aprovação</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Nome do Aluno</th>
        <th class="center">Nº Mat.</th>
        ${discHeaders}
        <th class="center">Média</th>
        <th class="center">Resultado</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="100" style="text-align:center;color:#9ca3af;padding:16px">Sem dados de notas</td></tr>'}</tbody>
  </table>

  <div class="rodape">Emitido em ${fmtDate(new Date().toISOString())} · ${escolaNome} · Relatório gerado automaticamente pelo QUETA</div>
</div>
${autoprint ? `<script>window.onload=function(){setTimeout(function(){window.print()},600)}</script>` : ''}
</body>
</html>`;
}

// ─────────────────────────────────────────────
// REFERÊNCIA MULTICAIXA EXPRESS
// ─────────────────────────────────────────────
function gerarRefMulticaixa(alunoId: string, taxaId: string, seq: number): string {
  const seqStr = String(seq % 999999).padStart(6, '0');
  const hash = (alunoId + taxaId).split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  const checkDigit = Math.abs(hash) % 10;
  return `${seqStr}${checkDigit}`;
}

function buildMulticaixaHTML(aluno: any, turma: any, taxa: any, config: any, referencia: string, valor: number, dataValidade: string, autoprint: boolean): string {
  const escolaNome = config?.nomeEscola || 'Escola';
  const entidade = config?.numeroEntidade || '11333';
  const telefone = config?.telefoneMulticaixaExpress || '';
  const nomeCompleto = aluno ? `${aluno.nome || ''} ${aluno.apelido || ''}`.trim() : '—';
  const hoje = fmtDate(new Date().toISOString());
  const validade = fmtDate(dataValidade);

  const qrData = `MULTICAIXA|${entidade}|${referencia}|${valor}|AOA`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrData)}&ecc=M&color=1a2b5f`;

  const passosCash = `
    <li>Dirija-se a qualquer ATM Multicaixa ou Balcão Bancário</li>
    <li>Seleccione <strong>"Pagamento de Serviços"</strong></li>
    <li>Introduza a <strong>Entidade: ${entidade}</strong></li>
    <li>Introduza a <strong>Referência: ${referencia}</strong></li>
    <li>Confirme o valor de <strong>${fmtMoney(valor)} Kz</strong></li>
    <li>Guarde o comprovativo</li>`;

  const passosExpress = telefone ? `
    <li>Abra a app <strong>Multicaixa Express</strong></li>
    <li>Seleccione <strong>"Pagar"</strong> → <strong>"Serviços"</strong></li>
    <li>Entidade: <strong>${entidade}</strong> · Referência: <strong>${referencia}</strong></li>
    <li>Ou ligue <strong>*840#</strong> e siga as instruções</li>
    <li>Ou pague directamente ao número <strong>${telefone}</strong> com a descrição da referência</li>` : '';

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<title>Referência Multicaixa – ${nomeCompleto}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;background:#f0f0f0;color:#111;font-size:10pt}
.doc{background:white;width:210mm;margin:8mm auto;padding:14mm 16mm;border:1px solid #ddd;border-radius:4px}
@media print{
  body{background:white}
  .doc{margin:0;border:none;width:100%;padding:12mm}
  .no-print{display:none!important}
}
.header{display:flex;align-items:center;gap:14px;margin-bottom:12px;border-bottom:3px solid #00A651;padding-bottom:10px}
.logo-box{width:54px;height:54px;background:#00A651;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:20pt;font-weight:900;flex-shrink:0}
.escola-info{flex:1}
.escola-nome{font-size:13pt;font-weight:700;color:#1a2b5f}
.escola-sub{font-size:7.5pt;color:#6b7280;margin-top:2px}
.mcx-badge{background:#00A651;color:white;padding:6px 12px;border-radius:6px;text-align:center}
.mcx-badge-label{font-size:6pt;letter-spacing:1.5px;opacity:.8;text-transform:uppercase}
.mcx-badge-val{font-size:9pt;font-weight:700}
.ref-card{background:linear-gradient(135deg,#1a2b5f 0%,#243c7a 100%);color:white;border-radius:10px;padding:16px 20px;margin:12px 0;display:flex;align-items:center;gap:16px}
.ref-info{flex:1}
.ref-entidade-label{font-size:7pt;opacity:.7;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px}
.ref-entidade-val{font-size:22pt;font-weight:900;letter-spacing:4px;font-family:monospace}
.ref-num-label{font-size:7pt;opacity:.7;letter-spacing:1px;text-transform:uppercase;margin:8px 0 2px}
.ref-num-val{font-size:26pt;font-weight:900;letter-spacing:6px;font-family:monospace;color:#fbbf24}
.ref-valor{font-size:14pt;font-weight:700;color:#86efac;margin-top:8px}
.ref-validade{font-size:8pt;opacity:.7;margin-top:4px}
.qr-box{background:white;border-radius:8px;padding:8px;flex-shrink:0}
.qr-box img{display:block;width:140px;height:140px}
.aluno-section{display:grid;grid-template-columns:1fr 1fr;gap:6px;background:#f8fafc;border-radius:6px;padding:8px 12px;border:1px solid #e2e8f0;margin-bottom:12px}
.aluno-field{display:flex;flex-direction:column}
.aluno-label{font-size:6.5pt;color:#9ca3af;text-transform:uppercase;letter-spacing:1px}
.aluno-value{font-size:9pt;font-weight:600;color:#1e293b}
.instrucoes{margin:12px 0}
.instr-titulo{font-size:9pt;font-weight:700;color:#1a2b5f;letter-spacing:.5px;border-left:3px solid #00A651;padding-left:8px;margin-bottom:8px}
.instr-lista{list-style:none;padding:0}
.instr-lista li{padding:5px 8px;font-size:9pt;border-bottom:1px solid #f3f4f6;display:flex;gap:8px;align-items:flex-start}
.instr-lista li::before{content:"→";color:#00A651;font-weight:700;flex-shrink:0}
.aviso{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;font-size:8pt;color:#92400e;margin:10px 0}
.rodape{text-align:center;font-size:6.5pt;color:#9ca3af;margin-top:10px;border-top:1px dashed #e5e7eb;padding-top:6px}
.print-btn{position:fixed;top:10px;right:10px;background:#00A651;color:white;border:none;padding:10px 18px;border-radius:8px;font-size:11pt;cursor:pointer;z-index:999}
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">🖨 Imprimir</button><button class="no-print" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()" style="position:fixed;top:55px;right:10px;background:#166534;color:white;border:none;padding:10px 18px;border-radius:8px;font-size:11pt;cursor:pointer;z-index:999">📥 Guardar</button>
<div class="doc">
  <div class="header">
    <div class="logo-box">M</div>
    <div class="escola-info">
      <div class="escola-nome">${escolaNome}</div>
      <div class="escola-sub">Referência de Pagamento Multicaixa</div>
    </div>
    <div class="mcx-badge">
      <div class="mcx-badge-label">Sistema</div>
      <div class="mcx-badge-val">Multicaixa</div>
    </div>
  </div>

  <div class="ref-card">
    <div class="ref-info">
      <div class="ref-entidade-label">Entidade</div>
      <div class="ref-entidade-val">${entidade}</div>
      <div class="ref-num-label">Referência</div>
      <div class="ref-num-val">${referencia}</div>
      <div class="ref-valor">${fmtMoney(valor)} Kz</div>
      <div class="ref-validade">Válida até ${validade}</div>
    </div>
    <div class="qr-box">
      <img src="${qrUrl}" alt="QR Code" onerror="this.style.display='none'"/>
    </div>
  </div>

  <div class="aluno-section">
    <div class="aluno-field"><span class="aluno-label">Nome do Aluno</span><span class="aluno-value">${nomeCompleto}</span></div>
    <div class="aluno-field"><span class="aluno-label">Nº de Matrícula</span><span class="aluno-value">${aluno?.numeroMatricula || '—'}</span></div>
    <div class="aluno-field"><span class="aluno-label">Turma / Classe</span><span class="aluno-value">${turma?.nome || '—'}</span></div>
    <div class="aluno-field"><span class="aluno-label">Descrição do Pagamento</span><span class="aluno-value">${taxa?.descricao || taxa?.nome || '—'}</span></div>
    <div class="aluno-field"><span class="aluno-label">Data de Emissão</span><span class="aluno-value">${hoje}</span></div>
    <div class="aluno-field"><span class="aluno-label">Validade da Referência</span><span class="aluno-value">${validade}</span></div>
  </div>

  <div class="instrucoes">
    <div class="instr-titulo">Como pagar na ATM / Balcão Bancário</div>
    <ol class="instr-lista">${passosCash}</ol>
  </div>

  ${telefone ? `<div class="instrucoes">
    <div class="instr-titulo">Como pagar via Multicaixa Express</div>
    <ol class="instr-lista">${passosExpress}</ol>
  </div>` : ''}

  <div class="aviso">
    ⚠ Após efectuar o pagamento, guarde o comprovativo e apresente-o na secretaria para confirmar o pagamento no sistema.
    Esta referência é válida até <strong>${validade}</strong>. Após essa data deverá solicitar uma nova referência.
  </div>

  <div class="rodape">Emitido em ${hoje} · ${escolaNome} · Referência gerada pelo sistema QUETA</div>
</div>
${autoprint ? `<script>window.onload=function(){setTimeout(function(){window.print()},600)}</script>` : ''}
</body>
</html>`;
}

function buildHistoricoAcademicoHTML(aluno: any, turma: any, anosData: any[], config: any, autoprint: boolean): string {
  const escolaNome = config?.nomeEscola || 'Escola';
  const nomeCompleto = aluno ? `${aluno.nome || ''} ${aluno.apelido || ''}`.trim() : '—';
  const dataEmissao = fmtDate(new Date().toISOString());
  const matricula = aluno?.numeroMatricula || 'MAT000';

  const TRIM_COLORS: Record<number, string> = { 1: '#3b82f6', 2: '#f59e0b', 3: '#10b981' };

  let anosHTML = '';
  for (const h of anosData) {
    const { anoLetivo, notas, mediaGeral, presencasPct, situacao } = h;
    const situacaoCor = situacao === 'Aprovado' ? '#16a34a' : situacao === 'Reprovado' ? '#dc2626' : '#6b7280';

    const trimestres: Record<number, any[]> = { 1: [], 2: [], 3: [] };
    for (const n of notas) {
      if (trimestres[n.trimestre]) trimestres[n.trimestre].push(n);
    }

    let tabelasTrimHTML = '';
    for (const tri of [1, 2, 3]) {
      const notasTri = trimestres[tri];
      if (!notasTri.length) continue;
      const mediaTri = notasTri.reduce((s: number, n: any) => s + (Number(n.nf) > 0 ? Number(n.nf) : macCanonicaNota(n)), 0) / notasTri.length;
      const rows = notasTri.map((n: any) => {
        const macCan = macCanonicaNota(n);
        const nf = Number(n.nf) > 0 ? Number(n.nf) : macCan;
        const nfCls = nf >= 10 ? 'nota-bom' : nf > 0 ? 'nota-neg' : 'nota-neutro';
        return `<tr>
          <td>${n.disciplina || '—'}</td>
          <td class="center">${macCan > 0 ? macCan.toFixed(1) : (n.mac1 > 0 ? Number(n.mac1).toFixed(1) : '—')}</td>
          <td class="center">${n.pp1 > 0 ? n.pp1 : '—'}</td>
          <td class="center">${n.ppt > 0 ? n.ppt : '—'}</td>
          <td class="center ${nfCls}" style="font-weight:700">${nf > 0 ? Number(nf).toFixed(1) : '—'}</td>
        </tr>`;
      }).join('');
      const triCor = TRIM_COLORS[tri];
      tabelasTrimHTML += `
      <div class="trim-block">
        <div class="trim-header" style="background:${triCor}20;border-left:4px solid ${triCor};color:${triCor}">
          ${tri}º Trimestre &nbsp;—&nbsp; Média: <strong>${mediaTri.toFixed(1)}</strong>
        </div>
        <table>
          <thead><tr>
            <th style="text-align:left;width:38%">Disciplina</th>
            <th class="center">MAC</th><th class="center">PP</th>
            <th class="center">PT</th><th class="center">NF</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }

    if (!tabelasTrimHTML) tabelasTrimHTML = `<p class="sem-notas">Sem notas registadas neste ano lectivo.</p>`;

    const badge = `<span class="situacao-badge" style="background:${situacaoCor}20;color:${situacaoCor};border:1px solid ${situacaoCor}50">${situacao}</span>`;

    anosHTML += `
    <div class="ano-block">
      <div class="ano-header">
        <span class="ano-titulo">${anoLetivo}</span>
        ${badge}
        <span class="ano-stats">
          Média: <strong>${mediaGeral !== null ? Number(mediaGeral).toFixed(1) : '—'}</strong>
          &nbsp;·&nbsp; Presenças: <strong>${presencasPct}%</strong>
        </span>
      </div>
      ${tabelasTrimHTML}
    </div>`;
  }

  if (!anosHTML) anosHTML = `<p class="sem-notas">Sem histórico registado.</p>`;

  const verifSection = buildVerificationSection({
    barcodeId: `hist-${matricula}`,
    barcodeValue: matricula,
    qrData: [
      `DOC: HISTÓRICO ACADÉMICO`,
      `ESCOLA: ${escolaNome}`,
      `ALUNO: ${nomeCompleto}`,
      `MATRICULA: ${matricula}`,
      `TURMA: ${turma?.nome || 'N/D'}`,
      `EMITIDO: ${dataEmissao}`,
    ].join('\n'),
    docRef: `HIST-${matricula}`,
    emitidoEm: dataEmissao,
  });

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<title>Histórico Académico – ${nomeCompleto}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;background:#f0f0f0;color:#111;font-size:9pt}
.doc{background:white;width:210mm;min-height:297mm;margin:8mm auto;padding:14mm 16mm;border:1px solid #ddd}
@media print{body{background:white}.doc{margin:0;border:none;width:100%;padding:12mm}.no-print{display:none!important}}
.header{display:flex;align-items:center;gap:14px;margin-bottom:8px;border-bottom:3px solid #1a2b5f;padding-bottom:8px}
.logo-box{width:54px;height:54px;background:#1a2b5f;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:20pt;font-weight:900;flex-shrink:0}
.escola-info{flex:1}
.escola-nome{font-size:14pt;font-weight:700;color:#1a2b5f}
.escola-sub{font-size:7.5pt;color:#6b7280;margin-top:2px;letter-spacing:1px}
.titulo-doc{text-align:right;padding:8px 12px;background:#1a2b5f;color:white;border-radius:6px;min-width:130px}
.titulo-doc-label{font-size:6pt;letter-spacing:2px;opacity:.7}
.titulo-doc-val{font-size:9.5pt;font-weight:700}
.aluno-section{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0;background:#f8fafc;border-radius:6px;padding:8px 12px;border:1px solid #e2e8f0}
.aluno-field{display:flex;flex-direction:column;gap:1px}
.aluno-label{font-size:6.5pt;color:#9ca3af;text-transform:uppercase;letter-spacing:1px}
.aluno-value{font-size:9pt;font-weight:600;color:#1e293b}
.ano-block{margin:14px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;page-break-inside:avoid}
.ano-header{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#1a2b5f;flex-wrap:wrap}
.ano-titulo{font-size:11pt;font-weight:700;color:white}
.ano-stats{margin-left:auto;font-size:8pt;color:#cbd5e1}
.situacao-badge{font-size:7.5pt;font-weight:700;padding:2px 8px;border-radius:20px}
.trim-block{margin:0;border-bottom:1px solid #f1f5f9}
.trim-header{padding:5px 10px;font-size:8.5pt;font-weight:600;letter-spacing:.5px}
table{width:100%;border-collapse:collapse}
th{background:#f1f5f9;font-size:7.5pt;font-weight:700;color:#475569;padding:4px 8px;border:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:.5px}
td{font-size:8.5pt;padding:4px 8px;border:1px solid #e2e8f0;color:#1e293b}
tr:nth-child(even) td{background:#fafafa}
.center{text-align:center}
.nota-bom{color:#16a34a}
.nota-neg{color:#dc2626}
.nota-neutro{color:#9ca3af}
.sem-notas{color:#9ca3af;text-align:center;padding:16px;font-style:italic}
.footer{display:flex;justify-content:space-around;margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;gap:20px}
.assinatura-block{text-align:center;flex:1}
.assinatura-linha{border-top:1px solid #374151;margin:20px 10px 4px}
.assinatura-label{font-size:7pt;color:#6b7280}
.rodape{text-align:center;font-size:6.5pt;color:#9ca3af;margin-top:10px;border-top:1px dashed #e5e7eb;padding-top:6px}
.print-btn{position:fixed;top:10px;right:10px;background:#1a2b5f;color:white;border:none;padding:10px 18px;border-radius:8px;font-size:11pt;cursor:pointer;z-index:999}
${VERIF_CSS}
</style>
${JSBARCODE_CDN}
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">🖨 Imprimir</button><button class="no-print" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()" style="position:fixed;top:55px;right:10px;background:#166534;color:white;border:none;padding:10px 18px;border-radius:8px;font-size:11pt;cursor:pointer;z-index:999">📥 Guardar</button>
<div class="doc">
  <div class="header">
    <div class="logo-box">${escolaNome.charAt(0)}</div>
    <div class="escola-info">
      <div class="escola-nome">${escolaNome}</div>
      <div class="escola-sub">SISTEMA INTEGRADO DE GESTÃO ACADÉMICA</div>
    </div>
    <div class="titulo-doc">
      <div class="titulo-doc-label">DOCUMENTO OFICIAL</div>
      <div class="titulo-doc-val">HISTÓRICO ACADÉMICO</div>
    </div>
  </div>

  <div class="aluno-section">
    <div class="aluno-field"><span class="aluno-label">Nome Completo</span><span class="aluno-value">${nomeCompleto}</span></div>
    <div class="aluno-field"><span class="aluno-label">Nº de Matrícula</span><span class="aluno-value">${matricula}</span></div>
    <div class="aluno-field"><span class="aluno-label">Turma Actual</span><span class="aluno-value">${turma?.nome || '—'} · ${turma?.classe || '—'}</span></div>
    <div class="aluno-field"><span class="aluno-label">Turno</span><span class="aluno-value">${turma?.turno || '—'}</span></div>
    <div class="aluno-field"><span class="aluno-label">Encarregado de Educação</span><span class="aluno-value">${aluno?.nomeEncarregado || '—'}</span></div>
    <div class="aluno-field"><span class="aluno-label">Data de Emissão</span><span class="aluno-value">${dataEmissao}</span></div>
  </div>

  ${anosHTML}

  ${verifSection}

  <div class="footer">
    <div class="assinatura-block"><div class="assinatura-linha"></div><div class="assinatura-label">Director(a) Pedagógico(a)</div></div>
    <div class="assinatura-block"><div class="assinatura-linha"></div><div class="assinatura-label">Director(a) Geral</div></div>
    <div class="assinatura-block"><div class="assinatura-linha"></div><div class="assinatura-label">Encarregado de Educação</div></div>
  </div>
  <div class="rodape">Emitido em ${dataEmissao} · ${escolaNome} · Documento Oficial · Lei n.º 17/16 Angola</div>
</div>
${autoprint ? `<script>window.onload=function(){setTimeout(function(){window.print()},600)}</script>` : ''}
</body>
</html>`;
}

export function registerPDFRoutes(app: Express) {
  // ─── RECIBO INDIVIDUAL ───
  app.get('/api/pdf/recibo/:pagamentoId', requireAuth, async (req: Request, res: Response) => {
    try {
      const { pagamentoId } = req.params;
      const autoprint = req.query.autoprint !== 'false';

      const rows = await query<any>(`SELECT * FROM public.pagamentos WHERE id=$1`, [pagamentoId]);
      if (!rows.length) return res.status(404).json({ error: 'Pagamento não encontrado' });
      const p = rows[0];

      const alunoRows = await query<any>(`SELECT * FROM public.alunos WHERE id=$1`, [p.alunoId]);
      const aluno = alunoRows[0] || null;

      const turmaRows = aluno?.turmaId
        ? await query<any>(`SELECT * FROM public.turmas WHERE id=$1`, [aluno.turmaId])
        : [];
      const turma = turmaRows[0] || null;

      const configRows = await query<any>(`SELECT * FROM public.config_geral LIMIT 1`, []);
      const config = configRows[0] || {};

      const multaCfg = (config.multaConfig || {}) as any;
      const isencaoRows = await query<any>(`SELECT * FROM public.multa_isencoes WHERE "alunoId"=$1 AND status='aprovado' LIMIT 1`, [p.alunoId]).catch(() => []);
      const isento = isencaoRows.length > 0;
      let valorMulta = 0;
      if (multaCfg.ativo && !isento && p.tipoTaxa === 'propina') {
        const hoje = new Date();
        const diaInicio = multaCfg.diaInicioMulta || 10;
        const meses = p.mes ? Math.max(0, (hoje.getMonth() + 1) - p.mes) : 0;
        if (meses > 0) {
          if ((multaCfg.valorPorDia || 0) > 0) {
            const diasDesdeInicio = Math.max(0, hoje.getDate() - diaInicio);
            valorMulta = Math.round((multaCfg.valorPorDia || 0) * (diasDesdeInicio + meses * 30));
          } else if ((multaCfg.percentagemPorDia || 0) > 0) {
            const diasDesdeInicio = Math.max(0, hoje.getDate() - diaInicio);
            const totalDias = diasDesdeInicio + meses * 30;
            valorMulta = Math.round(Number(p.valor || 0) * ((multaCfg.percentagemPorDia || 0) / 100) * totalDias);
          } else {
            valorMulta = Math.round(Number(p.valor || 0) * ((multaCfg.percentagem || 10) / 100) * meses);
          }
        }
      }
      p.escolaNome = config.nomeEscola || '';
      const multaInfo = { valor: valorMulta, isento };

      // ── Registar a emissão ANTES de gerar o HTML para calcular a "via" ──
      let viaNumber = 1;
      try {
        const u = (req as any).jwtUser || {};
        const ip = (req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || req.socket?.remoteAddress || null;
        await query(
          `INSERT INTO public.recibo_emissoes ("pagamentoId","userId","userNome","userEmail","userRole","ipAddress","userAgent")
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [pagamentoId, u.userId || null, u.nome || null, u.email || null, u.role || null, ip, req.headers['user-agent'] || null]
        );
        const cntRowsPre = await query<{ total: number }>(
          `SELECT COUNT(*)::int AS total FROM public.recibo_emissoes WHERE "pagamentoId"=$1`,
          [pagamentoId]
        );
        viaNumber = Math.max(1, Number(cntRowsPre[0]?.total || 1));
      } catch (insErr) { console.warn('[recibo_emissoes] insert falhou:', (insErr as Error).message); }

      // ── SAF-T: atribuir número de série sequencial e cadeia de hash ──
      try {
        const pWithSerie = await garantirNumeracaoPagamento(pagamentoId);
        if (pWithSerie) {
          p.numeroSerie  = pWithSerie.numeroSerie;
          p.hashDoc      = pWithSerie.hashDoc;
          p.hashAnterior = pWithSerie.hashAnterior;
        }
      } catch (saftErr) { console.warn('[saft] Falha ao atribuir número de série:', (saftErr as Error).message); }

      // ── NIF da escola (para o recibo SAF-T compliant) ──
      p.nifEscola = config.nif || config.nifEscola || '';

      // ── Gerar QR code localmente apontando para a página de verificação ──
      let qrDataUrl: string | undefined;
      try {
        const numRef = p.numeroSerie || `REC-${(p.id || '').replace(/-/g,'').substring(0,8).toUpperCase()}`;
        const publicDomain =
          process.env.REPLIT_DOMAINS
            ? `https://${process.env.REPLIT_DOMAINS.split(',')[0].trim()}`
            : process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : `${req.protocol}://${req.get('host')}`;
        const verifUrl = `${publicDomain}/verificar-recibo/${encodeURIComponent(numRef)}`;
        qrDataUrl = await buildLocalQRDataUrl(verifUrl, 110);
      } catch { /* fallback to external QR in buildReciboBody */ }

      // ── Gerar código de barras localmente (server-side, sem CDN) ──
      let barcodeSvg: string | undefined;
      try {
        const numRef = p.numeroSerie || `REC-${(p.id || '').replace(/-/g,'').substring(0,8).toUpperCase()}`;
        const barcodeVal = safeBarcode(numRef.replace(/\s/g, '-').substring(0, 30));
        const svg = await buildLocalBarcodeSvg(barcodeVal);
        if (svg) barcodeSvg = svg;
      } catch { /* use JsBarcode CDN fallback */ }

      const body = buildReciboBody(p, aluno, turma, 0, multaInfo, viaNumber, qrDataUrl, barcodeSvg);
      const escolaNome = config.nomeEscola || 'Escola';

      if (config.nomeEscola) {
        const logoHtml = config.logoUrl
          ? `<img src="${config.logoUrl}" style="width:56px;height:56px;object-fit:contain;border-radius:8px"/>`
          : `<div class="logo-box"><div class="logo-inner"><div style="font-size:18pt;font-weight:900;color:white">${escolaNome.charAt(0)}</div></div></div>`;

        const updatedBody = body
          .replace('<div class="logo-box"><div class="logo-inner"><div style="font-size:18pt;font-weight:900;color:white;letter-spacing:-1px;">A</div></div></div>', logoHtml)
          .replace('<div class="escola-nome">ESCOLA</div>', `<div class="escola-nome">${escolaNome}</div>`);

        const html = buildPageHTML([updatedBody], escolaNome, autoprint);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      } else {
        const html = buildPageHTML([body], escolaNome, autoprint);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      }

      try {
        const u = (req as any).jwtUser || {};
        // ── Alerta automático: emissões excessivas do mesmo recibo ──
        const LIMITE = 3;
        const cntRows = await query<{ total: number }>(
          `SELECT COUNT(*)::int AS total FROM public.recibo_emissoes WHERE "pagamentoId"=$1`,
          [pagamentoId]
        );
        const total = Number(cntRows[0]?.total || 0);
        if (total > LIMITE) {
          const nomeUser = u.nome || u.email || 'Utilizador';
          const nomeAluno = aluno?.nomeCompleto || 'aluno';
          const tipo = total === LIMITE + 1 ? 'aviso' : 'urgente';
          const titulo = total === LIMITE + 1
            ? `Recibo impresso ${total} vezes — verificar`
            : `Recibo impresso ${total} vezes — possível duplicação`;
          const mensagem = `${nomeUser} acabou de imprimir o recibo de ${nomeAluno} (RUPE ${p.referencia || '—'}). Já foi emitido ${total} vezes — limite recomendado: ${LIMITE}.`;
          const hoje = new Date().toISOString().slice(0, 10);
          const financeRows = await query<{ id: string }>(
            `SELECT id FROM public.utilizadores WHERE role IN ('financeiro','admin','director','ceo','pca') AND ativo=true`,
            []
          );
          for (const fin of financeRows) {
            await query(
              `INSERT INTO public.notificacoes ("utilizadorId","titulo","mensagem","tipo","data","lida","link")
               VALUES ($1,$2,$3,$4,$5,false,$6)`,
              [fin.id, titulo, mensagem, tipo, hoje, '/(main)/pagamentos-hub']
            );
          }
        }
      } catch (logErr) { console.warn('[recibo_emissoes] insert/alert falhou:', (logErr as Error).message); }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── RECIBOS POR ALUNO ───
  app.get('/api/pdf/recibos-aluno/:alunoId', requireAuth, async (req: Request, res: Response) => {
    try {
      const { alunoId } = req.params;
      const { mes, ano, status, autoprint } = req.query as Record<string, string>;

      let sql = `SELECT * FROM public.pagamentos WHERE "alunoId"=$1`;
      const params: any[] = [alunoId];
      if (mes) { sql += ` AND mes=$${params.length+1}`; params.push(Number(mes)); }
      if (ano) { sql += ` AND ano=$${params.length+1}`; params.push(ano); }
      if (status) { sql += ` AND status=$${params.length+1}`; params.push(status); }
      sql += ` ORDER BY ano, mes`;

      const rows = await query<any>(sql, params);
      if (!rows.length) return res.status(404).send('<h3>Nenhum pagamento encontrado</h3>');

      const alunoRows = await query<any>(`SELECT * FROM public.alunos WHERE id=$1`, [alunoId]);
      const aluno = alunoRows[0] || null;

      const turmaRows = aluno?.turmaId
        ? await query<any>(`SELECT * FROM public.turmas WHERE id=$1`, [aluno.turmaId])
        : [];
      const turma = turmaRows[0] || null;

      const configRows = await query<any>(`SELECT * FROM public.config_geral LIMIT 1`, []);
      const config = configRows[0] || {};
      const escolaNome = config.nomeEscola || 'Escola';

      // Atribuir numeração SAF-T a pagamentos pagos sem série
      for (const p of rows) {
        if (!p.numeroSerie && p.status === 'pago') {
          try {
            const r = await garantirNumeracaoPagamento(p.id);
            p.numeroSerie  = r.numeroSerie;
            p.hashDoc      = r.hashDoc;
            p.hashAnterior = r.hashAnterior;
          } catch { /* fallback silencioso */ }
        }
      }
      const bodies = await Promise.all(rows.map(async (p: any, i: number) => {
        let bSvg: string | undefined;
        try {
          const ref = p.numeroSerie || `REC-${(p.id||'').replace(/-/g,'').substring(0,8).toUpperCase()}`;
          const svg = await buildLocalBarcodeSvg(safeBarcode(ref.replace(/\s/g,'-').substring(0,30)));
          if (svg) bSvg = svg;
        } catch { /* fallback */ }
        return buildReciboBody(p, aluno, turma, i, undefined, 1, undefined, bSvg);
      }));
      const html = buildPageHTML(bodies, escolaNome, autoprint !== 'false');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── RECIBOS POR TURMA ───
  app.get('/api/pdf/recibos-turma/:turmaId', requireAuth, async (req: Request, res: Response) => {
    try {
      const { turmaId } = req.params;
      const { mes, ano, status } = req.query as Record<string, string>;

      const alunoRows = await query<any>(`SELECT * FROM public.alunos WHERE "turmaId"=$1 ORDER BY nome, apelido`, [turmaId]);
      if (!alunoRows.length) return res.status(404).send('<h3>Nenhum aluno encontrado</h3>');

      const configRows = await query<any>(`SELECT * FROM public.config_geral LIMIT 1`, []);
      const config = configRows[0] || {};
      const escolaNome = config.nomeEscola || 'Escola';

      const turmaDbRows = await query<any>(`SELECT * FROM public.turmas WHERE id=$1`, [turmaId]);
      const turma = turmaDbRows[0] || null;

      const alunoIds = alunoRows.map((a: any) => a.id);
      let sql = `SELECT * FROM public.pagamentos WHERE "alunoId" = ANY($1::text[])`;
      const params: any[] = [alunoIds];
      if (mes) { sql += ` AND mes=$${params.length+1}`; params.push(Number(mes)); }
      if (ano) { sql += ` AND ano=$${params.length+1}`; params.push(ano); }
      if (status) { sql += ` AND status=$${params.length+1}`; params.push(status); }
      sql += ` ORDER BY "alunoId", ano, mes`;

      const pagRows = await query<any>(sql, params);
      if (!pagRows.length) return res.status(404).send('<h3>Nenhum pagamento encontrado para os filtros aplicados</h3>');

      const alunoMap = Object.fromEntries(alunoRows.map((a: any) => [a.id, a]));
      const grouped: Record<string, any[]> = {};
      for (const p of pagRows) {
        if (!grouped[p.alunoId]) grouped[p.alunoId] = [];
        grouped[p.alunoId].push(p);
      }

      const bodies: string[] = [];
      let globalIdx = 0;
      for (const [alunoId, pags] of Object.entries(grouped)) {
        const aluno = alunoMap[alunoId];
        for (const pag of pags) {
          if (!pag.numeroSerie && pag.status === 'pago') {
            try {
              const r = await garantirNumeracaoPagamento(pag.id);
              pag.numeroSerie  = r.numeroSerie;
              pag.hashDoc      = r.hashDoc;
              pag.hashAnterior = r.hashAnterior;
            } catch { /* fallback silencioso */ }
          }
          let bSvg: string | undefined;
          try {
            const ref = pag.numeroSerie || `REC-${(pag.id||'').replace(/-/g,'').substring(0,8).toUpperCase()}`;
            const svg = await buildLocalBarcodeSvg(safeBarcode(ref.replace(/\s/g,'-').substring(0,30)));
            if (svg) bSvg = svg;
          } catch { /* fallback */ }
          bodies.push(buildReciboBody(pag, aluno, turma, globalIdx++, undefined, 1, undefined, bSvg));
        }
      }

      const html = buildPageHTML(bodies, escolaNome, false);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── RECIBOS PENDENTES ───
  app.get('/api/pdf/recibos-pendentes', requireAuth, async (req: Request, res: Response) => {
    try {
      const { metodo, ano } = req.query as Record<string, string>;

      let sql = `SELECT * FROM public.pagamentos WHERE status='pendente'`;
      const params: any[] = [];
      if (metodo) { sql += ` AND "metodoPagamento"=$${params.length+1}`; params.push(metodo); }
      if (ano) { sql += ` AND ano=$${params.length+1}`; params.push(ano); }
      sql += ` ORDER BY "createdAt" DESC`;

      const pagRows = await query<any>(sql, params);
      if (!pagRows.length) return res.status(404).send('<h3>Nenhum pagamento pendente</h3>');

      const configRows = await query<any>(`SELECT * FROM public.config_geral LIMIT 1`, []);
      const config = configRows[0] || {};
      const escolaNome = config.nomeEscola || 'Escola';

      const bodies: string[] = [];
      for (let i = 0; i < pagRows.length; i++) {
        const p = pagRows[i];
        const alunoRows = await query<any>(`SELECT * FROM public.alunos WHERE id=$1`, [p.alunoId]);
        const aluno = alunoRows[0] || null;
        const turmaRows = aluno?.turmaId
          ? await query<any>(`SELECT * FROM public.turmas WHERE id=$1`, [aluno.turmaId])
          : [];
        let bSvg: string | undefined;
        try {
          const ref = p.numeroSerie || `REC-${(p.id||'').replace(/-/g,'').substring(0,8).toUpperCase()}`;
          const svg = await buildLocalBarcodeSvg(safeBarcode(ref.replace(/\s/g,'-').substring(0,30)));
          if (svg) bSvg = svg;
        } catch { /* fallback */ }
        bodies.push(buildReciboBody(p, aluno, turmaRows[0] || null, i, undefined, 1, undefined, bSvg));
      }

      const html = buildPageHTML(bodies, escolaNome, false);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── BOLETIM DE NOTAS ───
  app.get('/api/pdf/boletim/:alunoId', requireAuth, async (req: Request, res: Response) => {
    try {
      const { alunoId } = req.params;
      const { trimestre, autoprint } = req.query as Record<string, string>;

      const alunoRows = await query<any>(`SELECT * FROM public.alunos WHERE id=$1`, [alunoId]);
      if (!alunoRows.length) return res.status(404).json({ error: 'Aluno não encontrado' });
      const aluno = alunoRows[0];

      const turmaRows = aluno.turmaId
        ? await query<any>(`SELECT * FROM public.turmas WHERE id=$1`, [aluno.turmaId])
        : [];
      const turma = turmaRows[0] || null;

      let notasSql = `SELECT * FROM public.notas WHERE "alunoId"=$1`;
      const notasParams: any[] = [alunoId];
      if (trimestre) {
        notasSql += ` AND trimestre=$${notasParams.length+1}`;
        notasParams.push(Number(trimestre));
      }
      notasSql += ` ORDER BY disciplina, trimestre`;
      const notas = await query<any>(notasSql, notasParams);

      const configRows = await query<any>(`SELECT * FROM public.config_geral LIMIT 1`, []);
      const config = configRows[0] || {};

      const discInfoRows = await query<any>(`SELECT nome, "categoriaFormacao" FROM public.disciplinas WHERE ativo=true`, []);
      const html = buildBoletimHTML(aluno, turma, notas, config, trimestre ? Number(trimestre) : null, autoprint !== 'false', discInfoRows);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── DECLARAÇÃO ───
  app.get('/api/pdf/declaracao/:alunoId', requireAuth, async (req: Request, res: Response) => {
    try {
      const { alunoId } = req.params;
      const tipo = (req.query.tipo as string) || 'matricula';
      const autoprint = req.query.autoprint !== 'false';

      const alunoRows = await query<any>(`SELECT * FROM public.alunos WHERE id=$1`, [alunoId]);
      if (!alunoRows.length) return res.status(404).json({ error: 'Aluno não encontrado' });
      const aluno = alunoRows[0];

      const turmaRows = aluno.turmaId
        ? await query<any>(`SELECT * FROM public.turmas WHERE id=$1`, [aluno.turmaId])
        : [];
      const turma = turmaRows[0] || null;

      const configRows = await query<any>(`SELECT * FROM public.config_geral LIMIT 1`, []);
      const config = configRows[0] || {};

      // Declaração de Habilitações — inclui lista de disciplinas com notas finais
      if (tipo === 'habilitacoes') {
        const notas = await query<any>(
          `SELECT DISTINCT ON (disciplina) * FROM public.notas
           WHERE "alunoId"=$1
           ORDER BY disciplina, trimestre DESC`,
          [alunoId]
        );
        const discInfoRowsH = await query<any>(`SELECT nome, "categoriaFormacao" FROM public.disciplinas WHERE ativo=true`, []);
        const html = buildHabilitacoesHTML(aluno, turma, config, notas, autoprint, discInfoRowsH);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      }

      const html = buildDeclaracaoHTML(aluno, turma, config, tipo, autoprint);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── RELATÓRIO DE TURMA ───
  app.get('/api/pdf/relatorio-turma/:turmaId', requireAuth, async (req: Request, res: Response) => {
    try {
      const { turmaId } = req.params;
      const trimestre = Number(req.query.trimestre) || 1;
      const autoprint = req.query.autoprint !== 'false';

      const turmaRows = await query<any>(`SELECT * FROM public.turmas WHERE id=$1`, [turmaId]);
      if (!turmaRows.length) return res.status(404).json({ error: 'Turma não encontrada' });
      const turma = turmaRows[0];

      const alunoRows = await query<any>(
        `SELECT * FROM public.alunos WHERE "turmaId"=$1 AND ativo=true ORDER BY nome, apelido`,
        [turmaId]
      );

      const alunoIds = alunoRows.map((a: any) => a.id);
      const notas = alunoIds.length
        ? await query<any>(
            `SELECT * FROM public.notas WHERE "alunoId" = ANY($1::text[]) AND trimestre=$2 ORDER BY disciplina`,
            [alunoIds, trimestre]
          )
        : [];

      const configRows = await query<any>(`SELECT * FROM public.config_geral LIMIT 1`, []);
      const config = configRows[0] || {};

      const html = buildRelatorioTurmaHTML(turma, alunoRows, notas, config, trimestre, autoprint);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── EXTRACTO DE PROPINAS ───
  app.get('/api/pdf/extrato-propinas/:alunoId', requireAuth, async (req: Request, res: Response) => {
    try {
      const { alunoId } = req.params;
      const { dataInicio, dataFim, autoprint } = req.query as Record<string, string>;

      const alunoRows = await query<any>(
        `SELECT a.*, t.nome as "turmaNome", c.nome as "cursoNome"
         FROM public.alunos a
         LEFT JOIN public.turmas t ON t.id = a."turmaId"
         LEFT JOIN public.cursos c ON c.id = a."cursoId"
         WHERE a.id = $1`,
        [alunoId]
      );
      if (!alunoRows.length) return res.status(404).json({ error: 'Aluno não encontrado' });
      const aluno = alunoRows[0];

      let whereDate = '';
      const params: any[] = [alunoId];
      if (dataInicio) { params.push(dataInicio); whereDate += ` AND p.data >= $${params.length}`; }
      if (dataFim)    { params.push(dataFim);    whereDate += ` AND p.data <= $${params.length}`; }

      const pagamentos = await query<any>(
        `SELECT p.*, t.descricao as "taxaDescricao", t.tipo as "taxaTipo"
         FROM public.pagamentos p
         LEFT JOIN public.taxas t ON t.id = p."taxaId"
         WHERE p."alunoId" = $1 ${whereDate}
         ORDER BY p.data ASC, p."createdAt" ASC`,
        params
      );

      const totalPago      = pagamentos.filter((p: any) => p.status === 'pago').reduce((s: number, p: any) => s + Number(p.valor || 0), 0);
      const totalPendente  = pagamentos.filter((p: any) => p.status === 'pendente').reduce((s: number, p: any) => s + Number(p.valor || 0), 0);
      const totalCancelado = pagamentos.filter((p: any) => p.status === 'cancelado').reduce((s: number, p: any) => s + Number(p.valor || 0), 0);

      const configRows = await query<any>(`SELECT * FROM public.config_geral LIMIT 1`, []);
      const cfg = configRows[0] || {};

      const html = buildExtratoHTML({
        aluno,
        pagamentos,
        resumo: { totalPago, totalPendente, totalCancelado, total: pagamentos.length },
        filtros: { dataInicio: dataInicio || null, dataFim: dataFim || null },
        nomeEscola: cfg.nomeEscola,
        directorGeral: cfg.directorGeral,
        chefeSecretaria: cfg.chefeSecretaria,
        autoprint: autoprint !== 'false',
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── REFERÊNCIA MULTICAIXA ───
  app.get('/api/pdf/multicaixa/:rupeId', requireAuth, async (req: Request, res: Response) => {
    try {
      const { rupeId } = req.params;
      const autoprint = req.query.autoprint !== 'false';

      const rupeRows = await query<any>(`SELECT * FROM public.rupes WHERE id=$1`, [rupeId]);
      if (!rupeRows.length) return res.status(404).json({ error: 'Referência não encontrada' });
      const rupe = rupeRows[0];

      const alunoRows = await query<any>(`SELECT * FROM public.alunos WHERE id=$1`, [rupe.alunoId]);
      const aluno = alunoRows[0] || null;

      const turmaRows = aluno?.turmaId
        ? await query<any>(`SELECT * FROM public.turmas WHERE id=$1`, [aluno.turmaId])
        : [];
      const turma = turmaRows[0] || null;

      const taxaRows = await query<any>(`SELECT * FROM public.taxas WHERE id=$1`, [rupe.taxaId]);
      const taxa = taxaRows[0] || null;

      const configRows = await query<any>(`SELECT * FROM public.config_geral LIMIT 1`, []);
      const config = configRows[0] || {};

      const html = buildMulticaixaHTML(aluno, turma, taxa, config, rupe.referencia, rupe.valor, rupe.dataValidade, autoprint);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── GERAR REFERÊNCIA MULTICAIXA (nova, sem rupe existente) ───
  // ─── HISTÓRICO ACADÉMICO ───
  app.get('/api/pdf/historico-academico/:alunoId', requireAuth, async (req: Request, res: Response) => {
    try {
      const { alunoId } = req.params;
      const autoprint = req.query.autoprint !== 'false';

      const alunoRows = await query<any>(`SELECT * FROM public.alunos WHERE id=$1`, [alunoId]);
      if (!alunoRows.length) return res.status(404).json({ error: 'Aluno não encontrado' });
      const aluno = alunoRows[0];

      const turmaRows = aluno.turmaId
        ? await query<any>(`SELECT * FROM public.turmas WHERE id=$1`, [aluno.turmaId])
        : [];
      const turma = turmaRows[0] || null;

      const notasRows = await query<any>(
        `SELECT * FROM public.notas WHERE "alunoId"=$1 ORDER BY "anoLetivo", trimestre, disciplina`,
        [alunoId]
      );

      const presencasRows = await query<any>(
        `SELECT * FROM public.presencas WHERE "alunoId"=$1`,
        [alunoId]
      );

      const anosSet = Array.from(new Set(notasRows.map((n: any) => n.anoLetivo as string))).sort();

      const anosData = anosSet.map((anoLetivo: string) => {
        const notas = notasRows.filter((n: any) => n.anoLetivo === anoLetivo);
        const presAno = presencasRows;
        const mediaGeral = notas.length > 0
          ? notas.reduce((s: number, n: any) => s + (Number(n.nf) > 0 ? Number(n.nf) : macCanonicaNota(n)), 0) / notas.length
          : null;
        const presencasPct = presAno.length > 0
          ? Math.round((presAno.filter((p: any) => p.status === 'P').length / presAno.length) * 100)
          : 100;
        const situacao = mediaGeral === null ? 'Em curso' : mediaGeral >= 10 ? 'Aprovado' : 'Reprovado';
        return { anoLetivo, notas, mediaGeral, presencasPct, situacao };
      });

      const configRows = await query<any>(`SELECT * FROM public.config_geral LIMIT 1`, []);
      const config = configRows[0] || {};

      const html = buildHistoricoAcademicoHTML(aluno, turma, anosData, config, autoprint);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── RELATÓRIO MENSAL DA BIBLIOTECA ───
  app.get('/api/pdf/biblioteca/relatorio-mensal', requireAuth, async (req: Request, res: Response) => {
    try {
      const now = new Date();
      const mes = parseInt((req.query.mes as string) || String(now.getMonth() + 1));
      const ano = parseInt((req.query.ano as string) || String(now.getFullYear()));

      const configRows = await query<any>(`SELECT * FROM public.config_geral LIMIT 1`, []);
      const cfg = configRows[0] || {};
      const nomeEscola = cfg.nomeEscola || 'Escola';
      const mesNome = MESES[mes] || '';

      const topLivrosRows = await query<any>(
        `SELECT "livroTitulo", COUNT(*) AS total
         FROM public.emprestimos
         WHERE EXTRACT(MONTH FROM "dataEmprestimo") = $1
           AND EXTRACT(YEAR FROM "dataEmprestimo") = $2
         GROUP BY "livroTitulo"
         ORDER BY total DESC
         LIMIT 10`,
        [mes, ano]
      );

      const totalMesRows = await query<any>(
        `SELECT COUNT(*) AS total FROM public.emprestimos
         WHERE EXTRACT(MONTH FROM "dataEmprestimo") = $1
           AND EXTRACT(YEAR FROM "dataEmprestimo") = $2`,
        [mes, ano]
      );

      const atrasosMesRows = await query<any>(
        `SELECT COUNT(*) AS total FROM public.emprestimos
         WHERE status='atrasado'
           AND EXTRACT(MONTH FROM "dataEmprestimo") = $1
           AND EXTRACT(YEAR FROM "dataEmprestimo") = $2`,
        [mes, ano]
      );

      const devolvidosMesRows = await query<any>(
        `SELECT COUNT(*) AS total FROM public.emprestimos
         WHERE status='devolvido'
           AND EXTRACT(MONTH FROM "dataEmprestimo") = $1
           AND EXTRACT(YEAR FROM "dataEmprestimo") = $2`,
        [mes, ano]
      );

      const livrosRows = await query<any>(`SELECT * FROM public.livros WHERE ativo=true ORDER BY titulo ASC`, []);
      const totalLivros = livrosRows.reduce((s: number, l: any) => s + Number(l.quantidadeTotal || 0), 0);
      const totalDisp   = livrosRows.reduce((s: number, l: any) => s + Number(l.quantidadeDisponivel || 0), 0);
      const taxaOcupacao = totalLivros > 0 ? Math.round(((totalLivros - totalDisp) / totalLivros) * 100) : 0;

      const catCounts: Record<string, number> = {};
      livrosRows.forEach((l: any) => { catCounts[l.categoria] = (catCounts[l.categoria] || 0) + 1; });
      const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

      const penRows = await query<any>(
        `SELECT "nomeLeitor", COUNT(*) AS total_atrasos
         FROM public.emprestimos
         WHERE status = 'devolvido' AND "dataDevolucao" IS NOT NULL AND "dataDevolucao" > "dataPrevistaDevolucao"
         GROUP BY "nomeLeitor" HAVING COUNT(*) >= 2 ORDER BY total_atrasos DESC LIMIT 10`,
        []
      );

      const totalEmprestimos = Number(totalMesRows[0]?.total || 0);
      const totalAtrasados   = Number(atrasosMesRows[0]?.total || 0);
      const totalDevolvidos  = Number(devolvidosMesRows[0]?.total || 0);
      const topLivros = topLivrosRows.map((r: any) => ({ titulo: r.livroTitulo, total: Number(r.total) }));
      const maxTotal  = topLivros[0]?.total || 1;

      const catRows = topCats.map(([cat, count]) => `
        <tr>
          <td>${cat}</td>
          <td style="text-align:center">${count}</td>
          <td style="text-align:center">${livrosRows.length > 0 ? Math.round((count / livrosRows.length) * 100) : 0}%</td>
        </tr>`).join('');

      const livroRows = topLivros.map((l: any, i: number) => `
        <tr>
          <td style="text-align:center;font-weight:700;color:#1a2b5f">${i + 1}</td>
          <td>${l.titulo}</td>
          <td style="text-align:center;font-weight:700">${l.total}</td>
          <td>
            <div style="background:#e8ecf5;border-radius:4px;height:10px;width:100%;overflow:hidden">
              <div style="height:10px;background:#1a2b5f;border-radius:4px;width:${Math.round((l.total / maxTotal) * 100)}%"></div>
            </div>
          </td>
        </tr>`).join('');

      const penRows2 = penRows.map((p: any) => `
        <tr>
          <td>${p.nomeLeitor}</td>
          <td style="text-align:center;color:#c0392b;font-weight:700">${p.total_atrasos}</td>
        </tr>`).join('');

      const emitidoEm = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
      const docRef = `BIB-${String(mes).padStart(2,'0')}${ano}-${Date.now().toString(36).toUpperCase().slice(-4)}`;

      const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<title>Relatório Mensal da Biblioteca — ${mesNome} ${ano}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:10pt;color:#222;background:#fff;padding:24px 32px}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #1a2b5f;padding-bottom:14px;margin-bottom:18px}
  .header-title{font-size:18pt;font-weight:800;color:#1a2b5f}
  .header-sub{font-size:10pt;color:#555;margin-top:2px}
  .escola{font-size:10pt;color:#888;text-align:right}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
  .kpi{background:#f0f4ff;border:1px solid #dde3f5;border-radius:8px;padding:10px 14px;text-align:center}
  .kpi-val{font-size:22pt;font-weight:800;color:#1a2b5f}
  .kpi-label{font-size:8pt;color:#666;margin-top:2px;text-transform:uppercase;letter-spacing:.4px}
  .section{margin-bottom:18px}
  .section-title{font-size:11pt;font-weight:700;color:#1a2b5f;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #dde3f5}
  table{width:100%;border-collapse:collapse;font-size:9.5pt}
  th{background:#1a2b5f;color:#fff;padding:6px 8px;text-align:left;font-weight:600;font-size:8.5pt}
  td{padding:5px 8px;border-bottom:1px solid #eee;vertical-align:middle}
  tr:nth-child(even) td{background:#f7f9ff}
  .badge-atrasado{background:#fde8e8;color:#c0392b;border-radius:4px;padding:2px 6px;font-size:8pt;font-weight:700}
  .footer{margin-top:24px;padding-top:10px;border-top:1px solid #dde3f5;display:flex;justify-content:space-between;font-size:8pt;color:#888}
  @media print{body{padding:0} @page{margin: 0}}
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="header-title">Relatório Mensal da Biblioteca</div>
    <div class="header-sub">${mesNome} de ${ano}</div>
  </div>
  <div class="escola">${nomeEscola}<br/><span style="font-size:8pt;color:#aaa">Ref: ${docRef}</span></div>
</div>

<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">${totalEmprestimos}</div><div class="kpi-label">Empréstimos no mês</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#c0392b">${totalAtrasados}</div><div class="kpi-label">Em atraso</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#27ae60">${totalDevolvidos}</div><div class="kpi-label">Devolvidos</div></div>
  <div class="kpi"><div class="kpi-val">${taxaOcupacao}%</div><div class="kpi-label">Taxa de ocupação</div></div>
</div>

<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
  <div class="kpi"><div class="kpi-val">${livrosRows.length}</div><div class="kpi-label">Títulos no acervo</div></div>
  <div class="kpi"><div class="kpi-val">${totalLivros}</div><div class="kpi-label">Total de exemplares</div></div>
  <div class="kpi"><div class="kpi-val">${totalDisp}</div><div class="kpi-label">Disponíveis agora</div></div>
</div>

${topLivros.length > 0 ? `
<div class="section">
  <div class="section-title">Livros Mais Emprestados</div>
  <table>
    <thead><tr><th style="width:40px">#</th><th>Título</th><th style="width:70px;text-align:center">Empréstimos</th><th style="width:140px">Proporção</th></tr></thead>
    <tbody>${livroRows}</tbody>
  </table>
</div>` : ''}

${topCats.length > 0 ? `
<div class="section">
  <div class="section-title">Distribuição por Categoria</div>
  <table>
    <thead><tr><th>Categoria</th><th style="width:80px;text-align:center">Títulos</th><th style="width:80px;text-align:center">% do acervo</th></tr></thead>
    <tbody>${catRows}</tbody>
  </table>
</div>` : ''}

${penRows.length > 0 ? `
<div class="section">
  <div class="section-title" style="color:#c0392b">Leitores Penalizados</div>
  <table>
    <thead><tr><th>Leitor</th><th style="width:100px;text-align:center">Atrasos registados</th></tr></thead>
    <tbody>${penRows2}</tbody>
  </table>
</div>` : ''}

<div class="footer">
  <span>Emitido em: ${emitidoEm}</span>
  <span>${nomeEscola} · Sistema SIGA v3</span>
</div>

<script>window.addEventListener('load',function(){window.print()})</script>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Acta de Presença em Provas ────────────────────────────────────────────
  app.get('/api/pdf/acta-provas/:turmaId', requireAuth, async (req: Request, res: Response) => {
    try {
      const { turmaId } = req.params;
      const user = (req as any).jwtUser;
      const allowedRoles = ['admin','ceo','pca','director','secretaria','chefe_secretaria','professor','pedagogico','financeiro'];
      if (!allowedRoles.includes(user?.role)) return res.status(403).send('<p>Acesso negado</p>');

      // Query params: disciplina, professorNome, trimestre
      const disciplinaParam = (req.query.disciplina as string || '').trim();
      const professorNomeParam = (req.query.professorNome as string || '').trim();
      const trimestreParam = (req.query.trimestre as string || '').trim();

      const turmaRows = await query(`
        SELECT t.*, c.nome as "cursoNome"
        FROM turmas t
        LEFT JOIN cursos c ON c.id = t."cursoId"
        WHERE t.id = $1
      `, [turmaId]);
      if (!turmaRows.length) return res.status(404).send('<p>Turma não encontrada</p>');
      const turma = turmaRows[0] as any;
      const anoLetivo: string = turma.anoLetivo || anoLetivoDe();

      // Buscar Director de Turma
      let directorTurmaStr = '___________________________';
      if (turma.professorId) {
        const dtRows = await query<any>(`SELECT nome, apelido FROM professores WHERE id=$1 LIMIT 1`, [turma.professorId]);
        if (dtRows.length) {
          directorTurmaStr = `${dtRows[0].nome || ''} ${dtRows[0].apelido || ''}`.trim() || directorTurmaStr;
        }
      }

      const alunosRows = await query<any>(`
        SELECT a.id, a.nome, a.apelido, a."numeroMatricula"
        FROM alunos a
        WHERE a."turmaId" = $1 AND a.ativo = true AND (a.falecido IS NULL OR a.falecido = false)
        ORDER BY a.nome, a.apelido
      `, [turmaId]);

      const alunoIds = alunosRows.map((a: any) => a.id);
      let pagamentosRows: any[] = [];
      if (alunoIds.length > 0) {
        pagamentosRows = await query<any>(`
          SELECT p."alunoId", p.mes, p.status
          FROM pagamentos p
          WHERE p."alunoId" = ANY($1::uuid[]) AND p.ano = $2 AND p.status <> 'cancelado'
        `, [alunoIds, anoLetivo]);
      }

      const now = new Date();
      const mesAtual = now.getMonth() + 1;
      const mesesLetivos = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      const mesesPassados = mesesLetivos.filter(m => m <= mesAtual);

      const alunos = alunosRows.map((a: any) => {
        const pagsAluno = pagamentosRows.filter((p: any) => p.alunoId === a.id);
        const mesesPagos = new Set(pagsAluno.filter((p: any) => p.status === 'pago').map((p: any) => Number(p.mes)));
        const mesesPendentes = new Set(pagsAluno.filter((p: any) => p.status === 'pendente').map((p: any) => Number(p.mes)));
        const mesesEmAtraso = mesesPassados.filter(m => !mesesPagos.has(m) && !mesesPendentes.has(m)).length;
        return { ...a, apto: mesesEmAtraso === 0 };
      });

      const configRows = await query<any>(`SELECT * FROM config_geral LIMIT 1`, []);
      const config = (configRows[0] || {}) as any;

      const escola = config.nomeEscola || 'Escola Secundária';
      const director = config.directorGeral || '___________________________';
      const chefeSecretaria = config.chefeSecretaria || '___________________________';
      const dataEmissao = now.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
      const hora = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
      const isIICiclo = (turma.nivel || '').includes('II Ciclo');
      const disciplinaLabel = disciplinaParam || '—';
      const professorLabel = professorNomeParam || '___________________________';
      const trimestreLabel = trimestreParam || '—';

      const aptosOrdenados = alunos.filter(a => a.apto);
      const totalAlunos = alunos.length;
      const totalAptos = aptosOrdenados.length;
      const totalInaptos = totalAlunos - totalAptos;

      const docRef = `ACTA-${(turma.nome || 'TURMA').replace(/\s+/g,'').toUpperCase().slice(0,8)}-${Date.now().toString(36).toUpperCase()}`;
      const qrData = [
        `DOC: ACTA DE PRESENCA EM PROVAS`,
        `ESCOLA: ${escola}`,
        `TURMA: ${turma.nome || 'N/D'}`,
        `CLASSE: ${turma.classe || 'N/D'}`,
        isIICiclo ? `CURSO: ${turma.cursoNome || 'N/D'}` : '',
        `DISCIPLINA: ${disciplinaLabel}`,
        trimestreParam ? `TRIMESTRE: ${trimestreLabel}` : '',
        `PROFESSOR: ${professorLabel}`,
        `DIR.TURMA: ${directorTurmaStr}`,
        `ANO LETIVO: ${anoLetivo}`,
        `APTOS: ${totalAptos}`,
        `TOTAL: ${totalAlunos}`,
        `EMITIDO: ${dataEmissao}`,
      ].filter(Boolean).join('\n');
      const qrUrl = buildQRUrl(qrData, 110);
      const barcodeVal = safeBarcode(docRef);

      const rows = aptosOrdenados.map((a: any, idx: number) => {
        const nome = `${a.nome || ''} ${a.apelido || ''}`.trim();
        return `<tr>
          <td class="center">${idx + 1}</td>
          <td class="center mono">${a.numeroMatricula || '—'}</td>
          <td>${nome}</td>
          <td class="assinatura"></td>
        </tr>`;
      }).join('');

      const html = `<!DOCTYPE html>
<html lang="pt"><head>
<meta charset="UTF-8"/>
<title>Acta de Provas — ${turma.nome || ''}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;background:#f0f0f0;color:#111;font-size:9pt}
.doc{background:white;width:210mm;min-height:297mm;margin:8mm auto;padding:14mm 16mm;border:1px solid #ddd}
@media print{body{background:white}.doc{margin:0;border:none;width:100%;padding:12mm}.no-print{display:none!important}tr{page-break-inside:avoid}}
.header{display:flex;align-items:center;gap:14px;margin-bottom:12px;border-bottom:3px solid #1a2b5f;padding-bottom:10px}
.logo-box{width:54px;height:54px;background:#1a2b5f;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:18pt;font-weight:900;flex-shrink:0}
.escola-info{flex:1}
.escola-nome{font-size:13pt;font-weight:700;color:#1a2b5f;text-transform:uppercase}
.escola-sub{font-size:7.5pt;color:#6b7280;margin-top:2px;letter-spacing:.5px}
.titulo-block{text-align:center;margin:12px 0 10px}
.titulo-doc{font-size:13pt;font-weight:700;color:#1a2b5f;text-transform:uppercase;letter-spacing:1px}
.titulo-sub{font-size:9pt;color:#555;margin-top:3px}
.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px 20px;margin:10px 0;padding:10px 14px;background:#f8f9ff;border-radius:6px;border:1px solid #e5e7f2}
.meta-row{display:flex;gap:6px;align-items:baseline}
.meta-label{font-size:8pt;color:#6b7280;white-space:nowrap}
.meta-val{font-size:9pt;font-weight:600;color:#1a2b5f}
.stats-row{display:flex;gap:12px;margin:10px 0}
.stat-box{flex:1;text-align:center;padding:8px 6px;border-radius:8px;border:1px solid}
.stat-aptos{background:#d4edda;border-color:#c3e6cb;color:#1a6b2a}
.stat-inaptos{background:#f8d7da;border-color:#f5c6cb;color:#721c24}
.stat-total{background:#d1ecf1;border-color:#bee5eb;color:#0c5460}
.stat-num{font-size:18pt;font-weight:700;display:block}
.stat-lbl{font-size:7.5pt;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.sec-title{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#1a2b5f;margin:10px 0 6px;display:flex;align-items:center;gap:8px}
.sec-title::after{content:'';flex:1;height:1px;background:#1a2b5f55}
table{width:100%;border-collapse:collapse;margin-bottom:10px}
th{background:#1a2b5f;color:white;padding:6px 8px;font-size:8pt;text-transform:uppercase;letter-spacing:.4px;font-weight:600}
td{padding:5px 8px;border:1px solid #d1d5db;font-size:9pt;vertical-align:middle}
tr:nth-child(even) td{background:#f8f9ff}
.center{text-align:center}
.mono{font-family:monospace;font-size:8.5pt;letter-spacing:.5px}
.assinatura{width:130px;min-height:22px}
.aviso-box{margin:8px 0;padding:8px 12px;background:#fff3cd;border:1px solid #ffc107;border-radius:6px;font-size:8.5pt;color:#856404}
.footer-section{margin-top:18px;padding-top:12px;border-top:1px dashed #aaa}
.sigs{display:flex;justify-content:space-between;margin-top:20px;gap:24px}
.sig-block{flex:1;text-align:center}
.sig-line{border-top:1px solid #555;padding-top:4px;margin-top:32px;font-size:8.5pt;color:#333}
.sig-cargo{font-size:7.5pt;color:#6b7280;margin-top:2px}
.verif-section{display:flex;gap:14px;align-items:center;margin:14px 0 6px;padding:8px 12px;border:1px solid #dde0ef;border-radius:8px;background:#f9faff}
.verif-qr{text-align:center;flex-shrink:0}
.verif-qr img{width:90px;height:90px;border:1px solid #dde;border-radius:4px}
.verif-qr-lbl{font-size:7pt;text-transform:uppercase;color:#888;margin-top:2px;letter-spacing:.5px}
.verif-bar{flex:1;text-align:center}
.verif-svg{max-width:100%;height:48px}
.verif-bar-lbl{font-size:7pt;text-transform:uppercase;color:#888;margin-top:2px;letter-spacing:.5px}
.verif-info{flex:1.2;font-size:8pt;line-height:1.7;color:#555}
.verif-info strong{color:#1a2b5f}
.btn-print{display:block;width:200px;margin:0 auto 16px;padding:11px 24px;background:#1a2b5f;color:white;border:none;border-radius:8px;font-size:11pt;font-weight:700;cursor:pointer;letter-spacing:.5px}
.btn-print:hover{background:#2a3c8f}
</style></head>
<body>
<div class="doc">
  <div class="no-print" style="text-align:center;margin-bottom:10px">
    <button class="btn-print" onclick="window.print()">Imprimir Acta</button>
  </div>
  <div class="header">
    <div class="logo-box">S</div>
    <div class="escola-info">
      <div class="escola-nome">${escola}</div>
      <div class="escola-sub">REPÚBLICA DE ANGOLA · MINISTÉRIO DA EDUCAÇÃO</div>
    </div>
  </div>
  <div class="titulo-block">
    <div class="titulo-doc">Acta de Presença em Provas</div>
    <div class="titulo-sub">${disciplinaParam ? `Disciplina: <strong>${disciplinaParam}</strong> — ` : ''}Lista oficial de alunos autorizados a realizar provas (propinas em dia)</div>
  </div>
  <div class="meta-grid" style="grid-template-columns:1fr 1fr">
    <div class="meta-row"><span class="meta-label">Turma:</span><span class="meta-val">${turma.nome || '—'}</span></div>
    <div class="meta-row"><span class="meta-label">Classe:</span><span class="meta-val">${turma.classe || '—'}</span></div>
    ${isIICiclo ? `<div class="meta-row"><span class="meta-label">Curso:</span><span class="meta-val">${turma.cursoNome || '—'}</span></div>` : ''}
    <div class="meta-row"><span class="meta-label">Nível:</span><span class="meta-val">${turma.nivel || '—'}</span></div>
    <div class="meta-row"><span class="meta-label">Ano Lectivo:</span><span class="meta-val">${anoLetivo}</span></div>
    <div class="meta-row"><span class="meta-label">Turno:</span><span class="meta-val">${turma.turno || '—'}</span></div>
    <div class="meta-row"><span class="meta-label">Data de Emissão:</span><span class="meta-val">${dataEmissao} – ${hora}</span></div>
    <div class="meta-row" style="grid-column:1/-1"><span class="meta-label">Disciplina da Prova:</span><span class="meta-val" style="color:#1a6b2a;font-size:10pt">${disciplinaLabel}</span></div>
    ${trimestreParam ? `<div class="meta-row"><span class="meta-label">Trimestre:</span><span class="meta-val" style="color:#1a2b5f;font-weight:700">${trimestreLabel}</span></div>` : ''}
    <div class="meta-row"><span class="meta-label">Professor Responsável:</span><span class="meta-val">${professorLabel}</span></div>
    <div class="meta-row"><span class="meta-label">Director de Turma:</span><span class="meta-val">${directorTurmaStr}</span></div>
  </div>
  <div class="stats-row">
    <div class="stat-box stat-total"><span class="stat-num">${totalAlunos}</span><span class="stat-lbl">Total Alunos</span></div>
    <div class="stat-box stat-aptos"><span class="stat-num">${totalAptos}</span><span class="stat-lbl">Aptos (Propinas em Dia)</span></div>
    <div class="stat-box stat-inaptos"><span class="stat-num">${totalInaptos}</span><span class="stat-lbl">Não Aptos (Propinas em Atraso)</span></div>
  </div>
  <div class="sec-title">Alunos Autorizados a Realizar a Prova</div>
  ${totalAptos > 0 ? `
  <table>
    <thead><tr>
      <th style="width:40px">Nº</th>
      <th style="width:120px">Nº Matrícula</th>
      <th>Nome Completo</th>
      <th style="width:130px">Assinatura</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>` : `<div class="aviso-box">Nenhum aluno com propinas em dia. Não há alunos autorizados nesta turma.</div>`}
  ${totalInaptos > 0 ? `<div class="aviso-box">${totalInaptos} aluno(s) não constam desta lista por terem propinas em atraso e não estão autorizados a realizar provas.</div>` : ''}
  <div class="footer-section">
    <div class="sigs">
      <div class="sig-block"><div class="sig-line">${director}</div><div class="sig-cargo">Director(a) Geral</div></div>
      <div class="sig-block"><div class="sig-line">${directorTurmaStr}</div><div class="sig-cargo">Director(a) de Turma</div></div>
      <div class="sig-block"><div class="sig-line">${professorLabel !== '___________________________' ? professorLabel : '_________________________'}</div><div class="sig-cargo">Professor(a) Responsável${disciplinaParam ? ` · ${disciplinaParam}` : ''}</div></div>
    </div>
  </div>
  <div class="verif-section">
    <div class="verif-qr">
      <img src="${qrUrl}" alt="QR" onerror="this.style.display='none'" />
      <div class="verif-qr-lbl">QR Verificação</div>
    </div>
    <div class="verif-bar">
      <svg id="bc-acta" class="verif-svg"></svg>
      <div class="verif-bar-lbl">Código de Barras</div>
    </div>
    <div class="verif-info">
      <strong>Ref.:</strong> ${docRef}<br>
      <strong>Emitido:</strong> ${dataEmissao}<br>
      <strong>Aptos:</strong> ${totalAptos} de ${totalAlunos}<br>
      <span style="font-size:7pt;color:#9ca3af">Documento verificável pelo QR Code</span>
    </div>
  </div>
</div>
${JSBARCODE_CDN}
<script>
window.addEventListener('load',function(){
  try{JsBarcode('#bc-acta','${barcodeVal}',{format:'CODE128',width:1.5,height:38,displayValue:true,fontSize:9,margin:3,background:'transparent',lineColor:'#1a2b5f',fontOptions:'bold'});}
  catch(e){var el=document.getElementById('bc-acta');if(el)el.style.display='none';}
});
</script>
</body></html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e: any) {
      console.error('[pdf/acta-provas]', e);
      res.status(500).send(`<p>Erro interno: ${e.message}</p>`);
    }
  });

  app.post('/api/pdf/multicaixa/gerar', requireAuth, async (req: Request, res: Response) => {
    try {
      const { alunoId, taxaId, valor, mes, ano } = req.body;
      if (!alunoId || !taxaId || !valor) {
        return res.status(400).json({ error: 'alunoId, taxaId e valor são obrigatórios' });
      }

      const countRows = await query<any>(`SELECT COUNT(*) as cnt FROM public.rupes`, []);
      const seq = Number(countRows[0]?.cnt || 0) + 1;
      const referencia = gerarRefMulticaixa(alunoId, taxaId, seq);

      const dataGeracao = new Date().toISOString().split('T')[0];
      const dataValidade = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const rupeRows = await query<any>(
        `INSERT INTO public.rupes (id,"alunoId","taxaId","valor","referencia","dataGeracao","dataValidade","status")
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,'ativo') RETURNING *`,
        [alunoId, taxaId, Number(valor), referencia, dataGeracao, dataValidade]
      );
      const rupe = rupeRows[0];

      res.json({ rupe, referencia, dataValidade });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
