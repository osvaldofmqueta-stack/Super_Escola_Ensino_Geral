import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback, ReactNode } from 'react';
import { api } from '../lib/api';
import { showToast } from '../utils/toast';
import { isOfflineQueued, subscribeOnlineSync } from '../lib/optimistic';

export type FlashDestinario =
  | 'todos'
  | 'alunos'
  | 'alunos_encarregados'
  | 'encarregados'
  | 'professores'
  | 'funcionarios'
  | 'administradores';

export interface FlashScreenConfig {
  ativa: boolean;
  titulo: string;
  mensagem: string;
  imagemUrl: string;
  duracao: number;
  bgColor: string;
  dataInicio: string;
  dataFim: string;
  destinatarios: FlashDestinario;
}

export interface IrtEscalao {
  max: number | null;
  taxa: number;
  baseFixa: number;
  limiteAnterior: number;
}

export interface ConfigGeral {
  nomeEscola: string;
  codigoMED?: string;
  morada?: string;
  municipio?: string;
  provincia?: string;
  telefoneEscola?: string;
  emailEscola?: string;
  subdirectorPedagogico?: string;
  logoUrl?: string;
  pp1Habilitado: boolean;
  pptHabilitado: boolean;
  notaMinimaAprovacao: number;
  maxAlunosTurma: number;
  minTurmasProfessor: number;
  maxTurmasProfessor: number;
  maxDisciplinasPorProfessor: number;
  /** Mês civil em que o ano lectivo começa (1–12). Padrão Angola: 9 (Setembro). */
  mesInicioAnoLetivo: number;
  numAvaliacoes: number;
  macMin: number;
  macMax: number;
  /** Modo de conversão da escala bruta para 0–20: 'proporcional' (×20/macMax) ou 'linear' (mín=0, máx=20). */
  tipoEscala: 'proporcional' | 'linear';
  horarioFuncionamento: string;
  flashScreen: FlashScreenConfig;
  directorGeral?: string;
  directorPedagogico?: string;
  directorProvincialEducacao?: string;
  propinaHabilitada: boolean;
  numeroEntidade?: string;
  iban?: string;
  nomeBeneficiario?: string;
  bancoTransferencia?: string;
  telefoneMulticaixaExpress?: string;
  nib?: string;
  // Dados de pagamento da subscrição SIGA
  licencaIban?: string;
  licencaBic?: string;
  licencaMulticaixaRef?: string;
  licencaBeneficiario?: string;
  prazosLancamento?: { t1?: string; t2?: string; t3?: string };
  // Taxas salariais
  inssEmpPerc: number;
  inssPatrPerc: number;
  irtTabela: IrtEscalao[];
  // Meses do ano académico (números: 9=Set, 10=Out, ...)
  mesesAnoAcademico: number[];
  // Exame Antecipado — alunos com negativa em disciplina terminal podem fazer exame sem arrastar para o próximo ano
  exameAntecipadoHabilitado: boolean;
  // PAP — Prova de Aptidão Profissional
  papHabilitado: boolean;
  papClasses: string[];
  estagioComoDisciplina: boolean;
  papDisciplinasContribuintes: string[];
  inscricoesAbertas: boolean;
  inscricaoDataInicio?: string;
  inscricaoDataFim?: string;
  exclusaoDuasReprovacoes: boolean;
  /** Art. 23º §2 — I Ciclo: proíbe transição condicional quando as negativas leves são
   *  todas disciplinas nucleares Art. 23 (7ª e 8ª classes) */
  restricaoArt23ICiclo: boolean;
  /** Art. 23º §2 — II Ciclo: mesma regra aplicada à 10ª, 11ª e 12ª classe */
  restricaoArt23IICiclo: boolean;
  /** Nomes das disciplinas marcadas como nuclearArt23=true (LP, MAT, etc.) */
  disciplinasNuclearArt23?: string[];
  /** Art. 23º §5 — Bloqueia conclusão de matrícula se aluno tem disciplinas não aprovadas no ano anterior */
  bloqueioMatriculaHabilitado: boolean;
  /** Classes onde o bloqueio Art. 23º §5 se aplica */
  bloqueioMatriculaClasses: string[];
  /** Bloqueia automaticamente o login do aluno quando a propina está em atraso há mais de X dias */
  bloqueioFinanceiroHabilitado: boolean;
  /** Nº de dias de atraso a partir do qual o login do aluno é bloqueado */
  diasAtrasoBloqueio: number;
  /** Nº máximo de disciplinas não-nucleares com deficiência que ainda permitem aprovação (0 = desactivado) */
  maxDeficienciasAprovacao: number;
  /** Se false, toda referência à 13ª Classe é ocultada em toda a aplicação (turmas, dropdowns, certificados, PAP, etc.) */
  temDecimaTermeira: boolean;
  // Visibilidade global das notas no portal do estudante
  notasVisiveis: boolean;
  /** Exige aprovação por email antes de conceder acesso */
  loginAprovacaoAtiva: boolean;
  // Schedule periods stored in DB (replaces AsyncStorage)
  periodosHorario?: { numero: number; inicio: string; fim: string }[];
  // Last backup timestamp stored in DB (replaces localStorage)
  ultimoBackup?: string;
  // Período de avaliação distribuída de professores
  avaliacaoPeriodoAtivo: boolean;
  avaliacaoPeriodoInicio?: string;
  avaliacaoPeriodoFim?: string;
  avaliacaoPeriodoLabel?: string;
  // Pagamentos Online — EMIS/Multicaixa
  emisHabilitado?: boolean;
  emisAmbiente?: 'sandbox' | 'producao';
  emisProvedor?: string;
  emisProvedorCustomCode?: string;
  emisEntidadeId?: string;
  emisApiKey?: string;
  emisApiUrl?: string;
  emisPrazoPagamento?: number;
  emisNotificarSMS?: boolean;
  // ─── Sistema de Avaliação — Percentagens das Provas ───────────────────────
  percMac: number;        // % do MAC na Nota Trimestral (default 30)
  percPp: number;         // % da PP na Nota Trimestral (default 70)
  percNt: number;         // % da NT na NF para T1/T2 (default 60)
  percPt: number;         // % da PT na NF para T1/T2 (default 40)
  percPg: number;         // % de cada Prova Global na NF para T3 10ª/11ª (default 40)
  percExame: number;      // % de cada Exame na NF para T3 12ª Classe (default 40)
  /** Activar peso numérico da Avaliação Formativa dentro do MAC (Opção B). Default false. */
  avaliacaoFormativaHabilitada: boolean;
  /** % da Avaliação Formativa dentro do MAC (Opção B — Dec. Exec. 04/2026). Default 20. */
  percFormativa: number;
  modeloAvaliacao?: string; // ID do modelo de avaliação activo (ex: 'med_1ciclo')
  /** Se false, coluna NPP não existe na pauta — NT = MAC directamente (default: true) */
  temNPP?: boolean;
  /** Se false, coluna NPT não existe na pauta — NF (T1/T2) = NT directamente (default: true) */
  temNPT?: boolean;
  /** Complexo escolar: escola com múltiplos níveis de ensino (Primário → 13ª Classe) */
  complexoEscolar?: boolean;
  /** Mapa de percentagens por nível de ensino (só activo quando complexoEscolar=true) */
  modelosAvaliacaoPorNivel?: Record<string, import('../lib/percPorNivel').PercAvaliacaoNivel> | null;
  provaRecuperacaoHabilitada: boolean;
  // ─── Assistente IA — Chaves de API ────────────────────────────────────────
  groqApiKey?: string;
  openaiApiKey?: string;
  // ─── Decreto Executivo nº 04/2026 — Fórmulas de Cálculo ──────────────────
  /** Activar fórmulas do Decreto 04/2026 (Anexo III) */
  usarFormulasDecreto: boolean;
  /** Peso da MAC na Média Trimestral (§2 · T1 e T2). Padrão Decreto: 50% */
  percMacDecreto: number;
  /** Peso do MT₃ na MFD para 6ª e 9ª Classe com exame nacional (§4a). Padrão: 60% */
  percMT3Exame9aDecreto: number;
  /** Peso do MT₃ na MFD para 12ª Classe com exame nacional (§4c). Padrão: 50% */
  percMT3Exame12aDecreto: number;
  // ─── Transição Condicional — Art. 23º §10 ────────────────────────────────
  /** Máximo de disciplinas negativas leves para transição condicional — I Ciclo (7ª/8ª). Padrão: 2 */
  maxNegativosICiclo: number;
  /** Máximo de disciplinas negativas leves para transição condicional — II Ciclo (10ª-12ª). Padrão: 3 */
  maxNegativosIICiclo: number;
  /** LP negativa + 2 disciplinas nucleares da área → NÃO TRANSITA (II Ciclo) */
  restricaoLPAreaIICiclo: boolean;
  // ─── Reapreciação de Notas ────────────────────────────────────────────────
  /** Prazo em horas para análise de pedidos de reapreciação (Art. 38º). Padrão: 48h */
  reapreciacaoPrazosHoras: number;
}

