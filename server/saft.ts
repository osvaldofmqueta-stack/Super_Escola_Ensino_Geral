/**
 * SAF-T (AO) — Standard Audit File for Tax Purposes — Angola
 * Conforme Decreto Presidencial n.º 71/25, de 20 de Março de 2025
 * Esquema XSD: assoft-portugal/SAF-T-AO v1.01_01
 *
 * Melhorias v2:
 *  - ATCUD derivado do sequencial do documento ("0-<seq>")
 *  - Secção Products no MasterFiles (catálogo de 7 serviços)
 *  - NIF com fallback: alunoNif → encarregadoNif → BI → Cédula → 999999999
 *  - PaymentMechanism em DocumentTotals (NU/TB/CC/CH)
 *  - CreditNotes: pagamentos cancelados/anulados como tipo NC
 */

import type { Express, Request, Response } from 'express';
import * as crypto from 'crypto';
import { query } from './db';
import { requireAuth } from './auth';

// ─────────────────────────────────────────────────────────────
// Constantes e mapeamentos
// ─────────────────────────────────────────────────────────────

const SAFT_VERSION = '1.01_01';
const NAMESPACE = 'urn:OECD:StandardAuditFile-Tax:AO_1.01_01';
const SOFTWARE_ID = 'Super Escola SIGA';
const SOFTWARE_VERSION = '3.0';
const SOFTWARE_COMPANY_NIF = '5000000000'; // NIF da Queta Tech Lda
const CURRENCY = 'AOA';
const COUNTRY = 'AO';
const TAX_EXEMPTION_CODE = 'M07';
const TAX_EXEMPTION_REASON = 'Prestações de serviços de educação — art. 9.º al. b) CIVA';

// Mapeia o campo `tipo` da tabela `taxas` para a série SAF-T
const TIPO_PARA_SERIE: Record<string, string> = {
  propina:   'PROP',
  matricula: 'MAT',
  multa:     'MUL',
  exame:     'EXA',
  material:  'MATER',
  inscricao: 'INSC',
  outro:     'OUT',
};

const TIPO_LABEL: Record<string, string> = {
  propina:   'Propina',
  matricula: 'Matrícula',
  multa:     'Multa',
  exame:     'Exame',
  material:  'Material escolar',
  inscricao: 'Inscrição',
  outro:     'Outro',
};

// Catálogo de produtos/serviços para MasterFiles > Products
// ProductType: S = serviço
const PRODUCTS_CATALOG = [
  { code: 'PROP',  group: 'Propinas',    desc: 'Propina Mensal',        unitCode: 'MTH' },
  { code: 'MAT',   group: 'Matrículas',  desc: 'Matrícula/Inscrição',   unitCode: 'EA'  },
  { code: 'MUL',   group: 'Multas',      desc: 'Multa / Penalidade',    unitCode: 'EA'  },
  { code: 'EXA',   group: 'Exames',      desc: 'Taxa de Exame',         unitCode: 'EA'  },
  { code: 'MATER', group: 'Materiais',   desc: 'Material Escolar',      unitCode: 'EA'  },
  { code: 'INSC',  group: 'Inscrições',  desc: 'Taxa de Inscrição',     unitCode: 'EA'  },
  { code: 'OUT',   group: 'Outros',      desc: 'Outro Serviço Escolar', unitCode: 'EA'  },
];

