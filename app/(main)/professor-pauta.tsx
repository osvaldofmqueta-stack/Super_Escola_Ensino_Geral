import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {BackHandler, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import * as XLSX from 'xlsx';
import { useConfig } from '@/context/ConfigContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/colors';
import { api } from '@/lib/api';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import ProfessorLoadingSkeleton from '@/components/ProfessorLoadingSkeleton';
import { useProfessor } from '@/context/ProfessorContext';
import { useNotificacoes } from '@/context/NotificacoesContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { webAlert } from '@/utils/webAlert';
import { useEnterToSave } from '@/hooks/useEnterToSave';

type Trimestre = 1 | 2 | 3;

interface NotaForm {
  alunoId: string;
  aval1: string;
  aval2: string;
  aval3: string;
  aval4: string;
  aval5: string;
  aval6: string;
  aval7: string;
  aval8: string;
  pp1: string;
  ppt: string;
  // 3º Trimestre — Classes de Transição (10ª/11ª)
  pg1: string;
  pg2: string;
  // 3º Trimestre — 12ª Classe
  ex1: string;
  ex2: string;
  // Prova de Recuperação (opcional)
  provaRecuperacao: string;
  // Avaliação Formativa — Opção B: nota calculada dos registos formativos (1–5)
  notaFormativa: number;
  // Anexo IV/V — Comportamento e Apreciação Descritiva Global
  comportamento: string;
  apreciacaoDescritiva: string;
}

// Determina se a classe é de 12ª (usa Exame no 3º Trimestre)
function is12aClasse(classe?: string): boolean {
  if (!classe) return false;
  return classe.includes('12');
}

// Determina se a classe é de 9ª (classes de Exame Nacional I Ciclo)
function is9aClasse(classe?: string): boolean {
  if (!classe) return false;
  const n = parseInt(classe.replace(/\D/g, ''), 10);
  return n === 9;
}

// Determina se a classe é de transição (10ª ou 11ª — usa Prova Global no 3º Trimestre)
function isClasseTransicao(classe?: string): boolean {
  if (!classe) return false;
  return classe.includes('10') || classe.includes('11');
}

// Determina se a classe é de 6ª (classe de Exame Nacional do Ensino Primário)
function is6aClasse(classe?: string): boolean {
  if (!classe) return false;
  const n = parseInt(classe.replace(/\D/g, ''), 10);
  return n === 6;
}

interface PapForm {
  alunoId: string;
  notaEstagio: string;
  notaDefesa: string;
  notasDisciplinas: Record<string, string>;
  notaPAP: number | null;
}

interface SolicAvaliacao {
  id: string;
  professorId: string;
  professorNome: string;
  turmaId: string;
  turmaNome: string;
  disciplina: string;
  trimestre: number;
  tipoAvaliacao: string;
  motivo: string;
  status: 'pendente' | 'aprovado' | 'rejeitado';
  respondidoPor?: string;
  respondidoEm?: string;
  observacao?: string;
  createdAt: string;
}

// Tipos de avaliação que o professor pode solicitar abertura
const TIPOS_AVALIACAO_SOLIC = [
  { key: 'aval1', label: 'Avaliação 1 (A1)' },
  { key: 'aval2', label: 'Avaliação 2 (A2)' },
  { key: 'aval3', label: 'Avaliação 3 (A3)' },
  { key: 'aval4', label: 'Avaliação 4 (A4)' },
  { key: 'aval5', label: 'Avaliação 5 (A5)' },
  { key: 'aval6', label: 'Avaliação 6 (A6)' },
  { key: 'aval7', label: 'Avaliação 7 (A7)' },
  { key: 'aval8', label: 'Avaliação 8 (A8)' },
  { key: 'pp1', label: 'Prova do Professor (PP)' },
];

type AvalKey = 'aval1' | 'aval2' | 'aval3' | 'aval4' | 'aval5' | 'aval6' | 'aval7' | 'aval8';
const ALL_AVAL_KEYS: AvalKey[] = ['aval1', 'aval2', 'aval3', 'aval4', 'aval5', 'aval6', 'aval7', 'aval8'];

// Helpers centralizados de escala de notas (lib/escalaNotas.ts)
import { calcMacCanonica, parseAval as parseAvalShared, type EscalaConfig } from '../../lib/escalaNotas';
import { calcMT_decreto } from '../../lib/formulasDecreto';
// Percentagens por nível de ensino (suporte a Complexo Escolar)
import { getPercForNivel } from '../../lib/percPorNivel';
// Fórmulas do Decreto Executivo nº 04/2026 (RAA — Ensino Geral Angola)
import { calcMFD_auto } from '../../lib/formulasDecreto';

// Cálculo da média na escala bruta com suporte à Avaliação Formativa (Opção B).
// MAC_final = MAC_sumativo×(1−percFormativa/100) + notaFormativa×(percFormativa/100)
function calcMac(avais: number[], notaFormativa = 0, percFormativa = 0): number {
  const vals = avais.filter(v => v > 0);
  const macSumativo = vals.length === 0 ? 0 : Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  if (notaFormativa <= 0 || percFormativa <= 0) return macSumativo;
  const pF = percFormativa / 100;
  return Math.round((macSumativo * (1 - pF) + notaFormativa * pF) * 10) / 10;
}

// Nota Trimestral (MT) = (MAC + NPT) / 2 — Decreto Executivo nº 04/2026 Anexo III §1
// Fórmula fixa 50/50 por imposição do Decreto. Os parâmetros percMac/percPp são
// mantidos apenas para compatibilidade de assinatura mas não afectam o cálculo.
function calcNT(avaisBrutas: number[], pp: number, _percMac: number, _percPp: number, escala: EscalaConfig): number {
  const macCanonico = calcMacCanonica(avaisBrutas, escala);
  return Math.round(((macCanonico + pp) / 2) * 10) / 10;
}

// Nota Final para T1 e T2: NT * percNt% + PT * percPt%
function calcNF_T1T2(nt: number, pt: number, percNt: number, percPt: number): number {
  return Math.round((nt * (percNt / 100) + pt * (percPt / 100)) * 10) / 10;
}

// Nota Final para T3 — Classes de Transição (10ª/11ª): NT * (100-2*percPg)% + PG1 * percPg% + PG2 * percPg%
function calcNF_T3Transicao(nt: number, pg1: number, pg2: number, percPg: number): number {
  const pPg = percPg / 100;
  const pNt = Math.max(0, 1 - 2 * pPg);
  return Math.round((nt * pNt + pg1 * pPg + pg2 * pPg) * 10) / 10;
}

// Nota Final para T3 — 12ª Classe: NT * (100-2*percExame)% + EX1 * percExame% + EX2 * percExame%
function calcNF_T3Exame(nt: number, ex1: number, ex2: number, percExame: number): number {
  const pEx = percExame / 100;
  const pNt = Math.max(0, 1 - 2 * pEx);
  return Math.round((nt * pNt + ex1 * pEx + ex2 * pEx) * 10) / 10;
}


function parseNum(s: string): number {
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? 0 : Math.min(20, Math.max(0, n));
}

// Parse para campos AVAL (Avaliação Contínua) — usa o helper central de escala.
function parseAval(s: string, macMin: number, macMax: number): number {
  return parseAvalShared(s, { macMin, macMax });
}

export default function ProfessorPautaScreen() {
  const { user } = useAuth();
  const { professores, turmas, alunos, notas, addNota, updateNota, isLoading: dataLoading } = useData();
  const { pautas, solicitacoes, addPauta, updatePauta, getPautaByKey, addSolicitacao } = useProfessor();
  const { addNotificacao } = useNotificacoes();
  const { anoSelecionado } = useAnoAcademico();
  const { config } = useConfig();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const params = useLocalSearchParams<{ turmaId?: string; disciplina?: string; trimestre?: string; modo?: string }>();
  const modoSupervisao = params.modo === 'supervisao';

  const [turmaId, setTurmaId] = useState(params.turmaId ? decodeURIComponent(params.turmaId) : '');
  const [disciplina, setDisciplina] = useState(params.disciplina ? decodeURIComponent(params.disciplina) : '');
  const [trimestre, setTrimestre] = useState<Trimestre>(params.trimestre ? (parseInt(params.trimestre) as Trimestre) : 1);
  const [step, setStep] = useState<'selecao' | 'pauta' | 'pap'>(
    params.turmaId && params.disciplina ? 'pauta' : 'selecao'
  );
  const [notasForms, setNotasForms] = useState<NotaForm[]>([]);
  const [saving, setSaving] = useState(false);
  const [showSolicitModal, setShowSolicitModal] = useState(false);
  const [motivoSolicidade, setMotivoSolicidade] = useState('');
  const [editingAlunoId, setEditingAlunoId] = useState<string | null>(null);
  const [lancadoSet, setLancadoSet] = useState<Set<string>>(new Set());

  const [showTurmaList, setShowTurmaList] = useState(false);
  const [showDiscList, setShowDiscList] = useState(false);

  // Número sequencial da pauta — estado; useEffect adicionado após declaração de pautaAtual
  const [pautaNumeroFetched, setPautaNumeroFetched] = useState<number | null>(null);

  // PAP state
  const [papForms, setPapForms] = useState<PapForm[]>([]);
  const [papSaving, setPapSaving] = useState(false);

  // Tracks which fields are already saved/locked per student (alunoId → Set of field names)
  const [savedFields, setSavedFields] = useState<Record<string, Set<string>>>({});

  // Grade launch control — solicitacoes de avaliacao
  const [solicitacoesAvaliacao, setSolicitacoesAvaliacao] = useState<SolicAvaliacao[]>([]);
  const [showSolicAvalModal, setShowSolicAvalModal] = useState(false);
  const [solicAvalTipo, setSolicAvalTipo] = useState('');
  const [solicAvalMotivo, setSolicAvalMotivo] = useState('');
  const [sendingSolicAval, setSendingSolicAval] = useState(false);
  const [prazoMiniPauta, setPrazoMiniPauta] = useState<{ id: string; dataLimite: string; descricao?: string; ativo: boolean } | null>(null);
  // Todos os prazos do ano lectivo — para detectar períodos bloqueados no ecrã de selecção
  const [todosOsPrazos, setTodosOsPrazos] = useState<any[]>([]);
  const [templatesMiniPauta, setTemplatesMiniPauta] = useState<{ conteudo: string; templateNome: string; status: string; templateId: string; disciplinaNome: string }[] | null | 'loading'>('loading');
  // Avaliação Diagnóstica por alunoId → nivel qualitativo (não entra no MAC)
  const [diagnosticasMap, setDiagnosticasMap] = useState<Record<string, string>>({});
  const [showSolicitarTemplateModal, setShowSolicitarTemplateModal] = useState(false);

  // Modo supervisão: comentário ao professor
  const [showSupComment, setShowSupComment] = useState(false);
  const [supCommentText, setSupCommentText] = useState('');
  const [sendingSupComment, setSendingSupComment] = useState(false);

  const prof = useMemo(() => professores.find(p => (user?.id && p.utilizadorId === user.id) || p.email === user?.email), [professores, user]);

  const isPrivilegedRole = !!user?.role && ['ceo', 'pca', 'admin', 'director', 'chefe_secretaria', 'pedagogico'].includes(user.role);
  // Em modo supervisão, mantemos o acesso de leitura mas bloqueamos qualquer edição/acção
  const isReadOnly = modoSupervisao;

  // Prazos expirados com bloqueio activo — usados para informar o professor no ecrã de selecção
  const prazosExpiradosBloqueados = useMemo(() => {
    if (isPrivilegedRole) return []; // admins vêem sempre tudo
    const agora = Date.now();
    return todosOsPrazos.filter((p: any) => {
      if (!p.bloqueioAposPrazo || !p.ativo) return false;
      const dl = new Date(String(p.dataLimite) + 'T23:59:59Z').getTime();
      const grace = Number(p.gracePeriodHoras || 0) * 3600000;
      return agora > dl + grace;
    });
  }, [todosOsPrazos, isPrivilegedRole]);

  // ── Fetch avaliações diagnósticas (informativo, não conta no MAC) ─────────
  useEffect(() => {
    if (!turmaId || !disciplina || !anoSelecionado?.ano) return;
    fetch(`/api/diagnostica?turmaId=${turmaId}&disciplinaNome=${encodeURIComponent(disciplina)}&trimestre=${trimestre}&anoLetivo=${encodeURIComponent(anoSelecionado.ano)}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        const m: Record<string, string> = {};
        rows.forEach(r => { if (r.alunoId && r.nivel) m[r.alunoId] = r.nivel; });
        setDiagnosticasMap(m);
      })
      .catch(() => {});
  }, [turmaId, disciplina, trimestre, anoSelecionado?.ano]);

  // ── Fetch prazo de submissão de mini-pauta ────────────────────────────────
  useEffect(() => {
    const anoLetivo = anoSelecionado?.ano;
    if (!anoLetivo || !trimestre) return;
    fetch(`/api/prazos-mini-pauta?anoLetivo=${encodeURIComponent(anoLetivo)}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        setTodosOsPrazos(rows);
        const p = rows.find((r: any) => r.trimestre === trimestre && r.ativo);
        setPrazoMiniPauta(p ?? null);
      })
      .catch(() => {});
  }, [trimestre, anoSelecionado]);

  // ── Fetch inicial de prazos (sem depender do trimestre seleccionado) ──────
  useEffect(() => {
    const anoLetivo = anoSelecionado?.ano;
    if (!anoLetivo) return;
    fetch(`/api/prazos-mini-pauta?anoLetivo=${encodeURIComponent(anoLetivo)}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => setTodosOsPrazos(rows))
      .catch(() => {});
  }, [anoSelecionado]);

  // ── Fetch template de mini-pauta atribuído ao professor ──────────────────
  useEffect(() => {
    if (!prof || isPrivilegedRole) {
      setTemplatesMiniPauta(null);
      return;
    }
    setTemplatesMiniPauta('loading');
    fetch('/api/mini-pauta-atribuicoes/minha')
      .then(r => r.ok ? r.json() : null)
      .then(data => setTemplatesMiniPauta(Array.isArray(data) ? data : (data ? [data] : null)))
      .catch(() => setTemplatesMiniPauta(null));
  }, [prof?.id, isPrivilegedRole]);

  // ── Grade Launch Control helpers ──────────────────────────────────────────
  const loadSolicAvaliacao = useCallback(async () => {
    if (!turmaId || !disciplina) return;
    try {
      const p = new URLSearchParams({ turmaId, disciplina, trimestre: String(trimestre) });
      const r = await fetch(`/api/solicitacoes-avaliacao?${p.toString()}`);
      if (r.ok) setSolicitacoesAvaliacao(await r.json());
    } catch {}
  }, [turmaId, disciplina, trimestre]);

  useEffect(() => {
    if (step === 'pauta') loadSolicAvaliacao();
  }, [step, loadSolicAvaliacao]);

  // Fields approved by privileged roles for this professor/turma/disciplina/trimestre
  const camposAprovados = useMemo(() => {
    if (isPrivilegedRole) return new Set<string>(['*']);
    return new Set(solicitacoesAvaliacao.filter(s => s.status === 'aprovado').map(s => s.tipoAvaliacao));
  }, [solicitacoesAvaliacao, isPrivilegedRole]);

  // Provas (pp1, ppt, pg1, pg2, ex1, ex2, provaRecuperacao) follow global calendar
  const PROVA_FIELDS = new Set(['pp1', 'ppt', 'pg1', 'pg2', 'ex1', 'ex2', 'provaRecuperacao']);

  function isAvalFieldOpen(field: string): boolean {
    if (isPrivilegedRole) return true;
    if (camposAprovados.has('*')) return true;
    if (PROVA_FIELDS.has(field)) return config.avaliacaoPeriodoAtivo === true;
    return camposAprovados.has(field);
  }

  async function submitSolicAvaliacao() {
    if (!prof || !turmaAtual || !solicAvalTipo) return;
    setSendingSolicAval(true);
    try {
      const r = await fetch('/api/solicitacoes-avaliacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professorId: prof.id,
          professorNome: `${prof.nome} ${prof.apelido}`.trim(),
          turmaId,
          turmaNome: turmaAtual.nome,
          disciplina,
          trimestre,
          tipoAvaliacao: solicAvalTipo,
          motivo: solicAvalMotivo,
        }),
      });
      if (r.ok) {
        await loadSolicAvaliacao();
        setShowSolicAvalModal(false);
        setSolicAvalTipo('');
        setSolicAvalMotivo('');
        webAlert('Solicitação Enviada', 'O pedido de abertura foi enviado. Aguarde aprovação do responsável.');
      }
    } catch {
      webAlert('Erro', 'Não foi possível enviar a solicitação.');
    } finally {
      setSendingSolicAval(false);
    }
  }

  const minhasTurmas = useMemo(() => {
    if (isPrivilegedRole) return turmas.filter(t => t.ativo);
    return prof ? turmas.filter(t => (prof.turmasIds.includes(t.id) || (t.professoresIds ?? []).includes(prof.id)) && t.ativo) : [];
  }, [prof, turmas, isPrivilegedRole]);

  const turmaAtual = turmas.find(t => t.id === turmaId);

  const [disciplinas, setDisciplinas] = useState<string[]>([]);
  useEffect(() => {
    if (!turmaId) {
      setDisciplinas(prof?.disciplinas || []);
      return;
    }
    fetch(`/api/turmas/${turmaId}/disciplinas`)
      .then(r => r.json())
      .then((list: { nome: string }[]) => {
        if (list && list.length > 0) {
          setDisciplinas(list.map(d => d.nome));
        } else {
          setDisciplinas(prof?.disciplinas || []);
        }
      })
      .catch(() => { setDisciplinas(prof?.disciplinas || []); });
  }, [turmaId, prof]);

  // Flag nuclear da disciplina seleccionada — determina se usa Exame Nacional (NEN) no T3
  const [disciplinaNuclear, setDisciplinaNuclear] = useState(false);
  useEffect(() => {
    if (!disciplina) { setDisciplinaNuclear(false); return; }
    fetch('/api/disciplinas')
      .then(r => r.ok ? r.json() : [])
      .then((list: any[]) => {
        const d = list.find((d: any) => d.nome === disciplina);
        setDisciplinaNuclear(d?.nuclear ?? false);
      })
      .catch(() => setDisciplinaNuclear(false));
  }, [disciplina]);

  const alunosDaTurma = useMemo(() =>
    turmaId ? alunos.filter(a => a.turmaId === turmaId && a.ativo) : [],
    [turmaId, alunos]
  );

  const pautaAtual = useMemo(() =>
    turmaId && disciplina ? getPautaByKey(turmaId, disciplina, trimestre) : undefined,
    [pautas, turmaId, disciplina, trimestre]
  );

  // Fetch directo do numero da pauta — garante valor actual mesmo com contexto desactualizado
  useEffect(() => {
    if (!pautaAtual?.id) { setPautaNumeroFetched(null); return; }
    if (pautaAtual.numero) { setPautaNumeroFetched(pautaAtual.numero); return; }
    api.get<any[]>('/api/pautas')
      .then(rows => {
        const found = Array.isArray(rows) ? rows.find((p: any) => p.id === pautaAtual?.id) : null;
        setPautaNumeroFetched(found?.numero ?? null);
      })
      .catch(() => {});
  }, [pautaAtual?.id, pautaAtual?.numero]);

  const isPautaFechada = pautaAtual?.status === 'fechada';
  const isPendente = pautaAtual?.status === 'pendente_abertura';

  const classeAtual = turmaAtual?.classe;
  // Decreto Executivo nº 04/2026 activo via toggle em Configurações › Sistema de Avaliação
  const usarDecretoFormulas = !!(config as any).usarFormulasDecreto;
  const percMacDecreto: number = (config as any).percMacDecreto ?? 50;
  const percMT3Exame9aDecreto: number = (config as any).percMT3Exame9aDecreto ?? 60;
  const percMT3Exame12aDecreto: number = (config as any).percMT3Exame12aDecreto ?? 50;
  const decretoWeights = { percMT3Exame9a: percMT3Exame9aDecreto, percMT3Exame12a: percMT3Exame12aDecreto };
  const useProvGlobal = trimestre === 3 && isClasseTransicao(classeAtual);
  const useExame = trimestre === 3 && is12aClasse(classeAtual);
  // 9ª e 6ª (decreto activo) classes com disciplina nuclear: NEN substitui NPT no 3º trimestre
  const useExame9a = trimestre === 3 && disciplinaNuclear &&
    (is9aClasse(classeAtual) || (usarDecretoFormulas && is6aClasse(classeAtual)));
  // Percentagens do nível da turma (para decidir visibilidade de colunas PP e PT na legenda)
  const percNivelPauta = getPercForNivel(turmaAtual?.nivel, config);
  // PAP derived values — classes alvo configuráveis (12ª e/ou 13ª Classe)
  const getClassNum = (c?: string) => c ? c.replace(/[^\d]/g, '') : '';
  const papClassesConfig: string[] = (config.papClasses && config.papClasses.length > 0) ? config.papClasses : ['13ª Classe'];
  const isPapClasse = classeAtual ? papClassesConfig.some(c => getClassNum(c) === getClassNum(classeAtual)) : false;
  const isPapMode = isPapClasse && config.papHabilitado;
  const papDiscContribuintes: string[] = config.papDisciplinasContribuintes || [];
  const showEstagioField = !config.estagioComoDisciplina;

  function calcPapNota(form: PapForm): number | null {
    const defesa = parseFloat(form.notaDefesa.replace(',', '.'));
    if (isNaN(defesa)) return null;
    let soma = Math.min(20, Math.max(0, defesa));
    let divisor = 1; // start with defesa as 1 component
    // Always include estágio if present
    const e = parseFloat(form.notaEstagio.replace(',', '.'));
    if (!isNaN(e)) { soma += Math.min(20, Math.max(0, e)); divisor++; }
    // Add avg of contributing disciplines if any are filled
    const discVals = papDiscContribuintes.map(nome => {
      const v = parseFloat((form.notasDisciplinas[nome] || '').replace(',', '.'));
      return isNaN(v) ? null : Math.min(20, Math.max(0, v));
    }).filter((v): v is number => v !== null);
    if (discVals.length > 0) { soma += discVals.reduce((a, b) => a + b, 0) / discVals.length; divisor++; }
    return Math.round((soma / divisor) * 10) / 10;
  }

  function updatePapForm(alunoId: string, field: 'notaEstagio' | 'notaDefesa', value: string) {
    setPapForms(prev => prev.map(f => {
      if (f.alunoId !== alunoId) return f;
      const updated = { ...f, [field]: value };
      return { ...updated, notaPAP: calcPapNota(updated) };
    }));
  }

  function updatePapDisc(alunoId: string, discNome: string, value: string) {
    setPapForms(prev => prev.map(f => {
      if (f.alunoId !== alunoId) return f;
      const updated = { ...f, notasDisciplinas: { ...f.notasDisciplinas, [discNome]: value } };
      return { ...updated, notaPAP: calcPapNota(updated) };
    }));
  }

  async function iniciarPAP() {
    if (!turmaId || !prof) return;
    const anoLetivo = anoSelecionado?.ano || '2025';
    let existingPap: Record<string, { notaEstagio?: number; notaDefesa?: number; notasDisciplinas?: { nome: string; nota: number }[] }> = {};
    try {
      const resp = await fetch(`/api/pap-alunos?turmaId=${turmaId}&anoLetivo=${anoLetivo}`);
      if (resp.ok) {
        const data: { alunoId: string; notaEstagio?: number; notaDefesa?: number; notasDisciplinas?: { nome: string; nota: number }[] }[] = await resp.json();
        data.forEach(r => { existingPap[r.alunoId] = r; });
      }
    } catch {}

    const forms: PapForm[] = alunosDaTurma.map(aluno => {
      const ex = existingPap[aluno.id];
      const notasDisciplinas: Record<string, string> = {};
      papDiscContribuintes.forEach(nome => {
        const found = ex?.notasDisciplinas?.find((d: { nome: string; nota: number }) => d.nome === nome);
        notasDisciplinas[nome] = found ? String(found.nota) : '';
      });

      // When estágio is treated as a curriculum discipline, auto-load its NF from regular notas
      let notaEstagioValue = ex?.notaEstagio != null ? String(ex.notaEstagio) : '';
      if (config.estagioComoDisciplina) {
        const estagioNota = notas
          .filter(n =>
            n.alunoId === aluno.id &&
            n.turmaId === turmaId &&
            (n.disciplina.toLowerCase().includes('estágio') || n.disciplina.toLowerCase().includes('estagio'))
          )
          .sort((a, b) => ((b.nf ?? 0) - (a.nf ?? 0)))[0];
        if (estagioNota && (estagioNota.nf ?? 0) > 0) {
          notaEstagioValue = String(estagioNota.nf);
        }
      }

      const form: PapForm = {
        alunoId: aluno.id,
        notaEstagio: notaEstagioValue,
        notaDefesa: ex?.notaDefesa != null ? String(ex.notaDefesa) : '',
        notasDisciplinas,
        notaPAP: null,
      };
      form.notaPAP = calcPapNota(form);
      return form;
    });
    setPapForms(forms);
    setStep('pap');
  }

  async function guardarPAP() {
    if (!prof || !turmaAtual) return;
    setPapSaving(true);
    try {
      const anoLetivo = anoSelecionado?.ano || '2025';
      for (const form of papForms) {
        const disciplinasArr = papDiscContribuintes.map(nome => {
          const v = parseFloat((form.notasDisciplinas[nome] || '').replace(',', '.'));
          return { nome, nota: isNaN(v) ? 0 : Math.min(20, Math.max(0, v)) };
        }).filter(d => d.nota > 0);

        const estagio = parseFloat(form.notaEstagio.replace(',', '.'));
        const defesa = parseFloat(form.notaDefesa.replace(',', '.'));

        await fetch('/api/pap-alunos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alunoId: form.alunoId,
            turmaId,
            anoLetivo,
            professorId: prof.id,
            notaEstagio: isNaN(estagio) ? null : Math.min(20, Math.max(0, estagio)),
            notaDefesa: isNaN(defesa) ? null : Math.min(20, Math.max(0, defesa)),
            notasDisciplinas: disciplinasArr,
          }),
        });
      }
      webAlert('PAP Guardado', 'As notas PAP foram guardadas com sucesso.');
    } catch {
      webAlert('Erro', 'Não foi possível guardar as notas PAP.');
    } finally {
      setPapSaving(false);
    }
  }
  const temSolicPendente = solicitacoes.some(s => s.pautaId === pautaAtual?.id && s.status === 'pendente');

  // Verificar prazo de lançamento configurado pela direcção
  const prazoKey = `t${trimestre}` as 't1' | 't2' | 't3';
  const prazoData = config.prazosLancamento?.[prazoKey];
  const isPrazoExpirado = prazoData ? new Date() > new Date(prazoData + 'T23:59:59') : false;
  const isEditavel = !isPautaFechada && !isPendente && !isPrazoExpirado;

  // Block hardware back if pauta is aberta with unsaved changes
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (step === 'pauta' && pautaAtual?.status === 'aberta') {
          webAlert(
            'Pauta em Edição',
            'A pauta está aberta. Deseja fechar antes de sair?',
            [
              { text: 'Continuar a editar', style: 'cancel' },
              { text: 'Sair sem fechar', style: 'destructive', onPress: () => setStep('selecao') },
            ]
          );
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [step, pautaAtual])
  );

  function iniciarPauta() {
    if (!turmaId || !disciplina || (!prof && !isPrivilegedRole)) return;

    const notasExistentes = notas.filter(n =>
      n.turmaId === turmaId && n.disciplina === disciplina && n.trimestre === trimestre
    );

    // If the pauta was officially reopened (approved solicitation exists), unlock all fields
    const wasReopened = pautaAtual && solicitacoes.some(
      s => s.pautaId === pautaAtual.id && s.status === 'aprovada'
    );

    const newSavedFields: Record<string, Set<string>> = {};

    const forms: NotaForm[] = alunosDaTurma.map(aluno => {
      const nota = notasExistentes.find(n => n.alunoId === aluno.id);

      if (nota && !wasReopened) {
        const locked = new Set<string>();
        ALL_AVAL_KEYS.forEach(k => {
          const v = nota[k as keyof typeof nota] as number | null | undefined;
          if (v !== null && v !== undefined && v > 0) locked.add(k);
        });
        if (nota.pp1 !== null && nota.pp1 !== undefined && nota.pp1 > 0) locked.add('pp1');
        if (nota.ppt !== null && nota.ppt !== undefined && nota.ppt > 0) locked.add('ppt');
        if ((nota as any).pg1 > 0) locked.add('pg1');
        if ((nota as any).pg2 > 0) locked.add('pg2');
        if ((nota as any).ex1 > 0) locked.add('ex1');
        if ((nota as any).ex2 > 0) locked.add('ex2');
        if ((nota as any).provaRecuperacao > 0) locked.add('provaRecuperacao');
        newSavedFields[aluno.id] = locked;
      }

      return {
        alunoId: aluno.id,
        aval1: nota ? String(nota.aval1 ?? '') : '',
        aval2: nota ? String(nota.aval2 ?? '') : '',
        aval3: nota ? String(nota.aval3 ?? '') : '',
        aval4: nota ? String(nota.aval4 ?? '') : '',
        aval5: nota ? String(nota.aval5 ?? '') : '',
        aval6: nota ? String(nota.aval6 ?? '') : '',
        aval7: nota ? String(nota.aval7 ?? '') : '',
        aval8: nota ? String(nota.aval8 ?? '') : '',
        pp1: nota ? String(nota.pp1) : '',
        ppt: nota ? String(nota.ppt) : '',
        pg1: nota ? String((nota as any).pg1 ?? '') : '',
        pg2: nota ? String((nota as any).pg2 ?? '') : '',
        ex1: nota ? String((nota as any).ex1 ?? '') : '',
        ex2: nota ? String((nota as any).ex2 ?? '') : '',
        provaRecuperacao: nota ? String((nota as any).provaRecuperacao ?? '') : '',
        notaFormativa: nota ? ((nota as any).notaFormativa ?? 0) : 0,
        comportamento: nota ? String((nota as any).comportamento ?? '') : '',
        apreciacaoDescritiva: nota ? String((nota as any).apreciacaoDescritiva ?? '') : '',
      };
    });

    setSavedFields(newSavedFields);
    setNotasForms(forms);

    const initialLancado = new Set<string>(
      notasExistentes.filter(n => n.lancado).map(n => n.alunoId)
    );
    setLancadoSet(initialLancado);

    setStep('pauta');
  }

  function updateNotaForm(alunoId: string, field: keyof NotaForm, value: string) {
    setNotasForms(prev => prev.map(f => f.alunoId === alunoId ? { ...f, [field]: value } : f));
  }

  async function guardarNotas() {
    const lancadorId = prof?.id || user?.id || '';
    if (!lancadorId || !turmaAtual) return;
    setSaving(true);
    try {
      const notasExistentes = notas.filter(n =>
        n.turmaId === turmaId && n.disciplina === disciplina && n.trimestre === trimestre
      );

      const numAvais = config.numAvaliacoes ?? 4;
      const activeAvalKeys = ALL_AVAL_KEYS.slice(0, numAvais);
      // Se for Complexo Escolar, usa as percentagens do nível da turma; senão usa as globais
      const percNivel = getPercForNivel(turmaAtual?.nivel, config);
      const pMac = percNivel.percMac;
      const pPp  = percNivel.percPp;
      const pNt  = percNivel.percNt;
      const pPt  = percNivel.percPt;
      const pPg  = percNivel.percPg;
      const pEx  = percNivel.percExame;
      const macMin = percNivel.macMin;
      const macMax = percNivel.macMax;
      const tipoEscala = percNivel.tipoEscala;
      const escalaCfg: EscalaConfig = { macMin, macMax, tipoEscala };
      // Componentes activos: NPP e NPT podem não existir em certos modelos/escolas
      const temNPP = percNivel.temNPP !== false;
      const temNPT = percNivel.temNPT !== false;

      for (const form of notasForms) {
        const alunoSaved = savedFields[form.alunoId] || new Set<string>();
        const notaExistente = notasExistentes.find(n => n.alunoId === form.alunoId);

        const avalValues = activeAvalKeys.map(k => {
          if (alunoSaved.has(k)) {
            return notaExistente ? (notaExistente[k as keyof typeof notaExistente] as number ?? 0) : parseAval(form[k], macMin, macMax);
          }
          return parseAval(form[k], macMin, macMax);
        });
        const pp = alunoSaved.has('pp1')
          ? (notaExistente?.pp1 ?? parseNum(form.pp1))
          : parseNum(form.pp1);

        const getField = (field: string, formVal: string) => {
          if (alunoSaved.has(field)) return (notaExistente as any)?.[field] ?? parseNum(formVal);
          return parseNum(formVal);
        };

        const formativaAtiva = !!(config as any).avaliacaoFormativaHabilitada;
        const pFormativa = formativaAtiva ? ((percNivel as any).percFormativa ?? (config as any).percFormativa ?? 20) : 0;
        const mac = calcMac(avalValues, form.notaFormativa, pFormativa);
        // NT: Decreto → MAC puro 0-20; Modo clássico → MAC×percMac + NPP×percPp
        const nt = usarDecretoFormulas
          ? calcMacCanonica(avalValues, escalaCfg)
          : temNPP
            ? calcNT(avalValues, pp, pMac, pPp, escalaCfg)
            : calcMacCanonica(avalValues, escalaCfg);

        let nf = 0;
        let ppt = 0;
        let pg1Val = 0, pg2Val = 0, ex1Val = 0, ex2Val = 0;

        if (useExame9a) {
          // 3º Trimestre — 9ª/6ª nuclear: Professor lança só MACT₃.
          // EN (ex1) é EXCLUSIVO da Secretaria — não ler/enviar aqui.
          // nf = MACT₃ como placeholder; MFD final calculado pela Secretaria/boletim.
          ppt = 0;
          nf = nt; // MACT₃
        } else if (useProvGlobal) {
          // 3º Trimestre — Classes de Transição: Prova Global substitui NPT
          pg1Val = getField('pg1', form.pg1);
          pg2Val = getField('pg2', form.pg2);
          nf = usarDecretoFormulas
            // Decreto: MT₃ = (MACT₃ + PG_med) / 2  onde PG_med = (PG1+PG2)/2
            ? calcMT_decreto(nt, Math.round(((pg1Val + pg2Val) / 2) * 10) / 10, percMacDecreto)
            : calcNF_T3Transicao(nt, pg1Val, pg2Val, pPg);
          ppt = 0;
        } else if (useExame) {
          // 3º Trimestre — 12ª Classe: Professor lança só MACT₃.
          // EN (ex1/ex2) é EXCLUSIVO da Secretaria — não ler/enviar aqui.
          // nf = MACT₃ como placeholder; MFD final = 0,5×MT+0,5×NEN calculado pelo boletim.
          ppt = 0;
          nf = nt; // MACT₃
        } else if (!temNPT) {
          // Sem NPT: NF = NT directamente
          nf = nt;
          ppt = 0;
        } else {
          // T1 e T2 com NPT
          ppt = getField('ppt', form.ppt);
          nf = usarDecretoFormulas
            ? calcMT_decreto(nt, ppt, percMacDecreto)  // Decreto §2: MT = MAC×%mac + NPT×%npt
            : calcNF_T1T2(nt, ppt, pNt, pPt);
        }

        const provaRec = getField('provaRecuperacao', form.provaRecuperacao);
        // Para classes de exame nuclear T3: mt1 = MACT₃ (MAC do T3 sem NPT/EN)
        const mt1 = (useExame9a || useExame) ? calcMacCanonica(avalValues, escalaCfg) : nt;

        // Flag: T3 de disciplina nuclear de exame — ex1/ex2 são EXCLUSIVOS da Secretaria;
        // nunca sobrescrever com zeros do professor (destruiria o EN já lançado).
        const isT3ExameNuclear = useExame9a || useExame;

        const notaData: Record<string, unknown> = {
          alunoId: form.alunoId,
          turmaId,
          disciplina,
          trimestre,
          pp1: pp, ppt, mac1: mac, mt1, nf, mac,
          pg1: pg1Val, pg2: pg2Val,
          // ex1/ex2 excluídos do payload do professor para T3 nuclear de exame:
          // preserva o EN lançado pela Secretaria mesmo que o professor re-grave.
          ...(!isT3ExameNuclear && { ex1: ex1Val, ex2: ex2Val }),
          provaRecuperacao: provaRec,
          // Snapshot da escala usada — protege o histórico se a escola alterar
          // a configuração mais tarde.
          escalaMin: macMin,
          escalaMax: macMax,
          escalaTipo: tipoEscala,
          anoLetivo: anoSelecionado?.ano || '2025',
          professorId: lancadorId,
          data: new Date().toISOString().split('T')[0],
          // Anexo IV/V — Comportamento e Apreciação Descritiva Global
          comportamento: form.comportamento || null,
          apreciacaoDescritiva: form.apreciacaoDescritiva || null,
        };
        ALL_AVAL_KEYS.forEach((k, i) => {
          notaData[k] = i < numAvais ? avalValues[i] : 0;
        });

        if (notaExistente) {
          await updateNota(notaExistente.id, notaData);
        } else {
          await addNota(notaData);
        }
      }

      if (!pautaAtual) {
        await addPauta({
          turmaId,
          disciplina,
          trimestre,
          professorId: lancadorId,
          status: 'aberta',
          anoLetivo: anoSelecionado?.ano || '2025',
        });
      }

      webAlert('Notas guardadas', 'As notas foram guardadas com sucesso.');
    } catch (e) {
      webAlert('Erro', 'Não foi possível guardar as notas.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleLancado(alunoId: string) {
    const notaExistente = notas.find(n =>
      n.alunoId === alunoId && n.turmaId === turmaId &&
      n.disciplina === disciplina && n.trimestre === trimestre
    );
    if (!notaExistente) {
      webAlert('Aviso', 'Guarde as notas deste aluno antes de marcar como Publicado.');
      return;
    }
    const novoValor = !lancadoSet.has(alunoId);
    try {
      const resp = await fetch(`/api/notas/${notaExistente.id}/lancado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lancado: novoValor }),
      });
      if (!resp.ok) throw new Error('Falha na resposta do servidor');
      setLancadoSet(prev => {
        const next = new Set(prev);
        if (novoValor) next.add(alunoId); else next.delete(alunoId);
        return next;
      });
    } catch {
      webAlert('Erro', 'Não foi possível actualizar o estado de publicação.');
    }
  }

  async function fecharPauta() {
    if (!pautaAtual) {
      webAlert('Aviso', 'Guarde as notas primeiro antes de submeter a pauta.');
      return;
    }
    const totalAlunos = alunosDaTurma.length;
    const notasLancadas = notas.filter(n => n.turmaId === turmaId && n.disciplina === disciplina && n.trimestre === trimestre).length;
    const faltando = totalAlunos - notasLancadas;
    const avisoFaltando = faltando > 0
      ? `\n\n⚠️ Atenção: ${faltando} aluno(s) ainda não têm nota lançada.`
      : '\n\n✅ Todos os alunos têm notas lançadas.';
    webAlert(
      'Submeter Pauta',
      `Tem a certeza que deseja submeter e encerrar a pauta de ${disciplina} — ${turmaAtual?.nome} — ${trimestre}º Trimestre?${avisoFaltando}\n\nApós a submissão, as notas ficam encerradas e não poderão ser alteradas sem autorização da direcção.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Submeter Pauta',
          style: 'destructive',
          onPress: async () => {
            await updatePauta(pautaAtual.id, {
              status: 'fechada',
              dataFecho: new Date().toISOString(),
            });
            await addNotificacao({
              titulo: 'Pauta Submetida',
              mensagem: `Pauta de ${disciplina} (${turmaAtual?.nome}) — ${trimestre}º Trimestre foi submetida e encerrada com sucesso.`,
              tipo: 'sucesso',
              data: new Date().toISOString(),
            });
            webAlert('Pauta Submetida', 'A pauta foi submetida e encerrada com sucesso. Para reabrir, será necessário solicitar autorização à direcção.');
          },
        },
      ]
    );
  }

  async function solicitarReabertura() {
    if (!pautaAtual) return;
    const solicitanteId = prof?.id || user?.id || '';
    const solicitanteNome = prof ? `${prof.nome} ${prof.apelido}` : (user?.nome || 'Utilizador');
    if (!solicitanteId) return;
    if (!motivoSolicidade.trim()) {
      webAlert('Obrigatório', 'Indique o motivo do pedido de reabertura.');
      return;
    }
    await addSolicitacao({
      pautaId: pautaAtual.id,
      turmaId,
      turmaNome: turmaAtual?.nome || '',
      disciplina,
      trimestre,
      professorId: solicitanteId,
      professorNome: solicitanteNome,
      motivo: motivoSolicidade,
      status: 'pendente',
    });
    await updatePauta(pautaAtual.id, { status: 'pendente_abertura' });
    await addNotificacao({
      titulo: 'Solicitação Enviada',
      mensagem: `Pedido de reabertura da pauta de ${disciplina} (${turmaAtual?.nome}) enviado à direcção.`,
      tipo: 'aviso',
      data: new Date().toISOString(),
    });
    setMotivoSolicidade('');
    setShowSolicitModal(false);
    webAlert('Pedido Enviado', 'A sua solicitação de reabertura foi enviada. Aguarde a aprovação.');
  }

  function gerarHtmlMiniPauta(): string {
    const nomeEscola = config?.nomeEscola || 'Super Escola';
    const anoLetivo = anoSelecionado?.ano || '20__/20__';
    const anoLetivoCurto = anoLetivo.includes('/') ? anoLetivo.replace('/', '-') : anoLetivo;
    const profDaPauta = pautaAtual?.professorId
      ? professores.find(p => p.id === pautaAtual.professorId)
      : null;
    const profRef = profDaPauta || prof;
    const profNome = profRef ? `${profRef.nome} ${profRef.apelido}` : '____________________';
    const dirPedNome = (config as any)?.directorPedagogico || '____________________';
    const dirGeralNome = (config as any)?.directorGeral || '____________________';
    const municipio = (config as any)?.municipioEscola || (config as any)?.municipio || '';
    const provincia = (config as any)?.provinciaEscola || (config as any)?.provincia || '';
    const brasaoUrl = (config as any)?.logoUrl || '/angola-brasao.png';
    const cabecalhoLinha1 = (config as any)?.cabecalhoLinha1 || 'REPÚBLICA DE ANGOLA';
    const cabecalhoLinha2 = (config as any)?.cabecalhoLinha2 || (municipio ? `ADMINISTRAÇÃO DO MUNICÍPIO DE ${municipio.toUpperCase()}` : 'MINISTÉRIO DA EDUCAÇÃO');
    const cabecalhoLinha3 = (config as any)?.cabecalhoLinha3 || 'DIRECÇÃO MUNICIPAL DA EDUCAÇÃO';
    const cabecalhoLinha4 = (config as any)?.cabecalhoLinha4 || nomeEscola;
    const turmaObj = turmas.find(t => t.id === turmaId) || minhasTurmas.find(t => t.id === turmaId);
    const turmaNome = turmaObj?.nome || '—';
    const nivelClasse = (turmaObj?.classe || '—').replace(/ª\s*Classe/i, '').trim();
    const sala = (turmaObj as any)?.sala || '—';
    const turno = (turmaObj as any)?.turno || '';
    const areaFormacao = ((turmaObj as any)?.areaFormacao || '').toString().trim();
    const areaTurma = areaFormacao ? `ÁREA DE ${areaFormacao.toUpperCase()}` : '';
    const notaMinima = config?.notaMinimaAprovacao ?? 10;
    const hoje = new Date();
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const dataHoje = `${String(hoje.getDate()).padStart(2,'0')} de ${meses[hoje.getMonth()].toLowerCase()} de ${hoje.getFullYear()}`;
    const anoCorrente = hoje.getFullYear();
    const _numRaw = pautaNumeroFetched || (pautaAtual as any)?.numero || (pautaAtual as any)?.numeroPauta;
    const numeroPauta = _numRaw ? String(_numRaw).padStart(3, '0') : '____';

    // ── Modelo de avaliação dinâmico ───────────────────────────────────────
    const numAval = Math.max(1, Math.min(8, config?.numAvaliacoes ?? 4));
    const mostrarNPP = (config as any)?.temNPP !== false && (config as any)?.pp1Habilitado !== false;
    const mostrarNPT = (config as any)?.temNPT !== false && (config as any)?.pptHabilitado !== false;

    // Nível da classe para lógica do 3º Trimestre
    const classeNum = parseInt(nivelClasse.replace(/\D/g, ''), 10);
    const isT3Transicao = !isNaN(classeNum) && (classeNum === 10 || classeNum === 11);
    const isT3Exame    = !isNaN(classeNum) && classeNum === 12;

    // Nº de colunas por trimestre
    const t12Cols  = numAval + 1 + (mostrarNPP ? 1 : 0) + (mostrarNPT ? 1 : 0) + 1;
    const t3NptCols = mostrarNPT ? (isT3Transicao ? 2 : isT3Exame ? 0 : 1) : 0;
    const t3Cols   = numAval + 1 + (mostrarNPP ? 1 : 0) + t3NptCols + 1;

    // ── Helpers ─────────────────────────────────────────────────────────────
    const fv = (v: number | null | undefined) => (!v || v <= 0) ? '' : v.toFixed(1);
    const fc = (v: number | null | undefined, bold = false) => {
      const t = fv(v); if (!t) return '';
      const low = (v as number) > 0 && (v as number) < notaMinima;
      return `<span style="${low?'color:#cc0000;':''}${bold?'font-weight:bold;':''}">${t}</span>`;
    };

    // ── Diagnósticas e Formativa (colunas informativas) ─────────────────────
    const formativaAtivaMp = !!(config as any).avaliacaoFormativaHabilitada;
    const temDiagnosticasMp = Object.keys(diagnosticasMap).length > 0;
    const nivelDiagLabel = (nivel: string) => ({
      satisfaz_bem: 'SB', satisfaz: 'SAT', nao_satisfaz: 'NS',
    }[nivel] ?? nivel?.slice(0, 3)?.toUpperCase() ?? '—');

    // ── Sub-cabeçalhos ──────────────────────────────────────────────────────
    const subHdr12 = () => [
      ...Array.from({length: numAval}, (_, i) => `<th class="th-aval">A${i+1}</th>`),
      `<th class="th-mac">MAC</th>`,
      ...(mostrarNPP ? [`<th class="th-npp">NPP</th>`] : []),
      ...(mostrarNPT ? [`<th class="th-npt">NPT</th>`] : []),
      `<th class="th-mt">MT</th>`,
    ].join('');

    const subHdr3 = () => [
      ...Array.from({length: numAval}, (_, i) => `<th class="th-aval">A${i+1}</th>`),
      `<th class="th-mac">MAC</th>`,
      ...(mostrarNPP ? [`<th class="th-npp">NPP</th>`] : []),
      ...(mostrarNPT
        ? isT3Transicao ? [`<th class="th-npt">PG1</th>`,`<th class="th-npt">PG2</th>`]
        : isT3Exame     ? []
        :                 [`<th class="th-npt">NPT</th>`]
        : []),
      `<th class="th-mt">MT</th>`,
    ].join('');

    // ── Alunos com notas ────────────────────────────────────────────────────
    const AVAL_KEYS = ['aval1','aval2','aval3','aval4','aval5','aval6','aval7','aval8'] as const;
    const alunosComNota = alunosDaTurma.filter(aluno =>
      notas.some(n => n.alunoId === aluno.id && n.turmaId === turmaId && n.disciplina === disciplina &&
        (AVAL_KEYS.some(k => ((n as any)[k] ?? 0) > 0) ||
         (n.mac ?? n.mac1 ?? 0) > 0 || (n.pp1 ?? 0) > 0 || (n.ppt ?? 0) > 0 || (n.mt1 ?? 0) > 0))
    );

    // ── Células de dados por trimestre ──────────────────────────────────────
    type NotaRow = typeof notas[number];
    const trCells = (n: NotaRow | undefined, isT3 = false): string => {
      const cells: string[] = [];
      for (let i = 1; i <= numAval; i++) {
        const v = (n as any)?.[`aval${i}`] ?? 0;
        cells.push(`<td class="nc tc-aval">${fc(v > 0 ? v : null)}</td>`);
      }
      const macV = n ? (n.mac ?? n.mac1 ?? 0) : 0;
      cells.push(`<td class="nc tc-mac">${fc(macV > 0 ? macV : null, true)}</td>`);
      if (mostrarNPP) {
        const nppV = n ? (n.pp1 ?? 0) : 0;
        cells.push(`<td class="nc tc-npp">${fc(nppV > 0 ? nppV : null)}</td>`);
      }
      if (mostrarNPT) {
        if (isT3 && isT3Transicao) {
          const pg1 = (n as any)?.pg1 ?? 0; const pg2 = (n as any)?.pg2 ?? 0;
          cells.push(`<td class="nc tc-npt">${fc(pg1>0?pg1:null)}</td><td class="nc tc-npt">${fc(pg2>0?pg2:null)}</td>`);
        } else if (!(isT3 && isT3Exame)) {
          const npt = n ? (n.ppt ?? 0) : 0;
          cells.push(`<td class="nc tc-npt">${fc(npt>0?npt:null)}</td>`);
        }
      }
      const mt = n ? (n.mt1 ?? 0) : 0;
      const mtLow = mt > 0 && mt < notaMinima;
      cells.push(`<td class="nc tc-mt">${mt>0?`<span style="${mtLow?'color:#cc0000;':''}font-weight:bold;">${mt.toFixed(1)}</span>`:''}</td>`);
      return cells.join('');
    };

    const rows = alunosComNota.map((aluno, idx) => {
      const gN = (tr: number) => notas.find(n =>
        n.alunoId === aluno.id && n.turmaId === turmaId && n.disciplina === disciplina && n.trimestre === tr
      );
      const t1 = gN(1); const t2 = gN(2); const t3 = gN(3);
      // MFD: com decreto activo usa calcMFD_auto (Decreto Exec. nº 04/2026); senão média simples
      const _mts1 = [t1?.mt1, t2?.mt1, t3?.mt1].filter((v): v is number => v != null && v > 0);
      let mfd: number | null = null;
      if (_mts1.length > 0) {
        if (usarDecretoFormulas && classeNum > 0) {
          mfd = calcMFD_auto(t1?.mt1 ?? 0, t2?.mt1 ?? 0, t3?.mt1 ?? 0,
            (t3 as any)?.ex1 ?? 0, disciplinaNuclear, classeNum, decretoWeights);
        } else {
          mfd = Math.round((_mts1.reduce((a,b)=>a+b,0)/_mts1.length)*10)/10;
        }
      }
      const mfdArred = mfd !== null ? Math.round(mfd) : null;
      const aprovado = mfdArred !== null ? (mfdArred >= notaMinima ? 'Aprovado' : 'Reprovado') : '';
      const mfdColor = mfdArred === null ? '#000' : mfdArred >= notaMinima ? '#155724' : '#cc0000';
      const bg = idx % 2 === 0 ? '#e8f5e9' : '#fff';
      const nome = `${aluno.nome} ${aluno.apelido||''}`.trim().toUpperCase();
      // NF Formativa (escala 1-5, calculada dos registos formativos)
      const notaFormativaAluno = (t3 ?? t2 ?? t1) ? ((notas.find(n => n.alunoId === aluno.id && n.turmaId === turmaId && n.disciplina === disciplina && n.trimestre === trimestre) as any)?.notaFormativa ?? 0) : 0;
      const nfFormCelula = formativaAtivaMp && notaFormativaAluno > 0
        ? `<td class="nc tc-nf" style="background:#d1fae5;color:#065f46;font-weight:bold;">${Number(notaFormativaAluno).toFixed(1)}</td>`
        : formativaAtivaMp ? `<td class="nc tc-nf" style="color:#aaa;">—</td>` : '';
      // ND Diagnóstica (qualitativo, só informativo)
      const ndNivel = diagnosticasMap[aluno.id];
      const ndCelula = temDiagnosticasMp
        ? `<td class="nc tc-nd" style="background:#ede9fe;color:#5b21b6;font-style:italic;">${ndNivel ? nivelDiagLabel(ndNivel) : '—'}</td>`
        : '';
      return `<tr style="background:${bg}">
        <td class="nc-num">${String(idx+1).padStart(2,'0')}</td>
        <td class="nc-nome">${nome}</td>
        ${trCells(t1)}${trCells(t2)}${trCells(t3,true)}
        <td class="nc mfd" style="font-weight:bold;background:#c6efce;color:${mfdColor};">${mfd!==null?mfd.toFixed(1):''}</td>
        ${nfFormCelula}${ndCelula}
        <td class="nc-obs" style="color:${mfd!==null&&mfd<notaMinima?'#cc0000':'#155724'};">${aprovado}</td>
      </tr>`;
    });

    // ── Legenda dinâmica ────────────────────────────────────────────────────
    const leg: string[] = [
      `<b>A1–A${numAval}</b>=Avaliações Contínuas`,
      `<b>MAC</b>=Média das Avaliações Contínuas`,
    ];
    if (mostrarNPP) leg.push(`<b>NPP</b>=Nota da Prova do Professor`);
    if (mostrarNPT) {
      if (isT3Transicao) leg.push(`<b>NPT/PG</b>=Prova Trimestral/Prova Global`);
      else if (isT3Exame) leg.push(`<b>NPT/EX</b>=Prova Trimestral/Exame Nacional`);
      else leg.push(`<b>NPT</b>=Nota da Prova Trimestral`);
    }
    leg.push(`<b>MT</b>=Média Trimestral`, `<b>MFD</b>=Média Final do Ano`);
    if (formativaAtivaMp) leg.push(`<b>NF</b>=Nota Formativa (${(config as any).percFormativa ?? 20}% do MAC — Art. 8º §1)`);
    if (temDiagnosticasMp) leg.push(`<b>ND</b>=Diagnóstica (SB=Satisfaz Bem | SAT=Satisfaz | NS=Não Satisfaz — informativo)`);

    return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"/>
<title>Mini-Pauta · ${disciplina} · ${turmaNome}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
  body{font-family:'Times New Roman',Calibri,Arial,sans-serif;background:#fff;color:#000;padding:10px 14px;font-size:11px;}
  .top-bar{position:relative;display:block;min-height:120px;margin-bottom:4px;}
  .visto{position:absolute;left:0;top:0;width:170px;border:1px solid #000;padding:4px 6px;font-size:9px;line-height:1.35;}
  .visto-title{text-align:center;font-weight:bold;font-size:10px;letter-spacing:0.5px;margin-bottom:4px;}
  .visto-data{font-size:9px;margin-bottom:18px;}
  .visto-cargo{border-top:1px solid #000;padding-top:2px;text-align:center;font-size:9px;font-style:italic;}
  .doc-header{text-align:center;padding-top:0;}
  .doc-header img{width:72px;height:72px;object-fit:contain;display:block;margin:0 auto 2px;}
  .doc-header .rep{font-size:11px;font-weight:bold;line-height:1.3;}
  .doc-header .min{font-size:10.5px;font-weight:bold;line-height:1.3;}
  .doc-header .min2{font-size:10.5px;font-weight:bold;line-height:1.3;}
  .doc-header .escola{font-size:11.5px;font-weight:bold;text-decoration:underline;line-height:1.4;margin-bottom:2px;text-transform:uppercase;letter-spacing:1px;}
  .doc-header .area-turma{font-size:10.5px;font-weight:bold;text-decoration:underline;line-height:1.3;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;min-height:4px;}
  .doc-title{text-align:center;font-size:13px;font-weight:bold;margin:2px 0 6px;letter-spacing:0.5px;}
  .info-bar{border-top:1px solid #000;border-bottom:1px solid #000;padding:3px 0;font-size:10px;}
  .info-bar .row1,.info-bar .row2{display:flex;flex-wrap:wrap;gap:16px;padding:1px 4px;}
  .info-bar .lbl{font-weight:bold;}
  table{width:100%;border-collapse:collapse;font-size:8.5px;margin-top:0;}
  th,td{border:1px solid #444;padding:2px 2px;}
  thead tr.tr-group th{background:#1a6b3c !important;color:#fff !important;font-size:9px;font-weight:bold;text-align:center;white-space:nowrap;}
  thead tr.tr-sub th{font-size:7.5px;font-weight:bold;text-align:center;padding:1px 2px;}
  thead tr.tr-sub th.th-aval{background:#dff0da !important;color:#1a3a1a !important;}
  thead tr.tr-sub th.th-mac{background:#5da85d !important;color:#fff !important;}
  thead tr.tr-sub th.th-npp{background:#a8d5a2 !important;color:#0a2a0a !important;}
  thead tr.tr-sub th.th-npt{background:#88c488 !important;color:#0a2a0a !important;}
  thead tr.tr-sub th.th-mt{background:#1a6b3c !important;color:#fff !important;}
  th.col-num{width:22px;text-align:center;}
  th.col-nome{min-width:170px;text-align:left;padding-left:5px;}
  th.col-mfd{width:30px;background:#a8d5a2 !important;color:#0a2a0a !important;}
  th.col-obs{width:62px;}
  td.nc{text-align:center;font-size:9px;}
  td.nc-num{text-align:center;font-size:9px;font-weight:bold;}
  td.nc-nome{font-size:9px;padding-left:5px;font-weight:bold;}
  td.nc-obs{text-align:center;font-size:8.5px;font-weight:bold;}
  td.tc-aval{text-align:center;}
  td.tc-mac{background:#b8e4b8 !important;font-weight:bold;text-align:center;}
  td.tc-npp{text-align:center;}
  td.tc-npt{background:#daf0da !important;text-align:center;}
  td.tc-mt{background:#a8d5a2 !important;text-align:center;}
  td.mfd{background:#c6efce !important;text-align:center;}
  tbody tr:last-child td{border-bottom:1.5px solid #1a6b3c;}
  .legenda{margin-top:7px;font-size:8.5px;font-style:italic;color:#333;padding:2px 4px;border-top:1px solid #ccc;}
  .legenda b{font-style:normal;color:#000;}
  .footer{margin-top:18px;display:flex;justify-content:space-between;align-items:flex-end;gap:18px;page-break-inside:avoid;break-inside:avoid;}
  .footer-loc{font-size:10px;flex:0 0 auto;align-self:flex-end;padding-bottom:2px;}
  .sigs{display:flex;justify-content:flex-end;flex:1;gap:30px;margin-top:34px;}
  .sig{text-align:center;min-width:170px;}
  .sig-line{border-top:1px solid #000;padding-top:3px;font-size:10px;font-weight:bold;}
  .sig-name{font-size:10px;font-weight:bold;margin-top:0;}
  @media print{
    html,body{height:auto;}
    body{padding:6px 8px;}
    @page{size:A4 landscape;margin:6mm 6mm;}
    .no-print{display:none;}
    table{page-break-inside:auto;}
    thead{display:table-header-group;}
    tr{page-break-inside:avoid;break-inside:avoid;}
  }
</style>
</head><body>
<div class="top-bar">
  <div class="visto">
    <div class="visto-title">VISTO</div>
    <div class="visto-data">Data ___/___/______</div>
    <div class="visto-cargo">A Chefe de Repartição e Ensino</div>
  </div>
  <div class="doc-header">
    <img src="${brasaoUrl}" alt="Brasão" onerror="this.style.display='none'"/>
    <div class="rep">${cabecalhoLinha1}</div>
    <div class="min">${cabecalhoLinha2}</div>
    <div class="min2">${cabecalhoLinha3}</div>
    <div class="escola">${cabecalhoLinha4}</div>
    ${areaTurma ? `<div class="area-turma">${areaTurma}</div>` : ''}
  </div>
</div>
<div class="doc-title">MINI-PAUTA — ${(disciplina||'').toUpperCase()} — ${nivelClasse}ª CLASSE — Ano Lectivo: ${anoLetivoCurto}</div>
<div class="info-bar">
  <div class="row1">
    <div><span class="lbl">ESCOLA:</span> ${nomeEscola}</div>
    <div><span class="lbl">MUNICÍPIO DE:</span> ${municipio||'_________________'}</div>
    <div><span class="lbl">PROVÍNCIA DE:</span> ${provincia||'_________________'}</div>
  </div>
  <div class="row2">
    <div><span class="lbl">PAUTA Nº</span> ${numeroPauta}/${anoCorrente}</div>
    <div><span class="lbl">ANO LECTIVO:</span> ${anoLetivoCurto}</div>
    <div><span class="lbl">CLASSE:</span> ${nivelClasse}ª Classe</div>
    <div><span class="lbl">TURMA:</span> ${turmaNome}</div>
    <div><span class="lbl">SALA:</span> ${sala}</div>
    <div><span class="lbl">TURNO:</span> ${turno||'—'}</div>
    <div><span class="lbl">DATA:</span> ${dataHoje}</div>
  </div>
</div>
<table>
  <thead>
    <tr class="tr-group">
      <th rowspan="2" class="col-num">Nº</th>
      <th rowspan="2" class="col-nome">NOME COMPLETO</th>
      <th colspan="${t12Cols}">1º TRIMESTRE</th>
      <th colspan="${t12Cols}">2º TRIMESTRE</th>
      <th colspan="${t3Cols}">3º TRIMESTRE</th>
      <th rowspan="2" class="col-mfd">MFD</th>
      <th rowspan="2" class="col-obs">OBSERVAÇÃO</th>
    </tr>
    <tr class="tr-sub">${subHdr12()}${subHdr12()}${subHdr3()}</tr>
  </thead>
  <tbody>${rows.join('\n')}</tbody>
</table>
<div class="legenda"><b>Legenda:</b> ${leg.join(' | ')}</div>
<div class="footer">
  <div class="footer-loc">${nomeEscola}, ${dataHoje}.</div>
  <div class="sigs">
    <div class="sig"><div class="sig-line">O(A) SUB-DIRECTOR(A) PEDAGÓGICO</div><div class="sig-name">${dirPedNome}</div></div>
    <div class="sig"><div class="sig-line">O(A) DIRECTOR(A) DA ESCOLA</div><div class="sig-name">${dirGeralNome}</div></div>
    <div class="sig"><div class="sig-line">O PROFESSOR</div><div class="sig-name">${profNome}</div></div>
  </div>
</div>
<div class="no-print" style="text-align:center;margin-top:20px;">
  <button onclick="window.print()" style="padding:10px 32px;font-size:14px;background:#1a6b3c;color:#fff;border:none;border-radius:6px;cursor:pointer;">Imprimir / Guardar PDF</button>
</div>
</body></html>`;
  }

  function gerarHtmlComTemplate(templateConteudo: string): string {
    const nomeEscola = config?.nomeEscola || 'Super Escola';
    const anoLetivo = anoSelecionado?.ano || '20__/20__';
    const anoLetivoCurto = anoLetivo.includes('/') ? anoLetivo.replace('/', '-') : anoLetivo;
    const profDaPauta = pautaAtual?.professorId
      ? professores.find(p => p.id === pautaAtual.professorId)
      : null;
    const profRef = profDaPauta || prof;
    const profNome = profRef ? `${profRef.nome} ${profRef.apelido}` : '____________________';
    const dirPedNome = (config as any)?.directorPedagogico || '____________________';
    const dirGeralNome = (config as any)?.directorGeral || '____________________';
    const municipio = (config as any)?.municipioEscola || (config as any)?.municipio || '';
    const provincia = (config as any)?.provinciaEscola || (config as any)?.provincia || '';
    const brasaoUrl = (config as any)?.logoUrl || '/angola-brasao.png';
    const cabecalhoLinha1 = (config as any)?.cabecalhoLinha1 || 'REPÚBLICA DE ANGOLA';
    const cabecalhoLinha2 = (config as any)?.cabecalhoLinha2 || (municipio ? `ADMINISTRAÇÃO DO MUNICÍPIO DE ${municipio.toUpperCase()}` : 'MINISTÉRIO DA EDUCAÇÃO');
    const cabecalhoLinha3 = (config as any)?.cabecalhoLinha3 || 'DIRECÇÃO MUNICIPAL DA EDUCAÇÃO';
    const cabecalhoLinha4 = (config as any)?.cabecalhoLinha4 || nomeEscola;
    const turmaObj = turmas.find(t => t.id === turmaId) || minhasTurmas.find(t => t.id === turmaId);
    const turmaNome = turmaObj?.nome || '—';
    const nivelClasse = (turmaObj?.classe || '—').replace(/ª\s*Classe/i, '').trim();
    const sala = (turmaObj as any)?.sala || '—';
    const turno = (turmaObj as any)?.turno || '';
    const areaFormacao = ((turmaObj as any)?.areaFormacao || '').toString().trim();
    const areaTurma = areaFormacao ? `ÁREA DE ${areaFormacao.toUpperCase()}` : '';
    const notaMinima = config?.notaMinimaAprovacao ?? 10;
    const hoje = new Date();
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const dataHoje = `${String(hoje.getDate()).padStart(2,'0')} de ${meses[hoje.getMonth()].toLowerCase()} de ${hoje.getFullYear()}`;
    const anoCorrente = hoje.getFullYear();
    const _numRaw2 = pautaNumeroFetched || (pautaAtual as any)?.numero || (pautaAtual as any)?.numeroPauta;
    const numeroPauta = _numRaw2 ? String(_numRaw2).padStart(3, '0') : '____';

    const numAval = Math.max(1, Math.min(8, config?.numAvaliacoes ?? 4));
    const mostrarNPP = (config as any)?.temNPP !== false && (config as any)?.pp1Habilitado !== false;
    const mostrarNPT = (config as any)?.temNPT !== false && (config as any)?.pptHabilitado !== false;
    const classeNum = parseInt(nivelClasse.replace(/\D/g, ''), 10);
    const isT3Transicao = !isNaN(classeNum) && (classeNum === 10 || classeNum === 11);
    const isT3Exame    = !isNaN(classeNum) && classeNum === 12;
    const t12Cols  = numAval + 1 + (mostrarNPP ? 1 : 0) + (mostrarNPT ? 1 : 0) + 1;
    const t3NptCols = mostrarNPT ? (isT3Transicao ? 2 : isT3Exame ? 0 : 1) : 0;
    const t3Cols   = numAval + 1 + (mostrarNPP ? 1 : 0) + t3NptCols + 1;

    const fv = (v: number | null | undefined) => (!v || v <= 0) ? '' : v.toFixed(1);
    const fc = (v: number | null | undefined, bold = false) => {
      const t = fv(v); if (!t) return '';
      const low = (v as number) > 0 && (v as number) < notaMinima;
      return `<span style="${low?'color:#cc0000;':''}${bold?'font-weight:bold;':''}">${t}</span>`;
    };

    const subHdr12 = () => [
      ...Array.from({length: numAval}, (_, i) => `<th class="th-aval">A${i+1}</th>`),
      `<th class="th-mac">MAC</th>`,
      ...(mostrarNPP ? [`<th class="th-npp">NPP</th>`] : []),
      ...(mostrarNPT ? [`<th class="th-npt">NPT</th>`] : []),
      `<th class="th-mt">MT</th>`,
    ].join('');

    const subHdr3 = () => [
      ...Array.from({length: numAval}, (_, i) => `<th class="th-aval">A${i+1}</th>`),
      `<th class="th-mac">MAC</th>`,
      ...(mostrarNPP ? [`<th class="th-npp">NPP</th>`] : []),
      ...(mostrarNPT
        ? isT3Transicao ? [`<th class="th-npt">PG1</th>`,`<th class="th-npt">PG2</th>`]
        : isT3Exame     ? []
        :                 [`<th class="th-npt">NPT</th>`]
        : []),
      `<th class="th-mt">MT</th>`,
    ].join('');

    const AVAL_KEYS_T = ['aval1','aval2','aval3','aval4','aval5','aval6','aval7','aval8'] as const;
    const alunosComNota = alunosDaTurma.filter(aluno =>
      notas.some(n => n.alunoId === aluno.id && n.turmaId === turmaId && n.disciplina === disciplina &&
        (AVAL_KEYS_T.some(k => ((n as any)[k] ?? 0) > 0) ||
         (n.mac ?? n.mac1 ?? 0) > 0 || (n.pp1 ?? 0) > 0 || (n.ppt ?? 0) > 0 || (n.mt1 ?? 0) > 0))
    );

    type NotaRowT = typeof notas[number];
    const trCellsT = (n: NotaRowT | undefined, isT3 = false): string => {
      const cells: string[] = [];
      for (let i = 1; i <= numAval; i++) {
        const v = (n as any)?.[`aval${i}`] ?? 0;
        cells.push(`<td class="nc tc-aval">${fc(v > 0 ? v : null)}</td>`);
      }
      const macV = n ? (n.mac ?? n.mac1 ?? 0) : 0;
      cells.push(`<td class="nc tc-mac">${fc(macV > 0 ? macV : null, true)}</td>`);
      if (mostrarNPP) { const nppV = n ? (n.pp1 ?? 0) : 0; cells.push(`<td class="nc tc-npp">${fc(nppV > 0 ? nppV : null)}</td>`); }
      if (mostrarNPT) {
        if (isT3 && isT3Transicao) { const pg1 = (n as any)?.pg1 ?? 0; const pg2 = (n as any)?.pg2 ?? 0; cells.push(`<td class="nc tc-npt">${fc(pg1>0?pg1:null)}</td><td class="nc tc-npt">${fc(pg2>0?pg2:null)}</td>`); }
        else if (!(isT3 && isT3Exame)) { const npt = n ? (n.ppt ?? 0) : 0; cells.push(`<td class="nc tc-npt">${fc(npt>0?npt:null)}</td>`); }
      }
      const mt = n ? (n.mt1 ?? 0) : 0; const mtLow = mt > 0 && mt < notaMinima;
      cells.push(`<td class="nc tc-mt">${mt>0?`<span style="${mtLow?'color:#cc0000;':''}font-weight:bold;">${mt.toFixed(1)}</span>`:''}</td>`);
      return cells.join('');
    };

    const rows = alunosComNota.map((aluno, idx) => {
      const gN = (tr: number) => notas.find(n =>
        n.alunoId === aluno.id && n.turmaId === turmaId && n.disciplina === disciplina && n.trimestre === tr
      );
      const t1 = gN(1); const t2 = gN(2); const t3 = gN(3);
      // MFD: com decreto activo usa calcMFD_auto (Decreto Exec. nº 04/2026); senão média simples
      const _mts2 = [t1?.mt1, t2?.mt1, t3?.mt1].filter((v): v is number => v != null && v > 0);
      let mfd: number | null = null;
      if (_mts2.length > 0) {
        if (usarDecretoFormulas && classeNum > 0) {
          mfd = calcMFD_auto(t1?.mt1 ?? 0, t2?.mt1 ?? 0, t3?.mt1 ?? 0,
            (t3 as any)?.ex1 ?? 0, disciplinaNuclear, classeNum, decretoWeights);
        } else {
          mfd = Math.round((_mts2.reduce((a,b)=>a+b,0)/_mts2.length)*10)/10;
        }
      }
      const mfdArred = mfd !== null ? Math.round(mfd) : null;
      const aprovado = mfdArred !== null ? (mfdArred >= notaMinima ? 'Aprovado' : 'Reprovado') : '';
      const mfdColor = mfdArred === null ? '#000' : mfdArred >= notaMinima ? '#155724' : '#cc0000';
      const bg = idx % 2 === 0 ? '#e8f5e9' : '#fff';
      const nome = `${aluno.nome} ${aluno.apelido||''}`.trim().toUpperCase();
      return `<tr style="background:${bg}">
        <td class="nc-num">${String(idx+1).padStart(2,'0')}</td>
        <td class="nc-nome">${nome}</td>
        ${trCellsT(t1)}${trCellsT(t2)}${trCellsT(t3,true)}
        <td class="nc mfd" style="font-weight:bold;background:#c6efce;color:${mfdColor};">${mfd!==null?mfd.toFixed(1):''}</td>
        <td class="nc-obs" style="color:${mfd!==null&&mfd<notaMinima?'#cc0000':'#155724'};">${aprovado}</td>
      </tr>`;
    });

    const leg: string[] = [
      `<b>A1–A${numAval}</b>=Avaliações Contínuas`,
      `<b>MAC</b>=Média das Avaliações Contínuas`,
    ];
    if (mostrarNPP) leg.push(`<b>NPP</b>=Nota da Prova do Professor`);
    if (mostrarNPT) {
      if (isT3Transicao) leg.push(`<b>NPT/PG</b>=Prova Trimestral/Prova Global`);
      else if (isT3Exame) leg.push(`<b>NPT/EX</b>=Prova Trimestral/Exame Nacional`);
      else leg.push(`<b>NPT</b>=Nota da Prova Trimestral`);
    }
    leg.push(`<b>MT</b>=Média Trimestral`, `<b>MFD</b>=Média Final do Ano`);

    const tableHtml = `<table>
  <thead>
    <tr class="tr-group">
      <th rowspan="2" class="col-num">Nº</th>
      <th rowspan="2" class="col-nome">NOME COMPLETO</th>
      <th colspan="${t12Cols}">1º TRIMESTRE</th>
      <th colspan="${t12Cols}">2º TRIMESTRE</th>
      <th colspan="${t3Cols}">3º TRIMESTRE</th>
      <th rowspan="2" class="col-mfd">MFD</th>
      <th rowspan="2" class="col-obs">OBSERVAÇÃO</th>
    </tr>
    <tr class="tr-sub">${subHdr12()}${subHdr12()}${subHdr3()}</tr>
  </thead>
  <tbody>${rows.join('\n')}</tbody>
</table>`;

    const ra = (html: string, tag: string, value: string) => html.split(tag).join(value);
    let result = templateConteudo;
    result = ra(result, '{{BRASAO_URL}}', brasaoUrl);
    result = ra(result, '{{LOGO_URL}}', brasaoUrl);
    result = ra(result, '{{CABECALHO_LINHA1}}', cabecalhoLinha1);
    result = ra(result, '{{CABECALHO_LINHA2}}', cabecalhoLinha2);
    result = ra(result, '{{CABECALHO_LINHA3}}', cabecalhoLinha3);
    result = ra(result, '{{CABECALHO_LINHA4}}', cabecalhoLinha4);
    result = ra(result, '{{AREA_TURMA}}', areaTurma);
    result = ra(result, '{{DISCIPLINA}}', (disciplina||'').toUpperCase());
    result = ra(result, '{{CLASSE}}', nivelClasse);
    result = ra(result, '{{ANO_LECTIVO}}', anoLetivoCurto);
    result = ra(result, '{{NOME_ESCOLA}}', nomeEscola);
    result = ra(result, '{{MUNICIPIO}}', municipio||'_________________');
    result = ra(result, '{{PROVINCIA}}', provincia||'_________________');
    result = ra(result, '{{PAUTA_NUMERO}}', `${numeroPauta}/${anoCorrente}`);
    result = ra(result, '{{TURMA}}', turmaNome);
    result = ra(result, '{{SALA}}', sala);
    result = ra(result, '{{TURNO}}', turno||'—');
    result = ra(result, '{{DATA_ACTUAL}}', dataHoje);
    result = ra(result, '{{TABELA_MINI_PAUTA}}', tableHtml);
    result = ra(result, '{{LEGENDA_MINI_PAUTA}}', leg.join(' | '));
    result = ra(result, '{{LOCAL_DATA}}', `${nomeEscola}, ${dataHoje}.`);
    result = ra(result, '{{NOME_SUBDIRECTOR_PEDAGOGICO}}', dirPedNome);
    result = ra(result, '{{NOME_DIRECTOR}}', dirGeralNome);
    result = ra(result, '{{NOME_PROFESSOR}}', profNome);
    return result;
  }

  function gerarExcelMiniPauta() {
    if (!turmaId || !disciplina) {
      webAlert('Atenção', 'Selecione a turma e disciplina antes de exportar.');
      return;
    }
    if (Platform.OS !== 'web') {
      webAlert('Indisponível', 'A exportação Excel está disponível na versão web do sistema.');
      return;
    }
    try {
      const token = (typeof window !== 'undefined' && (window as any).localStorage)
        ? (window as any).localStorage.getItem('@siga_token') || ''
        : '';
      const params = new URLSearchParams({
        turmaId,
        disciplina,
        trimestre: String(trimestre || 0),
        token,
      });
      const a = document.createElement('a');
      a.href = `/api/mini-pauta/excel?${params.toString()}`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 200);
    } catch (err: any) {
      webAlert('Erro', `Não foi possível gerar o Excel: ${err?.message || err}`);
    }
    return;
  }

  async function enviarMiniPauta() {
    if (!turmaId || !disciplina) {
      webAlert('Atenção', 'Selecione a turma e disciplina antes de enviar a mini-pauta.');
      return;
    }
    const turmaObj = minhasTurmas.find(t => t.id === turmaId);
    const turmaNome = turmaObj?.nome || turmaId;

    const alunosComQualquerNota = new Set(
      notas.filter(n => n.turmaId === turmaId && n.disciplina === disciplina).map(n => n.alunoId)
    );
    const faltamAlunos = alunosDaTurma.filter(a => !alunosComQualquerNota.has(a.id)).length;

    const doEmitir = async () => {
      if (Platform.OS === 'web') {
        const tpls = templatesMiniPauta && templatesMiniPauta !== 'loading' && Array.isArray(templatesMiniPauta) ? templatesMiniPauta : null;
        const tpl = tpls ? (tpls.find(t => t.disciplinaNome === disciplina) ?? tpls.find(t => !t.disciplinaNome) ?? tpls[0] ?? null) : null;
        if (tpl) {
          // Template personalizado: geração client-side mantida
          const html = gerarHtmlComTemplate(tpl.conteudo);
          const win = window.open('', '_blank');
          if (win) { win.document.write(html); win.document.close(); }
          try {
            await fetch('/api/documentos-emitidos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                alunoId: null, alunoNome: `Mini-Pauta · ${disciplina}`, alunoNum: '',
                alunoTurma: turmaNome, tipo: 'mini_pauta',
                finalidade: `${disciplina} — ${turmaNome}`,
                anoAcademico: anoSelecionado?.ano || '',
                emitidoPor: prof ? `${prof.nome} ${prof.apelido}` : (user?.nome || 'Sistema'),
                dadosSnapshot: { html },
              }),
            });
          } catch { }
        } else {
          // Geração server-side — sempre fresca, sem problemas de cache
          const token = (typeof window !== 'undefined' && (window as any).localStorage)
            ? (window as any).localStorage.getItem('@siga_token') || ''
            : '';
          const params = new URLSearchParams({
            turmaId: turmaId || '',
            disciplina: disciplina || '',
            trimestre: String(trimestre || 1),
            token,
          });
          window.open(`/api/mini-pauta/render?${params.toString()}`, '_blank');
          try {
            await fetch('/api/documentos-emitidos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                alunoId: null, alunoNome: `Mini-Pauta · ${disciplina}`, alunoNum: '',
                alunoTurma: turmaNome, tipo: 'mini_pauta',
                finalidade: `${disciplina} — ${turmaNome}`,
                anoAcademico: anoSelecionado?.ano || '',
                emitidoPor: prof ? `${prof.nome} ${prof.apelido}` : (user?.nome || 'Sistema'),
                dadosSnapshot: { url: `/api/mini-pauta/render?turmaId=${turmaId}&disciplina=${encodeURIComponent(disciplina||'')}&trimestre=${trimestre}` },
              }),
            });
          } catch { }
        }
      } else {
        webAlert('Indisponível', 'A impressão da mini-pauta está disponível na versão web do sistema.');
      }
      await addNotificacao({
        titulo: 'Mini-Pauta Emitida',
        mensagem: `Prof. ${prof ? `${prof.nome} ${prof.apelido}` : ''} emitiu a Mini-Pauta de ${disciplina} (${turmaNome}) — registada no arquivo.`,
        tipo: 'info',
        data: new Date().toISOString(),
      });
    };

    if (faltamAlunos > 0) {
      webAlert(
        'Pauta Incompleta',
        `${faltamAlunos} aluno${faltamAlunos > 1 ? 's' : ''} ainda não ${faltamAlunos > 1 ? 'têm' : 'tem'} notas lançadas nesta disciplina.\n\nPretende emitir a mini-pauta mesmo assim?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Emitir Mesmo Assim', onPress: doEmitir },
        ]
      );
    } else {
      await doEmitir();
    }
  }

  const pautaStatusColor = isPautaFechada ? Colors.danger : isPendente ? Colors.warning : pautaAtual ? Colors.success : Colors.textMuted;
  const pautaStatusLabel = isPautaFechada ? 'Submetida e Encerrada' : isPendente ? 'Aguarda Reabertura' : pautaAtual ? 'Aberta (Em Lançamento)' : 'Não Iniciada';

  // Count of students with grades entered for this pauta/trimestre
  const notasLancadasCount = notas.filter(n => n.turmaId === turmaId && n.disciplina === disciplina && n.trimestre === trimestre).length;
  const totalAlunosCount = alunosDaTurma.length;
  const pautaCompleta = notasLancadasCount >= totalAlunosCount && totalAlunosCount > 0;

  const alunosComQualquerNotaMiniPauta = new Set(
    notas.filter(n => n.turmaId === turmaId && n.disciplina === disciplina).map(n => n.alunoId)
  );
  const faltamParaMiniPauta = alunosDaTurma.filter(a => !alunosComQualquerNotaMiniPauta.has(a.id)).length;

  useEnterToSave(solicitarReabertura, showSolicitModal);

  if (step === 'selecao') {
    return (
      <View style={styles.container}>
        <TopBar title="Pautas" subtitle="Gestão de notas por turma e disciplina" />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}>

          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={20} color={Colors.info} />
            <Text style={styles.infoCardText}>
              Selecione a turma, disciplina e trimestre para lançar ou consultar as notas. Após o lançamento, feche a pauta para validar as avaliações.
            </Text>
          </View>

          {/* Turma */}
          <Text style={styles.fieldLabel}>Turma</Text>
          <TouchableOpacity style={styles.selector} onPress={() => { setShowTurmaList(v => !v); setShowDiscList(false); }}>
            <Text style={turmaId ? styles.selectorValue : styles.selectorPlaceholder}>
              {turmaId ? minhasTurmas.find(t => t.id === turmaId)?.nome : 'Selecionar turma...'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          {showTurmaList && (
            <View style={styles.dropdownList}>
              {minhasTurmas.length === 0 ? (
                <View style={styles.dropdownEmpty}>
                  <Text style={styles.dropdownEmptyText}>
                    {dataLoading ? 'A carregar turmas...' : 'Sem turmas atribuídas'}
                  </Text>
                </View>
              ) : minhasTurmas.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.dropdownItem, turmaId === t.id && styles.dropdownItemActive]}
                  onPress={() => { setTurmaId(t.id); setShowTurmaList(false); }}
                >
                  <Text style={[styles.dropdownText, turmaId === t.id && { color: Colors.gold }]}>{t.nome}</Text>
                  <Text style={styles.dropdownSub}>
                    {t.classe} · {t.turno}{t.sala ? ` · Sala ${t.sala}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Disciplina */}
          <Text style={styles.fieldLabel}>Disciplina</Text>
          <TouchableOpacity style={styles.selector} onPress={() => { setShowDiscList(v => !v); setShowTurmaList(false); }}>
            <Text style={disciplina ? styles.selectorValue : styles.selectorPlaceholder}>
              {disciplina || 'Selecionar disciplina...'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          {showDiscList && (
            <View style={styles.dropdownList}>
              {disciplinas.map(d => (
                <TouchableOpacity key={d} style={[styles.dropdownItem, disciplina === d && styles.dropdownItemActive]}
                  onPress={() => { setDisciplina(d); setShowDiscList(false); }}>
                  <Text style={[styles.dropdownText, disciplina === d && { color: Colors.gold }]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Trimestre */}
          <Text style={styles.fieldLabel}>Trimestre</Text>
          <View style={styles.trimestreRow}>
            {([1, 2, 3] as Trimestre[]).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.trimestreBtn, trimestre === t && styles.trimestreBtnActive]}
                onPress={() => setTrimestre(t)}
              >
                <Text style={[styles.trimestreBtnText, trimestre === t && styles.trimestreBtnTextActive]}>{t}º Trimestre</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Pauta Status Preview */}
          {turmaId && disciplina && (
            <View style={[styles.statusPreview, { borderColor: pautaStatusColor + '44', backgroundColor: pautaStatusColor + '11' }]}>
              <View style={[styles.statusDot, { backgroundColor: pautaStatusColor }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.statusPreviewLabel, { color: pautaStatusColor }]}>
                  Estado da Pauta: {pautaStatusLabel}
                </Text>
                {pautaAtual && (
                  <Text style={styles.statusPreviewSub}>
                    {notasLancadasCount}/{totalAlunosCount} alunos com notas lançadas{pautaCompleta ? ' ✓' : ''}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Aviso PAP para 13ª Classe */}
          {isPapMode && (
            <View style={{ flexDirection: 'row', gap: 8, backgroundColor: Colors.gold + '18', borderRadius: 12, borderWidth: 1, borderColor: Colors.gold + '44', padding: 12, marginTop: 14 }}>
              <Ionicons name="ribbon-outline" size={18} color={Colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.gold, marginBottom: 2 }}>Turma de {classeAtual} — PAP Habilitado</Text>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 16 }}>
                  Para além do lançamento de notas disciplinar, pode lançar as notas do Estágio Curricular, Defesa e{papDiscContribuintes.length > 0 ? ` disciplinas contribuintes (${papDiscContribuintes.join(', ')})` : ''} para calcular a Nota PAP automaticamente.
                </Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.openBtn, (!turmaId || !disciplina) && styles.openBtnDisabled]}
            onPress={iniciarPauta}
            disabled={!turmaId || !disciplina}
          >
            <Ionicons name="document-text" size={20} color="#fff" />
            <Text style={styles.openBtnText}>
              {pautaAtual ? (isPautaFechada ? 'Ver Pauta Fechada' : 'Continuar Lançamento') : 'Iniciar Lançamento'}
            </Text>
          </TouchableOpacity>

          {/* Botão PAP — apenas para 13ª Classe com PAP habilitado */}
          {isPapMode && turmaId && (
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.gold + '22', borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: Colors.gold + '55', marginTop: 10 }}
              onPress={iniciarPAP}
            >
              <Ionicons name="ribbon" size={20} color={Colors.gold} />
              <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.gold }}>Lançamento PAP — Estágio & Defesa</Text>
            </TouchableOpacity>
          )}

          {/* Banner: prazos expirados com bloqueio — informa o professor que algumas pautas estão ocultas */}
          {!isPrivilegedRole && prazosExpiradosBloqueados.length > 0 && (
            <View style={{ backgroundColor: Colors.warning + '18', borderRadius: 10, borderWidth: 1, borderColor: Colors.warning + '55', padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Ionicons name="time-outline" size={18} color={Colors.warning} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.warning, marginBottom: 3 }}>
                  Pautas temporariamente indisponíveis
                </Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.text, lineHeight: 18 }}>
                  O prazo de lançamento de notas encerrou para{' '}
                  {prazosExpiradosBloqueados.map((p: any, i: number) => (
                    <Text key={p.id} style={{ fontFamily: 'Inter_700Bold' }}>
                      {i > 0 ? ', ' : ''}{p.trimestre}º Trimestre
                      {p.descricao ? ` (${p.descricao})` : ''}
                    </Text>
                  ))}.{' '}
                  As pautas desse período foram retiradas da lista pelo que, se precisar de lançar ou corrigir notas, contacte a Subdirecção Pedagógica para solicitar uma prorrogação.
                </Text>
              </View>
            </View>
          )}

          {/* My Pautas History */}
          {(isPrivilegedRole ? pautas : pautas.filter(p => p.professorId === prof?.id)).length > 0 && (
            <>
              <Text style={styles.histTitle}>{isPrivilegedRole ? 'Todas as Pautas' : 'Minhas Pautas'}</Text>
              {(isPrivilegedRole ? pautas : pautas.filter(p => p.professorId === prof?.id)).map(p => {
                const turma = turmas.find(t => t.id === p.turmaId);
                const sc = p.status === 'fechada' ? Colors.danger : p.status === 'pendente_abertura' ? Colors.warning : Colors.success;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.histCard, { borderLeftColor: sc, borderLeftWidth: 3 }]}
                    onPress={() => {
                      setTurmaId(p.turmaId);
                      setDisciplina(p.disciplina);
                      setTrimestre(p.trimestre);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.histDisciplina}>{p.disciplina}</Text>
                      <Text style={styles.histTurma}>{turma?.nome || '—'} · {p.trimestre}º Trimestre</Text>
                    </View>
                    <View style={[styles.histStatus, { backgroundColor: sc + '22' }]}>
                      <Text style={[styles.histStatusText, { color: sc }]}>
                        {p.status === 'fechada' ? 'Fechada' : p.status === 'pendente_abertura' ? 'Pendente' : 'Aberta'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  // ====== PASSO PAP ======
  if (step === 'pap') {
    return (
      <View style={styles.container}>
        <TopBar
          title="Lançamento PAP"
          subtitle={`${turmaAtual?.nome || ''} · Prova de Aptidão Profissional`}
        />

        {/* Header PAP */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.gold + '18', borderBottomWidth: 1, borderBottomColor: Colors.gold + '33' }}>
          <Ionicons name="ribbon" size={18} color={Colors.gold} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.gold }}>
              Nota PAP = (Estágio + Defesa{papDiscContribuintes.length > 0 ? ' + Média Disciplinas' : ''}) ÷ 3
            </Text>
            {config.estagioComoDisciplina && (
              <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.gold + 'BB', marginTop: 2 }}>
                Estágio carregado automaticamente da pauta curricular
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={() => setStep('selecao')} style={{ padding: 6 }}>
            <Ionicons name="arrow-back" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Banner: estágio como disciplina */}
        {config.estagioComoDisciplina && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.info + '15', borderBottomWidth: 1, borderBottomColor: Colors.info + '33' }}>
            <Ionicons name="school-outline" size={15} color={Colors.info} />
            <Text style={{ flex: 1, fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.info, lineHeight: 15 }}>
              Estágio como disciplina curricular — nota carregada automaticamente da pauta regular. Apenas a Defesa precisa de ser lançada.
            </Text>
          </View>
        )}

        {/* Legenda */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
          <Text style={{ width: 44, fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textAlign: 'center' }}>Nº</Text>
          <Text style={{ flex: 1, fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted }}>Aluno</Text>
          <Text style={{ width: 52, fontSize: 9, fontFamily: 'Inter_700Bold', color: config.estagioComoDisciplina ? Colors.info : Colors.textMuted, textAlign: 'center' }}>
            {config.estagioComoDisciplina ? 'Est.(Auto)' : 'Estágio'}
          </Text>
          <Text style={{ width: 52, fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textAlign: 'center' }}>Defesa</Text>
          {papDiscContribuintes.map(d => (
            <Text key={d} style={{ width: 52, fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textAlign: 'center' }} numberOfLines={2}>{d}</Text>
          ))}
          <Text style={{ width: 52, fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.gold, textAlign: 'center' }}>PAP</Text>
        </View>

        <FlatList
          data={papForms}
          keyExtractor={f => f.alunoId}
          contentContainerStyle={{ paddingBottom: bottomInset + 100 }}
          renderItem={({ item: form, index }) => {
            const aluno = alunos.find(a => a.id === form.alunoId);
            if (!aluno) return null;
            const isEditing = editingAlunoId === aluno.id;
            const papColor = form.notaPAP !== null
              ? (form.notaPAP >= (config.notaMinimaAprovacao ?? 10) ? Colors.success : Colors.danger)
              : Colors.textMuted;

            return (
              <TouchableOpacity
                style={[styles.alunoRow, isEditing && styles.alunoRowEditing]}
                onPress={() => setEditingAlunoId(isEditing ? null : aluno.id)}
                activeOpacity={0.85}
              >
                <View style={styles.rowCell44}>
                  <Text style={styles.rowNum}>{String(index + 1).padStart(2, '0')}</Text>
                </View>
                <View style={styles.rowFlex}>
                  <Text style={styles.rowNome} numberOfLines={1}>{aluno.nome} {aluno.apelido}</Text>
                </View>
                {isEditing ? (
                  <>
                    {/* Estágio: read-only if auto-loaded from curriculum, editable otherwise */}
                    {config.estagioComoDisciplina ? (
                      <View style={{ width: 52, alignItems: 'center', backgroundColor: Colors.info + '22', borderRadius: 6, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.info }}>
                          {form.notaEstagio || '—'}
                        </Text>
                        <Text style={{ fontSize: 8, fontFamily: 'Inter_400Regular', color: Colors.info + 'AA' }}>Auto</Text>
                      </View>
                    ) : (
                      <TextInput
                        style={[styles.gradeInput, { width: 52 }]}
                        value={form.notaEstagio}
                        onChangeText={v => updatePapForm(aluno.id, 'notaEstagio', v)}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor={Colors.textMuted}
                      />
                    )}
                    <TextInput
                      style={[styles.gradeInput, { width: 52 }]}
                      value={form.notaDefesa}
                      onChangeText={v => updatePapForm(aluno.id, 'notaDefesa', v)}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      placeholderTextColor={Colors.textMuted}
                    />
                    {papDiscContribuintes.map(discNome => (
                      <TextInput
                        key={discNome}
                        style={[styles.gradeInput, { width: 52 }]}
                        value={form.notasDisciplinas[discNome] || ''}
                        onChangeText={v => updatePapDisc(aluno.id, discNome, v)}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor={Colors.textMuted}
                      />
                    ))}
                  </>
                ) : (
                  <>
                    {/* Estágio display — always shown */}
                    <View style={{ width: 52, alignItems: 'center' }}>
                      <Text style={[styles.gradeCellText, config.estagioComoDisciplina && form.notaEstagio ? { color: Colors.info } : {}]}>
                        {form.notaEstagio || '—'}
                      </Text>
                    </View>
                    <View style={{ width: 52, alignItems: 'center' }}>
                      <Text style={styles.gradeCellText}>{form.notaDefesa || '—'}</Text>
                    </View>
                    {papDiscContribuintes.map(discNome => (
                      <View key={discNome} style={{ width: 52, alignItems: 'center' }}>
                        <Text style={styles.gradeCellText}>{form.notasDisciplinas[discNome] || '—'}</Text>
                      </View>
                    ))}
                  </>
                )}
                {/* Nota PAP — sempre visível */}
                <View style={{ width: 52, alignItems: 'center', backgroundColor: form.notaPAP !== null ? papColor + '22' : 'transparent', borderRadius: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: papColor }}>
                    {form.notaPAP !== null ? form.notaPAP.toFixed(1) : '—'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />

        {/* Bottom bar PAP */}
        <View style={[styles.bottomBar, { paddingBottom: bottomInset + 8 }]}>
          {papSaving ? (
            <AppLoader color={Colors.gold} />
          ) : (
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: Colors.gold }]} onPress={guardarPAP}>
              <Ionicons name="save" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>Guardar Notas PAP</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TopBar
        title={`Pauta · ${disciplina}`}
        subtitle={`${turmaAtual?.nome || ''} · ${trimestre}º Trimestre`}
      />

      {/* Status Bar */}
      <View style={[styles.pautaStatusBar, { backgroundColor: pautaStatusColor + '18' }]}>
        <View style={[styles.statusDot, { backgroundColor: pautaStatusColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.pautaStatusText, { color: pautaStatusColor }]}>
            {pautaStatusLabel}
          </Text>
          {!isPautaFechada && !isPendente && pautaAtual && (
            <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: pautaCompleta ? Colors.success : Colors.textMuted, marginTop: 1 }}>
              {notasLancadasCount}/{totalAlunosCount} notas lançadas{pautaCompleta ? ' — pronta para submeter' : ''}
            </Text>
          )}
        </View>
        {isPautaFechada && !isReadOnly && (
          <TouchableOpacity
            style={styles.reaberturaBtn}
            onPress={() => temSolicPendente
              ? webAlert('Aguardar', 'Já existe um pedido de reabertura pendente.')
              : setShowSolicitModal(true)
            }
          >
            <Ionicons name="lock-open" size={14} color={Colors.warning} />
            <Text style={styles.reaberturaBtnText}>
              {temSolicPendente ? 'Pedido Enviado' : 'Solicitar Reabertura'}
            </Text>
          </TouchableOpacity>
        )}
        {!isPautaFechada && !isPrivilegedRole && !isReadOnly && (
          <TouchableOpacity
            style={styles.solicitAvalBtn}
            onPress={() => setShowSolicAvalModal(true)}
          >
            <Ionicons name="key-outline" size={13} color={Colors.info} />
            <Text style={styles.solicitAvalBtnText}>Solicitar Campo</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.miniPautaBtn, { backgroundColor: '#0d2e0d', borderWidth: 1, borderColor: '#1a7a1a' }]} onPress={gerarExcelMiniPauta}>
          <Ionicons name="document-outline" size={14} color="#4ade80" />
          <Text style={[styles.miniPautaBtnText, { color: '#4ade80' }]}>Excel</Text>
        </TouchableOpacity>
        {!isPrivilegedRole && templatesMiniPauta === null ? (
          <View style={[styles.miniPautaBtn, { backgroundColor: Colors.warning + '20', borderWidth: 1, borderColor: Colors.warning + '50' }]}>
            <Ionicons name="document-lock-outline" size={14} color={Colors.warning} />
            <Text style={[styles.miniPautaBtnText, { color: Colors.warning }]}>Sem Modelo</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.miniPautaBtn} onPress={enviarMiniPauta}>
            <Ionicons name="print-outline" size={14} color={Colors.info} />
            <Text style={styles.miniPautaBtnText}>PDF</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => {
          if (pautaAtual?.status === 'aberta') {
            webAlert('Pauta Aberta', 'A pauta está em edição. Deseja sair?', [
              { text: 'Continuar', style: 'cancel' },
              { text: 'Sair', onPress: () => setStep('selecao') },
            ]);
          } else {
            setStep('selecao');
          }
        }} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Banner: Modo Supervisão (somente leitura) + painel de supervisão */}
      {isReadOnly && (() => {
        const pct = totalAlunosCount > 0 ? Math.round((notasLancadasCount / totalAlunosCount) * 100) : 0;
        const profNome = professores.find(pp => pp.id === pautaAtual?.professorId)?.nome || 'Professor';
        const ultimaNotaData = notas
          .filter(n => n.turmaId === turmaId && n.disciplina === disciplina && n.trimestre === trimestre)
          .map(n => n.data).filter(Boolean).sort().pop();
        const hojeStr = new Date().toISOString().slice(0, 10);
        const lancouHoje = ultimaNotaData === hojeStr;
        const diasParaPrazo = prazoData ? Math.ceil((new Date(prazoData + 'T23:59:59').getTime() - Date.now()) / (1000*60*60*24)) : null;
        return (
          <View>
            {/* Faixa do modo supervisão */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: Colors.info + '18',
              borderLeftWidth: 3,
              borderLeftColor: Colors.info,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}>
              <Ionicons name="eye-outline" size={16} color={Colors.info} />
              <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.info }}>
                Modo supervisão · somente leitura — está a observar o lançamento de {profNome}.
              </Text>
              <TouchableOpacity
                onPress={() => setShowSupComment(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.info, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={13} color="#fff" />
                <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: '#fff' }}>Comentar</Text>
              </TouchableOpacity>
            </View>

            {/* Painel de supervisão */}
            <View style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted, marginBottom: 2 }}>Progresso</Text>
                  <View style={{ height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' }}>
                    <View style={{ width: `${pct}%`, height: '100%', backgroundColor: pct >= 100 ? Colors.success : pct >= 50 ? Colors.info : Colors.warning }} />
                  </View>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginTop: 4 }}>
                    {notasLancadasCount}/{totalAlunosCount} notas · {pct}%
                  </Text>
                </View>
                <View style={{ alignItems: 'center', minWidth: 80 }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted }}>Prazo</Text>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: diasParaPrazo == null ? Colors.textMuted : diasParaPrazo < 0 ? Colors.danger : diasParaPrazo <= 3 ? Colors.warning : Colors.success }}>
                    {diasParaPrazo == null ? '—' : diasParaPrazo < 0 ? `Vencido há ${Math.abs(diasParaPrazo)}d` : `${diasParaPrazo}d`}
                  </Text>
                </View>
                <View style={{ alignItems: 'center', minWidth: 90 }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted }}>Última nota</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: lancouHoje ? Colors.success : Colors.textSecondary }}>
                    {ultimaNotaData ? (lancouHoje ? 'Hoje' : new Date(ultimaNotaData + 'T12:00:00').toLocaleDateString('pt-AO', { day: '2-digit', month: 'short' })) : '—'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        );
      })()}

      {/* Banner: Pronto para Submeter — todas as notas lançadas mas pauta ainda aberta */}
      {pautaCompleta && !isPautaFechada && pautaAtual && !isReadOnly && !isPrazoExpirado && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: Colors.success + '1A',
          borderLeftWidth: 4, borderLeftColor: Colors.success,
          paddingHorizontal: 14, paddingVertical: 12,
        }}>
          <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.success }}>
              Todas as notas lançadas — submeta a mini-pauta
            </Text>
            <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2 }}>
              A secretaria só pode emitir a Pauta Final após a sua submissão.
            </Text>
          </View>
          <TouchableOpacity
            style={{ backgroundColor: Colors.success, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
            onPress={fecharPauta}
          >
            <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' }}>Submeter</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Banner: Prazo de Lançamento Expirado */}
      {isPrazoExpirado && !isPautaFechada && !isReadOnly && (
        <View style={styles.prazoBanner}>
          <Ionicons name="time-outline" size={16} color={Colors.danger} />
          <Text style={styles.prazoBannerText}>
            Prazo encerrado em {prazoData ? new Date(prazoData + 'T12:00:00').toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}. O lançamento de notas está bloqueado.
          </Text>
        </View>
      )}

      {/* Banner: Prazo de Submissão da Mini-Pauta (definido pela Secretaria) */}
      {prazoMiniPauta && !isPautaFechada && (() => {
        const dataLimite = new Date(prazoMiniPauta.dataLimite + 'T23:59:59');
        const hoje = new Date();
        const diasRestantes = Math.ceil((dataLimite.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        const vencido = hoje > dataLimite;
        const urgente = !vencido && diasRestantes <= 3;
        const cor = vencido ? Colors.danger : urgente ? Colors.warning : Colors.info;
        return (
          <View style={[styles.prazoBanner, { backgroundColor: cor + '18', borderColor: cor + '44' }]}>
            <Ionicons name={vencido ? 'alert-circle' : 'calendar-outline'} size={15} color={cor} />
            <Text style={[styles.prazoBannerText, { color: cor }]}>
              {vencido
                ? `Prazo de submissão da mini-pauta expirou em ${dataLimite.toLocaleDateString('pt-AO', { day: '2-digit', month: 'long' })}. Submeta urgentemente.`
                : urgente
                ? `Prazo de submissão: ${diasRestantes} dia${diasRestantes !== 1 ? 's' : ''} restante${diasRestantes !== 1 ? 's' : ''} (até ${dataLimite.toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' })})`
                : `Prazo de submissão da mini-pauta: até ${dataLimite.toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' })}`}
            </Text>
          </View>
        );
      })()}

      {/* Banner: Grade Launch Control — status dos campos aprovados */}
      {!isPrivilegedRole && !isPautaFechada && solicitacoesAvaliacao.length > 0 && (
        <View style={styles.lanchControlBanner}>
          <Ionicons name="shield-checkmark-outline" size={14} color={Colors.info} />
          <View style={{ flex: 1 }}>
            <Text style={styles.lanchControlTitle}>Campos Aprovados</Text>
            <Text style={styles.lanchControlSub} numberOfLines={2}>
              {solicitacoesAvaliacao.filter(s => s.status === 'aprovado').length > 0
                ? solicitacoesAvaliacao.filter(s => s.status === 'aprovado')
                    .map(s => TIPOS_AVALIACAO_SOLIC.find(t => t.key === s.tipoAvaliacao)?.label ?? s.tipoAvaliacao)
                    .join(', ')
                : 'Nenhum campo aprovado ainda'}
              {solicitacoesAvaliacao.filter(s => s.status === 'pendente').length > 0 &&
                ` · ${solicitacoesAvaliacao.filter(s => s.status === 'pendente').length} pedido(s) pendente(s)`}
            </Text>
          </View>
        </View>
      )}
      {!isPrivilegedRole && !isPautaFechada && solicitacoesAvaliacao.length === 0 && (
        <View style={[styles.lanchControlBanner, { backgroundColor: Colors.warning + '12', borderBottomColor: Colors.warning + '33' }]}>
          <Ionicons name="lock-closed-outline" size={14} color={Colors.warning} />
          <Text style={[styles.lanchControlTitle, { color: Colors.warning, flex: 1 }]}>
            Lançamento bloqueado — solicite abertura de campo para inserir notas
          </Text>
        </View>
      )}

      {/* Banner especial para T3 Classe de Transição, 12ª ou 9ª nuclear */}
      {(useProvGlobal || useExame || useExame9a) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: (useExame || useExame9a) ? Colors.danger + '18' : Colors.info + '15', borderBottomWidth: 1, borderBottomColor: (useExame || useExame9a) ? Colors.danger + '33' : Colors.info + '33' }}>
          <Ionicons name={(useExame || useExame9a) ? 'school-outline' : 'ribbon-outline'} size={15} color={(useExame || useExame9a) ? Colors.danger : Colors.info} />
          <Text style={{ flex: 1, fontSize: 11, fontFamily: 'Inter_500Medium', color: (useExame || useExame9a) ? Colors.danger : Colors.info, lineHeight: 15 }}>
            {(() => {
              const pI = getPercForNivel(turmaAtual?.nivel, config);
              if (useExame9a) {
                const classeLabel = is6aClasse(classeAtual) ? '6ª' : '9ª';
                return `3º Trimestre · ${classeLabel} Classe (Disciplina Nuclear) — Lance apenas as Avaliações Contínuas (MACT₃). A Nota do Exame Nacional (EN) é lançada exclusivamente pela Secretaria.`;
              }
              if (useExame) return `3º Trimestre · 12ª Classe — Lance apenas as Avaliações Contínuas (MACT₃). A Nota do Exame Nacional (EN) é lançada exclusivamente pela Secretaria.`;
              return `3º Trimestre · Classe de Transição — Prova Global (PG1 + PG2 substituem PT). ${pI.percPg}% cada PG.`;
            })()}
          </Text>
        </View>
      )}

      {/* Banner: Mini-Pauta incompleta */}
      {faltamParaMiniPauta > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff3cd', borderBottomWidth: 1, borderBottomColor: '#ffc107AA' }}>
          <Ionicons name="warning-outline" size={15} color="#856404" />
          <Text style={{ flex: 1, fontSize: 11, fontFamily: 'Inter_500Medium', color: '#856404', lineHeight: 15 }}>
            Mini-Pauta incompleta — falta{faltamParaMiniPauta > 1 ? 'm' : ''} <Text style={{ fontFamily: 'Inter_700Bold' }}>{faltamParaMiniPauta} aluno{faltamParaMiniPauta > 1 ? 's' : ''}</Text> por preencher para emitir o documento.
          </Text>
        </View>
      )}

      {/* Grade Fields Legend */}
      {(() => {
        const nAval = config.numAvaliacoes ?? 4;
        function LegendCol({ fieldKey, label, color }: { fieldKey: string; label: string; color?: string }) {
          const isOpen = isAvalFieldOpen(fieldKey);
          const isPending = !isPrivilegedRole && solicitacoesAvaliacao.some(s => s.tipoAvaliacao === fieldKey && s.status === 'pendente');
          const lockIcon = isPending ? 'hourglass-outline' : 'lock-closed';
          const lockColor = isPending ? Colors.warning : Colors.textMuted + '99';
          return (
            <TouchableOpacity
              style={[styles.legendaCol, { alignItems: 'center' }]}
              onPress={() => {
                if (isPrivilegedRole || isOpen) return;
                if (isPending) { webAlert('Pendente', 'Já existe um pedido de abertura para este campo. Aguarde aprovação.'); return; }
                if (PROVA_FIELDS.has(fieldKey)) { webAlert('Período Fechado', 'O lançamento de provas está controlado pelo calendário da direcção. Aguarde a abertura do período.'); return; }
                setSolicAvalTipo(fieldKey);
                setSolicAvalMotivo('');
                setShowSolicAvalModal(true);
              }}
              activeOpacity={isOpen || isPrivilegedRole ? 1 : 0.7}
            >
              <Text style={[styles.legendaColText, { color: color ?? (isOpen || isPrivilegedRole ? '#FFFFFF' : '#E8EEF6AA') }]}>{label}</Text>
              {!isPrivilegedRole && (
                <Ionicons
                  name={isOpen ? 'unlock' : (lockIcon as any)}
                  size={7}
                  color={isOpen ? Colors.success + 'CC' : lockColor}
                  style={{ marginTop: 1 }}
                />
              )}
            </TouchableOpacity>
          );
        }
        return (
          <View style={styles.legendaBar}>
            <Text style={[styles.legendaCol, { width: 44 }]}>Nº</Text>
            <Text style={[styles.legendaCol, { flex: 1 }]}>Aluno</Text>
            {ALL_AVAL_KEYS.slice(0, nAval).map((key, i) => (
              <LegendCol key={key} fieldKey={key} label={`A${i + 1}`} />
            ))}
            {percNivelPauta.temNPP !== false && <LegendCol fieldKey="pp1" label="PP" />}
            {useProvGlobal ? (
              <>
                <LegendCol fieldKey="pg1" label="PG1" color={Colors.info} />
                <LegendCol fieldKey="pg2" label="PG2" color={Colors.info} />
              </>
            ) : (!useExame9a && !useExame && percNivelPauta.temNPT !== false) ? (
              <LegendCol fieldKey="ppt" label="PT" />
            ) : null}
            {config.provaRecuperacaoHabilitada && (
              <LegendCol fieldKey="provaRecuperacao" label="REC" color={Colors.warning} />
            )}
            <Text style={[styles.legendaCol, { color: Colors.gold }]}>NF</Text>
            {Object.keys(diagnosticasMap).length > 0 && (
              <Text style={[styles.legendaCol, { color: '#8b5cf6' }]}>ND</Text>
            )}
          </View>
        );
      })()}

      <FlatList
        data={notasForms}
        keyExtractor={f => f.alunoId}
        contentContainerStyle={{ paddingBottom: bottomInset + 140 }}
        renderItem={({ item: form, index }) => {
          const aluno = alunos.find(a => a.id === form.alunoId);
          if (!aluno) return null;
          const nAval = config.numAvaliacoes ?? 4;
          const activeKeys = ALL_AVAL_KEYS.slice(0, nAval);
          // Percentagens do nível da turma (Complexo Escolar) ou globais
          const p2 = getPercForNivel(turmaAtual?.nivel, config);
          const macMin = p2.macMin;
          const macMax = p2.macMax;
          const temNPP2 = p2.temNPP !== false;
          const temNPT2 = p2.temNPT !== false;
          const avalValues = activeKeys.map(k => parseAval(form[k], macMin, macMax));
          const formativaAtiva2 = !!(config as any).avaliacaoFormativaHabilitada;
          const pFormativa2 = formativaAtiva2 ? ((p2 as any).percFormativa ?? (config as any).percFormativa ?? 20) : 0;
          const _mac2 = calcMac(avalValues, form.notaFormativa, pFormativa2);
          const pp = parseNum(form.pp1);
          const nt = usarDecretoFormulas
            ? calcMacCanonica(avalValues, { macMin, macMax, tipoEscala: p2.tipoEscala })
            : temNPP2
              ? calcNT(avalValues, pp, p2.percMac, p2.percPp, { macMin, macMax, tipoEscala: p2.tipoEscala })
              : calcMacCanonica(avalValues, { macMin, macMax, tipoEscala: p2.tipoEscala });
          let nf = 0;
          if (useExame9a) {
            nf = nt; // MACT₃ — EN é lançado exclusivamente pela Secretaria
          } else if (useProvGlobal) {
            const pg1 = parseNum(form.pg1); const pg2 = parseNum(form.pg2);
            nf = usarDecretoFormulas
              ? calcMT_decreto(nt, Math.round(((pg1 + pg2) / 2) * 10) / 10, percMacDecreto)
              : calcNF_T3Transicao(nt, pg1, pg2, p2.percPg);
          } else if (useExame) {
            nf = usarDecretoFormulas
              ? nt  // MACT₃ — MFD = MT₃×%+NEN×% calculado no boletim
              : calcNF_T3Exame(nt, parseNum(form.ex1), parseNum(form.ex2), p2.percExame);
          } else if (!temNPT2) {
            nf = nt;
          } else {
            nf = usarDecretoFormulas
              ? calcMT_decreto(nt, parseNum(form.ppt), percMacDecreto)  // Decreto §2: MT = MAC×%mac + NPT×%npt
              : calcNF_T1T2(nt, parseNum(form.ppt), p2.percNt, p2.percPt);
          }
          const nfColor = nf >= 10 ? Colors.success : nf > 0 ? Colors.danger : Colors.textMuted;
          const isEditing = editingAlunoId === aluno.id;
          const extraFields: Array<keyof NotaForm> = useExame9a
            ? []
            : useProvGlobal
              ? ['pg1', 'pg2']
              : useExame
                ? []
                : (temNPT2 ? ['ppt'] : []);
          const recFields: Array<keyof NotaForm> = config.provaRecuperacaoHabilitada ? ['provaRecuperacao'] : [];
          // Incluir pp1 só se NPP estiver activa no modelo; ppt só se NPT activa
          const editFields = [
            ...activeKeys,
            ...(temNPP2 ? ['pp1' as const] : []),
            ...extraFields,
            ...recFields,
          ] as Array<keyof NotaForm>;
          const displayValues = [
            ...activeKeys.map(k => form[k]),
            ...(temNPP2 ? [form.pp1] : []),
            ...extraFields.map(k => form[k]),
            ...recFields.map(k => form[k]),
          ];
          const alunoSavedFields = savedFields[aluno.id] || new Set<string>();
          const hasAnySavedField = alunoSavedFields.size > 0;

          return (
            <TouchableOpacity
              style={[
                styles.alunoRow,
                isEditing && styles.alunoRowEditing,
                hasAnySavedField && !isEditing && styles.alunoRowSubmitted,
              ]}
              onPress={() => { if (!isReadOnly) setEditingAlunoId(isEditing ? null : aluno.id); }}
              activeOpacity={isReadOnly ? 1 : 0.85}
            >
              <View style={styles.rowCell44}>
                <Text style={styles.rowNum}>{String(index + 1).padStart(2, '0')}</Text>
              </View>
              <View style={styles.rowFlex}>
                <Text style={[styles.rowNome, hasAnySavedField && !isEditing && { color: Colors.textMuted }]} numberOfLines={1}>
                  {aluno.nome} {aluno.apelido}
                </Text>
                {(isEditing || hasAnySavedField || mac > 0) && (
                  <Text style={styles.rowMac}>MAC={mac > 0 ? mac.toFixed(1) : '—'} · NT={nt > 0 ? nt.toFixed(1) : '—'} · NF={nf > 0 ? nf.toFixed(1) : '—'}</Text>
                )}
                {hasAnySavedField && !isEditing && (
                  <View style={styles.lancadoBadgeRow}>
                    <View style={styles.lancadoBadge}>
                      <Ionicons name="checkmark-circle" size={10} color={Colors.success} />
                      <Text style={styles.lancadoBadgeText}>Lançado</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.lancadoVisBtn, lancadoSet.has(aluno.id) && styles.lancadoVisBtnActive]}
                      onPress={() => toggleLancado(aluno.id)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons
                        name={lancadoSet.has(aluno.id) ? 'eye' : 'eye-off-outline'}
                        size={10}
                        color={lancadoSet.has(aluno.id) ? Colors.success : Colors.textMuted}
                      />
                      <Text style={[styles.lancadoVisBtnText, { color: lancadoSet.has(aluno.id) ? Colors.success : Colors.textMuted }]}>
                        {lancadoSet.has(aluno.id) ? 'Publicado' : 'Oculto'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              {isEditing && !isPautaFechada ? (
                <>
                  {editFields.map(field => {
                    const isFieldLocked = alunoSavedFields.has(field);
                    const isOpen = isAvalFieldOpen(field);
                    if (isFieldLocked) {
                      return (
                        <TouchableOpacity
                          key={field}
                          style={styles.gradeLocked}
                          onPress={() => webAlert(
                            'Avaliação Bloqueada',
                            'Esta avaliação já foi lançada e está bloqueada. Para corrigir, solicite a reabertura da pauta à direcção.',
                            [{ text: 'OK', style: 'cancel' }]
                          )}
                        >
                          <Ionicons name="lock-closed" size={9} color={Colors.textMuted} style={{ marginBottom: 1 }} />
                          <Text style={styles.gradeLockedText}>{form[field] || '—'}</Text>
                        </TouchableOpacity>
                      );
                    }
                    if (!isOpen) {
                      const isPendente = solicitacoesAvaliacao.some(s => s.tipoAvaliacao === field && s.status === 'pendente');
                      return (
                        <TouchableOpacity
                          key={field}
                          style={[styles.gradeLocked, { borderColor: isPendente ? Colors.warning + '88' : Colors.border, backgroundColor: isPendente ? Colors.warning + '11' : Colors.border + '44' }]}
                          onPress={() => {
                            if (isPendente) { webAlert('Aguardando Aprovação', 'O seu pedido de abertura está pendente. Aguarde a aprovação do responsável.'); return; }
                            if (PROVA_FIELDS.has(field)) { webAlert('Período Fechado', 'O período de lançamento de provas ainda não foi aberto pela direcção.'); return; }
                            setSolicAvalTipo(field);
                            setSolicAvalMotivo('');
                            setShowSolicAvalModal(true);
                          }}
                        >
                          <Ionicons name={isPendente ? 'hourglass-outline' : 'lock-closed'} size={9} color={isPendente ? Colors.warning : Colors.textMuted} style={{ marginBottom: 1 }} />
                          <Text style={[styles.gradeLockedText, { color: isPendente ? Colors.warning : Colors.textMuted + '99' }]}>—</Text>
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <TextInput
                        key={field}
                        style={styles.gradeInput}
                        value={form[field]}
                        onChangeText={v => updateNotaForm(aluno.id, field, v)}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor={Colors.textMuted}
                        editable={!isPautaFechada && !isReadOnly}
                      />
                    );
                  })}
                </>
              ) : (
                <>
                  {displayValues.map((v, i) => {
                    const fieldKey = editFields[i];
                    const isFieldLocked = alunoSavedFields.has(fieldKey);
                    return (
                      <View key={i} style={[styles.gradeCell, isFieldLocked && styles.gradeCellLocked]}>
                        <Text style={[styles.gradeCellText, isFieldLocked && styles.gradeCellLockedText]}>{v || '—'}</Text>
                      </View>
                    );
                  })}
                </>
              )}
              <View style={styles.nfCell}>
                <Text style={[styles.nfText, { color: nfColor }]}>
                  {nf > 0 ? nf.toFixed(1) : '—'}
                </Text>
              </View>
              {/* NF Formativa (se activa) */}
              {!!(config as any).avaliacaoFormativaHabilitada && (
                <View style={[styles.nfCell, { backgroundColor: '#22c55e18', borderRadius: 6, minWidth: 36 }]}>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: form.notaFormativa > 0 ? '#16a34a' : Colors.textMuted, textAlign: 'center' }}>
                    {form.notaFormativa > 0 ? form.notaFormativa.toFixed(1) : '—'}
                  </Text>
                  <Text style={{ fontSize: 7, fontFamily: 'Inter_400Regular', color: '#16a34a', textAlign: 'center' }}>NF</Text>
                </View>
              )}
              {/* ND Diagnóstica (só informativo, se existir) */}
              {diagnosticasMap[aluno.id] && (
                <View style={[styles.nfCell, { backgroundColor: '#8b5cf618', borderRadius: 6, minWidth: 36 }]}>
                  <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: '#7c3aed', textAlign: 'center' }}>
                    {{
                      satisfaz_bem: 'SB',
                      satisfaz: 'SAT',
                      nao_satisfaz: 'NS',
                    }[diagnosticasMap[aluno.id]] ?? diagnosticasMap[aluno.id].slice(0, 2).toUpperCase()}
                  </Text>
                  <Text style={{ fontSize: 7, fontFamily: 'Inter_400Regular', color: '#7c3aed', textAlign: 'center' }}>ND</Text>
                </View>
              )}
              {/* ── Anexo IV/V — Comportamento + Apreciação Descritiva ── */}
              {(!!(config as any).comportamentoMiniPautaHabilitado || !!(config as any).apreciacaoDescritivaObrigatoria) && (
                <View style={{ width: '100%', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border + '40', gap: 6 }}>
                  {!!(config as any).comportamentoMiniPautaHabilitado && (
                    <View>
                      <Text style={{ fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 4, letterSpacing: 0.5 }}>
                        COMPORTAMENTO (Anexo IV)
                      </Text>
                      {isEditing && !isPautaFechada ? (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {(['MB','B','S','M'] as const).map(nivel => {
                            const cores: Record<string, string> = { MB: '#16a34a', B: '#1d4ed8', S: Colors.warning, M: Colors.danger };
                            const ativo = form.comportamento === nivel;
                            return (
                              <TouchableOpacity
                                key={nivel}
                                onPress={() => updateNotaForm(aluno.id, 'comportamento', ativo ? '' : nivel)}
                                style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1.5,
                                  borderColor: ativo ? cores[nivel] : Colors.border,
                                  backgroundColor: ativo ? cores[nivel] + '22' : Colors.backgroundElevated }}>
                                <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: ativo ? cores[nivel] : Colors.textMuted }}>
                                  {nivel}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : form.comportamento ? (
                        <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2,
                          borderRadius: 5, backgroundColor: { MB:'#16a34a22', B:'#1d4ed822', S:Colors.warning+'22', M:Colors.danger+'22' }[form.comportamento] ?? Colors.border+'33' }}>
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold',
                            color: { MB:'#16a34a', B:'#1d4ed8', S:Colors.warning, M:Colors.danger }[form.comportamento] ?? Colors.textMuted }}>
                            {form.comportamento}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                  {!!(config as any).apreciacaoDescritivaObrigatoria && isEditing && !isPautaFechada && (
                    <View>
                      <Text style={{ fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 4, letterSpacing: 0.5 }}>
                        APRECIAÇÃO DESCRITIVA GLOBAL (Anexo V)
                      </Text>
                      <TextInput
                        style={{ fontSize: 12, color: Colors.text, backgroundColor: Colors.background,
                          borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
                          paddingHorizontal: 10, paddingVertical: 6, minHeight: 54,
                          textAlignVertical: 'top', fontFamily: 'Inter_400Regular' }}
                        value={form.apreciacaoDescritiva}
                        onChangeText={v => updateNotaForm(aluno.id, 'apreciacaoDescritiva', v)}
                        multiline
                        placeholder="Apreciação descritiva global do aluno..."
                        placeholderTextColor={Colors.textMuted}
                        editable={!isPautaFechada && !isReadOnly}
                      />
                    </View>
                  )}
                  {!!(config as any).apreciacaoDescritivaObrigatoria && !isEditing && !!form.apreciacaoDescritiva && (
                    <Text style={{ fontSize: 10, color: Colors.textSecondary, fontStyle: 'italic', paddingHorizontal: 2 }} numberOfLines={2}>
                      "{form.apreciacaoDescritiva}"
                    </Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {/* Bottom Actions */}
      {isEditavel && !isReadOnly && (
        <View style={[styles.bottomBar, { paddingBottom: bottomInset + 8 }]}>
          {saving ? (
            <AppLoader color={Colors.gold} />
          ) : (
            <>
              <TouchableOpacity style={styles.saveBtn} onPress={guardarNotas}>
                <Ionicons name="save" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Guardar Notas</Text>
              </TouchableOpacity>
              {pautaAtual && (
                <TouchableOpacity
                  style={[styles.fecharBtn, pautaCompleta && { backgroundColor: Colors.success }]}
                  onPress={fecharPauta}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>
                    {pautaCompleta ? 'Submeter Mini-Pauta ✓' : 'Submeter Mini-Pauta'}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}

      {/* Solicitar Abertura de Campo de Avaliação Modal */}
      <Modal visible={showSolicAvalModal} transparent animationType="slide" onRequestClose={() => setShowSolicAvalModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Ionicons name="key-outline" size={20} color={Colors.info} style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>Solicitar Abertura de Campo</Text>
              <TouchableOpacity onPress={() => setShowSolicAvalModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              Selecione o campo de avaliação que pretende abrir para lançamento de notas.
              O pedido será enviado para aprovação do responsável.
            </Text>

            <Text style={styles.fieldLabel}>Campo de Avaliação</Text>
            <ScrollView style={{ maxHeight: 200, marginBottom: 4 }}>
              {TIPOS_AVALIACAO_SOLIC.slice(0, (config.numAvaliacoes ?? 4)).map(tipo => {
                const existente = solicitacoesAvaliacao.find(s => s.tipoAvaliacao === tipo.key);
                const isAprovado = existente?.status === 'aprovado';
                const isPendente = existente?.status === 'pendente';
                return (
                  <TouchableOpacity
                    key={tipo.key}
                    style={[
                      styles.tipoAvalItem,
                      solicAvalTipo === tipo.key && styles.tipoAvalItemActive,
                      (isAprovado || isPendente) && styles.tipoAvalItemDisabled,
                    ]}
                    onPress={() => { if (!isAprovado && !isPendente) setSolicAvalTipo(tipo.key); }}
                    activeOpacity={(isAprovado || isPendente) ? 1 : 0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tipoAvalLabel, solicAvalTipo === tipo.key && { color: Colors.info }]}>
                        {tipo.label}
                      </Text>
                      {(isAprovado || isPendente) && (
                        <Text style={[styles.tipoAvalStatus, { color: isAprovado ? Colors.success : Colors.warning }]}>
                          {isAprovado ? '✓ Já aprovado' : '⏳ Pedido pendente'}
                        </Text>
                      )}
                    </View>
                    {solicAvalTipo === tipo.key && !isAprovado && !isPendente && (
                      <Ionicons name="checkmark-circle" size={18} color={Colors.info} />
                    )}
                    {isAprovado && <Ionicons name="checkmark-circle" size={18} color={Colors.success} />}
                    {isPendente && <Ionicons name="hourglass-outline" size={18} color={Colors.warning} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.fieldLabel}>Motivo (opcional)</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Descreva brevemente o motivo do pedido..."
              placeholderTextColor={Colors.textMuted}
              value={solicAvalMotivo}
              onChangeText={setSolicAvalMotivo}
              multiline
            />
            {sendingSolicAval ? (
              <AppLoader color={Colors.info} style={{ marginTop: 16 }} />
            ) : (
              <TouchableOpacity
                style={[styles.solicitBtn, { backgroundColor: Colors.info }, !solicAvalTipo && styles.solicitBtnDisabled]}
                onPress={submitSolicAvaliacao}
                disabled={!solicAvalTipo}
              >
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Enviar Pedido de Abertura</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modo Supervisão: Comentário ao Professor */}
      <Modal visible={showSupComment} transparent animationType="fade" onRequestClose={() => setShowSupComment(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.info} style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>Comentar ao Professor</Text>
              <TouchableOpacity onPress={() => setShowSupComment(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              Envie uma observação ao professor sobre esta pauta — {disciplina} · {turmaAtual?.nome} · {trimestre}º trimestre. A mensagem chega como notificação.
            </Text>
            <TextInput
              style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
              placeholder="Ex.: Faltam as notas do Pedro e da Maria. Pode confirmar até amanhã?"
              placeholderTextColor={Colors.textMuted}
              value={supCommentText}
              onChangeText={setSupCommentText}
              multiline
            />
            {sendingSupComment ? (
              <AppLoader color={Colors.info} style={{ marginTop: 16 }} />
            ) : (
              <TouchableOpacity
                style={[styles.solicitBtn, { backgroundColor: Colors.info }, !supCommentText.trim() && styles.solicitBtnDisabled]}
                disabled={!supCommentText.trim()}
                onPress={async () => {
                  const profId = pautaAtual?.professorId;
                  const profUserId = professores.find(pp => pp.id === profId)?.utilizadorId;
                  if (!profUserId) {
                    webAlert('Erro', 'Não foi possível identificar o utilizador do professor.');
                    return;
                  }
                  setSendingSupComment(true);
                  try {
                    const r = await fetch('/api/chat-interno', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({
                        destinatarioId: profUserId,
                        assunto: `Supervisão · ${disciplina} ${trimestre}ºT (${turmaAtual?.nome})`,
                        mensagem: supCommentText.trim(),
                      }),
                    });
                    if (!r.ok) throw new Error(await r.text());
                    setShowSupComment(false);
                    setSupCommentText('');
                    webAlert('Enviado', 'O professor recebeu a sua observação.');
                  } catch (e: any) {
                    webAlert('Erro', e?.message || 'Falha ao enviar comentário.');
                  } finally {
                    setSendingSupComment(false);
                  }
                }}
              >
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Enviar Observação</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Solicitar Reabertura Modal */}
      <Modal visible={showSolicitModal} transparent animationType="slide" onRequestClose={() => setShowSolicitModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Solicitar Reabertura</Text>
              <TouchableOpacity onPress={() => setShowSolicitModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              A pauta de {disciplina} ({turmaAtual?.nome}) está fechada. Indique o motivo para solicitar reabertura à direcção.
            </Text>
            <Text style={styles.fieldLabel}>Motivo do Pedido</Text>
            <TextInput
              style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
              placeholder="Descreva o motivo (ex: erro de lançamento, nota em falta)..."
              placeholderTextColor={Colors.textMuted}
              value={motivoSolicidade}
              onChangeText={setMotivoSolicidade}
              multiline
            />
            <TouchableOpacity
              style={[styles.solicitBtn, !motivoSolicidade.trim() && styles.solicitBtnDisabled]}
              onPress={solicitarReabertura}
              disabled={!motivoSolicidade.trim()}
            >
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>Enviar Solicitação</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

const CELL_W = 38;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, backgroundColor: Colors.info + '11', borderRadius: 14, borderWidth: 1, borderColor: Colors.info + '33', marginBottom: 16 },
  infoCardText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.info, lineHeight: 20 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.8 },
  selector: { backgroundColor: Colors.backgroundCard, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border },
  selectorValue: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  selectorPlaceholder: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  dropdownList: { backgroundColor: Colors.backgroundCard, borderRadius: 12, marginTop: 4, borderWidth: 1, borderColor: Colors.border, maxHeight: 200, overflow: 'hidden' },
  dropdownEmpty: { padding: 14 },
  dropdownEmptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dropdownItemActive: { backgroundColor: 'rgba(240,165,0,0.1)' },
  dropdownText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  dropdownSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  trimestreRow: { flexDirection: 'row', gap: 10 },
  trimestreBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.backgroundCard, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  trimestreBtnActive: { backgroundColor: Colors.accent + '22', borderColor: Colors.accent + '66' },
  trimestreBtnText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  trimestreBtnTextActive: { color: Colors.accent, fontFamily: 'Inter_600SemiBold' },
  statusPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 16 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusPreviewLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  statusPreviewSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  openBtn: { backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 20, marginBottom: 8 },
  openBtnDisabled: { opacity: 0.4 },
  openBtnText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },
  histTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 10 },
  histCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 8 },
  histDisciplina: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  histTurma: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  histStatus: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  histStatusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  pautaStatusBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pautaStatusText: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  prazoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.danger + '18', borderBottomWidth: 1, borderBottomColor: Colors.danger + '33', paddingHorizontal: 16, paddingVertical: 10 },
  prazoBannerText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.danger },
  reaberturaBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warning + '22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  reaberturaBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.warning },
  miniPautaBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.info + '22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  miniPautaBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.info },
  backBtn: { padding: 6 },
  legendaBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#0A1929', borderBottomWidth: 1, borderBottomColor: Colors.gold + '55', borderTopWidth: 1, borderTopColor: Colors.gold + '22' },
  legendaCol: { width: CELL_W, fontSize: 10, fontFamily: 'Inter_700Bold', color: '#E8EEF6CC', textAlign: 'center' },
  alunoRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  alunoRowEditing: { backgroundColor: Colors.gold + '0D' },
  alunoRowSubmitted: { backgroundColor: Colors.success + '08', borderLeftWidth: 2, borderLeftColor: Colors.success + '44' },
  lancadoBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  lancadoBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lancadoBadgeText: { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.success },
  lancadoVisBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.border + '33' },
  lancadoVisBtnActive: { borderColor: Colors.success + '66', backgroundColor: Colors.success + '18' },
  lancadoVisBtnText: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  gradeLocked: { width: CELL_W, height: 32, backgroundColor: Colors.border + '55', borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  gradeLockedText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted, textAlign: 'center' },
  gradeCellLocked: { backgroundColor: Colors.success + '0A', borderRadius: 4 },
  gradeCellLockedText: { color: Colors.success, fontFamily: 'Inter_600SemiBold' },
  rowCell44: { width: 44, alignItems: 'center' },
  rowNum: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted },
  rowFlex: { flex: 1 },
  rowNome: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text },
  rowMac: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.gold, marginTop: 2 },
  gradeInput: { width: CELL_W, height: 32, backgroundColor: Colors.surface, borderRadius: 6, paddingHorizontal: 4, fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text, borderWidth: 1, borderColor: Colors.gold + '55', textAlign: 'center' },
  gradeCell: { width: CELL_W, alignItems: 'center' },
  gradeCellText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  nfCell: { width: CELL_W, alignItems: 'center' },
  nfText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: Colors.primaryDark, borderTopWidth: 1, borderTopColor: Colors.border },
  saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 14 },
  fecharBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.danger, borderRadius: 14, paddingVertical: 14 },
  saveBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%', width: '100%', maxWidth: 480 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  modalTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  closeBtn: { padding: 4 },
  modalSub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 20, marginBottom: 4 },
  input: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  solicitBtn: { backgroundColor: Colors.warning, borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, marginBottom: 8 },
  solicitBtnDisabled: { opacity: 0.4 },
  // Grade Launch Control
  solicitAvalBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.info + '22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  solicitAvalBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.info },
  lanchControlBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.info + '12', borderBottomWidth: 1, borderBottomColor: Colors.info + '33' },
  lanchControlTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.info },
  lanchControlSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.info + 'BB', marginTop: 2 },
  tipoAvalItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 6, backgroundColor: Colors.surface },
  tipoAvalItemActive: { borderColor: Colors.info + '88', backgroundColor: Colors.info + '15' },
  tipoAvalItemDisabled: { opacity: 0.6 },
  tipoAvalLabel: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.text },
  tipoAvalStatus: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 2 },
  legendaColText: { fontSize: 10, fontFamily: 'Inter_700Bold', textAlign: 'center', color: '#E8EEF6CC' },
});
