/**
 * Geração da Pauta Final (HTML imprimível) — partilhado entre Secretaria-Hub e
 * Acompanhamento de Pautas. Recebe os dados necessários e abre uma nova janela
 * com o documento pronto a imprimir / guardar como PDF.
 *
 * Regras de transição Angola MED (Decreto Executivo nº 04/2026 — Art. 23 §10):
 *  TRANSITA              — MFD ≥ notaMin em todas as disciplinas
 *  TRANSITA C/ CONDIÇÃO  — ≤ maxNeg negativos (configurável), todas ≥ 7 valores
 *                           I Ciclo (7ª/8ª): máx. 2 negativos (configurável)
 *                           II Ciclo (10ª/11ª): máx. 3 negativos (configurável)
 *  NÃO TRANSITA          — qualquer MFD < 7
 *                           OU excede maxNeg negativos
 *                           OU (Art. 23º §2): negativas em LP+MAT (I Ciclo)
 *                           OU (Art. 23 §10 Restrição LP+Área II Ciclo): LP negativa
 *                              + 2 disciplinas nucleares da área negativas
 */

// ── Utilitário de transição Angola MED (inline — sem dependência de módulo Node) ──

/**
 * Detecta se a classe é 7ª ou 8ª (I Ciclo) para activar Art. 23º §2.
 * Aceita: "7ª Classe", "8ª", "7", "8", "7a", "8°", etc.
 */
function isClasseICicloRestricaoInline(classe: string): boolean {
  return /^[78][ªa°º]?(\s*Classe)?$/i.test(classe.trim());
}

/**
 * Detecta se a classe é 10ª, 11ª ou 12ª (II Ciclo) para activar Art. 23º §2 no II Ciclo.
 */
function isClasseIICicloRestricaoInline(classe: string): boolean {
  return /^1[012][ªa°º]?(\s*Classe)?$/i.test(classe.trim());
}

