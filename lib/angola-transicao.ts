/**
 * lib/angola-transicao.ts
 * Utilitário partilhado (cliente + servidor) — Regras de Transição Angola MED
 *
 * Fonte: Decreto Executivo nº 3/20 e Regulamento de Avaliação das
 * Aprendizagens do Ensino Secundário (I e II Ciclo).
 *
 * Utilizado em: mini-pauta, boletim anual, pauta final/geral (Editor de Documentos).
 * NÃO alterar sem confirmar com a legislação vigente.
 */

export interface DisciplinaParaTransicao {
  nome: string;
  mfd: number;
}

export interface ResultadoTransicao {
  transita: boolean;
  situacao: "TRANSITA" | "TRANSITA C/ CONDIÇÃO" | "NÃO TRANSITA";
  motivo: string;
  negativasGraves: string[];
  negativasLeves: string[];
  totalNegativas: number;
  cor: string;
  bg: string;
}

export interface OpcoesTransicaoAngola {
  /**
   * Art. 23º §2 — I Ciclo (7ª e 8ª classes):
   * A transição condicional NÃO é permitida quando as duas disciplinas negativas
   * (7–9 valores) são SIMULTANEAMENTE Língua Portuguesa E Matemática.
   * Activar apenas para turmas da 7ª ou 8ª classe.
   * @deprecated Usar disciplinasNuclearArt23 + restricaoArt23Activa
   */
  restricaoPortuguesMatematica?: boolean;

  /**
   * Art. 23º §2 — restrição activa para este ciclo (I ou II).
   * Combinado com disciplinasNuclearArt23 substitui restricaoPortuguesMatematica.
   */
  restricaoArt23Activa?: boolean;

  /**
   * Lista de nomes de disciplinas marcadas como "nuclear Art. 23"
   * (ex: ["Língua Portuguesa", "Matemática"]).
   * Quando todas as negativas leves do aluno pertencem a este conjunto,
   * a transição condicional é bloqueada (Art. 23º §2).
   */
  disciplinasNuclearArt23?: string[];
}

/**
 * Detecta se uma string de classe corresponde à 7ª ou 8ª classe (I Ciclo).
 * Exemplos aceites: "7ª Classe", "8ª", "7", "8", "7a", "8°"
 */
export function isClasseICicloRestricao(classe: string): boolean {
  return /^[78][ªa°º]?(\s*Classe)?$/i.test(classe.trim());
}

/**
 * Detecta se uma string de classe corresponde ao II Ciclo (10ª, 11ª ou 12ª classe).
 * Exemplos aceites: "10ª Classe", "11ª", "12", "10a", "11°", "12ª Classe"
 */
export function isClasseIICicloRestricao(classe: string): boolean {
  return /^1[012][ªa°º]?(\s*Classe)?$/i.test(classe.trim());
}

/**
 * Calcula a situação de transição do aluno com base nas normas Angola MED.
 *
 * @param disciplinas - lista de {nome, mfd} — MFD já em valor real (não arredondado)
 * @param notaMin      - nota mínima de aprovação (padrão 10)
 * @param notaMinAbs   - nota mínima absoluta; abaixo disso reprova directamente (padrão 6 — Decreto 04/2026 Anexo II: Mau = 0–5)
 * @param maxNeg       - número máximo de negativas permitidas para transitar (padrão 2)
 * @param opcoes       - opções adicionais de legislação (e.g. Art. 23º §2)
 */