const DEFAULT_FLASH: FlashScreenConfig = {
  ativa: false,
  titulo: '',
  mensagem: '',
  imagemUrl: '',
  duracao: 5,
  bgColor: '#0A1628',
  dataInicio: '',
  dataFim: '',
  destinatarios: 'todos',
};

const DEFAULT_IRT: IrtEscalao[] = [
  { max: 70000,    taxa: 0,    baseFixa: 0,      limiteAnterior: 0 },
  { max: 100000,   taxa: 0.10, baseFixa: 0,      limiteAnterior: 70000 },
  { max: 150000,   taxa: 0.13, baseFixa: 3000,   limiteAnterior: 100000 },
  { max: 200000,   taxa: 0.16, baseFixa: 9500,   limiteAnterior: 150000 },
  { max: 300000,   taxa: 0.18, baseFixa: 17500,  limiteAnterior: 200000 },
  { max: 500000,   taxa: 0.19, baseFixa: 35500,  limiteAnterior: 300000 },
  { max: 1000000,  taxa: 0.20, baseFixa: 73500,  limiteAnterior: 500000 },
  { max: null,     taxa: 0.25, baseFixa: 173500, limiteAnterior: 1000000 },
];

const DEFAULT_CONFIG: ConfigGeral = {
  nomeEscola: 'Super Escola',
  propinaHabilitada: true,
  pp1Habilitado: true,
  pptHabilitado: true,
  notaMinimaAprovacao: 10,
  maxAlunosTurma: 35,
  minTurmasProfessor: 1,
  maxTurmasProfessor: 8,
  maxDisciplinasPorProfessor: 5,
  mesInicioAnoLetivo: 9,
  numAvaliacoes: 4,
  macMin: 1,
  macMax: 5,
  tipoEscala: 'proporcional',
  horarioFuncionamento: 'Seg-Sex: 07:00-19:00 | Sáb: 07:00-13:00',
  flashScreen: DEFAULT_FLASH,
  inssEmpPerc: 3,
  inssPatrPerc: 8,
  irtTabela: DEFAULT_IRT,
  mesesAnoAcademico: [9, 10, 11, 12, 1, 2, 3, 4, 5, 6],
  exameAntecipadoHabilitado: false,
  papHabilitado: false,
  papClasses: ['13ª Classe'],
  estagioComoDisciplina: false,
  papDisciplinasContribuintes: [],
  inscricoesAbertas: false,
  exclusaoDuasReprovacoes: false,
  restricaoArt23ICiclo: false,
  restricaoArt23IICiclo: false,
  bloqueioMatriculaHabilitado: false,
  bloqueioMatriculaClasses: ["9ª Classe","10ª Classe","11ª Classe","12ª Classe"],
  bloqueioFinanceiroHabilitado: true,
  diasAtrasoBloqueio: 10,
  maxDeficienciasAprovacao: 0,
  temDecimaTermeira: true,
  notasVisiveis: false,
  loginAprovacaoAtiva: false,
  avaliacaoPeriodoAtivo: false,
  percMac: 30,
  percPp: 70,
  percNt: 60,
  percPt: 40,
  percPg: 40,
  percExame: 40,
  avaliacaoFormativaHabilitada: false,
  percFormativa: 20,
  provaRecuperacaoHabilitada: false,
  usarFormulasDecreto: false,
  percMacDecreto: 50,
  percMT3Exame9aDecreto: 60,
  percMT3Exame12aDecreto: 50,
  maxNegativosICiclo: 2,
  maxNegativosIICiclo: 3,
  restricaoLPAreaIICiclo: false,
  reapreciacaoPrazosHoras: 48,
};