function calcTransicao(
  disciplinasMfd: { nome: string; mfd: number }[],
  notaMin: number = 10,
  notaMinAbs: number = 7,
  maxNeg: number = 2,
  opcoes: {
    restricaoPortuguesMatematica?: boolean;
    restricaoArt23Activa?: boolean;
    disciplinasNuclearArt23?: string[];
    /** Restrição LP+Área — II Ciclo: LP negativa + 2 nucleares da área → NÃO TRANSITA */
    restricaoLPAreaActiva?: boolean;
  } = {}
): { texto: string; cor: string; bg: string; motivo: string; bloqueadoArt23: boolean; bloqueadoLPArea: boolean } {
  if (!disciplinasMfd.length) return { texto: '—', cor: '#6b7280', bg: '#f3f4f6', motivo: '', bloqueadoArt23: false, bloqueadoLPArea: false };

  const graves = disciplinasMfd.filter(d => Math.round(d.mfd) < notaMinAbs);
  const leves  = disciplinasMfd.filter(d => Math.round(d.mfd) >= notaMinAbs && Math.round(d.mfd) < notaMin);

  if (graves.length > 0)
    return { texto: 'NÃO TRANSITA', cor: '#b71c1c', bg: '#ffebee', bloqueadoArt23: false, bloqueadoLPArea: false,
             motivo: `Nota < ${notaMinAbs} em: ${graves.map(d => d.nome).join(', ')}` };

  if (leves.length > maxNeg)
    return { texto: 'NÃO TRANSITA', cor: '#b71c1c', bg: '#ffebee', bloqueadoArt23: false, bloqueadoLPArea: false,
             motivo: `${leves.length} negativas (máx. permitido: ${maxNeg} — Art. 23 §10)` };

  // ── Restrição LP+Área (II Ciclo, Art. 23 §10) ─────────────────────────────
  // LP negativa + 2 disciplinas nucleares da área negativas → NÃO TRANSITA
  if (opcoes.restricaoLPAreaActiva && leves.length > 0) {
    const nomesLeves = leves.map(d => d.nome);
    const temLP = nomesLeves.some(n => /portugu[eê]s/i.test(n));
    const nuclearSet = (opcoes.disciplinasNuclearArt23 || []).map(n => n.toLowerCase().trim());
    const nuclearesNeg = nomesLeves.filter(n =>
      !(/portugu[eê]s/i.test(n)) &&
      (nuclearSet.length > 0
        ? nuclearSet.some(nuc => n.toLowerCase().includes(nuc) || nuc.includes(n.toLowerCase()))
        : true) // fallback: qualquer disciplina não-LP conta como potencial da área
    );
    if (temLP && nuclearesNeg.length >= 2) {
      return {
        texto: 'NÃO TRANSITA', cor: '#6b21a8', bg: '#f3e8ff',
        bloqueadoArt23: false, bloqueadoLPArea: true,
        motivo: `Restrição LP+Área (Art. 23 §10): LP negativa + ${nuclearesNeg.join(', ')} (${nuclearesNeg.length} disciplinas da área)`,
      };
    }
  }

  // ── Art. 23º §2 — disciplinas nucleares configuráveis (I e II Ciclo) ───────
  if (opcoes.restricaoArt23Activa && opcoes.disciplinasNuclearArt23 && opcoes.disciplinasNuclearArt23.length >= 2 && leves.length >= 1) {
    const nuclearSet = opcoes.disciplinasNuclearArt23.map(n => n.toLowerCase().trim());
    const todasNucleares = leves.every(d =>
      nuclearSet.some(nuc => d.nome.toLowerCase().includes(nuc) || nuc.includes(d.nome.toLowerCase()))
    );
    if (todasNucleares) {
      const nomesNucleares = opcoes.disciplinasNuclearArt23.join(' e ');
      return { texto: 'NÃO TRANSITA', cor: '#7b0000', bg: '#ffcdd2', bloqueadoArt23: true, bloqueadoLPArea: false,
               motivo: `Art. 23º §2: negativas em disciplinas nucleares (${nomesNucleares})` };
    }
  } else if (opcoes.restricaoPortuguesMatematica && leves.length === 2) {
    const nomesLeves = leves.map(d => d.nome);
    const temPortugues  = nomesLeves.some(n => /portugu[eê]s/i.test(n));
    const temMatematica = nomesLeves.some(n => /matem[aá]tica/i.test(n));
    if (temPortugues && temMatematica)
      return { texto: 'NÃO TRANSITA', cor: '#7b0000', bg: '#ffcdd2', bloqueadoArt23: true, bloqueadoLPArea: false,
               motivo: `Art. 23º §2: as duas negativas são LP e Matemática em simultâneo` };
  }

  if (leves.length > 0)
    return { texto: 'TRANSITA C/ CONDIÇÃO', cor: '#e65100', bg: '#fff3e0', bloqueadoArt23: false, bloqueadoLPArea: false,
             motivo: `${leves.length} negativa(s) (≥${notaMinAbs} val.): ${leves.map(d => d.nome).join(', ')}` };

  return { texto: 'TRANSITA', cor: '#1b5e20', bg: '#e8f5e9', motivo: 'Aprovado em todas as disciplinas', bloqueadoArt23: false, bloqueadoLPArea: false };
}

/** Detecta se a classe é de Exame Nacional (6ª, 9ª, 12ª, Módulo 3, 2º EJA)
 *  Decreto Executivo nº 04/2026, Anexo III §4 e Anexo V. */
function isClasseExameNacional(classe: string): boolean {
  const s = classe.trim();
  if (/^[69][ªa°º]?(\s*Classe)?$/i.test(s)) return true;
  if (/^12[ªa°º]?(\s*Classe)?$/i.test(s)) return true;
  // EJA: Módulo 3 e 2º ano da EJA — aceita "2º EJA", "2 EJA", "2 ano EJA", "2.º ano EJA"
  const sl = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/modulo\s*3/.test(sl)) return true;
  if (/eja/.test(sl) && /\b2[o°º.]?\s*(ano\s*)?(?=eja|\b)/.test(sl)) return true;
  if (/eja/.test(sl) && /\b2\b/.test(sl)) return true;
  return false;
}

/** Detecta se é 12ª classe (tem EX1 e EX2 — NEN = média dos dois) */
function isClasse12(classe: string): boolean {
  return /^12[ªa°º]?(\s*Classe)?$/i.test(classe.trim());
}