export function calcularTransicaoAngola(
  disciplinas: DisciplinaParaTransicao[],
  notaMin: number = 10,
  notaMinAbs: number = 6,
  maxNeg: number = 2,
  opcoes: OpcoesTransicaoAngola = {}
): ResultadoTransicao {
  if (disciplinas.length === 0) {
    return {
      transita: false,
      situacao: "NÃO TRANSITA",
      motivo: "Sem dados de avaliação",
      negativasGraves: [],
      negativasLeves: [],
      totalNegativas: 0,
      cor: "#6b7280",
      bg: "#f3f4f6",
    };
  }

  const negativasGraves: string[] = [];
  const negativasLeves: string[] = [];

  for (const d of disciplinas) {
    const mfdArred = Math.round(d.mfd);
    if (mfdArred < notaMinAbs) {
      negativasGraves.push(d.nome);
    } else if (mfdArred < notaMin) {
      negativasLeves.push(d.nome);
    }
  }

  const totalNegativas = negativasGraves.length + negativasLeves.length;

  // Regra 1: MFD < notaMinAbs (< 7) em qualquer disciplina → NÃO TRANSITA
  if (negativasGraves.length > 0) {
    return {
      transita: false,
      situacao: "NÃO TRANSITA",
      motivo: `Nota inferior a ${notaMinAbs} em: ${negativasGraves.join(", ")}`,
      negativasGraves,
      negativasLeves,
      totalNegativas,
      cor: "#b71c1c",
      bg: "#ffebee",
    };
  }

  // Regra 2: Mais de maxNeg negativas (entre 7 e 9) → NÃO TRANSITA
  if (negativasLeves.length > maxNeg) {
    return {
      transita: false,
      situacao: "NÃO TRANSITA",
      motivo: `${negativasLeves.length} disciplinas negativas — máximo permitido é ${maxNeg}`,
      negativasGraves,
      negativasLeves,
      totalNegativas,
      cor: "#b71c1c",
      bg: "#ffebee",
    };
  }

  // Regra Art. 23º §2 — configurável por ciclo e disciplinas nucleares:
  // Quando TODAS as negativas leves (7–9 val.) são disciplinas marcadas como "nuclear Art. 23"
  // a transição condicional é bloqueada — NÃO TRANSITA.
  //
  // Caminho moderno: restricaoArt23Activa + disciplinasNuclearArt23 (configurável via BD)
  // Caminho legado:  restricaoPortuguesMatematica (hardcoded LP+MAT — mantido por compatibilidade)
  if (negativasLeves.length >= 1 && negativasLeves.length <= maxNeg) {
    if (opcoes.restricaoArt23Activa && opcoes.disciplinasNuclearArt23 && opcoes.disciplinasNuclearArt23.length >= 2) {
      const nuclearSet = opcoes.disciplinasNuclearArt23.map(n => n.toLowerCase().trim());
      const todasNucleares = negativasLeves.every(nome =>
        nuclearSet.some(nuc => nome.toLowerCase().includes(nuc) || nuc.includes(nome.toLowerCase()))
      );
      if (todasNucleares && negativasLeves.length === negativasLeves.filter(nome =>
        nuclearSet.some(nuc => nome.toLowerCase().includes(nuc) || nuc.includes(nome.toLowerCase()))
      ).length) {
        const nomesNucleares = opcoes.disciplinasNuclearArt23.join(" e ");
        return {
          transita: false,
          situacao: "NÃO TRANSITA",
          motivo: `Art. 23º §2: as negativas são simultaneamente disciplinas nucleares (${nomesNucleares}) — condição de transição não se aplica`,
          negativasGraves,
          negativasLeves,
          totalNegativas,
          cor: "#b71c1c",
          bg: "#ffebee",
        };
      }
    } else if (opcoes.restricaoPortuguesMatematica && negativasLeves.length === 2) {
      // Caminho legado: hardcoded LP+MAT (mantido para compatibilidade)
      const temPortugues  = negativasLeves.some(n => /portugu[eê]s/i.test(n));
      const temMatematica = negativasLeves.some(n => /matem[aá]tica/i.test(n));
      if (temPortugues && temMatematica) {
        return {
          transita: false,
          situacao: "NÃO TRANSITA",
          motivo: `Art. 23º §2: as duas negativas são simultaneamente Língua Portuguesa e Matemática — condição de transição não se aplica`,
          negativasGraves,
          negativasLeves,
          totalNegativas,
          cor: "#b71c1c",
          bg: "#ffebee",
        };
      }
    }
  }

  // Regra 3: ≤ maxNeg negativas, todas ≥ notaMinAbs → TRANSITA (com condição se houver negativas)
  if (negativasLeves.length > 0) {
    return {
      transita: true,
      situacao: "TRANSITA C/ CONDIÇÃO",
      motivo: `Transita com ${negativasLeves.length} negativa(s) ≥ ${notaMinAbs}: ${negativasLeves.join(", ")}`,
      negativasGraves,
      negativasLeves,
      totalNegativas,
      cor: "#e65100",
      bg: "#fff3e0",
    };
  }

  // Regra 4: Sem negativas → TRANSITA
  return {
    transita: true,
    situacao: "TRANSITA",
    motivo: "Aprovado em todas as disciplinas",
    negativasGraves,
    negativasLeves,
    totalNegativas: 0,
    cor: "#1b5e20",
    bg: "#e8f5e9",
  };
}

/**
 * Calcula a situação por disciplina individual (para coluna Obs).
 * Retorna T / NT / T* / NT* conforme definitividade dos dados.
 */
export function calcularObsDisciplina(
  mfd: number | null,
  hasAll3Trimestres: boolean,
  notaMin: number = 10
): { html: string; texto: "T" | "NT" | "T*" | "NT*" | "—" } {
  if (mfd === null) return { html: "", texto: "—" };

  const mfdArred = Math.round(mfd);
  const definitivo = hasAll3Trimestres;
  const passa = mfdArred >= notaMin;

  if (passa) {
    const texto: "T" | "T*" = definitivo ? "T" : "T*";
    const html = definitivo
      ? `<span style="color:#1b5e20;font-weight:bold;font-size:11px;">T</span>`
      : `<span style="color:#2e7d32;font-style:italic;font-size:9.5px;" title="Provisório — faltam trimestres">T*</span>`;
    return { html, texto };
  } else {
    const texto: "NT" | "NT*" = definitivo ? "NT" : "NT*";
    const html = definitivo
      ? `<span style="color:#b71c1c;font-weight:bold;font-size:11px;">NT</span>`
      : `<span style="color:#c62828;font-style:italic;font-size:9.5px;" title="Provisório — faltam trimestres">NT*</span>`;
    return { html, texto };
  }
}