interface ConfigContextValue {
  config: ConfigGeral;
  updateConfig: (updates: Partial<ConfigGeral>, options?: { silent?: boolean }) => void;
  updateFlashScreen: (updates: Partial<FlashScreenConfig>, options?: { silent?: boolean }) => void;
  isLoading: boolean;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfigGeral>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  // Debounce refs: pending config to save + debounce timer
  const pendingConfig = useRef<ConfigGeral | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard: don't save until the initial config has been loaded from the API.
  // This prevents Switch/Toggle re-renders during loading from triggering spurious saves.
  const configLoaded = useRef(false);
  // When true, flushSave skips the success toast (caller already shows its own feedback).
  const skipToastRef = useRef(false);

  // Flush: actually send to the API and show toast (called after debounce)
  const flushSave = useRef(async () => {
    const next = pendingConfig.current;
    if (!next) return;
    pendingConfig.current = null;
    const silent = skipToastRef.current;
    skipToastRef.current = false;
    try {
      const res = await api.put('/api/config', next);
      if (!silent) {
        if (saveToastTimer.current) clearTimeout(saveToastTimer.current);
        const msg = isOfflineQueued(res)
          ? 'Configuração guardada localmente — sincroniza quando voltar a internet'
          : 'Configuração guardada com sucesso';
        saveToastTimer.current = setTimeout(() => showToast(msg, 'success'), 300);
      }
    } catch (e: any) {
      console.error('[ConfigContext] updateConfig error:', e?.message ?? e);
      showToast('Erro ao guardar configuração — verifique a ligação', 'error');
    }
  });