export interface PautaFinalArgs {
  trimestre: number;
  anoLetivo: string;
  pautasSubmetidas: Array<{
    turmaId: string;
    disciplina: string;
  }>;
  turmas: Array<{ id: string; nome: string; classe?: string }>;
  alunos: Array<{ id: string; nome: string; apelido?: string; turmaId: string; ativo?: boolean; numeroMatricula?: string }>;
  notas: Array<{
    alunoId: string; turmaId: string; disciplina: string; trimestre: number;
    mt1?: number; mt?: number;
    /** Exame Nacional — EN1 (6ª/9ª/12ª) */
    ex1?: number;
    /** Exame Nacional — EN2 (apenas 12ª) */
    ex2?: number;
    /** MFD final guardado pela secretaria (inclui EN para classes de exame) */
    nf?: number;
  }>;
  config: {
    nomeEscola?: string;
    logoUrl?: string;
    notaMinimaAprovacao?: number;
    directorPedagogico?: string;
    directorGeral?: string;
    /** Art. 23º §2 — I Ciclo: activar restrição para 7ª e 8ª classes */
    restricaoArt23ICiclo?: boolean;
    /** Art. 23º §2 — II Ciclo: activar restrição para 10ª, 11ª e 12ª classes */
    restricaoArt23IICiclo?: boolean;
    /** Disciplinas marcadas como nuclear Art. 23 (ex: ["Língua Portuguesa","Matemática"]) */
    disciplinasNuclearArt23?: string[];
    /** Art. 23 §10 — I Ciclo (7ª/8ª): máx. negativos para transição condicional (default: 2) */
    maxNegativosICiclo?: number;
    /** Art. 23 §10 — II Ciclo (10ª/11ª): máx. negativos para transição condicional (default: 3) */
    maxNegativosIICiclo?: number;
    /** Art. 23 §10 — II Ciclo: LP negativa + 2 disciplinas nucleares da área → NÃO TRANSITA */
    restricaoLPAreaIICiclo?: boolean;
  } | null;
  utilizadorNome?: string;
}