// ─────────────────────────────────────────────────────────────
// Utilitários XML
// ─────────────────────────────────────────────────────────────

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmtDate(d: string | Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

function fmtDateTime(d: string | Date): string {
  return new Date(d).toISOString().replace(/\.\d+Z$/, '');
}

function fmtNum(n: number): string {
  return n.toFixed(2);
}

// ─────────────────────────────────────────────────────────────
// Helpers adicionais
// ─────────────────────────────────────────────────────────────

/**
 * ATCUD: extrai o sequencial de "SERIE ANO/SEQ" e formata "0-SEQ".
 * Exemplo: "PROP 2025/42" → "0-42"
 * Se não for possível extrair, retorna "0".
 */
function buildAtcud(numeroSerie: string): string {
  const m = (numeroSerie || '').match(/\/(\d+)$/);
  return m ? `0-${m[1]}` : '0';
}

/**
 * Resolve o melhor NIF/identificação disponível por ordem de prioridade:
 * alunoNif → encarregadoNif → encarregadoBi → alunoNumeroBi → alunoNumeroCedula → '999999999'
 */
function resolveNif(p: any): string {
  const candidates: unknown[] = [
    p.alunoNif,
    p.encarregadoNif,
    p.encarregadoBi,
    p.alunoNumeroBi,
    p.alunoNumeroCedula,
  ];
  for (const c of candidates) {
    const v = (c || '').toString().trim().replace(/\s/g, '');
    if (v && v !== '0' && v.length >= 5) return v;
  }
  return '999999999';
}

/**
 * Mapeia o método de pagamento interno para o código SAF-T:
 *   NU = Numerário  |  TB = Transferência Bancária
 *   CC = Cartão (ATM/Multicaixa)  |  CH = Cheque  |  OU = Outro
 */
function mapMetodoPagamento(m: string | null | undefined): string {
  switch ((m || '').toLowerCase()) {
    case 'dinheiro':      return 'NU';
    case 'transferencia': return 'TB';
    case 'multicaixa':    return 'CC';
    case 'cheque':        return 'CH';
    default:              return 'OU';
  }
}

// ─────────────────────────────────────────────────────────────
// Numeração sequencial (sem lacunas, sem duplicados)
// ─────────────────────────────────────────────────────────────

export async function obterProximoSequencial(serie: string, ano: number): Promise<number> {
  await query(
    `INSERT INTO public.saft_sequencias (serie, ano, ultimo_num)
     VALUES ($1, $2, 0)
     ON CONFLICT (serie, ano) DO NOTHING`,
    [serie, ano]
  );
  const rows = await query<{ n: number }>(
    `UPDATE public.saft_sequencias
     SET ultimo_num = ultimo_num + 1
     WHERE serie=$1 AND ano=$2
     RETURNING ultimo_num AS n`,
    [serie, ano]
  );
  return rows[0]?.n ?? 1;
}

export function buildNumeroSerie(serie: string, ano: number, seq: number): string {
  return `${serie} ${ano}/${seq}`;
}

// ─────────────────────────────────────────────────────────────
// Hash chain
// ─────────────────────────────────────────────────────────────

async function obterHashAnterior(serie: string, ano: number): Promise<string> {
  const rows = await query<{ hash_doc: string }>(
    `SELECT hash_doc FROM public.saft_hashes
     WHERE serie=$1 AND ano=$2
     ORDER BY sequencial DESC LIMIT 1`,
    [serie, ano]
  );
  return rows[0]?.hash_doc ?? '0';
}

function calcularHashDoc(params: {
  numeroSerie: string;
  dataEmissao: string;
  valorBruto: number;
  hashAnterior: string;
}): string {
  const payload = [
    params.numeroSerie,
    params.dataEmissao,
    fmtNum(params.valorBruto),
    params.hashAnterior,
  ].join(';');
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

export async function registarHashPagamento(pagamentoId: string, params: {
  serie: string;
  ano: number;
  sequencial: number;
  numeroSerie: string;
  dataEmissao: string;
  valorBruto: number;
}): Promise<{ hashDoc: string; hashAnterior: string }> {
  const hashAnterior = await obterHashAnterior(params.serie, params.ano);
  const hashDoc = calcularHashDoc({
    numeroSerie: params.numeroSerie,
    dataEmissao: params.dataEmissao,
    valorBruto: params.valorBruto,
    hashAnterior,
  });

  await query(
    `INSERT INTO public.saft_hashes
       (pagamento_id, numero_serie, serie, ano, sequencial, hash_doc, hash_anterior, data_emissao, valor_bruto)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (pagamento_id) DO NOTHING`,
    [pagamentoId, params.numeroSerie, params.serie, params.ano, params.sequencial,
     hashDoc, hashAnterior, params.dataEmissao, params.valorBruto]
  );

  await query(
    `UPDATE public.pagamentos
     SET "numeroSerie"=$1, "hashDoc"=$2, "hashAnterior"=$3
     WHERE id=$4`,
    [params.numeroSerie, hashDoc, hashAnterior, pagamentoId]
  );

  return { hashDoc, hashAnterior };
}

// ─────────────────────────────────────────────────────────────
// Atribuir numeração a pagamentos existentes sem número
// ─────────────────────────────────────────────────────────────

export async function garantirNumeracaoPagamento(pagamentoId: string): Promise<{
  numeroSerie: string;
  hashDoc: string;
  hashAnterior: string;
  serie: string;
}> {
  const exist = await query<{ "numeroSerie": string; "hashDoc": string; "hashAnterior": string }>(
    `SELECT "numeroSerie", "hashDoc", "hashAnterior" FROM public.pagamentos WHERE id=$1`,
    [pagamentoId]
  );
  if (exist[0]?.numeroSerie) {
    return {
      numeroSerie: exist[0].numeroSerie,
      hashDoc: exist[0].hashDoc || '',
      hashAnterior: exist[0].hashAnterior || '0',
      serie: exist[0].numeroSerie.split(' ')[0],
    };
  }

  const rows = await query<any>(
    `SELECT p.*, t.tipo AS tipoTaxa FROM public.pagamentos p
     LEFT JOIN public.taxas t ON t.id = p."taxaId"
     WHERE p.id=$1`,
    [pagamentoId]
  );
  if (!rows.length) throw new Error(`Pagamento ${pagamentoId} não encontrado`);
  const p = rows[0];

  const tipoTaxa = p.tipoTaxa || 'outro';
  const serie = TIPO_PARA_SERIE[tipoTaxa] || 'OUT';
  const dataEmissao = (p.data || p.createdAt || new Date().toISOString()).slice(0, 10);
  const ano = parseInt(dataEmissao.slice(0, 4), 10) || new Date().getFullYear();

  const seq = await obterProximoSequencial(serie, ano);
  const numeroSerie = buildNumeroSerie(serie, ano, seq);

  const { hashDoc, hashAnterior } = await registarHashPagamento(pagamentoId, {
    serie, ano, sequencial: seq, numeroSerie, dataEmissao, valorBruto: Number(p.valor || 0),
  });

  return { numeroSerie, hashDoc, hashAnterior, serie };
}

// ─────────────────────────────────────────────────────────────
// Gerador XML SAF-T AO  (v2 — ATCUD + Products + NIF fallback
//                             + PaymentMethods + CreditNotes)
// ─────────────────────────────────────────────────────────────

const MESES = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

interface SaftOptions {
  ano: number;
  mesInicio?: number;
  mesFim?: number;
  config: any;
}

async function gerarXmlSAFT(opts: SaftOptions): Promise<string> {
  const { ano, mesInicio = 1, mesFim = 12, config } = opts;

  const dataInicio = `${ano}-${String(mesInicio).padStart(2,'0')}-01`;
  const ultimoDia = new Date(ano, mesFim, 0).getDate();
  const dataFim = `${ano}-${String(mesFim).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;

  // ── Pagamentos pagos no período ──
  const pagamentos = await query<any>(
    `SELECT p.*, t.tipo AS tipoTaxa, t.descricao AS taxaDescricao,
            a.id AS alunoId, (a.nome || ' ' || COALESCE(a.apelido,'')) AS alunoNome,
            a."numeroMatricula",
            a.nif AS alunoNif,
            a."numeroBi" AS "alunoNumeroBi",
            a."numeroCedula" AS "alunoNumeroCedula",
            a."nomeEncarregado" AS "encarregadoNome",
            a."encarregadoNif",
            a."encarregadoBi" AS "encarregadoBi"
     FROM public.pagamentos p
     LEFT JOIN public.taxas t ON t.id = p."taxaId"
     LEFT JOIN public.alunos a ON a.id = p."alunoId"
     WHERE p.status = 'pago'
       AND p.data >= $1
       AND p.data <= $2
     ORDER BY p.data ASC, p."createdAt" ASC`,
    [dataInicio, dataFim]
  );

  // ── Pagamentos cancelados/anulados no período → Notas de Crédito (NC) ──
  const cancelados = await query<any>(
    `SELECT p.*, t.tipo AS tipoTaxa, t.descricao AS taxaDescricao,
            a.id AS alunoId, (a.nome || ' ' || COALESCE(a.apelido,'')) AS alunoNome,
            a.nif AS alunoNif,
            a."numeroBi" AS "alunoNumeroBi",
            a."numeroCedula" AS "alunoNumeroCedula",
            a."nomeEncarregado" AS "encarregadoNome",
            a."encarregadoNif",
            a."encarregadoBi" AS "encarregadoBi"
     FROM public.pagamentos p
     LEFT JOIN public.taxas t ON t.id = p."taxaId"
     LEFT JOIN public.alunos a ON a.id = p."alunoId"
     WHERE p.status IN ('cancelado','anulado')
       AND p.data >= $1
       AND p.data <= $2
     ORDER BY p.data ASC, p."createdAt" ASC`,
    [dataInicio, dataFim]
  );

  // Garantir numeração para todos os pagamentos pagos sem número
  for (const p of pagamentos) {
    if (!p.numeroSerie) {
      const r = await garantirNumeracaoPagamento(p.id);
      p.numeroSerie = r.numeroSerie;
      p.hashDoc = r.hashDoc;
      p.hashAnterior = r.hashAnterior;
    }
  }

  // ── Clientes únicos (pagamentos + cancelados) ──
  const clientesMap = new Map<string, any>();
  for (const p of [...pagamentos, ...cancelados]) {
    const clienteId = p.alunoId || p.id;
    if (!clientesMap.has(clienteId)) {
      clientesMap.set(clienteId, {
        id: clienteId,
        nif: resolveNif(p),
        nome: p.encarregadoNome || p.alunoNome || 'Consumidor Final',
      });
    }
  }

  const totalCredito = pagamentos.reduce((s: number, p: any) => s + Number(p.valor || 0), 0);
  const totalDebito  = cancelados.reduce((s: number, p: any) => s + Number(p.valor || 0), 0);
  const totalEntradas = pagamentos.length + cancelados.length;

  const nifEscola      = config?.nifEscola      || '5000000000';
  const nomeEscola     = config?.nomeEscola     || 'Escola';
  const provinciaEscola = config?.provinciaEscola || 'Luanda';
  const municipioEscola = config?.municipioEscola || 'Luanda';
  const moradaEscola   = config?.morada         || provinciaEscola;
  const agora          = new Date().toISOString().slice(0, 10);

  // ── Header ──
  const header = `  <Header>
    <AuditFileVersion>${esc(SAFT_VERSION)}</AuditFileVersion>
    <CompanyID>${esc(nifEscola)}</CompanyID>
    <TaxRegistrationNumber>${esc(nifEscola)}</TaxRegistrationNumber>
    <TaxAccountingBasis>C</TaxAccountingBasis>
    <CompanyName>${esc(nomeEscola)}</CompanyName>
    <BusinessName>${esc(nomeEscola)}</BusinessName>
    <CompanyAddress>
      <AddressDetail>${esc(moradaEscola)}</AddressDetail>
      <City>${esc(municipioEscola)}</City>
      <PostalCode>0000</PostalCode>
      <Province>${esc(provinciaEscola)}</Province>
      <Country>${COUNTRY}</Country>
    </CompanyAddress>
    <FiscalYear>${ano}</FiscalYear>
    <StartDate>${dataInicio}</StartDate>
    <EndDate>${dataFim}</EndDate>
    <CurrencyCode>${CURRENCY}</CurrencyCode>
    <DateCreated>${agora}</DateCreated>
    <TaxEntity>Sede</TaxEntity>
    <ProductCompanyTaxID>${esc(SOFTWARE_COMPANY_NIF)}</ProductCompanyTaxID>
    <SoftwareCertificateNumber>0</SoftwareCertificateNumber>
    <ProductID>${esc(SOFTWARE_ID)}</ProductID>
    <ProductVersion>${esc(SOFTWARE_VERSION)}</ProductVersion>
  </Header>`;

  // ── MasterFiles — Customers ──
  const clientesXml = Array.from(clientesMap.values()).map(c => `    <Customer>
      <CustomerID>${esc(c.id.replace(/-/g,'').substring(0,20))}</CustomerID>
      <AccountID>211</AccountID>
      <CustomerTaxID>${esc(c.nif)}</CustomerTaxID>
      <CompanyName>${esc(c.nome)}</CompanyName>
      <BillingAddress>
        <AddressDetail>${esc(municipioEscola)}</AddressDetail>
        <City>${esc(municipioEscola)}</City>
        <PostalCode>0000</PostalCode>
        <Country>${COUNTRY}</Country>
      </BillingAddress>
      <SelfBillingIndicator>0</SelfBillingIndicator>
    </Customer>`).join('\n');

  // ── MasterFiles — Products (catálogo de serviços) ──
  const productsXml = PRODUCTS_CATALOG.map(prod => `    <Product>
      <ProductType>S</ProductType>
      <ProductCode>${esc(prod.code)}</ProductCode>
      <ProductGroup>${esc(prod.group)}</ProductGroup>
      <ProductDescription>${esc(prod.desc)}</ProductDescription>
      <ProductNumberCode>${esc(prod.code)}</ProductNumberCode>
      <UNStandardCode>${esc(prod.unitCode)}</UNStandardCode>
    </Product>`).join('\n');

  // ── MasterFiles — TaxTable ──
  const taxTable = `    <TaxTable>
      <TaxTableEntry>
        <TaxType>IVA</TaxType>
        <TaxCountryRegion>AO</TaxCountryRegion>
        <TaxCode>IS</TaxCode>
        <Description>Isento — ${esc(TAX_EXEMPTION_REASON)}</Description>
        <TaxPercentage>0.00</TaxPercentage>
      </TaxTableEntry>
    </TaxTable>`;

  // ── Helper: gera XML de uma linha de documento (FR ou NC) ──
  function buildInvoiceXml(p: any, idx: number, tipo: 'FR' | 'NC'): string {
    const tipoTaxa = p.tipoTaxa || 'outro';
    const numSerie = p.numeroSerie || `${tipo === 'NC' ? 'NC' : 'OUT'} ${ano}/${idx + 1}`;
    const dataDoc  = p.data ? fmtDate(p.data) : agora;
    const dataHora = p.createdAt ? fmtDateTime(p.createdAt) : `${dataDoc}T00:00:00`;
    const periodo  = parseInt(dataDoc.slice(5, 7), 10) || 1;
    const valorBruto = Number(p.valor || 0);
    const clienteIdShort = (p.alunoId || p.id || '').replace(/-/g,'').substring(0,20);
    const prodCodigo = TIPO_PARA_SERIE[tipoTaxa] || 'OUT';
    const descricao  = p.taxaDescricao ||
      `${TIPO_LABEL[tipoTaxa] || 'Pagamento'}${p.mes ? ` – ${MESES[p.mes] || ''}` : ''}${p.ano ? ` ${p.ano}` : ''}`;
    const hashCtrl  = (p.hashDoc || '0').slice(0, 8);
    const atcud     = buildAtcud(numSerie);
    const mecPag    = mapMetodoPagamento(p.metodoPagamento);
    // FR → CreditAmount; NC → DebitAmount
    const amountXml = tipo === 'FR'
      ? `<CreditAmount>${fmtNum(valorBruto)}</CreditAmount>`
      : `<DebitAmount>${fmtNum(valorBruto)}</DebitAmount>`;
    const statusDoc = tipo === 'NC' ? 'A' : 'N';

    return `    <Invoice>
      <InvoiceNo>${esc(numSerie)}</InvoiceNo>
      <ATCUD>${esc(atcud)}</ATCUD>
      <DocumentStatus>
        <InvoiceStatus>${statusDoc}</InvoiceStatus>
        <InvoiceStatusDate>${esc(dataHora)}</InvoiceStatusDate>
        <SourceID>sistema</SourceID>
        <SourceBilling>P</SourceBilling>
      </DocumentStatus>
      <Hash>${esc(p.hashDoc || '0')}</Hash>
      <HashControl>${esc(hashCtrl)}</HashControl>
      <Period>${periodo}</Period>
      <InvoiceDate>${esc(dataDoc)}</InvoiceDate>
      <InvoiceType>${tipo}</InvoiceType>
      <SpecialRegimes>
        <SelfBillingIndicator>0</SelfBillingIndicator>
        <CashVATSchemeIndicator>0</CashVATSchemeIndicator>
        <ThirdPartiesBillingIndicator>0</ThirdPartiesBillingIndicator>
      </SpecialRegimes>
      <SourceID>sistema</SourceID>
      <SystemEntryDate>${esc(dataHora)}</SystemEntryDate>
      <CustomerID>${esc(clienteIdShort)}</CustomerID>
      <Line>
        <LineNumber>1</LineNumber>
        <ProductCode>${esc(prodCodigo)}</ProductCode>
        <ProductDescription>${esc(descricao)}</ProductDescription>
        <Quantity>1.00</Quantity>
        <UnitOfMeasure>UN</UnitOfMeasure>
        <UnitPrice>${fmtNum(valorBruto)}</UnitPrice>
        <TaxPointDate>${esc(dataDoc)}</TaxPointDate>
        <Description>${esc(descricao)}</Description>
        ${amountXml}
        <Tax>
          <TaxType>IVA</TaxType>
          <TaxCountryRegion>AO</TaxCountryRegion>
          <TaxCode>IS</TaxCode>
          <TaxPercentage>0.00</TaxPercentage>
        </Tax>
        <TaxExemptionReason>${esc(TAX_EXEMPTION_REASON)}</TaxExemptionReason>
        <TaxExemptionCode>${TAX_EXEMPTION_CODE}</TaxExemptionCode>
      </Line>
      <DocumentTotals>
        <TaxPayable>0.00</TaxPayable>
        <NetTotal>${fmtNum(valorBruto)}</NetTotal>
        <GrossTotal>${fmtNum(valorBruto)}</GrossTotal>
        <Payment>
          <PaymentMechanism>${esc(mecPag)}</PaymentMechanism>
          <PaymentAmount>${fmtNum(valorBruto)}</PaymentAmount>
          <PaymentDate>${esc(dataDoc)}</PaymentDate>
        </Payment>
      </DocumentTotals>
    </Invoice>`;
  }

  const invoicesXml    = pagamentos.map((p: any, i: number) => buildInvoiceXml(p, i, 'FR')).join('\n');
  const creditNotesXml = cancelados.map((p: any, i: number) => buildInvoiceXml(p, i, 'NC')).join('\n');

  const masterFiles = `  <MasterFiles>
${clientesXml}
${productsXml}
${taxTable}
  </MasterFiles>`;

  const sourceDocuments = `  <SourceDocuments>
    <SalesInvoices>
      <NumberOfEntries>${totalEntradas}</NumberOfEntries>
      <TotalDebit>${fmtNum(totalDebito)}</TotalDebit>
      <TotalCredit>${fmtNum(totalCredito)}</TotalCredit>
${invoicesXml}${creditNotesXml ? '\n' + creditNotesXml : ''}
    </SalesInvoices>
  </SourceDocuments>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="${NAMESPACE}">
${header}
${masterFiles}
${sourceDocuments}
</AuditFile>`;
}

// ─────────────────────────────────────────────────────────────
// Validação de conformidade
// ─────────────────────────────────────────────────────────────

export async function validarConformidade(ano: number): Promise<{
  ok: boolean;
  erros: string[];
  avisos: string[];
  stats: Record<string, number>;
}> {
  const erros: string[] = [];
  const avisos: string[] = [];

  // 1. NIF da escola
  const cfgRows = await query<any>(`SELECT "nifEscola", "nomeEscola" FROM public.config_geral LIMIT 1`);
  const cfg = cfgRows[0] || {};
  if (!cfg.nifEscola || cfg.nifEscola.trim() === '') {
    erros.push('NIF da escola não configurado — obrigatório para SAF-T.');
  }

  // 2. Pagamentos pagos sem número de série
  const semNumero = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM public.pagamentos
     WHERE status='pago' AND EXTRACT(YEAR FROM "createdAt")=$1 AND "numeroSerie" IS NULL`,
    [ano]
  );
  const nSemNumero = semNumero[0]?.total ?? 0;
  if (nSemNumero > 0) {
    avisos.push(`${nSemNumero} pagamento(s) sem numeração SAF-T — serão numerados automaticamente na exportação.`);
  }

  // 3. Pagamentos sem qualquer identificação fiscal (NIF, BI ou Cédula)
  const semNif = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM public.pagamentos p
     JOIN public.alunos a ON a.id = p."alunoId"
     WHERE p.status='pago'
       AND EXTRACT(YEAR FROM p."createdAt")=$1
       AND (a.nif IS NULL OR a.nif = '' OR a.nif = '0')
       AND (a."encarregadoNif" IS NULL OR a."encarregadoNif" = '')
       AND (a."encarregadoBi" IS NULL OR a."encarregadoBi" = '')
       AND (a."numeroBi" IS NULL OR a."numeroBi" = '')
       AND (a."numeroCedula" IS NULL OR a."numeroCedula" = '')`,
    [ano]
  );
  const nSemNif = semNif[0]?.total ?? 0;
  if (nSemNif > 0) {
    avisos.push(`${nSemNif} pagamento(s) sem NIF/BI/Cédula do encarregado — será usado "999999999" como substituto fiscal.`);
  }

  // 4. Duplicados na hash chain (integridade)
  const dupHash = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM (
       SELECT hash_doc, COUNT(*) AS n FROM public.saft_hashes WHERE ano=$1 GROUP BY hash_doc HAVING COUNT(*)>1
     ) t`,
    [ano]
  );
  const nDup = dupHash[0]?.total ?? 0;
  if (nDup > 0) {
    erros.push(`${nDup} hash(es) duplicada(s) detectada(s) — possível adulteração de documentos.`);
  }

  // 5. Pagamentos sem método de pagamento definido
  const semMetodo = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM public.pagamentos
     WHERE status='pago'
       AND EXTRACT(YEAR FROM "createdAt")=$1
       AND ("metodoPagamento" IS NULL OR "metodoPagamento" = '')`,
    [ano]
  );
  const nSemMetodo = semMetodo[0]?.total ?? 0;
  if (nSemMetodo > 0) {
    avisos.push(`${nSemMetodo} pagamento(s) sem método de pagamento definido — será registado como "Outro" no SAF-T.`);
  }

  // 6. Notas de crédito (cancelados/anulados)
  const ncRows = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM public.pagamentos
     WHERE status IN ('cancelado','anulado') AND EXTRACT(YEAR FROM "createdAt")=$1`,
    [ano]
  );
  const nNC = ncRows[0]?.total ?? 0;
  if (nNC > 0) {
    avisos.push(`${nNC} pagamento(s) cancelado(s)/anulado(s) serão incluídos como Notas de Crédito (NC) no ficheiro.`);
  }

  // 7. Totais por série
  const stats: Record<string, number> = {};
  const totaisRows = await query<{ serie: string; total: number }>(
    `SELECT serie, COUNT(*)::int AS total FROM public.saft_hashes WHERE ano=$1 GROUP BY serie`,
    [ano]
  );
  for (const r of totaisRows) { stats[r.serie] = r.total; }

  const totalPagos = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM public.pagamentos WHERE status='pago' AND EXTRACT(YEAR FROM "createdAt")=$1`,
    [ano]
  );
  stats['total_pagamentos_pagos'] = totalPagos[0]?.total ?? 0;
  stats['total_notas_credito'] = nNC;

  return { ok: erros.length === 0, erros, avisos, stats };
}

// ─────────────────────────────────────────────────────────────
// Rotas Express
// ─────────────────────────────────────────────────────────────

export function registerSAFTRoutes(app: Express) {

  // GET /api/saft/validar?ano=2025
  app.get('/api/saft/validar', requireAuth, async (req: Request, res: Response) => {
    try {
      const ano = parseInt(String(req.query.ano || new Date().getFullYear()), 10);
      const resultado = await validarConformidade(ano);
      res.json({ ano, ...resultado });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/saft/exportar?ano=2025&mesInicio=1&mesFim=12[&preview=1]
  app.get('/api/saft/exportar', requireAuth, async (req: Request, res: Response) => {
    try {
      const ano       = parseInt(String(req.query.ano || new Date().getFullYear()), 10);
      const mesInicio = parseInt(String(req.query.mesInicio || '1'), 10);
      const mesFim    = parseInt(String(req.query.mesFim   || '12'), 10);
      const isPreview = req.query.preview === '1';

      const configRows = await query<any>(`SELECT * FROM public.config_geral LIMIT 1`);
      const config = configRows[0] || {};

      const xml = await gerarXmlSAFT({ ano, mesInicio, mesFim, config });

      res.setHeader('Content-Type', 'application/xml; charset=utf-8');

      if (isPreview) {
        // Pré-visualização inline — sem download, sem histórico
        res.setHeader('Cache-Control', 'no-store');
        res.send(xml);
        return;
      }

      const nomeFicheiro = `SAFT-AO_${config.nifEscola || 'ESCOLA'}_${ano}_${String(mesInicio).padStart(2,'0')}_${String(mesFim).padStart(2,'0')}.xml`;
      const u = (req as any).jwtUser || {};
      const totalDocs  = (xml.match(/<Invoice>/g) || []).length;
      const totalValorMatch = xml.match(/<TotalCredit>([\d.]+)<\/TotalCredit>/);
      const totalValor = totalValorMatch ? parseFloat(totalValorMatch[1]) : 0;
      await query(
        `INSERT INTO public.saft_exportacoes (ano, mes_inicio, mes_fim, total_docs, total_valor, gerado_por, nome_ficheiro)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [ano, mesInicio, mesFim, totalDocs, totalValor, u.email || u.userId || null, nomeFicheiro]
      ).catch(() => {});

      res.setHeader('Content-Disposition', `attachment; filename="${nomeFicheiro}"`);
      res.send(xml);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/saft/historico
  app.get('/api/saft/historico', requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await query<any>(
        `SELECT * FROM public.saft_exportacoes ORDER BY gerado_em DESC LIMIT 50`
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/saft/sequencias?ano=2025
  app.get('/api/saft/sequencias', requireAuth, async (req: Request, res: Response) => {
    try {
      const ano = parseInt(String(req.query.ano || new Date().getFullYear()), 10);
      const rows = await query<any>(
        `SELECT * FROM public.saft_sequencias WHERE ano=$1 ORDER BY serie`, [ano]
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/saft/numerar-pendentes — atribui número a todos os pagamentos sem série
  app.post('/api/saft/numerar-pendentes', requireAuth, async (req: Request, res: Response) => {
    try {
      const { ano } = req.body as { ano?: number };
      const anoFiltro = ano || new Date().getFullYear();
      const pendentes = await query<{ id: string }>(
        `SELECT id FROM public.pagamentos
         WHERE status='pago' AND "numeroSerie" IS NULL
           AND EXTRACT(YEAR FROM "createdAt")=$1
         ORDER BY data ASC, "createdAt" ASC`,
        [anoFiltro]
      );
      let numerados = 0;
      for (const p of pendentes) {
        await garantirNumeracaoPagamento(p.id);
        numerados++;
      }
      res.json({ ok: true, numerados });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/saft/pagamento/:id — detalhes SAF-T de um pagamento
  app.get('/api/saft/pagamento/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const info = await garantirNumeracaoPagamento(id);
      const hashRows = await query<any>(
        `SELECT * FROM public.saft_hashes WHERE pagamento_id=$1`, [id]
      );
      res.json({ ...info, hashInfo: hashRows[0] || null });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/saft/verificar-hash — verifica integridade de um documento
  app.post('/api/saft/verificar-hash', requireAuth, async (req: Request, res: Response) => {
    try {
      const { numeroSerie, hashFornecido } = req.body as { numeroSerie?: string; hashFornecido?: string };
      if (!numeroSerie) return res.status(400).json({ error: 'Número de série obrigatório.' });

      const pagRows = await query<{
        id: string; numeroSerie: string; valor: number; data: string;
        status: string; createdAt: string; alunoId: string;
      }>(
        `SELECT p.id, p."numeroSerie", p.valor, p.data, p.status, p."createdAt", p."alunoId"
         FROM public.pagamentos p
         WHERE p."numeroSerie" = $1
         LIMIT 1`,
        [numeroSerie]
      );

      if (pagRows.length === 0) {
        return res.json({
          valido: false,
          encontrado: false,
          mensagem: `Documento "${numeroSerie}" não encontrado na base de dados.`,
        });
      }

      const pag = pagRows[0];
      const hashRows = await query<{ hash: string; hash_anterior: string | null; pagamento_id: string }>(
        `SELECT hash, hash_anterior, pagamento_id FROM public.saft_hashes WHERE pagamento_id=$1`,
        [pag.id]
      );

      const hashRegistado = hashRows[0]?.hash ?? null;
      let hashMatch: boolean | null = null;
      let hashCurto: string | null = null;

      if (hashRegistado) {
        hashCurto = hashRegistado.substring(0, 8).toUpperCase();
        if (hashFornecido) {
          const normalizado = hashFornecido.replace(/\s/g, '').toLowerCase();
          hashMatch = hashRegistado.toLowerCase() === normalizado ||
                      hashRegistado.substring(0, 8).toLowerCase() === normalizado.substring(0, 8);
        }
      }

      const alunoRows = pag.alunoId ? await query<{ nome: string }>(
        `SELECT nome FROM public.alunos WHERE id=$1`, [pag.alunoId]
      ) : [];

      return res.json({
        valido: hashFornecido ? hashMatch : true,
        encontrado: true,
        numeroSerie: pag.numeroSerie,
        valor: pag.valor,
        data: pag.data,
        status: pag.status,
        aluno: alunoRows[0]?.nome ?? null,
        hashRegistado,
        hashCurto,
        hashMatch,
        mensagem: hashFornecido
          ? (hashMatch ? 'Hash verificado com sucesso — documento íntegro.' : 'Hash não corresponde — documento pode ter sido alterado.')
          : 'Documento encontrado na base de dados.',
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