  useEffect(() => {
    api.get<Record<string, unknown>>('/api/config')
      .then(raw => {
        const parsed: ConfigGeral = {
          nomeEscola: (raw.nomeEscola as string) || DEFAULT_CONFIG.nomeEscola,
          codigoMED: (raw.codigoMED as string) || undefined,
          morada: (raw.morada as string) || undefined,
          municipio: (raw.municipio as string) || undefined,
          provincia: (raw.provincia as string) || undefined,
          telefoneEscola: (raw.telefoneEscola as string) || undefined,
          emailEscola: (raw.emailEscola as string) || undefined,
          subdirectorPedagogico: (raw.subdirectorPedagogico as string) || undefined,
          logoUrl: raw.logoUrl as string | undefined,
          propinaHabilitada: raw.propinaHabilitada !== undefined ? Boolean(raw.propinaHabilitada) : DEFAULT_CONFIG.propinaHabilitada,
          pp1Habilitado: raw.pp1Habilitado !== undefined ? Boolean(raw.pp1Habilitado) : DEFAULT_CONFIG.pp1Habilitado,
          pptHabilitado: raw.pptHabilitado !== undefined ? Boolean(raw.pptHabilitado) : DEFAULT_CONFIG.pptHabilitado,
          notaMinimaAprovacao: (raw.notaMinimaAprovacao as number) ?? DEFAULT_CONFIG.notaMinimaAprovacao,
          maxAlunosTurma: (raw.maxAlunosTurma as number) ?? DEFAULT_CONFIG.maxAlunosTurma,
          minTurmasProfessor: (raw.minTurmasProfessor as number) ?? DEFAULT_CONFIG.minTurmasProfessor,
          maxTurmasProfessor: (raw.maxTurmasProfessor as number) ?? DEFAULT_CONFIG.maxTurmasProfessor,
          maxDisciplinasPorProfessor: (raw.maxDisciplinasPorProfessor as number) ?? DEFAULT_CONFIG.maxDisciplinasPorProfessor,
          mesInicioAnoLetivo: Number(raw.mesInicioAnoLetivo) > 0 ? Number(raw.mesInicioAnoLetivo) : DEFAULT_CONFIG.mesInicioAnoLetivo,
          numAvaliacoes: (raw.numAvaliacoes as number) ?? DEFAULT_CONFIG.numAvaliacoes,
          macMin: (raw.macMin as number) ?? DEFAULT_CONFIG.macMin,
          macMax: (raw.macMax as number) ?? DEFAULT_CONFIG.macMax,
          tipoEscala: (raw.tipoEscala === 'linear' ? 'linear' : 'proporcional'),
          horarioFuncionamento: (raw.horarioFuncionamento as string) || DEFAULT_CONFIG.horarioFuncionamento,
          flashScreen: { ...DEFAULT_FLASH, ...((raw.flashScreen as Partial<FlashScreenConfig>) || {}) },
          directorGeral: (raw.directorGeral as string) || undefined,
          directorPedagogico: (raw.directorPedagogico as string) || undefined,
          directorProvincialEducacao: (raw.directorProvincialEducacao as string) || undefined,
          numeroEntidade: (raw.numeroEntidade as string) || undefined,
          iban: (raw.iban as string) || undefined,
          nomeBeneficiario: (raw.nomeBeneficiario as string) || undefined,
          bancoTransferencia: (raw.bancoTransferencia as string) || undefined,
          telefoneMulticaixaExpress: (raw.telefoneMulticaixaExpress as string) || undefined,
          nib: (raw.nib as string) || undefined,
          prazosLancamento: (raw.prazosLancamento as { t1?: string; t2?: string; t3?: string }) || undefined,
          inssEmpPerc: (raw.inssEmpPerc as number) ?? DEFAULT_CONFIG.inssEmpPerc,
          inssPatrPerc: (raw.inssPatrPerc as number) ?? DEFAULT_CONFIG.inssPatrPerc,
          irtTabela: Array.isArray(raw.irtTabela) && (raw.irtTabela as any[]).length > 0
            ? (raw.irtTabela as IrtEscalao[])
            : DEFAULT_IRT,
          mesesAnoAcademico: Array.isArray(raw.mesesAnoAcademico) && (raw.mesesAnoAcademico as any[]).length > 0
            ? (raw.mesesAnoAcademico as number[])
            : DEFAULT_CONFIG.mesesAnoAcademico,
          exameAntecipadoHabilitado: raw.exameAntecipadoHabilitado !== undefined ? Boolean(raw.exameAntecipadoHabilitado) : DEFAULT_CONFIG.exameAntecipadoHabilitado,
          papHabilitado: raw.papHabilitado !== undefined ? Boolean(raw.papHabilitado) : DEFAULT_CONFIG.papHabilitado,
          papClasses: Array.isArray(raw.papClasses) && raw.papClasses.length > 0
            ? (raw.papClasses as string[])
            : DEFAULT_CONFIG.papClasses,
          estagioComoDisciplina: raw.estagioComoDisciplina !== undefined ? Boolean(raw.estagioComoDisciplina) : DEFAULT_CONFIG.estagioComoDisciplina,
          papDisciplinasContribuintes: Array.isArray(raw.papDisciplinasContribuintes)
            ? (raw.papDisciplinasContribuintes as string[])
            : DEFAULT_CONFIG.papDisciplinasContribuintes,
          inscricoesAbertas: raw.inscricoesAbertas !== undefined ? Boolean(raw.inscricoesAbertas) : DEFAULT_CONFIG.inscricoesAbertas,
          inscricaoDataInicio: (raw.inscricaoDataInicio as string) || undefined,
          inscricaoDataFim: (raw.inscricaoDataFim as string) || undefined,
          exclusaoDuasReprovacoes: raw.exclusaoDuasReprovacoes !== undefined ? Boolean(raw.exclusaoDuasReprovacoes) : DEFAULT_CONFIG.exclusaoDuasReprovacoes,
          restricaoArt23ICiclo: raw.restricaoArt23ICiclo !== undefined ? Boolean(raw.restricaoArt23ICiclo) : DEFAULT_CONFIG.restricaoArt23ICiclo,
          restricaoArt23IICiclo: raw.restricaoArt23IICiclo !== undefined ? Boolean(raw.restricaoArt23IICiclo) : DEFAULT_CONFIG.restricaoArt23IICiclo,
          disciplinasNuclearArt23: Array.isArray(raw.disciplinasNuclearArt23) ? (raw.disciplinasNuclearArt23 as string[]) : [],
          bloqueioMatriculaHabilitado: raw.bloqueioMatriculaHabilitado !== undefined ? Boolean(raw.bloqueioMatriculaHabilitado) : DEFAULT_CONFIG.bloqueioMatriculaHabilitado,
          bloqueioMatriculaClasses: Array.isArray(raw.bloqueioMatriculaClasses) ? (raw.bloqueioMatriculaClasses as string[]) : DEFAULT_CONFIG.bloqueioMatriculaClasses,
          bloqueioFinanceiroHabilitado: raw.bloqueioFinanceiroHabilitado !== undefined ? Boolean(raw.bloqueioFinanceiroHabilitado) : DEFAULT_CONFIG.bloqueioFinanceiroHabilitado,
          diasAtrasoBloqueio: raw.diasAtrasoBloqueio !== undefined ? Number(raw.diasAtrasoBloqueio) : DEFAULT_CONFIG.diasAtrasoBloqueio,
          maxDeficienciasAprovacao: (raw.maxDeficienciasAprovacao as number) ?? DEFAULT_CONFIG.maxDeficienciasAprovacao,
          temDecimaTermeira: raw.temDecimaTermeira !== undefined ? Boolean(raw.temDecimaTermeira) : DEFAULT_CONFIG.temDecimaTermeira,
          notasVisiveis: raw.notasVisiveis !== undefined ? Boolean(raw.notasVisiveis) : DEFAULT_CONFIG.notasVisiveis,
          loginAprovacaoAtiva: raw.loginAprovacaoAtiva !== undefined ? Boolean(raw.loginAprovacaoAtiva) : DEFAULT_CONFIG.loginAprovacaoAtiva,
          periodosHorario: Array.isArray(raw.periodosHorario) ? (raw.periodosHorario as { numero: number; inicio: string; fim: string }[]) : undefined,
          ultimoBackup: (raw.ultimoBackup as string) || undefined,
          avaliacaoPeriodoAtivo: raw.avaliacaoPeriodoAtivo !== undefined ? Boolean(raw.avaliacaoPeriodoAtivo) : false,
          avaliacaoPeriodoInicio: (raw.avaliacaoPeriodoInicio as string) || undefined,
          avaliacaoPeriodoFim: (raw.avaliacaoPeriodoFim as string) || undefined,
          avaliacaoPeriodoLabel: (raw.avaliacaoPeriodoLabel as string) || undefined,
          emisHabilitado: raw.emisHabilitado !== undefined ? Boolean(raw.emisHabilitado) : false,
          emisAmbiente: ((raw.emisAmbiente as string) === 'producao' ? 'producao' : 'sandbox') as 'sandbox' | 'producao',
          emisProvedor: (raw.emisProvedor as string) || undefined,
          emisProvedorCustomCode: (raw.emisProvedorCustomCode as string) || undefined,
          emisEntidadeId: (raw.emisEntidadeId as string) || undefined,
          emisApiKey: (raw.emisApiKey as string) || undefined,
          emisApiUrl: (raw.emisApiUrl as string) || undefined,
          emisPrazoPagamento: (raw.emisPrazoPagamento as number) ?? 24,
          emisNotificarSMS: raw.emisNotificarSMS !== undefined ? Boolean(raw.emisNotificarSMS) : true,
          percMac: (raw.percMac as number) ?? DEFAULT_CONFIG.percMac,
          percPp: (raw.percPp as number) ?? DEFAULT_CONFIG.percPp,
          percNt: (raw.percNt as number) ?? DEFAULT_CONFIG.percNt,
          percPt: (raw.percPt as number) ?? DEFAULT_CONFIG.percPt,
          percPg: (raw.percPg as number) ?? DEFAULT_CONFIG.percPg,
          percExame: (raw.percExame as number) ?? DEFAULT_CONFIG.percExame,
          avaliacaoFormativaHabilitada: raw.avaliacaoFormativaHabilitada !== undefined ? Boolean(raw.avaliacaoFormativaHabilitada) : DEFAULT_CONFIG.avaliacaoFormativaHabilitada,
          percFormativa: (raw.percFormativa as number) ?? DEFAULT_CONFIG.percFormativa,
          modeloAvaliacao: (raw.modeloAvaliacao as string) || undefined,
          temNPP: raw.temNPP === false || raw.temNPP === 'false' ? false : true,
          temNPT: raw.temNPT === false || raw.temNPT === 'false' ? false : true,
          complexoEscolar: raw.complexoEscolar === true || raw.complexoEscolar === 'true',
          modelosAvaliacaoPorNivel: (raw.modelosAvaliacaoPorNivel as any) ?? null,
          provaRecuperacaoHabilitada: raw.provaRecuperacaoHabilitada !== undefined ? Boolean(raw.provaRecuperacaoHabilitada) : DEFAULT_CONFIG.provaRecuperacaoHabilitada,
          groqApiKey: (raw.groqApiKey as string) || undefined,
          openaiApiKey: (raw.openaiApiKey as string) || undefined,
          usarFormulasDecreto: raw.usarFormulasDecreto !== undefined ? Boolean(raw.usarFormulasDecreto) : DEFAULT_CONFIG.usarFormulasDecreto,
          percMacDecreto: (raw.percMacDecreto as number) ?? DEFAULT_CONFIG.percMacDecreto,
          percMT3Exame9aDecreto: (raw.percMT3Exame9aDecreto as number) ?? DEFAULT_CONFIG.percMT3Exame9aDecreto,
          percMT3Exame12aDecreto: (raw.percMT3Exame12aDecreto as number) ?? DEFAULT_CONFIG.percMT3Exame12aDecreto,
          maxNegativosICiclo: (raw.maxNegativosICiclo as number) ?? DEFAULT_CONFIG.maxNegativosICiclo,
          maxNegativosIICiclo: (raw.maxNegativosIICiclo as number) ?? DEFAULT_CONFIG.maxNegativosIICiclo,
          restricaoLPAreaIICiclo: raw.restricaoLPAreaIICiclo !== undefined ? Boolean(raw.restricaoLPAreaIICiclo) : DEFAULT_CONFIG.restricaoLPAreaIICiclo,
          reapreciacaoPrazosHoras: (raw.reapreciacaoPrazosHoras as number) ?? DEFAULT_CONFIG.reapreciacaoPrazosHoras,
        };
        setConfig(parsed);
      })
      .catch(() => setConfig(DEFAULT_CONFIG))
      .finally(() => {
        setIsLoading(false);
        configLoaded.current = true;
      });
  }, []);