export function buildPautaFinalHtml(args: PautaFinalArgs, opts?: { showToolbar?: boolean }): string {
  const showToolbar = opts?.showToolbar ?? true;
  const { trimestre, anoLetivo, pautasSubmetidas, turmas, alunos, notas, config, utilizadorNome } = args;

  const nomeEscola = config?.nomeEscola || 'Escola';
  const logoUrl = config?.logoUrl || '';
  const dataHoje = new Date().toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' });
  const notaMin = config?.notaMinimaAprovacao ?? 10;

  // Agrupar pautas submetidas por turma
  const turmasMap: Record<string, typeof pautasSubmetidas> = {};
  for (const p of pautasSubmetidas) {
    if (!turmasMap[p.turmaId]) turmasMap[p.turmaId] = [];
    turmasMap[p.turmaId].push(p);
  }

  let bodyHtml = '';
  for (const [turmaId, pautasTurma] of Object.entries(turmasMap)) {
    const turmaObj = turmas.find(t => t.id === turmaId);
    const classeStr = turmaObj?.classe || '';
    // Detecta se é classe de Exame Nacional (6ª, 9ª, 12ª)
    const isExameNacional = isClasseExameNacional(classeStr);
    const is12a = isClasse12(classeStr);

    const alunosBase = alunos.filter(a => a.turmaId === turmaId && a.ativo !== false);
    // Alunos com pelo menos uma nota/MFD lançada nas disciplinas submetidas
    const alunosDaTurma = alunosBase.filter(a =>
      pautasTurma.some(p => {
        const nota = notas.find(n => n.alunoId === a.id && n.turmaId === turmaId && n.disciplina === p.disciplina && n.trimestre === trimestre);
        if (!nota) return false;
        // Para exame: aceita se tem nf, ex1, ou mt
        if (isExameNacional) return (nota.nf ?? 0) > 0 || (nota.ex1 ?? 0) > 0 || (nota.mt1 ?? nota.mt ?? 0) > 0;
        return (nota.mt1 ?? nota.mt ?? 0) > 0;
      })
    );
    if (alunosDaTurma.length === 0) continue;
    const turmaNome = turmaObj?.nome || '—';

    // Badge EN para classes de exame (indicador no cabeçalho)
    const enBadge = isExameNacional
      ? `<span style="display:inline-block;background:#1565c0;color:#fff;border-radius:4px;padding:2px 8px;font-size:8px;font-weight:800;margin-left:8px;letter-spacing:.5px;">
           ${is12a ? '🎓 EN — EX1 + EX2 → NEN → MFD (Decreto Anexo III)' : '🎓 EN — EX1 → MFD (Decreto Anexo III)'}
         </span>`
      : '';

    // Cabeçalho da coluna MFD — para exame usa "MFD*", para transição usa "MFD"
    const mfdColHeader = isExameNacional
      ? `<th style="background:#1565c0;color:#fff" title="MFD calculada com Exame Nacional">MFD*<br/><span style="font-size:6.5px;font-weight:normal">c/ EN</span></th>`
      : `<th>MFD</th>`;

    bodyHtml += `
<div class="page">
<div class="header">
  ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="width:55px;height:55px;object-fit:contain;"/>` : ''}
  <p class="rep">REPÚBLICA DE ANGOLA — MINISTÉRIO DA EDUCAÇÃO</p>
  <p class="escola-name">${nomeEscola}</p>
  <p class="mapa-title">PAUTA FINAL DE AVALIAÇÃO — ${trimestre}º TRIMESTRE${enBadge}</p>
  <p class="mapa-sub">Turma: <strong>${turmaNome}</strong> &nbsp;|&nbsp; Classe: <strong>${classeStr || '—'}</strong> &nbsp;|&nbsp; Ano Lectivo: <strong>${anoLetivo}</strong></p>
</div>
<p class="secretaria-stamp">✅ Pauta Final gerada e validada pela Secretaria Académica em ${dataHoje}</p>
<table>
  <thead>
    <tr>
      <th style="width:30px">Nº</th>
      <th style="width:70px">Nº ALUNO</th>
      <th style="min-width:130px;text-align:left">NOME COMPLETO</th>
      ${pautasTurma.map(p => `<th>${p.disciplina}</th>`).join('')}
      ${mfdColHeader}
      <th style="background:#1b5e20;color:#fff">OBSERVAÇÃO<br/><span style="font-size:7px;font-weight:normal">Decreto Exec. nº 04/2026</span></th>
    </tr>
  </thead>
  <tbody>
    ${alunosDaTurma.map((aluno, idx) => {
      const discMfds: { nome: string; mfd: number }[] = [];

      const disciplinasMts = pautasTurma.map(p => {
        const nota = notas.find(n => n.alunoId === aluno.id && n.turmaId === turmaId && n.disciplina === p.disciplina && n.trimestre === trimestre);
        let gradeVal = 0;

        if (isExameNacional) {
          // Para classe de exame: usa nf (MFD com EN guardado pela secretaria)
          // Se nf não existe mas ex1 > 0, recalcula
          if ((nota?.nf ?? 0) > 0) {
            gradeVal = nota!.nf!;
          } else if ((nota?.ex1 ?? 0) > 0) {
            const mt3 = nota?.mt1 ?? nota?.mt ?? 0;
            const ex1v = nota?.ex1 ?? 0;
            const ex2v = nota?.ex2 ?? 0;
            // NEN: 12ª = (ex1+ex2)/2 ; 6ª/9ª = ex1
            const nen = is12a && ex2v > 0 ? (ex1v + ex2v) / 2 : ex1v;
            // Fórmula nuclear Decreto Anexo III
            gradeVal = Math.round((0.5 * mt3 + 0.5 * nen) * 10) / 10;
          } else {
            // EN ainda não lançado — mostra MT3
            gradeVal = nota?.mt1 ?? nota?.mt ?? 0;
          }
        } else {
          gradeVal = nota?.mt1 ?? nota?.mt ?? 0;
        }

        if (gradeVal > 0) discMfds.push({ nome: p.disciplina, mfd: gradeVal });
        return gradeVal > 0 ? gradeVal.toFixed(1) : '—';
      });

      const mtsNums = discMfds.map(d => d.mfd);
      const mfd = mtsNums.length ? mtsNums.reduce((a, b) => a + b, 0) / mtsNums.length : null;
      const mfdCor = mfd === null ? '#000' : Math.round(mfd) >= notaMin ? '#155724' : '#721c24';

      // ── Decisão Angola MED: TRANSITA / TRANSITA C/ CONDIÇÃO / NÃO TRANSITA ──
      const classeTransicao = classeStr;
      const nuclearNomes = config?.disciplinasNuclearArt23 || [];
      const isICiclo  = isClasseICicloRestricaoInline(classeTransicao);
      const isIICiclo = isClasseIICicloRestricaoInline(classeTransicao);

      const maxNegICiclo  = Number(config?.maxNegativosICiclo  ?? 2);
      const maxNegIICiclo = Number(config?.maxNegativosIICiclo ?? 3);
      const maxNegEfetivo = isICiclo ? maxNegICiclo : isIICiclo ? maxNegIICiclo : 2;

      const restricaoArt23Activa =
        (Boolean(config?.restricaoArt23ICiclo) && isICiclo) ||
        (Boolean(config?.restricaoArt23IICiclo) && isIICiclo);
      const restricaoLPAreaActiva = Boolean(config?.restricaoLPAreaIICiclo) && isIICiclo;

      const trans = discMfds.length
        ? calcTransicao(discMfds, notaMin, 7, maxNegEfetivo, {
            restricaoArt23Activa,
            disciplinasNuclearArt23: nuclearNomes.length >= 2 ? nuclearNomes : undefined,
            restricaoPortuguesMatematica: restricaoArt23Activa && nuclearNomes.length < 2,
            restricaoLPAreaActiva,
          })
        : { texto: '—', cor: '#000', bg: '#fff', motivo: '', bloqueadoArt23: false, bloqueadoLPArea: false };

      const rowBg = trans.bloqueadoArt23 ? '#fff0f0' : trans.bloqueadoLPArea ? '#faf5ff' : 'transparent';
      const rowBorderLeft = trans.bloqueadoArt23
        ? 'border-left:3px solid #7b0000;'
        : trans.bloqueadoLPArea
          ? 'border-left:3px solid #6b21a8;'
          : '';

      const obsCellHtml = trans.bloqueadoLPArea
        ? `<td style="font-weight:900;color:#6b21a8;background:#f3e8ff;font-size:8px;letter-spacing:.3px;border-left:2px solid #6b21a8;padding:2px 4px;" title="${trans.motivo}">
            NÃO TRANSITA<br/>
            <span style="display:inline-block;background:#6b21a8;color:#fff;border-radius:2px;padding:1px 3px;font-size:6.5px;font-weight:800;letter-spacing:.4px;margin-top:1px;">⛔ LP+ÁREA §10</span>
           </td>`
        : trans.bloqueadoArt23
          ? `<td style="font-weight:900;color:#7b0000;background:#ffcdd2;font-size:8px;letter-spacing:.3px;border-left:2px solid #7b0000;padding:2px 4px;" title="${trans.motivo}">
              NÃO TRANSITA<br/>
              <span style="display:inline-block;background:#7b0000;color:#fff;border-radius:2px;padding:1px 3px;font-size:6.5px;font-weight:800;letter-spacing:.4px;margin-top:1px;">⚠ Art. 23º §2</span>
             </td>`
          : trans.texto === 'TRANSITA C/ CONDIÇÃO'
            ? `<td style="font-weight:900;color:${trans.cor};background:${trans.bg};font-size:7.5px;letter-spacing:.3px;padding:2px 3px;" title="${trans.motivo}">
                TRANSITA C/ CONDIÇÃO<br/>
                <span style="font-size:6.5px;font-weight:600;color:#92400e;">${discMfds.filter(d=>Math.round(d.mfd)>=7&&Math.round(d.mfd)<notaMin).map(d=>d.nome).slice(0,2).join(', ')}${discMfds.filter(d=>Math.round(d.mfd)>=7&&Math.round(d.mfd)<notaMin).length>2?' (+mais)':''}</span>
               </td>`
            : `<td style="font-weight:900;color:${trans.cor};background:${trans.bg};font-size:8px;letter-spacing:.3px" title="${trans.motivo}">${trans.texto}</td>`;

      return `<tr style="background:${rowBg};${rowBorderLeft}">
        <td style="text-align:center">${String(idx + 1).padStart(2,'0')}</td>
        <td style="text-align:center;font-weight:bold">${aluno.numeroMatricula || '—'}</td>
        <td style="text-align:left;padding-left:4px;${trans.bloqueadoArt23 ? 'font-weight:bold;' : ''}">${aluno.nome} ${aluno.apelido || ''}</td>
        ${disciplinasMts.map(m => {
          const v = parseFloat(m);
          const c = isNaN(v) ? '#000' : Math.round(v) >= notaMin ? '#155724' : (Math.round(v) < 7 ? '#b71c1c' : '#e65100');
          return `<td style="color:${c};font-weight:${isNaN(v)?'normal':'bold'}">${m}</td>`;
        }).join('')}
        <td style="font-weight:bold;color:${mfdCor};${isExameNacional ? 'background:#e3f2fd;' : ''}">${mfd !== null ? mfd.toFixed(1) : '—'}</td>
        ${obsCellHtml}
      </tr>`;
    }).join('')}
  </tbody>
</table>
<div class="legenda">
  <span class="leg-item"><span class="leg-dot" style="background:#e8f5e9;border:1px solid #1b5e20;color:#1b5e20;">T</span> TRANSITA</span>
  <span class="leg-item"><span class="leg-dot" style="background:#fff3e0;border:1px solid #e65100;color:#e65100;">C</span> TRANSITA C/ CONDIÇÃO</span>
  <span class="leg-item"><span class="leg-dot" style="background:#ffebee;border:1px solid #b71c1c;color:#b71c1c;">N</span> NÃO TRANSITA</span>
  <span class="leg-item leg-art23"><span class="leg-dot" style="background:#ffcdd2;border:1px solid #7b0000;color:#7b0000;">⚠</span> <strong>Art. 23º §2</strong> — negativas em disciplinas nucleares (LP + Mat. em simultâneo)</span>
  <span class="leg-item leg-lparea"><span class="leg-dot" style="background:#f3e8ff;border:1px solid #6b21a8;color:#6b21a8;">⛔</span> <strong>LP+ÁREA §10</strong> — II Ciclo: LP negativa + 2 disciplinas da área — NÃO TRANSITA</span>
  ${isExameNacional ? `<span class="leg-item" style="color:#1565c0;"><span class="leg-dot" style="background:#e3f2fd;border:1px solid #1565c0;color:#1565c0;font-size:7px;">EN</span> <strong>MFD*</strong> = MFD calculada com Exame Nacional (Decreto Exec. nº 04/2026 — Anexo III)</span>` : ''}
</div>
<div class="footer">
  <div class="sig"><div class="sig-line">O(A) DIRECTOR(A) PEDAGÓGICO(A)<br/><strong>${config?.directorPedagogico || '___________________'}</strong></div></div>
  <div class="sig"><div class="sig-line">SECRETARIA ACADÉMICA<br/><strong>${utilizadorNome || '___________________'}</strong></div></div>
  <div class="sig"><div class="sig-line">O(A) DIRECTOR(A) GERAL<br/><strong>${config?.directorGeral || '___________________'}</strong></div></div>
</div>
</div>`;
  }

  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"/>
<title>Pauta Final — ${trimestre}º Trimestre — ${anoLetivo}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Times New Roman',serif;background:#fff;color:#000;font-size:10px;}
  .btn-toolbar{display:flex;gap:8px;justify-content:center;margin:14px auto;}
  .print-btn{padding:9px 22px;font-size:12px;background:#003366;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:bold;}
  .page{padding:12mm 14mm;page-break-after:always;}
  .page:last-child{page-break-after:auto;}
  .header{text-align:center;margin-bottom:8px;}
  .rep{font-size:9px;text-transform:uppercase;line-height:1.5;}
  .escola-name{font-size:11px;font-weight:bold;text-decoration:underline;text-transform:uppercase;margin-top:2px;}
  .mapa-title{font-size:11px;font-weight:bold;margin:6px 0 2px;}
  .mapa-sub{font-size:9.5px;margin-bottom:4px;}
  .secretaria-stamp{background:#e8f5e9;border:1px solid #4caf50;border-radius:4px;padding:4px 10px;font-size:9px;color:#1b5e20;margin-bottom:6px;display:inline-block;}
  table{width:100%;border-collapse:collapse;margin-top:6px;}
  th,td{border:1px solid #333;padding:2px 3px;text-align:center;vertical-align:middle;font-size:8.5px;}
  th{background:#c6efce;font-weight:bold;}
  .footer{display:flex;justify-content:space-between;margin-top:24px;}
  .sig{text-align:center;min-width:180px;}
  .sig-line{border-top:1px solid #000;margin-top:40px;padding-top:4px;font-size:10px;}
  .legenda{display:flex;flex-wrap:wrap;gap:8px 16px;margin:10px 0 6px;padding:5px 8px;border:1px solid #ccc;border-radius:3px;background:#fafafa;font-size:8px;}
  .leg-item{display:flex;align-items:center;gap:4px;color:#333;}
  .leg-art23{color:#7b0000;font-weight:bold;}
  .leg-lparea{color:#6b21a8;font-weight:bold;}
  .leg-dot{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:2px;font-size:8px;font-weight:900;flex-shrink:0;}
  @media print{@page{size:A4 landscape;margin: 0;}.btn-toolbar{display:none;}}
</style>
</head>
<body>
${showToolbar ? `<div class="btn-toolbar">
  <button class="print-btn" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
</div>` : ''}
${bodyHtml}
</body></html>`;

  return html;
}

export function abrirPautaFinalImprimivel(args: PautaFinalArgs): void {
  if (typeof window === 'undefined') return;
  const html = buildPautaFinalHtml(args, { showToolbar: true });
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}