  // Schedule a debounced save: optimistic update is instant, API call waits 1.5s of quiet
  function scheduleSave(next: ConfigGeral, skipToast = false) {
    // Never save before the initial config is loaded — prevents spurious saves
    // triggered by Switch/Toggle components re-rendering when config arrives from API.
    if (!configLoaded.current) return;
    pendingConfig.current = next;
    skipToastRef.current = skipToast;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void flushSave.current();
    }, 1500);
  }

  const updateConfig = useCallback((updates: Partial<ConfigGeral>, options?: { silent?: boolean }) => {
    setConfig(prev => {
      const next = { ...prev, ...updates };
      scheduleSave(next, options?.silent ?? false);
      return next;
    });
  }, []);

  const updateFlashScreen = useCallback((updates: Partial<FlashScreenConfig>, options?: { silent?: boolean }) => {
    setConfig(prev => {
      const next = { ...prev, flashScreen: { ...prev.flashScreen, ...updates } };
      scheduleSave(next, options?.silent ?? false);
      return next;
    });
  }, []);

  const value = useMemo<ConfigContextValue>(
    () => ({ config, updateConfig, updateFlashScreen, isLoading }),
    [config, isLoading, updateConfig, updateFlashScreen]
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used within ConfigProvider');
  return ctx;
}

export function calcIRT(base: number, tabela: IrtEscalao[]): number {
  if (!tabela || tabela.length === 0) return 0;
  for (const escalao of tabela) {
    if (escalao.max === null || base <= escalao.max) {
      if (escalao.taxa === 0) return 0;
      return escalao.baseFixa + (base - escalao.limiteAnterior) * escalao.taxa;
    }
  }
  return 0;
}
